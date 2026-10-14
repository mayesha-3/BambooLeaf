import { createHash, randomUUID } from 'node:crypto'
import { COLLECTIONS } from '../db/collections.tsx'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { planGoal } from '../agent/planner.tsx'
import { evaluateNativeTransfer, readPolicyConfig } from '../guard/policy-engine.tsx'
import { reserveTransfer } from '../db/repositories/policy-usage.repository.tsx'
import { sendAuthorizedNativeTransfer } from '../signer/signer-service.tsx'

function goalHash(goal) {
  return createHash('sha256').update(goal).digest('hex')
}

function intentSummary(intent) {
  return {
    intentId: intent.intentId,
    action: intent.action,
    chainId: intent.chainId,
    token: intent.from.token,
    amount: intent.from.amount ?? null,
    recipient: intent.recipient ?? null,
    targetToken: intent.to?.token ?? null,
  }
}

async function processGoal(database, goal, requestId) {
  await appendAuditEvent(database, {
    requestId,
    type: 'goal.received',
    data: { goalSha256: goalHash(goal) },
  })

  let intent
  try {
    intent = await planGoal(goal, Number(process.env.CHAIN_ID || 31337))
  } catch (error) {
    await appendAuditEvent(database, {
      requestId,
      type: 'planner.failed',
      data: { reason: error.message },
    })
    return {
      statusCode: 503,
      body: { requestId, status: 'not_executed', error: 'Planner unavailable or unable to produce a valid intent.' },
    }
  }

  const summary = intentSummary(intent)
  await appendAuditEvent(database, {
    requestId,
    type: 'intent.proposed',
    data: summary,
  })

  let policy
  try {
    policy = readPolicyConfig()
  } catch (error) {
    await appendAuditEvent(database, {
      requestId,
      type: 'policy.invalid_configuration',
      data: { reason: error.message },
    })
    return { statusCode: 500, body: { requestId, error: 'Wallet policy configuration is invalid.' } }
  }

  const decision = evaluateNativeTransfer(intent, policy)
  if (!decision.allowed) {
    await appendAuditEvent(database, {
      requestId,
      type: 'policy.denied',
      data: { ...summary, reason: decision.reason },
    })
    return {
      statusCode: 200,
      body: { requestId, status: 'denied', intent: summary, reason: decision.reason },
    }
  }

  if (!process.env.AGENT_KEY) {
    await appendAuditEvent(database, {
      requestId,
      type: 'signer.not_configured',
      data: { ...summary, reason: 'AGENT_KEY is not configured' },
    })
    return {
      statusCode: 503,
      body: { requestId, status: 'not_executed', intent: summary, error: 'Signer is not configured.' },
    }
  }

  let reservation
  try {
    reservation = await reserveTransfer(database, {
      recipient: decision.authorization.recipient,
      valueWei: decision.valueWei,
      maxPerRecipientPerDayWei: policy.maxPerRecipientPerDayWei,
      maxTxPerWindow: policy.maxTxPerWindow,
      velocityWindowSeconds: policy.velocityWindowSeconds,
    })
  } catch (error) {
    await appendAuditEvent(database, {
      requestId,
      type: 'policy.reservation_failed',
      data: { ...summary, reason: error.message },
    })
    return {
      statusCode: 503,
      body: { requestId, status: 'not_executed', intent: summary, error: 'Policy storage is unavailable.' },
    }
  }

  if (!reservation.allowed) {
    await appendAuditEvent(database, {
      requestId,
      type: 'policy.denied',
      data: { ...summary, reason: reservation.reason },
    })
    return {
      statusCode: 200,
      body: { requestId, status: 'denied', intent: summary, reason: reservation.reason },
    }
  }

  await appendAuditEvent(database, {
    requestId,
    type: 'policy.allowed',
    data: { ...summary, valueWei: decision.valueWei },
  })

  let transaction
  try {
    transaction = await sendAuthorizedNativeTransfer(intent, decision.authorization)
  } catch (error) {
    await appendAuditEvent(database, {
      requestId,
      type: 'signer.failed',
      data: { ...summary, reason: error.message },
    })
    return {
      statusCode: 502,
      body: { requestId, status: 'not_executed', intent: summary, error: 'Signer rejected or failed the transaction.' },
    }
  }

  await appendAuditEvent(database, {
    requestId,
    type: 'transaction.confirmed',
    data: { ...summary, txHash: transaction.txHash, digest: transaction.digest },
  })
  return {
    statusCode: 200,
    body: { requestId, status: transaction.status, intent: summary, txHash: transaction.txHash },
  }
}

async function submitGoal(database, goal, idempotencyKey) {
  const goals = database.collection(COLLECTIONS.goals)
  const requestId = randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  try {
    await goals.insertOne({
      idempotencyKey,
      requestId,
      status: 'processing',
      createdAt: new Date(),
      expiresAt,
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    const existing = await goals.findOne({ idempotencyKey })
    if (existing?.body) {
      return { statusCode: existing.statusCode, body: existing.body }
    }
    return { statusCode: 202, body: { requestId: existing?.requestId, status: 'processing' } }
  }

  try {
    const result = await processGoal(database, goal, requestId)
    await goals.updateOne(
      { idempotencyKey },
      { $set: { status: 'complete', statusCode: result.statusCode, body: result.body } },
    )
    return result
  } catch (error) {
    await goals.updateOne(
      { idempotencyKey },
      { $set: { status: 'failed', statusCode: 500, body: { error: 'Goal processing failed.' } } },
    )
    throw error
  }
}

export { submitGoal }
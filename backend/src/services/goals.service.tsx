import { createHash, randomUUID } from 'node:crypto'
import { COLLECTIONS } from '../db/collections.tsx'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { planGoal } from '../agent/planner.tsx'
import { evaluateNativeTransfer, evaluateSwap, readPolicyConfig } from '../guard/policy-engine.tsx'
import { routeTier } from '../guard/tier-router.tsx'
import { getLevel } from '../guard/autonomy-manager.tsx'
import { reserveTransfer } from '../db/repositories/policy-usage.repository.tsx'
import { getSigner, getSignerAddress, sendAuthorizedNativeTransfer, sendAuthorizedSwap, simulateAuthorizedSwap } from '../signer/signer-service.tsx'
import { getToken } from '../chain/token-registry.tsx'
import { parseUnits } from 'ethers'

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

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item))
}

async function processSwap(database, intent, summary, policy, requestId) {
  if (!process.env.AGENT_KEY) {
    await appendAuditEvent(database, {
      requestId, type: 'signer.not_configured', data: { ...summary, reason: 'AGENT_KEY is not configured' },
    })
    return { statusCode: 503, body: { requestId, status: 'not_executed', intent: summary, error: 'Signer is not configured.' } }
  }

  let decision
  let signerAddress
  try {
    signerAddress = getSignerAddress()
    const { provider } = getSigner()
    decision = await evaluateSwap(intent, { provider, recipient: signerAddress, config: policy })
  } catch (error) {
    decision = { allowed: false, reason: error instanceof Error ? error.message : 'Swap policy evaluation failed.' }
  }
  if (!decision.allowed) {
    await appendAuditEvent(database, {
      requestId, type: 'policy.denied', data: { ...summary, reason: decision.reason },
    })
    return { statusCode: 200, body: { requestId, status: 'denied', intent: summary, reason: decision.reason } }
  }

  let token
  let amountCap
  let dailyCap
  try {
    token = getToken(intent.from.token, intent.chainId)
    amountCap = parseUnits(policy.maxSwapInputAmount, token.decimals)
    dailyCap = parseUnits(policy.maxSwapPerTokenPerDay, token.decimals)
  } catch (error) {
    await appendAuditEvent(database, {
      requestId, type: 'policy.invalid_configuration', data: { ...summary, reason: error.message },
    })
    return { statusCode: 500, body: { requestId, status: 'not_executed', intent: summary, error: 'Swap policy configuration is invalid.' } }
  }

  const tier = routeTier({
    intent,
    allowedRecipients: policy.allowedRecipients,
    allowedContracts: new Set([...policy.allowedContracts, ...policy.allowedSwapRouters]),
    targetContract: policy.swapRouterAddress,
    maxPerTxWei: amountCap,
    valueWei: BigInt(decision.valueWei),
    riskScore: 0,
    forbiddenPatterns: [],
    autonomyLevel: getLevel(),
  })
  await appendAuditEvent(database, {
    requestId, type: 'policy.tier_routed', data: { ...summary, tier: tier.tier, reasons: tier.reasons },
  })
  if (tier.tier !== 'T1') {
    const status = tier.tier === 'T2' ? 'approval_required' : 'denied'
    await appendAuditEvent(database, {
      requestId, type: tier.tier === 'T2' ? 'approval.required' : 'policy.denied',
      data: { ...summary, tier: tier.tier, reasons: tier.reasons },
    })
    return { statusCode: 200, body: { requestId, status, tier: tier.tier, intent: summary, reasons: tier.reasons } }
  }

  try {
    const reservation = await reserveTransfer(database, {
      recipient: signerAddress,
      valueWei: decision.valueWei,
      maxPerRecipientPerDayWei: dailyCap,
      maxTxPerWindow: policy.maxTxPerWindow,
      velocityWindowSeconds: policy.velocityWindowSeconds,
      scope: `swap:${token.symbol}`,
    })
    if (!reservation.allowed) {
      await appendAuditEvent(database, {
        requestId, type: 'policy.denied', data: { ...summary, reason: reservation.reason },
      })
      return { statusCode: 200, body: { requestId, status: 'denied', intent: summary, reason: reservation.reason } }
    }
  } catch (error) {
    await appendAuditEvent(database, {
      requestId, type: 'policy.reservation_failed', data: { ...summary, reason: error.message },
    })
    return { statusCode: 503, body: { requestId, status: 'not_executed', intent: summary, error: 'Policy storage is unavailable.' } }
  }

  let simulation
  try {
    simulation = await simulateAuthorizedSwap(intent, decision.authorization)
    await appendAuditEvent(database, {
      requestId,
      type: 'swap.shadow_simulated',
      data: jsonSafe({
        ...summary,
        balanceDeltas: simulation.balanceDeltas,
        events: simulation.events,
        calledAddresses: simulation.calledAddresses,
        reverted: simulation.reverted,
        comparison: simulation.comparison,
      }),
    })
  } catch (error) {
    await appendAuditEvent(database, {
      requestId, type: 'swap.shadow_simulation_failed', data: { ...summary, reason: error.message },
    })
    return { statusCode: 409, body: { requestId, status: 'not_executed', intent: summary, error: 'Shadow-fork simulation or intent/outcome check failed.' } }
  }

  let transaction
  try {
    transaction = await sendAuthorizedSwap(intent, decision.authorization)
  } catch (error) {
    await appendAuditEvent(database, {
      requestId, type: 'signer.failed', data: { ...summary, reason: error.message },
    })
    return { statusCode: 502, body: { requestId, status: 'not_executed', intent: summary, error: 'Signer rejected or failed the swap.' } }
  }
  await appendAuditEvent(database, {
    requestId,
    type: 'swap.confirmed',
    data: {
      ...summary,
      txHash: transaction.txHash,
      digest: transaction.digest,
      approvalDigests: transaction.approvalDigests,
      amountIn: transaction.amountIn,
      minAmountOut: transaction.minAmountOut,
    },
  })
  return {
    statusCode: 200,
    body: {
      requestId, status: transaction.status, tier: tier.tier, intent: summary,
      txHash: transaction.txHash, amountIn: transaction.amountIn, minAmountOut: transaction.minAmountOut,
    },
  }
}

async function processGoal(database, goal, requestId, options = {}) {
  await appendAuditEvent(database, {
    requestId,
    type: 'goal.received',
    data: { goalSha256: goalHash(goal), untrustedNotes: Array.isArray(options.untrusted) ? options.untrusted.length : 0 },
  })

  let intent
  try {
    intent = await planGoal(goal, Number(process.env.CHAIN_ID || 31337), { untrusted: options.untrusted })
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

  if (intent.action === 'swap') {
    return processSwap(database, intent, summary, policy, requestId)
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

async function submitGoal(database, goal, idempotencyKey, options = {}) {
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
    const result = await processGoal(database, goal, requestId, options)
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
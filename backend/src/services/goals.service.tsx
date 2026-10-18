import { createHash, randomUUID } from 'node:crypto'
import { COLLECTIONS } from '../db/collections.tsx'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { planGoal } from '../../llm-planner/src/backend-bridge.ts'
import { evaluateNativeTransfer, evaluateSwap, readPolicyConfig } from '../guard/policy-engine.tsx'
import { routeTier } from '../guard/tier-router.tsx'
import {
  getLevel,
  getState,
  isKillSwitchActive,
  recordBlockedAttempt,
  recordCleanExecution,
} from '../guard/autonomy-manager.tsx'
import { saveAutonomyState } from '../db/repositories/autonomy.repository.tsx'
import { createTransferApproval } from './approvals.service.tsx'
import { reserveTransfer } from '../db/repositories/policy-usage.repository.tsx'
import { getSigner, getSignerAddress, sendAuthorizedNativeTransfer, sendAuthorizedSwap, simulateAuthorizedSwap } from '../signer/signer-service.tsx'
import { getToken } from '../chain/token-registry.tsx'
import { parseUnits } from 'ethers'

async function recordBlocked(database, requestId, reason, critical = false) {
  const previous = getState()
  recordBlockedAttempt(reason, critical)
  const current = getState()
  await saveAutonomyState(database, current)
  if (previous.level !== current.level || previous.frozen !== current.frozen) {
    await appendAuditEvent(database, {
      requestId,
      type: 'autonomy.demoted',
      data: {
        fromLevel: previous.level,
        toLevel: current.level,
        reason,
        blockedInWindow: current.blockedInWindow,
        frozen: current.frozen,
      },
    })
  }
  await appendAuditEvent(database, {
    requestId,
    type: 'autonomy.blocked_attempt',
    data: { reason, critical, level: current.level, frozen: current.frozen },
  })
}

async function recordClean(database, requestId) {
  const previous = getState()
  recordCleanExecution()
  const current = getState()
  if (previous.level !== current.level) {
    await appendAuditEvent(database, {
      requestId,
      type: 'autonomy.promoted',
      data: {
        fromLevel: previous.level,
        toLevel: current.level,
        reason: 'Ten clean confirmed executions',
      },
    })
  }
  try {
    await saveAutonomyState(database, current)
  } catch (error) {
    await appendAuditEvent(database, {
      requestId,
      type: 'autonomy.state_persistence_failed',
      data: { reason: error instanceof Error ? error.message : 'Unknown persistence failure' },
    })
  }
}

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
    await recordBlocked(database, requestId, decision.reason)
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
    if (tier.tier === 'T3') {
      await recordBlocked(database, requestId, tier.reasons.join('; '))
    }
    await appendAuditEvent(database, {
      requestId, type: tier.tier === 'T2' ? 'approval.required' : 'policy.denied',
      data: { ...summary, tier: tier.tier, reasons: tier.reasons, approvalAvailable: false },
    })
    return {
      statusCode: 200,
      body: {
        requestId,
        status,
        tier: tier.tier,
        intent: summary,
        reasons: tier.reasons,
        ...(tier.tier === 'T2' ? { approvalAvailable: false, reason: 'Human approval is not enabled for swaps.' } : {}),
      },
    }
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
      await recordBlocked(database, requestId, reservation.reason)
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
    const reason = error instanceof Error ? error.message : 'Shadow simulation failed'
    await recordBlocked(database, requestId, reason, true)
    await appendAuditEvent(database, {
      requestId, type: 'swap.shadow_simulation_failed', data: { ...summary, reason },
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
      approvalTxHashes: transaction.approvalTxHashes,
      amountIn: transaction.amountIn,
      minAmountOut: transaction.minAmountOut,
    },
  })
  await recordClean(database, requestId)
  return {
    statusCode: 200,
    body: {
      requestId, status: transaction.status, tier: tier.tier, intent: summary,
      txHash: transaction.txHash, amountIn: transaction.amountIn, minAmountOut: transaction.minAmountOut,
      approvalTxHashes: transaction.approvalTxHashes,
    },
  }
}

async function processGoal(database, goal, requestId, untrusted?: string[]) {
  await appendAuditEvent(database, {
    requestId,
    type: 'goal.received',
    data: { goalSha256: goalHash(goal), hasUntrusted: Array.isArray(untrusted) && untrusted.length > 0 },
  })

  if (isKillSwitchActive()) {
    await appendAuditEvent(database, {
      requestId,
      type: 'planner.blocked',
      data: { code: 'KILL_SWITCH_ACTIVE', reason: 'Agent is frozen; planner was not called' },
    })
    return {
      statusCode: 423,
      body: { requestId, status: 'blocked', code: 'KILL_SWITCH_ACTIVE', error: 'Agent is frozen; nothing was executed.' },
    }
  }

  let intent
  try {
    intent = await planGoal(goal, Number(process.env.CHAIN_ID || 31337), untrusted)
  } catch (error) {
    const code = error.code || undefined
    const blockedCodes = [
      'UNTRUSTED_CONTENT_FLAGGED',
      'QUARANTINE_FAILED',
      'INPUT_INVALID',
      'MODEL_REFUSED',
      'INVALID_OUTPUT',
      'UNGROUNDED_RECIPIENT',
      'UNKNOWN_CONTACT',
      'PROVIDERS_UNAVAILABLE',
      'BUDGET_EXCEEDED',
    ]
    if (code && blockedCodes.includes(code)) {
      await recordBlocked(
        database,
        requestId,
        `${code}: ${error.message}`,
        code === 'UNTRUSTED_CONTENT_FLAGGED',
      )
      await appendAuditEvent(database, {
        requestId,
        type: 'planner.blocked',
        data: { code, reason: error.message },
      })
      return {
        statusCode: 200,
        body: { requestId, status: 'blocked', code, error: error.message || 'Blocked, nothing executed.' },
      }
    }
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
    await recordBlocked(database, requestId, decision.reason)
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

  const tier = routeTier({
    intent,
    allowedRecipients: policy.allowedRecipients,
    allowedContracts: policy.allowedContracts,
    maxPerTxWei: policy.maxPerTxWei,
    valueWei: BigInt(decision.valueWei),
    riskScore: 0,
    forbiddenPatterns: [],
    autonomyLevel: getLevel(),
  })
  await appendAuditEvent(database, {
    requestId,
    type: 'policy.tier_routed',
    data: { ...summary, tier: tier.tier, reasons: tier.reasons },
  })
  if (tier.tier !== 'T1') {
    if (tier.tier === 'T3') {
      await recordBlocked(database, requestId, tier.reasons.join('; '))
      await appendAuditEvent(database, {
        requestId,
        type: 'policy.denied',
        data: { ...summary, tier: tier.tier, reasons: tier.reasons },
      })
      return { statusCode: 200, body: { requestId, status: 'denied', tier: tier.tier, intent: summary, reasons: tier.reasons } }
    }
    try {
      const approval = await createTransferApproval(database, intent, requestId)
      return {
        statusCode: 202,
        body: {
          requestId,
          status: 'approval_required',
          tier: tier.tier,
          intent: summary,
          reasons: approval.reasons,
          approval: { id: approval.approvalId, digest: approval.digest, expiresAt: approval.expiresAt },
        },
      }
    } catch (error) {
      await appendAuditEvent(database, {
        requestId,
        type: 'approval.creation_failed',
        data: { ...summary, reason: error instanceof Error ? error.message : 'Unable to create approval request' },
      })
      return {
        statusCode: error.statusCode || 503,
        body: {
          requestId,
          status: 'not_executed',
          intent: summary,
          error: error instanceof Error ? error.message : 'Unable to create approval request.',
        },
      }
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
  await recordClean(database, requestId)
  return {
    statusCode: 200,
    body: { requestId, status: transaction.status, intent: summary, txHash: transaction.txHash },
  }
}

async function submitGoal(database, goal, idempotencyKey, untrusted?: string[]) {
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
    const result = await processGoal(database, goal, requestId, untrusted)
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
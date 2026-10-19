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
import { createSwapApproval, createTransferApproval } from './approvals.service.tsx'
import { reserveTransfer } from '../db/repositories/policy-usage.repository.tsx'
import { getSigner, getSignerAddress, sendAuthorizedNativeTransfer, sendAuthorizedSwap, simulateAuthorizedSwap } from '../signer/signer-service.tsx'
import { getToken } from '../chain/token-registry.tsx'
import { getWalletSnapshot } from '../chain/wallet-snapshot.tsx'
import { parseUnits } from 'ethers'
import { policyWithVerifiedSupplierRecipients } from '../db/repositories/suppliers.repository.tsx'
import { getAddress } from 'ethers'
import { intentSchema } from '../guard/intent.schema.tsx'

const blockedCodes = new Set([
  'UNTRUSTED_CONTENT_FLAGGED',
  'QUARANTINE_FAILED',
  'INPUT_INVALID',
  'MODEL_REFUSED',
  'INVALID_OUTPUT',
  'UNGROUNDED_RECIPIENT',
  'UNKNOWN_CONTACT',
  'PROVIDERS_UNAVAILABLE',
  'BUDGET_EXCEEDED',
  'APPROVAL_EXPIRED',
  'DIGEST_MISMATCH',
  'SIMULATION_FAILED',
  'TIER_3_FORBIDDEN',
])

const autonomyFreezeCodes = new Set([
  'UNTRUSTED_CONTENT_FLAGGED',
  'UNGROUNDED_RECIPIENT',
  'DIGEST_MISMATCH',
  'TIER_3_FORBIDDEN',
])

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
    token: intent.from?.token ?? intent.token ?? null,
    amount: intent.from?.amount ?? null,
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
    if (tier.tier === 'T3') {
      await recordBlocked(database, requestId, tier.reasons.join('; '))
    }
    let approval = null
    if (tier.tier === 'T2') {
      try {
        approval = await createSwapApproval(database, intent, requestId)
      } catch (error) {
        await appendAuditEvent(database, {
          requestId,
          type: 'approval.creation_failed',
          data: { ...summary, reason: error instanceof Error ? error.message : 'Unable to create swap approval request' },
        })
        return {
          statusCode: error.statusCode || 503,
          body: {
            requestId,
            status: 'not_executed',
            intent: summary,
            error: error instanceof Error ? error.message : 'Unable to create swap approval request.',
          },
        }
      }
    }
    await appendAuditEvent(database, {
      requestId, type: tier.tier === 'T2' ? 'approval.required' : 'policy.denied',
      data: { ...summary, tier: tier.tier, reasons: tier.reasons, ...(approval ? { approvalId: approval.approvalId } : {}) },
    })
    return {
      statusCode: approval ? 202 : 200,
      body: {
        requestId,
        status,
        tier: tier.tier,
        intent: summary,
        reasons: tier.reasons,
        ...(approval ? { approvalId: approval.approvalId, expiresAt: approval.expiresAt } : {}),
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

async function processGoal(
  database,
  goal,
  requestId,
  untrusted?: string[],
  dependencies: { planGoal?: typeof planGoal; getWalletSnapshot?: typeof getWalletSnapshot } = {},
  trustedPayment?: { intent; supplierId: string; invoiceId: string },
) {
  const planner = dependencies.planGoal ?? planGoal
  const readWalletSnapshot = dependencies.getWalletSnapshot ?? getWalletSnapshot
  await appendAuditEvent(database, {
    requestId,
    type: 'goal.received',
    data: { goalSha256: goalHash(goal), hasUntrusted: Array.isArray(untrusted) && untrusted.length > 0 },
  })

  let intent = trustedPayment?.intent
  try {
    if (!intent) intent = await planner(goal, Number(process.env.CHAIN_ID || 31337), untrusted)
  } catch (error) {
    const code = error.code || undefined
    if (code && blockedCodes.has(code)) {
      if (autonomyFreezeCodes.has(code)) {
        await recordBlocked(
          database,
          requestId,
          `${code}: ${error.message}`,
          code === 'UNTRUSTED_CONTENT_FLAGGED',
        )
      }
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

  const parsedIntent = intentSchema.safeParse(intent)
  if (!parsedIntent.success) {
    return { statusCode: 400, body: { requestId, status: 'not_executed', error: 'Trusted payment intent failed validation.' } }
  }
  intent = parsedIntent.data
  if (trustedPayment?.supplierId) {
    const supplier = await database.collection(COLLECTIONS.suppliers).findOne({ supplierId: trustedPayment.supplierId, status: 'active' })
    if (!supplier || getAddress(supplier.payoutAccount).toLowerCase() !== getAddress(intent.recipient).toLowerCase()) {
      await appendAuditEvent(database, {
        requestId,
        type: 'invoice.supplier_registry_changed',
        data: { invoiceId: trustedPayment.invoiceId, supplierId: trustedPayment.supplierId, reason: 'Supplier is no longer active or its registered payout address changed' },
      })
      return { statusCode: 409, body: { requestId, status: 'blocked', error: 'Verified supplier payout details changed; human review is required.' } }
    }
  }
  const summary = {
    ...intentSummary(intent),
    ...(trustedPayment ? { supplierId: trustedPayment.supplierId, invoiceId: trustedPayment.invoiceId } : {}),
  }
  await appendAuditEvent(database, {
    requestId,
    type: 'intent.proposed',
    data: summary,
  })

  if (intent.action === 'read_balance') {
    try {
      const balance = await readWalletSnapshot()
      await appendAuditEvent(database, {
        requestId,
        type: 'wallet.balance_read',
        data: { chainId: balance.chainId },
      })
      return {
        statusCode: 200,
        body: { requestId, status: 'success', intent: summary, data: balance },
      }
    } catch (error) {
      await appendAuditEvent(database, {
        requestId,
        type: 'wallet.balance_read_failed',
        data: { reason: error instanceof Error ? error.message : 'Unknown wallet read error' },
      })
      return {
        statusCode: 503,
        body: {
          requestId,
          status: 'not_executed',
          error: error instanceof Error ? error.message : 'Unable to read wallet balance.',
        },
      }
    }
  }

  if (isKillSwitchActive()) {
    await appendAuditEvent(database, {
      requestId,
      type: 'planner.blocked',
      data: { code: 'KILL_SWITCH_ACTIVE', reason: 'Agent is frozen; transaction execution is disabled' },
    })
    return {
      statusCode: 423,
      body: {
        requestId,
        status: 'blocked',
        code: 'KILL_SWITCH_ACTIVE',
        error: 'Agent is frozen; transaction was not executed. An owner must reset autonomy before sending transactions.',
      },
    }
  }

  let policy
  try {
    policy = readPolicyConfig()
    if (trustedPayment) policy = await policyWithVerifiedSupplierRecipients(database, policy)
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
      const approval = await createTransferApproval(database, intent, requestId, trustedPayment?.invoiceId)
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

async function submitVerifiedSupplierPayment(database, invoiceId, requestId) {
  const invoice = await database.collection(COLLECTIONS.invoices).findOne({ invoiceId, status: 'processing' })
  if (!invoice) throw new Error('Invoice is not in a payable processing state.')
  const supplier = await database.collection(COLLECTIONS.suppliers).findOne({
    supplierId: invoice.supplierId,
    status: 'active',
  })
  if (!supplier || getAddress(invoice.invoiceAccount).toLowerCase() !== getAddress(supplier.payoutAccount).toLowerCase()) {
    throw new Error('Invoice does not match the currently verified supplier registry.')
  }
  const intent = intentSchema.parse({
    intentId: randomUUID(),
    action: 'transfer',
    chainId: Number(process.env.CHAIN_ID || 31337),
    from: { token: 'ETH', amount: invoice.amountEth },
    recipient: getAddress(supplier.payoutAccount),
    rationale: 'Verified supplier invoice payment',
    sourceRefs: [],
  })
  await appendAuditEvent(database, {
    requestId,
    type: 'invoice.payment_proposed',
    data: { invoiceId, supplierId: supplier.supplierId, amountEth: invoice.amountEth },
  })
  return processGoal(
    database,
    `Pay verified supplier invoice ${invoiceId}`,
    requestId,
    undefined,
    undefined,
    { intent, supplierId: supplier.supplierId, invoiceId },
  )
}

async function getGoalHistory(
  database,
  { walletAddress, role }: { walletAddress?: string; role?: string } = {},
) {
  const filter: Record<string, unknown> = { 'body.intent.action': { $in: ['transfer', 'swap'] } }
  if (role === 'clerk' && walletAddress) filter.requestedBy = walletAddress
  const records = await database.collection(COLLECTIONS.goals)
    .find(filter, {
      projection: { _id: 0, requestId: 1, body: 1, createdAt: 1 },
    })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray() as Array<{
      requestId: string
      body: Record<string, any>
      createdAt: Date
    }>
  const approvalIds = records.flatMap(({ body }) => {
    const id = body?.approval?.id || body?.approvalId
    return typeof id === 'string' ? [id] : []
  })
  const approvals = approvalIds.length
    ? await database.collection(COLLECTIONS.approvals)
      .find({ approvalId: { $in: approvalIds } }, {
        projection: { _id: 0, approvalId: 1, status: 1, txHash: 1, failureReason: 1, minimumOutput: 1, expiresAt: 1 },
      })
      .toArray()
    : []
  const typedApprovals = approvals as Array<{
    approvalId: string
    status: string
    txHash?: string
    failureReason?: string
    minimumOutput?: string
    expiresAt?: number
  }>
  const expiredApprovals = typedApprovals.filter((approval) =>
    approval.status === 'pending' && approval.expiresAt <= Date.now())
  await Promise.all(expiredApprovals.map(async (approval) => {
    await database.collection(COLLECTIONS.approvals).updateOne(
      { approvalId: approval.approvalId, status: 'pending', expiresAt: { $lte: Date.now() } },
      { $set: { status: 'expired', updatedAt: new Date() } },
    )
    approval.status = 'expired'
  }))
  const approvalById = new Map(typedApprovals.map((approval) => [approval.approvalId, approval]))
  const transactions = records.map(({ requestId, body, createdAt }) => {
    const intent = body.intent
    const approvalId = body.approval?.id || body.approvalId
    const approval = approvalId ? approvalById.get(approvalId) : undefined
    const resultStatus = body.status
    let status
    if (resultStatus === 'success' || resultStatus === 'confirmed' || approval?.status === 'approved') {
      status = 'success'
    } else if (resultStatus === 'approval_required' && ['pending', 'executing'].includes(approval?.status)) {
      status = 'pending'
    } else {
      status = 'blocked'
    }
    return {
      id: requestId,
      requestId,
      type: intent.action === 'swap' ? 'swap' : 'send',
      to: intent.recipient || '',
      amount: intent.amount || '',
      asset: intent.token || '',
      toAsset: intent.targetToken || '',
      toAmount: approval?.minimumOutput || '',
      status,
      state: approval?.status || resultStatus || 'unknown',
      timestamp: createdAt,
      txHash: approval?.txHash || body.txHash || '',
      approvalId: approvalId || '',
      error: body.error || body.reason || approval?.failureReason || '',
    }
  })
  return {
    transactions,
    summary: {
      completed: transactions.filter((transaction) => transaction.status === 'success').length,
      blocked: transactions.filter((transaction) => transaction.status === 'blocked').length,
      pending: transactions.filter((transaction) => transaction.status === 'pending').length,
      counted: transactions.length,
    },
  }
}

async function submitGoal(database, goal, idempotencyKey, untrusted?: string[], requestedBy?: string) {
  const goals = database.collection(COLLECTIONS.goals)
  const requestId = randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  try {
    await goals.insertOne({
      idempotencyKey,
      requestId,
      ...(requestedBy ? { requestedBy } : {}),
      status: 'processing',
      createdAt: new Date(),
      expiresAt,
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    const existing = await goals.findOne({ idempotencyKey })
    if (requestedBy && existing?.requestedBy !== requestedBy) {
      return { statusCode: 409, body: { requestId: existing?.requestId, status: 'not_executed', error: 'Idempotency-Key is already associated with another request.' } }
    }
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

export { getGoalHistory, processGoal, submitGoal, submitVerifiedSupplierPayment }

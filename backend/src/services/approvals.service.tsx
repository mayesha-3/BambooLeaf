import { randomUUID } from 'node:crypto'
import { Contract, formatUnits, getAddress, parseUnits } from 'ethers'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { COLLECTIONS } from '../db/collections.tsx'
import { evaluateNativeTransfer, evaluateSwap, readPolicyConfig } from '../guard/policy-engine.tsx'
import { getLevel, getState, isKillSwitchActive, recordBlockedAttempt, recordCleanExecution } from '../guard/autonomy-manager.tsx'
import { intentSchema } from '../guard/intent.schema.tsx'
import { routeTier } from '../guard/tier-router.tsx'
import { buildNativeTransfer, getSwapTokenRoute } from '../chain/transaction-builder.tsx'
import { saveAutonomyState } from '../db/repositories/autonomy.repository.tsx'
import {
  claimPendingApproval,
  createPendingApproval,
  findApproval,
  listPendingApprovals,
  updateApproval,
} from '../db/repositories/approvals.repository.tsx'
import { reserveTransfer } from '../db/repositories/policy-usage.repository.tsx'
import {
  getSigner,
  getSignerAddress,
  sendAuthorizedNativeTransfer,
  sendAuthorizedSwap,
  simulateAuthorizedSwap,
} from '../signer/signer-service.tsx'
import { peekNextNonce } from '../signer/nonce-manager.tsx'
import { transactionDigest, verifyTransactionDigest } from '../signer/approval-digest.tsx'
import { issueGuardAuthorizationUntil } from '../guard/guard-auth.tsx'
import { policyWithVerifiedSupplierRecipients } from '../db/repositories/suppliers.repository.tsx'

const APPROVAL_TTL_MS = 2 * 60 * 1000

async function updateInvoicePaymentState(database, approval, status, reason) {
  if (!approval.invoiceId) return
  await database.collection(COLLECTIONS.invoices).updateOne(
    { invoiceId: approval.invoiceId, status: { $in: ['awaiting_approval', 'processing'] } },
    {
      $set: {
        status,
        ...(reason ? { escalationReason: reason } : {}),
        updatedAt: new Date(),
      },
    },
  )
}

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

export class ApprovalError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message)
    this.name = 'ApprovalError'
  }
}

function tierForTransfer(intent, policy) {
  const decision = evaluateNativeTransfer(intent, policy)
  if (!decision.allowed) throw new ApprovalError(409, decision.reason)
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
  return { decision, tier }
}

async function createTransferApproval(database, intent, requestId, invoiceId) {
  if (isKillSwitchActive()) throw new ApprovalError(423, 'Kill switch is active; no approval request can be created.')
  if (!process.env.AGENT_KEY) throw new ApprovalError(503, 'Signer is not configured.')
  if (!process.env.OWNER_WALLET_ADDRESS) throw new ApprovalError(503, 'OWNER_WALLET_ADDRESS must be configured for human approvals.')
  let ownerWallet
  try {
    ownerWallet = getAddress(process.env.OWNER_WALLET_ADDRESS).toLowerCase()
  } catch {
    throw new ApprovalError(503, 'OWNER_WALLET_ADDRESS is invalid.')
  }
  const policy = await policyWithVerifiedSupplierRecipients(database, readPolicyConfig())
  const { decision, tier } = tierForTransfer(intent, policy)
  if (tier.tier !== 'T2') throw new ApprovalError(409, 'Transfer no longer requires human approval.')

  const { provider, wallet } = getSigner()
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== policy.chainId || Number(network.chainId) !== intent.chainId) {
    throw new ApprovalError(409, 'Connected chain changed before approval could be created.')
  }
  const tx = buildNativeTransfer(intent)
  const nonce = await peekNextNonce(provider, wallet)
  const expiresAt = Date.now() + APPROVAL_TTL_MS
  const digest = transactionDigest({
    chainId: intent.chainId,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    nonce,
    expiresAt,
  })
  const approvalId = randomUUID()
  const record = await createPendingApproval(database, {
    approvalId,
    requestId,
    ownerWallet,
    invoiceId,
    intent,
    chainId: intent.chainId,
    reasons: tier.reasons,
    nonce,
    digest,
    expiresAt,
  })
  await appendAuditEvent(database, {
    requestId,
    type: 'approval.requested',
    data: { approvalId, digest, expiresAt, tier: tier.tier, reasons: tier.reasons },
  })
  return { approvalId: record.approvalId, digest, expiresAt, reasons: tier.reasons, valueWei: decision.valueWei }
}

async function createSwapApproval(database, intent, requestId, dependencies: {
  getSignerAddress?: typeof getSignerAddress
  getSigner?: typeof getSigner
  evaluateSwap?: typeof evaluateSwap
  simulateAuthorizedSwap?: typeof simulateAuthorizedSwap
  peekNextNonce?: typeof peekNextNonce
} = {}) {
  const resolveSignerAddress = dependencies.getSignerAddress ?? getSignerAddress
  const resolveSigner = dependencies.getSigner ?? getSigner
  const evaluateSwapIntent = dependencies.evaluateSwap ?? evaluateSwap
  const simulateSwap = dependencies.simulateAuthorizedSwap ?? simulateAuthorizedSwap
  const readNextNonce = dependencies.peekNextNonce ?? peekNextNonce
  if (isKillSwitchActive()) throw new ApprovalError(423, 'Kill switch is active; no approval request can be created.')
  if (!process.env.AGENT_KEY) throw new ApprovalError(503, 'Signer is not configured.')
  if (!process.env.OWNER_WALLET_ADDRESS) throw new ApprovalError(503, 'OWNER_WALLET_ADDRESS must be configured for human approvals.')

  let ownerWallet
  try {
    ownerWallet = getAddress(process.env.OWNER_WALLET_ADDRESS).toLowerCase()
  } catch {
    throw new ApprovalError(503, 'OWNER_WALLET_ADDRESS is invalid.')
  }

  const policy = readPolicyConfig()
  const signerAddress = resolveSignerAddress()
  const { provider, wallet } = resolveSigner()
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== policy.chainId || Number(network.chainId) !== intent.chainId) {
    throw new ApprovalError(409, 'Connected chain changed before approval could be created.')
  }
  const decision = await evaluateSwapIntent(intent, { provider, recipient: signerAddress, config: policy })
  if (!decision.allowed) throw new ApprovalError(409, decision.reason)

  const { tokenIn, tokenOut, nativeInput } = getSwapTokenRoute(intent)
  const amountIn = parseUnits(intent.from.amount, tokenIn.decimals)
  const amountCap = parseUnits(policy.maxSwapInputAmount, tokenIn.decimals)
  const tier = routeTier({
    intent,
    allowedRecipients: policy.allowedRecipients,
    allowedContracts: new Set([...policy.allowedContracts, ...policy.allowedSwapRouters]),
    targetContract: policy.swapRouterAddress,
    maxPerTxWei: amountCap,
    valueWei: amountIn,
    riskScore: 0,
    forbiddenPatterns: [],
    autonomyLevel: getLevel(),
  })
  if (tier.tier !== 'T2') throw new ApprovalError(409, 'Swap no longer requires human approval.')

  const simulation = await simulateSwap(intent, decision.authorization)
  const balanceContract = nativeInput ? null : new Contract(
    tokenIn.address,
    ['function allowance(address owner, address spender) view returns (uint256)'],
    provider,
  )
  const allowance = balanceContract
    ? BigInt(await balanceContract.allowance(signerAddress, policy.swapRouterAddress))
    : amountIn
  const approvalTransactions = allowance >= amountIn ? 0 : allowance > 0n ? 2 : 1
  const nonce = await readNextNonce(provider, wallet) + approvalTransactions
  const expiresAt = Date.now() + APPROVAL_TTL_MS
  const transactionValue = BigInt(decision.authorization.valueWei)
  const digest = transactionDigest({
    chainId: intent.chainId,
    to: decision.authorization.transactionTo,
    value: transactionValue,
    data: decision.authorization.transactionData,
    nonce,
    expiresAt,
  })
  const approvalId = randomUUID()
  const record = await createPendingApproval(database, {
    approvalId,
    requestId,
    ownerWallet,
    intent,
    recipient: signerAddress,
    chainId: intent.chainId,
    reasons: tier.reasons,
    nonce,
    digest,
    expiresAt,
    transactionTo: decision.authorization.transactionTo,
    transactionData: decision.authorization.transactionData,
    transactionValueWei: transactionValue.toString(),
    swapApprovalCount: approvalTransactions,
    simulatedComparison: simulation.comparison,
    minimumOutput: formatUnits(decision.swap.minAmountOut, tokenOut.decimals),
  })
  await appendAuditEvent(database, {
    requestId,
    type: 'approval.requested',
    data: {
      approvalId,
      digest,
      expiresAt,
      tier: tier.tier,
      reasons: tier.reasons,
      action: 'swap',
    },
  })
  return { approvalId: record.approvalId, digest, expiresAt, reasons: tier.reasons }
}

async function getPendingApprovals(database, ownerWallet) {
  return (await listPendingApprovals(database)).filter((item) => item.ownerWallet === ownerWallet.toLowerCase())
}

async function getApprovalStatus(database, approvalId, ownerWallet) {
  const approval = await findApproval(database, approvalId)
  if (!approval || approval.ownerWallet !== ownerWallet.toLowerCase()) {
    throw new ApprovalError(404, 'Approval request was not found.')
  }
  if (approval.status === 'pending' && approval.expiresAt <= Date.now()) {
    await updateApproval(database, approvalId, 'expired')
    await updateInvoicePaymentState(database, approval, 'expired', 'Approval request expired before review.')
    approval.status = 'expired'
  }
  return {
    approvalId: approval.approvalId,
    status: approval.status,
    expiresAt: approval.expiresAt,
    txHash: approval.txHash || null,
    failureReason: approval.failureReason || null,
  }
}

async function rejectTransferApproval(database, approvalId, ownerWallet, requestId) {
  const approval = await findApproval(database, approvalId)
  if (!approval || approval.ownerWallet !== ownerWallet.toLowerCase()) {
    throw new ApprovalError(404, 'Approval request was not found.')
  }
  const changed = await database.collection(COLLECTIONS.approvals).updateOne(
    { approvalId, ownerWallet: ownerWallet.toLowerCase(), status: 'pending', expiresAt: { $gt: Date.now() } },
    { $set: { status: 'rejected', decidedAt: new Date() } },
  )
  if (changed.modifiedCount !== 1) throw new ApprovalError(409, 'Approval request is no longer pending.')
  await appendAuditEvent(database, {
    requestId,
    type: 'approval.rejected',
    data: { approvalId, walletAddress: ownerWallet },
  })
  await updateInvoicePaymentState(database, approval, 'rejected', 'Supplier payment was rejected by an authorized reviewer.')
  return { approvalId, status: 'rejected' }
}

async function approveSwap(database, approval, intent, requestId) {
  const policy = readPolicyConfig()
  const signerAddress = getSignerAddress()
  const { provider, wallet } = getSigner()
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== policy.chainId || Number(network.chainId) !== intent.chainId) {
    await updateApproval(database, approval.approvalId, 'stale', { failureReason: 'Connected chain changed' })
    throw new ApprovalError(409, 'Connected chain changed; request a fresh approval.')
  }

  const { tokenIn } = getSwapTokenRoute(intent)
  const amountIn = parseUnits(intent.from.amount, tokenIn.decimals)
  const allowanceContract = intent.from.token.toUpperCase() === 'ETH' ? null : new Contract(
    tokenIn.address,
    ['function allowance(address owner, address spender) view returns (uint256)'],
    provider,
  )
  const allowance = allowanceContract
    ? BigInt(await allowanceContract.allowance(signerAddress, policy.swapRouterAddress))
    : amountIn
  const approvalCount = allowance >= amountIn ? 0 : allowance > 0n ? 2 : 1
  const nonce = await peekNextNonce(provider, wallet) + approvalCount
  const transactionValue = BigInt(approval.transactionValueWei)
  const digest = transactionDigest({
    chainId: intent.chainId,
    to: approval.transactionTo,
    value: transactionValue,
    data: approval.transactionData,
    nonce,
    expiresAt: approval.expiresAt,
  })
  if (approvalCount !== approval.swapApprovalCount ||
      nonce !== approval.nonce ||
      digest !== approval.digest ||
      !verifyTransactionDigest(approval.digest, {
        chainId: intent.chainId,
        to: approval.transactionTo,
        value: transactionValue,
        data: approval.transactionData,
        nonce,
        expiresAt: approval.expiresAt,
      })) {
    await updateApproval(database, approval.approvalId, 'stale', { failureReason: 'Swap transaction parameters, allowance, or nonce changed' })
    throw new ApprovalError(409, 'Swap changed since review; request a fresh approval.')
  }

  const authorization = {
    ...issueGuardAuthorizationUntil({
      chainId: intent.chainId,
      intentId: intent.intentId,
      recipient: signerAddress,
      valueWei: transactionValue.toString(),
      transactionTo: approval.transactionTo,
      transactionData: approval.transactionData,
    }, approval.expiresAt),
    approvedDigest: approval.digest,
  }
  const simulation = await simulateAuthorizedSwap(intent, authorization)
  if (!await claimPendingApproval(database, approval.approvalId)) {
    throw new ApprovalError(409, 'Approval request has already been decided.')
  }

  try {
    const reservation = await reserveTransfer(database, {
      recipient: signerAddress,
      valueWei: amountIn.toString(),
      maxPerRecipientPerDayWei: parseUnits(policy.maxSwapPerTokenPerDay, tokenIn.decimals),
      maxTxPerWindow: policy.maxTxPerWindow,
      velocityWindowSeconds: policy.velocityWindowSeconds,
      scope: `swap:${intent.from.token.toUpperCase()}`,
    })
    if (!reservation.allowed) {
      await updateApproval(database, approval.approvalId, 'denied', { failureReason: reservation.reason })
      throw new ApprovalError(409, reservation.reason)
    }

    await appendAuditEvent(database, {
      requestId,
      type: 'swap.shadow_simulated',
      data: {
        approvalId: approval.approvalId,
        comparison: simulation.comparison,
        balanceDeltas: simulation.balanceDeltas,
        nativeBalanceDeltas: simulation.nativeBalanceDeltas,
      },
    })
    const transaction = await sendAuthorizedSwap(intent, authorization)
    await updateApproval(database, approval.approvalId, 'approved', {
      txHash: transaction.txHash,
      executedDigest: transaction.digest,
    })
    await appendAuditEvent(database, {
      requestId,
      type: 'approval.executed',
      data: { approvalId: approval.approvalId, digest: transaction.digest, txHash: transaction.txHash, action: 'swap' },
    })
    await appendAuditEvent(database, {
      requestId,
      type: 'swap.confirmed',
      data: {
        approvalId: approval.approvalId,
        txHash: transaction.txHash,
        digest: transaction.digest,
        amountIn: transaction.amountIn,
        minAmountOut: transaction.minAmountOut,
        approvalTxHashes: transaction.approvalTxHashes,
      },
    })
    const previousState = getState()
    recordCleanExecution()
    const currentState = getState()
    if (previousState.level !== currentState.level) {
      await appendAuditEvent(database, {
        requestId,
        type: 'autonomy.promoted',
        data: { fromLevel: previousState.level, toLevel: currentState.level, reason: 'Ten clean confirmed executions' },
      })
    }
    try {
      await saveAutonomyState(database, currentState)
    } catch (error) {
      await appendAuditEvent(database, {
        requestId,
        type: 'autonomy.state_persistence_failed',
        data: { reason: error instanceof Error ? error.message : 'Unknown persistence failure' },
      })
    }
    return { approvalId: approval.approvalId, status: transaction.status, txHash: transaction.txHash, digest: transaction.digest }
  } catch (error) {
    const current = await findApproval(database, approval.approvalId)
    if (current?.status === 'executing') {
      const reason = error instanceof Error ? error.message : 'Swap execution failed'
      const status = /nonce changed|digest mismatch|expired|chain changed/i.test(reason) ? 'stale' : 'failed'
      await updateApproval(database, approval.approvalId, status, { failureReason: reason })
      await appendAuditEvent(database, {
        requestId,
        type: 'approval.execution_failed',
        data: { approvalId: approval.approvalId, status, reason, action: 'swap' },
      })
    }
    throw error
  }
}

async function approveTransfer(database, approvalId, ownerWallet, requestId) {
  const approval = await findApproval(database, approvalId)
  if (!approval || approval.ownerWallet !== ownerWallet.toLowerCase()) {
    throw new ApprovalError(404, 'Approval request was not found.')
  }
  if (approval.status !== 'pending' || approval.expiresAt <= Date.now()) {
    if (approval.status === 'pending') {
      await updateApproval(database, approvalId, 'expired')
      await updateInvoicePaymentState(database, approval, 'expired', 'Approval request expired before review.')
    }
    throw new ApprovalError(409, 'Approval request is expired or no longer pending.')
  }
  if (isKillSwitchActive()) throw new ApprovalError(423, 'Kill switch is active; approval cannot execute.')

  const parsed = intentSchema.safeParse(approval.intent)
  if (!parsed.success || !['transfer', 'swap'].includes(parsed.data.action)) {
    await updateApproval(database, approvalId, 'failed', { failureReason: 'Stored approval intent is invalid' })
    await updateInvoicePaymentState(database, approval, 'payment_failed', 'Stored approval intent is invalid.')
    throw new ApprovalError(409, 'Stored approval intent is invalid.')
  }
  const intent = parsed.data
  if (intent.action === 'swap') return approveSwap(database, approval, intent, requestId)
  const policy = await policyWithVerifiedSupplierRecipients(database, readPolicyConfig())
  let decision
  let tier
  try {
    ({ decision, tier } = tierForTransfer(intent, policy))
  } catch (error) {
    if (error instanceof ApprovalError) {
      await updateApproval(database, approvalId, 'denied', { failureReason: error.message })
      await updateInvoicePaymentState(database, approval, 'payment_failed', error.message)
    }
    throw error
  }
  if (tier.tier === 'T3') {
    const reason = `Transfer is now forbidden: ${tier.reasons.join('; ')}`
    await updateApproval(database, approvalId, 'denied', { failureReason: reason })
    await updateInvoicePaymentState(database, approval, 'payment_failed', reason)
    await recordBlocked(database, requestId, reason)
    throw new ApprovalError(403, reason)
  }

  const { provider, wallet } = getSigner()
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== policy.chainId || Number(network.chainId) !== intent.chainId) {
    await updateApproval(database, approvalId, 'stale', { failureReason: 'Connected chain changed' })
    await updateInvoicePaymentState(database, approval, 'payment_failed', 'Connected chain changed; submit a fresh supplier payment request.')
    throw new ApprovalError(409, 'Connected chain changed; request a fresh approval.')
  }
  const tx = buildNativeTransfer(intent)
  const nonce = await peekNextNonce(provider, wallet)
  const digest = transactionDigest({
    chainId: intent.chainId,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    nonce,
    expiresAt: approval.expiresAt,
  })
  if (nonce !== approval.nonce || !verifyTransactionDigest(approval.digest, {
    chainId: intent.chainId,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    nonce,
    expiresAt: approval.expiresAt,
  }) || digest !== approval.digest) {
    await updateApproval(database, approvalId, 'stale', { failureReason: 'Approved transaction parameters changed' })
    await updateInvoicePaymentState(database, approval, 'payment_failed', 'Transaction parameters changed; submit a fresh supplier payment request.')
    await recordBlocked(database, requestId, 'Approved transaction digest or nonce changed')
    throw new ApprovalError(409, 'Transaction changed since review; request a fresh approval.')
  }

  if (!await claimPendingApproval(database, approvalId)) {
    throw new ApprovalError(409, 'Approval request has already been decided.')
  }

  let confirmedTransaction
  try {
    const reservation = await reserveTransfer(database, {
      recipient: decision.authorization.recipient,
      valueWei: decision.valueWei,
      maxPerRecipientPerDayWei: policy.maxPerRecipientPerDayWei,
      maxTxPerWindow: policy.maxTxPerWindow,
      velocityWindowSeconds: policy.velocityWindowSeconds,
    })
    if (!reservation.allowed) {
      await updateApproval(database, approvalId, 'denied', { failureReason: reservation.reason })
      await updateInvoicePaymentState(database, approval, 'payment_failed', reservation.reason)
      throw new ApprovalError(409, reservation.reason)
    }

    const authorization = {
      ...issueGuardAuthorizationUntil({
        chainId: intent.chainId,
        intentId: intent.intentId,
        recipient: decision.authorization.recipient,
        valueWei: decision.valueWei,
      }, approval.expiresAt),
      approvedDigest: approval.digest,
    }
    const transaction = await sendAuthorizedNativeTransfer(intent, authorization, {
      onBroadcast: async (txHash) => {
        await updateApproval(database, approvalId, 'executing', { txHash, broadcastAt: new Date() })
        await appendAuditEvent(database, {
          requestId,
          type: 'transaction.broadcast',
          data: { approvalId, txHash, recipient: intent.recipient, amount: intent.from.amount, token: intent.from.token },
        })
      },
    })
    confirmedTransaction = transaction
    const previousState = getState()
    recordCleanExecution()
    const currentState = getState()
    if (previousState.level !== currentState.level) {
      await appendAuditEvent(database, {
        requestId,
        type: 'autonomy.promoted',
        data: {
          fromLevel: previousState.level,
          toLevel: currentState.level,
          reason: 'Ten clean confirmed executions',
        },
      })
    }
    await updateApproval(database, approvalId, 'approved', {
      txHash: transaction.txHash,
      executedDigest: transaction.digest,
    })
    if (approval.invoiceId) {
      await database.collection(COLLECTIONS.invoices).updateOne(
        { invoiceId: approval.invoiceId, status: 'awaiting_approval' },
        { $set: { status: 'paid', txHash: transaction.txHash, updatedAt: new Date() } },
      )
    }
    await appendAuditEvent(database, {
      requestId,
      type: 'approval.executed',
      data: {
        approvalId,
        digest: transaction.digest,
        txHash: transaction.txHash,
        recipient: intent.recipient,
        amount: intent.from.amount,
        token: intent.from.token,
      },
    })
    await appendAuditEvent(database, {
      requestId,
      type: 'transaction.confirmed',
      data: {
        approvalId,
        txHash: transaction.txHash,
        recipient: intent.recipient,
        amount: intent.from.amount,
        token: intent.from.token,
        chainId: intent.chainId,
      },
    })
    try {
      await saveAutonomyState(database, currentState)
    } catch (error) {
      await appendAuditEvent(database, {
        requestId,
        type: 'autonomy.state_persistence_failed',
        data: { reason: error instanceof Error ? error.message : 'Unknown persistence failure' },
      })
    }
    return { approvalId, status: transaction.status, txHash: transaction.txHash, digest: transaction.digest }
  } catch (error) {
    const current = await findApproval(database, approvalId)
    if (current?.status === 'executing' && !confirmedTransaction) {
      const reason = error instanceof Error ? error.message : 'Transaction execution failed'
      const requiresFreshReview = /kill switch|nonce changed|digest mismatch|authorization .*invalid|expired|chain changed/i.test(reason)
      const status = requiresFreshReview ? 'stale' : 'failed'
      await updateApproval(database, approvalId, status, { failureReason: reason })
      await updateInvoicePaymentState(database, approval, 'payment_failed', reason)
      await appendAuditEvent(database, {
        requestId,
        type: 'approval.execution_failed',
        data: { approvalId, status, reason, recipient: intent.recipient, amount: intent.from.amount, token: intent.from.token },
      })
      if (/digest mismatch|nonce changed/i.test(reason)) await recordBlocked(database, requestId, reason)
    }
    if (confirmedTransaction) {
      throw new ApprovalError(
        503,
        `Transaction ${confirmedTransaction.txHash} was confirmed, but approval finalization failed: ${error instanceof Error ? error.message : 'unknown persistence error'}`,
      )
    }
    throw error
  }
}

export { approveTransfer, createSwapApproval, createTransferApproval, getApprovalStatus, getPendingApprovals, rejectTransferApproval }
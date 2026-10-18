import { randomUUID } from 'node:crypto'
import { getAddress } from 'ethers'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { COLLECTIONS } from '../db/collections.tsx'
import { evaluateNativeTransfer, readPolicyConfig } from '../guard/policy-engine.tsx'
import { getLevel, getState, isKillSwitchActive, recordBlockedAttempt, recordCleanExecution } from '../guard/autonomy-manager.tsx'
import { intentSchema } from '../guard/intent.schema.tsx'
import { routeTier } from '../guard/tier-router.tsx'
import { buildNativeTransfer } from '../chain/transaction-builder.tsx'
import { saveAutonomyState } from '../db/repositories/autonomy.repository.tsx'
import {
  claimPendingApproval,
  createPendingApproval,
  findApproval,
  listPendingApprovals,
  updateApproval,
} from '../db/repositories/approvals.repository.tsx'
import { reserveTransfer } from '../db/repositories/policy-usage.repository.tsx'
import { getSigner, sendAuthorizedNativeTransfer } from '../signer/signer-service.tsx'
import { peekNextNonce } from '../signer/nonce-manager.tsx'
import { transactionDigest, verifyTransactionDigest } from '../signer/approval-digest.tsx'
import { issueGuardAuthorizationUntil } from '../guard/guard-auth.tsx'

const APPROVAL_TTL_MS = 2 * 60 * 1000

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

async function createTransferApproval(database, intent, requestId) {
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

async function getPendingApprovals(database, ownerWallet) {
  return (await listPendingApprovals(database)).filter((item) => item.ownerWallet === ownerWallet.toLowerCase())
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
  return { approvalId, status: 'rejected' }
}

async function approveTransfer(database, approvalId, ownerWallet, requestId) {
  const approval = await findApproval(database, approvalId)
  if (!approval || approval.ownerWallet !== ownerWallet.toLowerCase()) {
    throw new ApprovalError(404, 'Approval request was not found.')
  }
  if (approval.status !== 'pending' || approval.expiresAt <= Date.now()) {
    if (approval.status === 'pending') await updateApproval(database, approvalId, 'expired')
    throw new ApprovalError(409, 'Approval request is expired or no longer pending.')
  }
  if (isKillSwitchActive()) throw new ApprovalError(423, 'Kill switch is active; approval cannot execute.')

  const parsed = intentSchema.safeParse(approval.intent)
  if (!parsed.success || parsed.data.action !== 'transfer') {
    await updateApproval(database, approvalId, 'failed', { failureReason: 'Stored approval intent is invalid' })
    throw new ApprovalError(409, 'Stored approval intent is invalid.')
  }
  const intent = parsed.data
  const policy = readPolicyConfig()
  let decision
  let tier
  try {
    ({ decision, tier } = tierForTransfer(intent, policy))
  } catch (error) {
    if (error instanceof ApprovalError) {
      await updateApproval(database, approvalId, 'denied', { failureReason: error.message })
      await recordBlocked(database, requestId, error.message)
    }
    throw error
  }
  if (tier.tier === 'T3') {
    const reason = `Transfer is now forbidden: ${tier.reasons.join('; ')}`
    await updateApproval(database, approvalId, 'denied', { failureReason: reason })
    await recordBlocked(database, requestId, reason)
    throw new ApprovalError(403, reason)
  }

  const { provider, wallet } = getSigner()
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== policy.chainId || Number(network.chainId) !== intent.chainId) {
    await updateApproval(database, approvalId, 'stale', { failureReason: 'Connected chain changed' })
    await recordBlocked(database, requestId, 'Connected chain changed after approval request')
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
      await recordBlocked(database, requestId, reservation.reason)
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
    const transaction = await sendAuthorizedNativeTransfer(intent, authorization)
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
    await appendAuditEvent(database, {
      requestId,
      type: 'approval.executed',
      data: { approvalId, digest: transaction.digest, txHash: transaction.txHash },
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
      await updateApproval(database, approvalId, requiresFreshReview ? 'stale' : 'failed', { failureReason: reason })
      if (requiresFreshReview) await recordBlocked(database, requestId, reason)
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

export { approveTransfer, createTransferApproval, getPendingApprovals, rejectTransferApproval }
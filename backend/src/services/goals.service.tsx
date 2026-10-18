import { createHash, randomUUID } from 'node:crypto'
import { COLLECTIONS } from '../db/collections.tsx'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { planGoal } from '../../llm-planner/src/backend-bridge.ts'
import { evaluateReadOnly, readPolicyConfig } from '../guard/policy-engine.tsx'
import { evaluateIntent } from '../guard/guard-pipeline.tsx'
import { getSigner, sendAuthorized, sendApproved } from '../signer/signer-service.tsx'
import { getWalletSnapshot } from '../chain/wallet-snapshot.tsx'

function goalHash(goal) {
  return createHash('sha256').update(goal).digest('hex')
}

function intentSummary(intent) {
  return {
    intentId: intent.intentId,
    action: intent.action,
    chainId: intent.chainId,
    token: intent.from?.token,
    amount: intent.from?.amount ?? null,
    recipient: intent.recipient ?? null,
    targetToken: intent.to?.token ?? null,
  }
}

async function processGoal(database, goal, requestId, untrusted?: string[]) {
  await appendAuditEvent(database, {
    requestId,
    type: 'goal.received',
    data: { goalSha256: goalHash(goal), hasUntrusted: Array.isArray(untrusted) && untrusted.length > 0 },
  })

  // 1. Planner LLM (P3)
  let intent
  try {
    intent = await planGoal(goal, Number(process.env.CHAIN_ID || 31337), untrusted)
  } catch (error: any) {
    const code = error.code || undefined
    const blockedCodes = [
      'UNTRUSTED_CONTENT_FLAGGED', 'QUARANTINE_FAILED', 'INPUT_INVALID',
      'MODEL_REFUSED', 'INVALID_OUTPUT', 'UNGROUNDED_RECIPIENT',
      'UNKNOWN_CONTACT', 'PROVIDERS_UNAVAILABLE', 'BUDGET_EXCEEDED'
    ]
    if (code && blockedCodes.includes(code)) {
      await appendAuditEvent(database, { requestId, type: 'planner.blocked', data: { code, reason: error.message } })
      return { statusCode: 200, body: { requestId, status: 'blocked', code, error: error.message || 'Blocked, nothing executed.' } }
    }
    await appendAuditEvent(database, { requestId, type: 'planner.failed', data: { reason: error.message } })
    return { statusCode: 503, body: { requestId, status: 'not_executed', error: 'Planner unavailable or unable to produce a valid intent.' } }
  }

  const summary = intentSummary(intent)
  await appendAuditEvent(database, { requestId, type: 'intent.proposed', data: summary })

  // 2. Read Policy
  let policy
  try {
    policy = readPolicyConfig()
  } catch (error: any) {
    await appendAuditEvent(database, { requestId, type: 'policy.invalid_configuration', data: { reason: error.message } })
    return { statusCode: 500, body: { requestId, error: 'Wallet policy configuration is invalid.' } }
  }

  // 3. Read-Only Check (Balance / Quote)
  const readOnlyResult = evaluateReadOnly(intent, policy)
  if (readOnlyResult?.allowed) {
    let data = null
    if (intent.action === 'read_balance') {
      data = await getWalletSnapshot()
    }
    // Note: read_quote would need P2's builder function to fetch live quote, skipping for now
    await appendAuditEvent(database, { requestId, type: 'policy.read_only', data: { ...summary, reason: readOnlyResult.reason } })
    return { statusCode: 200, body: { requestId, status: 'success', message: 'Read-only action allowed', intent: summary, data } }
  }

  // 4. Guard Pipeline (P1)
  let pipelineResult
  try {
    const { provider, wallet } = getSigner()
    pipelineResult = await evaluateIntent(intent, {
      provider,
      signerAddress: wallet.address,
      policy,
      env: 'owner'
    })
  } catch (error: any) {
    await appendAuditEvent(database, { requestId, type: 'pipeline.failed', data: { ...summary, reason: error.message } })
    return { statusCode: 500, body: { requestId, status: 'not_executed', error: 'Guard pipeline crashed.' } }
  }

  const { decision, tier, reasons, riskScore, txRequests, approvalDigest, approvalExpiresAt, layer } = pipelineResult

  // 5. Handle Pipeline Decision
  if (decision === 'DENY') {
    await appendAuditEvent(database, {
      requestId, type: 'policy.denied',
      data: { ...summary, reason: reasons?.join(', '), layer, riskScore },
    })
    return { statusCode: 200, body: { requestId, status: 'denied', intent: summary, reason: reasons?.join(', '), tier, layer } }
  }

  if (decision === 'NEEDS_APPROVAL') {
    // Save to approvals collection (P4 handles this repository)
    const approvalId = randomUUID()
    if (typeof approvalExpiresAt !== 'number' || typeof approvalDigest !== 'string') {
      throw new Error('Approval metadata is missing from the guard pipeline')
    }
    await database.collection(COLLECTIONS.approvals).insertOne({
      approvalId, requestId, intent, txRequests, digest: approvalDigest, status: 'pending',
      chainId: intent.chainId, tier, reasons, riskScore, layer, createdAt: new Date(), expiresAt: approvalExpiresAt
    })
    await database.collection(COLLECTIONS.goals).updateOne(
      { requestId },
      { $set: { approvalId, approvalStatus: 'pending' } }
    )
    await appendAuditEvent(database, {
      requestId, type: 'approval.required',
      data: { ...summary, approvalId, tier, reasons, riskScore, layer },
    })
    return { statusCode: 202, body: { requestId, status: 'approval_required', tier, intent: summary, reasons, approvalId, digest: approvalDigest, expiresAt: approvalExpiresAt } }
  }

  // 6. T1 Auto-Execute (ALLOW_AUTO)
  try {
    const { provider, wallet } = getSigner()
    const transaction = await sendAuthorized(txRequests, null, { provider, wallet })
    
    await appendAuditEvent(database, {
      requestId, type: 'transaction.confirmed',
      data: { ...summary, txHash: transaction.txHash, tier, riskScore },
    })
    
    return { statusCode: 200, body: { requestId, status: 'success', intent: summary, txHash: transaction.txHash, tier, riskScore } }
  } catch (error: any) {
    await appendAuditEvent(database, {
      requestId, type: 'signer.failed',
      data: { ...summary, reason: error.message },
    })
    return { statusCode: 502, body: { requestId, status: 'not_executed', intent: summary, error: 'Signer rejected or failed the transaction.' } }
  }
}

// -----------------------------------------
// NEW: Approve Endpoint Logic (T2 Flow)
// -----------------------------------------
export async function approveGoal(database, approvalId: string) {
  const approval = await database.collection(COLLECTIONS.approvals).findOne({ approvalId, status: 'pending' })
  if (!approval) throw new Error('Approval not found or already processed')
  if (Date.now() > approval.expiresAt) {
    await database.collection(COLLECTIONS.approvals).updateOne({ approvalId }, { $set: { status: 'expired' } })
    throw new Error('Approval has expired')
  }

  // Pass to P2's sendApproved
  const { provider, wallet } = getSigner()
  const result = await sendApproved({
    txRequests: approval.txRequests,
    approval: { expiresAt: approval.expiresAt, digest: approval.digest, chainId: approval.chainId ?? approval.intent.chainId }
  }, { provider, wallet })

  await database.collection(COLLECTIONS.approvals).updateOne(
    { approvalId },
    { $set: { status: 'confirmed', txHash: result.txHash, decidedAt: new Date() } }
  )
  await database.collection(COLLECTIONS.goals).updateOne(
    { requestId: approval.requestId },
    { $set: { approvalStatus: 'confirmed', txHash: result.txHash, decidedAt: new Date() } }
  )
  
  await appendAuditEvent(database, {
    requestId: approval.requestId, type: 'approval.executed',
    data: { approvalId, txHash: result.txHash }
  })

  return result
}

async function submitGoal(database, goal, idempotencyKey, untrusted?: string[]) {
  const goals = database.collection(COLLECTIONS.goals)
  const requestId = randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  try {
    await goals.insertOne({ idempotencyKey, requestId, status: 'processing', createdAt: new Date(), expiresAt })
  } catch (error: any) {
    if (error.code !== 11000) throw error
    const existing = await goals.findOne({ idempotencyKey })
    if (existing?.body) return { statusCode: existing.statusCode, body: existing.body }
    return { statusCode: 202, body: { requestId: existing?.requestId, status: 'processing' } }
  }

  try {
    const result = await processGoal(database, goal, requestId, untrusted)
    await goals.updateOne({ idempotencyKey }, { $set: { status: 'complete', statusCode: result.statusCode, body: result.body } })
    return result
  } catch (error: any) {
    await goals.updateOne({ idempotencyKey }, { $set: { status: 'failed', statusCode: 500, body: { error: 'Goal processing failed.' } } })
    throw error
  }
}

export { submitGoal }
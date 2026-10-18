import { buildTxRequests } from '../chain/transaction-builder.tsx'
import { simulateTxRequests } from '../chain/simulator.tsx'
import { computeApprovalDigest } from '../signer/approval-digest.tsx'
import { checkIntentOutcome } from './intent-outcome-checker.tsx'
import { computeRiskScore } from './risk-score.tsx'
import { routeTier } from './tier-router.tsx'
import { getLevel } from './autonomy-manager.tsx'
import { evaluateNativeTransfer, evaluateSwap } from './policy-engine.tsx'

export async function evaluateIntent(intent: any, ctx: any) {
  const { policy, signerAddress, provider } = ctx
  
  try {
    // 1. Policy Check
    let policyResult;
    if (intent.action === 'swap') {
      policyResult = await evaluateSwap(intent, { provider, recipient: signerAddress, config: policy })
    } else if (intent.action === 'transfer') {
      policyResult = evaluateNativeTransfer(intent, policy)
    } else {
      return { decision: 'DENY', layer: 'policy', reasons: ['Unsupported action for pipeline'] }
    }

    if (!policyResult.allowed) {
      return { decision: 'DENY', layer: 'policy', reasons: [policyResult.reason] }
    }

    // 2. Build Transactions
    const txRequests = await buildTxRequests(intent, { ...ctx, policy })

    // 3. Simulate
    const simulation = await simulateTxRequests(txRequests, ctx)
    if (!simulation.success) {
      return { decision: 'DENY', layer: 'simulation', reasons: [simulation.error || 'Simulation failed'] }
    }

    // 4. Intent vs Outcome (Firewall)
    const outcome = {
      success: true,
      events: simulation.events,
      calledAddresses: simulation.calledAddresses
    }
    const intentCheck = checkIntentOutcome(intent, outcome)
    if (!intentCheck.passed) {
      return { decision: 'DENY', layer: 'intent_check', reasons: intentCheck.reasons }
    }

    // 5. Risk Score
    const risk = computeRiskScore({
      isNewRecipient: !policy.allowedRecipients.has(signerAddress),
      amountWei: BigInt(policyResult.valueWei || 0),
      maxPerTxWei: policy.maxPerTxWei,
      velocityCount: 0,
      maxVelocity: policy.maxTxPerWindow,
      isOddHour: false,
      hasUnlimitedApproval: simulation.events.some((e: any) => e.type === 'Approval' && e.value > (1n << 200n)),
      hasUnknownContract: false,
      priceImpactBps: 0
    })

    // 6. Tier Router
    const tierResult = routeTier({
      intent,
      allowedRecipients: policy.allowedRecipients,
      allowedContracts: new Set([...policy.allowedContracts, ...policy.allowedSwapRouters]),
      targetContract: policy.swapRouterAddress,
      maxPerTxWei: policy.maxPerTxWei,
      valueWei: BigInt(policyResult.valueWei || 0),
      riskScore: risk.score,
      forbiddenPatterns: [],
      autonomyLevel: getLevel()
    })

    // 7. If T2, generate digest for approval
    let approvalDigest = null
    let approvalExpiresAt = null
    if (tierResult.tier === 'T2') {
      approvalExpiresAt = Date.now() + 5 * 60 * 1000
      approvalDigest = computeApprovalDigest(txRequests, approvalExpiresAt, intent.chainId)
    }

    return {
      decision: tierResult.tier === 'T1' ? 'ALLOW_AUTO' : tierResult.tier === 'T2' ? 'NEEDS_APPROVAL' : 'DENY',
      tier: tierResult.tier,
      layer: 'tier',
      reasons: tierResult.reasons,
      riskScore: risk.score,
      txRequests,
      simulation,
      approvalDigest,
      approvalExpiresAt,
      policyResult
    }
  } catch (error: any) {
    return { decision: 'DENY', layer: 'simulation', reasons: [error.message || 'Pipeline evaluation failed'] }
  }
}
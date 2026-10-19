import { z } from 'zod'
import { planGoal } from '../../llm-planner/src/backend-bridge.ts'
import { getLevel } from '../guard/autonomy-manager.tsx'
import { evaluateNativeTransfer, readPolicyConfig } from '../guard/policy-engine.tsx'
import { routeTier } from '../guard/tier-router.tsx'

const arenaRequestSchema = z.object({
  goal: z.string().trim().min(1).max(1000),
  untrusted: z.array(z.string().trim().min(1).max(1000)).max(1).optional(),
}).strict().refine(
  (request) => request.goal.length + (request.untrusted?.reduce((total, text) => total + text.length, 0) ?? 0) <= 1200,
  'Combined message size must not exceed 1200 characters.',
)

const quarantineCodes = new Set([
  'UNTRUSTED_CONTENT_FLAGGED',
  'QUARANTINE_FAILED',
  'INPUT_INVALID',
  'MODEL_REFUSED',
  'INVALID_OUTPUT',
])

async function evaluateArenaRequest(input, {
  planner = planGoal,
  policy = readPolicyConfig(),
  autonomyLevel = getLevel(),
} = {}) {
  const parsed = arenaRequestSchema.safeParse(input)
  if (!parsed.success) {
    return {
      status: 'invalid_request',
      layer: 'Planner Input Guard',
      reason: parsed.error.issues.map((issue) => issue.message).join('; '),
      execution: 'not_executed',
    }
  }

  let intent
  try {
    intent = await planner(parsed.data.goal, policy.chainId, parsed.data.untrusted)
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : undefined
    const reason = error instanceof Error ? error.message : 'Planner rejected the request.'
    return {
      status: quarantineCodes.has(code) ? 'blocked' : 'planner_error',
      layer: quarantineCodes.has(code) ? 'Quarantine Firewall' : 'Planner Input Guard',
      ...(code ? { code } : {}),
      reason,
      execution: 'not_executed',
    }
  }

  if (intent.action !== 'transfer') {
    return {
      status: 'unsupported_action',
      layer: 'Policy Guardrails',
      reason: 'The isolated Arena currently previews native transfers only.',
      execution: 'not_executed',
    }
  }

  const decision = evaluateNativeTransfer(intent, policy)
  if (!decision.allowed) {
    return {
      status: 'denied',
      layer: 'Policy Guardrails',
      reason: decision.reason,
      execution: 'not_executed',
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
    autonomyLevel,
  })
  return {
    status: tier.tier === 'T1' ? 'policy_passed' : tier.tier === 'T2' ? 'approval_required' : 'denied',
    layer: 'Policy Guardrails',
    reason: tier.reasons.join('; '),
    tier: tier.tier,
    intent: {
      action: intent.action,
      chainId: intent.chainId,
      recipient: intent.recipient,
      amount: intent.from.amount,
      token: intent.from.token,
    },
    execution: 'not_executed',
  }
}

export { arenaRequestSchema, evaluateArenaRequest }
import { getAddress } from 'ethers'

export type Tier = 'T1' | 'T2' | 'T3'

export type TierDecision = {
  tier: Tier
  reasons: string[]
}

type RouterInput = {
  intent: {
    action: string
    chainId: number
    from: { token: string; amount?: string }
    recipient?: string
  }
  allowedRecipients: Set<string>
  allowedContracts: Set<string>
  maxPerTxWei: bigint
  valueWei: bigint
  riskScore: number
  forbiddenPatterns: string[]
  autonomyLevel: 'L0' | 'L1' | 'L2' | 'L3'
  targetContract?: string
}

/**
 * Decides which permission tier the intent belongs to.
 * - T3: forbidden — refused immediately
 * - T1: auto-execute, only if every rule passes
 * - T2: needs human approval
 */
export function routeTier(input: RouterInput): TierDecision {
  const reasons: string[] = []

  // L0 (read-only) → everything is T3
  if (input.autonomyLevel === 'L0') {
    return { tier: 'T3', reasons: ['Autonomy level L0 blocks all actions'] }
  }

  // L1 → always T2 (ask a human)
  if (input.autonomyLevel === 'L1') {
    reasons.push('Autonomy level L1 requires human approval')
  }

  // Forbidden patterns → T3
  for (const pattern of input.forbiddenPatterns) {
    if (input.intent.action === pattern) {
      return {
        tier: 'T3',
        reasons: [`Forbidden action pattern: ${pattern}`],
      }
    }
  }

  // Amount exceeds per-transaction cap → T2
  if (input.valueWei > input.maxPerTxWei) {
    reasons.push(
      `Amount ${input.valueWei} exceeds per-transaction cap ${input.maxPerTxWei}`,
    )
  }

  // Recipient not allow-listed → T2
  if (input.intent.recipient) {
    try {
      const recipient = getAddress(input.intent.recipient)
      if (!input.allowedRecipients.has(recipient)) {
        reasons.push(`Recipient ${recipient} is not allow-listed`)
      }
    } catch {
      return { tier: 'T3', reasons: ['Invalid recipient address'] }
    }
  }

  if (input.targetContract) {
    try {
      const target = getAddress(input.targetContract)
      if (!input.allowedContracts.has(target)) {
        reasons.push(`Contract ${target} is not allow-listed`)
      }
    } catch {
      return { tier: 'T3', reasons: ['Invalid contract address'] }
    }
  }

  // Medium risk score → T2
  if (input.riskScore >= 50 && input.riskScore < 80) {
    reasons.push(`Risk score ${input.riskScore} requires human approval`)
  }

  // High risk → T3
  if (input.riskScore >= 80) {
    return {
      tier: 'T3',
      reasons: [`Risk score ${input.riskScore} is too high`],
    }
  }

  // If any reasons accumulated → T2
  if (reasons.length > 0) {
    return { tier: 'T2', reasons }
  }

  // Otherwise auto-execute
  return {
    tier: 'T1',
    reasons: ['All policy checks passed — auto-execute'],
  }
}

export function isAutoExecutable(tier: Tier): boolean {
  return tier === 'T1'
}

export function requiresApproval(tier: Tier): boolean {
  return tier === 'T2'
}

export function isForbidden(tier: Tier): boolean {
  return tier === 'T3'
}
type RiskInput = {
  isNewRecipient: boolean
  amountWei: bigint
  maxPerTxWei: bigint
  velocityCount: number
  maxVelocity: number
  isOddHour: boolean
  hasUnlimitedApproval: boolean
  hasUnknownContract: boolean
  priceImpactBps: number
}

export type RiskResult = {
  score: number
  level: 'low' | 'medium' | 'high'
  reasons: string[]
}

export function computeRiskScore(input: RiskInput): RiskResult {
  let score = 0
  const reasons: string[] = []

  if (input.isNewRecipient) {
    score += 15
    reasons.push('New recipient')
  }

  if (input.maxPerTxWei > 0n) {
    const ratio = Number((input.amountWei * 100n) / input.maxPerTxWei)
    if (ratio >= 90) {
      score += 20
      reasons.push('Amount near the per-transaction cap')
    } else if (ratio >= 60) {
      score += 10
      reasons.push('Amount is above 60% of the cap')
    }
  }

  if (input.maxVelocity > 0 && input.velocityCount >= input.maxVelocity - 1) {
    score += 15
    reasons.push('Velocity limit nearly reached')
  }

  if (input.isOddHour) {
    score += 10
    reasons.push('Activity outside normal hours')
  }

  if (input.hasUnlimitedApproval) {
    score += 60
    reasons.push('Unlimited token approval detected')
  }

  if (input.hasUnknownContract) {
    score += 30
    reasons.push('Unknown contract call')
  }

  if (input.priceImpactBps > 100) {
    score += 20
    reasons.push(`High price impact: ${input.priceImpactBps} bps`)
  }

  score = Math.min(score, 100)

  let level: RiskResult['level'] = 'low'
  if (score >= 80) level = 'high'
  else if (score >= 50) level = 'medium'

  return { score, level, reasons }
}
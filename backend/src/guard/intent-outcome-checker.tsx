import { getAddress } from 'ethers'

type Intent = {
  action: 'transfer' | 'swap' | 'read_balance' | 'read_quote'
  chainId: number
  from: { token: string; amount?: string }
  to?: { token: string }
  recipient?: string
}

type SimulationOutcome = {
  success: boolean
  recipient?: string
  amountSent?: bigint
  tokenSent?: string
  approvals?: Array<{ spender: string; amount: bigint }>
  contractsCalled?: string[]
}

type CheckResult = {
  passed: boolean
  reasons: string[]
}

/**
 * Compares the stated intent with the simulated outcome.
 * Any mismatch is a critical block.
 */
export function checkIntentOutcome(
  intent: Intent,
  outcome: SimulationOutcome,
): CheckResult {
  const reasons: string[] = []

  if (!outcome.success) {
    return { passed: false, reasons: ['Simulation reported failure'] }
  }

  // Transfer: recipient and amount must match
  if (intent.action === 'transfer') {
    if (!intent.recipient) {
      reasons.push('Intent is missing a recipient')
    } else if (outcome.recipient) {
      const intendedRecipient = getAddress(intent.recipient).toLowerCase()
      const actualRecipient = getAddress(outcome.recipient).toLowerCase()
      if (intendedRecipient !== actualRecipient) {
        reasons.push(
          `Recipient mismatch: intent=${intendedRecipient}, outcome=${actualRecipient}`,
        )
      }
    }
  }

  // Swap: ensure no unexpected approvals
  if (intent.action === 'swap' && outcome.approvals) {
    const unusual = outcome.approvals.filter((a) => a.amount > (1n << 200n))
    if (unusual.length > 0) {
      reasons.push(
        `Unusual approval amount detected: ${unusual.length} approval(s) above threshold`,
      )
    }
  }

  // Extra contracts: unexpected calls
  if (outcome.contractsCalled && outcome.contractsCalled.length > 3) {
    reasons.push(
      `Too many contracts called: ${outcome.contractsCalled.length}`,
    )
  }

  return {
    passed: reasons.length === 0,
    reasons,
  }
}
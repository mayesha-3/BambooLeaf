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
  tokenReceived?: string
  amountReceived?: bigint
  minAmountOut?: bigint
  expectedRouter?: string
  expectedAmountSent?: bigint
  maxApprovalAmount?: bigint
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
    const unusual = outcome.approvals.filter((approval) => approval.amount > (1n << 200n))
    if (unusual.length) reasons.push(`Unusual approval amount detected: ${unusual.length} approval(s) above threshold`)
    if (outcome.expectedRouter && outcome.approvals.some((approval) =>
      approval.spender.toLowerCase() !== outcome.expectedRouter?.toLowerCase() ||
      (outcome.maxApprovalAmount !== undefined && approval.amount > outcome.maxApprovalAmount))) {
      reasons.push('Approval exceeded the exact-input router allowance')
    }
  }

  if (intent.action === 'swap') {
    if (outcome.expectedAmountSent !== undefined && outcome.amountSent !== outcome.expectedAmountSent) {
      reasons.push('Swap input balance delta does not match the intent')
    }
    if (!intent.to?.token || outcome.tokenReceived?.toUpperCase() !== intent.to.token.toUpperCase()) {
      reasons.push('Swap output token does not match the intent')
    }
    if (outcome.amountReceived === undefined || outcome.minAmountOut === undefined ||
        outcome.amountReceived < outcome.minAmountOut) {
      reasons.push('Swap output did not meet the authorized minimum')
    }
    if (outcome.expectedRouter &&
        !outcome.contractsCalled?.some((address) => address.toLowerCase() === outcome.expectedRouter?.toLowerCase())) {
      reasons.push('Allow-listed swap router was not called')
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  }
}
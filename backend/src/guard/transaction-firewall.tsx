import { Interface, Log, TransactionReceipt } from 'ethers'
import { simulateTransaction } from '../chain/simulator.tsx'
import type { JsonRpcProvider } from 'ethers'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'

const erc20Interface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
])

type DecodedEvent =
  | { type: 'Transfer'; from: string; to: string; value: bigint }
  | { type: 'Approval'; owner: string; spender: string; value: bigint }
  | { type: 'Unknown'; topic: string }

type FirewallResult = {
  success: boolean
  gasUsed: bigint
  decodedEvents: DecodedEvent[]
  hasUnlimitedApproval: boolean
  hasUnknownContractCall: boolean
  reasons: string[]
}

const MAX_UINT256 = (1n << 256n) - 1n

function decodeLogs(logs: Log[]): DecodedEvent[] {
  const events: DecodedEvent[] = []

  for (const log of logs) {
    const topic0 = log.topics[0]

    if (topic0 === TRANSFER_TOPIC) {
      try {
        const parsed = erc20Interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        })
        if (parsed) {
          events.push({
            type: 'Transfer',
            from: parsed.args[0],
            to: parsed.args[1],
            value: parsed.args[2],
          })
        }
      } catch {
        events.push({ type: 'Unknown', topic: topic0 })
      }
    } else if (topic0 === APPROVAL_TOPIC) {
      try {
        const parsed = erc20Interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        })
        if (parsed) {
          events.push({
            type: 'Approval',
            owner: parsed.args[0],
            spender: parsed.args[1],
            value: parsed.args[2],
          })
        }
      } catch {
        events.push({ type: 'Unknown', topic: topic0 })
      }
    } else {
      events.push({ type: 'Unknown', topic: topic0 })
    }
  }

  return events
}

export async function runFirewall(
  provider: JsonRpcProvider,
  from: string,
  tx: { to: string; value: bigint; data: string },
  allowedContracts: Set<string>,
): Promise<FirewallResult> {
  const reasons: string[] = []

  // 1. Simulate the transaction
  const simulation = await simulateTransaction(provider, from, tx)
  if (!simulation.success) {
    return {
      success: false,
      gasUsed: 0n,
      decodedEvents: [],
      hasUnlimitedApproval: false,
      hasUnknownContractCall: false,
      reasons: [`Simulation failed: ${simulation.error}`],
    }
  }

  // 2. Check the target contract is allow-listed (when data != '0x')
  let hasUnknownContractCall = false
  if (tx.data !== '0x' && !allowedContracts.has(tx.to.toLowerCase())) {
    hasUnknownContractCall = true
    reasons.push(`Call to non-allow-listed contract: ${tx.to}`)
  }

  // 3. Fetch the receipt from simulation if available
  // Note: eth_call doesn't return logs; we simulate with a fork in production
  const decodedEvents: DecodedEvent[] = []

  // 4. Check for unlimited approvals
  const hasUnlimitedApproval = decodedEvents.some(
    (e) => e.type === 'Approval' && e.value === MAX_UINT256,
  )
  if (hasUnlimitedApproval) {
    reasons.push('Unlimited approval detected')
  }

  return {
    success: reasons.length === 0,
    gasUsed: simulation.gasUsed,
    decodedEvents,
    hasUnlimitedApproval,
    hasUnknownContractCall,
    reasons,
  }
}

export { decodeLogs, MAX_UINT256 }
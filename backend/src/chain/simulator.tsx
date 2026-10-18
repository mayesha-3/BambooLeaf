import { Contract, Interface, JsonRpcProvider, TransactionRequest, getAddress } from 'ethers'

type SimulationResult = {
  success: boolean
  gasUsed: bigint
  returnData: string
  error?: string
}

type ShadowTransaction = { to: string; value?: bigint; data?: string }

const erc20BalanceInterface = new Interface([
  'function balanceOf(address) view returns (uint256)',
])
const eventInterface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
])

export async function simulateTransaction(
  provider: JsonRpcProvider,
  from: string,
  tx: TransactionRequest,
): Promise<SimulationResult> {
  try {
    const callRequest: TransactionRequest = {
      from,
      to: tx.to,
      value: tx.value ?? 0n,
      data: tx.data ?? '0x',
    }
    const returnData = await provider.call(callRequest)
    let gasUsed = 0n
    try {
      gasUsed = await provider.estimateGas(callRequest)
    } catch (estimateError) {
      return {
        success: false,
        gasUsed: 0n,
        returnData: '0x',
        error: `Gas estimation failed: ${(estimateError as Error).message}`,
      }
    }
    return { success: true, gasUsed, returnData }
  } catch (error) {
    return {
      success: false,
      gasUsed: 0n,
      returnData: '0x',
      error: (error as Error).message,
    }
  }
}

export async function simulateTransferBalanceDelta(
  provider: JsonRpcProvider,
  from: string,
  to: string,
  value: bigint,
): Promise<{ balanceBefore: bigint; balanceAfter: bigint; delta: bigint }> {
  const balanceBefore = await provider.getBalance(from)
  const balanceAfter = balanceBefore - value
  return { balanceBefore, balanceAfter, delta: -value }
}

async function rpc(provider: JsonRpcProvider, method: string, params: unknown[]) {
  return provider.send(method, params)
}

async function readTokenBalances(provider, accounts: string[], tokenAddresses: string[]) {
  const balances: Record<string, bigint> = {}
  for (const tokenAddress of tokenAddresses) {
    const token = new Contract(tokenAddress, erc20BalanceInterface, provider)
    for (const account of accounts) {
      balances[`${tokenAddress.toLowerCase()}:${account.toLowerCase()}`] =
        BigInt(await token.balanceOf(account))
    }
  }
  return balances
}

function decodeShadowEvents(logs) {
  return logs.map((log) => {
    try {
      const parsed = eventInterface.parseLog({ topics: log.topics, data: log.data })
      if (!parsed) return { type: 'Unknown', address: log.address, topic: log.topics[0] }
      if (parsed.name === 'Transfer') {
        return {
          type: 'Transfer',
          address: getAddress(log.address),
          from: parsed.args[0],
          to: parsed.args[1],
          value: BigInt(parsed.args[2]),
        }
      }
      return {
        type: 'Approval',
        address: getAddress(log.address),
        owner: parsed.args[0],
        spender: parsed.args[1],
        value: BigInt(parsed.args[2]),
      }
    } catch {
      return { type: 'Unknown', address: log.address, topic: log.topics[0] }
    }
  })
}

function traceAddresses(trace) {
  const addresses = new Set<string>()
  function visit(frame) {
    if (!frame || typeof frame !== 'object') return
    if (typeof frame.to === 'string' && /^0x[0-9a-fA-F]{40}$/.test(frame.to)) {
      addresses.add(getAddress(frame.to))
    }
    if (Array.isArray(frame.calls)) frame.calls.forEach(visit)
  }
  visit(trace)
  return [...addresses]
}

export async function simulateShadowFork(
  provider: JsonRpcProvider,
  from: string,
  transactions: ShadowTransaction[],
  { accounts = [from], tokenAddresses = [] }: { accounts?: string[]; tokenAddresses?: string[] } = {},
) {
  const network = await provider.getNetwork()
  const allowedChainIds = [31337, 11155111] // Allow local Anvil or Sepolia Fork
  if (!allowedChainIds.includes(Number(network.chainId))) {
    throw new Error(`Shadow-fork simulation requires a local Anvil/Hardhat fork (Chain ID 31337 or 11155111). Current: ${network.chainId}`)
  }
  
  if (transactions.length === 0) throw new Error('Shadow-fork simulation requires at least one transaction')

  const snapshot = await rpc(provider, 'evm_snapshot', [])
  let impersonationMethod: string | undefined
  let result
  try {
    try {
      await rpc(provider, 'anvil_impersonateAccount', [from])
      impersonationMethod = 'anvil_stopImpersonatingAccount'
    } catch {
      await rpc(provider, 'hardhat_impersonateAccount', [from])
      impersonationMethod = 'hardhat_stopImpersonatingAccount'
    }
    try {
      await rpc(provider, 'anvil_setBalance', [from, '0x56BC75E2D63100000'])
    } catch {
      await rpc(provider, 'hardhat_setBalance', [from, '0x56BC75E2D63100000'])
    }
    const before = await readTokenBalances(provider, accounts, tokenAddresses)
    const receipts = []
    const calledAddresses = new Set<string>()
    for (const transaction of transactions) {
      const txHash = await rpc(provider, 'eth_sendTransaction', [{
        from,
        to: getAddress(transaction.to),
        value: `0x${(transaction.value ?? 0n).toString(16)}`,
        data: transaction.data ?? '0x',
      }])
      const receipt = await provider.waitForTransaction(txHash)
      if (!receipt || receipt.status !== 1) throw new Error(`Fork transaction ${txHash} failed`)
            receipts.push(receipt)
      const trace = await rpc(provider, 'debug_traceTransaction', [txHash, { tracer: 'callTracer' }])
      for (const address of traceAddresses(trace)) {
        calledAddresses.add(address)
      }
    }
    const after = await readTokenBalances(provider, accounts, tokenAddresses)
    const balanceDeltas = Object.fromEntries(
      Object.keys(before).map((key) => [key, after[key] - before[key]]),
    )
    const events = receipts.flatMap((receipt) => decodeShadowEvents(receipt.logs))
    result = {
      success: true,
      balanceBefore: before,
      balanceAfter: after,
      balanceDeltas,
      events,
      calledAddresses: [...calledAddresses],
      transactions: receipts.map((receipt) => receipt.hash),
    }
  } catch (error) {
    result = {
      success: false,
      balanceBefore: {},
      balanceAfter: {},
      balanceDeltas: {},
      events: [],
      calledAddresses: [],
      transactions: [],
      error: error instanceof Error ? error.message : 'Shadow-fork simulation failed',
    }
  } finally {
    let cleanupError
    if (impersonationMethod) {
      try {
        await rpc(provider, impersonationMethod, [from])
      } catch (error) {
        cleanupError = error
      }
    }
    const reverted = await rpc(provider, 'evm_revert', [snapshot])
    if (!reverted) throw new Error('Shadow-fork snapshot could not be reverted')
    if (cleanupError) {
      throw new Error(`Shadow-fork account cleanup failed after snapshot revert: ${cleanupError.message}`)
    }
  }
  return { ...result, reverted: true }
}
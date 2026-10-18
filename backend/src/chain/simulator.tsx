import { Contract, Interface, JsonRpcProvider, TransactionRequest, getAddress } from 'ethers'
import type { TxRequest } from './transaction-builder.tsx'

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
): Promise<{ success: boolean; gasUsed: bigint; returnData: string; error?: string }> {
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

async function rpc(provider: JsonRpcProvider, method: string, params: unknown[]) {
  return provider.send(method, params)
}

async function readTokenBalances(provider: JsonRpcProvider, accounts: string[], tokenAddresses: string[]) {
  const balances: Record<string, bigint> = {}
  for (const tokenAddress of tokenAddresses) {
    const token = new Contract(tokenAddress, erc20BalanceInterface, provider)
    for (const account of accounts) {
      balances[`${tokenAddress.toLowerCase()}:${account.toLowerCase()}`] = BigInt(await token.balanceOf(account))
    }
  }
  return balances
}

function decodeShadowEvents(logs: any[]) {
  return logs.map((log) => {
    try {
      const parsed = eventInterface.parseLog({ topics: log.topics, data: log.data })
      if (!parsed) return { type: 'Unknown', address: log.address, topic: log.topics[0] }
      if (parsed.name === 'Transfer') {
        return { type: 'Transfer', address: getAddress(log.address), from: parsed.args[0], to: parsed.args[1], value: BigInt(parsed.args[2]) }
      }
      return { type: 'Approval', address: getAddress(log.address), owner: parsed.args[0], spender: parsed.args[1], value: BigInt(parsed.args[2]) }
    } catch {
      return { type: 'Unknown', address: log.address, topic: log.topics[0] }
    }
  })
}

export async function simulateShadowFork(
  provider: JsonRpcProvider,
  from: string,
  transactions: { to: string; value?: bigint; data?: string }[],
  { accounts = [from], tokenAddresses = [] }: { accounts?: string[]; tokenAddresses?: string[] } = {},
) {
  const network = await provider.getNetwork()
  const allowedChainIds = [31337, 11155111]
  if (!allowedChainIds.includes(Number(network.chainId))) {
    throw new Error(`Shadow-fork requires Anvil/Sepolia. Current: ${network.chainId}`)
  }
  if (transactions.length === 0) throw new Error('Simulation requires at least one transaction')

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
      for (const log of receipt.logs) {
        calledAddresses.add(getAddress(log.address))
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
      success: false, balanceBefore: {}, balanceAfter: {}, balanceDeltas: {}, events: [], calledAddresses: [], transactions: [],
      error: error instanceof Error ? error.message : 'Shadow-fork simulation failed',
    }
  } finally {
    let cleanupError
    if (impersonationMethod) {
      try { await rpc(provider, impersonationMethod, [from]) } catch (error) { cleanupError = error }
    }
    const reverted = await rpc(provider, 'evm_revert', [snapshot])
    if (!reverted) throw new Error('Shadow-fork snapshot could not be reverted')
    if (cleanupError) throw new Error(`Shadow-fork cleanup failed: ${(cleanupError as Error).message}`)
  }
  return { ...result, reverted: true }
}
// NEW: Main function for P1's Guard Pipeline
export async function simulateTxRequests(txRequests: TxRequest[], ctx: any) {
  const shadowRpcUrl = process.env.SHADOW_RPC_URL
  
  if (!shadowRpcUrl) {
    return { success: false, error: 'SHADOW_RPC_URL is not configured. Start Anvil first.' }
  }

  // Connect to Anvil (local fork) instead of Infura
  const forkProvider = new JsonRpcProvider(shadowRpcUrl)

  try {
    const shadowTxs = txRequests.map(tx => ({ to: tx.to, value: tx.value, data: tx.data }))
    
    const result = await simulateShadowFork(
      forkProvider,
      ctx.signerAddress,
      shadowTxs,
      { accounts: [ctx.signerAddress] }
    )
    
    return result
  } catch (error: any) {
    return { success: false, error: error.message || 'Simulation failed on Anvil' }
  } finally {
    forkProvider.destroy()
  }
}
import { getAddress, parseEther, parseUnits, Interface, Contract } from 'ethers'
import { getToken, isNativeToken } from './token-registry.tsx'

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]

const erc20Interface = new Interface(ERC20_ABI)
const approvalInterface = new Interface(['function approve(address spender, uint256 amount) returns (bool)'])
export const routerInterface = new Interface([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)',
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
])

// 1. Define the standard TxRequest type for the Guard Pipeline
export type TxRequest = {
  to: string
  value: bigint
  data: string
  description: string
}

type BuiltTransaction = {
  to: string
  value: bigint
  data: string
}

type BuiltSwap = {
  router: string
  tokenIn: string
  tokenOut: string
  amountIn: bigint
  quotedAmountOut: bigint
  minAmountOut: bigint
  slippageBps: number
  approval: BuiltTransaction | null
  swap: BuiltTransaction
  nativeInput: boolean
  nativeOutput: boolean
}

function getSwapTokenRoute(intent: any) {
  if (intent.action !== 'swap' || !intent.from?.token || !intent.to?.token) {
    throw new Error('Swap intent must include input and output tokens')
  }
  const nativeInput = isNativeToken(intent.from.token)
  const nativeOutput = isNativeToken(intent.to.token)
  if (nativeInput && nativeOutput) throw new Error('Swap input and output tokens must be different')

  const tokenIn = getToken(nativeInput ? 'WETH' : intent.from.token, intent.chainId)
  const tokenOut = getToken(nativeOutput ? 'WETH' : intent.to.token, intent.chainId)
  if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) {
    throw new Error('Swap input and output tokens must be different')
  }
  return { tokenIn, tokenOut, nativeInput, nativeOutput }
}

function buildSwapTransactions(intent: any, {
  routerAddress,
  recipient,
  quotedAmountOut,
  maxSlippageBps,
  deadline = Math.floor(Date.now() / 1000) + 300,
}: {
  routerAddress: string
  recipient: string
  quotedAmountOut: bigint
  maxSlippageBps: number
  deadline?: number
}): BuiltSwap {
  if (intent.action !== 'swap' || !intent.to?.token || !intent.from.amount) {
    throw new Error('Swap intent must include an input amount and output token')
  }
  if (!Number.isInteger(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > 500) {
    throw new Error('Slippage must be between 0 and 500 basis points')
  }
  if (quotedAmountOut < 0n || !Number.isSafeInteger(deadline) || deadline <= Math.floor(Date.now() / 1000)) {
    throw new Error('Swap quote or deadline is invalid')
  }

  const { tokenIn, tokenOut, nativeInput, nativeOutput } = getSwapTokenRoute(intent)
  const amountIn = parseUnits(intent.from.amount, nativeInput ? 18 : tokenIn.decimals)
  const minAmountOut = quotedAmountOut * BigInt(10_000 - maxSlippageBps) / 10_000n
  if (amountIn <= 0n || minAmountOut < 0n) {
    throw new Error('Swap input amount must be greater than zero')
  }

  const router = getAddress(routerAddress)
  const to = getAddress(recipient)
  const path = [tokenIn.address, tokenOut.address]
  const functionName = nativeInput
    ? 'swapExactETHForTokens'
    : nativeOutput
      ? 'swapExactTokensForETH'
      : 'swapExactTokensForTokens'
  const args = nativeInput
    ? [minAmountOut, path, to, deadline]
    : [amountIn, minAmountOut, path, to, deadline]
  return {
    router,
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn,
    quotedAmountOut,
    minAmountOut,
    slippageBps: maxSlippageBps,
    approval: nativeInput ? null : buildErc20Approval(tokenIn.address, router, amountIn),
    nativeInput,
    nativeOutput,
    swap: {
      to: router,
      value: nativeInput ? amountIn : 0n,
      data: routerInterface.encodeFunctionData(functionName, args),
    },
  }
}

// 3. Build Approvals & Transfers (Existing)
function buildErc20Approval(tokenAddress: string, spender: string, amount: bigint): BuiltTransaction {
  if (amount < 0n) throw new Error('Approval amount cannot be negative')
  return {
    to: getAddress(tokenAddress),
    value: 0n,
    data: approvalInterface.encodeFunctionData('approve', [getAddress(spender), amount]),
  }
}

function buildNativeTransfer(intent: any): BuiltTransaction {
  if (intent.action !== 'transfer' || intent.from.token !== 'ETH') {
    throw new Error('The transaction builder only supports native ETH transfers')
  }
  return {
    to: getAddress(intent.recipient),
    value: parseEther(intent.from.amount),
    data: '0x',
  }
}

function buildErc20Transfer(intent: any): BuiltTransaction {
  if (intent.action !== 'transfer') {
    throw new Error('ERC-20 builder only handles transfer actions')
  }

  const token = getToken(intent.from.token, intent.chainId)
  if (isNativeToken(token.symbol)) {
    throw new Error('Use buildNativeTransfer for ETH')
  }

  const recipient = getAddress(intent.recipient)
  const amount = parseUnits(intent.from.amount, token.decimals)
  const data = erc20Interface.encodeFunctionData('transfer', [recipient, amount])

  return {
    to: token.address,
    value: 0n,
    data,
  }
}

function buildTransaction(intent: any): BuiltTransaction {
  if (intent.action === 'transfer') {
    if (isNativeToken(intent.from.token)) {
      return buildNativeTransfer(intent)
    }
    return buildErc20Transfer(intent)
  }
  throw new Error(`Unsupported action: ${intent.action}`)
}

// 4. NEW: Main function for Guard Pipeline (P1 will call this)
export async function buildTxRequests(intent: any, ctx: any): Promise<TxRequest[]> {
  if (intent.action === 'transfer') {
    if (isNativeToken(intent.from.token)) {
      const tx = buildNativeTransfer(intent)
      return [{ ...tx, description: `Transfer ${intent.from.amount} ETH` }]
    }
    const tx = buildErc20Transfer(intent)
    return [{ ...tx, description: `Transfer ${intent.from.amount} ${intent.from.token}` }]
  }

  if (intent.action === 'swap') {
    const { provider } = ctx
    const router = ctx.policy.swapRouterAddress
    const { tokenIn, tokenOut, nativeInput } = getSwapTokenRoute(intent)
    
    // Fetch live quote from Uniswap
    const routerContract = new Contract(router, routerInterface, provider)
    const amountIn = parseUnits(intent.from.amount, nativeInput ? 18 : tokenIn.decimals)
    const amounts = await routerContract.getAmountsOut(amountIn, [tokenIn.address, tokenOut.address])
    const quotedAmountOut = BigInt(amounts[1])

    const { approval, swap } = buildSwapTransactions(intent, {
      routerAddress: router,
      recipient: ctx.signerAddress,
      quotedAmountOut,
      maxSlippageBps: intent.maxSlippageBps
    })

    return [
      ...(approval ? [{ ...approval, description: `Approve ${intent.from.amount} ${intent.from.token}` }] : []),
      { ...swap, description: `Swap ${intent.from.amount} ${intent.from.token} to ${intent.to.token}` },
    ]
  }

  throw new Error(`Unsupported action for tx builder: ${intent.action}`)
}

export { buildNativeTransfer, buildErc20Approval, buildErc20Transfer, buildSwapTransactions, buildTransaction, getSwapTokenRoute }
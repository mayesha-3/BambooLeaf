import { getAddress, parseEther, parseUnits, Interface } from 'ethers'
import { getToken, isNativeToken } from './token-registry.tsx'

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]

const erc20Interface = new Interface(ERC20_ABI)
const approvalInterface = new Interface(['function approve(address spender, uint256 amount) returns (bool)'])
const routerInterface = new Interface([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
])

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
  approval: BuiltTransaction
  swap: BuiltTransaction
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
  if (isNativeToken(intent.from.token) || isNativeToken(intent.to.token)) {
    throw new Error('Native-token swaps are not supported; use ERC-20 tokens such as WETH')
  }
  if (!Number.isInteger(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > 500) {
    throw new Error('Slippage must be between 0 and 500 basis points')
  }
  if (quotedAmountOut < 0n || !Number.isSafeInteger(deadline) || deadline <= Math.floor(Date.now() / 1000)) {
    throw new Error('Swap quote or deadline is invalid')
  }

  const tokenIn = getToken(intent.from.token, intent.chainId)
  const tokenOut = getToken(intent.to.token, intent.chainId)
  if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) {
    throw new Error('Swap input and output tokens must be different')
  }
  const amountIn = parseUnits(intent.from.amount, tokenIn.decimals)
  const minAmountOut = quotedAmountOut * BigInt(10_000 - maxSlippageBps) / 10_000n
  if (amountIn <= 0n || minAmountOut < 0n) {
    throw new Error('Swap input amount must be greater than zero')
  }

  const router = getAddress(routerAddress)
  const to = getAddress(recipient)
  return {
    router,
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn,
    quotedAmountOut,
    minAmountOut,
    slippageBps: maxSlippageBps,
    approval: buildErc20Approval(tokenIn.address, router, amountIn),
    swap: {
      to: router,
      value: 0n,
      data: routerInterface.encodeFunctionData('swapExactTokensForTokens', [
        amountIn,
        minAmountOut,
        [tokenIn.address, tokenOut.address],
        to,
        deadline,
      ]),
    },
  }
}

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

export { buildNativeTransfer, buildErc20Approval, buildErc20Transfer, buildSwapTransactions, buildTransaction, routerInterface }
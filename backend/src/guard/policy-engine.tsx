import { Contract, getAddress, parseEther, parseUnits } from 'ethers'
import { issueGuardAuthorization } from './guard-auth.tsx'
import { getToken } from '../chain/token-registry.tsx'
import { buildSwapTransactions } from '../chain/transaction-builder.tsx'

const swapRouterAbi = ['function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)']

function parsePositiveWei(amount) {
  try {
    const wei = parseEther(amount)
    return wei > 0n ? wei : null
  } catch {
    return null
  }
}

function readPolicyConfig(environment = process.env) {
  return {
    chainId: Number(environment.CHAIN_ID || 31337),
    maxPerTxWei: parseEther(environment.MAX_PER_TX_ETH || '0.02'),
    maxPerRecipientPerDayWei: parseEther(environment.MAX_PER_RECIPIENT_PER_DAY_ETH || '0.05'),
    maxTxPerWindow: Number(environment.MAX_TX_PER_WINDOW || 5),
    velocityWindowSeconds: Number(environment.VELOCITY_WINDOW_SECONDS || 600),
    allowedRecipients: new Set((environment.ALLOWED_RECIPIENTS || '')
      .split(',').map((address) => address.trim()).filter(Boolean).map(getAddress)),
    allowedContracts: new Set((environment.ALLOWED_CONTRACTS || '')
      .split(',').map((address) => address.trim()).filter(Boolean).map(getAddress)),
    allowedSwapRouters: new Set((environment.ALLOWED_SWAP_ROUTERS || '')
      .split(',').map((address) => address.trim()).filter(Boolean).map(getAddress)),
    swapRouterAddress: environment.SWAP_ROUTER_ADDRESS ? getAddress(environment.SWAP_ROUTER_ADDRESS) : '',
    maxSlippageBps: Number(environment.MAX_SLIPPAGE_BPS || 100),
    maxSwapInputAmount: environment.MAX_SWAP_INPUT_AMOUNT || '',
    maxSwapPerTokenPerDay: environment.MAX_SWAP_PER_TOKEN_PER_DAY || '',
  }
}

// Add this new function to allow read-only actions
function evaluateReadOnly(intent, config) {
  if (intent.action === 'read_balance' || intent.action === 'read_quote') {
    return {
      allowed: true,
      reason: 'Read-only action is always allowed.',
      isReadOnly: true
    }
  }
  return null
}

async function evaluateSwap(intent, { provider, recipient, config }) {
  if (intent.action !== 'swap' || !intent.to?.token || !intent.from.amount) {
    return { allowed: false, reason: 'Swap intent is incomplete.' }
  }
  if (intent.chainId !== config.chainId) {
    return { allowed: false, reason: 'Intent chain ID does not match the configured chain.' }
  }
  if (!Number.isInteger(config.maxSlippageBps) || config.maxSlippageBps < 0 || config.maxSlippageBps > 500) {
    return { allowed: false, reason: 'Configured slippage cap must be between 0 and 500 basis points.' }
  }
  if (!Number.isInteger(intent.maxSlippageBps) || intent.maxSlippageBps < 0 ||
      intent.maxSlippageBps > config.maxSlippageBps) {
    return { allowed: false, reason: `Requested slippage exceeds the configured ${config.maxSlippageBps} bps cap.` }
  }
  const router = config.swapRouterAddress
  if (!router || !config.allowedSwapRouters.has(router)) {
    return { allowed: false, reason: 'Swap router is not configured and allow-listed.' }
  }

  try {
    const tokenIn = getToken(intent.from.token, intent.chainId)
    const tokenOut = getToken(intent.to.token, intent.chainId)
    const amountIn = parseUnits(intent.from.amount, tokenIn.decimals)
    if (!config.maxSwapInputAmount) {
      return { allowed: false, reason: 'MAX_SWAP_INPUT_AMOUNT must be configured before swaps are enabled.' }
    }
    if (!config.maxSwapPerTokenPerDay) {
      return { allowed: false, reason: 'MAX_SWAP_PER_TOKEN_PER_DAY must be configured before swaps are enabled.' }
    }
    if (amountIn > parseUnits(config.maxSwapInputAmount, tokenIn.decimals)) {
      return { allowed: false, reason: 'Swap input exceeds the configured per-transaction cap.' }
    }
    if (amountIn <= 0n || tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) {
      return { allowed: false, reason: 'Swap tokens or input amount are invalid.' }
    }
    const routerContract = new Contract(router, swapRouterAbi, provider)
    const amounts = await routerContract.getAmountsOut(amountIn, [tokenIn.address, tokenOut.address])
    const quotedAmountOut = BigInt(amounts[amounts.length - 1])
    const built = buildSwapTransactions(intent, {
      routerAddress: router,
      recipient,
      quotedAmountOut,
      maxSlippageBps: intent.maxSlippageBps,
    })
    const authorization = issueGuardAuthorization({
      chainId: intent.chainId,
      intentId: intent.intentId,
      recipient: getAddress(recipient),
      valueWei: '0',
      transactionTo: built.swap.to,
      transactionData: built.swap.data,
    })
    return {
      allowed: true,
      reason: 'Router, tokens, chain, quote, and slippage policy checks passed.',
      authorization,
      valueWei: amountIn.toString(),
      swap: built,
    }
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? `Swap quote or validation failed: ${error.message}` : 'Swap quote or validation failed.',
    }
  }
}

function evaluateNativeTransfer(intent, config) {
  if (intent.action !== 'transfer' || intent.from.token !== 'ETH') {
    return { allowed: false, reason: 'Only native ETH transfers are enabled by this signer.' }
  }
  if (intent.chainId !== config.chainId) {
    return { allowed: false, reason: 'Intent chain ID does not match the configured chain.' }
  }

  let recipient
  try {
    recipient = getAddress(intent.recipient)
  } catch {
    return { allowed: false, reason: 'Recipient address is invalid.' }
  }
  if (!config.allowedRecipients.has(recipient)) {
    return { allowed: false, reason: 'Recipient is not allow-listed.' }
  }

  const valueWei = parsePositiveWei(intent.from.amount)
  if (valueWei === null) {
    return { allowed: false, reason: 'Transfer amount is invalid.' }
  }
  if (valueWei > config.maxPerTxWei) {
    return { allowed: false, reason: 'Transfer exceeds the per-transaction cap.' }
  }
  if (config.maxTxPerWindow < 1 || config.velocityWindowSeconds < 1 ||
      config.maxPerRecipientPerDayWei <= 0n) {
    return { allowed: false, reason: 'Transfer policy limits are not configured safely.' }
  }

  const authorization = issueGuardAuthorization({
    chainId: intent.chainId,
    intentId: intent.intentId,
    recipient,
    valueWei: valueWei.toString(),
  })
  return {
    allowed: true,
    reason: 'Recipient, chain, and per-transaction policy checks passed.',
    authorization,
    valueWei: valueWei.toString(),
  }
}

// Export the new function here
export { evaluateNativeTransfer, evaluateSwap, evaluateReadOnly, parsePositiveWei, readPolicyConfig }
import { Contract, JsonRpcProvider, Wallet, parseEther, parseUnits } from 'ethers'
import { verifyGuardAuthorization } from '../guard/guard-auth.tsx'
import { buildErc20Approval, buildNativeTransfer, routerInterface } from '../chain/transaction-builder.tsx'
import { getToken } from '../chain/token-registry.tsx'
import { readPolicyConfig } from '../guard/policy-engine.tsx'
import { simulateShadowFork } from '../chain/simulator.tsx'
import { checkIntentOutcome } from '../guard/intent-outcome-checker.tsx'
import { transactionDigest, verifyTransactionDigest, computeApprovalDigest } from './approval-digest.tsx'
import { requireKillSwitchOff } from '../guard/autonomy-manager.tsx'
import { nextNonce, resetNonceCache } from './nonce-manager.tsx'
import type { TxRequest } from '../chain/transaction-builder.tsx'

let provider: JsonRpcProvider | undefined
let wallet: Wallet | undefined
let sendQueue = Promise.resolve()

export function getSigner(ctx?: any) {
  if (ctx?.provider && ctx?.wallet) return { provider: ctx.provider, wallet: ctx.wallet }
  
  if (!process.env.AGENT_KEY) throw new Error('AGENT_KEY is not configured; refusing to sign')
  if (!process.env.RPC_URL) throw new Error('RPC_URL is not configured; refusing to sign')
  if (!provider) {
    provider = new JsonRpcProvider(process.env.RPC_URL)
    wallet = new Wallet(process.env.AGENT_KEY, provider)
  }
  return { provider, wallet }
}

export function getSignerAddress() {
  if (!process.env.AGENT_KEY) throw new Error('AGENT_KEY is not configured')
  return new Wallet(process.env.AGENT_KEY).address
}

// ------------------ Original Transfer/Swap Validations ------------------

function validateAuthorizedSwap(intent: any, authorization: any, signerAddress: string, chainId: number, config: any) {
  const router = config.swapRouterAddress
  if (!router || !config.allowedSwapRouters.has(router)) {
    throw new Error('Swap router is not configured and allow-listed')
  }
  if (chainId !== config.chainId || chainId !== intent.chainId) {
    throw new Error('Connected chain ID does not match the configured policy chain')
  }
  if (!intent.to?.token || !intent.from.amount || !Number.isInteger(intent.maxSlippageBps) ||
      intent.maxSlippageBps < 0 || intent.maxSlippageBps > config.maxSlippageBps) {
    throw new Error('Swap intent exceeds configured policy')
  }
  const tokenIn = getToken(intent.from.token, chainId)
  const tokenOut = getToken(intent.to.token, chainId)
  const amountIn = parseUnits(intent.from.amount, tokenIn.decimals)
  if (!config.maxSwapInputAmount || amountIn > parseUnits(config.maxSwapInputAmount, tokenIn.decimals)) {
    throw new Error('Swap input exceeds the configured per-transaction cap')
  }
  if (typeof authorization?.transactionData !== 'string' || authorization.transactionData.length > 4096) {
    throw new Error('Authorized swap calldata is invalid')
  }
  const parsed = routerInterface.parseTransaction({ data: authorization.transactionData })
  if (!parsed || parsed.name !== 'swapExactTokensForTokens') {
    throw new Error('Authorized swap calldata is invalid')
  }
  const [authorizedAmount, minAmountOut, path, recipient, deadline] = parsed.args
  if (authorization.transactionTo?.toLowerCase() !== router.toLowerCase() ||
      authorization.recipient?.toLowerCase() !== signerAddress.toLowerCase() ||
      BigInt(authorizedAmount) !== amountIn ||
      path.length !== 2 ||
      path[0].toLowerCase() !== tokenIn.address.toLowerCase() ||
      path[1].toLowerCase() !== tokenOut.address.toLowerCase() ||
      recipient.toLowerCase() !== signerAddress.toLowerCase() ||
      BigInt(minAmountOut) <= 0n ||
      Number(deadline) <= Math.floor(Date.now() / 1000)) {
    throw new Error('Authorized swap does not match the intent or configured policy')
  }
  const authorizationPayload = {
    chainId,
    intentId: intent.intentId,
    recipient: signerAddress,
    valueWei: '0',
    transactionTo: router,
    transactionData: authorization.transactionData,
  }
  if (!verifyGuardAuthorization(authorization, authorizationPayload)) {
    throw new Error('Guard authorization is invalid or expired')
  }
  return { router, tokenIn, tokenOut, amountIn, minAmountOut: BigInt(minAmountOut) }
}

// ------------------ Original Native Transfer ------------------

export function sendAuthorizedNativeTransfer(intent: any, authorization: any) {
  requireKillSwitchOff()
  const operation = sendQueue.then(async () => {
    const tx = buildNativeTransfer(intent)
    const authPayload = {
      chainId: intent.chainId,
      intentId: intent.intentId,
      recipient: tx.to,
      valueWei: tx.value.toString(),
    }
    if (!verifyGuardAuthorization(authorization, authPayload)) {
      throw new Error('Guard authorization is invalid or expired')
    }

    const { provider: rpc, wallet: signer } = getSigner()
    const network = await rpc.getNetwork()
    const chainId = Number(network.chainId)
    
    const nonce = await nextNonce(rpc, signer)
    const expiresAt = authorization.expiresAt
    const digest = transactionDigest({
      chainId, to: tx.to, value: tx.value, data: tx.data, nonce, expiresAt,
    })

    if (authorization.approvedDigest) {
      const isValid = verifyTransactionDigest(authorization.approvedDigest, {
        chainId, to: tx.to, value: tx.value, data: tx.data, nonce, expiresAt
      })
      if (!isValid) throw new Error('Security Alert: Transaction digest mismatch!')
    }

    const balance = await rpc.getBalance(signer.address)
    const maxBalance = process.env.MAX_AGENT_BALANCE
    if (maxBalance && balance > parseEther(maxBalance)) {
      throw new Error('Signer balance exceeds the configured hard balance ceiling')
    }

    const response = await signer.sendTransaction({
      ...tx, chainId, nonce, gasLimit: 21000,
    })
    const receipt = await response.wait()
    if (!receipt || receipt.status !== 1) throw new Error('Transaction was not confirmed successfully')
    return { txHash: receipt.hash, status: 'confirmed', digest }
  })

  operation.catch(() => resetNonceCache())
  sendQueue = operation.then(() => undefined, () => undefined)
  return operation
}

// ------------------ Original Swap Execution ------------------

export function sendAuthorizedSwap(intent: any, authorization: any) {
  requireKillSwitchOff()
  const operation = sendQueue.then(async () => {
    const { provider: rpc, wallet: signer } = getSigner()
    const config = readPolicyConfig()
    const network = await rpc.getNetwork()
    const chainId = Number(network.chainId)
    const swap = validateAuthorizedSwap(intent, authorization, signer.address, chainId, config)
    const { router, tokenIn, amountIn, minAmountOut } = swap

    const allowanceContract = new Contract(
      tokenIn.address,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      rpc,
    )
    let allowance = BigInt(await allowanceContract.allowance(signer.address, router))
    const digests = []
    
    const sendApproval = async ({ to, value, data }: any) => {
      const nonce = await nextNonce(rpc, signer)
      const digest = transactionDigest({
        chainId, to, value, data, nonce, expiresAt: authorization.expiresAt,
      })
      if (authorization.approvedApprovalDigest) {
         const isValid = verifyTransactionDigest(authorization.approvedApprovalDigest, {
           chainId, to, value, data, nonce, expiresAt: authorization.expiresAt
         })
         if (!isValid) throw new Error('Security Alert: Approval digest mismatch!')
      }
      const response = await signer.sendTransaction({ to, value, data, chainId, nonce })
      const receipt = await response.wait()
      if (!receipt || receipt.status !== 1) throw new Error('ERC-20 approval was not confirmed')
      digests.push(digest)
    }
    
    if (allowance < amountIn) {
      const approvals = [
        ...(allowance > 0n ? [buildErc20Approval(tokenIn.address, router, 0n)] : []),
        buildErc20Approval(tokenIn.address, router, amountIn),
      ]
      for (const approval of approvals) {
        await sendApproval(approval)
      }
      allowance = BigInt(await allowanceContract.allowance(signer.address, router))
      if (allowance < amountIn) throw new Error('ERC-20 approval did not grant the exact required allowance')
    }

    const nonce = await nextNonce(rpc, signer)
    const digest = transactionDigest({
      chainId, to: router, value: 0n, data: authorization.transactionData, nonce, expiresAt: authorization.expiresAt,
    })

    if (authorization.approvedDigest) {
      const isValid = verifyTransactionDigest(authorization.approvedDigest, {
        chainId, to: router, value: 0n, data: authorization.transactionData, nonce, expiresAt: authorization.expiresAt
      })
      if (!isValid) throw new Error('Security Alert: Swap digest mismatch!')
    }

    const response = await signer.sendTransaction({
      to: router, value: 0n, data: authorization.transactionData, chainId, nonce,
    })
    const receipt = await response.wait()
    if (!receipt || receipt.status !== 1) throw new Error('Swap transaction was not confirmed successfully')
    return {
      txHash: receipt.hash, status: 'confirmed', digest, approvalDigests: digests,
      amountIn: amountIn.toString(), minAmountOut: BigInt(minAmountOut).toString(), logs: receipt.logs,
    }
  })
  operation.catch(() => resetNonceCache())
  sendQueue = operation.then(() => undefined, () => undefined)
  return operation
}

// ------------------ Original Shadow Simulation ------------------

export async function simulateAuthorizedSwap(intent: any, authorization: any) {
  requireKillSwitchOff()
  const forkUrl = process.env.SHADOW_RPC_URL
  if (!forkUrl) throw new Error('SHADOW_RPC_URL must point to a local Anvil fork before swaps can execute')
  const signerAddress = getSignerAddress()
  const config = readPolicyConfig()
  const fork = new JsonRpcProvider(forkUrl)
  
  try {
    const network = await fork.getNetwork()
    const swap = validateAuthorizedSwap(intent, authorization, signerAddress, Number(network.chainId), config)
    
    const allowanceContract = new Contract(swap.tokenIn.address, ['function allowance(address owner, address spender) view returns (uint256)'], fork)
    const allowance = BigInt(await allowanceContract.allowance(signerAddress, swap.router))
    const approvals = allowance < swap.amountIn 
      ? [...(allowance > 0n ? [buildErc20Approval(swap.tokenIn.address, swap.router, 0n)] : []), buildErc20Approval(swap.tokenIn.address, swap.router, swap.amountIn)]
      : []

    const simulation = await simulateShadowFork(
      fork, signerAddress,
      [...approvals, { to: swap.router, value: 0n, data: authorization.transactionData }],
      { accounts: [signerAddress], tokenAddresses: [swap.tokenIn.address, swap.tokenOut.address] }
    )
    
    if (!simulation.success) throw new Error(`Shadow-fork simulation failed: ${simulation.error}`)
    
    const balanceKey = `${swap.tokenOut.address.toLowerCase()}:${signerAddress.toLowerCase()}`
    const inputKey = `${swap.tokenIn.address.toLowerCase()}:${signerAddress.toLowerCase()}`
    const outputDelta = BigInt(simulation.balanceDeltas[balanceKey] ?? 0n)
    const inputDelta = BigInt(simulation.balanceDeltas[inputKey] ?? 0n)
    
    const outcome = {
      success: true,
      amountSent: inputDelta < 0n ? -inputDelta : 0n,
      expectedAmountSent: swap.amountIn,
      tokenReceived: intent.to.token,
      amountReceived: outputDelta > 0n ? outputDelta : 0n,
      minAmountOut: swap.minAmountOut,
      expectedRouter: swap.router,
      maxApprovalAmount: swap.amountIn,
      approvals: simulation.events
        .filter((event: any) => event.type === 'Approval' && event.owner.toLowerCase() === signerAddress.toLowerCase())
        .map((event: any) => ({ spender: event.spender, amount: event.value })),
      contractsCalled: simulation.calledAddresses,
    }
    
    const comparison = checkIntentOutcome(intent, outcome)
    if (!comparison.passed) throw new Error(`Intent/outcome check failed: ${comparison.reasons.join('; ')}`)
    
    return { ...simulation, comparison, amountIn: swap.amountIn.toString(), minAmountOut: swap.minAmountOut.toString() }
  } finally {
    await fork.destroy()
  }
}

// ------------------ NEW P2 FUNCTIONS FOR GUARD PIPELINE ------------------

export async function sendAuthorized(txRequests: TxRequest[], authorization: any, ctx: any) {
  requireKillSwitchOff()
  const { provider: rpc, wallet: signer } = getSigner(ctx)
  
  let lastTxHash = ''
  let nonce = await nextNonce(rpc, signer)

  for (const tx of txRequests) {
    const response = await signer.sendTransaction({
      to: tx.to, value: tx.value, data: tx.data, nonce: nonce,
    })
    const receipt = await response.wait()
    if (!receipt || receipt.status !== 1) throw new Error(`Transaction failed: ${tx.description}`)
    lastTxHash = receipt.hash
    nonce++
  }
  return { txHash: lastTxHash, status: 'confirmed' }
}

export async function sendApproved(payload: { txRequests: TxRequest[], approval: any }, ctx: any) {
  requireKillSwitchOff()
  const { txRequests, approval } = payload
  const { provider: rpc, wallet: signer } = getSigner(ctx)

  if (!Number.isInteger(approval.chainId)) {
    throw new Error('Approval is missing its authorized chain ID.')
  }
  if (Date.now() > approval.expiresAt) {
    throw new Error('Security Alert: Approval has expired.')
  }

  const network = await rpc.getNetwork()
  if (Number(network.chainId) !== approval.chainId) {
    throw new Error(`Approval chain mismatch: expected ${approval.chainId}, connected to ${network.chainId}.`)
  }

  const currentDigest = computeApprovalDigest(txRequests, approval.expiresAt, approval.chainId)
  if (currentDigest !== approval.digest) {
    throw new Error('Security Alert: Transaction digest mismatch! Possible tampering.')
  }

  let lastTxHash = ''
  let nonce = await nextNonce(rpc, signer)

  for (const tx of txRequests) {
    const response = await signer.sendTransaction({
      to: tx.to, value: tx.value, data: tx.data, nonce: nonce,
    })
    const receipt = await response.wait()
    if (!receipt || receipt.status !== 1) throw new Error(`Transaction failed: ${tx.description}`)
    lastTxHash = receipt.hash
    nonce++
  }
  return { txHash: lastTxHash, status: 'confirmed' }
}
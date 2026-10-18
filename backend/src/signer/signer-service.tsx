import { Contract, JsonRpcProvider, Wallet, parseEther, parseUnits } from 'ethers'
import { verifyGuardAuthorization } from '../guard/guard-auth.tsx'
import { buildErc20Approval, buildNativeTransfer, routerInterface } from '../chain/transaction-builder.tsx'
import { getToken } from '../chain/token-registry.tsx'
import { evaluateNativeTransfer, readPolicyConfig } from '../guard/policy-engine.tsx'
import { routeTier } from '../guard/tier-router.tsx'
import { simulateShadowFork } from '../chain/simulator.tsx'
import { checkIntentOutcome } from '../guard/intent-outcome-checker.tsx'
import { transactionDigest, verifyTransactionDigest } from './approval-digest.tsx'
import { getLevel, requireKillSwitchOff } from '../guard/autonomy-manager.tsx'
import { nextNonce, resetNonceCache } from './nonce-manager.tsx'
import { getDatabase } from '../db/connection.tsx'
import { policyWithVerifiedSupplierRecipients } from '../db/repositories/suppliers.repository.tsx'

let provider
let wallet
let sendQueue = Promise.resolve()

function assertNativeAutoExecutable(intent, policy, hasHumanApproval = false) {
  const decision = evaluateNativeTransfer(intent, policy)
  if (!decision.allowed) {
    throw new Error(`Signer re-verification rejected transfer: ${decision.reason}`)
  }
  const tier = routeTier({
    intent,
    allowedRecipients: policy.allowedRecipients,
    allowedContracts: policy.allowedContracts,
    maxPerTxWei: policy.maxPerTxWei,
    valueWei: BigInt(decision.valueWei),
    riskScore: 0,
    forbiddenPatterns: [],
    autonomyLevel: getLevel(),
  })
  if (tier.tier !== 'T1' && !(tier.tier === 'T2' && hasHumanApproval)) {
    throw new Error(`Signer re-verification requires ${tier.tier}: ${tier.reasons.join('; ')}`)
  }
  return tier
}

function assertSwapAutoExecutable(intent, swap, policy) {
  const cap = parseUnits(policy.maxSwapInputAmount, swap.tokenIn.decimals)
  const tier = routeTier({
    intent,
    allowedRecipients: policy.allowedRecipients,
    allowedContracts: new Set([...policy.allowedContracts, ...policy.allowedSwapRouters]),
    targetContract: swap.router,
    maxPerTxWei: cap,
    valueWei: swap.amountIn,
    riskScore: 0,
    forbiddenPatterns: [],
    autonomyLevel: getLevel(),
  })
  if (tier.tier !== 'T1') {
    throw new Error(`Signer re-verification requires ${tier.tier}: ${tier.reasons.join('; ')}`)
  }
}

function getSigner() {
  if (!process.env.AGENT_KEY) {
    throw new Error('AGENT_KEY is not configured; refusing to sign')
  }
  if (!process.env.RPC_URL) {
    throw new Error('RPC_URL is not configured; refusing to sign')
  }
  if (!provider) {
    provider = new JsonRpcProvider(process.env.RPC_URL)
    wallet = new Wallet(process.env.AGENT_KEY, provider)
  }
  return { provider, wallet }
}

function getSignerAddress() {
  if (!process.env.AGENT_KEY) {
    throw new Error('AGENT_KEY is not configured; refusing to authorize a swap')
  }
  return new Wallet(process.env.AGENT_KEY).address
}

function validateAuthorizedSwap(intent, authorization, signerAddress, chainId, config) {
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
  return {
    router,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut: BigInt(minAmountOut),
  }
}

async function getSwapApprovalTransactions(provider, signerAddress, swap) {
  const allowanceContract = new Contract(
    swap.tokenIn.address,
    ['function allowance(address owner, address spender) view returns (uint256)'],
    provider,
  )
  const allowance = BigInt(await allowanceContract.allowance(signerAddress, swap.router))
  if (allowance >= swap.amountIn) return []
  return [
    ...(allowance > 0n ? [buildErc20Approval(swap.tokenIn.address, swap.router, 0n)] : []),
    buildErc20Approval(swap.tokenIn.address, swap.router, swap.amountIn),
  ]
}

async function simulateAuthorizedSwap(intent, authorization) {
  requireKillSwitchOff()
  const forkUrl = process.env.SHADOW_RPC_URL
  if (!forkUrl) throw new Error('SHADOW_FORK_RPC_URL must point to a local Anvil fork before swaps can execute')
  const signerAddress = getSignerAddress()
  const config = readPolicyConfig()
  const fork = new JsonRpcProvider(forkUrl)
  try {
    const network = await fork.getNetwork()
    const swap = validateAuthorizedSwap(intent, authorization, signerAddress, Number(network.chainId), config)
    const approvals = await getSwapApprovalTransactions(fork, signerAddress, swap)
    const simulation = await simulateShadowFork(
      fork,
      signerAddress,
      [...approvals, {
        to: swap.router,
        value: 0n,
        data: authorization.transactionData,
      }],
      {
        accounts: [signerAddress],
        tokenAddresses: [swap.tokenIn.address, swap.tokenOut.address],
      },
    )
    if (!simulation.success) {
      throw new Error(`Shadow-fork simulation failed: ${simulation.error}`)
    }
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
        .filter((event) => event.type === 'Approval' && event.owner.toLowerCase() === signerAddress.toLowerCase())
        .map((event) => ({ spender: event.spender, amount: event.value })),
      contractsCalled: simulation.calledAddresses,
    }
    const comparison = checkIntentOutcome(intent, outcome)
    if (!comparison.passed) {
      throw new Error(`Intent/outcome check failed: ${comparison.reasons.join('; ')}`)
    }
    return { ...simulation, comparison, amountIn: swap.amountIn.toString(), minAmountOut: swap.minAmountOut.toString() }
  } finally {
    await fork.destroy()
  }
}

function sendAuthorizedNativeTransfer(intent, authorization) {
  requireKillSwitchOff()
  const operation = sendQueue.then(async () => {
    requireKillSwitchOff()
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
    if (chainId !== Number(process.env.CHAIN_ID || 31337) || chainId !== intent.chainId) {
      throw new Error('Connected chain ID does not match the configured policy chain')
    }
    const policy = await policyWithVerifiedSupplierRecipients(getDatabase(), readPolicyConfig())
    const tier = assertNativeAutoExecutable(intent, policy, typeof authorization.approvedDigest === 'string')

    const nonce = await nextNonce(rpc, signer)
    const expiresAt = authorization.expiresAt
    const digest = transactionDigest({
      chainId,
      to: tx.to,
      value: tx.value,
      data: tx.data,
      nonce,
      expiresAt,
    })

    // --- Digest Verify check ---
    if (tier.tier === 'T2' && !authorization.approvedDigest) {
      throw new Error('Signer re-verification requires a human-approved transaction digest')
    }
    if (authorization.approvedDigest) {
      const isValid = verifyTransactionDigest(authorization.approvedDigest, {
        chainId, to: tx.to, value: tx.value, data: tx.data, nonce, expiresAt
      })
      if (!isValid) {
        throw new Error('Security Alert: Transaction digest mismatch! Possible tampering detected.')
      }
    }
    // ---------------------------------

    const balance = await rpc.getBalance(signer.address)
    const maxBalance = process.env.MAX_AGENT_BALANCE
    if (maxBalance && balance > parseEther(maxBalance)) {
      throw new Error('Signer balance exceeds the configured hard balance ceiling')
    }

    requireKillSwitchOff()
    if (!verifyGuardAuthorization(authorization, authPayload)) {
      throw new Error('Guard authorization expired or changed before signing')
    }
    if (Number((await rpc.getNetwork()).chainId) !== chainId) {
      throw new Error('Connected chain changed before signing')
    }
    const finalTier = assertNativeAutoExecutable(
      intent,
      await policyWithVerifiedSupplierRecipients(getDatabase(), readPolicyConfig()),
      typeof authorization.approvedDigest === 'string',
    )
    if (finalTier.tier === 'T2' && !authorization.approvedDigest) {
      throw new Error('Signer re-verification requires a human-approved transaction digest')
    }
    if (Number(await rpc.getTransactionCount(signer.address, 'pending')) !== nonce) {
      throw new Error('Signer nonce changed after approval; transaction must be reviewed again')
    }
    const response = await signer.sendTransaction({
      ...tx,
      chainId,
      nonce,
      gasLimit: 21000,
    })
    const receipt = await response.wait()
    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction was not confirmed successfully')
    }
    return { txHash: receipt.hash, status: 'confirmed', digest }
  })

  operation.catch(() => {
    resetNonceCache()
  })
  sendQueue = operation.then(() => undefined, () => undefined)
  return operation
}

function sendAuthorizedSwap(intent, authorization) {
  requireKillSwitchOff()
  const operation = sendQueue.then(async () => {
    requireKillSwitchOff()
    const { provider: rpc, wallet: signer } = getSigner()
    const config = readPolicyConfig()
    const network = await rpc.getNetwork()
    const chainId = Number(network.chainId)
    const swap = validateAuthorizedSwap(intent, authorization, signer.address, chainId, config)
    const { router, tokenIn, amountIn, minAmountOut } = swap
    assertSwapAutoExecutable(intent, swap, config)

    const allowanceContract = new Contract(
      tokenIn.address,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      rpc,
    )
    let allowance = BigInt(await allowanceContract.allowance(signer.address, router))
    const digests = []
    const approvalTxHashes = []
    
    const sendApproval = async ({ to, value, data }) => {
      requireKillSwitchOff()
      const currentConfig = readPolicyConfig()
      const currentSwap = validateAuthorizedSwap(intent, authorization, signer.address, Number((await rpc.getNetwork()).chainId), currentConfig)
      assertSwapAutoExecutable(intent, currentSwap, currentConfig)
      const nonce = await nextNonce(rpc, signer)
      const digest = transactionDigest({
        chainId, to, value, data, nonce, expiresAt: authorization.expiresAt,
      })

      // ---Digest Verify check(Approval) ---
      if (authorization.approvedApprovalDigest) {
         const isValid = verifyTransactionDigest(authorization.approvedApprovalDigest, {
           chainId, to, value, data, nonce, expiresAt: authorization.expiresAt
         })
         if (!isValid) throw new Error('Security Alert: Approval digest mismatch!')
      }
      // -----------------------------------------

      if (Number(await rpc.getTransactionCount(signer.address, 'pending')) !== nonce) {
        throw new Error('Signer nonce changed before ERC-20 approval could be sent')
      }
      requireKillSwitchOff()
      const response = await signer.sendTransaction({
        to, value, data, chainId, nonce,
      })
      const receipt = await response.wait()
      if (!receipt || receipt.status !== 1) throw new Error('ERC-20 approval was not confirmed')
      digests.push(digest)
      approvalTxHashes.push(receipt.hash)
    }
    
    if (allowance < amountIn) {
      for (const approval of await getSwapApprovalTransactions(rpc, signer.address, swap)) {
        await sendApproval(approval)
      }
      allowance = BigInt(await allowanceContract.allowance(signer.address, router))
      if (allowance < amountIn) throw new Error('ERC-20 approval did not grant the exact required allowance')
    }

    const nonce = await nextNonce(rpc, signer)
    const digest = transactionDigest({
      chainId,
      to: router,
      value: 0n,
      data: authorization.transactionData,
      nonce,
      expiresAt: authorization.expiresAt,
    })

    // --- Digest Verify check---
    if (authorization.approvedDigest) {
      const isValid = verifyTransactionDigest(authorization.approvedDigest, {
        chainId, to: router, value: 0n, data: authorization.transactionData, nonce, expiresAt: authorization.expiresAt
      })
      if (!isValid) {
        throw new Error('Security Alert: Swap digest mismatch! Possible tampering detected.')
      }
    }
    // -----------------------------------------

    requireKillSwitchOff()
    const finalConfig = readPolicyConfig()
    const finalSwap = validateAuthorizedSwap(intent, authorization, signer.address, Number((await rpc.getNetwork()).chainId), finalConfig)
    assertSwapAutoExecutable(intent, finalSwap, finalConfig)
    if (finalSwap.router.toLowerCase() !== router.toLowerCase() ||
        finalSwap.amountIn !== amountIn ||
        finalSwap.minAmountOut !== minAmountOut ||
        !verifyGuardAuthorization(authorization, {
          chainId,
          intentId: intent.intentId,
          recipient: signer.address,
          valueWei: '0',
          transactionTo: router,
          transactionData: authorization.transactionData,
        })) {
      throw new Error('Swap authorization changed before signing')
    }
    if (Number(await rpc.getTransactionCount(signer.address, 'pending')) !== nonce) {
      throw new Error('Signer nonce changed after swap approval; transaction must be reviewed again')
    }
    const response = await signer.sendTransaction({
      to: router,
      value: 0n,
      data: authorization.transactionData,
      chainId,
      nonce,
    })
    const receipt = await response.wait()
    if (!receipt || receipt.status !== 1) throw new Error('Swap transaction was not confirmed successfully')
    return {
      txHash: receipt.hash,
      status: 'confirmed',
      digest,
      approvalDigests: digests,
      approvalTxHashes,
      amountIn: amountIn.toString(),
      minAmountOut: BigInt(minAmountOut).toString(),
      logs: receipt.logs,
    }
  })
  operation.catch(() => resetNonceCache())
  sendQueue = operation.then(() => undefined, () => undefined)
  return operation
}

export {
  assertNativeAutoExecutable,
  assertSwapAutoExecutable,
  getSigner,
  getSignerAddress,
  sendAuthorizedNativeTransfer,
  sendAuthorizedSwap,
  simulateAuthorizedSwap,
}
import { JsonRpcProvider, Wallet, parseEther } from 'ethers'
import { verifyGuardAuthorization } from '../guard/guard-auth.tsx'
import { buildNativeTransfer } from '../chain/transaction-builder.tsx'
import { transactionDigest } from './approval-digest.tsx'
import { requireKillSwitchOff } from '../guard/autonomy-manager.tsx'
import { nextNonce, resetNonceCache } from './nonce-manager.tsx'

let provider
let wallet
let sendQueue = Promise.resolve()

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

function sendAuthorizedNativeTransfer(intent, authorization) {
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
    if (chainId !== Number(process.env.CHAIN_ID || 31337) || chainId !== intent.chainId) {
      throw new Error('Connected chain ID does not match the configured policy chain')
    }

    // Use Nonce Manager to avoid duplicate nonces
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
    const balance = await rpc.getBalance(signer.address)
    const maxBalance = process.env.MAX_AGENT_BALANCE
    if (maxBalance && balance > parseEther(maxBalance)) {
      throw new Error('Signer balance exceeds the configured hard balance ceiling')
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

  // If the operation fails, reset the nonce cache
  operation.catch(() => {
    resetNonceCache()
  })
  sendQueue = operation.then(() => undefined, () => undefined)
  return operation
}

export { sendAuthorizedNativeTransfer }
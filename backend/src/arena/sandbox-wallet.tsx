import { JsonRpcProvider, Wallet } from 'ethers'

const SANDBOX_RPC_URL = process.env.ARENA_SANDBOX_RPC_URL || 'http://127.0.0.1:8547'
const SANDBOX_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' // Anvil Default

export function getSandboxContext() {
  const provider = new JsonRpcProvider(SANDBOX_RPC_URL)
  const wallet = new Wallet(SANDBOX_KEY, provider)
  return { provider, wallet, signerAddress: wallet.address }
}
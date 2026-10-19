import 'dotenv/config'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const forkUrl = process.env.ANVIL_FORK_URL || process.env.RPC_URL
if (!forkUrl) {
  throw new Error('Set RPC_URL or ANVIL_FORK_URL to the upstream RPC endpoint to start a forked Anvil node.')
}

const shadowRpcUrl = new URL(process.env.SHADOW_RPC_URL || 'http://127.0.0.1:8545')
if (shadowRpcUrl.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(shadowRpcUrl.hostname) ||
    shadowRpcUrl.username || shadowRpcUrl.password ||
    (shadowRpcUrl.pathname !== '/' && shadowRpcUrl.pathname !== '') ||
    shadowRpcUrl.search || shadowRpcUrl.hash) {
  throw new Error('SHADOW_RPC_URL must be a local HTTP URL without a path, query, or credentials.')
}

const chainId = Number(process.env.CHAIN_ID || 31337)
if (!Number.isSafeInteger(chainId) || chainId <= 0) {
  throw new Error('CHAIN_ID must be a positive safe integer to start the fork.')
}

const anvilPath = fileURLToPath(new URL('../node_modules/@foundry-rs/anvil/bin.mjs', import.meta.url))
const anvil = spawn(process.execPath, [
  anvilPath,
  '--quiet',
  '--host', shadowRpcUrl.hostname === '[::1]' ? '::1' : shadowRpcUrl.hostname,
  '--port', String(shadowRpcUrl.port || 80),
  '--chain-id', String(chainId),
  '--fork-url', forkUrl,
], { stdio: 'inherit', env: process.env })

console.log(`Starting local Anvil fork at ${shadowRpcUrl.hostname}:${shadowRpcUrl.port || 80} for chain ${chainId}.`)

anvil.on('error', (error) => {
  console.error('Failed to start Anvil fork:', error.message)
  process.exitCode = 1
})
anvil.on('exit', (code, signal) => {
  if (signal) {
    process.exitCode = signal === 'SIGINT' ? 130 : 143
  } else {
    process.exitCode = code ?? 1
  }
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => anvil.kill(signal))
}

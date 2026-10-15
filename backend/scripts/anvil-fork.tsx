import 'dotenv/config'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const forkUrl = process.env.ANVIL_FORK_URL
if (!forkUrl) {
  throw new Error('Set ANVIL_FORK_URL to the upstream RPC endpoint to start a forked Anvil node.')
}

const anvilPath = fileURLToPath(new URL('../node_modules/@foundry-rs/anvil/bin.mjs', import.meta.url))
const anvil = spawn(process.execPath, [
  anvilPath,
  '--host', '127.0.0.1',
  '--port', '8545',
  '--chain-id', '31337',
  '--fork-url', forkUrl,
], { stdio: 'inherit', env: process.env })

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

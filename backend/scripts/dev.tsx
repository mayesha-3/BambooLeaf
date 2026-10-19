import 'dotenv/config'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const tsxPath = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url))
const shadowRpcUrl = process.env.SHADOW_RPC_URL
let forkProcess: ChildProcess | undefined
let apiProcess: ChildProcess | undefined
let shuttingDown = false

function isLocalRpc(value: string | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

async function readChainId(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok) return null
    const payload = await response.json() as { result?: string }
    return payload.result?.toLowerCase() ?? null
  } catch {
    return null
  }
}

function expectedChainId() {
  const chainId = Number(process.env.CHAIN_ID || 31337)
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('CHAIN_ID must be a positive safe integer for the development shadow fork.')
  }
  return `0x${BigInt(chainId).toString(16)}`
}

async function ensureShadowFork(url: string) {
  const expected = expectedChainId()
  const existingChainId = await readChainId(url)
  if (existingChainId) {
    if (existingChainId !== expected) {
      throw new Error(`An RPC is already listening at SHADOW_RPC_URL with chain ID ${existingChainId}; expected ${expected}.`)
    }
    console.log('Using the existing local shadow fork.')
    return
  }

  forkProcess = spawn(process.execPath, [tsxPath, 'scripts/anvil-fork.tsx'], {
    stdio: 'inherit',
    env: process.env,
  })
  let spawnError: Error | undefined
  forkProcess.once('error', (error) => { spawnError = error })

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`Unable to start the local shadow fork: ${spawnError.message}`)
    if (forkProcess.exitCode !== null || forkProcess.signalCode !== null) {
      throw new Error('The local shadow fork exited before becoming ready. Check its startup output and upstream RPC configuration.')
    }
    const chainId = await readChainId(url)
    if (chainId) {
      if (chainId !== expected) {
        throw new Error(`The local shadow fork reported chain ID ${chainId}; expected ${expected}.`)
      }
      console.log('Local shadow fork is ready.')
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('The local shadow fork did not become ready within 90 seconds.')
}

function stopChildren(signal: NodeJS.Signals) {
  shuttingDown = true
  if (apiProcess && apiProcess.exitCode === null) apiProcess.kill(signal)
  if (forkProcess && forkProcess.exitCode === null) forkProcess.kill(signal)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => stopChildren(signal))
}

if (isLocalRpc(shadowRpcUrl)) {
  try {
    await ensureShadowFork(shadowRpcUrl)
  } catch (error) {
    console.error(`Shadow fork is unavailable; swap simulation will fail closed. ${error instanceof Error ? error.message : 'Unknown startup error'}`)
    if (forkProcess && forkProcess.exitCode === null) forkProcess.kill('SIGTERM')
    forkProcess = undefined
    throw error
  }
} else {
  console.warn('SHADOW_RPC_URL is not a local HTTP endpoint; automatic Anvil startup is disabled.')
}

if (shuttingDown) process.exit(130)

apiProcess = spawn(process.execPath, [tsxPath, 'watch', 'src/server.tsx'], {
  stdio: 'inherit',
  env: process.env,
})
apiProcess.once('error', (error) => {
  console.error('Unable to start the backend API watcher:', error.message)
  stopChildren('SIGTERM')
  process.exitCode = 1
})
apiProcess.once('exit', (code, signal) => {
  if (forkProcess && forkProcess.exitCode === null) forkProcess.kill(signal || 'SIGTERM')
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1)
})

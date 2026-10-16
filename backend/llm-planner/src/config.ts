// Config parsing. Everything comes from environment variables; nothing is hardcoded.
// Bad config throws ConfigError at startup (fail closed).

export class ConfigError extends Error {}

export interface ProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  extraBody: Record<string, unknown>
  jsonMode: boolean
}

export type Network = 'local' | 'sepolia'

export interface ChainEntry {
  provider: string
  model: string
}

export interface PlannerConfig {
  providers: Record<string, ProviderConfig>
  plannerChain: ChainEntry[]
  quarantineChain: ChainEntry[]
  tokens: string[]
  network: Network
  chainIds: Record<Network, number>
  /** Chain id of the selected network; stamped on every intent by trusted code. */
  chainId: number
  defaultSlippageBps: number
  timeoutMs: number
  maxOutputTokens: number
  totalTokenBudget: number
}

type Env = Record<string, string | undefined>

const envKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '_')

function parseBool(value: string | undefined, label: string): boolean {
  const v = (value ?? 'false').trim().toLowerCase()
  if (v === 'true') return true
  if (v === 'false' || v === '') return false
  throw new ConfigError(`${label} must be true or false`)
}

function parseInt10(value: string | undefined, fallback: number, label: string, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback
  if (!/^\d+$/.test(value.trim())) throw new ConfigError(`${label} must be a positive integer`)
  const n = Number(value.trim())
  if (n < min || n > max) throw new ConfigError(`${label} must be between ${min} and ${max}`)
  return n
}

export function validateBaseUrl(raw: string, label: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError(`${label} is not a valid URL`)
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new ConfigError(`${label} must use https (http is allowed only for localhost)`)
  }
  return raw.replace(/\/+$/, '')
}

// Split on the FIRST colon only, so model ids may contain colons.
export function parseChain(raw: string | undefined, label: string, providers: Record<string, ProviderConfig>): ChainEntry[] {
  if (!raw || raw.trim() === '') throw new ConfigError(`${label} is required`)
  return raw.split(',').map((part) => {
    const item = part.trim()
    const idx = item.indexOf(':')
    if (idx <= 0 || idx === item.length - 1) throw new ConfigError(`${label} entry "${item}" must look like provider:model`)
    const provider = item.slice(0, idx).trim().toLowerCase()
    const model = item.slice(idx + 1).trim()
    if (!providers[provider]) throw new ConfigError(`${label} refers to unknown provider "${provider}"`)
    return { provider, model }
  })
}

export interface LoadOptions {
  /** Mock/offline modes do not need API keys. */
  requireKeys?: boolean
}

export function loadConfig(env: Env, options: LoadOptions = {}): PlannerConfig {
  const requireKeys = options.requireKeys ?? true
  const names = (env.PROVIDERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (names.length === 0) throw new ConfigError('PROVIDERS is required (for example groq)')

  const providers: Record<string, ProviderConfig> = {}
  for (const name of names) {
    if (providers[name]) throw new ConfigError(`Provider "${name}" is listed twice`)
    const prefix = `PROVIDER_${envKey(name)}_`
    const baseUrl = validateBaseUrl(env[`${prefix}BASE_URL`] ?? '', `${prefix}BASE_URL`)
    let extraBody: Record<string, unknown> = {}
    const rawExtra = env[`${prefix}EXTRA_BODY`]
    if (rawExtra && rawExtra.trim() !== '') {
      try {
        const parsed: unknown = JSON.parse(rawExtra)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
        extraBody = parsed as Record<string, unknown>
      } catch {
        throw new ConfigError(`${prefix}EXTRA_BODY must be a JSON object`)
      }
    }
    providers[name] = {
      name,
      baseUrl,
      apiKey: (env[`${prefix}API_KEY`] ?? '').trim(),
      extraBody,
      jsonMode: parseBool(env[`${prefix}JSON_MODE`], `${prefix}JSON_MODE`),
    }
  }

  const plannerChain = parseChain(env.PLANNER_CHAIN, 'PLANNER_CHAIN', providers)
  const quarantineChain = env.QUARANTINE_CHAIN?.trim() ? parseChain(env.QUARANTINE_CHAIN, 'QUARANTINE_CHAIN', providers) : []

  if (requireKeys) {
    for (const entry of [...plannerChain, ...quarantineChain]) {
      const p = providers[entry.provider]!
      const isLocal = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(p.baseUrl)
      if (!p.apiKey && !isLocal) throw new ConfigError(`API key missing for provider "${entry.provider}"`)
    }
  }

  const tokens = (env.PLANNER_TOKENS ?? 'ETH,USDC').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  if (tokens.length === 0 || tokens.some((t) => !/^[A-Z0-9]{2,10}$/.test(t))) {
    throw new ConfigError('PLANNER_TOKENS must be a list of symbols like ETH,USDC')
  }

  const network = (env.PLANNER_NETWORK ?? 'local').trim().toLowerCase()
  if (network !== 'local' && network !== 'sepolia') throw new ConfigError('PLANNER_NETWORK must be local or sepolia')
  const chainIds: Record<Network, number> = {
    local: parseInt10(env.LOCAL_CHAIN_ID, 31337, 'LOCAL_CHAIN_ID', 1, 2 ** 31),
    sepolia: parseInt10(env.SEPOLIA_CHAIN_ID, 11155111, 'SEPOLIA_CHAIN_ID', 1, 2 ** 31),
  }

  return {
    providers,
    plannerChain,
    quarantineChain,
    tokens: [...new Set(tokens)],
    network,
    chainIds,
    chainId: chainIds[network],
    defaultSlippageBps: parseInt10(env.PLANNER_DEFAULT_SLIPPAGE_BPS, 50, 'PLANNER_DEFAULT_SLIPPAGE_BPS', 1, 10000),
    timeoutMs: parseInt10(env.LLM_TIMEOUT_MS, 20000, 'LLM_TIMEOUT_MS', 100, 300000),
    maxOutputTokens: parseInt10(env.LLM_MAX_OUTPUT_TOKENS, 600, 'LLM_MAX_OUTPUT_TOKENS', 16, 8192),
    totalTokenBudget: parseInt10(env.LLM_TOTAL_TOKEN_BUDGET, 200000, 'LLM_TOTAL_TOKEN_BUDGET', 1, 100_000_000),
  }
}

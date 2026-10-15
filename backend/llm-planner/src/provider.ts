import type { ChainEntry, PlannerConfig, ProviderConfig } from './config.ts'
import { silentLogger, redactString, type Logger } from './logger.ts'

// OpenAI-compatible chat client + ordered failover chain.
// This file has no import path to any transaction, signer or wallet code.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface Usage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type ProviderErrorKind = 'timeout' | 'rate_limit' | 'server' | 'network' | 'auth' | 'empty' | 'other'

export type ChatResult =
  | { ok: true; content: string; usage: Usage; provider: string; model: string; latencyMs: number }
  | { ok: false; code: 'PROVIDERS_UNAVAILABLE' | 'BUDGET_EXCEEDED'; attempts: AttemptError[] }

export interface AttemptError {
  provider: string
  model: string
  kind: ProviderErrorKind
  status?: number
}

export type ChatFn = (messages: ChatMessage[]) => Promise<ChatResult>

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>

export class TokenBudget {
  used = 0
  constructor(readonly limit: number) {}
  get exhausted(): boolean {
    return this.used >= this.limit
  }
  add(tokens: number): void {
    this.used += Math.max(0, tokens)
  }
}

export interface CallOptions {
  timeoutMs: number
  maxOutputTokens: number
}

type SingleResult =
  | { ok: true; content: string; usage: Usage }
  | { ok: false; kind: ProviderErrorKind; status?: number }

export function mapStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'server'
  return 'other'
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export async function callProvider(
  provider: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  options: CallOptions,
  fetchFn: FetchFn = fetch,
): Promise<SingleResult> {
  const body: Record<string, unknown> = {
    ...provider.extraBody,
    model,
    messages,
    temperature: 0,
    max_tokens: options.maxOutputTokens,
  }
  if (provider.jsonMode) body.response_format = { type: 'json_object' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const response = await fetchFn(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, kind: mapStatus(response.status), status: response.status }
    let json: any
    try {
      json = await response.json()
    } catch {
      return { ok: false, kind: 'empty' }
    }
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim() === '') return { ok: false, kind: 'empty' }
    const u = json?.usage
    const prompt = Number.isFinite(u?.prompt_tokens) ? Number(u.prompt_tokens) : estimateTokens(messages.map((m) => m.content).join(''))
    const completion = Number.isFinite(u?.completion_tokens) ? Number(u.completion_tokens) : estimateTokens(content)
    const total = Number.isFinite(u?.total_tokens) ? Number(u.total_tokens) : prompt + completion
    return { ok: true, content, usage: { promptTokens: prompt, completionTokens: completion, totalTokens: total } }
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') return { ok: false, kind: 'timeout' }
    return { ok: false, kind: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

export interface ChainDeps {
  config: PlannerConfig
  chain: ChainEntry[]
  budget: TokenBudget
  logger?: Logger
  fetchFn?: FetchFn
}

/** Build a ChatFn that tries each chain entry in order. Fails over on any provider-side failure. */
export function createChainChat(deps: ChainDeps): ChatFn {
  const logger = deps.logger ?? silentLogger
  return async (messages) => {
    const attempts: AttemptError[] = []
    for (const entry of deps.chain) {
      if (deps.budget.exhausted) return { ok: false, code: 'BUDGET_EXCEEDED', attempts }
      const provider = deps.config.providers[entry.provider]!
      const started = Date.now()
      const result = await callProvider(provider, entry.model, messages, deps.config, deps.fetchFn)
      const latencyMs = Date.now() - started
      if (result.ok) {
        deps.budget.add(result.usage.totalTokens)
        logger.info('llm.call', { provider: entry.provider, model: entry.model, latencyMs, ...result.usage, budgetUsed: deps.budget.used })
        return { ok: true, content: result.content, usage: result.usage, provider: entry.provider, model: entry.model, latencyMs }
      }
      attempts.push({ provider: entry.provider, model: entry.model, kind: result.kind, status: result.status })
      logger.warn('llm.failover', { provider: entry.provider, kind: result.kind, status: result.status, note: redactString(entry.model) })
    }
    return { ok: false, code: deps.budget.exhausted ? 'BUDGET_EXCEEDED' : 'PROVIDERS_UNAVAILABLE', attempts }
  }
}

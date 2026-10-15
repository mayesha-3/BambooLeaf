import type { ChatFn, ChatResult } from '../src/provider.ts'
import { planGoal, type PlannerDeps } from '../src/planner.ts'

export const RAHIM = '0x1111111111111111111111111111111111111111'
export const KARIM = '0x2222222222222222222222222222222222222222'
export const ATTACKER = '0x6666666666666666666666666666666666666666'
export const BOOK = { Rahim: RAHIM, Karim: KARIM }

export const okChat = (content: string, tokens = 10): ChatResult => ({
  ok: true, content, usage: { promptTokens: tokens, completionTokens: 0, totalTokens: tokens }, provider: 'p', model: 'm', latencyMs: 1,
})

/** Scripted chat: returns the given replies in order and records every message list it received. */
export function scripted(replies: Array<string | ChatResult>) {
  const seen: Array<Array<{ role: string; content: string }>> = []
  const chat: ChatFn = async (messages) => {
    seen.push(messages.map((m) => ({ ...m })))
    const next = replies[Math.min(seen.length - 1, replies.length - 1)]!
    return typeof next === 'string' ? okChat(next) : next
  }
  return { chat, seen }
}

export function plan(goal: string, chat: ChatFn, extra: Partial<PlannerDeps> = {}) {
  return planGoal(goal, { chat, tokens: ['ETH', 'USDC'], chainId: 11155111, defaultSlippageBps: 50, addressBook: BOOK, ...extra })
}

export const transferJson = (recipient: unknown, amount = '0.01', token = 'ETH') =>
  JSON.stringify({ intents: [{ action: 'transfer', from: { token, amount }, recipient, rationale: 'r' }] })

export function envFor(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PROVIDERS: 'alibaba,siliconflow',
    PROVIDER_ALIBABA_BASE_URL: 'https://a.example.com/v1', PROVIDER_ALIBABA_API_KEY: 'key-a-123456', PROVIDER_ALIBABA_JSON_MODE: 'true',
    PROVIDER_ALIBABA_EXTRA_BODY: '{"enable_thinking":false}',
    PROVIDER_SILICONFLOW_BASE_URL: 'https://s.example.com/v1', PROVIDER_SILICONFLOW_API_KEY: 'key-s-123456',
    PLANNER_CHAIN: 'alibaba:model-a,siliconflow:org/model:b',
    ...extra,
  }
}

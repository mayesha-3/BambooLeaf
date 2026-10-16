import type { ChatFn } from '../src/provider.ts'

// Deterministic RULE-BASED stand-in for an LLM. It is NOT evidence that any real model works.
// It exists so the pipeline, verdict logic and reports can be exercised offline.

const WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const REFUSE = /ignore (all|your|previous)|admin mode|system:|<\/?\s*(owner_goal|system)|note to ai|urgent|without (checking|confirmation)|no confirmation|already approved|delegatecall|approv|allowance|bridge|stake|lido|\b(all|everything|half)\b|\bmax(imum)? (balance|amount)/i

function amountOf(clause: string): string | undefined {
  const digits = clause.match(/-?\d+(?:\.\d+)?(?:e\d+)?/i)
  if (digits && !/^0x/i.test(clause.slice(digits.index!, digits.index! + 2))) return digits[0]
  const m = clause.toLowerCase().match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)(?: point (zero|one|two|three|four|five|six|seven|eight|nine))?\b/)
  if (!m) return undefined
  return m[2] ? `${WORDS[m[1]!]}.${WORDS[m[2]]}` : String(WORDS[m[1]!])
}

function tokensOf(clause: string): string[] {
  return [...clause.matchAll(/\b(eth|usdc)\b/gi)].map((m) => m[1]!.toUpperCase())
}

export function mockPlan(goal: string, contacts: string[]): string {
  const refuse = (why: string) => JSON.stringify({ cannotComply: why })
  if (REFUSE.test(goal)) return refuse('Mock: unsupported, ambiguous or suspicious request.')
  const clauses = goal.split(/\bthen\b|\band\b(?=\s+\d)/i).map((c) => c.trim()).filter(Boolean)
  const intents: unknown[] = []
  let lastVerb = ''
  for (const clause of clauses) {
    const lower = clause.toLowerCase()
    const verb = /balance/.test(lower) ? 'balance' : /\bquote\b|how much/.test(lower) ? 'quote' : /swap|exchange|convert/.test(lower) ? 'swap' : /send|pay|transfer|pathao/.test(lower) ? 'transfer' : lastVerb
    lastVerb = verb
    const toks = tokensOf(clause)
    if (verb === 'balance') { intents.push({ action: 'read_balance', ...(toks[0] ? { token: toks[0] } : {}), rationale: 'Mock balance' }); continue }
    const amount = amountOf(clause)
    if (!amount || toks.length === 0) return refuse('Mock: missing amount or token.')
    const afterAmount = clause.match(new RegExp(`${amount.replace('.', '\\.')}\\s*(eth|usdc)`, 'i'))
    const fromToken = afterAmount ? afterAmount[1]!.toUpperCase() : toks[0]!
    if (verb === 'swap' || verb === 'quote') {
      const toToken = toks.find((t) => t !== fromToken)
      if (!toToken) return refuse('Mock: need two different supported tokens.')
      const bps = clause.match(/(\d+)\s*bps/i)?.[1]
      const pct = clause.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]
      const slip = bps ? Number(bps) : pct ? Math.round(Number(pct) * 100) : undefined
      intents.push(verb === 'swap'
        ? { action: 'swap', from: { token: fromToken, amount }, to: { token: toToken }, ...(slip ? { maxSlippageBps: slip } : {}), rationale: 'Mock swap' }
        : { action: 'read_quote', from: { token: fromToken, amount }, to: { token: toToken }, rationale: 'Mock quote' })
      continue
    }
    if (verb !== 'transfer') return refuse('Mock: unsupported action.')
    const addr = goal.match(/0x[0-9a-fA-F]{40}/)?.[0]
    const named = contacts.find((c) => new RegExp(`(?<![A-Za-z])${c}(?![A-Za-z])`, 'i').test(clause))
    const guess = clause.match(/\bto\s+([A-Za-z]+)/i)?.[1]
    const recipient = addr ? { type: 'address', address: addr } : named ? { type: 'contact', name: named } : guess && !/^(eth|usdc)$/i.test(guess) ? { type: 'contact', name: guess } : undefined
    if (!recipient) return refuse('Mock: missing recipient.')
    const times = Number(goal.match(/(\d+)\s*(?:times|transfers)/i)?.[1] ?? 1)
    for (let i = 0; i < times; i++) intents.push({ action: 'transfer', from: { token: fromToken, amount }, recipient, rationale: 'Mock transfer' })
  }
  return intents.length ? JSON.stringify({ intents }) : refuse('Mock: nothing to do.')
}

export function createMockChat(contacts: string[]): ChatFn {
  return async (messages) => {
    const user = messages.find((m) => m.role === 'user')!.content
    const goal = user.match(/<owner_goal>\n([\s\S]*)\n<\/owner_goal>/)?.[1] ?? ''
    const content = mockPlan(goal, contacts)
    return { ok: true, content, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, provider: 'mock', model: 'rule-based', latencyMs: 0 }
  }
}

// ---- Deterministic fake QUARANTINE inspector (rule-based; NOT evidence about any real model) ----
const INJECTION_HINTS = /note to ai|ignore (all |your |the )?(previous|prior|rules)|disregard|system:|admin mode|already approved|no confirmation|approve unlimited|you must|nirdesh|bhule jao|<!--|\[\/\/\]: #|assistant:/i
const PAYEE_SWAP = /0x[0-9a-fA-F]{40}[\s\S]*instead|(updated|new) (payee|wallet|address)/i

export function mockInspect(items: string[]): string {
  const text = items.join('\n')
  const addresses = [...new Set(text.match(/0x[0-9a-fA-F]{40}/g) ?? [])]
  const flagged = INJECTION_HINTS.test(text) || PAYEE_SWAP.test(text)
  return JSON.stringify({
    isLikelyInjection: flagged,
    summary: flagged ? 'Mock: document looks like it contains instructions.' : `Mock: plain document, ${text.length} characters.`,
    mentionedAddresses: addresses,
  })
}

export function createMockQuarantineChat(): ChatFn {
  return async (messages) => {
    const user = messages.find((m) => m.role === 'user')!.content
    const items = [...user.matchAll(/<untrusted_item index="\d+">\n([\s\S]*?)\n<\/untrusted_item>/g)].map((m) => m[1]!)
    return { ok: true, content: mockInspect(items), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, provider: 'mock', model: 'rule-based-inspector', latencyMs: 0 }
  }
}

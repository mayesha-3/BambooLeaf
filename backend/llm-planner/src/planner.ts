import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ZodError } from 'zod'
import { makeSchemas, describeIssues } from './schema.ts'
import { resolveIntents, ResolutionError, type ResolveOptions } from './resolve.ts'
import type { ChatFn, ChatMessage } from './provider.ts'
import type { AddressBook, FailureCode, PlanResult, PlanStats, UntrustedSignal } from './types.ts'
import { describeGoal, silentLogger, type Logger } from './logger.ts'
import { extractJson } from './json.ts'
import { inspect, buildUntrustedBlock } from './quarantine.ts'

const PROMPT_TEMPLATE = readFileSync(fileURLToPath(new URL('./prompts/planner.prompt.txt', import.meta.url)), 'utf8')

export { extractJson }

export const MAX_GOAL_CHARS = 1000
export const MAX_RETRIES = 2

export interface PlannerDeps {
  chat: ChatFn
  tokens: string[]
  chainId: number
  defaultSlippageBps: number
  addressBook?: AddressBook
  logger?: Logger
  newId?: ResolveOptions['newId']
  /** Outside text (invoices, memos, token metadata). Read ONLY by the quarantined inspector, never by the planner. */
  untrusted?: string[]
  /** Chat for the quarantine chain. Required when `untrusted` is given, otherwise QUARANTINE_FAILED. */
  quarantineChat?: ChatFn
}

export function checkGoal(goal: unknown): string | undefined {
  if (typeof goal !== 'string' || goal.trim() === '') return 'Goal is empty'
  if (goal.length > MAX_GOAL_CHARS) return `Goal is longer than ${MAX_GOAL_CHARS} characters`
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(goal)) return 'Goal contains control characters'
  return undefined
}

/** Remove anything that looks like a closing/opening owner_goal tag so the goal cannot break out of the wrapper. */
export function sanitizeForPrompt(goal: string): string {
  return goal.replace(/<\s*\/?\s*owner_goal[^>]*>?/gi, '')
}

export function buildSystemPrompt(tokens: string[], contactNames: string[]): string {
  return PROMPT_TEMPLATE.replace('{{TOKENS}}', tokens.join(', ')).replace('{{CONTACTS}}', contactNames.length ? contactNames.join(', ') : '(none)')
}

export async function planGoal(goal: string, deps: PlannerDeps): Promise<PlanResult> {
  const logger = deps.logger ?? silentLogger
  const stats: PlanStats = { modelCalls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, quarantineCalls: 0 }
  const fail = (code: FailureCode, message: string, extra: { signal?: UntrustedSignal; cause?: Extract<PlanResult, { ok: false }>['cause'] } = {}): PlanResult => {
    logger.warn('plan.failed', { code, ...describeGoal(String(goal ?? '')) })
    return { ok: false, code, message, stats, ...extra }
  }

  const problem = checkGoal(goal)
  if (problem) return fail('INPUT_INVALID', problem)

  // Outside text goes ONLY to the quarantined inspector. The owner's own goal is never quarantined.
  let untrustedBlock = ''
  if (deps.untrusted !== undefined && deps.untrusted !== null && !(Array.isArray(deps.untrusted) && deps.untrusted.length === 0)) {
    const q = await inspect(deps.untrusted, { chat: deps.quarantineChat, logger })
    stats.quarantineCalls = q.stats.calls
    stats.promptTokens += q.stats.promptTokens
    stats.completionTokens += q.stats.completionTokens
    stats.totalTokens += q.stats.totalTokens
    stats.latencyMs += q.stats.latencyMs
    if (!q.ok) return fail(q.code, q.message, { cause: q.cause })
    if (q.result.isLikelyInjection) {
      return fail('UNTRUSTED_CONTENT_FLAGGED', 'Untrusted content looks like an injection attempt; the planner was not called', {
        signal: { kind: 'injection_suspected', source: 'untrusted_text', itemCount: q.itemCount },
      })
    }
    untrustedBlock = buildUntrustedBlock(q.result.summary, q.itemCount)
  }

  const book = deps.addressBook ?? {}
  const schemas = makeSchemas(deps.tokens)
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(deps.tokens, Object.keys(book)) },
    { role: 'user', content: `<owner_goal>\n${sanitizeForPrompt(goal)}\n</owner_goal>${untrustedBlock ? `\n${untrustedBlock}` : ''}` },
  ]

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await deps.chat(messages)
    if (!res.ok) return fail(res.code, res.code === 'BUDGET_EXCEEDED' ? 'Token budget reached' : 'All providers failed')
    stats.modelCalls++
    stats.latencyMs += res.latencyMs // the provider call itself, not rate-limit waiting
    stats.promptTokens += res.usage.promptTokens
    stats.completionTokens += res.usage.completionTokens
    stats.totalTokens += res.usage.totalTokens

    let problems: string[]
    try {
      const parsed = schemas.modelOutput.safeParse(extractJson(res.content))
      if (parsed.success) {
        const out = parsed.data
        if ('cannotComply' in out) return fail('MODEL_REFUSED', out.cannotComply)
        try {
          const intents = resolveIntents(out.intents, { goal, addressBook: book, chainId: deps.chainId, defaultSlippageBps: deps.defaultSlippageBps, newId: deps.newId })
          logger.info('plan.ok', { intents: intents.length, ...describeGoal(goal), modelCalls: stats.modelCalls })
          return { ok: true, intents, stats }
        } catch (error) {
          if (error instanceof ResolutionError) return fail(error.code, error.message)
          throw error
        }
      }
      problems = describeIssues(parsed.error as ZodError)
    } catch (error) {
      if (error instanceof SyntaxError) problems = ['(root): output is not valid JSON']
      else throw error
    }

    if (attempt === MAX_RETRIES) return fail('INVALID_OUTPUT', problems.join('; '))
    messages.push(
      { role: 'assistant', content: res.content },
      { role: 'user', content: `Your answer was rejected. Problems:\n- ${problems.join('\n- ')}\nReturn corrected JSON only, following the rules. If the request cannot be done exactly, return {"cannotComply":"..."}.` },
    )
  }
  return fail('INVALID_OUTPUT', 'unreachable')
}

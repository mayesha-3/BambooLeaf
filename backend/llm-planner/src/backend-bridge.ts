import { z } from 'zod'
import { ConfigError, loadConfig, type PlannerConfig } from './config.ts'
import { planGoal as planIntents } from './planner.ts'
import { createChainChat, TokenBudget, type ChatFn, type FetchFn } from './provider.ts'
import { toGuardIntent, type GuardShapeIntent } from './adapter.ts'
import type { AddressBook, FailureCode, UntrustedSignal } from './types.ts'

// Drop-in for backend/src/agent/planner.tsx:  planGoal(goal, chainId) -> one guard-shaped intent, or throws.
// The backend decides whether to import this; nothing in backend/src is imported or edited here.

// Local copy of the guard intent shape (backend/src/guard/intent.schema.tsx, Person 1). Keep in sync by hand.
const token = z.string().regex(/^[A-Z0-9]{2,10}$/)
const decimalAmount = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/).refine((v) => Number(v) > 0, 'Amount must be greater than zero')
export const guardIntentShape = z.strictObject({
  intentId: z.string().uuid(),
  action: z.enum(['transfer', 'swap', 'read_balance', 'read_quote']),
  chainId: z.number().int().positive(),
  from: z.strictObject({ token, amount: decimalAmount.optional() }),
  to: z.strictObject({ token }).optional(),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  maxSlippageBps: z.number().int().min(0).max(500).optional(),
  rationale: z.string().max(240),
  sourceRefs: z.array(z.enum(['user_goal', 'saved_contact'])).max(8),
}).superRefine((intent, ctx) => {
  if (intent.action === 'transfer' && (!intent.from.amount || !intent.recipient)) {
    ctx.addIssue({ code: 'custom', message: 'Transfers require an amount and a recipient' })
  }
  if (intent.action === 'swap' && (!intent.from.amount || !intent.to || intent.maxSlippageBps === undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Swaps require an amount, target token and slippage limit' })
  }
})

export type BridgeCode =
  | FailureCode
  | 'CHAIN_NOT_ALLOWED' | 'MULTI_INTENT_UNSUPPORTED' | 'NOT_REPRESENTABLE' | 'GUARD_SHAPE_INVALID'
  | 'INVALID_ARGUMENTS' | 'CONFIG_INVALID' | 'INTERNAL_ERROR'

/** Third argument of planGoal: `string[]` or `{ untrusted }` and nothing else. Item types are checked by the quarantine (INPUT_INVALID). */
function normalizeThird(third: unknown): BridgeOptions {
  if (third === undefined) return {}
  if (Array.isArray(third)) return { untrusted: third as string[] }
  if (third !== null && typeof third === 'object' && Object.getPrototypeOf(third) === Object.prototype && Object.keys(third).every((k) => k === 'untrusted')) {
    return third as BridgeOptions
  }
  throw new BridgeError('INVALID_ARGUMENTS', 'third argument must be a string[] or { untrusted: string[] }')
}

/** Every bridge failure. `message` starts with `code`; `signal` is set for UNTRUSTED_CONTENT_FLAGGED. */
export class BridgeError extends Error {
  constructor(readonly code: BridgeCode, message: string, readonly signal?: UntrustedSignal) {
    super(`${code}: ${message}`)
    this.name = 'BridgeError'
  }
}

export interface BridgeOptions {
  /** Outside text (invoices, memos, token metadata). Only the quarantined inspector reads it. */
  untrusted?: string[]
}

export interface BridgeDeps {
  getConfig?: () => PlannerConfig
  /** Test hook: replace the real provider chain. */
  getChat?: (config: PlannerConfig) => ChatFn
  getQuarantineChat?: (config: PlannerConfig) => ChatFn
  fetchFn?: FetchFn
  /** Saved contacts (name -> address). Called per request. */
  getAddressBook?: () => AddressBook
}

// TODO(Person 4 / backend): wire the real address book (saved contacts). Until then contact names fail with
// UNKNOWN_CONTACT and only addresses typed by the owner can be used as recipients.
const emptyAddressBook = (): AddressBook => ({})

export function createBridge(deps: BridgeDeps = {}) {
  let config: PlannerConfig | undefined
  let chat: ChatFn | undefined
  let quarantineChat: ChatFn | undefined
  let budget: TokenBudget | undefined
  const getConfig = deps.getConfig ?? (() => loadConfig(process.env))
  const getAddressBook = deps.getAddressBook ?? emptyAddressBook

  /** Third argument: `{ untrusted }`, or a bare `string[]` (the form backend/src/services/goals.service.tsx calls). */
  return async function planGoal(goal: string, chainId: number, third: BridgeOptions | string[] = {}): Promise<GuardShapeIntent> {
    const options = normalizeThird(third) // any other shape: INVALID_ARGUMENTS, before any model call
    try {
      return await run(goal, chainId, options)
    } catch (error) {
      // The backend reads error.code, so every thrown error carries a string code.
      if (error instanceof BridgeError) throw error
      if (error instanceof ConfigError) throw new BridgeError('CONFIG_INVALID', error.message)
      throw new BridgeError('INTERNAL_ERROR', `unexpected ${error instanceof Error ? error.name : 'error'}`)
    }
  }

  async function run(goal: string, chainId: number, options: BridgeOptions): Promise<GuardShapeIntent> {
    config ??= getConfig()
    const allowed = [config.chainIds.local, config.chainIds.sepolia]
    if (!allowed.includes(chainId)) {
      throw new BridgeError('CHAIN_NOT_ALLOWED', `chainId must be one of ${allowed.join(', ')}`)
    }
    budget ??= new TokenBudget(config.totalTokenBudget) // one budget shared by planner and quarantine
    chat ??= deps.getChat ? deps.getChat(config) : createChainChat({ config, chain: config.plannerChain, budget, fetchFn: deps.fetchFn })
    if (!quarantineChat) {
      if (deps.getQuarantineChat) quarantineChat = deps.getQuarantineChat(config)
      else if (config.quarantineChain.length > 0) quarantineChat = createChainChat({ config, chain: config.quarantineChain, budget, fetchFn: deps.fetchFn })
    }

    const result = await planIntents(goal, {
      chat, tokens: config.tokens, chainId, defaultSlippageBps: config.defaultSlippageBps, addressBook: getAddressBook(),
      untrusted: options.untrusted, quarantineChat,
    })
    if (!result.ok) throw new BridgeError(result.code, result.message, result.signal)
    if (result.intents.length !== 1) {
      throw new BridgeError('MULTI_INTENT_UNSUPPORTED', `planner returned ${result.intents.length} intents; the guard accepts exactly one`)
    }
    const converted = toGuardIntent(result.intents[0]!)
    if (!converted) throw new BridgeError('NOT_REPRESENTABLE', 'intent cannot be expressed in the guard intent shape (for example slippage above 500 bps)')
    const checked = guardIntentShape.safeParse(converted)
    if (!checked.success) {
      throw new BridgeError('GUARD_SHAPE_INVALID', checked.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; '))
    }
    return checked.data as GuardShapeIntent
  }
}

/** Default instance: config from process.env, real provider chain, empty address book. */
export const planGoal = createBridge()

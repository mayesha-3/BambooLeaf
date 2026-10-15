// Public contract returned by the planner. See README "Intent contract".

export type FailureCode =
  | 'INPUT_INVALID'
  | 'MODEL_REFUSED'
  | 'INVALID_OUTPUT'
  | 'UNGROUNDED_RECIPIENT'
  | 'UNKNOWN_CONTACT'
  | 'PROVIDERS_UNAVAILABLE'
  | 'BUDGET_EXCEEDED'

export interface Intent {
  intentId: string
  chainId: number
  action: 'transfer' | 'swap' | 'read_balance' | 'read_quote'
  from?: { token: string; amount: string }
  to?: { token: string }
  token?: string // read_balance only
  recipient?: { address: string; source: 'user_text' | 'address_book'; contactName?: string }
  maxSlippageBps?: number
  rationale: string
  sourceRefs: ['user_goal']
}

export interface PlanStats {
  modelCalls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  latencyMs: number
}

export type PlanResult =
  | { ok: true; intents: Intent[]; stats: PlanStats }
  | { ok: false; code: FailureCode; message: string; stats: PlanStats }

/** Address book: contact name -> checksummed or lowercase address. Names only go to the model. */
export type AddressBook = Record<string, string>

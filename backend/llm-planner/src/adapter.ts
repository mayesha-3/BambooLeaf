import type { Intent } from './types.ts'

// Adapter to the guard contract currently on this branch (backend/src/guard/intent.schema.tsx, owned by Person 1):
//   one intent; from:{token,amount}; to?:{token}; recipient: plain address string;
//   maxSlippageBps 0..500 required for swaps; sourceRefs in ['user_goal','saved_contact'].
// Read-only inspection; nothing in that file is edited. Returns undefined when the guard shape cannot represent the intent.

export interface GuardShapeIntent {
  intentId: string
  action: Intent['action']
  chainId: number
  from: { token: string; amount?: string }
  to?: { token: string }
  recipient?: string
  maxSlippageBps?: number
  rationale: string
  sourceRefs: Array<'user_goal' | 'saved_contact'>
}

export function toGuardIntent(intent: Intent): GuardShapeIntent | undefined {
  if (intent.action === 'read_balance') {
    return { intentId: intent.intentId, action: intent.action, chainId: intent.chainId, from: { token: intent.token ?? 'ETH' }, rationale: intent.rationale, sourceRefs: ['user_goal'] }
  }
  if (!intent.from) return undefined
  if (intent.maxSlippageBps !== undefined && intent.maxSlippageBps > 500) return undefined // guard max is 500
  return {
    intentId: intent.intentId,
    action: intent.action,
    chainId: intent.chainId,
    from: intent.from,
    ...(intent.to ? { to: intent.to } : {}),
    ...(intent.recipient ? { recipient: intent.recipient.address } : {}),
    ...(intent.maxSlippageBps !== undefined ? { maxSlippageBps: intent.maxSlippageBps } : {}),
    rationale: intent.rationale,
    sourceRefs: intent.recipient?.source === 'address_book' ? ['user_goal', 'saved_contact'] : ['user_goal'],
  }
}

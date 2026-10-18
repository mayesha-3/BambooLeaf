import { randomUUID } from 'node:crypto'
import { getAddress } from 'ethers'
import type { AddressBook, FailureCode, Intent } from './types.ts'
import type { RawIntent } from './schema.ts'

// Trusted code: grounds recipients in the owner's text and adds ids, chain and defaults.

export class ResolutionError extends Error {
  constructor(readonly code: FailureCode, message: string) {
    super(message)
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function goalContainsContact(goal: string, name: string): boolean {
  // Letter/digit boundaries so "Rahim" does not match inside "Rahimm".
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'iu').test(goal)
}

export function goalContainsAddress(goal: string, address: string): boolean {
  // Same 40 hex digits (case-insensitive) and not part of a longer hex run.
  return new RegExp(`(?<![0-9a-fA-F])${address.slice(2)}(?![0-9a-fA-F])`, 'i').test(goal)
}

function lookupContact(book: AddressBook, name: string): [string, string] | undefined {
  const wanted = name.trim().toLowerCase()
  for (const [key, address] of Object.entries(book)) if (key.toLowerCase() === wanted) return [key, address]
  return undefined
}

export interface ResolveOptions {
  goal: string
  addressBook: AddressBook
  chainId: number
  defaultSlippageBps: number
  newId?: () => string
}

export function resolveIntents(raw: RawIntent[], opts: ResolveOptions): Intent[] {
  const newId = opts.newId ?? randomUUID
  return raw.map((r) => {
    const base = { intentId: newId(), chainId: opts.chainId, rationale: r.rationale, sourceRefs: ['user_goal'] as ['user_goal'] }
    switch (r.action) {
      case 'transfer': {
        const rec = r.recipient
        if (rec.type === 'contact') {
          const found = lookupContact(opts.addressBook, rec.name)
          if (!found) throw new ResolutionError('UNKNOWN_CONTACT', 'Recipient is not a saved contact')
          if (!goalContainsContact(opts.goal, found[0])) {
            throw new ResolutionError('UNGROUNDED_RECIPIENT', 'Contact name does not appear in the owner goal')
          }
          return { ...base, action: 'transfer', from: { token: r.from.token, amount: r.from.amount }, recipient: { address: getAddress(found[1]), source: 'address_book', contactName: found[0] } }
        }
        if (!goalContainsAddress(opts.goal, rec.address)) {
          throw new ResolutionError('UNGROUNDED_RECIPIENT', 'Address does not appear verbatim in the owner goal')
        }
        return { ...base, action: 'transfer', from: { token: r.from.token, amount: r.from.amount }, recipient: { address: rec.address, source: 'user_text' } }
      }
      case 'swap':
        return { ...base, action: 'swap', from: { token: r.from.token, amount: r.from.amount }, to: { token: r.to.token }, maxSlippageBps: r.maxSlippageBps ?? opts.defaultSlippageBps }
      case 'read_balance':
        return { ...base, action: 'read_balance', ...(r.token ? { token: r.token } : {}) }
      case 'read_quote':
        return { ...base, action: 'read_quote', from: { token: r.from.token, amount: r.from.amount }, to: { token: r.to.token } }
    }
  })
}

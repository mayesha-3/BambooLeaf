import test from 'node:test'
import assert from 'node:assert/strict'
import { createLogger, describeGoal } from '../src/logger.ts'
import { toGuardIntent } from '../src/adapter.ts'

test('logger redacts keys, auth headers, 32-byte hex and goal text', () => {
  const lines: string[] = []
  const log = createLogger((l) => lines.push(l), ['my-secret-key-value'])
  const hex = '0x' + 'ab'.repeat(32)
  log.info('x', { apiKey: 'sk-abcdefghijkl', authorization: 'Bearer abc.def', goal: 'send all money', note: `key my-secret-key-value and ${hex} and Bearer zzz.yyy`, nested: { goal: 'secret goal' }, ...describeGoal('send all money') })
  const out = lines.join('')
  for (const bad of ['sk-abcdefghijkl', 'abc.def', 'send all money', 'my-secret-key-value', hex, 'ab'.repeat(32), 'zzz.yyy', 'secret goal']) assert.ok(!out.includes(bad), bad)
  assert.match(out, /goalHash/); assert.match(out, /"goalLength":14/)
})
test('adapter maps to the guard shape and refuses unrepresentable slippage', () => {
  const base = { intentId: 'i', chainId: 1, rationale: 'r', sourceRefs: ['user_goal'] as ['user_goal'] }
  const t = toGuardIntent({ ...base, action: 'transfer', from: { token: 'ETH', amount: '1' }, recipient: { address: '0x1', source: 'address_book' } })
  assert.equal(t?.recipient, '0x1'); assert.deepEqual(t?.sourceRefs, ['user_goal', 'saved_contact'])
  assert.equal(toGuardIntent({ ...base, action: 'swap', from: { token: 'ETH', amount: '1' }, to: { token: 'USDC' }, maxSlippageBps: 9900 }), undefined)
})

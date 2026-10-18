import test from 'node:test'
import assert from 'node:assert/strict'
import { createBridge, guardIntentShape } from '../src/backend-bridge.ts'
import { loadConfig } from '../src/config.ts'
import type { FetchFn } from '../src/provider.ts'
import { scripted, transferJson, envFor, RAHIM, KARIM } from './helpers.ts'

const config = loadConfig(envFor())
const bridgeWith = (replies: Parameters<typeof scripted>[0], extra = {}) => {
  const s = scripted(replies)
  return { s, planGoal: createBridge({ getConfig: () => config, getChat: () => s.chat, ...extra }) }
}
const typed = (a: string) => transferJson({ type: 'address', address: a })
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message))

test('defaults: local 31337 and sepolia 11155111 are the allowed chain ids', () => {
  assert.equal(config.chainIds.local, 31337); assert.equal(config.chainIds.sepolia, 11155111)
})
test('one intent: returns guard shape stamped with the given chain id', async () => {
  for (const id of [31337, 11155111]) {
    const { planGoal } = bridgeWith([typed(KARIM)])
    const i = await planGoal(`send 0.01 ETH to ${KARIM}`, id)
    assert.equal(i.chainId, id); assert.equal(i.recipient, KARIM); assert.deepEqual(i.sourceRefs, ['user_goal'])
    assert.ok(guardIntentShape.safeParse(i).success)
  }
})
test('chain id outside local/sepolia throws before any model call', async () => {
  const { s, planGoal } = bridgeWith([typed(KARIM)])
  for (const bad of [1, 0, 5, NaN]) await rejects(planGoal(`send 1 ETH to ${KARIM}`, bad), /^CHAIN_NOT_ALLOWED/)
  assert.equal(s.seen.length, 0)
})
test('failures throw with the failure code first', async () => {
  await rejects(bridgeWith(['{"cannotComply":"no"}']).planGoal('send everything', 31337), /^MODEL_REFUSED/)
  await rejects(bridgeWith(['junk']).planGoal('send 1 ETH to Rahim', 31337), /^INVALID_OUTPUT/)
  await rejects(bridgeWith([{ ok: false, code: 'PROVIDERS_UNAVAILABLE', attempts: [] }]).planGoal('x', 31337), /^PROVIDERS_UNAVAILABLE/)
  await rejects(bridgeWith([{ ok: false, code: 'BUDGET_EXCEEDED', attempts: [] }]).planGoal('x', 31337), /^BUDGET_EXCEEDED/)
  await rejects(bridgeWith(['{}']).planGoal('   ', 31337), /^INPUT_INVALID/)
})
test('two or more intents throw MULTI_INTENT_UNSUPPORTED (nothing dropped)', async () => {
  const two = JSON.stringify({ intents: [{ action: 'read_balance', rationale: 'r' }, { action: 'read_balance', token: 'ETH', rationale: 'r' }] })
  await rejects(bridgeWith([two]).planGoal('show balance and ETH balance', 31337), /^MULTI_INTENT_UNSUPPORTED.*2 intents/)
})
test('slippage above 500 bps throws NOT_REPRESENTABLE', async () => {
  const sw = JSON.stringify({ intents: [{ action: 'swap', from: { token: 'ETH', amount: '1' }, to: { token: 'USDC' }, maxSlippageBps: 9900, rationale: 'r' }] })
  await rejects(bridgeWith([sw]).planGoal('swap 1 ETH to USDC with 99% slippage', 31337), /^NOT_REPRESENTABLE/)
  const ok = JSON.stringify({ intents: [{ action: 'swap', from: { token: 'ETH', amount: '1' }, to: { token: 'USDC' }, rationale: 'r' }] })
  assert.equal((await bridgeWith([ok]).planGoal('swap 1 ETH to USDC', 31337)).maxSlippageBps, 50)
})
test('address book: empty by default (contact fails), optional function enables contacts', async () => {
  await rejects(bridgeWith([transferJson({ type: 'contact', name: 'Rahim' })]).planGoal('send 1 ETH to Rahim', 31337), /^UNKNOWN_CONTACT/)
  const { planGoal } = bridgeWith([transferJson({ type: 'contact', name: 'Rahim' })], { getAddressBook: () => ({ Rahim: RAHIM }) })
  const i = await planGoal('send 1 ETH to Rahim', 31337)
  assert.equal(i.recipient, RAHIM); assert.deepEqual(i.sourceRefs, ['user_goal', 'saved_contact'])
})
test('local guard-shape copy rejects bad objects', () => {
  const good = { intentId: '123e4567-e89b-42d3-a456-426614174000', action: 'transfer', chainId: 31337, from: { token: 'ETH', amount: '1' }, recipient: RAHIM, rationale: 'r', sourceRefs: ['user_goal'] }
  assert.ok(guardIntentShape.safeParse(good).success)
  for (const bad of [{ ...good, extra: 1 }, { ...good, from: { token: 'ETH', amount: '0' } }, { ...good, recipient: undefined }, { ...good, intentId: 'x' }, { ...good, maxSlippageBps: 501 }, { ...good, sourceRefs: ['model'] }]) {
    assert.ok(!guardIntentShape.safeParse(bad).success, JSON.stringify(bad))
  }
})
test('full path with a fake provider over fetch (no network): failover and budget work through the bridge', async () => {
  let calls = 0
  const fetchFn: FetchFn = async () => {
    calls++
    if (calls === 1) return new Response('{}', { status: 503 })
    return new Response(JSON.stringify({ choices: [{ message: { content: transferJson({ type: 'address', address: KARIM }, '2', 'USDC') } }], usage: { total_tokens: 20 } }), { status: 200 })
  }
  const planGoal = createBridge({ getConfig: () => config, fetchFn })
  const i = await planGoal(`send 2 USDC to ${KARIM}`, 11155111)
  assert.equal(calls, 2); assert.equal(i.from.token, 'USDC'); assert.equal(i.chainId, 11155111); assert.equal(i.from.amount, '2')
})
test('third argument may be a bare string[] (the form goals.service.tsx uses): quarantine still runs and its flag still blocks', async () => {
  const qReply = '{"isLikelyInjection":true,"summary":"x","mentionedAddresses":[]}'
  const s = scripted([transferJson({ type: 'address', address: KARIM }, '1', 'ETH')]); const qc = scripted([qReply])
  const planGoal = createBridge({ getConfig: () => config, getChat: () => s.chat, getQuarantineChat: () => qc.chat })
  await assert.rejects(planGoal(`send 1 ETH to ${KARIM}`, 31337, ['pasted invoice text']), (e: Error) => /^UNTRUSTED_CONTENT_FLAGGED/.test(e.message) && (e as { code?: string }).code === 'UNTRUSTED_CONTENT_FLAGGED')
  assert.equal(qc.seen.length, 1); assert.equal(s.seen.length, 0)
})

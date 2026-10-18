import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { BridgeError, createBridge, validateBridgeConfig } from '../src/backend-bridge.ts'
import { ConfigError, loadConfig, parseAddressBook } from '../src/config.ts'
import { failed, succeeded } from '../src/result.ts'
import { resolveIntents } from '../src/resolve.ts'
import type { FetchFn } from '../src/provider.ts'
import { envFor, KARIM, RAHIM, transferJson } from './helpers.ts'

const moduleDir = fileURLToPath(new URL('..', import.meta.url))
const backendDir = fileURLToPath(new URL('../..', import.meta.url))
const book = (o: Record<string, string>) => JSON.stringify(o)

// ---------- 1. type safety under the backend's loose tsconfig ----------
test('tsc in backend (strict:false) reports no errors from files in backend/llm-planner', () => {
  const r = spawnSync(`${moduleDir}node_modules/.bin/tsc`, ['--noEmit', '-p', 'tsconfig.json'], { cwd: backendDir, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } })
  const errors = `${r.stdout}${r.stderr}`.split('\n').filter((l) => /error TS\d+/.test(l))
  const mine = errors.filter((l) => l.startsWith('llm-planner/'))
  assert.deepEqual(mine, [], mine.join('\n'))
})
test('narrowing helpers behave exactly like the checks they replace', () => {
  const ok = { ok: true as const, v: 1 }; const bad = { ok: false as const, why: 'x' }
  assert.equal(failed(ok), false); assert.equal(failed(bad), true); assert.equal(succeeded(ok), true); assert.equal(succeeded(bad), false)
})
test('resolveIntents output is unchanged: exact shapes for transfer, swap and quote', () => {
  const ids = ['i1', 'i2', 'i3']; const newId = () => ids.shift()!
  const out = resolveIntents([
    { action: 'transfer', from: { token: 'ETH', amount: '0.01' }, recipient: { type: 'address', address: KARIM }, rationale: 'r' },
    { action: 'swap', from: { token: 'USDC', amount: '5' }, to: { token: 'ETH' }, rationale: 'r' },
    { action: 'read_quote', from: { token: 'ETH', amount: '1' }, to: { token: 'USDC' }, rationale: 'r' },
  ] as never, { goal: `send 0.01 ETH to ${KARIM}`, addressBook: {}, chainId: 31337, defaultSlippageBps: 50, newId })
  const base = { chainId: 31337, rationale: 'r', sourceRefs: ['user_goal'] }
  assert.deepEqual(out, [
    { ...base, intentId: 'i1', action: 'transfer', from: { token: 'ETH', amount: '0.01' }, recipient: { address: KARIM, source: 'user_text' } },
    { ...base, intentId: 'i2', action: 'swap', from: { token: 'USDC', amount: '5' }, to: { token: 'ETH' }, maxSlippageBps: 50 },
    { ...base, intentId: 'i3', action: 'read_quote', from: { token: 'ETH', amount: '1' }, to: { token: 'USDC' } },
  ])
})

// ---------- 2. PLANNER_ADDRESS_BOOK ----------
test('address book: valid entries are checksummed; unset or empty means no contacts', () => {
  const mixed = '0xe2484B945d8dD3735Fa821Ff253ff20f8A43B1Dd'
  assert.deepEqual(parseAddressBook(book({ Treasury: mixed, 'Rahim K': RAHIM })), { Treasury: mixed, 'Rahim K': RAHIM })
  assert.equal(parseAddressBook(book({ T: mixed.toLowerCase() })).T, mixed) // lowercase accepted, normalized to the checksum form
  assert.deepEqual(parseAddressBook(undefined), {}); assert.deepEqual(parseAddressBook('  '), {}); assert.deepEqual(parseAddressBook('{}'), {})
  assert.deepEqual(loadConfig(envFor()).addressBook, {})
  assert.deepEqual(loadConfig(envFor({ PLANNER_ADDRESS_BOOK: book({ Rahim: RAHIM }) })).addressBook, { Rahim: RAHIM })
})
test('address book: every bad value is a ConfigError that names the setting and never echoes an address', () => {
  const badChecksum = '0xe2484B945d8dD3735Fa821Ff253ff20f8A43B1De'
  const bad = ['{not json', '[]', 'null', '"text"', '5', book({ A: 'not an address' }), book({ A: badChecksum }), book({ A: '0x' + '0'.repeat(40) }), book({ A: 5 as never }),
    book({ A: RAHIM.slice(0, 20) }), book({ '': RAHIM }), book({ ' lead': RAHIM }), book({ ['x'.repeat(51)]: RAHIM }), book({ '<b>': RAHIM }), book({ Rahim: RAHIM, rahim: KARIM }),
    book(Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`C${i}`, RAHIM])))]
  for (const raw of bad) {
    assert.throws(() => loadConfig(envFor({ PLANNER_ADDRESS_BOOK: raw })), (e: Error) => e instanceof ConfigError && /PLANNER_ADDRESS_BOOK/.test(e.message) && !e.message.includes(badChecksum), raw.slice(0, 40))
  }
})
test('address book from the environment: the bridge resolves a contact; the model gets the NAME only, never the address', async () => {
  const cfg = loadConfig(envFor({ PLANNER_ADDRESS_BOOK: book({ Rahim: RAHIM, Karim: KARIM }) }))
  const sent: string[] = []
  const fetchFn: FetchFn = async (_u, init) => {
    sent.push(String(init.body))
    return new Response(JSON.stringify({ choices: [{ message: { content: transferJson({ type: 'contact', name: 'Rahim' }, '0.01') } }], usage: { total_tokens: 10 } }), { status: 200 })
  }
  const i = await createBridge({ getConfig: () => cfg, fetchFn })('send 0.01 ETH to Rahim', 31337)
  assert.equal(i.recipient, RAHIM); assert.deepEqual(i.sourceRefs, ['user_goal', 'saved_contact'])
  const all = sent.join('\n'); assert.ok(all.includes('Rahim') && all.includes('Karim'))
  assert.ok(!all.includes(RAHIM.slice(2)) && !all.includes(KARIM.slice(2)))
})
test('address book: without PLANNER_ADDRESS_BOOK a contact still fails closed; a getAddressBook hook still overrides the environment', async () => {
  const reply = async () => new Response(JSON.stringify({ choices: [{ message: { content: transferJson({ type: 'contact', name: 'Rahim' }) } }], usage: { total_tokens: 1 } }), { status: 200 })
  await assert.rejects(createBridge({ getConfig: () => loadConfig(envFor()), fetchFn: reply })('send 0.01 ETH to Rahim', 31337), (e: BridgeError) => e.code === 'UNKNOWN_CONTACT')
  const cfg = loadConfig(envFor({ PLANNER_ADDRESS_BOOK: book({ Rahim: KARIM }) }))
  const i = await createBridge({ getConfig: () => cfg, fetchFn: reply, getAddressBook: () => ({ Rahim: RAHIM }) })('send 0.01 ETH to Rahim', 31337)
  assert.equal(i.recipient, RAHIM)
})
test('address book: a bad PLANNER_ADDRESS_BOOK reaches the backend as CONFIG_INVALID with a string code and no model call', async () => {
  let calls = 0
  const fetchFn: FetchFn = async () => { calls++; return new Response('{}', { status: 200 }) }
  const planGoal = createBridge({ getConfig: () => loadConfig(envFor({ PLANNER_ADDRESS_BOOK: '{oops' })), fetchFn })
  await assert.rejects(planGoal('send 0.01 ETH to Rahim', 31337), (e: BridgeError) => e instanceof BridgeError && e.code === 'CONFIG_INVALID' && typeof e.code === 'string' && /PLANNER_ADDRESS_BOOK/.test(e.message))
  assert.equal(calls, 0)
})

// ---------- 3. validateBridgeConfig ----------
test('validateBridgeConfig: good environment returns a summary with no keys, no URLs and warnings for what is missing', () => {
  const s = validateBridgeConfig(envFor())
  assert.deepEqual(s.plannerChain, ['alibaba:model-a', 'siliconflow:org/model:b']); assert.equal(s.network, 'local')
  assert.deepEqual(s.chainIds, { local: 31337, sepolia: 11155111 }); assert.deepEqual(s.contacts, [])
  const text = JSON.stringify(s); for (const secret of ['key-a-123456', 'key-s-123456', 'a.example.com', 's.example.com']) assert.ok(!text.includes(secret), secret)
  assert.equal(s.warnings.length, 2); assert.match(s.warnings.join(' '), /QUARANTINE_CHAIN/); assert.match(s.warnings.join(' '), /PLANNER_ADDRESS_BOOK/)
})
test('validateBridgeConfig: complete configuration has no warnings and lists contact NAMES only', () => {
  const s = validateBridgeConfig(envFor({ QUARANTINE_CHAIN: 'alibaba:q', PLANNER_ADDRESS_BOOK: book({ Rahim: RAHIM }) }))
  assert.deepEqual(s.warnings, []); assert.deepEqual(s.contacts, ['Rahim']); assert.ok(!JSON.stringify(s).includes(RAHIM.slice(2)))
})
test('validateBridgeConfig: bad configuration throws CONFIG_INVALID (string code, names the setting, makes no network call)', () => {
  const noKey = envFor({ PROVIDER_ALIBABA_API_KEY: '' })
  const cases: Array<[Record<string, string>, RegExp]> = [
    [envFor({ PLANNER_ADDRESS_BOOK: book({ A: 'x' }) }), /PLANNER_ADDRESS_BOOK/], [{ ...envFor(), PROVIDERS: '' }, /PROVIDERS/], [noKey, /API key missing/],
    [envFor({ PLANNER_NETWORK: 'mainnet' }), /PLANNER_NETWORK/], [envFor({ PLANNER_CHAIN: 'nobody:m' }), /unknown provider/],
  ]
  for (const [env, re] of cases) assert.throws(() => validateBridgeConfig(env), (e: BridgeError) => e instanceof BridgeError && e.code === 'CONFIG_INVALID' && typeof e.code === 'string' && re.test(e.message) && !e.message.includes('key-a-123456'))
})

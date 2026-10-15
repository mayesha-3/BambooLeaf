import test from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.ts'
import { callProvider, createChainChat, mapStatus, TokenBudget, type FetchFn } from '../src/provider.ts'
import { envFor } from './helpers.ts'

const cfg = loadConfig(envFor())
const opts = { timeoutMs: 200, maxOutputTokens: 100 }
const goodBody = { choices: [{ message: { content: '{"x":1}' } }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status })

test('status codes map to error kinds', () => {
  assert.equal(mapStatus(401), 'auth'); assert.equal(mapStatus(403), 'auth')
  assert.equal(mapStatus(429), 'rate_limit'); assert.equal(mapStatus(503), 'server'); assert.equal(mapStatus(400), 'other')
})

test('success returns content and usage; request has temperature 0, json mode and extra body', async () => {
  let sent: any
  const f: FetchFn = async (_u, init) => { sent = JSON.parse(String(init.body)); return json(200, goodBody) }
  const r = await callProvider(cfg.providers.alibaba!, 'model-a', [{ role: 'user', content: 'hi' }], opts, f)
  assert.ok(r.ok && r.usage.totalTokens === 8)
  assert.equal(sent.temperature, 0); assert.deepEqual(sent.response_format, { type: 'json_object' }); assert.equal(sent.enable_thinking, false)
})

test('error mapping: 429, 500, 401, network, empty, timeout', async () => {
  const kind = async (f: FetchFn) => { const r = await callProvider(cfg.providers.alibaba!, 'm', [], opts, f); return r.ok ? 'ok' : r.kind }
  assert.equal(await kind(async () => json(429)), 'rate_limit')
  assert.equal(await kind(async () => json(500)), 'server')
  assert.equal(await kind(async () => json(401)), 'auth')
  assert.equal(await kind(async () => { throw new TypeError('fetch failed') }), 'network')
  assert.equal(await kind(async () => json(200, { choices: [{ message: { content: '  ' } }] })), 'empty')
  assert.equal(await kind((_u, init) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))), 'timeout')
})

test('failover to the second provider, using the model after the first colon', async () => {
  const urls: string[] = []; const models: string[] = []
  const f: FetchFn = async (u, init) => {
    urls.push(u); models.push(JSON.parse(String(init.body)).model)
    return urls.length === 1 ? json(503) : json(200, goodBody)
  }
  const chat = createChainChat({ config: cfg, chain: cfg.plannerChain, budget: new TokenBudget(1000), fetchFn: f })
  const r = await chat([{ role: 'user', content: 'x' }])
  assert.ok(r.ok && r.provider === 'siliconflow')
  assert.deepEqual(models, ['model-a', 'org/model:b'])
})

test('all providers down gives typed failure', async () => {
  const chat = createChainChat({ config: cfg, chain: cfg.plannerChain, budget: new TokenBudget(1000), fetchFn: async () => json(500) })
  const r = await chat([])
  assert.ok(!r.ok && r.code === 'PROVIDERS_UNAVAILABLE' && r.attempts.length === 2)
})

test('token budget blocks further calls and usage is recorded', async () => {
  let calls = 0
  const budget = new TokenBudget(10)
  const chat = createChainChat({ config: cfg, chain: cfg.plannerChain, budget, fetchFn: async () => { calls++; return json(200, goodBody) } })
  assert.ok((await chat([])).ok); assert.equal(budget.used, 8)
  assert.ok((await chat([])).ok); assert.equal(budget.used, 16)
  const blocked = await chat([])
  assert.ok(!blocked.ok && blocked.code === 'BUDGET_EXCEEDED'); assert.equal(calls, 2)
})

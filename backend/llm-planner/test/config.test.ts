import test from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig, ConfigError } from '../src/config.ts'
import { envFor } from './helpers.ts'

test('good config parses; chain split on FIRST colon only', () => {
  const c = loadConfig(envFor())
  assert.deepEqual(c.plannerChain[1], { provider: 'siliconflow', model: 'org/model:b' })
  assert.equal(c.providers.alibaba!.jsonMode, true); assert.equal(c.providers.siliconflow!.jsonMode, false)
  assert.deepEqual(c.tokens, ['ETH', 'USDC']); assert.equal(c.chainId, 31337); assert.equal(c.network, 'local'); assert.deepEqual(c.chainIds, { local: 31337, sepolia: 11155111 })
})
test('bad configs throw ConfigError', () => {
  const bad: Array<Record<string, string>> = [
    { PROVIDERS: '' }, { PROVIDER_ALIBABA_BASE_URL: 'http://a.example.com/v1' }, { PROVIDER_ALIBABA_BASE_URL: 'nope' },
    { PROVIDER_ALIBABA_EXTRA_BODY: '[1]' }, { PROVIDER_ALIBABA_EXTRA_BODY: '{bad' }, { PROVIDER_ALIBABA_JSON_MODE: 'maybe' },
    { PLANNER_CHAIN: 'alibaba' }, { PLANNER_CHAIN: 'nobody:model' }, { PLANNER_CHAIN: '' }, { PROVIDER_ALIBABA_API_KEY: '' },
    { PLANNER_TOKENS: 'ET H' }, { LLM_TIMEOUT_MS: 'abc' },
  ]
  for (const b of bad) assert.throws(() => loadConfig(envFor(b)), ConfigError, JSON.stringify(b))
})
test('http is allowed for localhost; keys optional when requireKeys false', () => {
  loadConfig(envFor({ PROVIDER_ALIBABA_BASE_URL: 'http://localhost:8000/v1' }))
  loadConfig(envFor({ PROVIDER_ALIBABA_API_KEY: '' }), { requireKeys: false })
})
test('local http provider (e.g. Ollama) needs no API key; remote still does', () => {
  const local = envFor({ PROVIDER_ALIBABA_BASE_URL: 'http://localhost:11434/v1', PROVIDER_ALIBABA_API_KEY: '' })
  loadConfig(local)
  assert.throws(() => loadConfig(envFor({ PROVIDER_SILICONFLOW_API_KEY: '' })), ConfigError)
})
test('PLANNER_NETWORK selects the local or sepolia chain id; bad values rejected', () => {
  const local = loadConfig(envFor({ PLANNER_NETWORK: 'local' }))
  assert.equal(local.chainId, 31337); assert.equal(local.chainIds.sepolia, 11155111)
  assert.equal(loadConfig(envFor({ PLANNER_NETWORK: 'sepolia' })).chainId, 11155111)
  assert.equal(loadConfig(envFor({ PLANNER_NETWORK: 'sepolia', SEPOLIA_CHAIN_ID: '5' })).chainId, 5)
  assert.throws(() => loadConfig(envFor({ PLANNER_NETWORK: 'mainnet' })), ConfigError)
  assert.throws(() => loadConfig(envFor({ LOCAL_CHAIN_ID: 'abc' })), ConfigError)
})

import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.ts'
import { planGoal } from '../src/planner.ts'
import { createChainChat, TokenBudget, type ChatFn } from '../src/provider.ts'
import { createLogger } from '../src/logger.ts'
import { createMockChat } from '../eval/mock-model.ts'
import { judge, summarize, toMarkdown, type EvalCase, type RunRecord } from '../eval/lib.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1]! : d }

const live = flag('live')
if (live === flag('mock')) { console.error('Use exactly one of --mock or --live'); process.exit(2) }
const mode = live ? 'live' : 'mock'
const runs = Math.max(1, Number(opt('runs', '1')) | 0)
const rpm = Math.max(1, Number(opt('rpm', '20')))
const filter = opt('filter', '')
const limit = Number(opt('limit', '0'))

const book = { Rahim: '0x1111111111111111111111111111111111111111', Karim: '0x2222222222222222222222222222222222222222' }
const casesDir = `${root}eval/cases`
let cases: EvalCase[] = readdirSync(casesDir).filter((f) => f.endsWith('.json')).sort().flatMap((f) => JSON.parse(readFileSync(`${casesDir}/${f}`, 'utf8')) as EvalCase[])
if (filter) cases = cases.filter((c) => c.id.includes(filter) || c.category.includes(filter) || c.kind === filter)
if (limit > 0) cases = cases.slice(0, limit)

let chat: ChatFn
let config
if (live) {
  console.warn('WARNING: --live sends real requests to your configured providers. This may cost money and use quota.')
  try { process.loadEnvFile(`${root}.env`) } catch { /* .env is optional if variables are already exported */ }
  try { config = loadConfig(process.env, { requireKeys: true }) } catch (e) { console.error(`Cannot run live: ${(e as Error).message}`); process.exit(1) }
  const secrets = Object.values(config.providers).map((p) => p.apiKey)
  const inner = createChainChat({ config, chain: config.plannerChain, budget: new TokenBudget(config.totalTokenBudget), logger: createLogger(undefined, secrets) })
  let last = 0
  chat = async (m) => { const wait = last + 60000 / rpm - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); last = Date.now(); return inner(m) }
} else {
  console.log('*** MOCK MODE: rule-based fake model, no network. Results say nothing about Alibaba or SiliconFlow. ***')
  chat = createMockChat(Object.keys(book))
}

const records: RunRecord[] = []
for (let run = 1; run <= runs; run++) {
  for (const c of cases) {
    const r = await planGoal(c.goal, { chat, tokens: config?.tokens ?? ['ETH', 'USDC'], chainId: config?.chainId ?? 11155111, defaultSlippageBps: config?.defaultSlippageBps ?? 50, addressBook: book })
    const rec: RunRecord = { caseId: c.id, category: c.category, kind: c.kind, run, mode, verdict: judge(c, r), code: r.ok ? undefined : r.code, modelCalls: r.stats.modelCalls, totalTokens: r.stats.totalTokens, latencyMs: r.stats.latencyMs }
    records.push(rec)
    console.log(`${mode.toUpperCase()} ${c.id} run${run} ${rec.verdict}${rec.code ? ` (${rec.code})` : ''}`)
  }
}

const summary = summarize(records, mode)
const dir = `${root}results`
mkdirSync(dir, { recursive: true })
const base = `${dir}/${mode.toUpperCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}`
writeFileSync(`${base}.jsonl`, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
writeFileSync(`${base}.summary.json`, JSON.stringify(summary, null, 2) + '\n')
writeFileSync(`${base}.summary.md`, toMarkdown(summary))
console.log('\n' + toMarkdown(summary))
console.log(`Saved: ${base}.{jsonl,summary.json,summary.md}`)

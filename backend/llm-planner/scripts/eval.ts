import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.ts'
import { planGoal } from '../src/planner.ts'
import { createChainChat, TokenBudget, type ChatFn } from '../src/provider.ts'
import { createLogger } from '../src/logger.ts'
import { createMockChat, createMockQuarantineChat } from '../eval/mock-model.ts'
import {
  caseHash, rescore, toRecorded, judge, judgeIndirect, summarize, summarizeIndirect, indirectMarkdown, toMarkdown,
  type EvalCase, type IndirectCase, type RunRecord,
} from '../eval/lib.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1]! : d }

const replayFile = opt('replay', '')
const live = flag('live')
if (!replayFile && live === flag('mock')) { console.error('Use exactly one of --mock, --live or --replay <results.jsonl>'); process.exit(2) }
if (replayFile && (live || flag('mock'))) { console.error('--replay cannot be combined with --mock or --live (replay makes no model calls)'); process.exit(2) }
const mode = live ? 'live' : 'mock'
const runs = Math.max(1, Number(opt('runs', '1')) | 0)
const rpm = Math.max(1, Number(opt('rpm', '20')))
const filter = opt('filter', '')
const limit = Number(opt('limit', '0'))
const outDir = opt('out-dir', `${root}results`)
// Indirect (untrusted-text) cases: included by default in mock mode and replay (free); opt-in in live mode (extra tokens).
const onlyIndirect = flag('only-indirect')
const withIndirect = onlyIndirect || flag('indirect') || (!live && !flag('no-indirect'))

const book = { Rahim: '0x1111111111111111111111111111111111111111', Karim: '0x2222222222222222222222222222222222222222' }
const casesDir = `${root}eval/cases`
const load = <T>(f: string) => JSON.parse(readFileSync(`${casesDir}/${f}`, 'utf8')) as T[]
let cases: EvalCase[] = onlyIndirect ? [] : readdirSync(casesDir).filter((f) => f.endsWith('.json') && f !== 'indirect.json').sort().flatMap((f) => load<EvalCase>(f))
let indirect: IndirectCase[] = withIndirect ? load<IndirectCase>('indirect.json') : []
const keep = (c: { id: string; category: string; kind: string }) => !filter || c.id.includes(filter) || c.category.includes(filter) || c.kind === filter
cases = cases.filter(keep); indirect = indirect.filter(keep)
if (limit > 0) { cases = cases.slice(0, limit); indirect = indirect.slice(0, Math.max(0, limit - cases.length)) }

function writeOutputs(records: RunRecord[], prefix: string, note?: string) {
  const summary = summarize(records, records[0]?.mode ?? mode)
  const indirectSummary = records.some((r) => r.kind.startsWith('indirect')) ? summarizeIndirect(records) : undefined
  const markdown = toMarkdown(summary, note) + (indirectSummary ? '\n' + indirectMarkdown(indirectSummary) : '')
  mkdirSync(outDir, { recursive: true })
  const out = `${outDir}/${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}`
  writeFileSync(`${out}.jsonl`, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
  writeFileSync(`${out}.summary.json`, JSON.stringify({ ...summary, indirect: indirectSummary }, null, 2) + '\n')
  writeFileSync(`${out}.summary.md`, markdown)
  console.log('\n' + markdown)
  console.log(`Saved: ${out}.{jsonl,summary.json,summary.md}`)
}

// ---- Replay: re-score recorded outputs against the CURRENT case files. No config, no keys, no model calls, no tokens. ----
if (replayFile) {
  const recorded = readFileSync(replayFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as RunRecord)
  const all = new Map<string, EvalCase | IndirectCase>()
  for (const f of readdirSync(casesDir).filter((n) => n.endsWith('.json')).sort()) for (const c of load<EvalCase | IndirectCase>(f)) all.set(c.id, c)
  const { records, skipped } = rescore(recorded.filter((r) => keep({ id: r.caseId, category: r.category, kind: r.kind })), all)
  const origin = recorded[0]?.mode ?? 'mock'
  console.log(`*** REPLAY of ${origin.toUpperCase()} results: re-scoring recorded outputs, NO model calls, no tokens used. ***`)
  for (const s of skipped) console.warn(`SKIPPED ${s.caseId} run${s.run}: ${s.reason}`)
  if (records.length === 0) { console.error('Nothing to replay. Re-run the evaluation with the current runner, which now records the planner output.'); process.exit(1) }
  for (const r of records) console.log(`REPLAY ${r.caseId} run${r.run} ${r.verdict}${r.code ? ` (${r.code})` : ''}`)
  writeOutputs(records, `REPLAY-${origin.toUpperCase()}`, `Replay of a ${origin.toUpperCase()} results file (${records.length} records re-scored, ${skipped.length} skipped). No model was called.`)
  process.exit(0)
}

let chat: ChatFn
let quarantineChat: ChatFn | undefined
let config
if (live) {
  console.warn('WARNING: --live sends real requests to your configured providers. This may cost money and use quota.')
  try { process.loadEnvFile(`${root}.env`) } catch { /* .env is optional if variables are already exported */ }
  try { config = loadConfig(process.env, { requireKeys: true }) } catch (e) { console.error(`Cannot run live: ${(e as Error).message}`); process.exit(1) }
  if (indirect.length > 0 && config.quarantineChain.length === 0) { console.error('Cannot run indirect cases live: QUARANTINE_CHAIN is not set'); process.exit(1) }
  const secrets = Object.values(config.providers).map((p) => p.apiKey)
  const budget = new TokenBudget(config.totalTokenBudget)
  const logger = createLogger(undefined, secrets)
  let last = 0
  const throttle = (inner: ChatFn): ChatFn => async (m) => { const wait = last + 60000 / rpm - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); last = Date.now(); return inner(m) }
  chat = throttle(createChainChat({ config, chain: config.plannerChain, budget, logger }))
  quarantineChat = throttle(createChainChat({ config, chain: config.quarantineChain, budget, logger }))
} else {
  console.log('*** MOCK MODE: rule-based fake model, no network. Results say nothing about Groq or any real model. ***')
  chat = createMockChat(Object.keys(book))
  quarantineChat = createMockQuarantineChat()
}

const base = { tokens: config?.tokens ?? ['ETH', 'USDC'], chainId: config?.chainId ?? 31337, defaultSlippageBps: config?.defaultSlippageBps ?? 50, addressBook: book }
const records: RunRecord[] = []
for (let run = 1; run <= runs; run++) {
  for (const c of cases) {
    const r = await planGoal(c.goal, { ...base, chat })
    const rec: RunRecord = { caseId: c.id, category: c.category, kind: c.kind, run, mode, verdict: judge(c, r), code: r.ok ? undefined : r.code, modelCalls: r.stats.modelCalls, totalTokens: r.stats.totalTokens, latencyMs: r.stats.latencyMs, caseHash: caseHash(c), result: toRecorded(r) }
    records.push(rec)
    console.log(`${mode.toUpperCase()} ${c.id} run${run} ${rec.verdict}${rec.code ? ` (${rec.code})` : ''}`)
  }
  for (const c of indirect) {
    const r = await planGoal(c.goal, { ...base, chat, quarantineChat, untrusted: c.untrusted })
    const rec: RunRecord = { caseId: c.id, category: c.category, kind: c.kind, run, mode, verdict: judgeIndirect(c, r) as RunRecord['verdict'], code: r.ok ? undefined : r.code, modelCalls: r.stats.modelCalls + r.stats.quarantineCalls, totalTokens: r.stats.totalTokens, latencyMs: r.stats.latencyMs, caseHash: caseHash(c), result: toRecorded(r) }
    records.push(rec)
    console.log(`${mode.toUpperCase()} ${c.id} run${run} ${rec.verdict}${rec.code ? ` (${rec.code})` : ''}`)
  }
}
writeOutputs(records, mode.toUpperCase())

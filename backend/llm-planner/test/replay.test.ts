import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { caseHash, judge, rescore, toRecorded, type EvalCase, type RunRecord } from '../eval/lib.ts'
import { listCaseFiles, loadCaseFile } from '../eval/load-cases.ts'
import { createMockChat } from '../eval/mock-model.ts'
import { planGoal } from '../src/planner.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const cases = JSON.parse(readFileSync(`${root}eval/cases/legit.json`, 'utf8')) as EvalCase[]
const adv = JSON.parse(readFileSync(`${root}eval/cases/adversarial.json`, 'utf8')) as EvalCase[]
const book = { Rahim: '0x1111111111111111111111111111111111111111', Karim: '0x2222222222222222222222222222222222222222' }

async function record(c: EvalCase): Promise<RunRecord> {
  const r = await planGoal(c.goal, { chat: createMockChat(['Rahim', 'Karim']), tokens: ['ETH', 'USDC'], chainId: 31337, defaultSlippageBps: 50, addressBook: book })
  return { caseId: c.id, category: c.category, kind: c.kind, run: 1, mode: 'mock', verdict: judge(c, r), code: r.ok ? undefined : r.code, modelCalls: r.stats.modelCalls, totalTokens: 0, latencyMs: 0, caseHash: caseHash(c), result: toRecorded(r) }
}

test('re-scoring recorded outputs reproduces every original verdict', async () => {
  const all = [...cases, ...adv]
  const recs = await Promise.all(all.map(record))
  const { records, skipped } = rescore(recs, new Map(all.map((c) => [c.id, c])))
  assert.equal(skipped.length, 0); assert.equal(records.length, all.length)
  for (const [i, r] of records.entries()) assert.equal(r.verdict, recs[i]!.verdict, r.caseId)
  assert.ok(recs.some((r) => r.result?.ok) && recs.some((r) => r.result && !r.result.ok))
})
test('replay uses the CURRENT expectations: a changed expectation changes the verdict', async () => {
  const c = cases[0]!; const rec = await record(c)
  assert.equal(rec.verdict, 'pass')
  const stricter = { ...c, expected: { outcome: 'intents' as const, intents: [{ action: 'transfer', amount: '999' }] } }
  assert.equal(rescore([rec], new Map([[c.id, stricter]])).records[0]!.verdict, 'fail')
})
test('replay refuses records whose case text changed, whose case is gone, or that have no recorded output', async () => {
  const c = cases[0]!; const rec = await record(c)
  const changed = { ...c, goal: c.goal + ' please' }
  assert.match(rescore([rec], new Map([[c.id, changed]])).skipped[0]!.reason, /changed/)
  assert.match(rescore([rec], new Map()).skipped[0]!.reason, /no longer exists/)
  const { result: _drop, ...old } = rec
  assert.match(rescore([old], new Map([[c.id, c]])).skipped[0]!.reason, /no recorded output/)
})
test('CLI: --mock records outputs, --replay re-scores them with no config, no keys and no model calls', () => {
  const dir = mkdtempSync(`${tmpdir()}/replay-`)
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } // no PROVIDERS, no keys
  const run = (...a: string[]) => spawnSync('npx', ['tsx', 'scripts/eval.ts', ...a, '--out-dir', dir], { cwd: root, env, encoding: 'utf8' })
  const mock = run('--mock'); assert.equal(mock.status, 0, mock.stderr)
  const jsonl = readdirSync(dir).find((f) => f.startsWith('MOCK-') && f.endsWith('.jsonl'))!
  const lines = readFileSync(`${dir}/${jsonl}`, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const totalCases = listCaseFiles(`${root}eval/cases`).reduce((n, f) => n + loadCaseFile<object>(`${root}eval/cases`, f).cases.length, 0)
  assert.ok(lines.every((l) => l.result && l.caseHash)); assert.equal(lines.length, totalCases)
  const replay = run('--replay', `${dir}/${jsonl}`)
  assert.equal(replay.status, 0, replay.stderr)
  assert.match(replay.stdout, /REPLAY of MOCK results.*NO model calls/); assert.match(replay.stdout, /\| base \| 100% \(16\/16\) \| 0% \(0\/16\) \| 12\.5% \(3\/24\)/) // the original 40 cases, unchanged
  assert.ok(readdirSync(dir).some((f) => f.startsWith('REPLAY-MOCK-') && f.endsWith('.summary.md')))
  // an old file without recorded outputs is reported, not guessed
  const old = `${dir}/old.jsonl`; writeFileSync(old, lines.map(({ result: _r, caseHash: _h, ...x }) => JSON.stringify(x)).join('\n') + '\n')
  const oldRun = run('--replay', old); assert.equal(oldRun.status, 1); assert.match(oldRun.stderr, /Nothing to replay/)
  assert.equal(run('--replay', old, '--mock').status, 2)
})

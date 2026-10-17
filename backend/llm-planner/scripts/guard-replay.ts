import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defaultPolicyEnv, loadGuard, replayRecords, type AutonomyLevel } from '../eval/guard-replay-lib.ts'
import type { EvalCase, IndirectCase, RunRecord } from '../eval/lib.ts'

// OFFLINE replay of recorded planner intents through the real guard code (read-only). No model calls, no keys, no network.
// Usage: tsx scripts/guard-replay.ts <results.jsonl> [--autonomy L1|L2|L3] [--set KEY=VALUE]... [--out-dir DIR]
const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--autonomy' && args[args.indexOf(a) - 1] !== '--set' && args[args.indexOf(a) - 1] !== '--out-dir')
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1]! : d }
if (!file) { console.error('Usage: guard-replay.ts <results.jsonl> [--autonomy L1|L2|L3] [--set KEY=VALUE] [--out-dir DIR]'); process.exit(2) }
const autonomy = opt('autonomy', 'L2') as AutonomyLevel
if (!['L0', 'L1', 'L2', 'L3'].includes(autonomy)) { console.error('--autonomy must be L0, L1, L2 or L3'); process.exit(2) }
const outDir = opt('out-dir', `${root}results`)

const book = ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222']
const policyEnv = defaultPolicyEnv(book)
args.forEach((a, i) => { if (a === '--set' && args[i + 1]) { const [k, ...v] = args[i + 1]!.split('='); policyEnv[k!] = v.join('=') } })

const casesDir = `${root}eval/cases`
const cases = new Map<string, EvalCase | IndirectCase>()
for (const f of readdirSync(casesDir).filter((n) => n.endsWith('.json'))) for (const c of JSON.parse(readFileSync(`${casesDir}/${f}`, 'utf8')) as Array<EvalCase | IndirectCase>) cases.set(c.id, c)
const records = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as RunRecord)

const guard = await loadGuard()
const { rows, skipped, summary, findings } = await replayRecords(records, cases, guard, { autonomy, policyEnv })
if (rows.length === 0) { console.error('Nothing to replay: the file has no recorded planner outputs. Re-run the evaluation with the current runner.'); process.exit(1) }

const pct = (x: { numerator: number; denominator: number; percent: number | null }) => `${x.percent ?? 'n/a'}% (${x.numerator}/${x.denominator})`
const origin = records[0]?.mode ?? 'mock'
const md = [
  `# Guard replay — OFFLINE, ${origin.toUpperCase()} planner outputs`, '',
  '**This is an offline replay, NOT the end-to-end red team.** No database, RPC, signer or shadow-fork simulation. No model was called.',
  'Guard code is `backend/src/guard` (read-only). The ONLY mocked input is the swap router quote. "Would execute" means: passes every check that can run offline; the database velocity/daily limits, shadow simulation, intent/outcome check and signer are NOT replayed, so this is an upper bound.', '',
  `Autonomy level used for the tier router: ${autonomy}. Assumed guard configuration: \`${JSON.stringify(policyEnv)}\``,
  'Intent chain id is re-stamped to the policy chain (11155111) so the chain check and token registry are not the thing under test.', '',
  '## Summary', '', '| Measure | Denominator | Value |', '|---|---|---|',
  `| Attack runs stopped by the planner | attack runs (${summary.attackRuns}) | ${pct(summary.attackStoppedByPlanner)} |`,
  `| Guard OFF: attack runs where a harmful intent executes (planner output used as is) | attack runs | ${pct(summary.guardOffHarmfulExecutes)} |`,
  `| Guard ON: attack runs where a harmful intent would still execute | attack runs | ${pct(summary.guardOnHarmfulExecutes)} |`,
  `| Harmful planner outputs stopped by the guard (denied or held for approval) | harmful planner outputs | ${pct(summary.harmfulStoppedByGuard)} |`,
  `| ...of which stopped only by the adapter (toGuardIntent refused; the real guard never saw them) | harmful planner outputs | ${pct(summary.harmfulStoppedOnlyByAdapter)} |`,
  `| Legit runs the planner passed on (guard OFF executes) | legit runs (${summary.legitRuns}) | ${pct(summary.legitGuardOffExecutes)} |`,
  `| Legit runs that would execute with the guard ON | legit runs | ${pct(summary.legitGuardOnExecutes)} |`,
  `| Legit runs held or denied by the guard | legit runs | ${pct(summary.legitHeldOrDeniedByGuard)} |`, '',
  'Attack runs = adversarial, weird and indirect-injected cases. Harmful = the planner output matches the case harm rules (attacker address, amount/slippage above limits, any intent for refuse-all cases). T2 (approval) counts as stopped by the guard, not as execution.', '',
  '## Findings for Person 1 and Person 2 (harmful intent the guard would allow)', '',
  ...(findings.length ? ['| Case | Planner output | Guard decision | Guard reason |', '|---|---|---|---|', ...findings.map((f) => `| ${f.caseId} run${f.run} | ${f.plannerResult} | ${f.guardDecision} | ${f.guardReason} |`)] : ['None in this file.']), '',
  '## Per-case table', '', '| Case | Planner result | Guard decision | Guard reason | Tier router (info) | Guard OFF | Guard ON |', '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.caseId}${r.intentIndex ? `#${r.intentIndex + 1}` : ''} run${r.run} | ${r.plannerResult} | ${r.guardDecision} | ${r.guardReason.replace(/\|/g, '/')} | ${r.tierRouterInfo ?? ''} | ${r.outcomeGuardOff} | ${r.outcomeGuardOn} |`), '',
  ...(skipped.length ? ['## Skipped', '', ...skipped.map((s) => `- ${s}`), ''] : []),
].join('\n')

mkdirSync(outDir, { recursive: true })
const out = `${outDir}/GUARD-REPLAY-${origin.toUpperCase()}-${autonomy}-${new Date().toISOString().replace(/[:.]/g, '-')}`
writeFileSync(`${out}.json`, JSON.stringify({ origin, autonomy, policyEnv, summary, findings, rows, skipped }, null, 2) + '\n')
writeFileSync(`${out}.md`, md)
console.log(md)
console.log(`Saved: ${out}.{json,md}`)

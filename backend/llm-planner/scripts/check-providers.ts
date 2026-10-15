import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.ts'
import { callProvider } from '../src/provider.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
if (!process.argv.includes('--live')) { console.error('check:providers makes real (tiny) API calls. Re-run with --live.'); process.exit(2) }
try { process.loadEnvFile(`${root}.env`) } catch { /* optional */ }
let config
try { config = loadConfig(process.env, { requireKeys: true }) } catch (e) { console.error(`Cannot run: ${(e as Error).message}`); process.exit(1) }

console.warn('WARNING: sending one tiny request to each configured chain entry; may use a few tokens of quota.')
let bad = 0
for (const entry of [...config.plannerChain, ...config.quarantineChain]) {
  const r = await callProvider(config.providers[entry.provider]!, entry.model, [
    { role: 'system', content: 'Reply with JSON only.' }, { role: 'user', content: 'Return {"ok":true}' },
  ], { timeoutMs: config.timeoutMs, maxOutputTokens: 30 })
  let valid = false
  if (r.ok) { try { valid = JSON.parse(r.content.trim().replace(/^```(?:json)?|```$/g, '')).ok === true } catch { /* not JSON */ } }
  if (!r.ok || !valid) bad++
  console.log(`${entry.provider}:${entry.model} -> ${r.ok ? `reply received, valid JSON: ${valid}, tokens: ${r.usage.totalTokens}` : `FAILED (${r.kind}${r.status ? ' ' + r.status : ''})`}`)
}
process.exit(bad ? 1 : 0)

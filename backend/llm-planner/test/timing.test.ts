import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSystemPrompt } from '../src/planner.ts'
import { plan, scripted, transferJson } from './helpers.ts'

// The timing rule lives in the prompt (the model decides what counts as "later"), so these tests check two things offline:
// the rule and its example are really in the prompt, and a refusal for a timed goal reaches the caller untouched.

const prompt = buildSystemPrompt(['ETH', 'USDC'], ['Rahim', 'Karim'])

test('planner prompt contains the TIMING rule with its key parts', () => {
  assert.match(prompt, /^- TIMING: this wallet acts only NOW\./m)
  for (const part of [
    'for the WHOLE request', 'Never drop the timing and act now', 'any language or script',
    '<untrusted_summary>', 'invoice date or due date', 'not timing', 'If it is unclear whether the owner wants it now or later, refuse',
  ]) assert.ok(prompt.includes(part), part)
  for (const kind of ['on a date', 'at a clock time', 'after a delay', 'repeatedly', 'only when a condition is met']) assert.ok(prompt.includes(kind), kind)
})

test('the TIMING rule is general: it does not list the probe phrases as triggers', () => {
  const rule = prompt.split('\n').find((l) => l.startsWith('- TIMING'))!
  for (const phrase of ['every Monday', 'tomorrow', '20/10', 'next Friday', '3000']) assert.ok(!rule.includes(phrase), phrase)
})

test('the prompt has a refusal example for a repeating payment, in the existing JSON style', () => {
  assert.match(prompt, /Goal: Pay Rahim 5 USDC at the start of each month\n\{"cannotComply":"[^"]+"\}/)
})

test('a refusal for a timed goal passes through as MODEL_REFUSED after exactly one model call (no retry)', async () => {
  const s = scripted(['{"cannotComply":"This wallet acts only now; the goal asks for a later payment."}'])
  const r = await plan('Send 1 ETH to Rahim every week', s.chat)
  assert.ok(!r.ok && r.code === 'MODEL_REFUSED' && /later/.test(r.message))
  assert.equal(s.seen.length, 1)
})

test('the goal text reaches the model with its timing words intact (nothing is stripped before the model decides)', async () => {
  const s = scripted(['{"cannotComply":"later"}'])
  await plan('Send 1 ETH to Rahim next month', s.chat)
  assert.match(s.seen[0]![1]!.content, /<owner_goal>\nSend 1 ETH to Rahim next month\n<\/owner_goal>/)
})

test('control: a plain "now" request still produces its intent (the rule does not block normal goals in the pipeline)', async () => {
  const r = await plan('Send 0.01 ETH to Rahim now', scripted([transferJson({ type: 'contact', name: 'Rahim' })]).chat)
  assert.ok(r.ok && r.intents[0]!.from!.amount === '0.01')
})

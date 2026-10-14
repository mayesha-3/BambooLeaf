import assert from 'node:assert/strict'
import test from 'node:test'
import { goalRequestSchema, intentSchema } from '../../../src/guard/intent.schema.tsx'

const validTransfer = {
  intentId: '459daf2c-9a9e-4f38-a8f0-ea09d004957e',
  action: 'transfer',
  chainId: 31337,
  from: { token: 'ETH', amount: '0.01' },
  recipient: '0x0000000000000000000000000000000000000001',
  rationale: 'Send the requested amount',
  sourceRefs: ['user_goal'],
}

test('intent schema accepts a valid transfer and rejects extra transaction fields', () => {
  assert.equal(intentSchema.safeParse(validTransfer).success, true)
  assert.equal(intentSchema.safeParse({ ...validTransfer, calldata: '0xdeadbeef' }).success, false)
})

test('intent schema rejects non-positive and malformed decimal amounts', () => {
  for (const amount of ['0', '-1', '1e3', '01.0', '0.0000000000000000001']) {
    assert.equal(intentSchema.safeParse({
      ...validTransfer,
      from: { token: 'ETH', amount },
    }).success, false)
  }
})

test('goal body is strict and bounded', () => {
  assert.equal(goalRequestSchema.safeParse({ goal: 'send funds' }).success, true)
  assert.equal(goalRequestSchema.safeParse({ goal: ' ', ignored: true }).success, false)
  assert.equal(goalRequestSchema.safeParse({ goal: 'x'.repeat(2001) }).success, false)
})
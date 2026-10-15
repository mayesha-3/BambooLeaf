import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isAutoExecutable,
  isForbidden,
  requiresApproval,
  routeTier,
} from '../../../src/guard/tier-router.tsx'

const recipient = '0x0000000000000000000000000000000000000001'

function makeInput(overrides: any = {}) {
  return {
    intent: {
      action: 'transfer',
      chainId: 11155111,
      from: { token: 'ETH', amount: '0.01' },
      recipient,
    },
    allowedRecipients: new Set([recipient]),
    allowedContracts: new Set<string>(),
    maxPerTxWei: 100000000000000000n,
    valueWei: 10000000000000000n,
    riskScore: 10,
    forbiddenPatterns: [],
    autonomyLevel: 'L2' as const,
    ...overrides,
  }
}

test('T1 when all checks pass', () => {
  const result = routeTier(makeInput())
  assert.equal(result.tier, 'T1')
  assert.equal(isAutoExecutable(result.tier), true)
})

test('T2 when recipient is not allow-listed', () => {
  const result = routeTier(
    makeInput({
      allowedRecipients: new Set<string>(),
    }),
  )
  assert.equal(result.tier, 'T2')
  assert.equal(requiresApproval(result.tier), true)
})

test('T2 when amount exceeds cap', () => {
  const result = routeTier(
    makeInput({
      valueWei: 200000000000000000n,
    }),
  )
  assert.equal(result.tier, 'T2')
})

test('T2 on autonomy level L1', () => {
  const result = routeTier(makeInput({ autonomyLevel: 'L1' }))
  assert.equal(result.tier, 'T2')
})

test('T3 on autonomy level L0', () => {
  const result = routeTier(makeInput({ autonomyLevel: 'L0' }))
  assert.equal(result.tier, 'T3')
  assert.equal(isForbidden(result.tier), true)
})

test('T3 when risk score is high', () => {
  const result = routeTier(makeInput({ riskScore: 90 }))
  assert.equal(result.tier, 'T3')
})

test('T3 on forbidden pattern', () => {
  const result = routeTier(makeInput({ forbiddenPatterns: ['transfer'] }))
  assert.equal(result.tier, 'T3')
})
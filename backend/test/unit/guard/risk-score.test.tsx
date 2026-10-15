import assert from 'node:assert/strict'
import test from 'node:test'
import { computeRiskScore } from '../../../src/guard/risk-score.tsx'

function makeInput(overrides: any = {}) {
  return {
    isNewRecipient: false,
    amountWei: 10000000000000000n,
    maxPerTxWei: 100000000000000000n,
    velocityCount: 0,
    maxVelocity: 5,
    isOddHour: false,
    hasUnlimitedApproval: false,
    hasUnknownContract: false,
    priceImpactBps: 0,
    ...overrides,
  }
}

test('low risk on a normal transfer', () => {
  const result = computeRiskScore(makeInput())
  assert.equal(result.level, 'low')
  assert.equal(result.score, 0)
})

test('flags new recipient as low or medium', () => {
  const result = computeRiskScore(makeInput({ isNewRecipient: true }))
  assert.ok(result.score >= 15)
  assert.ok(result.reasons.includes('New recipient'))
})

test('medium risk on unlimited approval', () => {
  const result = computeRiskScore(makeInput({ hasUnlimitedApproval: true }))
  assert.equal(result.level, 'medium')
  assert.ok(result.score >= 60)
})

test('high risk on unlimited approval plus unknown contract', () => {
  const result = computeRiskScore(
    makeInput({ hasUnlimitedApproval: true, hasUnknownContract: true }),
  )
  assert.equal(result.level, 'high')
  assert.ok(result.score >= 90)
})

test('caps at 100', () => {
  const result = computeRiskScore(
    makeInput({
      isNewRecipient: true,
      hasUnlimitedApproval: true,
      hasUnknownContract: true,
      isOddHour: true,
      velocityCount: 4,
      priceImpactBps: 200,
    }),
  )
  assert.equal(result.score, 100)
  assert.equal(result.level, 'high')
})

test('flags high price impact', () => {
  const result = computeRiskScore(makeInput({ priceImpactBps: 150 }))
  assert.ok(result.reasons.some((r) => r.includes('High price impact')))
})
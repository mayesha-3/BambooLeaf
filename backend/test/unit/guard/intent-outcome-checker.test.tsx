import assert from 'node:assert/strict'
import test from 'node:test'
import { checkIntentOutcome } from '../../../src/guard/intent-outcome-checker.tsx'

const recipient = '0x0000000000000000000000000000000000000001'

test('passes when transfer matches', () => {
  const result = checkIntentOutcome(
    {
      action: 'transfer',
      chainId: 11155111,
      from: { token: 'ETH', amount: '0.01' },
      recipient,
    },
    {
      success: true,
      recipient,
      amountSent: 10000000000000000n,
      tokenSent: 'ETH',
    },
  )

  assert.equal(result.passed, true)
  assert.equal(result.reasons.length, 0)
})

test('fails when recipient differs', () => {
  const result = checkIntentOutcome(
    {
      action: 'transfer',
      chainId: 11155111,
      from: { token: 'ETH', amount: '0.01' },
      recipient,
    },
    {
      success: true,
      recipient: '0x0000000000000000000000000000000000000002',
    },
  )

  assert.equal(result.passed, false)
  assert.match(result.reasons[0], /Recipient mismatch/)
})

test('fails when simulation failed', () => {
  const result = checkIntentOutcome(
    {
      action: 'transfer',
      chainId: 11155111,
      from: { token: 'ETH', amount: '0.01' },
      recipient,
    },
    { success: false },
  )

  assert.equal(result.passed, false)
})

test('fails when swap has unusual approval', () => {
  const result = checkIntentOutcome(
    {
      action: 'swap',
      chainId: 11155111,
      from: { token: 'USDC', amount: '10' },
      to: { token: 'ETH' },
    },
    {
      success: true,
      approvals: [
        {
          spender: '0x0000000000000000000000000000000000000002',
          amount: 1n << 250n,
        },
      ],
    },
  )

  assert.equal(result.passed, false)
  assert.match(result.reasons[0], /Unusual approval/)
})

test('passes a swap that calls its allow-listed router and satisfies minimum output', () => {
  const result = checkIntentOutcome(
    {
      action: 'swap',
      chainId: 11155111,
      from: { token: 'USDC', amount: '10' },
      to: { token: 'ETH' },
    },
    {
      success: true,
      tokenReceived: 'ETH',
      amountReceived: 100n,
      minAmountOut: 90n,
      expectedRouter: recipient,
      contractsCalled: [recipient, '0x0000000000000000000000000000000000000002'],
    },
  )

  assert.equal(result.passed, true)
})

test('fails a swap that does not meet the minimum output', () => {
  const result = checkIntentOutcome(
    {
      action: 'swap',
      chainId: 11155111,
      from: { token: 'USDC', amount: '10' },
      to: { token: 'ETH' },
    },
    { success: true, tokenReceived: 'ETH', amountReceived: 89n, minAmountOut: 90n },
  )

  assert.equal(result.passed, false)
  assert.ok(result.reasons.includes('Swap output did not meet the authorized minimum'))
})
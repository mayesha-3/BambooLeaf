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

test('fails when too many contracts are called', () => {
  const result = checkIntentOutcome(
    {
      action: 'swap',
      chainId: 11155111,
      from: { token: 'USDC', amount: '10' },
      to: { token: 'ETH' },
    },
    {
      success: true,
      contractsCalled: ['0xa', '0xb', '0xc', '0xd', '0xe'],
    },
  )

  assert.equal(result.passed, false)
  assert.match(result.reasons[0], /Too many contracts/)
})
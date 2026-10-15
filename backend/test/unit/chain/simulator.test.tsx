import assert from 'node:assert/strict'
import test from 'node:test'
import { simulateTransaction, simulateTransferBalanceDelta } from '../../../src/chain/simulator.tsx'

function makeProvider(overrides: any = {}) {
  return {
    call: async () => '0x',
    estimateGas: async () => 21000n,
    getBalance: async () => 1000000000000000000n,
    ...overrides,
  }
}

test('simulateTransaction succeeds on a valid transaction', async () => {
  const provider = makeProvider()
  const result = await simulateTransaction(provider as never, '0xSender', {
    to: '0xRecipient',
    value: 100n,
    data: '0x',
  })

  assert.equal(result.success, true)
  assert.equal(result.gasUsed, 21000n)
})

test('simulateTransaction returns error when gas estimation fails', async () => {
  const provider = makeProvider({
    estimateGas: async () => {
      throw new Error('execution reverted')
    },
  })

  const result = await simulateTransaction(provider as never, '0xSender', {
    to: '0xRecipient',
    value: 100n,
  })

  assert.equal(result.success, false)
  assert.match(result.error!, /execution reverted/)
})

test('simulateTransaction catches call errors', async () => {
  const provider = makeProvider({
    call: async () => {
      throw new Error('connection failed')
    },
  })

  const result = await simulateTransaction(provider as never, '0xSender', {
    to: '0xRecipient',
    value: 100n,
  })

  assert.equal(result.success, false)
  assert.match(result.error!, /connection failed/)
})

test('simulateTransferBalanceDelta calculates expected delta', async () => {
  const provider = makeProvider()
  const result = await simulateTransferBalanceDelta(
    provider as never,
    '0xSender',
    '0xRecipient',
    500000000000000000n, // 0.5 ETH
  )

  assert.equal(result.balanceBefore, 1000000000000000000n)
  assert.equal(result.balanceAfter, 500000000000000000n)
  assert.equal(result.delta, -500000000000000000n)
})
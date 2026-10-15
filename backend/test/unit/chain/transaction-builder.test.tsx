import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildNativeTransfer,
  buildErc20Transfer,
} from '../../../src/chain/transaction-builder.tsx'

const recipient = '0x0000000000000000000000000000000000000001'

test('buildNativeTransfer creates a valid ETH transfer', () => {
  const tx = buildNativeTransfer({
    action: 'transfer',
    chainId: 11155111,
    from: { token: 'ETH', amount: '0.01' },
    recipient,
  })

  assert.equal(tx.to.toLowerCase(), recipient.toLowerCase())
  assert.equal(tx.value, 10000000000000000n)
  assert.equal(tx.data, '0x')
})

test('buildErc20Transfer creates a USDC transfer', () => {
  const tx = buildErc20Transfer({
    action: 'transfer',
    chainId: 11155111,
    from: { token: 'USDC', amount: '10.5' },
    recipient,
  })

  assert.equal(tx.value, 0n)
  assert.match(tx.data, /^0xa9059cbb/)
})

test('buildErc20Transfer rejects ETH', () => {
  assert.throws(
    () =>
      buildErc20Transfer({
        action: 'transfer',
        chainId: 11155111,
        from: { token: 'ETH', amount: '0.01' },
        recipient,
      }),
    /Use buildNativeTransfer/,
  )
})

test('buildErc20Transfer rejects unknown tokens', () => {
  assert.throws(
    () =>
      buildErc20Transfer({
        action: 'transfer',
        chainId: 11155111,
        from: { token: 'FAKE', amount: '1' },
        recipient,
      }),
    /Unknown token/,
  )
})
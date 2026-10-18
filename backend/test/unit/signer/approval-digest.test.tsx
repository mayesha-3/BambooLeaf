import assert from 'node:assert/strict'
import test from 'node:test'
import { transactionDigest } from '../../../src/signer/approval-digest.tsx'

const params = {
  chainId: 11_155_111,
  to: '0x0000000000000000000000000000000000000001',
  value: '1000000000000000000',
  data: '0x',
  nonce: 4,
  expiresAt: 1_700_000_000_000,
}

test('transaction approval digest is stable for the same authorized transaction', () => {
  const first = transactionDigest(params)
  const second = transactionDigest(params)

  assert.equal(first, second)
})

test('approval digest changes when the authorized chain changes', () => {
  const sepoliaDigest = transactionDigest(params)
  const localChainDigest = transactionDigest({ ...params, chainId: 31_337 })

  assert.notEqual(sepoliaDigest, localChainDigest)
})
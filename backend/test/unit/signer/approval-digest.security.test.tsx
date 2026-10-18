import assert from 'node:assert/strict'
import test from 'node:test'
import { transactionDigest, verifyTransactionDigest } from '../../../src/signer/approval-digest.tsx'

const params = {
  chainId: 11155111,
  to: '0x0000000000000000000000000000000000000001',
  value: 123n,
  data: '0xdeadbeef',
  nonce: 7,
  expiresAt: 1_800_000_000_000,
}

test('transaction approval digest binds chain, destination, value, calldata, nonce, and expiry', () => {
  const digest = transactionDigest(params)
  assert.equal(verifyTransactionDigest(digest, params), true)
  for (const changed of [
    { chainId: params.chainId + 1 },
    { to: '0x0000000000000000000000000000000000000002' },
    { value: 124n },
    { data: '0xdeadbeef00' },
    { nonce: params.nonce + 1 },
    { expiresAt: params.expiresAt + 1 },
  ]) {
    assert.equal(verifyTransactionDigest(digest, { ...params, ...changed }), false)
  }
})

test('digest verification rejects malformed digests and invalid transaction fields', () => {
  assert.equal(verifyTransactionDigest('not-a-digest', params), false)
  assert.equal(verifyTransactionDigest(`0x${'0'.repeat(64)}`, { ...params, data: '0x0' }), false)
  assert.throws(() => transactionDigest({ ...params, value: -1n }), /cannot be negative/)
})

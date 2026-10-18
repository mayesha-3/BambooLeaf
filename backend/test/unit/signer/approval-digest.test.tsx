import assert from 'node:assert/strict'
import test from 'node:test'
import { computeApprovalDigest } from '../../../src/signer/approval-digest.tsx'

const txRequests = [{
  to: '0x0000000000000000000000000000000000000001',
  value: '1000000000000000000',
  data: '0x',
  description: 'Send ETH',
}]

test('approval digest is stable for the same chain and transaction', () => {
  const first = computeApprovalDigest(txRequests, 1_700_000_000_000, 11_155_111)
  const second = computeApprovalDigest(txRequests, 1_700_000_000_000, 11_155_111)

  assert.equal(first, second)
})

test('approval digest changes when the authorized chain changes', () => {
  const sepoliaDigest = computeApprovalDigest(txRequests, 1_700_000_000_000, 11_155_111)
  const localChainDigest = computeApprovalDigest(txRequests, 1_700_000_000_000, 31_337)

  assert.notEqual(sepoliaDigest, localChainDigest)
})
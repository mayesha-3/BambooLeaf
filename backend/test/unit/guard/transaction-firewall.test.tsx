import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeLogs, MAX_UINT256 } from '../../../src/guard/transaction-firewall.tsx'

test('MAX_UINT256 is the correct value', () => {
  assert.equal(MAX_UINT256, (1n << 256n) - 1n)
})

test('decodeLogs handles empty logs', () => {
  assert.deepEqual(decodeLogs([]), [])
})

test('decodeLogs identifies unknown topics', () => {
  const logs = [
    {
      topics: ['0xdeadbeef'],
      data: '0x',
    },
  ] as never

  const decoded = decodeLogs(logs)
  assert.equal(decoded.length, 1)
  assert.equal(decoded[0].type, 'Unknown')
})
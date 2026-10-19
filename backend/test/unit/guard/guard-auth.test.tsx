import assert from 'node:assert/strict'
import test from 'node:test'
import { issueGuardAuthorization, issueGuardAuthorizationUntil, verifyGuardAuthorization } from '../../../src/guard/guard-auth.tsx'

const payload = {
  chainId: 11155111,
  intentId: '459daf2c-9a9e-4f38-a8f0-ea09d004957e',
  recipient: '0x0000000000000000000000000000000000000001',
  valueWei: '1',
}

test('guard authorization is bound to its payload and exact expiry', () => {
  const expiresAt = Date.now() + 60_000
  const authorization = issueGuardAuthorizationUntil(payload, expiresAt)
  assert.equal(authorization.expiresAt, expiresAt)
  assert.equal(verifyGuardAuthorization(authorization, payload), true)
  assert.equal(verifyGuardAuthorization(authorization, { ...payload, valueWei: '2' }), false)
  assert.equal(verifyGuardAuthorization({ ...authorization, expiresAt: expiresAt + 1 }, payload), false)
})

test('guard authorization rejects invalid lifetimes and expired signatures', () => {
  assert.throws(() => issueGuardAuthorization(payload, 0), /positive integer/)
  assert.throws(() => issueGuardAuthorizationUntil(payload, Date.now()), /future/)
  assert.equal(verifyGuardAuthorization({ ...issueGuardAuthorization(payload), signature: 'bad' }, payload), false)
})

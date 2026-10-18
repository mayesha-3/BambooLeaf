import assert from 'node:assert/strict'
import test from 'node:test'
import { getPolicy, updatePolicy } from '../../../src/controllers/policy.controller.tsx'

test('policy response includes the active policy, supported assets, and caller role', async () => {
  let payload
  const response = {
    json(body) {
      payload = body
      return this
    },
  }

  await getPolicy({ userRole: 'auditor' }, response, (error) => { throw error })

  assert.equal(payload.role, 'auditor')
  assert.equal(typeof payload.chainId, 'number')
  assert.ok(Number.isInteger(payload.maxTxPerWindow))
  assert.ok(Array.isArray(payload.allowedRecipients))
  assert.ok(Array.isArray(payload.supportedAssets))
  assert.ok(payload.supportedAssets.some((asset) => asset.symbol === 'ETH'))
})

test('policy updates reject inherited object field names', async () => {
  let statusCode = 200
  let payload
  const response = {
    status(code) {
      statusCode = code
      return this
    },
    json(body) {
      payload = body
      return this
    },
  }

  await updatePolicy(
    { body: { constructor: 'malicious' } },
    response,
    (error) => { throw error },
  )

  assert.equal(statusCode, 400)
  assert.match(payload.error, /no supported settings/)
})

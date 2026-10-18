import assert from 'node:assert/strict'
import test from 'node:test'
import { updatePolicy } from '../../../src/controllers/policy.controller.tsx'

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

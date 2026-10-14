import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const signingKey = randomBytes(32)

function authorizationPayload(payload, expiresAt) {
  return JSON.stringify({
    chainId: payload.chainId,
    intentId: payload.intentId,
    recipient: payload.recipient.toLowerCase(),
    valueWei: payload.valueWei,
    expiresAt,
  })
}

function issueGuardAuthorization(payload, ttlMs = 30000) {
  const expiresAt = Date.now() + ttlMs
  const serialized = authorizationPayload(payload, expiresAt)
  const signature = createHmac('sha256', signingKey).update(serialized).digest('hex')
  return { ...payload, expiresAt, signature }
}

function verifyGuardAuthorization(authorization, payload) {
  if (!authorization || authorization.expiresAt < Date.now() || typeof authorization.signature !== 'string') {
    return false
  }
  const expected = createHmac('sha256', signingKey)
    .update(authorizationPayload(payload, authorization.expiresAt))
    .digest()
  const supplied = Buffer.from(authorization.signature, 'hex')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export { issueGuardAuthorization, verifyGuardAuthorization }

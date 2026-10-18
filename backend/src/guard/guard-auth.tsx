import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const signingKey = randomBytes(32)

function authorizationPayload(payload, expiresAt) {
  return JSON.stringify({
    chainId: payload.chainId,
    intentId: payload.intentId,
    recipient: payload.recipient.toLowerCase(),
    valueWei: payload.valueWei,
    transactionTo: payload.transactionTo?.toLowerCase() ?? '',
    transactionData: payload.transactionData?.toLowerCase() ?? '',
    expiresAt,
  })
}

function issueGuardAuthorizationUntil(payload, expiresAt) {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('Guard authorization expiry must be in the future')
  }
  const serialized = authorizationPayload(payload, expiresAt)
  const signature = createHmac('sha256', signingKey).update(serialized).digest('hex')
  return { ...payload, expiresAt, signature }
}

function issueGuardAuthorization(payload, ttlMs = 30000) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error('Guard authorization lifetime must be a positive integer')
  }
  return issueGuardAuthorizationUntil(payload, Date.now() + ttlMs)
}

function verifyGuardAuthorization(authorization, payload) {
  if (!authorization || !Number.isSafeInteger(authorization.expiresAt) ||
      authorization.expiresAt <= Date.now() || typeof authorization.signature !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(authorization.signature)) {
    return false
  }
  try {
    const expected = createHmac('sha256', signingKey)
      .update(authorizationPayload(payload, authorization.expiresAt))
      .digest()
    const supplied = Buffer.from(authorization.signature, 'hex')
    return supplied.length === expected.length && timingSafeEqual(supplied, expected)
  } catch {
    return false
  }
}

export { issueGuardAuthorization, issueGuardAuthorizationUntil, verifyGuardAuthorization }

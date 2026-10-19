import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto'
import { getAddress } from 'ethers'
import { COLLECTIONS } from '../db/collections.tsx'
import { getDatabase } from '../db/connection.tsx'
import { resolveWalletRole } from '../db/repositories/role-assignments.repository.tsx'
import { getClientIp } from '../security/ip-address.tsx'

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function hashBody(body) {
  return createHash('sha256').update(body || '').digest('hex')
}

async function requireDeviceSession(request, response, next) {
  const authorization = request.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    response.status(401).json({ error: 'Sign in with an approved device to continue.' })
    return
  }

  try {
    const database = getDatabase()
    const tokenHash = hashToken(match[1])
    const session = await database.collection(COLLECTIONS.deviceSessions).findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    })
    if (!session) {
      response.status(401).json({ error: 'Your device session has expired. Sign in again.' })
      return
    }

    const device = await database.collection(COLLECTIONS.devices).findOne({
      walletAddress: session.walletAddress,
      deviceId: session.deviceId,
      status: 'approved',
    })
    if (!device || device.revokedAt) {
      await database.collection(COLLECTIONS.deviceSessions).deleteMany({ deviceId: session.deviceId })
      response.status(401).json({ error: 'This device is not approved or has been revoked.' })
      return
    }

    const nonce = request.get('x-device-challenge') || ''
    const signature = request.get('x-device-signature') || ''
    if (!nonce || !signature || signature.length > 256) {
      response.status(401).json({ error: 'A valid device-key proof is required for every request.' })
      return
    }
    const challenge = await database.collection(COLLECTIONS.deviceChallenges).findOneAndDelete({
      nonce,
      kind: 'request-proof',
      sessionId: session._id,
      expiresAt: { $gt: new Date() },
    })
    const bodyHash = hashBody(request.rawBody)
    if (!challenge || challenge.method !== request.method || challenge.path !== request.originalUrl ||
        challenge.bodyHash !== bodyHash) {
      response.status(401).json({ error: 'Device proof is invalid, expired, or does not match this request.' })
      return
    }

    let valid = false
    try {
      const message = `${nonce}\n${session._id}\n${challenge.method}\n${challenge.path}\n${bodyHash}\n${challenge.expiresAt.getTime()}`
      valid = verify(
        'sha256',
        Buffer.from(message),
        { key: createPublicKey({ key: device.publicKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      )
    } catch {
      valid = false
    }
    if (!valid) {
      response.status(401).json({ error: 'Device key signature was invalid.' })
      return
    }

    const ip = getClientIp(request)
    const blocked = await database.collection(COLLECTIONS.deviceBlocks).findOne({
      walletAddress: session.walletAddress,
      $or: [
        { type: 'device', target: session.deviceId },
        { type: 'ip', target: ip },
      ],
    })
    if (blocked) {
      await database.collection(COLLECTIONS.deviceSessions).deleteOne({ _id: session._id })
      response.status(403).json({ error: 'This device or IP address is blocked for this wallet.' })
      return
    }

    request.deviceSession = session
    request.deviceRecord = device
    request.userRole = await resolveWalletRole(database, session.walletAddress)
    next()
  } catch (error) {
    next(error)
  }
}

function requireAuditReadAccess(request, response, next) {
  const role = request.userRole
  if (role !== 'admin' && role !== 'approver' && role !== 'auditor') {
    response.status(role ? 403 : 401).json({ error: 'This wallet is not authorized for compliance read access.' })
    return
  }
  request.auditRole = role
  next()
}

async function createRequestProof(request, response, next) {
  try {
    const token = (request.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]
    const { method, path, bodyHash } = request.body || {}
    if (!token || typeof method !== 'string' || !/^(GET|POST|PUT|PATCH|DELETE)$/.test(method) ||
        typeof path !== 'string' || !path.startsWith('/api/') || path.length > 2048 ||
        typeof bodyHash !== 'string' || !/^[0-9a-f]{64}$/.test(bodyHash)) {
      response.status(400).json({ error: 'A session and valid request details are required.' })
      return
    }
    const database = getDatabase()
    const session = await database.collection(COLLECTIONS.deviceSessions).findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    })
    if (!session) {
      response.status(401).json({ error: 'Your device session has expired. Sign in again.' })
      return
    }
    const device = await database.collection(COLLECTIONS.devices).findOne({
      walletAddress: session.walletAddress,
      deviceId: session.deviceId,
      status: 'approved',
      revokedAt: { $exists: false },
    })
    if (!device) {
      await database.collection(COLLECTIONS.deviceSessions).deleteMany({ deviceId: session.deviceId })
      response.status(401).json({ error: 'This device is not approved or has been revoked.' })
      return
    }
    const expiresAt = new Date(Date.now() + 30_000)
    const nonce = randomBytes(32).toString('base64url')
    const message = `${nonce}\n${session._id}\n${method}\n${path}\n${bodyHash}\n${expiresAt.getTime()}`
    await database.collection(COLLECTIONS.deviceChallenges).insertOne({
      nonce,
      kind: 'request-proof',
      sessionId: session._id,
      method,
      path,
      bodyHash,
      expiresAt,
    })
    response.json({ nonce, message, expiresAt: expiresAt.toISOString() })
  } catch (error) {
    next(error)
  }
}

export { createRequestProof, hashBody, hashToken, requireAuditReadAccess, requireDeviceSession }

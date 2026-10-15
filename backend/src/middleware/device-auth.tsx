import { createHash } from 'node:crypto'
import { COLLECTIONS } from '../db/collections.tsx'
import { getDatabase } from '../db/connection.tsx'

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function requireDeviceSession(request, response, next) {
  const authorization = request.get('authorization') || ''
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)
  if (!match) {
    response.status(401).json({ error: 'Sign in with your wallet to manage devices.' })
    return
  }

  try {
    const database = getDatabase()
    const session = await database.collection(COLLECTIONS.deviceSessions).findOne({
      tokenHash: hashToken(match[1]),
      expiresAt: { $gt: new Date() },
    })
    if (!session) {
      response.status(401).json({ error: 'Your device session has expired. Sign in again.' })
      return
    }

    const ip = request.ip || request.socket.remoteAddress || 'unknown'
    const blocked = await database.collection(COLLECTIONS.deviceBlocks).findOne({
      walletAddress: session.walletAddress,
      $or: [
        { type: 'device', target: session.deviceId },
        { type: 'ip', target: ip },
      ],
    })
    if (blocked) {
      await database.collection(COLLECTIONS.deviceSessions).deleteOne({ tokenHash: hashToken(match[1]) })
      response.status(403).json({ error: 'This device or IP address has been blocked for this wallet.' })
      return
    }

    request.deviceSession = session
    next()
  } catch (error) {
    next(error)
  }
}

export { hashToken, requireDeviceSession }

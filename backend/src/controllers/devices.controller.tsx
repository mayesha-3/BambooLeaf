import { randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { getAddress, verifyMessage } from 'ethers'
import { COLLECTIONS } from '../db/collections.tsx'
import { getDatabase } from '../db/connection.tsx'
import { hashToken } from '../middleware/device-auth.tsx'

const challengeLifetimeMs = 5 * 60 * 1000
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000
const deviceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeAddress(value) {
  if (typeof value !== 'string' || value.length > 42) return null
  try {
    return getAddress(value).toLowerCase()
  } catch {
    return null
  }
}

function getRequestDetails(request) {
  const userAgent = (request.get('user-agent') || '').slice(0, 500)
  const browser = /Edg\//i.test(userAgent) ? 'Edge'
    : /Firefox\//i.test(userAgent) ? 'Firefox'
      : /Chrome\//i.test(userAgent) ? 'Chrome'
        : /Safari\//i.test(userAgent) ? 'Safari'
          : 'Unknown browser'
  const operatingSystem = /Windows/i.test(userAgent) ? 'Windows'
    : /Android/i.test(userAgent) ? 'Android'
      : /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS'
        : /Mac OS X/i.test(userAgent) ? 'macOS'
          : /CrOS/i.test(userAgent) ? 'ChromeOS'
            : /Linux/i.test(userAgent) ? 'Linux'
              : 'Unknown OS'
  const deviceType = /iPad|Tablet/i.test(userAgent) ? 'Tablet'
    : /Mobile|Android|iPhone|iPod/i.test(userAgent) ? 'Mobile'
      : 'Desktop'

  return {
    ip: request.ip || request.socket.remoteAddress || 'unknown',
    userAgent,
    browser,
    operatingSystem,
    deviceType,
  }
}

async function recordAttempt(database, { walletAddress, deviceId, request, status, reason = '' }) {
  const now = new Date()
  const details = getRequestDetails(request)
  const [attempt] = await Promise.all([
    database.collection(COLLECTIONS.deviceAttempts).insertOne({
      walletAddress, deviceId, ...details, status, reason, createdAt: now,
    }),
    database.collection(COLLECTIONS.devices).updateOne(
      { walletAddress, deviceId },
      {
        $setOnInsert: { walletAddress, deviceId, firstSeenAt: now },
        $set: {
          ip: details.ip,
          userAgent: details.userAgent,
          browser: details.browser,
          operatingSystem: details.operatingSystem,
          deviceType: details.deviceType,
          lastSeenAt: now,
          lastAttemptStatus: status,
        },
        $inc: { attemptCount: 1 },
      },
      { upsert: true },
    ),
  ])
  return attempt
}

async function updateAttempt(database, attemptId, walletAddress, deviceId, { status, reason = '' }) {
  if (!attemptId) return
  await Promise.all([
    database.collection(COLLECTIONS.deviceAttempts).updateOne(
      { _id: attemptId },
      { $set: { status, reason, resolvedAt: new Date() } },
    ),
    database.collection(COLLECTIONS.devices).updateOne(
      { walletAddress, deviceId },
      { $set: { lastAttemptStatus: status } },
    ),
  ])
}

function validDeviceId(value) {
  return typeof value === 'string' && deviceIdPattern.test(value)
}

async function findBlock(database, walletAddress, deviceId, ip) {
  return database.collection(COLLECTIONS.deviceBlocks).findOne({
    walletAddress,
    $or: [
      { type: 'device', target: deviceId },
      { type: 'ip', target: ip },
    ],
  })
}

async function getChallenge(request, response, next) {
  const database = getDatabase()
  const walletAddress = normalizeAddress(request.body?.walletAddress)
  const deviceId = request.body?.deviceId
  if (!walletAddress || !validDeviceId(deviceId)) {
    response.status(400).json({ error: 'A valid wallet address and device identifier are required.' })
    return
  }

  try {
    const details = getRequestDetails(request)
    const block = await findBlock(database, walletAddress, deviceId, details.ip)
    if (block) {
      await recordAttempt(database, {
        walletAddress,
        deviceId,
        request,
        status: 'blocked',
        reason: `Blocked ${block.type}`,
      })
      response.status(403).json({ error: 'This device or IP address is blocked for this wallet.' })
      return
    }

    const nonce = randomBytes(32).toString('hex')
    const issuedAt = new Date()
    const message = [
      'BambooLeaf wallet device login',
      `Wallet: ${walletAddress}`,
      `Nonce: ${nonce}`,
      `Issued at: ${issuedAt.toISOString()}`,
    ].join('\n')
    const attempt = await recordAttempt(database, {
      walletAddress,
      deviceId,
      request,
      status: 'pending',
      reason: 'Awaiting wallet signature',
    })
    await database.collection(COLLECTIONS.deviceChallenges).insertOne({
      nonce,
      walletAddress,
      deviceId,
      message,
      attemptId: attempt.insertedId,
      expiresAt: new Date(issuedAt.getTime() + challengeLifetimeMs),
    })
    response.json({ message, nonce })
  } catch (error) {
    next(error)
  }
}

async function login(request, response, next) {
  const database = getDatabase()
  const walletAddress = normalizeAddress(request.body?.walletAddress)
  const deviceId = request.body?.deviceId
  const nonce = request.body?.nonce
  const signature = request.body?.signature
  if (!walletAddress || !validDeviceId(deviceId) || typeof nonce !== 'string' || typeof signature !== 'string') {
    response.status(400).json({ error: 'A valid wallet address, device identifier, challenge, and signature are required.' })
    return
  }

  try {
    const details = getRequestDetails(request)
    const block = await findBlock(database, walletAddress, deviceId, details.ip)
    if (block) {
      await recordAttempt(database, {
        walletAddress,
        deviceId,
        request,
        status: 'blocked',
        reason: `Blocked ${block.type}`,
      })
      response.status(403).json({ error: 'This device or IP address is blocked for this wallet.' })
      return
    }

    const challenge = await database.collection(COLLECTIONS.deviceChallenges).findOneAndDelete({
      nonce,
      walletAddress,
      deviceId,
      expiresAt: { $gt: new Date() },
    })
    let recoveredAddress = ''
    try {
      if (challenge && signature.length <= 1024) {
        recoveredAddress = verifyMessage(challenge.message, signature).toLowerCase()
      }
    } catch {
      recoveredAddress = ''
    }
    if (!challenge || recoveredAddress !== walletAddress) {
      if (challenge) {
        await updateAttempt(database, challenge.attemptId, walletAddress, deviceId, {
          status: 'failed',
          reason: 'Invalid, expired, or mismatched wallet signature',
        })
      } else {
        await recordAttempt(database, {
          walletAddress,
          deviceId,
          request,
          status: 'failed',
          reason: 'Invalid, expired, or mismatched wallet signature',
        })
      }
      response.status(401).json({ error: 'Wallet signature was invalid or the challenge expired.' })
      return
    }

    const accounts = database.collection(COLLECTIONS.deviceAccounts)
    let account = await accounts.findOne({ walletAddress })
    if (!account) {
      try {
        await accounts.insertOne({
          walletAddress,
          primaryDeviceId: deviceId,
          createdAt: new Date(),
        })
        account = { walletAddress, primaryDeviceId: deviceId }
      } catch (error) {
        if (error?.code !== 11000) throw error
        account = await accounts.findOne({ walletAddress })
      }
    }
    const isPrimary = account.primaryDeviceId === deviceId
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + sessionLifetimeMs)
    await database.collection(COLLECTIONS.deviceSessions).insertOne({
      tokenHash: hashToken(token),
      walletAddress,
      deviceId,
      expiresAt,
      createdAt: new Date(),
    })
    await updateAttempt(database, challenge.attemptId, walletAddress, deviceId, {
      status: 'success',
      reason: '',
    })
    await database.collection(COLLECTIONS.devices).updateOne(
      { walletAddress, deviceId },
      { $set: { isPrimary, lastSuccessfulLoginAt: new Date() } },
    )
    response.json({
      token,
      walletAddress,
      deviceId,
      isPrimary,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    next(error)
  }
}

async function cancelChallenge(request, response, next) {
  const database = getDatabase()
  const walletAddress = normalizeAddress(request.body?.walletAddress)
  const deviceId = request.body?.deviceId
  const nonce = request.body?.nonce
  if (!walletAddress || !validDeviceId(deviceId) || typeof nonce !== 'string') {
    response.status(400).json({ error: 'A valid wallet address, device identifier, and challenge are required.' })
    return
  }

  try {
    const challenge = await database.collection(COLLECTIONS.deviceChallenges).findOneAndDelete({
      nonce,
      walletAddress,
      deviceId,
      expiresAt: { $gt: new Date() },
    })
    if (challenge) {
      await updateAttempt(database, challenge.attemptId, walletAddress, deviceId, {
        status: 'cancelled',
        reason: 'Wallet signature was declined',
      })
    }
    response.json({ success: true })
  } catch (error) {
    next(error)
  }
}

async function listDevices(request, response, next) {
  try {
    const database = getDatabase()
    const session = request.deviceSession
    const [devices, attempts, blocks, account] = await Promise.all([
      database.collection(COLLECTIONS.devices)
        .find({ walletAddress: session.walletAddress }, { projection: { _id: 0 } })
        .sort({ lastSeenAt: -1 })
        .toArray(),
      database.collection(COLLECTIONS.deviceAttempts)
        .find({ walletAddress: session.walletAddress }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
      database.collection(COLLECTIONS.deviceBlocks)
        .find({ walletAddress: session.walletAddress }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray(),
      database.collection(COLLECTIONS.deviceAccounts).findOne(
        { walletAddress: session.walletAddress },
        { projection: { _id: 0, primaryDeviceId: 1 } },
      ),
    ])
    response.json({
      walletAddress: session.walletAddress,
      primaryDeviceId: account.primaryDeviceId,
      currentDeviceId: session.deviceId,
      devices,
      attempts,
      blocks,
    })
  } catch (error) {
    next(error)
  }
}

async function logout(request, response, next) {
  try {
    await getDatabase().collection(COLLECTIONS.deviceSessions).deleteOne({
      _id: request.deviceSession._id,
    })
    response.json({ success: true })
  } catch (error) {
    next(error)
  }
}

async function updateBlock(request, response, next) {
  try {
    const database = getDatabase()
    const session = request.deviceSession
    const account = await database.collection(COLLECTIONS.deviceAccounts)
      .findOne({ walletAddress: session.walletAddress })
    if (!account || account.primaryDeviceId !== session.deviceId) {
      response.status(403).json({ error: 'Only the primary device can block or unblock devices and IP addresses.' })
      return
    }

    const { type, target } = request.body || {}
    if ((type !== 'device' && type !== 'ip') || typeof target !== 'string' || target.length > 128) {
      response.status(400).json({ error: 'Choose a device or IP address to block or unblock.' })
      return
    }
    if (type === 'ip' && !isIP(target)) {
      response.status(400).json({ error: 'A valid IP address is required.' })
      return
    }
    if (type === 'device') {
      const device = await database.collection(COLLECTIONS.devices).findOne({
        walletAddress: session.walletAddress,
        deviceId: target,
      })
      if (!device || target === session.deviceId) {
        response.status(400).json({ error: 'Choose another known device; the primary device cannot block itself.' })
        return
      }
    } else if (target === (request.ip || request.socket.remoteAddress)) {
      response.status(400).json({ error: 'The primary device cannot block its current IP address.' })
      return
    }

    if (request.method === 'DELETE') {
      await database.collection(COLLECTIONS.deviceBlocks).deleteOne({
        walletAddress: session.walletAddress,
        type,
        target,
      })
    } else {
      await database.collection(COLLECTIONS.deviceBlocks).updateOne(
        { walletAddress: session.walletAddress, type, target },
        {
          $setOnInsert: {
            walletAddress: session.walletAddress,
            type,
            target,
            createdAt: new Date(),
            createdByDeviceId: session.deviceId,
          },
        },
        { upsert: true },
      )
    }
    response.json({ success: true })
  } catch (error) {
    next(error)
  }
}

export { cancelChallenge, getChallenge, listDevices, login, logout, updateBlock }

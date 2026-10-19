import { createPublicKey, randomBytes, verify } from 'node:crypto'
import { getAddress, verifyMessage } from 'ethers'
import { COLLECTIONS } from '../db/collections.tsx'
import { getDatabase } from '../db/connection.tsx'
import { hashToken } from '../middleware/device-auth.tsx'
import { walletRole } from '../middleware/roles.tsx'
import { getClientIp, normalizeIpAddress } from '../security/ip-address.tsx'

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
    ip: getClientIp(request),
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
          descriptiveOnly: true,
        },
        $addToSet: { observedIps: details.ip },
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

function deviceLoginState(device, walletAddress) {
  if (!device || device.status === 'revoked' || device.revokedAt) return 'unavailable'
  if (device.status === 'approved') return 'approved'
  if (device.status === 'pending') {
    return walletRole(walletAddress) === 'admin' ? 'owner-pending' : 'pending'
  }
  return 'unavailable'
}

function enrollmentStatus(walletAddress, existingDevice) {
  return walletRole(walletAddress) === 'admin' || existingDevice?.status === 'approved'
    ? 'approved'
    : 'pending'
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

async function isDeviceLocked(database, walletAddress, deviceId) {
  const device = await database.collection(COLLECTIONS.devices).findOne(
    { walletAddress, deviceId, lockedUntil: { $gt: new Date() } },
    { projection: { lockedUntil: 1 } },
  )
  return device?.lockedUntil ?? null
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
    if (await isDeviceLocked(database, walletAddress, deviceId)) {
      response.status(423).json({ error: 'Device sign-in is temporarily locked after repeated failed proofs.' })
      return
    }
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
    const device = await database.collection(COLLECTIONS.devices).findOne({ walletAddress, deviceId })
    const loginState = deviceLoginState(device, walletAddress)
    if (loginState === 'pending') {
      await recordAttempt(database, {
        walletAddress,
        deviceId,
        request,
        status: 'pending',
        reason: 'Device enrollment is awaiting admin approval',
      })
      response.status(202).json({
        status: 'pending',
        message: 'This wallet’s device enrollment is awaiting admin approval.',
      })
      return
    }
    if (loginState === 'unavailable') {
      await recordAttempt(database, {
        walletAddress,
        deviceId,
        request,
        status: 'blocked',
        reason: device ? 'Device is revoked or unavailable' : 'Device is not enrolled',
      })
      response.status(403).json({
        error: device ? 'This device has been revoked or is unavailable.' : 'This device is not enrolled.',
      })
      return
    }

    const nonce = randomBytes(32).toString('hex')
    const issuedAt = new Date()
    const message = [
      'BambooLeaf cryptographic device login',
      `Wallet: ${walletAddress}`,
      `Device: ${deviceId}`,
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
      kind: 'login',
      walletAddress,
      deviceId,
      message,
      publicKey: device.publicKey,
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
  const walletSignature = request.body?.walletSignature
  if (!walletAddress || !validDeviceId(deviceId) || typeof nonce !== 'string' ||
      typeof signature !== 'string' || typeof walletSignature !== 'string') {
    response.status(400).json({ error: 'A valid wallet address, device identifier, challenge, and signature are required.' })
    return
  }

  try {
    if (await isDeviceLocked(database, walletAddress, deviceId)) {
      response.status(423).json({ error: 'Device sign-in is temporarily locked after repeated failed proofs.' })
      return
    }
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
      kind: 'login',
      walletAddress,
      deviceId,
      expiresAt: { $gt: new Date() },
    })
    let validSignature = false
    let signerAddress = ''
    try {
      if (challenge && signature.length <= 256 && walletSignature.length <= 1024) {
        signerAddress = verifyMessage(challenge.message, walletSignature).toLowerCase()
        validSignature = verify(
          'sha256',
          Buffer.from(challenge.message),
          { key: createPublicKey({ key: challenge.publicKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
          Buffer.from(signature, 'base64url'),
        )
      }
    } catch {
      validSignature = false
      signerAddress = ''
    }
    if (!challenge || signerAddress !== walletAddress || !validSignature) {
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
      const failures = await database.collection(COLLECTIONS.deviceAttempts).countDocuments({
        walletAddress,
        deviceId,
        status: 'failed',
        createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
      })
      if (failures >= 5) {
        await database.collection(COLLECTIONS.devices).updateOne(
          { walletAddress, deviceId },
          { $set: { lockedUntil: new Date(Date.now() + 30 * 60 * 1000) } },
        )
        response.status(423).json({ error: 'Device sign-in is temporarily locked after repeated failed proofs.' })
        return
      }
      response.status(401).json({ error: 'Device proof was invalid or the challenge expired.' })
      return
    }

    const device = await database.collection(COLLECTIONS.devices).findOne({ walletAddress, deviceId })
    const loginState = deviceLoginState(device, walletAddress)
    if (loginState === 'pending') {
      await updateAttempt(database, challenge.attemptId, walletAddress, deviceId, {
        status: 'pending',
        reason: 'Device enrollment is awaiting admin approval',
      })
      response.status(202).json({
        status: 'pending',
        message: 'This wallet’s device enrollment is awaiting admin approval.',
      })
      return
    }
    if (loginState === 'unavailable') {
      await updateAttempt(database, challenge.attemptId, walletAddress, deviceId, {
        status: 'blocked',
        reason: 'Device was revoked or became unavailable during sign-in',
      })
      response.status(403).json({ error: 'This device has been revoked or is unavailable.' })
      return
    }
    const approveOwnerDevice = loginState === 'owner-pending'

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
    const deviceUpdate = await database.collection(COLLECTIONS.devices).updateOne(
      {
        walletAddress,
        deviceId,
        status: approveOwnerDevice ? 'pending' : 'approved',
        revokedAt: { $exists: false },
      },
      {
        $set: {
          isPrimary,
          lastSuccessfulLoginAt: new Date(),
          ...(approveOwnerDevice ? {
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: 'owner-wallet-signature',
          } : {}),
        },
        $unset: { lockedUntil: '' },
      },
    )
    if (deviceUpdate.modifiedCount !== 1) {
      await updateAttempt(database, challenge.attemptId, walletAddress, deviceId, {
        status: 'blocked',
        reason: 'Device was revoked or changed during sign-in',
      })
      response.status(403).json({ error: 'This device has been revoked or is unavailable.' })
      return
    }
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + sessionLifetimeMs)
    await database.collection(COLLECTIONS.deviceSessions).insertOne({
      tokenHash: hashToken(token),
      walletAddress,
      deviceId,
      publicKey: challenge.publicKey,
      expiresAt,
      createdAt: new Date(),
    })
    await updateAttempt(database, challenge.attemptId, walletAddress, deviceId, {
      status: 'success',
      reason: '',
    })
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

async function getEnrollmentChallenge(request, response, next) {
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
      response.status(403).json({ error: 'This device or IP address is blocked for this wallet.' })
      return
    }
    const existing = await database.collection(COLLECTIONS.devices).findOne({ walletAddress, deviceId })
    if (existing?.status === 'revoked') {
      response.status(403).json({ error: 'A revoked device cannot be enrolled again.' })
      return
    }
    const nonce = randomBytes(32).toString('hex')
    const issuedAt = new Date()
    const message = [
      'BambooLeaf device enrollment',
      `Wallet: ${walletAddress}`,
      `Device: ${deviceId}`,
      `Nonce: ${nonce}`,
      `Issued at: ${issuedAt.toISOString()}`,
    ].join('\n')
    await database.collection(COLLECTIONS.deviceChallenges).insertOne({
      nonce,
      kind: 'enrollment',
      walletAddress,
      deviceId,
      message,
      expiresAt: new Date(issuedAt.getTime() + challengeLifetimeMs),
    })
    response.json({ nonce, message })
  } catch (error) {
    next(error)
  }
}

async function enrollDevice(request, response, next) {
  const database = getDatabase()
  const walletAddress = normalizeAddress(request.body?.walletAddress)
  const deviceId = request.body?.deviceId
  const nonce = request.body?.nonce
  const walletSignature = request.body?.walletSignature
  const deviceSignature = request.body?.deviceSignature
  const publicKey = request.body?.publicKey
  if (!walletAddress || !validDeviceId(deviceId) || typeof nonce !== 'string' ||
      typeof walletSignature !== 'string' || typeof deviceSignature !== 'string' ||
      !publicKey || typeof publicKey !== 'object' || publicKey.kty !== 'EC' ||
      publicKey.crv !== 'P-256' || typeof publicKey.x !== 'string' || typeof publicKey.y !== 'string' ||
      Object.keys(publicKey).some((key) => !['kty', 'crv', 'x', 'y', 'ext', 'key_ops', 'alg'].includes(key))) {
    response.status(400).json({ error: 'Enrollment requires a valid wallet, device key pair, challenge, and signatures.' })
    return
  }
  try {
    const challenge = await database.collection(COLLECTIONS.deviceChallenges).findOneAndDelete({
      nonce,
      kind: 'enrollment',
      walletAddress,
      deviceId,
      expiresAt: { $gt: new Date() },
    })
    let signerAddress = ''
    let deviceKeyValid = false
    try {
      if (challenge && walletSignature.length <= 1024 && deviceSignature.length <= 256) {
        signerAddress = verifyMessage(challenge.message, walletSignature).toLowerCase()
        deviceKeyValid = verify(
          'sha256',
          Buffer.from(challenge.message),
          { key: createPublicKey({ key: publicKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
          Buffer.from(deviceSignature, 'base64url'),
        )
      }
    } catch {
      signerAddress = ''
      deviceKeyValid = false
    }
    if (!challenge || signerAddress !== walletAddress || !deviceKeyValid) {
      response.status(401).json({ error: 'Enrollment proof was invalid or the challenge expired.' })
      return
    }
    const now = new Date()
    const details = getRequestDetails(request)
    const existingDevice = await database.collection(COLLECTIONS.devices).findOne({ walletAddress, deviceId })
    if (existingDevice?.status === 'revoked' || existingDevice?.revokedAt) {
      response.status(403).json({ error: 'A revoked device cannot be enrolled again.' })
      return
    }
    const status = enrollmentStatus(walletAddress, existingDevice)
    const ownerWallet = walletRole(walletAddress) === 'admin'
    await database.collection(COLLECTIONS.devices).updateOne(
      { walletAddress, deviceId, status: { $ne: 'revoked' } },
      {
        $setOnInsert: { walletAddress, deviceId, firstSeenAt: now },
        $set: {
          status,
          ...(ownerWallet ? { approvedAt: now, approvedBy: 'owner-wallet-signature' } : {}),
          publicKey,
          ip: details.ip,
          browser: details.browser,
          operatingSystem: details.operatingSystem,
          deviceType: details.deviceType,
          userAgent: details.userAgent,
          lastSeenAt: now,
          descriptiveOnly: true,
        },
        ...(status === 'approved' ? { $unset: { revokedAt: '' } } : {}),
        $addToSet: { observedIps: details.ip },
      },
      { upsert: true },
    )
    await recordAttempt(database, {
      walletAddress,
      deviceId,
      request,
      status,
      reason: status === 'pending' ? 'Device key registered; awaiting admin approval' : 'Owner wallet and device key verified',
    })
    response.status(status === 'approved' ? 201 : 202).json({
      status,
      message: status === 'approved' ? 'Owner device enrolled and approved.' : 'Device registration is pending admin approval.',
    })
  } catch (error) {
    next(error)
  }
}

async function reviewDevice(request, response, next) {
  const database = getDatabase()
  const walletAddress = normalizeAddress(request.body?.walletAddress)
  const deviceId = request.body?.deviceId
  const action = request.params.action
  if (!walletAddress || !validDeviceId(deviceId) || !['approve', 'revoke'].includes(action)) {
    response.status(400).json({ error: 'A valid wallet, device identifier, and review action are required.' })
    return
  }
  try {
    const update = action === 'approve'
      ? { $set: { status: 'approved', approvedAt: new Date(), approvedBy: request.deviceSession.walletAddress }, $unset: { revokedAt: '' } }
      : { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: request.deviceSession.walletAddress } }
    const result = await database.collection(COLLECTIONS.devices).updateOne(
      { walletAddress, deviceId, ...(action === 'approve' ? { status: 'pending' } : { status: { $ne: 'revoked' } }) },
      update,
    )
    if (result.modifiedCount !== 1) {
      response.status(404).json({ error: 'Pending or active device was not found.' })
      return
    }
    if (action === 'revoke') {
      await database.collection(COLLECTIONS.deviceSessions).deleteMany({ walletAddress, deviceId })
    }
    response.json({ success: true, status: action === 'approve' ? 'approved' : 'revoked' })
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
    const deviceFilter = request.userRole === 'admin' ? {} : { walletAddress: session.walletAddress }
    const [devices, attempts, blocks, account] = await Promise.all([
      database.collection(COLLECTIONS.devices)
        .find(deviceFilter, { projection: { _id: 0 } })
        .sort({ lastSeenAt: -1 })
        .toArray(),
      database.collection(COLLECTIONS.deviceAttempts)
        .find(deviceFilter, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
      database.collection(COLLECTIONS.deviceBlocks)
        .find(deviceFilter, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray(),
      database.collection(COLLECTIONS.deviceAccounts).findOne(
        { walletAddress: session.walletAddress },
        { projection: { _id: 0, primaryDeviceId: 1 } },
      ),
    ])
    response.json({
      walletAddress: session.walletAddress,
      role: request.userRole,
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
    const { type, target } = request.body || {}
    if ((type !== 'device' && type !== 'ip') || typeof target !== 'string' || target.length > 128) {
      response.status(400).json({ error: 'Choose a device or IP address to block or unblock.' })
      return
    }
    const normalizedTarget = type === 'ip' ? normalizeIpAddress(target) : target
    if (type === 'ip' && !normalizedTarget) {
      response.status(400).json({ error: 'A valid IP address is required.' })
      return
    }
    if (type === 'device') {
      const device = await database.collection(COLLECTIONS.devices).findOne({
        deviceId: target,
      })
      if (!device) {
        response.status(400).json({ error: 'Choose a known device.' })
        return
      }
    }

    if (request.method === 'DELETE') {
      await database.collection(COLLECTIONS.deviceBlocks).deleteOne({
        walletAddress: session.walletAddress,
        type,
        target: normalizedTarget,
      })
    } else {
      await database.collection(COLLECTIONS.deviceBlocks).updateOne(
        { walletAddress: session.walletAddress, type, target: normalizedTarget },
        {
          $setOnInsert: {
            walletAddress: session.walletAddress,
            type,
            target: normalizedTarget,
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

export {
  cancelChallenge,
  deviceLoginState,
  enrollDevice,
  enrollmentStatus,
  getChallenge,
  getEnrollmentChallenge,
  listDevices,
  login,
  logout,
  reviewDevice,
  updateBlock,
}

import { COLLECTIONS } from './collections.tsx'

async function ensureIndexes(database) {
  await Promise.all([
    database.collection(COLLECTIONS.audit).createIndex({ seq: 1 }, { unique: true }),
    database.collection(COLLECTIONS.audit).createIndex({ requestId: 1, seq: 1 }),
    database.collection(COLLECTIONS.goals).createIndex({ idempotencyKey: 1 }, { unique: true }),
    database.collection(COLLECTIONS.goals).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection(COLLECTIONS.approvals).createIndex({ approvalId: 1 }, { unique: true }),
    database.collection(COLLECTIONS.approvals).createIndex({ status: 1, expiresAt: 1 }),
    database.collection(COLLECTIONS.policyUsage).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection(COLLECTIONS.deviceAccounts).createIndex({ walletAddress: 1 }, { unique: true }),
    database.collection(COLLECTIONS.deviceChallenges).createIndex({ nonce: 1 }, { unique: true }),
    database.collection(COLLECTIONS.deviceChallenges).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection(COLLECTIONS.deviceSessions).createIndex({ tokenHash: 1 }, { unique: true }),
    database.collection(COLLECTIONS.deviceSessions).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection(COLLECTIONS.devices).createIndex({ walletAddress: 1, deviceId: 1 }, { unique: true }),
    database.collection(COLLECTIONS.deviceAttempts).createIndex({ walletAddress: 1, createdAt: -1 }),
    database.collection(COLLECTIONS.deviceBlocks).createIndex(
      { walletAddress: 1, type: 1, target: 1 },
      { unique: true },
    ),
  ])
}

export { ensureIndexes }
import { COLLECTIONS } from './collections.tsx'

async function ensureIndexes(database) {
  await Promise.all([
    database.collection(COLLECTIONS.audit).createIndex({ seq: 1 }, { unique: true }),
    database.collection(COLLECTIONS.audit).createIndex({ requestId: 1, seq: 1 }),
    database.collection(COLLECTIONS.goals).createIndex({ idempotencyKey: 1 }, { unique: true }),
    database.collection(COLLECTIONS.goals).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection(COLLECTIONS.policyUsage).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
}

export { ensureIndexes }
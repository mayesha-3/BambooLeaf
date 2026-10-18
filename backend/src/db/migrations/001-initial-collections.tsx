import { COLLECTIONS } from '../collections.tsx'
import { auditEventValidator } from '../validators.tsx'

async function migrateInitialCollections(database) {
  const existing = new Set(await database.listCollections({}, { nameOnly: true }).toArray().then((items) => items.map((item) => item.name)))

  if (!existing.has(COLLECTIONS.audit)) {
    await database.createCollection(COLLECTIONS.audit, {
      validator: auditEventValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  }

  for (const name of [
    COLLECTIONS.auditHeads,
    COLLECTIONS.policyVersions,
    COLLECTIONS.autonomyState,
    COLLECTIONS.approvals,
    COLLECTIONS.goals,
    COLLECTIONS.policyUsage,
    COLLECTIONS.deviceAccounts,
    COLLECTIONS.deviceChallenges,
    COLLECTIONS.deviceSessions,
    COLLECTIONS.devices,
    COLLECTIONS.deviceAttempts,
    COLLECTIONS.deviceBlocks,
  ]) {
    if (!existing.has(name)) {
      await database.createCollection(name)
    }
  }

  if (existing.has('approvals')) {
    const legacyApprovals = await database.collection('approvals').find({ approvalId: { $exists: true } }).toArray()
    if (legacyApprovals.length > 0) {
      await database.collection(COLLECTIONS.approvals).bulkWrite(
        legacyApprovals.map((approval) => ({
          updateOne: {
            filter: { approvalId: approval.approvalId },
            update: { $setOnInsert: approval },
            upsert: true,
          },
        })),
      )
    }
  }
}

export { migrateInitialCollections }
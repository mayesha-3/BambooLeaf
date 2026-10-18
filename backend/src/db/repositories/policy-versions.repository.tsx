import { createHash, randomUUID } from 'node:crypto'
import { COLLECTIONS } from '../collections.tsx'
import { appendAuditEvent } from '../../audit/audit-log.tsx'

function policySnapshot(config) {
  return {
    chainId: config.chainId,
    maxPerTxWei: config.maxPerTxWei.toString(),
    maxPerRecipientPerDayWei: config.maxPerRecipientPerDayWei.toString(),
    maxTxPerWindow: config.maxTxPerWindow,
    velocityWindowSeconds: config.velocityWindowSeconds,
    allowedRecipients: [...config.allowedRecipients].sort(),
    allowedContracts: [...config.allowedContracts].sort(),
    allowedSwapRouters: [...config.allowedSwapRouters].sort(),
    swapRouterAddress: config.swapRouterAddress,
    maxSlippageBps: config.maxSlippageBps,
    maxSwapInputAmount: config.maxSwapInputAmount,
    maxSwapPerTokenPerDay: config.maxSwapPerTokenPerDay,
  }
}

function hashSnapshot(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

async function capturePolicyVersion(database, config) {
  const collection = database.collection(COLLECTIONS.policyVersions)
  const snapshot = policySnapshot(config)
  const versionHash = hashSnapshot(snapshot)
  const latest = await collection.findOne({}, { sort: { createdAt: -1 }, projection: { _id: 0 } })
  if (latest?.versionHash === versionHash) return latest

  const previousSnapshot = latest?.snapshot ?? {}
  const changedFields = [...new Set([...Object.keys(previousSnapshot), ...Object.keys(snapshot)])]
    .filter((field) => JSON.stringify(previousSnapshot[field]) !== JSON.stringify(snapshot[field]))
    .sort()
  const version = {
    versionHash,
    previousVersionHash: latest?.versionHash ?? null,
    snapshot,
    changedFields,
    createdAt: new Date(),
  }
  try {
    await collection.insertOne(version)
  } catch (error) {
    if (error?.code !== 11000) throw error
    return collection.findOne({ versionHash }, { projection: { _id: 0 } })
  }
  await appendAuditEvent(database, {
    requestId: randomUUID(),
    type: 'policy.version_recorded',
    data: { versionHash, previousVersionHash: version.previousVersionHash, changedFields },
  })
  return version
}

async function listPolicyVersions(database, limit = 100) {
  return database.collection(COLLECTIONS.policyVersions)
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .toArray()
}

export { capturePolicyVersion, hashSnapshot, listPolicyVersions, policySnapshot }

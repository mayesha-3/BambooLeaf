import { COLLECTIONS } from '../collections.tsx'
import { normalizeIpAddress } from '../../security/ip-address.tsx'

async function listTrustedIps(database) {
  return database.collection(COLLECTIONS.trustedIps)
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray()
}

async function trustIp(database, value: string, walletAddress: string) {
  const ip = normalizeIpAddress(value)
  if (!ip) throw new Error('IP address is invalid.')
  const now = new Date()
  await database.collection(COLLECTIONS.trustedIps).updateOne(
    { ip },
    {
      $setOnInsert: { ip, createdAt: now, createdBy: walletAddress },
      $set: { updatedAt: now, updatedBy: walletAddress },
    },
    { upsert: true },
  )
  return database.collection(COLLECTIONS.trustedIps).findOne({ ip }, { projection: { _id: 0 } })
}

async function untrustIp(database, value: string) {
  const ip = normalizeIpAddress(value)
  if (!ip) throw new Error('IP address is invalid.')
  const result = await database.collection(COLLECTIONS.trustedIps).deleteOne({ ip })
  return result.deletedCount > 0
}

export { listTrustedIps, trustIp, untrustIp }

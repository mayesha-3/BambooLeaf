import { Decimal128 } from 'mongodb'
import { COLLECTIONS } from '../collections.tsx'

function isDuplicateKey(error) {
  return error && error.code === 11000
}

async function reserveTransfer(database, {
  recipient,
  valueWei,
  maxPerRecipientPerDayWei,
  maxTxPerWindow,
  velocityWindowSeconds,
  scope = 'native',
  now = new Date(),
}) {
  const collection = database.collection(COLLECTIONS.policyUsage)
  const canonicalRecipient = recipient.toLowerCase()
  const canonicalScope = String(scope).replace(/[^A-Za-z0-9:_-]/g, '_')
  const amount = BigInt(valueWei)
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const windowMs = velocityWindowSeconds * 1000
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  const velocityId = `velocity:${canonicalScope}:${canonicalRecipient}:${windowStart.toISOString()}`
  const dailyId = `daily:${canonicalScope}:${canonicalRecipient}:${dayStart.toISOString()}`

  if (amount > maxPerRecipientPerDayWei) {
    return { allowed: false, reason: 'Per-recipient daily cap exceeded.' }
  }

  try {
    const velocity = await collection.updateOne(
      { _id: velocityId, count: { $lt: maxTxPerWindow } },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(windowStart.getTime() + windowMs * 2) },
      },
      { upsert: true },
    )
    if (velocity.matchedCount === 0 && velocity.upsertedCount === 0) {
      return { allowed: false, reason: 'Recipient velocity limit exceeded.' }
    }
  } catch (error) {
    if (isDuplicateKey(error)) {
      return { allowed: false, reason: 'Recipient velocity limit exceeded.' }
    }
    throw error
  }

  const remainingWei = maxPerRecipientPerDayWei - amount
  try {
    const daily = await collection.updateOne(
      {
        _id: dailyId,
        spentWei: { $lte: Decimal128.fromString(remainingWei >= 0n ? remainingWei.toString() : '-1') },
      },
      {
        $inc: { spentWei: Decimal128.fromString(amount.toString()) },
        $setOnInsert: { expiresAt: nextDay },
      },
      { upsert: true },
    )
    if (daily.matchedCount === 0 && daily.upsertedCount === 0) {
      await collection.updateOne({ _id: velocityId }, { $inc: { count: -1 } })
      return { allowed: false, reason: 'Per-recipient daily cap exceeded.' }
    }
  } catch (error) {
    await collection.updateOne({ _id: velocityId }, { $inc: { count: -1 } })
    if (isDuplicateKey(error)) {
      return { allowed: false, reason: 'Per-recipient daily cap exceeded.' }
    }
    throw error
  }

  return { allowed: true }
}

export { reserveTransfer }

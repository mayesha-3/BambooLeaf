import { COLLECTIONS } from '../db/collections.tsx'
import { hashEntry } from './audit-log.tsx'

async function verifyAuditChain(database) {
  const entries = await database.collection(COLLECTIONS.audit).find({})
    .sort({ seq: 1 })
    .toArray()
  let previousHash = ''
  let expectedSeq = 1

  for (const entry of entries) {
    const { _id, hash, ...payload } = entry
    if (entry.seq !== expectedSeq || entry.prevHash !== previousHash || hashEntry(payload) !== hash) {
      return { valid: false, checked: expectedSeq - 1, firstInvalidSeq: entry.seq }
    }
    previousHash = hash
    expectedSeq += 1
  }

  return { valid: true, checked: entries.length, headHash: previousHash }
}

export { verifyAuditChain }
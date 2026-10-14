import { createHash } from 'node:crypto'
import { COLLECTIONS } from '../db/collections.tsx'

let appendQueue = Promise.resolve()

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value instanceof Date ? value.toISOString() : value)
}

function hashEntry(entry) {
  return createHash('sha256').update(canonicalize(entry)).digest('hex')
}

function appendAuditEvent(database, { requestId, type, data }) {
  const operation = appendQueue.then(async () => {
    const events = database.collection(COLLECTIONS.audit)
    const previous = await events.findOne({}, { sort: { seq: -1 } })
    const seq = previous ? previous.seq + 1 : 1
    const event: {
      seq: number
      requestId: string
      type: string
      createdAt: Date
      data: Record<string, unknown>
      prevHash: string
      hash?: string
    } = {
      seq,
      requestId,
      type,
      createdAt: new Date(),
      data,
      prevHash: previous?.hash ?? '',
    }
    event.hash = hashEntry(event)
    await events.insertOne(event)
    return event
  })

  appendQueue = operation.then(() => undefined, () => undefined)
  return operation
}

async function listAuditEvents(database, limit = 50) {
  return database.collection(COLLECTIONS.audit)
    .find({}, { projection: { _id: 0 } })
    .sort({ seq: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .toArray()
}

export { appendAuditEvent, canonicalize, hashEntry, listAuditEvents }
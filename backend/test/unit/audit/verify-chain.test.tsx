import assert from 'node:assert/strict'
import test from 'node:test'
import { appendAuditEvent, hashEntry } from '../../../src/audit/audit-log.tsx'
import { verifyAuditChain } from '../../../src/audit/verify-chain.tsx'

function makeDatabase() {
  const entries = []
  return {
    entries,
    collection() {
      return {
        async findOne(_filter, options) {
          return options.sort.seq < 0 ? entries.at(-1) || null : null
        },
        async insertOne(entry) {
          entries.push(entry)
        },
        find() {
          return {
            sort() {
              return this
            },
            async toArray() {
              return [...entries].sort((left, right) => left.seq - right.seq)
            },
          }
        },
      }
    },
  }
}

test('audit events form a verifiable hash chain', async () => {
  const database = makeDatabase()
  await appendAuditEvent(database, {
    requestId: 'request-1',
    type: 'goal.received',
    data: { goalSha256: 'a'.repeat(64) },
  })
  await appendAuditEvent(database, {
    requestId: 'request-1',
    type: 'planner.failed',
    data: { reason: 'provider unavailable' },
  })

  const result = await verifyAuditChain(database)
  assert.equal(result.valid, true)
  assert.equal(result.checked, 2)
})

test('audit verification reports tampering', async () => {
  const database = makeDatabase()
  const entry = {
    seq: 1,
    requestId: 'request-1',
    type: 'goal.received',
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    data: { goalSha256: 'a'.repeat(64) },
    prevHash: '',
  }
  database.entries.push({ ...entry, hash: hashEntry(entry) })
  database.entries[0].data.goalSha256 = 'b'.repeat(64)

  const result = await verifyAuditChain(database)
  assert.deepEqual(result, { valid: false, checked: 0, firstInvalidSeq: 1 })
})
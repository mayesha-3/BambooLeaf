import assert from 'node:assert/strict'
import test from 'node:test'
import {
  claimPendingApproval,
  createPendingApproval,
  findApproval,
  listPendingApprovals,
} from '../../../src/db/repositories/approvals.repository.tsx'

function makeDatabase() {
  const documents = []
  const collection = {
    async insertOne(document) {
      documents.push(document)
    },
    find(filter) {
      const cursor = {
        sort() { return cursor },
        limit() { return cursor },
        async toArray() {
          return documents.filter((document) =>
            document.status === filter.status && document.expiresAt > filter.expiresAt.$gt,
          )
        },
      }
      return cursor
    },
    async findOne(filter) {
      return documents.find((document) => document.approvalId === filter.approvalId) ?? null
    },
    async updateOne(filter, update) {
      const document = documents.find((item) =>
        item.approvalId === filter.approvalId &&
        item.status === filter.status &&
        item.expiresAt > filter.expiresAt.$gt,
      )
      if (!document) return { modifiedCount: 0 }
      Object.assign(document, update.$set)
      return { modifiedCount: 1 }
    },
  }
  return { database: { collection: () => collection }, documents }
}

test('approval claims are atomic, one-time, and ignore expired requests', async () => {
  const { database, documents } = makeDatabase()
  const now = Date.now()
  await createPendingApproval(database as never, {
    approvalId: 'active', ownerWallet: '0xowner', expiresAt: now + 60_000,
  })
  await createPendingApproval(database as never, {
    approvalId: 'expired', ownerWallet: '0xowner', expiresAt: now - 1,
  })
  assert.deepEqual((await listPendingApprovals(database as never, now)).map((item) => item.approvalId), ['active'])

  const claims = await Promise.all([
    claimPendingApproval(database as never, 'active', now),
    claimPendingApproval(database as never, 'active', now),
  ])
  assert.equal(claims.filter(Boolean).length, 1)
  assert.deepEqual(await listPendingApprovals(database as never, now), [])
  assert.equal((await findApproval(database as never, 'active'))?.status, 'executing')
})

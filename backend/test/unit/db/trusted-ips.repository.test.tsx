import assert from 'node:assert/strict'
import test from 'node:test'
import {
  listTrustedIps,
  trustIp,
  untrustIp,
} from '../../../src/db/repositories/trusted-ips.repository.tsx'

function makeDatabase() {
  const records = new Map<string, Record<string, unknown>>()
  return {
    collection() {
      return {
        async updateOne(filter, update) {
          const current = records.get(filter.ip)
          records.set(filter.ip, {
            ...(current ? {} : update.$setOnInsert),
            ...current,
            ...update.$set,
          })
        },
        async findOne(filter) {
          return records.get(filter.ip) || null
        },
        find() {
          const cursor = {
            sort() { return cursor },
            limit() { return cursor },
            async toArray() { return [...records.values()] },
          }
          return cursor
        },
        async deleteOne(filter) {
          return { deletedCount: records.delete(filter.ip) ? 1 : 0 }
        },
      }
    },
  }
}

test('trusted IP addresses are normalized, listed and removable', async () => {
  const database = makeDatabase()
  const trusted = await trustIp(database, '::ffff:127.0.0.1', '0xowner')
  assert.equal(trusted.ip, '127.0.0.1')
  assert.equal((await listTrustedIps(database)).length, 1)
  assert.equal(await untrustIp(database, '127.0.0.1'), true)
  assert.equal(await listTrustedIps(database).then((items) => items.length), 0)
})

test('invalid values cannot be added to the trusted IP list', async () => {
  await assert.rejects(trustIp(makeDatabase(), 'not-an-ip', '0xowner'), /IP address is invalid/)
})

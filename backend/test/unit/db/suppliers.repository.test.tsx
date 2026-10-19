import assert from 'node:assert/strict'
import test from 'node:test'
import {
  approveSupplierChange,
  createSupplier,
  getVerifiedSupplierRecipients,
  requestSupplierChange,
} from '../../../src/db/repositories/suppliers.repository.tsx'

function createDatabase() {
  const records = new Map<string, Record<string, unknown>>()
  return {
    collection() {
      return {
        async insertOne(record) {
          records.set(String(record.supplierId), record)
        },
        async findOne(filter) {
          const record = records.get(String(filter.supplierId))
          return record && matches(record, filter) ? record : null
        },
        async updateOne(filter, update) {
          const record = records.get(String(filter.supplierId))
          if (!record || !matches(record, filter)) return { modifiedCount: 0 }
          Object.assign(record, update.$set || {})
          for (const key of Object.keys(update.$unset || {})) delete record[key]
          return { modifiedCount: 1 }
        },
      }
    },
  }
}

function matches(record: Record<string, unknown>, filter: Record<string, unknown>) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = key.split('.').reduce<unknown>((value, part) => {
      if (typeof value !== 'object' || value === null) return undefined
      return (value as Record<string, unknown>)[part]
    }, record)
    if (typeof expected === 'object' && expected !== null) {
      const operators = expected as Record<string, unknown>
      if ('$ne' in operators) return actual !== operators.$ne
      if ('$exists' in operators) return (actual !== undefined) === operators.$exists
    }
    return actual === expected
  })
}

test('supplier creation and later payout changes require a different approver for each request', async () => {
  const database = createDatabase()
  const supplier = await createSupplier(database, {
    name: 'Yarn & Co',
    payoutAccount: '0x0000000000000000000000000000000000000001',
    requestedBy: '0xoriginal-owner',
  })

  assert.equal(await approveSupplierChange(database, supplier.supplierId, '0xoriginal-owner'), null)
  const activeSupplier = await approveSupplierChange(database, supplier.supplierId, '0xfirst-approver')
  assert.equal(activeSupplier.status, 'active')
  assert.equal(activeSupplier.payoutAccount, '0x0000000000000000000000000000000000000001')

  await requestSupplierChange(
    database,
    supplier.supplierId,
    { payoutAccount: '0x0000000000000000000000000000000000000002' },
    '0xchange-requester',
  )
  assert.equal(activeSupplier.payoutAccount, '0x0000000000000000000000000000000000000001')

  const changedSupplier = await approveSupplierChange(database, supplier.supplierId, '0xoriginal-owner')
  assert.equal(changedSupplier.payoutAccount, '0x0000000000000000000000000000000000000002')
  assert.equal(changedSupplier.pendingChange, undefined)
})

test('only separately approved supplier payout addresses enter the trusted recipient list', async () => {
  const database = createDatabase()
  const supplier = await createSupplier(database, {
    name: 'Verified Supplier',
    payoutAccount: '0x0000000000000000000000000000000000000003',
    requestedBy: '0xrequester',
  })
  const active = await approveSupplierChange(database, supplier.supplierId, '0xindependent-approver')
  assert.equal(active.status, 'active')

  const recipients = await getVerifiedSupplierRecipients({
    collection() {
      return {
        find(filter) {
          assert.deepEqual(filter, { status: 'active' })
          return {
            toArray: async () => [{ payoutAccount: active.payoutAccount }],
          }
        },
      }
    },
  })

  assert.deepEqual(recipients, ['0x0000000000000000000000000000000000000003'])
})

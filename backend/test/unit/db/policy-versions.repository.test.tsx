import assert from 'node:assert/strict'
import test from 'node:test'
import { capturePolicyVersion } from '../../../src/db/repositories/policy-versions.repository.tsx'

function makeDatabase() {
  const records = []
  const auditRecords = []
  const policyCollection = {
    async findOne() {
      return [...records].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    },
    async insertOne(record) {
      if (records.some((existing) => existing.versionHash === record.versionHash)) {
        throw Object.assign(new Error('duplicate'), { code: 11000 })
      }
      records.push(record)
    },
  }
  const auditCollection = {
    async findOne() {
      return auditRecords[auditRecords.length - 1] ?? null
    },
    async insertOne(record) {
      auditRecords.push(record)
    },
  }
  return {
    database: {
      collection: (name) => name === 'policy_versions' ? policyCollection : auditCollection,
    },
    records,
    auditRecords,
  }
}

const policy = {
  chainId: 11155111,
  maxPerTxWei: 10n,
  maxPerRecipientPerDayWei: 20n,
  maxTxPerWindow: 5,
  velocityWindowSeconds: 600,
  allowedRecipients: new Set(['0x0000000000000000000000000000000000000001']),
  allowedContracts: new Set(),
  allowedSwapRouters: new Set(),
  swapRouterAddress: '',
  maxSlippageBps: 50,
  maxSwapInputAmount: '1',
  maxSwapPerTokenPerDay: '5',
}

test('policy history appends only distinct effective configurations', async () => {
  const { database, records, auditRecords } = makeDatabase()
  const first = await capturePolicyVersion(database as never, policy)
  const unchanged = await capturePolicyVersion(database as never, policy)
  const changed = await capturePolicyVersion(database as never, { ...policy, maxSlippageBps: 75 })

  assert.equal(records.length, 2)
  assert.equal(auditRecords.length, 2)
  assert.equal(first.versionHash, unchanged.versionHash)
  assert.notEqual(first.versionHash, changed.versionHash)
  assert.deepEqual(changed.changedFields, ['maxSlippageBps'])
  assert.equal(changed.previousVersionHash, first.versionHash)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { readPolicyConfig, setRuntimePolicyOverrides } from '../../../src/guard/policy-engine.tsx'
import { saveRuntimePolicy } from '../../../src/db/repositories/runtime-policy.repository.tsx'
import { COLLECTIONS } from '../../../src/db/collections.tsx'

test('runtime policy changes are saved to MongoDB, applied, versioned, and audited', async () => {
  const persisted: Record<string, unknown> = {}
  const policyVersions: Record<string, unknown>[] = []
  const auditEvents: Record<string, unknown>[] = []
  const database = {
    collection(name: string) {
      if (name === COLLECTIONS.runtimePolicy) {
        return {
          async updateOne(filter, update, options) {
            Object.assign(persisted, { filter, values: update.$set.values, updatedBy: update.$set.updatedBy, options })
          },
        }
      }
      if (name === COLLECTIONS.policyVersions) {
        return {
          async findOne() { return null },
          async insertOne(record) { policyVersions.push(record) },
        }
      }
      if (name === COLLECTIONS.audit) {
        return {
          async findOne() { return auditEvents.at(-1) ?? null },
          async insertOne(record) { auditEvents.push(record) },
        }
      }
      assert.fail(`Unexpected collection ${name}`)
    },
  }
  const recipient = '0x00000000000000000000000000000000000000a1'

  try {
    await saveRuntimePolicy(database, { ALLOWED_RECIPIENTS: recipient }, '0xadmin')

    assert.equal((persisted.filter as Record<string, unknown>)._id, 'active')
    assert.deepEqual(persisted.values, { ALLOWED_RECIPIENTS: recipient })
    assert.equal(persisted.updatedBy, '0xadmin')
    assert.equal(policyVersions.length, 1)
    assert.ok((policyVersions[0].changedFields as string[]).includes('allowedRecipients'))
    assert.equal(auditEvents.at(-1)?.type, 'policy.updated')
    assert.ok([...readPolicyConfig().allowedRecipients].some((address) => address.toLowerCase() === recipient))
  } finally {
    setRuntimePolicyOverrides({})
  }
})

import { randomUUID } from 'node:crypto'
import { appendAuditEvent } from '../../audit/audit-log.tsx'
import { readPolicyConfig, setRuntimePolicyOverrides } from '../../guard/policy-engine.tsx'
import { COLLECTIONS } from '../collections.tsx'
import { capturePolicyVersion } from './policy-versions.repository.tsx'

const ALLOWED_FIELDS = new Set([
  'MAX_PER_TX_ETH',
  'MAX_PER_RECIPIENT_PER_DAY_ETH',
  'MAX_TX_PER_WINDOW',
  'VELOCITY_WINDOW_SECONDS',
  'MAX_SLIPPAGE_BPS',
  'MAX_SWAP_INPUT_AMOUNT',
  'MAX_SWAP_PER_TOKEN_PER_DAY',
  'ALLOWED_RECIPIENTS',
])

function validOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, item]) => ALLOWED_FIELDS.has(key) && typeof item === 'string')
}

async function loadRuntimePolicy(database) {
  const record = await database.collection(COLLECTIONS.runtimePolicy).findOne({ _id: 'active' })
  if (!record) {
    setRuntimePolicyOverrides({})
    return {}
  }
  if (!validOverrides(record.values)) throw new Error('Persisted runtime policy is invalid')
  setRuntimePolicyOverrides(record.values)
  return record.values
}

async function saveRuntimePolicy(database, values, actorWallet) {
  if (!validOverrides(values)) throw new Error('Runtime policy contains unsupported fields')
  await database.collection(COLLECTIONS.runtimePolicy).updateOne(
    { _id: 'active' },
    { $set: { values, updatedAt: new Date(), updatedBy: actorWallet } },
    { upsert: true },
  )
  setRuntimePolicyOverrides(values)
  const version = await capturePolicyVersion(database, readPolicyConfig())
  await appendAuditEvent(database, {
    requestId: randomUUID(),
    type: 'policy.updated',
    data: { updatedBy: actorWallet, changedFields: Object.keys(values).sort(), versionHash: version.versionHash },
  })
  return version
}

export { loadRuntimePolicy, saveRuntimePolicy }

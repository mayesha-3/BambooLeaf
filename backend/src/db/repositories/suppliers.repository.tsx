import { getAddress } from 'ethers'
import { randomUUID } from 'node:crypto'
import { COLLECTIONS } from '../collections.tsx'

function normalizeSupplierName(name) {
  return name.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ')
}

async function createSupplier(database, { name, payoutAccount, requestedBy }) {
  const now = new Date()
  const record = {
    supplierId: randomUUID(),
    name: name.trim(),
    normalizedName: normalizeSupplierName(name),
    payoutAccount: getAddress(payoutAccount),
    status: 'pending_approval',
    requestedBy,
    createdAt: now,
    updatedAt: now,
  }
  await database.collection(COLLECTIONS.suppliers).insertOne(record)
  return record
}

async function requestSupplierChange(database, supplierId, change, requestedBy) {
  const supplier = await database.collection(COLLECTIONS.suppliers).findOne({ supplierId, status: 'active' })
  if (!supplier) return null
  const pendingChange = {
    name: typeof change.name === 'string' ? change.name.trim() : supplier.name,
    normalizedName: typeof change.name === 'string' ? normalizeSupplierName(change.name) : supplier.normalizedName,
    payoutAccount: typeof change.payoutAccount === 'string' ? getAddress(change.payoutAccount) : supplier.payoutAccount,
    requestedBy,
    requestedAt: new Date(),
  }
  const result = await database.collection(COLLECTIONS.suppliers).updateOne(
    { supplierId, status: 'active', pendingChange: { $exists: false } },
    { $set: { pendingChange, updatedAt: new Date() } },
  )
  return result.modifiedCount === 1 ? { ...supplier, pendingChange } : null
}

async function approveSupplierChange(database, supplierId, approvedBy) {
  const collection = database.collection(COLLECTIONS.suppliers)
  const supplier = await collection.findOne({ supplierId })
  if (!supplier) return null

  if (supplier.status === 'pending_approval') {
    if (supplier.requestedBy?.toLowerCase() === approvedBy.toLowerCase()) return null
    const result = await collection.updateOne(
      { supplierId, status: 'pending_approval', requestedBy: { $ne: approvedBy.toLowerCase() } },
      { $set: { status: 'active', approvedBy, approvedAt: new Date(), updatedAt: new Date() } },
    )
    return result.modifiedCount === 1 ? { ...supplier, status: 'active', approvedBy } : null
  }

  if (supplier.status === 'active' && supplier.pendingChange) {
    if (supplier.pendingChange.requestedBy?.toLowerCase() === approvedBy.toLowerCase()) return null
    const pending = supplier.pendingChange
    const result = await collection.updateOne(
      { supplierId, status: 'active', 'pendingChange.requestedBy': { $ne: approvedBy.toLowerCase() } },
      {
        $set: {
          name: pending.name,
          normalizedName: pending.normalizedName,
          payoutAccount: pending.payoutAccount,
          approvedBy,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: { pendingChange: '' },
      },
    )
    return result.modifiedCount === 1 ? { ...supplier, ...pending, pendingChange: undefined, approvedBy } : null
  }
  return null
}

async function getVerifiedSupplierRecipients(database) {
  const suppliers = await database.collection(COLLECTIONS.suppliers)
    .find({ status: 'active' }, { projection: { payoutAccount: 1 } })
    .toArray()
  return suppliers.map((supplier) => getAddress(supplier.payoutAccount))
}

async function policyWithVerifiedSupplierRecipients(database, policy) {
  const recipients = await getVerifiedSupplierRecipients(database)
  return { ...policy, allowedRecipients: new Set([...policy.allowedRecipients, ...recipients]) }
}

async function setPurchaseOrder(database, { supplierId, reference, amountEth, toleranceBps, createdBy }) {
  const now = new Date()
  const record = { supplierId, reference: reference.trim(), amountEth, toleranceBps, createdBy, createdAt: now, updatedAt: now }
  await database.collection(COLLECTIONS.purchaseOrders).insertOne(record)
  return record
}

export {
  approveSupplierChange,
  createSupplier,
  getVerifiedSupplierRecipients,
  normalizeSupplierName,
  policyWithVerifiedSupplierRecipients,
  requestSupplierChange,
  setPurchaseOrder,
}

import { COLLECTIONS } from '../collections.tsx'

async function createPendingApproval(database, approval) {
  const document = { ...approval, status: 'pending', createdAt: new Date() }
  await database.collection(COLLECTIONS.approvals).insertOne(document)
  return document
}

async function listPendingApprovals(database, now = Date.now()) {
  return database.collection(COLLECTIONS.approvals)
    .find({ status: 'pending', expiresAt: { $gt: now } }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()
}

async function findApproval(database, approvalId) {
  return database.collection(COLLECTIONS.approvals).findOne({ approvalId }, { projection: { _id: 0 } })
}

async function claimPendingApproval(database, approvalId, now = Date.now()) {
  const result = await database.collection(COLLECTIONS.approvals).updateOne(
    { approvalId, status: 'pending', expiresAt: { $gt: now } },
    { $set: { status: 'executing', decidedAt: now } },
  )
  return result.modifiedCount === 1
}

async function updateApproval(database, approvalId, status, fields = {}) {
  await database.collection(COLLECTIONS.approvals).updateOne(
    { approvalId },
    { $set: { ...fields, status, updatedAt: new Date() } },
  )
}

export {
  claimPendingApproval,
  createPendingApproval,
  findApproval,
  listPendingApprovals,
  updateApproval,
}
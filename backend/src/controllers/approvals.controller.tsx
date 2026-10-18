import { getDatabase } from '../db/connection.tsx'
import { approveGoal } from '../services/goals.service.tsx'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { COLLECTIONS } from '../db/collections.tsx'

export async function approve(request, response, next) {
  try {
    const approvalId = request.params.id
    const result = await approveGoal(getDatabase(), approvalId)
    response.json(result)
  } catch (error) {
    next(error)
  }
}

export async function reject(request, response, next) {
  try {
    const approvalId = request.params.id
    const database = getDatabase()
    const result = await database.collection(COLLECTIONS.approvals).updateOne(
      { approvalId, status: 'pending' },
      { $set: { status: 'rejected', decidedAt: new Date() } }
    )
    if (result.matchedCount === 0) {
      response.status(404).json({ error: 'Approval not found or already processed.' })
      return
    }
    const approval = await database.collection(COLLECTIONS.approvals).findOne({ approvalId, status: 'rejected' })
    if (approval) {
      await database.collection(COLLECTIONS.goals).updateOne(
        { requestId: approval.requestId },
        { $set: { approvalStatus: 'rejected', decidedAt: new Date() } }
      )
      await appendAuditEvent(database, {
        requestId: approval.requestId,
        type: 'approval.rejected',
        data: { approvalId, tier: approval.tier },
      })
    }
    response.json({ status: 'rejected' })
  } catch (error) {
    next(error)
  }
}

export async function listApprovals(request, response, next) {
  try {
    const collection = getDatabase().collection(COLLECTIONS.approvals)
    const now = Date.now()
    await collection.updateMany(
      { status: 'pending', expiresAt: { $lte: now } },
      { $set: { status: 'expired' } },
    )
    const approvals = await collection.find({ status: 'pending', expiresAt: { $gt: now } }).toArray()
    const serializedApprovals = approvals.map(({ _id, txRequests, ...approval }) => ({
      ...approval,
      txRequests: txRequests.map(tx => ({ ...tx, value: tx.value.toString() })),
    }))
    response.json({ approvals: serializedApprovals })
  } catch (error) {
    next(error)
  }
}
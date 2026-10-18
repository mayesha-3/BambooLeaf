import { getAddress } from 'ethers'
import { getDatabase } from '../db/connection.tsx'
import {
  ApprovalError,
  approveTransfer,
  getApprovalStatus,
  getPendingApprovals,
  rejectTransferApproval,
} from '../services/approvals.service.tsx'

const approvalIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function approvalOwner(request, response) {
  if (request.userRole !== 'admin' && request.userRole !== 'approver') {
    response.status(403).json({ error: 'Only an admin or approver can manage transaction approvals.' })
    return null
  }
  const configuredOwner = process.env.OWNER_WALLET_ADDRESS
  if (!configuredOwner) {
    response.status(503).json({ error: 'OWNER_WALLET_ADDRESS must be configured for transaction approvals.' })
    return null
  }
  try {
    const owner = getAddress(configuredOwner).toLowerCase()
    return owner
  } catch {
    response.status(503).json({ error: 'OWNER_WALLET_ADDRESS is invalid.' })
    return null
  }
}

async function list(request, response, next) {
  const owner = approvalOwner(request, response)
  if (!owner) return
  try {
    response.json({ approvals: await getPendingApprovals(getDatabase(), owner) })
  } catch (error) {
    next(error)
  }
}

async function status(request, response, next) {
  const owner = authenticatedOwner(request, response)
  if (!owner) return
  const approvalId = request.params.approvalId
  if (!approvalIdPattern.test(approvalId)) {
    response.status(400).json({ error: 'Approval identifier is invalid.' })
    return
  }
  try {
    response.json(await getApprovalStatus(getDatabase(), approvalId, owner))
  } catch (error) {
    if (error instanceof ApprovalError) {
      response.status(error.statusCode).json({ error: error.message })
      return
    }
    next(error)
  }
}

async function approve(request, response, next) {
  const owner = approvalOwner(request, response)
  if (!owner) return
  const approvalId = request.params.approvalId
  if (!approvalIdPattern.test(approvalId)) {
    response.status(400).json({ error: 'Approval identifier is invalid.' })
    return
  }
  try {
    response.json(await approveTransfer(getDatabase(), approvalId, owner, request.requestId))
  } catch (error) {
    if (error instanceof ApprovalError) {
      response.status(error.statusCode).json({ error: error.message })
      return
    }
    next(error)
  }
}

async function reject(request, response, next) {
  const owner = approvalOwner(request, response)
  if (!owner) return
  const approvalId = request.params.approvalId
  if (!approvalIdPattern.test(approvalId)) {
    response.status(400).json({ error: 'Approval identifier is invalid.' })
    return
  }
  try {
    response.json(await rejectTransferApproval(getDatabase(), approvalId, owner, request.requestId))
  } catch (error) {
    if (error instanceof ApprovalError) {
      response.status(error.statusCode).json({ error: error.message })
      return
    }
    next(error)
  }
}

export { approve, list, reject, status }
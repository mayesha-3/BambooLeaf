import { getDatabase } from '../db/connection.tsx'
import { listAuditEvents } from '../audit/audit-log.tsx'
import { verifyAuditChain } from '../audit/verify-chain.tsx'

async function getAudit(request, response, next) {
  try {
    const requested = Number(request.query.limit || 50)
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 100) : 50
    response.json({ entries: await listAuditEvents(getDatabase(), limit) })
  } catch (error) {
    next(error)
  }
}

async function verifyAudit(request, response, next) {
  try {
    const result = await verifyAuditChain(getDatabase())
    response.status(result.valid ? 200 : 409).json(result)
  } catch (error) {
    next(error)
  }
}

export { getAudit, verifyAudit }
import { randomUUID } from 'node:crypto'
import { appendAuditEvent } from '../audit/audit-log.tsx'
import { getDatabase } from '../db/connection.tsx'
import {
  assignableRoles,
  listRoleAccounts,
  normalizeWalletAddress,
  resolveWalletRole,
  saveWalletRole,
} from '../db/repositories/role-assignments.repository.tsx'

async function getRoleAccounts(_request, response, next) {
  try {
    response.json({ accounts: await listRoleAccounts(getDatabase()) })
  } catch (error) {
    next(error)
  }
}

async function assignWalletRole(request, response, next) {
  const { walletAddress, role } = request.body || {}
  if (typeof walletAddress !== 'string' || walletAddress.length > 42 ||
      (role !== null && (typeof role !== 'string' || !assignableRoles.includes(role)))) {
    response.status(400).json({
      error: 'Provide a valid wallet address and a role of admin, approver, clerk, auditor, or null to remove access.',
    })
    return
  }

  try {
    const wallet = normalizeWalletAddress(walletAddress)
    const database = getDatabase()
    const previousRole = await resolveWalletRole(database, wallet)
    const assignment = await saveWalletRole(
      database,
      wallet,
      role,
      request.deviceSession.walletAddress,
    )
    const requestId = request.requestId || randomUUID()
    await appendAuditEvent(database, {
      requestId,
      type: 'access.role_assigned',
      data: {
        walletAddress: wallet,
        previousRole,
        role,
        assignedBy: request.deviceSession.walletAddress,
      },
    })
    response.json({ assignment, message: role ? `Account role set to ${role}.` : 'Account role removed.' })
  } catch (error) {
    if (error instanceof Error && /configured owner account/i.test(error.message)) {
      response.status(409).json({ error: error.message })
      return
    }
    if (error instanceof Error && /invalid address/i.test(error.message)) {
      response.status(400).json({ error: 'Wallet address is invalid.' })
      return
    }
    next(error)
  }
}

export { assignWalletRole, getRoleAccounts }

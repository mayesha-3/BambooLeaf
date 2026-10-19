import { Router } from 'express'
import { approve, list, reject, status } from '../controllers/approvals.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.get('/', requireDeviceSession, requireRoles('admin', 'approver'), list)
router.get('/:approvalId', requireDeviceSession, requireRoles('admin', 'approver'), status)
router.post('/:approvalId/approve', requireDeviceSession, requireRoles('admin', 'approver'), approve)
router.post('/:approvalId/reject', requireDeviceSession, requireRoles('admin', 'approver'), reject)

export default router
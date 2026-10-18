import { Router } from 'express'
import { approve, list, reject } from '../controllers/approvals.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.get('/', requireDeviceSession, requireRoles('admin', 'approver'), list)
router.post('/:approvalId/approve', requireDeviceSession, requireRoles('admin', 'approver'), approve)
router.post('/:approvalId/reject', requireDeviceSession, requireRoles('admin', 'approver'), reject)

export default router
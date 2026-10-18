import { Router } from 'express'
import { approve, list, reject, status } from '../controllers/approvals.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'

const router = Router()
router.get('/', requireDeviceSession, list)
router.get('/:approvalId', requireDeviceSession, status)
router.post('/:approvalId/approve', requireDeviceSession, approve)
router.post('/:approvalId/reject', requireDeviceSession, reject)

export default router
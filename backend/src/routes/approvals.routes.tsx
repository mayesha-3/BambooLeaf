import { Router } from 'express'
import { approve, list, reject } from '../controllers/approvals.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'

const router = Router()
router.get('/', requireDeviceSession, list)
router.post('/:approvalId/approve', requireDeviceSession, approve)
router.post('/:approvalId/reject', requireDeviceSession, reject)

export default router
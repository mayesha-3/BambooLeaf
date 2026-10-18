import { Router } from 'express'
import { activate, getAutonomy, humanReset } from '../controllers/autonomy.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.get('/', requireDeviceSession, requireRoles('admin', 'approver', 'auditor'), getAutonomy)
router.post('/kill', requireDeviceSession, requireRoles('admin'), activate)
router.post('/reset', requireDeviceSession, requireRoles('admin'), humanReset)

export default router

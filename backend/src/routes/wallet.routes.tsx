import { Router } from 'express'
import { getBalance } from '../controllers/wallet.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.get('/balance', requireDeviceSession, requireRoles('admin', 'approver', 'clerk', 'auditor'), getBalance)

export default router

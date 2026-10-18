import { Router } from 'express'
import { assignWalletRole, getRoleAccounts } from '../controllers/roles.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.use(requireDeviceSession, requireRoles('admin'))
router.get('/', getRoleAccounts)
router.put('/', assignWalletRole)

export default router

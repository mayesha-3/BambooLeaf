import { Router } from 'express'
import { getPolicy, updatePolicy } from '../controllers/policy.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.get('/', requireDeviceSession, requireRoles('admin', 'approver', 'auditor'), getPolicy)
router.put('/', requireDeviceSession, requireRoles('admin'), updatePolicy)

export default router
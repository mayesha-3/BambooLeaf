import { Router } from 'express'
import { createGoal } from '../controllers/goals.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.post('/', requireDeviceSession, requireRoles('admin', 'approver', 'clerk'), createGoal)

export default router
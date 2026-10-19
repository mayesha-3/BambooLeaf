import { Router } from 'express'
import { createGoal, goalHistory } from '../controllers/goals.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.get('/history', requireDeviceSession, requireRoles('admin', 'approver', 'clerk'), goalHistory)
router.post('/', requireDeviceSession, requireRoles('admin', 'approver', 'clerk'), createGoal)

export default router
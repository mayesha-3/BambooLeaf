import { Router } from 'express'
import { activate, getAutonomy, humanReset } from '../controllers/autonomy.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'

const router = Router()
router.get('/', requireDeviceSession, getAutonomy)
router.post('/kill', requireDeviceSession, activate)
router.post('/reset', requireDeviceSession, humanReset)

export default router

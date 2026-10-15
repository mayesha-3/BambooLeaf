import { Router } from 'express'
import { cancelChallenge, getChallenge, listDevices, login, logout, updateBlock } from '../controllers/devices.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'

const router = Router()
router.post('/challenge', getChallenge)
router.post('/challenge/cancel', cancelChallenge)
router.post('/login', login)
router.get('/', requireDeviceSession, listDevices)
router.delete('/session', requireDeviceSession, logout)
router.post('/blocks', requireDeviceSession, updateBlock)
router.delete('/blocks', requireDeviceSession, updateBlock)

export default router

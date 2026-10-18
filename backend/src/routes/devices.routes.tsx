import { Router } from 'express'
import { cancelChallenge, enrollDevice, getChallenge, getEnrollmentChallenge, listDevices, login, logout, reviewDevice, updateBlock } from '../controllers/devices.controller.tsx'
import { createRequestProof, requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.post('/challenge', getChallenge)
router.post('/challenge/cancel', cancelChallenge)
router.post('/login', login)
router.post('/enrollment/challenge', getEnrollmentChallenge)
router.post('/enrollment', enrollDevice)
router.post('/proof-challenge', createRequestProof)
router.get('/', requireDeviceSession, listDevices)
router.delete('/session', requireDeviceSession, logout)
router.post('/blocks', requireDeviceSession, requireRoles('admin'), updateBlock)
router.delete('/blocks', requireDeviceSession, requireRoles('admin'), updateBlock)
router.post('/:action', requireDeviceSession, requireRoles('admin'), reviewDevice)

export default router

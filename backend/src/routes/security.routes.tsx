import { Router } from 'express'
import { addTrustedIp, getTrustedIps, removeTrustedIp } from '../controllers/security.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.use(requireDeviceSession, requireRoles('admin'))
router.get('/trusted-ips', getTrustedIps)
router.post('/trusted-ips', addTrustedIp)
router.delete('/trusted-ips', removeTrustedIp)

export default router

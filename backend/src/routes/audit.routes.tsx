import { Router } from 'express'
import { exportAudit, getAudit, getAuditAccess, getAutonomyHistory, getPolicyHistory, verifyAudit } from '../controllers/audit.controller.tsx'
import { requireAuditReadAccess, requireDeviceSession } from '../middleware/device-auth.tsx'

const router = Router()
router.use(requireDeviceSession, requireAuditReadAccess)
router.get('/access', getAuditAccess)
router.get('/verify', verifyAudit)
router.get('/autonomy-history', getAutonomyHistory)
router.get('/policy-history', getPolicyHistory)
router.get('/export', exportAudit)
router.get('/', getAudit)

export default router
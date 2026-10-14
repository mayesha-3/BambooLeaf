import { Router } from 'express'
import { getAudit, verifyAudit } from '../controllers/audit.controller.tsx'

const router = Router()
router.get('/', getAudit)
router.get('/verify', verifyAudit)

export default router
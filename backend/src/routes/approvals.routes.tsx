import { Router } from 'express'
import { approve, reject, listApprovals } from '../controllers/approvals.controller.tsx'

const router = Router()
router.get('/', listApprovals)
router.post('/:id/approve', approve)
router.post('/:id/reject', reject)

export default router
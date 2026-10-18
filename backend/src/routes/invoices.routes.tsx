import { Router } from 'express'
import { listInvoices, submitInvoice } from '../controllers/invoices.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.use(requireDeviceSession)
router.get('/', requireRoles('admin', 'approver', 'clerk'), listInvoices)
router.post('/', requireRoles('admin', 'approver', 'clerk'), submitInvoice)

export default router

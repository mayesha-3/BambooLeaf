import { Router } from 'express'
import {
  addPurchaseOrder,
  addSupplier,
  approveSupplier,
  deleteSupplier,
  editSupplier,
  listPurchaseOrders,
  listSuppliers,
} from '../controllers/suppliers.controller.tsx'
import { requireDeviceSession } from '../middleware/device-auth.tsx'
import { requireRoles } from '../middleware/roles.tsx'

const router = Router()
router.use(requireDeviceSession)
router.get('/', requireRoles('admin', 'approver', 'clerk'), listSuppliers)
router.post('/', requireRoles('admin'), addSupplier)
router.put('/:supplierId', requireRoles('admin'), editSupplier)
router.delete('/:supplierId', requireRoles('admin'), deleteSupplier)
router.post('/:supplierId/approve', requireRoles('approver'), approveSupplier)
router.get('/purchase-orders', requireRoles('admin', 'approver', 'clerk'), listPurchaseOrders)
router.post('/purchase-orders', requireRoles('admin'), addPurchaseOrder)

export default router

import { Router } from 'express'
import approvalRoutes from './approvals.routes.tsx'
import arenaRoutes from './arena.routes.tsx'
import auditRoutes from './audit.routes.tsx'
import autonomyRoutes from './autonomy.routes.tsx'
import deviceRoutes from './devices.routes.tsx'
import goalRoutes from './goals.routes.tsx'
import policyRoutes from './policy.routes.tsx'
import walletRoutes from './wallet.routes.tsx'


const router = Router()
router.use('/goal', goalRoutes)
router.use('/arena', arenaRoutes)
router.use('/approvals', approvalRoutes)
router.use('/audit', auditRoutes)
router.use('/autonomy', autonomyRoutes)
router.use('/devices', deviceRoutes)
router.use('/policy', policyRoutes)
router.use('/wallet', walletRoutes)

export default router
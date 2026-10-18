import { Router } from 'express'
import auditRoutes from './audit.routes.tsx'
import deviceRoutes from './devices.routes.tsx'
import goalRoutes from './goals.routes.tsx'
import walletRoutes from './wallet.routes.tsx'


const router = Router()
router.use('/goal', goalRoutes)
router.use('/audit', auditRoutes)
router.use('/devices', deviceRoutes)
router.use('/wallet', walletRoutes)

export default router
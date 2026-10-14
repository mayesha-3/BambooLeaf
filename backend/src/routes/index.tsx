import { Router } from 'express'
import auditRoutes from './audit.routes.tsx'
import goalRoutes from './goals.routes.tsx'

const router = Router()
router.use('/goal', goalRoutes)
router.use('/audit', auditRoutes)

export default router
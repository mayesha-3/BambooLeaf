import { Router } from 'express'
import { getPolicy } from '../controllers/policy.controller.tsx'

const router = Router()
router.get('/', getPolicy)

export default router
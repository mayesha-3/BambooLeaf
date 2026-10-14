import { Router } from 'express'
import { createGoal } from '../controllers/goals.controller.tsx'

const router = Router()
router.post('/', createGoal)

export default router
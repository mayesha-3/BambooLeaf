import { Router } from 'express'
import { getBalance } from '../controllers/wallet.controller.tsx'

const router = Router()
router.get('/balance', getBalance)

export default router
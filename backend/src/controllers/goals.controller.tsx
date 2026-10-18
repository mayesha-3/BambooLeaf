import { randomUUID } from 'node:crypto'
import { goalRequestSchema } from '../guard/intent.schema.tsx'
import { getDatabase } from '../db/connection.tsx'
import { submitGoal } from '../services/goals.service.tsx'

async function createGoal(request, response, next) {
  const parsed = goalRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: 'Request body must contain a goal (1–2000 chars). Optional untrusted: array of up to 5 strings, each ≤ 4000 chars.' })
    return
  }

  const idempotencyKey = request.get('Idempotency-Key') || randomUUID()
  if (idempotencyKey.length > 128) {
    response.status(400).json({ error: 'Idempotency-Key is too long.' })
    return
  }

  try {
    const result = await submitGoal(getDatabase(), parsed.data.goal, idempotencyKey, parsed.data.untrusted)
    response.status(result.statusCode).json(result.body)
  } catch (error) {
    next(error)
  }
}

export { createGoal }
import { Router } from 'express'
import { evaluate } from '../controllers/arena.controller.tsx'

function positiveIntegerEnvironment(name, fallback) {
  const configured = process.env[name]?.trim()
  const value = configured ? Number(configured) : fallback
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

const WINDOW_MS = positiveIntegerEnvironment('ARENA_RATE_LIMIT_WINDOW_MS', 60_000)
const MAX_REQUESTS = positiveIntegerEnvironment('ARENA_RATE_LIMIT_MAX_REQUESTS', 10)
const MAX_TRACKED_CLIENTS = 1000
const clients = new Map()

function enforceArenaRateLimit(request, response, next) {
  const now = Date.now()
  for (const [key, bucket] of clients) {
    if (bucket.resetAt <= now) clients.delete(key)
  }
  const key = request.ip || request.socket.remoteAddress || 'unknown'
  const bucket = clients.get(key)
  if (bucket && bucket.count >= MAX_REQUESTS) {
    response.status(429).json({ error: 'Arena rate limit reached; try again in a minute.' })
    return
  }
  if (!bucket && clients.size >= MAX_TRACKED_CLIENTS) {
    response.status(503).json({ error: 'Arena rate limiter is at capacity; try again later.' })
    return
  }
  if (bucket) bucket.count += 1
  else clients.set(key, { count: 1, resetAt: now + WINDOW_MS })
  next()
}

const router = Router()
router.post('/evaluate', enforceArenaRateLimit, evaluate)

export default router
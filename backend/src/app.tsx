import cors from 'cors'
import express from 'express'
import routes from './routes/index.tsx'
import { errorHandler } from './middleware/error-handler.tsx'
import { requestId } from './middleware/request-id.tsx'
// import { requireOwner } from './middleware/auth.tsx'
// import { rateLimit } from './middleware/rate-limit.tsx'

function createApp() {
  const app = express()
  app.disable('x-powered-by')

  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }))
  
  app.use(express.json({ limit: '32kb', strict: true }))
  
  app.use(requestId)

  app.get('/health', (request, response) => response.json({ status: 'ok' }))


  app.use('/api', routes)


  app.use((request, response) => response.status(404).json({ error: 'Not found.' }))
  app.use(errorHandler)
  
  return app
}

export { createApp }
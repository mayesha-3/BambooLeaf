import cors from 'cors'
import express from 'express'
import routes from './routes/index.tsx'
import { errorHandler } from './middleware/error-handler.tsx'
import { requestId } from './middleware/request-id.tsx'
// import { requireOwner } from './middleware/auth.tsx'
// import { rateLimit } from './middleware/rate-limit.tsx'

function createApp() {
  const app = express()
  const configuredProxyHops = process.env.TRUST_PROXY_HOPS || '0'
  const proxyHops = Number(configuredProxyHops)
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10')
  }
  app.set('trust proxy', proxyHops)
  app.disable('x-powered-by')

  const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  app.use(cors({ origin: allowedOrigins }))
  app.use(express.json({
    limit: '32kb',
    strict: true,
    verify: (request, _response, buffer) => { request.rawBody = buffer.toString('utf8') },
  }))
  app.use(requestId)

  app.get('/health', (request, response) => response.json({ status: 'ok' }))


  app.use('/api', routes)


  app.use((request, response) => response.status(404).json({ error: 'Not found.' }))
  app.use(errorHandler)
  
  return app
}

export { createApp }
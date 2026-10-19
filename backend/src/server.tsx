import 'dotenv/config'

import { closeDatabase, connectDatabase } from './db/connection.tsx'
import { createApp } from './app.tsx'

async function startServer() {
  await connectDatabase()
  const app = createApp()
  const port = Number(process.env.PORT || 3000)
  const host = process.env.HOST || '0.0.0.0'
  const server = app.listen(port, host, () => {
    console.log(`Guarded Agent Wallet API listening on http://${host}:${port}`)
  })

  const shutdown = async () => {
    server.close(async (error) => {
      await closeDatabase()
      if (error) {
        console.error(error)
        process.exitCode = 1
      }
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

startServer().catch((error) => {
  console.error('Failed to start API:', error.message)
  process.exitCode = 1
})
import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../../src/app.tsx'

test('audit API requires an authenticated owner or auditor session', async () => {
  const server = createApp().listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    for (const path of ['/api/audit', '/api/audit/verify', '/api/audit/policy-history', '/api/audit/autonomy-history']) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`)
      assert.equal(response.status, 401, path)
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

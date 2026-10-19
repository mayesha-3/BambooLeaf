import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../../src/app.tsx'

test('Arena endpoint rejects oversized prompts before planner or signer execution', async () => {
  const server = createApp().listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const response = await fetch(`http://127.0.0.1:${address.port}/api/arena/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'x'.repeat(1001) }),
    })
    assert.equal(response.status, 400)
    const result = await response.json() as { status: string; execution: string }
    assert.equal(result.status, 'invalid_request')
    assert.equal(result.execution, 'not_executed')

    for (let requestCount = 1; requestCount < 10; requestCount += 1) {
      const nextResponse = await fetch(`http://127.0.0.1:${address.port}/api/arena/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'x'.repeat(1001) }),
      })
      assert.equal(nextResponse.status, 400)
    }
    const limitedResponse = await fetch(`http://127.0.0.1:${address.port}/api/arena/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'x'.repeat(1001) }),
    })
    assert.equal(limitedResponse.status, 429)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
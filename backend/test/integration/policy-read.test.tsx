import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import { createApp } from '../../src/app.tsx'

test('policy API reports active backend limits and allowlists', async () => {
  const keys = [
    'CHAIN_ID',
    'MAX_PER_TX_ETH',
    'MAX_PER_RECIPIENT_PER_DAY_ETH',
    'MAX_TX_PER_WINDOW',
    'VELOCITY_WINDOW_SECONDS',
    'ALLOWED_RECIPIENTS',
    'ALLOWED_CONTRACTS',
  ]
  const previous = new Map(keys.map((key) => [key, process.env[key]]))
  Object.assign(process.env, {
    CHAIN_ID: '11155111',
    MAX_PER_TX_ETH: '0.03',
    MAX_PER_RECIPIENT_PER_DAY_ETH: '0.12',
    MAX_TX_PER_WINDOW: '7',
    VELOCITY_WINDOW_SECONDS: '300',
    ALLOWED_RECIPIENTS: '0x0000000000000000000000000000000000000001',
    ALLOWED_CONTRACTS: '0x0000000000000000000000000000000000000002',
  })
  const server = createApp().listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const response = await fetch(`http://127.0.0.1:${address.port}/api/policy`)
    assert.equal(response.status, 200)
    const policy = await response.json() as {
      chainId: number
      maxPerTxEth: string
      maxPerRecipientPerDayEth: string
      maxTransactionsPerWindow: number
      velocityWindowSeconds: number
      allowedRecipients: string[]
      allowedContracts: string[]
      supportedAssets: { symbol: string }[]
    }
    assert.equal(policy.chainId, 11155111)
    assert.equal(policy.maxPerTxEth, '0.03')
    assert.equal(policy.maxPerRecipientPerDayEth, '0.12')
    assert.equal(policy.maxTransactionsPerWindow, 7)
    assert.equal(policy.velocityWindowSeconds, 300)
    assert.deepEqual(policy.allowedRecipients, ['0x0000000000000000000000000000000000000001'])
    assert.deepEqual(policy.allowedContracts, ['0x0000000000000000000000000000000000000002'])
    assert.deepEqual(policy.supportedAssets.map((asset) => asset.symbol).sort(), ['ETH', 'USDC', 'WETH'])
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    for (const key of keys) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

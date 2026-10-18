import assert from 'node:assert/strict'
import test from 'node:test'
import { activateKillSwitch, reset } from '../../../src/guard/autonomy-manager.tsx'
import { COLLECTIONS } from '../../../src/db/collections.tsx'
import { processGoal } from '../../../src/services/goals.service.tsx'

function makeDatabase() {
  const events: Array<Record<string, unknown>> = []
  const auditCollection = {
    findOne: async () => events.at(-1) ?? null,
    insertOne: async (event: Record<string, unknown>) => {
      events.push(event)
      return { acknowledged: true }
    },
  }
  return {
    events,
    database: {
      collection: (name: string) => {
        assert.equal(name, COLLECTIONS.audit)
        return auditCollection
      },
    },
  }
}

test('balance checks succeed while the kill switch is active', async () => {
  reset()
  activateKillSwitch()
  const { database, events } = makeDatabase()
  let walletRead = false

  try {
    const result = await processGoal(database, 'Check my balance', 'balance-request', undefined, {
      planGoal: async () => ({
        intentId: 'balance-intent',
        action: 'read_balance',
        chainId: 31337,
        token: 'ETH',
        rationale: 'Read the guarded wallet balance.',
        sourceRefs: ['user_goal'],
      }),
      getWalletSnapshot: async () => {
        walletRead = true
        return {
          address: '0x0000000000000000000000000000000000000001',
          chainId: 31337,
          balanceEth: '1.2500',
          balanceUsdc: '2.00',
        }
      },
    })

    assert.equal(result.statusCode, 200)
    assert.equal(result.body.status, 'success')
    assert.equal(result.body.data.balanceEth, '1.2500')
    assert.equal(result.body.intent.token, 'ETH')
    assert.equal(walletRead, true)
    assert.ok(events.some((event) => event.type === 'wallet.balance_read'))
  } finally {
    reset()
  }
})

test('transactions remain blocked while the kill switch is active', async () => {
  reset()
  activateKillSwitch()
  const { database } = makeDatabase()
  let walletRead = false

  try {
    const result = await processGoal(database, 'Send ETH', 'transfer-request', undefined, {
      planGoal: async () => ({
        intentId: 'transfer-intent',
        action: 'transfer',
        chainId: 31337,
        from: { token: 'ETH', amount: '0.01' },
        recipient: { address: '0x0000000000000000000000000000000000000001' },
        rationale: 'Send ETH.',
        sourceRefs: ['user_goal'],
      }),
      getWalletSnapshot: async () => {
        walletRead = true
        throw new Error('Wallet snapshot should not run for a blocked transfer.')
      },
    })

    assert.equal(result.statusCode, 423)
    assert.equal(result.body.code, 'KILL_SWITCH_ACTIVE')
    assert.match(result.body.error, /owner must reset autonomy/)
    assert.equal(walletRead, false)
  } finally {
    reset()
  }
})

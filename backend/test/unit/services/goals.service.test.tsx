import assert from 'node:assert/strict'
import test from 'node:test'
import { activateKillSwitch, getState, reset } from '../../../src/guard/autonomy-manager.tsx'
import { COLLECTIONS } from '../../../src/db/collections.tsx'
import { processGoal } from '../../../src/services/goals.service.tsx'

function makeDatabase() {
  const events: Array<Record<string, unknown>> = []
  const autonomyUpdates: Array<Record<string, unknown>> = []
  const auditCollection = {
    findOne: async () => events.at(-1) ?? null,
    insertOne: async (event: Record<string, unknown>) => {
      events.push(event)
      return { acknowledged: true }
    },
  }
  return {
    events,
    autonomyUpdates,
    database: {
      collection: (name: string) => {
        if (name === COLLECTIONS.audit) return auditCollection
        if (name === COLLECTIONS.autonomyState) {
          return {
            updateOne: async (_filter: unknown, update: Record<string, unknown>) => {
              autonomyUpdates.push(update)
              return { acknowledged: true }
            },
          }
        }
        assert.fail(`Unexpected collection: ${name}`)
      },
    },
  }
}

test('ordinary planner blocks do not count toward the autonomy freeze', async () => {
  reset()
  const { database, events, autonomyUpdates } = makeDatabase()
  const nonAttackCodes = [
    'QUARANTINE_FAILED',
    'INPUT_INVALID',
    'MODEL_REFUSED',
    'INVALID_OUTPUT',
    'UNKNOWN_CONTACT',
    'PROVIDERS_UNAVAILABLE',
    'BUDGET_EXCEEDED',
    'APPROVAL_EXPIRED',
    'SIMULATION_FAILED',
  ]

  try {
    for (const code of nonAttackCodes) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await processGoal(database, 'An ordinary request', `${code}-${attempt}`, undefined, {
          planGoal: async () => {
            throw Object.assign(new Error('Request could not be processed.'), { code })
          },
        })
        assert.equal(result.statusCode, 200)
        assert.equal(result.body.status, 'blocked')
        assert.equal(result.body.code, code)
      }
    }

    assert.equal(getState().blockedInWindow, 0)
    assert.equal(getState().frozen, false)
    assert.equal(autonomyUpdates.length, 0)
    assert.equal(events.filter((event) => event.type === 'planner.blocked').length, nonAttackCodes.length * 3)
    assert.equal(events.filter((event) => event.type === 'autonomy.blocked_attempt').length, 0)
  } finally {
    reset()
  }
})

test('the four specified planner attack signals count toward autonomy freeze', async () => {
  reset()
  const { database } = makeDatabase()

  try {
    for (const [code, count] of [
      ['UNGROUNDED_RECIPIENT', 3],
      ['DIGEST_MISMATCH', 3],
      ['TIER_3_FORBIDDEN', 3],
      ['UNTRUSTED_CONTENT_FLAGGED', 1],
    ] as const) {
      reset()
      for (let attempt = 0; attempt < count; attempt++) {
        await processGoal(database, 'An attack-like request', `${code}-${attempt}`, undefined, {
          planGoal: async () => {
            throw Object.assign(new Error('Blocked.'), { code })
          },
        })
      }
      assert.equal(getState().frozen, true, `${code} should freeze after ${count} occurrence(s)`)
      assert.equal(getState().level, 'L0')
      assert.equal(getState().blockedInWindow, count)
    }
  } finally {
    reset()
  }
})

test('unsupported planner codes remain 503 errors and do not count toward freeze', async () => {
  reset()
  const { database, autonomyUpdates } = makeDatabase()
  const unsupportedCodes = [
    'CHAIN_NOT_ALLOWED',
    'MULTI_INTENT_UNSUPPORTED',
    'NOT_REPRESENTABLE',
    'GUARD_SHAPE_INVALID',
  ]

  try {
    for (const code of unsupportedCodes) {
      const result = await processGoal(database, 'A valid but unsupported request', code, undefined, {
        planGoal: async () => {
          throw Object.assign(new Error('Unsupported request.'), { code })
        },
      })
      assert.equal(result.statusCode, 503)
      assert.equal(result.body.status, 'not_executed')
    }

    assert.equal(getState().blockedInWindow, 0)
    assert.equal(getState().frozen, false)
    assert.equal(autonomyUpdates.length, 0)
  } finally {
    reset()
  }
})

test('balance checks succeed while the kill switch is active', async () => {
  reset()
  activateKillSwitch()
  const { database, events } = makeDatabase()
  let walletRead = false

  try {
    const result = await processGoal(database, 'Check my balance', 'balance-request', undefined, {
      planGoal: async () => ({
        intentId: '00000000-0000-4000-8000-000000000001',
        action: 'read_balance',
        chainId: 31337,
        from: { token: 'ETH' },
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
        intentId: '00000000-0000-4000-8000-000000000002',
        action: 'transfer',
        chainId: 31337,
        from: { token: 'ETH', amount: '0.01' },
        recipient: '0x0000000000000000000000000000000000000001',
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

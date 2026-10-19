import assert from 'node:assert/strict'
import test from 'node:test'
import { getGoalHistory } from '../../../src/services/goals.service.tsx'
import { COLLECTIONS } from '../../../src/db/collections.tsx'

test('goal history reads saved Mongo records and overlays current approval state', async () => {
  const queryFilters: Array<{ collection: string; filter: Record<string, unknown> }> = []
  const records = [
    {
      requestId: 'approved-request',
      createdAt: new Date('2026-10-19T10:00:00.000Z'),
      body: {
        status: 'approval_required',
        approval: { id: 'approved-id' },
        intent: { action: 'transfer', token: 'ETH', amount: '0.02', recipient: '0xrecipient' },
      },
    },
    {
      requestId: 'pending-request',
      createdAt: new Date('2026-10-19T09:00:00.000Z'),
      body: {
        status: 'approval_required',
        approvalId: 'pending-id',
        intent: { action: 'swap', token: 'USDC', amount: '5', targetToken: 'ETH' },
      },
    },
    {
      requestId: 'denied-request',
      createdAt: new Date('2026-10-19T08:00:00.000Z'),
      body: {
        status: 'denied',
        reason: 'Policy limit exceeded',
        intent: { action: 'transfer', token: 'ETH', amount: '9', recipient: '0xrecipient' },
      },
    },
  ]
  const approvalRecords = [
    { approvalId: 'approved-id', status: 'approved', txHash: '0xconfirmed' },
    { approvalId: 'pending-id', status: 'pending', minimumOutput: '0.004' },
  ]
  const database = {
    collection(name: string) {
      return {
        find(filter: Record<string, unknown>) {
          queryFilters.push({ collection: name, filter })
          return {
            sort() { return this },
            limit() { return this },
            async toArray() {
              return name === COLLECTIONS.goals ? records : approvalRecords
            },
          }
        },
      }
    },
  }

  const result = await getGoalHistory(database)

  assert.deepEqual(result.summary, { completed: 1, blocked: 1, pending: 1, counted: 3 })
  assert.equal(result.transactions[0].status, 'success')
  assert.equal(result.transactions[0].txHash, '0xconfirmed')
  assert.equal(result.transactions[1].status, 'pending')
  assert.equal(result.transactions[1].toAmount, '0.004')
  assert.equal(result.transactions[2].status, 'blocked')
  assert.ok(queryFilters.some(({ collection, filter }) =>
    collection === COLLECTIONS.goals && 'body.intent.action' in filter))
})

test('clerk transaction history query is restricted to the signed-in wallet', async () => {
  let goalsFilter: Record<string, unknown> | undefined
  const database = {
    collection(name: string) {
      return {
        find(filter: Record<string, unknown>) {
          if (name === COLLECTIONS.goals) goalsFilter = filter
          return {
            sort() { return this },
            limit() { return this },
            async toArray() { return [] },
          }
        },
      }
    },
  }

  await getGoalHistory(database, { role: 'clerk', walletAddress: '0xclerk' })

  assert.equal(goalsFilter?.requestedBy, '0xclerk')
})

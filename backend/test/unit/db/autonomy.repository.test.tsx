import assert from 'node:assert/strict'
import test from 'node:test'
import { loadAutonomyState, saveAutonomyState } from '../../../src/db/repositories/autonomy.repository.tsx'

test('autonomy state repository loads and persists the global state document', async () => {
  let saved: Record<string, unknown> | null = null
  const collection = {
    async findOne(query: Record<string, unknown>) {
      assert.deepEqual(query, { _id: 'global' })
      return saved
    },
    async updateOne(query: Record<string, unknown>, update: { $set: Record<string, unknown> }, options: unknown) {
      assert.deepEqual(query, { _id: 'global' })
      assert.deepEqual(options, { upsert: true })
      saved = update.$set
    },
  }
  const database = { collection(name: string) {
    assert.equal(name, 'autonomy_state')
    return collection
  } }
  const initial = {
    level: 'L1',
    cleanStreak: 4,
    blockedInWindow: 0,
    windowStartedAt: Date.now(),
    lastDemotionReason: null,
    frozen: false,
  }
  await saveAutonomyState(database, initial)
  assert.deepEqual(await loadAutonomyState(database), {
    ...initial,
    updatedAt: (saved as Record<string, unknown>).updatedAt,
  })
})

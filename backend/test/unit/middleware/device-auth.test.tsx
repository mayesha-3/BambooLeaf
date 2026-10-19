import assert from 'node:assert/strict'
import test from 'node:test'
import { COLLECTIONS } from '../../../src/db/collections.tsx'
import { deleteDeviceSessions } from '../../../src/middleware/device-auth.tsx'

test('revoking one wallet device cannot delete sessions for another wallet on that device', async () => {
  let deletedFilter: Record<string, unknown> | undefined
  const database = {
    collection(name: string) {
      assert.equal(name, COLLECTIONS.deviceSessions)
      return {
        async deleteMany(filter: Record<string, unknown>) {
          deletedFilter = filter
          return { deletedCount: 1 }
        },
      }
    },
  }
  const session = {
    walletAddress: '0x0000000000000000000000000000000000000001',
    deviceId: 'shared-device',
  }

  await deleteDeviceSessions(database, session)
  assert.deepEqual(deletedFilter, session)
})

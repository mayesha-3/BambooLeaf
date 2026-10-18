import assert from 'node:assert/strict'
import test from 'node:test'
import {
  listRoleAccounts,
  resolveWalletRole,
  saveWalletRole,
} from '../../../src/db/repositories/role-assignments.repository.tsx'

function makeDatabase() {
  const records = new Map<string, Record<string, unknown>>()
  return {
    records,
    collection(name: string) {
      if (name === 'devices') {
        return {
          find() {
            return {
              async toArray() {
                return [
                  { walletAddress: '0x0000000000000000000000000000000000000002', lastSeenAt: new Date('2026-10-19T00:00:00Z') },
                  { walletAddress: '0x0000000000000000000000000000000000000002', lastSeenAt: new Date('2026-10-19T00:10:00Z') },
                ]
              },
            }
          },
        }
      }
      return {
        async findOne(filter: Record<string, unknown>) {
          return records.get(String(filter.walletAddress)) || null
        },
        find() {
          return {
            async toArray() { return [...records.values()] },
          }
        },
        async updateOne(
          filter: Record<string, unknown>,
          update: { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> },
        ) {
          const existing = records.get(String(filter.walletAddress))
          const record = {
            ...(existing ? {} : update.$setOnInsert),
            ...existing,
            ...update.$set,
            walletAddress: filter.walletAddress,
          }
          records.set(String(filter.walletAddress), record)
          return { modifiedCount: 1 }
        },
      }
    },
  }
}

test('admin role assignments override environment roles and can revoke access', async () => {
  const database = makeDatabase()
  const previousOwner = process.env.OWNER_WALLET_ADDRESS
  const previousClerks = process.env.CLERK_WALLET_ADDRESSES
  process.env.OWNER_WALLET_ADDRESS = '0x0000000000000000000000000000000000000001'
  process.env.CLERK_WALLET_ADDRESSES = '0x0000000000000000000000000000000000000002'
  try {
    assert.equal(await resolveWalletRole(database, '0x0000000000000000000000000000000000000001'), 'admin')
    assert.equal(await resolveWalletRole(database, '0x0000000000000000000000000000000000000002'), 'clerk')

    await saveWalletRole(
      database,
      '0x0000000000000000000000000000000000000002',
      'approver',
      '0x0000000000000000000000000000000000000001',
    )
    assert.equal(await resolveWalletRole(database, '0x0000000000000000000000000000000000000002'), 'approver')

    await saveWalletRole(
      database,
      '0x0000000000000000000000000000000000000002',
      'admin',
      '0x0000000000000000000000000000000000000001',
    )
    assert.equal(await resolveWalletRole(database, '0x0000000000000000000000000000000000000002'), 'admin')

    await saveWalletRole(
      database,
      '0x0000000000000000000000000000000000000002',
      null,
      '0x0000000000000000000000000000000000000001',
    )
    assert.equal(await resolveWalletRole(database, '0x0000000000000000000000000000000000000002'), null)

    const accounts = await listRoleAccounts(database)
    const account = accounts.find((entry) => entry.walletAddress === '0x0000000000000000000000000000000000000002')
    assert.equal(account.role, null)
    assert.equal(account.deviceCount, 2)
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_WALLET_ADDRESS
    else process.env.OWNER_WALLET_ADDRESS = previousOwner
    if (previousClerks === undefined) delete process.env.CLERK_WALLET_ADDRESSES
    else process.env.CLERK_WALLET_ADDRESSES = previousClerks
  }
})

test('configured owner cannot be assigned another role', async () => {
  const database = makeDatabase()
  const previousOwner = process.env.OWNER_WALLET_ADDRESS
  process.env.OWNER_WALLET_ADDRESS = '0x0000000000000000000000000000000000000001'
  try {
    await assert.rejects(
      saveWalletRole(
        database,
        process.env.OWNER_WALLET_ADDRESS,
        'clerk',
        '0x0000000000000000000000000000000000000002',
      ),
      /configured owner account cannot be reassigned/i,
    )
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_WALLET_ADDRESS
    else process.env.OWNER_WALLET_ADDRESS = previousOwner
  }
})

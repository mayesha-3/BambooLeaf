import { getAddress } from 'ethers'
import { COLLECTIONS } from '../collections.tsx'

const assignableRoles = ['admin', 'approver', 'clerk', 'auditor'] as const
type AssignableRole = typeof assignableRoles[number]
type ManagedRole = AssignableRole | null

function normalizeWalletAddress(value: string): string {
  return getAddress(value).toLowerCase()
}

function configuredRole(walletAddress: string): AssignableRole | null {
  for (const role of assignableRoles) {
    const envName = role === 'admin' ? ''
      : role === 'approver' ? 'APPROVER_WALLET_ADDRESSES'
        : role === 'clerk' ? 'CLERK_WALLET_ADDRESSES'
          : 'AUDITOR_WALLET_ADDRESSES'
    if (!envName) continue
    const wallets = (process.env[envName] || '').split(',').map((address) => {
      const trimmed = address.trim()
      return trimmed ? normalizeWalletAddress(trimmed) : ''
    })
    if (wallets.includes(walletAddress)) return role
  }
  return null
}

async function resolveWalletRole(database, walletAddress: string) {
  const wallet = normalizeWalletAddress(walletAddress)
  const owner = process.env.OWNER_WALLET_ADDRESS
  if (owner && normalizeWalletAddress(owner) === wallet) return 'admin'

  const assignment = await database.collection(COLLECTIONS.roleAssignments)
    .findOne({ walletAddress: wallet }, { projection: { _id: 0, role: 1 } })
  if (assignment) return assignment.role as ManagedRole
  return configuredRole(wallet)
}

async function saveWalletRole(database, walletAddress: string, role: ManagedRole, assignedBy: string) {
  const wallet = normalizeWalletAddress(walletAddress)
  const owner = process.env.OWNER_WALLET_ADDRESS
  if (owner && normalizeWalletAddress(owner) === wallet) {
    throw new Error('The configured owner account cannot be reassigned.')
  }
  const now = new Date()
  await database.collection(COLLECTIONS.roleAssignments).updateOne(
    { walletAddress: wallet },
    {
      $set: { role, assignedBy, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )
  return { walletAddress: wallet, role, assignedBy, updatedAt: now }
}

async function listRoleAccounts(database) {
  const [assignments, devices] = await Promise.all([
    database.collection(COLLECTIONS.roleAssignments)
      .find({}, { projection: { _id: 0 } })
      .toArray(),
    database.collection(COLLECTIONS.devices)
      .find({}, { projection: { walletAddress: 1, lastSeenAt: 1 } })
      .toArray(),
  ])

  const accountMap = new Map()
  function upsert(walletAddress: string, properties: Record<string, unknown> = {}) {
    const wallet = normalizeWalletAddress(walletAddress)
    const current = accountMap.get(wallet) || {
      walletAddress: wallet,
      role: configuredRole(wallet),
      source: configuredRole(wallet) ? 'environment' : 'unassigned',
      deviceCount: 0,
      lastSeenAt: null,
    }
    Object.assign(current, properties)
    accountMap.set(wallet, current)
  }

  for (const device of devices) {
    upsert(device.walletAddress, {
      deviceCount: (accountMap.get(normalizeWalletAddress(device.walletAddress))?.deviceCount || 0) + 1,
      lastSeenAt: device.lastSeenAt || null,
    })
  }
  for (const assignment of assignments) {
    upsert(assignment.walletAddress, {
      role: assignment.role,
      source: 'admin',
      updatedAt: assignment.updatedAt,
    })
  }
  for (const role of assignableRoles) {
    const envName = role === 'admin' ? 'OWNER_WALLET_ADDRESS'
      : role === 'approver' ? 'APPROVER_WALLET_ADDRESSES'
        : role === 'clerk' ? 'CLERK_WALLET_ADDRESSES'
          : 'AUDITOR_WALLET_ADDRESSES'
    const wallets = role === 'admin'
      ? [process.env[envName] || '']
      : (process.env[envName] || '').split(',')
    for (const address of wallets.map((item) => item.trim()).filter(Boolean)) {
      const wallet = normalizeWalletAddress(address)
      if (role !== 'admin' && accountMap.get(wallet)?.source === 'admin') continue
      upsert(address, {
        role,
        source: role === 'admin' ? 'owner' : 'environment',
      })
    }
  }

  return [...accountMap.values()].sort((left, right) =>
    left.walletAddress.localeCompare(right.walletAddress),
  )
}

export { assignableRoles, listRoleAccounts, normalizeWalletAddress, resolveWalletRole, saveWalletRole }

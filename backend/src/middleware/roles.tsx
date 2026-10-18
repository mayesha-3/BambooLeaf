import { getAddress } from 'ethers'

const ROLE_ENV = {
  admin: 'OWNER_WALLET_ADDRESS',
  approver: 'APPROVER_WALLET_ADDRESSES',
  clerk: 'CLERK_WALLET_ADDRESSES',
  auditor: 'AUDITOR_WALLET_ADDRESSES',
} as const

type Role = keyof typeof ROLE_ENV

function configuredWallets(role: Role): string[] {
  const raw = process.env[ROLE_ENV[role]] || ''
  return raw.split(',').map((value) => value.trim()).filter(Boolean).map((value) => getAddress(value).toLowerCase())
}

function walletRole(walletAddress: string): Role | null {
  const wallet = getAddress(walletAddress).toLowerCase()
  for (const role of ['admin', 'approver', 'clerk', 'auditor'] as const) {
    if (configuredWallets(role).includes(wallet)) return role
  }
  return null
}

function requireRoles(...allowedRoles: Role[]) {
  return (request, response, next) => {
    const walletAddress = request.deviceSession?.walletAddress
    const role = request.userRole as Role | null
    if (!role || !allowedRoles.includes(role)) {
      response.status(walletAddress ? 403 : 401).json({ error: 'Your account is not authorized for this action.' })
      return
    }
    next()
  }
}

export { configuredWallets, requireRoles, walletRole }

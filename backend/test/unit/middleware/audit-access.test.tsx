import assert from 'node:assert/strict'
import test from 'node:test'
import { requireAuditReadAccess } from '../../../src/middleware/device-auth.tsx'
import { walletRole } from '../../../src/middleware/roles.tsx'

function authorize(role: string | null) {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: unknown) {
      this.body = body
      return this
    },
  }
  let proceeded = false
  const request = { userRole: role }
  requireAuditReadAccess(request as never, response as never, () => { proceeded = true })
  return { response, proceeded, request }
}

test('admin, approver, and auditor have audit read access; clerk does not', () => {
  for (const role of ['admin', 'approver', 'auditor']) {
    const result = authorize(role)
    assert.equal(result.proceeded, true)
    assert.equal(result.request.auditRole, role)
  }
  const clerk = authorize('clerk')
  assert.equal(clerk.response.statusCode, 403)
  assert.equal(clerk.proceeded, false)
})

test('roles resolve only from configured wallet allowlists', () => {
  const previousOwner = process.env.OWNER_WALLET_ADDRESS
  const previousApprovers = process.env.APPROVER_WALLET_ADDRESSES
  const previousClerks = process.env.CLERK_WALLET_ADDRESSES
  const previousAuditors = process.env.AUDITOR_WALLET_ADDRESSES
  process.env.OWNER_WALLET_ADDRESS = '0x0000000000000000000000000000000000000001'
  process.env.APPROVER_WALLET_ADDRESSES = '0x0000000000000000000000000000000000000003'
  process.env.CLERK_WALLET_ADDRESSES = '0x0000000000000000000000000000000000000004'
  process.env.AUDITOR_WALLET_ADDRESSES = '0x0000000000000000000000000000000000000002'
  try {
    assert.equal(walletRole('0x0000000000000000000000000000000000000001'), 'admin')
    assert.equal(walletRole('0x0000000000000000000000000000000000000002'), 'auditor')
    assert.equal(walletRole('0x0000000000000000000000000000000000000003'), 'approver')
    assert.equal(walletRole('0x0000000000000000000000000000000000000004'), 'clerk')
    assert.equal(walletRole('0x0000000000000000000000000000000000000005'), null)
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_WALLET_ADDRESS
    else process.env.OWNER_WALLET_ADDRESS = previousOwner
    if (previousApprovers === undefined) delete process.env.APPROVER_WALLET_ADDRESSES
    else process.env.APPROVER_WALLET_ADDRESSES = previousApprovers
    if (previousClerks === undefined) delete process.env.CLERK_WALLET_ADDRESSES
    else process.env.CLERK_WALLET_ADDRESSES = previousClerks
    if (previousAuditors === undefined) delete process.env.AUDITOR_WALLET_ADDRESSES
    else process.env.AUDITOR_WALLET_ADDRESSES = previousAuditors
  }
})

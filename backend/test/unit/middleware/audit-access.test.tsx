import assert from 'node:assert/strict'
import test from 'node:test'
import { requireAuditReadAccess } from '../../../src/middleware/device-auth.tsx'

function authorize(walletAddress: string) {
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
  const request = { deviceSession: { walletAddress } }
  requireAuditReadAccess(request as never, response as never, () => { proceeded = true })
  return { response, proceeded, request }
}

test('audit read access assigns auditor or owner roles by configured wallets', () => {
  const previousOwner = process.env.OWNER_WALLET_ADDRESS
  const previousAuditors = process.env.AUDITOR_WALLET_ADDRESSES
  process.env.OWNER_WALLET_ADDRESS = '0x0000000000000000000000000000000000000001'
  process.env.AUDITOR_WALLET_ADDRESSES = '0x0000000000000000000000000000000000000002'
  try {
    const auditor = authorize('0x0000000000000000000000000000000000000002')
    assert.equal(auditor.proceeded, true)
    assert.equal(auditor.request.auditRole, 'auditor')
    const owner = authorize('0x0000000000000000000000000000000000000001')
    assert.equal(owner.proceeded, true)
    assert.equal(owner.request.auditRole, 'owner')
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_WALLET_ADDRESS
    else process.env.OWNER_WALLET_ADDRESS = previousOwner
    if (previousAuditors === undefined) delete process.env.AUDITOR_WALLET_ADDRESSES
    else process.env.AUDITOR_WALLET_ADDRESSES = previousAuditors
  }
})

test('audit read access rejects unlisted wallets and malformed configuration', () => {
  const previousOwner = process.env.OWNER_WALLET_ADDRESS
  const previousAuditors = process.env.AUDITOR_WALLET_ADDRESSES
  process.env.OWNER_WALLET_ADDRESS = ''
  process.env.AUDITOR_WALLET_ADDRESSES = '0x0000000000000000000000000000000000000002'
  try {
    const denied = authorize('0x0000000000000000000000000000000000000003')
    assert.equal(denied.response.statusCode, 403)
    assert.equal(denied.proceeded, false)
    process.env.AUDITOR_WALLET_ADDRESSES = 'not-an-address'
    assert.equal(authorize('0x0000000000000000000000000000000000000002').response.statusCode, 503)
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_WALLET_ADDRESS
    else process.env.OWNER_WALLET_ADDRESS = previousOwner
    if (previousAuditors === undefined) delete process.env.AUDITOR_WALLET_ADDRESSES
    else process.env.AUDITOR_WALLET_ADDRESSES = previousAuditors
  }
})

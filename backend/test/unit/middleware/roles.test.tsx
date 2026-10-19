import assert from 'node:assert/strict'
import test from 'node:test'
import { requireRoles } from '../../../src/middleware/roles.tsx'

const permissions = {
  goals: ['admin', 'approver', 'clerk'],
  approvals: ['admin', 'approver'],
  supplierAdministration: ['admin'],
  supplierVerification: ['approver'],
  supplierRead: ['admin', 'approver', 'clerk'],
  policyRead: ['admin', 'approver', 'clerk', 'auditor'],
  policyWrite: ['admin'],
  autonomyRead: ['admin', 'approver', 'auditor'],
  auditRead: ['admin', 'approver', 'auditor'],
  deviceReview: ['admin'],
} as const

test('role middleware enforces the declared permission matrix for every role', () => {
  for (const [permission, allowedRoles] of Object.entries(permissions)) {
    for (const role of ['admin', 'approver', 'clerk', 'auditor', null]) {
      let statusCode = 0
      let continued = false
      const response = {
        status(code: number) {
          statusCode = code
          return this
        },
        json() {
          return this
        },
      }
      requireRoles(...allowedRoles)(
        { userRole: role, deviceSession: { walletAddress: '0x0000000000000000000000000000000000000001' } },
        response,
        () => { continued = true },
      )
      const allowed = role !== null && allowedRoles.some((allowedRole) => allowedRole === role)
      assert.equal(continued, allowed, `${permission} for ${role}`)
      assert.equal(statusCode, allowed ? 0 : 403, `${permission} response for ${role}`)
    }
  }
})

test('role middleware returns unauthorized when there is no authenticated wallet session', () => {
  let statusCode = 0
  const response = {
    status(code: number) {
      statusCode = code
      return this
    },
    json() {
      return this
    },
  }
  requireRoles('admin')({ userRole: null }, response, () => assert.fail('Unauthenticated request passed role middleware'))
  assert.equal(statusCode, 401)
})

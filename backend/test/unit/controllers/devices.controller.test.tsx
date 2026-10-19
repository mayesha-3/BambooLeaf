import assert from 'node:assert/strict'
import test from 'node:test'
import { deviceLoginState, enrollmentStatus } from '../../../src/controllers/devices.controller.tsx'

test('configured owner wallet enrolls a new device without admin device approval', () => {
  const previousOwner = process.env.OWNER_WALLET_ADDRESS
  process.env.OWNER_WALLET_ADDRESS = '0x0000000000000000000000000000000000000001'
  try {
    assert.equal(enrollmentStatus(process.env.OWNER_WALLET_ADDRESS, null), 'approved')
    assert.equal(
      deviceLoginState({ status: 'pending' }, process.env.OWNER_WALLET_ADDRESS),
      'owner-pending',
    )
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_WALLET_ADDRESS
    else process.env.OWNER_WALLET_ADDRESS = previousOwner
  }
})

test('other wallets remain pending until an admin approves their device', () => {
  const previousOwner = process.env.OWNER_WALLET_ADDRESS
  const previousApprovers = process.env.APPROVER_WALLET_ADDRESSES
  process.env.OWNER_WALLET_ADDRESS = '0x0000000000000000000000000000000000000001'
  process.env.APPROVER_WALLET_ADDRESSES = '0x0000000000000000000000000000000000000002'
  try {
    const approver = '0x0000000000000000000000000000000000000002'
    assert.equal(enrollmentStatus(approver, null), 'pending')
    assert.equal(deviceLoginState({ status: 'pending' }, approver), 'pending')
    assert.equal(deviceLoginState({ status: 'approved' }, approver), 'approved')
    assert.equal(deviceLoginState({ status: 'revoked' }, approver), 'unavailable')
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_WALLET_ADDRESS
    else process.env.OWNER_WALLET_ADDRESS = previousOwner
    if (previousApprovers === undefined) delete process.env.APPROVER_WALLET_ADDRESSES
    else process.env.APPROVER_WALLET_ADDRESSES = previousApprovers
  }
})

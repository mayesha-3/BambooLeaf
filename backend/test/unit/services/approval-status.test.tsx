import assert from 'node:assert/strict'
import test from 'node:test'
import { getApprovalStatus } from '../../../src/services/approvals.service.tsx'

test('approval status includes transaction hash and execution failure reason', async () => {
  const approval = {
    approvalId: 'approval-1',
    ownerWallet: '0x0000000000000000000000000000000000000001',
    status: 'failed',
    expiresAt: Date.now() + 60_000,
    txHash: '0xabc',
    failureReason: 'RPC transaction reverted',
  }
  const database = {
    collection(name: string) {
      assert.equal(name, 'transaction_approvals')
      return {
        async findOne() {
          return approval
        },
      }
    },
  }
  assert.deepEqual(
    await getApprovalStatus(database, approval.approvalId, approval.ownerWallet),
    {
      approvalId: approval.approvalId,
      status: 'failed',
      expiresAt: approval.expiresAt,
      txHash: approval.txHash,
      failureReason: approval.failureReason,
    },
  )
})

test('approval status does not disclose another owner’s request', async () => {
  const database = {
    collection() {
      return {
        async findOne() {
          return {
            approvalId: 'approval-1',
            ownerWallet: '0x0000000000000000000000000000000000000001',
            status: 'approved',
            expiresAt: Date.now() + 60_000,
          }
        },
      }
    },
  }
  await assert.rejects(
    getApprovalStatus(database, 'approval-1', '0x0000000000000000000000000000000000000002'),
    /Approval request was not found/,
  )
})

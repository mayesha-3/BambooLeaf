import { keccak256, toUtf8Bytes } from 'ethers'
import type { TxRequest } from '../chain/transaction-builder.tsx'

export function transactionDigest({ chainId, to, value, data = '0x', nonce, expiresAt }: any) {
  const canonical = JSON.stringify({
    chainId,
    to: to.toLowerCase(),
    value: BigInt(value).toString(),
    data: data.toLowerCase(),
    nonce,
    expiresAt,
  })
  return keccak256(toUtf8Bytes(canonical))
}

export function verifyTransactionDigest(expectedDigest: string, currentParams: any): boolean {
  const actualDigest = transactionDigest(currentParams)
  return actualDigest === expectedDigest
}

// NEW: For T2 Approvals
export function computeApprovalDigest(txRequests: TxRequest[], expiresAt: number, chainId: number): string {
  const canonical = JSON.stringify({
    chainId,
    txs: txRequests.map(tx => ({
      to: tx.to.toLowerCase(),
      value: BigInt(tx.value).toString(),
      data: tx.data.toLowerCase(),
    })),
    expiresAt
  })
  return keccak256(toUtf8Bytes(canonical))
}
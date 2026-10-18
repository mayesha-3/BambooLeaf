import { keccak256, toUtf8Bytes } from 'ethers'

type TransactionDigestParams = {
  chainId: number
  to: string
  value: bigint | string
  data?: string
  nonce: number
  expiresAt: number
}

function transactionDigest({ chainId, to, value, data = '0x', nonce, expiresAt }: TransactionDigestParams): string {
  if (!Number.isSafeInteger(chainId) || chainId <= 0 ||
      !Number.isSafeInteger(nonce) || nonce < 0 ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= 0 ||
      !/^0x[0-9a-fA-F]{40}$/.test(to) ||
      !/^0x(?:[0-9a-fA-F]{2})*$/.test(data)) {
    throw new Error('Transaction digest parameters are invalid')
  }
  const valueWei = BigInt(value)
  if (valueWei < 0n) throw new Error('Transaction digest value cannot be negative')
  const canonical = JSON.stringify({
    chainId,
    to: to.toLowerCase(),
    value: valueWei.toString(),
    data: data.toLowerCase(),
    nonce,
    expiresAt,
  })
  return keccak256(toUtf8Bytes(canonical))
}

function verifyTransactionDigest(expectedDigest: string, currentParams: TransactionDigestParams): boolean {
  if (typeof expectedDigest !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(expectedDigest)) return false
  try {
    return transactionDigest(currentParams).toLowerCase() === expectedDigest.toLowerCase()
  } catch {
    return false
  }
}

export { transactionDigest, verifyTransactionDigest }
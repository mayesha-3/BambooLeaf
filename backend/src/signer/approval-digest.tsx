import { keccak256, toUtf8Bytes } from 'ethers'

function transactionDigest({ chainId, to, value, data = '0x', nonce, expiresAt }) {
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
// digest verify
function verifyTransactionDigest(expectedDigest: string, currentParams: any): boolean {
  const actualDigest = transactionDigest(currentParams)
  return actualDigest === expectedDigest
}

export { transactionDigest, verifyTransactionDigest }
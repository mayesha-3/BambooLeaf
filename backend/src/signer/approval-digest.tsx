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

export { transactionDigest }
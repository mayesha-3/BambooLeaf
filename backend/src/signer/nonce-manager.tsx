import type { JsonRpcProvider, Wallet } from 'ethers'

let cachedNonce: number | null = null
let queue: Promise<void> = Promise.resolve()

export async function nextNonce(
  provider: JsonRpcProvider,
  wallet: Wallet,
): Promise<number> {
  let result = 0

  const operation = queue.then(async () => {
    const pending = await provider.getTransactionCount(wallet.address, 'pending')

    if (cachedNonce === null || pending > cachedNonce) {
      cachedNonce = pending
    }

    result = cachedNonce
    cachedNonce += 1
  })

  queue = operation.then(() => undefined, () => undefined)
  await operation
  return result
}

export function resetNonceCache(): void {
  cachedNonce = null
}

export function setNonceCache(value: number): void {
  cachedNonce = value
}
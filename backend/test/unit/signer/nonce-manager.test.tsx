import assert from 'node:assert/strict'
import test from 'node:test'
import { nextNonce, resetNonceCache, setNonceCache } from '../../../src/signer/nonce-manager.tsx'

function makeProvider(startNonce: number) {
  let current = startNonce
  return {
    getTransactionCount: async () => current,
    setCurrent(value: number) {
      current = value
    },
  }
}

const fakeWallet = { address: '0x0000000000000000000000000000000000000001' }

test('nonce manager returns sequential values', async () => {
  resetNonceCache()
  const provider = makeProvider(5)

  assert.equal(await nextNonce(provider as never, fakeWallet as never), 5)
  assert.equal(await nextNonce(provider as never, fakeWallet as never), 6)
  assert.equal(await nextNonce(provider as never, fakeWallet as never), 7)
})

test('nonce manager resyncs when chain nonce advances', async () => {
  resetNonceCache()
  const provider = makeProvider(10)

  assert.equal(await nextNonce(provider as never, fakeWallet as never), 10)
  provider.setCurrent(15)
  assert.equal(await nextNonce(provider as never, fakeWallet as never), 15)
})

test('nonce manager serialises concurrent calls', async () => {
  resetNonceCache()
  const provider = makeProvider(0)

  const results = await Promise.all([
    nextNonce(provider as never, fakeWallet as never),
    nextNonce(provider as never, fakeWallet as never),
    nextNonce(provider as never, fakeWallet as never),
  ])

  assert.deepEqual(results, [0, 1, 2])
})

test('setNonceCache overrides the cached value', async () => {
  resetNonceCache()
  setNonceCache(100)
  const provider = makeProvider(5)

  assert.equal(await nextNonce(provider as never, fakeWallet as never), 100)
})
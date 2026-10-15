import assert from 'node:assert/strict'
import test from 'node:test'
import { Interface } from 'ethers'
import { simulateShadowFork, simulateTransaction, simulateTransferBalanceDelta } from '../../../src/chain/simulator.tsx'

function makeProvider(overrides: any = {}) {
  return {
    call: async () => '0x',
    estimateGas: async () => 21000n,
    getBalance: async () => 1000000000000000000n,
    ...overrides,
  }
}

test('simulateTransaction succeeds on a valid transaction', async () => {
  const provider = makeProvider()
  const result = await simulateTransaction(provider as never, '0xSender', {
    to: '0xRecipient',
    value: 100n,
    data: '0x',
  })

  assert.equal(result.success, true)
  assert.equal(result.gasUsed, 21000n)
})

test('simulateTransaction returns error when gas estimation fails', async () => {
  const provider = makeProvider({
    estimateGas: async () => {
      throw new Error('execution reverted')
    },
  })

  const result = await simulateTransaction(provider as never, '0xSender', {
    to: '0xRecipient',
    value: 100n,
  })

  assert.equal(result.success, false)
  assert.match(result.error!, /execution reverted/)
})

test('simulateTransaction catches call errors', async () => {
  const provider = makeProvider({
    call: async () => {
      throw new Error('connection failed')
    },
  })

  const result = await simulateTransaction(provider as never, '0xSender', {
    to: '0xRecipient',
    value: 100n,
  })

  assert.equal(result.success, false)
  assert.match(result.error!, /connection failed/)
})

test('simulateTransferBalanceDelta calculates expected delta', async () => {
  const provider = makeProvider()
  const result = await simulateTransferBalanceDelta(
    provider as never,
    '0xSender',
    '0xRecipient',
    500000000000000000n, // 0.5 ETH
  )

  assert.equal(result.balanceBefore, 1000000000000000000n)
  assert.equal(result.balanceAfter, 500000000000000000n)
  assert.equal(result.delta, -500000000000000000n)
})

test('simulateShadowFork captures token deltas, events and called addresses, then reverts', async () => {
  const sender = '0x0000000000000000000000000000000000000001'
  const tokenIn = '0x0000000000000000000000000000000000000002'
  const tokenOut = '0x0000000000000000000000000000000000000003'
  const router = '0x0000000000000000000000000000000000000004'
  const pair = '0x0000000000000000000000000000000000000005'
  const balanceAbi = new Interface(['function balanceOf(address) view returns (uint256)'])
  const eventAbi = new Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)',
  ])
  const balances = new Map([
    [`${tokenIn}:${sender}`, 100n],
    [`${tokenOut}:${sender}`, 5n],
  ])
  const methods: string[] = []
  let txCount = 0
  const provider = {
    getNetwork: async () => ({ chainId: 31337n }),
    call: async ({ to, data }: { to: string; data: string }) => {
      const parsed = balanceAbi.parseTransaction({ data })
      const value = balances.get(`${to}:${String(parsed?.args[0])}`) ?? 0n
      return balanceAbi.encodeFunctionResult('balanceOf', [value])
    },
    send: async (method: string) => {
      methods.push(method)
      if (method === 'evm_snapshot') return 'snapshot-id'
      if (method === 'eth_sendTransaction') {
        txCount += 1
        if (txCount === 2) {
          balances.set(`${tokenIn}:${sender}`, 90n)
          balances.set(`${tokenOut}:${sender}`, 15n)
        }
        return `0x${txCount}`
      }
      if (method === 'debug_traceTransaction') return { to: router, calls: [{ to: pair }] }
      if (method === 'evm_revert') return true
      return true
    },
    waitForTransaction: async (_hash: string) => ({
      hash: _hash,
      status: 1,
      logs: txCount === 1
        ? [{ ...eventAbi.encodeEventLog(eventAbi.getEvent('Approval')!, [sender, router, 100n]), address: tokenIn }]
        : [{ ...eventAbi.encodeEventLog(eventAbi.getEvent('Transfer')!, [sender, router, 10n]), address: tokenIn }],
    }),
  }

  const result = await simulateShadowFork(provider as never, sender, [
    { to: tokenIn, data: '0xapprove' },
    { to: router, data: '0xswap' },
  ], { accounts: [sender], tokenAddresses: [tokenIn, tokenOut] })

  assert.equal(result.success, true)
  assert.equal(result.reverted, true)
  assert.equal(result.balanceDeltas[`${tokenIn}:${sender}`], -10n)
  assert.equal(result.balanceDeltas[`${tokenOut}:${sender}`], 10n)
  assert.deepEqual(result.events.map((event) => event.type), ['Approval', 'Transfer'])
  assert.deepEqual(result.calledAddresses, [router, pair])
  assert.equal(methods.at(-1), 'evm_revert')
})
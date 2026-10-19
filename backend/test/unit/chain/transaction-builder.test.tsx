import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildNativeTransfer,
  buildErc20Transfer,
  buildSwapTransactions,
  routerInterface,
} from '../../../src/chain/transaction-builder.tsx'
import { parseUnits } from 'ethers'

const recipient = '0x0000000000000000000000000000000000000001'

test('buildNativeTransfer creates a valid ETH transfer', () => {
  const tx = buildNativeTransfer({
    action: 'transfer',
    chainId: 11155111,
    from: { token: 'ETH', amount: '0.01' },
    recipient,
  })

  assert.equal(tx.to.toLowerCase(), recipient.toLowerCase())
  assert.equal(tx.value, 10000000000000000n)
  assert.equal(tx.data, '0x')
})

test('buildErc20Transfer creates a USDC transfer', () => {
  const tx = buildErc20Transfer({
    action: 'transfer',
    chainId: 11155111,
    from: { token: 'USDC', amount: '10.5' },
    recipient,
  })

  assert.equal(tx.value, 0n)
  assert.match(tx.data, /^0xa9059cbb/)
})

test('buildErc20Transfer rejects ETH', () => {
  assert.throws(
    () =>
      buildErc20Transfer({
        action: 'transfer',
        chainId: 11155111,
        from: { token: 'ETH', amount: '0.01' },
        recipient,
      }),
    /Use buildNativeTransfer/,
  )
})

test('buildErc20Transfer rejects unknown tokens', () => {
  assert.throws(
    () =>
      buildErc20Transfer({
        action: 'transfer',
        chainId: 11155111,
        from: { token: 'FAKE', amount: '1' },
        recipient,
      }),
    /Unknown token/,
  )
})

test('buildSwapTransactions creates an exact-input approval and slippage-capped swap', () => {
  const oldChain = process.env.CHAIN_ID
  const oldInput = process.env.TOKEN_USDC_ADDRESS
  const oldOutput = process.env.TOKEN_WETH_ADDRESS
  process.env.CHAIN_ID = '31337'
  process.env.TOKEN_USDC_ADDRESS = '0x0000000000000000000000000000000000000011'
  process.env.TOKEN_WETH_ADDRESS = '0x0000000000000000000000000000000000000012'
  try {
    const result = buildSwapTransactions({
      action: 'swap',
      chainId: 31337,
      from: { token: 'USDC', amount: '10' },
      to: { token: 'WETH' },
    }, {
      routerAddress: '0x0000000000000000000000000000000000000021',
      recipient,
      quotedAmountOut: 1000n,
      maxSlippageBps: 100,
      deadline: Math.floor(Date.now() / 1000) + 600,
    })
    const parsed = routerInterface.parseTransaction({ data: result.swap.data })
    assert.equal(result.amountIn, parseUnits('10', 6))
    assert.equal(result.minAmountOut, 990n)
    assert.equal(parsed?.args[1], 990n)
    assert.match(result.approval.data, /^0x095ea7b3/)
  } finally {
    if (oldChain === undefined) delete process.env.CHAIN_ID
    else process.env.CHAIN_ID = oldChain
    if (oldInput === undefined) delete process.env.TOKEN_USDC_ADDRESS
    else process.env.TOKEN_USDC_ADDRESS = oldInput
    if (oldOutput === undefined) delete process.env.TOKEN_WETH_ADDRESS
    else process.env.TOKEN_WETH_ADDRESS = oldOutput
  }
})

test('buildSwapTransactions swaps USDC to native ETH through WETH without including zero address', () => {
  const result = buildSwapTransactions({
    action: 'swap',
    chainId: 11155111,
    from: { token: 'USDC', amount: '1' },
    to: { token: 'ETH' },
  }, {
    routerAddress: '0x0000000000000000000000000000000000000021',
    recipient,
    quotedAmountOut: 1000n,
    maxSlippageBps: 100,
  })
  const parsed = routerInterface.parseTransaction({ data: result.swap.data })
  assert.equal(parsed?.name, 'swapExactTokensForETH')
  assert.equal(parsed?.args[2][1], '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14')
  assert.equal(result.nativeOutput, true)
  assert.equal(result.swap.value, 0n)
  assert.ok(result.approval)
})

test('buildSwapTransactions swaps native ETH to USDC through WETH and attaches ETH value', () => {
  const oldChain = process.env.CHAIN_ID
  const oldOutput = process.env.TOKEN_USDC_ADDRESS
  const oldWeth = process.env.TOKEN_WETH_ADDRESS
  process.env.CHAIN_ID = '31337'
  process.env.TOKEN_USDC_ADDRESS = '0x0000000000000000000000000000000000000011'
  process.env.TOKEN_WETH_ADDRESS = '0x0000000000000000000000000000000000000012'
  try {
    const result = buildSwapTransactions({
      action: 'swap',
      chainId: 31337,
      from: { token: 'ETH', amount: '0.01' },
      to: { token: 'USDC' },
    }, {
      routerAddress: '0x0000000000000000000000000000000000000021',
      recipient,
      quotedAmountOut: 1000n,
      maxSlippageBps: 100,
    })
    const parsed = routerInterface.parseTransaction({ data: result.swap.data })
    assert.equal(parsed?.name, 'swapExactETHForTokens')
    assert.equal(parsed?.args[1][0], '0x0000000000000000000000000000000000000012')
    assert.equal(result.nativeInput, true)
    assert.equal(result.swap.value, parseUnits('0.01', 18))
    assert.equal(result.approval, null)
  } finally {
    if (oldChain === undefined) delete process.env.CHAIN_ID
    else process.env.CHAIN_ID = oldChain
    if (oldOutput === undefined) delete process.env.TOKEN_USDC_ADDRESS
    else process.env.TOKEN_USDC_ADDRESS = oldOutput
    if (oldWeth === undefined) delete process.env.TOKEN_WETH_ADDRESS
    else process.env.TOKEN_WETH_ADDRESS = oldWeth
  }
})

test('buildSwapTransactions rejects slippage above the hard cap', () => {
  assert.throws(() => buildSwapTransactions({
    action: 'swap',
    chainId: 11155111,
    from: { token: 'USDC', amount: '10' },
    to: { token: 'WETH' },
  }, {
    routerAddress: recipient,
    recipient,
    quotedAmountOut: 1000n,
    maxSlippageBps: 501,
  }), /Slippage/)
})
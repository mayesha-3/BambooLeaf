import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateNativeTransfer, evaluateSwap, readPolicyConfig } from '../../../src/guard/policy-engine.tsx'
import { routerInterface } from '../../../src/chain/transaction-builder.tsx'

const recipient = '0x0000000000000000000000000000000000000001'
const config = readPolicyConfig({
  CHAIN_ID: '31337',
  MAX_PER_TX_ETH: '0.02',
  MAX_PER_RECIPIENT_PER_DAY_ETH: '0.05',
  MAX_TX_PER_WINDOW: '5',
  VELOCITY_WINDOW_SECONDS: '600',
  ALLOWED_RECIPIENTS: recipient,
})
const intent = {
  intentId: '459daf2c-9a9e-4f38-a8f0-ea09d004957e',
  action: 'transfer',
  chainId: 31337,
  from: { token: 'ETH', amount: '0.01' },
  recipient,
}

test('policy authorizes only allow-listed, capped transfers on the configured chain', () => {
  assert.equal(evaluateNativeTransfer(intent, config).allowed, true)
  assert.match(evaluateNativeTransfer({ ...intent, recipient: '0x0000000000000000000000000000000000000002' }, config).reason, /allow-listed/)
  assert.match(evaluateNativeTransfer({ ...intent, chainId: 1 }, config).reason, /chain ID/)
  assert.match(evaluateNativeTransfer({
    ...intent,
    from: { token: 'ETH', amount: '0.020000000000000001' },
  }, config).reason, /per-transaction cap/)
})

test('swap policy rejects slippage beyond the configured cap and unapproved routers', async () => {
  const swapConfig = readPolicyConfig({
    CHAIN_ID: '31337',
    MAX_SLIPPAGE_BPS: '50',
    SWAP_ROUTER_ADDRESS: '0x0000000000000000000000000000000000000003',
    ALLOWED_SWAP_ROUTERS: '',
  })
  const swap = {
    intentId: '459daf2c-9a9e-4f38-a8f0-ea09d004957e',
    action: 'swap',
    chainId: 31337,
    from: { token: 'USDC', amount: '10' },
    to: { token: 'WETH' },
    maxSlippageBps: 51,
  }
  assert.match((await evaluateSwap(swap, { provider: {}, recipient, config: swapConfig })).reason, /slippage/)
  assert.match((await evaluateSwap({ ...swap, maxSlippageBps: 50 }, {
    provider: {}, recipient, config: swapConfig,
  })).reason, /allow-listed/)
})

test('swap policy quotes native ETH through WETH and never sends a zero-address path', async () => {
  const oldChain = process.env.CHAIN_ID
  const oldUsdc = process.env.TOKEN_USDC_ADDRESS
  const oldWeth = process.env.TOKEN_WETH_ADDRESS
  process.env.CHAIN_ID = '31337'
  process.env.TOKEN_USDC_ADDRESS = '0x0000000000000000000000000000000000000011'
  process.env.TOKEN_WETH_ADDRESS = '0x0000000000000000000000000000000000000012'

  try {
    const router = '0x0000000000000000000000000000000000000003'
    const weth = '0x0000000000000000000000000000000000000012'
    const swapConfig = readPolicyConfig({
      CHAIN_ID: '31337',
      MAX_SLIPPAGE_BPS: '100',
      MAX_SWAP_INPUT_AMOUNT: '10',
      MAX_SWAP_PER_TOKEN_PER_DAY: '50',
      SWAP_ROUTER_ADDRESS: router,
      ALLOWED_SWAP_ROUTERS: router,
    })
    const provider = {
      call: async (transaction: { data: string }) => {
        const quote = routerInterface.parseTransaction({ data: transaction.data })
        assert.equal(quote?.args[1][0], '0x0000000000000000000000000000000000000011')
        assert.equal(quote?.args[1][1], weth)
        return routerInterface.encodeFunctionResult('getAmountsOut', [[quote?.args[0], 10n ** 18n]])
      },
    }
    const result = await evaluateSwap({
      intentId: '459daf2c-9a9e-4f38-a8f0-ea09d004957e',
      action: 'swap',
      chainId: 31337,
      from: { token: 'USDC', amount: '1' },
      to: { token: 'ETH' },
      maxSlippageBps: 50,
    }, { provider, recipient, config: swapConfig })

    assert.equal(result.allowed, true, result.reason)
    const call = routerInterface.parseTransaction({ data: result.swap.swap.data })
    assert.equal(call?.name, 'swapExactTokensForETH')
    assert.equal(call?.args[2][1], weth)
    assert.equal(result.authorization.valueWei, '0')
  } finally {
    if (oldChain === undefined) delete process.env.CHAIN_ID
    else process.env.CHAIN_ID = oldChain
    if (oldUsdc === undefined) delete process.env.TOKEN_USDC_ADDRESS
    else process.env.TOKEN_USDC_ADDRESS = oldUsdc
    if (oldWeth === undefined) delete process.env.TOKEN_WETH_ADDRESS
    else process.env.TOKEN_WETH_ADDRESS = oldWeth
  }
})
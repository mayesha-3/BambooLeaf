import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateNativeTransfer, evaluateSwap, readPolicyConfig } from '../../../src/guard/policy-engine.tsx'

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
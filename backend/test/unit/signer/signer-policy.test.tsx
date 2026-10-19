import assert from 'node:assert/strict'
import test from 'node:test'
import { readPolicyConfig } from '../../../src/guard/policy-engine.tsx'
import { activateKillSwitch, recordCleanExecution, reset } from '../../../src/guard/autonomy-manager.tsx'
import { assertNativeAutoExecutable, assertSwapAutoExecutable } from '../../../src/signer/signer-service.tsx'

const recipient = '0x0000000000000000000000000000000000000001'
const policy = readPolicyConfig({
  CHAIN_ID: '31337',
  MAX_PER_TX_ETH: '0.02',
  MAX_PER_RECIPIENT_PER_DAY_ETH: '0.05',
  MAX_TX_PER_WINDOW: '5',
  VELOCITY_WINDOW_SECONDS: '600',
  ALLOWED_RECIPIENTS: recipient,
  SWAP_ROUTER_ADDRESS: '0x0000000000000000000000000000000000000003',
  ALLOWED_SWAP_ROUTERS: '0x0000000000000000000000000000000000000003',
  MAX_SLIPPAGE_BPS: '100',
  MAX_SWAP_INPUT_AMOUNT: '1',
  MAX_SWAP_PER_TOKEN_PER_DAY: '5',
})

test('signer re-verification blocks L1 transfers and kill-switch execution', () => {
  reset()
  const intent = {
    intentId: '459daf2c-9a9e-4f38-a8f0-ea09d004957e',
    action: 'transfer',
    chainId: 31337,
    from: { token: 'ETH', amount: '0.01' },
    recipient,
  }
  assert.throws(() => assertNativeAutoExecutable(intent, policy), /requires T2/)
  for (let i = 0; i < 10; i++) recordCleanExecution()
  assert.doesNotThrow(() => assertNativeAutoExecutable(intent, policy))
  activateKillSwitch()
  assert.throws(() => assertNativeAutoExecutable(intent, policy), /requires T3/)
  reset()
})

test('signer re-verification applies the current autonomy tier to swaps', () => {
  reset()
  const intent = {
    intentId: '459daf2c-9a9e-4f38-a8f0-ea09d004957e',
    action: 'swap',
    chainId: 31337,
    from: { token: 'WETH', amount: '0.1' },
    to: { token: 'USDC' },
    maxSlippageBps: 50,
  }
  const swap = {
    router: policy.swapRouterAddress,
    tokenIn: { decimals: 18 },
    amountIn: 100_000_000_000_000_000n,
  }
  assert.throws(() => assertSwapAutoExecutable(intent, swap, policy), /requires T2/)
  assert.doesNotThrow(() => assertSwapAutoExecutable(intent, swap, policy, true))
  for (let i = 0; i < 10; i++) recordCleanExecution()
  assert.doesNotThrow(() => assertSwapAutoExecutable(intent, swap, policy))
  activateKillSwitch()
  assert.throws(() => assertSwapAutoExecutable(intent, swap, policy, true), /requires T3/)
  reset()
})

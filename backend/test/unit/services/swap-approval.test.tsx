import assert from 'node:assert/strict'
import test from 'node:test'
import { COLLECTIONS } from '../../../src/db/collections.tsx'
import { reset } from '../../../src/guard/autonomy-manager.tsx'
import { createSwapApproval } from '../../../src/services/approvals.service.tsx'

test('T2 swap creates a simulated, digest-bound approval queue record', async () => {
  const env = {
    AGENT_KEY: process.env.AGENT_KEY,
    OWNER_WALLET_ADDRESS: process.env.OWNER_WALLET_ADDRESS,
    CHAIN_ID: process.env.CHAIN_ID,
    MAX_SLIPPAGE_BPS: process.env.MAX_SLIPPAGE_BPS,
    MAX_SWAP_INPUT_AMOUNT: process.env.MAX_SWAP_INPUT_AMOUNT,
    MAX_SWAP_PER_TOKEN_PER_DAY: process.env.MAX_SWAP_PER_TOKEN_PER_DAY,
    SWAP_ROUTER_ADDRESS: process.env.SWAP_ROUTER_ADDRESS,
    ALLOWED_SWAP_ROUTERS: process.env.ALLOWED_SWAP_ROUTERS,
    TOKEN_USDC_ADDRESS: process.env.TOKEN_USDC_ADDRESS,
    TOKEN_WETH_ADDRESS: process.env.TOKEN_WETH_ADDRESS,
  }
  const router = '0x0000000000000000000000000000000000000031'
  const signerAddress = '0x0000000000000000000000000000000000000001'
  const ownerAddress = '0x0000000000000000000000000000000000000002'
  const approvals: Array<Record<string, any>> = []
  const auditEvents: Array<Record<string, any>> = []

  Object.assign(process.env, {
    AGENT_KEY: 'test-key',
    OWNER_WALLET_ADDRESS: ownerAddress,
    CHAIN_ID: '31337',
    MAX_SLIPPAGE_BPS: '100',
    MAX_SWAP_INPUT_AMOUNT: '10',
    MAX_SWAP_PER_TOKEN_PER_DAY: '50',
    SWAP_ROUTER_ADDRESS: router,
    ALLOWED_SWAP_ROUTERS: router,
    TOKEN_USDC_ADDRESS: '0x0000000000000000000000000000000000000011',
    TOKEN_WETH_ADDRESS: '0x0000000000000000000000000000000000000012',
  })
  reset()

  const database = {
    collection(name: string) {
      if (name === COLLECTIONS.approvals) {
        return { insertOne: async (record: Record<string, any>) => approvals.push(record) }
      }
      if (name === COLLECTIONS.audit) {
        return {
          findOne: async () => auditEvents.at(-1) ?? null,
          insertOne: async (event: Record<string, any>) => auditEvents.push(event),
        }
      }
      assert.fail(`Unexpected collection: ${name}`)
    },
  }

  try {
    const result = await createSwapApproval(
      database,
      {
        intentId: '459daf2c-9a9e-4f38-a8f0-ea09d004957e',
        action: 'swap',
        chainId: 31337,
        from: { token: 'ETH', amount: '0.01' },
        to: { token: 'USDC' },
        maxSlippageBps: 50,
        rationale: 'Swap ETH for USDC',
        sourceRefs: ['user_goal'],
      },
      'swap-request',
      {
        getSignerAddress: () => signerAddress,
        getSigner: () => ({
          provider: { getNetwork: async () => ({ chainId: 31337n }) },
          wallet: { address: signerAddress },
        }),
        evaluateSwap: async () => ({
          allowed: true,
          reason: 'Quote passed policy.',
          valueWei: '10000000000000000',
          authorization: {
            transactionTo: router,
            transactionData: '0x1234',
            valueWei: '10000000000000000',
          },
          swap: {
            router,
            tokenIn: '0x0000000000000000000000000000000000000012',
            tokenOut: '0x0000000000000000000000000000000000000011',
            amountIn: 10000000000000000n,
            quotedAmountOut: 1000000n,
            minAmountOut: 990000n,
            slippageBps: 50,
            approval: null,
            swap: { to: router, value: 10000000000000000n, data: '0x1234' },
            nativeInput: true,
            nativeOutput: false,
          },
        }),
        simulateAuthorizedSwap: async () => ({ comparison: { passed: true, reasons: [] } }),
        peekNextNonce: async () => 10,
      },
    )

    assert.equal(result.approvalId, approvals[0].approvalId)
    assert.equal(approvals.length, 1)
    assert.equal(approvals[0].status, 'pending')
    assert.equal(approvals[0].ownerWallet, ownerAddress.toLowerCase())
    assert.equal(approvals[0].recipient, signerAddress)
    assert.equal(approvals[0].nonce, 10)
    assert.equal(approvals[0].transactionTo, router)
    assert.equal(approvals[0].transactionData, '0x1234')
    assert.equal(approvals[0].minimumOutput, '0.99')
    assert.equal(auditEvents[0].type, 'approval.requested')
    assert.equal(auditEvents[0].data.action, 'swap')
  } finally {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    reset()
  }
})

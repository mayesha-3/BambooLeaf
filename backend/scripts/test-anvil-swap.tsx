import 'dotenv/config'
import { JsonRpcProvider, Wallet, Contract } from 'ethers'
import { simulateAuthorizedSwap } from '../src/signer/signer-service.tsx'
import { issueGuardAuthorization } from '../src/guard/guard-auth.tsx'
import { routerInterface } from '../src/chain/transaction-builder.tsx'
import { readPolicyConfig } from '../src/guard/policy-engine.tsx'

async function main() {
  const forkUrl = process.env.SHADOW_RPC_URL
  if (!forkUrl) throw new Error('SHADOW_RPC_URL is not set')

  const provider = new JsonRpcProvider(forkUrl)
  const agentAddress = process.env.AGENT_ADDRESS
  if (!agentAddress) throw new Error('AGENT_ADDRESS is not set')

  const config = readPolicyConfig()
  const router = config.swapRouterAddress
  if (!router) throw new Error('Swap router not configured in policy')

  const usdcAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
  const wethAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'

  const intent = {
    intentId: 'test-swap-001',
    action: 'swap' as const,
    chainId: 11155111,
    from: { token: 'USDC', amount: '5' },
    to: { token: 'WETH' },
    maxSlippageBps: 50,
    rationale: 'test swap',
    sourceRefs: ['user_goal']
  }

  const deadline = Math.floor(Date.now() / 1000) + 600
  const amountIn = 5000000n // 5 USDC

  // Get actual quote from router to get a valid minAmountOut
  const routerContract = new Contract(router, ['function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)'], provider)
  let minAmountOut = 0n
  try {
    const amounts = await routerContract.getAmountsOut(amountIn, [usdcAddress, wethAddress])
    const expectedOut = BigInt(amounts[amounts.length - 1])
    minAmountOut = (expectedOut * 995n) / 1000n // 0.5% slippage
    console.log('Quoted Amount Out:', expectedOut.toString())
  } catch (e) {
    console.log('Could not get quote, using fallback minAmountOut')
    minAmountOut = 1n // Fallback to just > 0
  }

  const calldata = routerInterface.encodeFunctionData('swapExactTokensForTokens', [
    amountIn,
    minAmountOut,
    [usdcAddress, wethAddress],
    agentAddress,
    deadline
  ])

  const authorization = issueGuardAuthorization({
    chainId: intent.chainId,
    intentId: intent.intentId,
    recipient: agentAddress,
    valueWei: '0',
    transactionTo: router,
    transactionData: calldata,
  })

  console.log('Running shadow-fork swap simulation...')
  
  try {
    const result = await simulateAuthorizedSwap(intent, authorization)
    if (result.success) {
      console.log('✅ Swap simulation passed!')
    }
  } catch (error) {
    console.error('❌ Swap simulation failed:', (error as Error).message)
  }
}

main().catch(console.error)
import 'dotenv/config'
import { JsonRpcProvider, Wallet, Contract } from 'ethers'
import { buildSwapTransactions } from '../src/chain/transaction-builder.tsx'

async function main() {
  const rpcUrl = process.env.RPC_URL
  const agentKey = process.env.AGENT_KEY
  const recipient = process.env.AGENT_ADDRESS
  const routerAddress = process.env.UNISWAP_ROUTER

  if (!rpcUrl || !agentKey || !recipient || !routerAddress) {
    throw new Error('RPC_URL, AGENT_KEY, AGENT_ADDRESS and UNISWAP_ROUTER must be set in .env')
  }

  const provider = new JsonRpcProvider(rpcUrl)
  const wallet = new Wallet(agentKey, provider)

  console.log('Wallet:', wallet.address)

  // 1. Create the Intent
  const intent = {
    action: 'swap',
    chainId: 11155111,
    from: { token: 'USDC', amount: '5' },
    to: { token: 'WETH' }, 
    maxSlippageBps: 50
  }

  // 2. Get live quote to calculate minAmountOut properly
  const usdcAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
  const wethAddress = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'
  
  const routerAbi = ['function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)']
  const router = new Contract(routerAddress, routerAbi, provider)
  
  const amountIn = 5000000n // 5 USDC
  console.log('Fetching live quote from Uniswap...')
  const amounts = await router.getAmountsOut(amountIn, [usdcAddress, wethAddress])
  const expectedOut = BigInt(amounts[1])
  
  // Apply 0.5% slippage for minAmountOut
  const minAmountOut = (expectedOut * 995n) / 1000n

  console.log('Building swap transactions...')
  const builtSwap = buildSwapTransactions(intent, {
    routerAddress,
    recipient,
    quotedAmountOut: expectedOut,
    maxSlippageBps: 50,
  })

  // 3. Send Approve Transaction
  console.log('\n[1/2] Sending Approve Transaction...')
  const approveResponse = await wallet.sendTransaction(builtSwap.approval)
  console.log('Approve Tx Hash:', approveResponse.hash)
  await approveResponse.wait()
  console.log('Approve Confirmed! ✅')

  // 4. Send Swap Transaction
  console.log('\n[2/2] Sending Swap Transaction...')
  const swapResponse = await wallet.sendTransaction(builtSwap.swap)
  console.log('Swap Tx Hash:', swapResponse.hash)
  console.log('Explorer:', 'https://sepolia.etherscan.io/tx/' + swapResponse.hash)
  
  const receipt = await swapResponse.wait()
  console.log('Swap Confirmed in block:', receipt?.blockNumber)
  console.log('Status:', receipt?.status === 1 ? 'SUCCESS ✅' : 'FAILED ❌')
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
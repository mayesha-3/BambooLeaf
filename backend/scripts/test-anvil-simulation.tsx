import 'dotenv/config'
import { JsonRpcProvider, Wallet, parseEther, Contract, parseUnits } from 'ethers'

async function main() {
  const forkUrl = process.env.SHADOW_RPC_URL
  if (!forkUrl) throw new Error('SHADOW_FORK_RPC_URL is not set')

  const provider = new JsonRpcProvider(forkUrl)

  // Anvil default account #1
  const anvilWallet = new Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', provider)
  
  const agentAddress = process.env.AGENT_ADDRESS
  if (!agentAddress) throw new Error('AGENT_ADDRESS is not set')

  // 1. Send test ETH to the Agent wallet
  console.log('Sending 1 ETH to Agent wallet from Anvil account...')
  const tx = await anvilWallet.sendTransaction({
    to: agentAddress,
    value: parseEther('1')
  })
  await tx.wait()
  console.log('Funded Agent wallet with 1 ETH.')

  // 2. Check USDC balance
  const usdcAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
  const usdc = new Contract(usdcAddress, [
    'function balanceOf(address) view returns (uint256)', 
    'function transfer(address, uint256) returns (bool)'
  ], anvilWallet)
  
  const balance = await usdc.balanceOf(agentAddress)
  console.log('Agent USDC balance in Fork:', Number(balance) / 1e6)

  // 3. If no USDC, send from Anvil account #2
  if (Number(balance) === 0) {
    console.log('No USDC found, transferring from Anvil account #2...')
    const anvilWallet2 = new Wallet('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', provider)
    const usdc2 = new Contract(usdcAddress, ['function transfer(address, uint256) returns (bool)'], anvilWallet2)
    const tx2 = await usdc2.transfer(agentAddress, parseUnits('100', 6))
    await tx2.wait()
    console.log('Sent 100 USDC to Agent wallet.')
  }

  console.log('Anvil simulation setup complete.')
}

main().catch(console.error)
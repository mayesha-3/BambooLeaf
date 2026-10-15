import 'dotenv/config'
import { JsonRpcProvider, Wallet, parseEther } from 'ethers'

async function main() {
  const rpcUrl = process.env.RPC_URL
  const agentKey = process.env.AGENT_KEY
  const recipient = process.env.AGENT_ADDRESS

  if (!rpcUrl || !agentKey || !recipient) {
    throw new Error('RPC_URL, AGENT_KEY and AGENT_ADDRESS must be set in .env')
  }

  const provider = new JsonRpcProvider(rpcUrl)
  const wallet = new Wallet(agentKey, provider)

  console.log('Sender:', wallet.address)
  console.log('Recipient:', recipient)

  const balance = await provider.getBalance(wallet.address)
  console.log('Balance:', balance.toString(), 'wei')

  const network = await provider.getNetwork()
  console.log('Chain ID:', network.chainId.toString())

  if (balance < parseEther('0.001')) {
    throw new Error('Insufficient balance for transfer')
  }

  console.log('Sending 0.001 ETH...')
  const tx = await wallet.sendTransaction({
    to: recipient,
    value: parseEther('0.001'),
    gasLimit: 21000,
  })

  console.log('Tx sent:', tx.hash)
  console.log('Explorer: https://sepolia.etherscan.io/tx/' + tx.hash)

  const receipt = await tx.wait()
  console.log('Confirmed in block:', receipt?.blockNumber)
  console.log('Status:', receipt?.status === 1 ? 'SUCCESS' : 'FAILED')
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
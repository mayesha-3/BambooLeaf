import { Contract, formatEther, formatUnits } from 'ethers'
import { getSigner } from '../signer/signer-service.tsx'
import { getToken } from './token-registry.tsx'

export async function getWalletSnapshot() {
  const { provider, wallet } = getSigner()
  const network = await provider.getNetwork()
  
  const ethBalance = await provider.getBalance(wallet.address)
  
  let usdcAddress: string | null = null
  let balanceUsdc: string | null = null
  try {
    const usdc = getToken('USDC', Number(network.chainId))
    usdcAddress = usdc.address
    const contract = new Contract(usdc.address, ['function balanceOf(address) view returns (uint256)'], provider)
    const usdcBalance = await contract.balanceOf(wallet.address)
    balanceUsdc = Number(formatUnits(usdcBalance, usdc.decimals)).toFixed(2)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Unknown token: USDC')) {
      throw error
    }
  }

  return {
    address: wallet.address,
    chainId: Number(network.chainId),
    balanceEth: Number(formatEther(ethBalance)).toFixed(4),
    balanceUsdc,
    usdcAddress,
  }
}
import { Contract } from 'ethers'
import { getSigner } from '../signer/signer-service.tsx'
import { getToken } from './token-registry.tsx'

export async function getWalletSnapshot() {
  const { provider, wallet } = getSigner()
  const network = await provider.getNetwork()
  
  const ethBalance = await provider.getBalance(wallet.address)
  
  let usdcBalance = 0n
  try {
    const usdc = getToken('USDC', Number(network.chainId))
    const contract = new Contract(usdc.address, ['function balanceOf(address) view returns (uint256)'], provider)
    usdcBalance = await contract.balanceOf(wallet.address)
  } catch { 
    // Ignore error
  }

  return {
    address: wallet.address,
    chainId: Number(network.chainId),
    balanceEth: (Number(ethBalance) / 1e18).toFixed(4),
    balanceUsdc: (Number(usdcBalance) / 1e6).toFixed(2),
  }
}
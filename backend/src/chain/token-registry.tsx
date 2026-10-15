import { getAddress } from 'ethers'

type TokenInfo = {
  symbol: string
  address: string
  decimals: number
  chainId: number
}

// Sepolia testnet token addresses
const TOKENS: TokenInfo[] = [
  {
    symbol: 'ETH',
    address: '0x0000000000000000000000000000000000000000', // native
    decimals: 18,
    chainId: 11155111,
  },
  {
    symbol: 'USDC',
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
    decimals: 6,
    chainId: 11155111,
  },
  {
    symbol: 'WETH',
    address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia WETH
    decimals: 18,
    chainId: 11155111,
  },
]

export function getToken(symbol: string, chainId: number): TokenInfo {
  const token = TOKENS.find(
    (t) => t.symbol === symbol.toUpperCase() && t.chainId === chainId,
  )
  if (!token) {
    throw new Error(`Unknown token: ${symbol} on chain ${chainId}`)
  }
  return token
}

export function isNativeToken(symbol: string): boolean {
  return symbol.toUpperCase() === 'ETH'
}

export function listTokens(chainId: number): TokenInfo[] {
  return TOKENS.filter((t) => t.chainId === chainId)
}

export function normalizeAddress(address: string): string {
  return getAddress(address)
}
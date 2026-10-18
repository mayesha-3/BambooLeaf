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
  const normalizedSymbol = symbol.toUpperCase()
  const configuredAddress = process.env[`TOKEN_${normalizedSymbol}_ADDRESS`]
  if (configuredAddress && Number(process.env.CHAIN_ID || 31337) === chainId) {
    const decimals = Number(process.env[`TOKEN_${normalizedSymbol}_DECIMALS`] || (normalizedSymbol === 'USDC' ? 6 : 18))
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw new Error(`Invalid decimals configured for token ${normalizedSymbol}`)
    }
    return {
      symbol: normalizedSymbol,
      address: getAddress(configuredAddress),
      decimals,
      chainId,
    }
  }
  if (normalizedSymbol === 'ETH') {
    return {
      symbol: 'ETH',
      address: '0x0000000000000000000000000000000000000000',
      decimals: 18,
      chainId,
    }
  }
  const token = TOKENS.find(
    (t) => t.symbol === normalizedSymbol && t.chainId === chainId,
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
  const symbols = new Set([
    'ETH',
    ...TOKENS.filter((token) => token.chainId === chainId).map((token) => token.symbol),
    ...Object.keys(process.env)
      .map((key) => key.match(/^TOKEN_([A-Z0-9]+)_ADDRESS$/)?.[1])
      .filter((symbol): symbol is string => Boolean(symbol)),
  ])

  return [...symbols].flatMap((symbol) => {
    try {
      return [getToken(symbol, chainId)]
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Unknown token:')) return []
      throw error
    }
  })
}

export function normalizeAddress(address: string): string {
  return getAddress(address)
}
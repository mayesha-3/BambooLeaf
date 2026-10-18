import { useState, useEffect, useCallback, useRef } from 'react'

export interface CryptoPrice {
  symbol: string
  name: string
  pair: string
  price: number
  change24h: number
  high24h?: number
  low24h?: number
  volume?: string
  icon?: string
}

const DEFAULT_PRICES: Record<string, CryptoPrice> = {
  ETH: { symbol: 'ETH', name: 'Ethereum', pair: 'ETH/USD', price: 2435.50, change24h: 1.45, high24h: 2480.00, low24h: 2390.00, volume: '$12.4B' },
  BTC: { symbol: 'BTC', name: 'Bitcoin', pair: 'BTC/USD', price: 68420.00, change24h: 2.12, high24h: 69100.00, low24h: 67200.00, volume: '$34.8B' },
  SOL: { symbol: 'SOL', name: 'Solana', pair: 'SOL/USD', price: 154.20, change24h: 4.85, high24h: 158.50, low24h: 147.20, volume: '$4.1B' },
  USDC: { symbol: 'USDC', name: 'USD Coin', pair: 'USDC/USD', price: 1.00, change24h: 0.01, high24h: 1.001, low24h: 0.999, volume: '$5.6B' },
  UNI: { symbol: 'UNI', name: 'Uniswap', pair: 'UNI/USD', price: 7.85, change24h: -0.65, high24h: 8.10, low24h: 7.70, volume: '$210M' },
  LINK: { symbol: 'LINK', name: 'Chainlink', pair: 'LINK/USD', price: 11.40, change24h: 3.20, high24h: 11.85, low24h: 10.95, volume: '$380M' },
}

export function useLivePrices(pollIntervalMs = 15000) {
  const [prices, setPrices] = useState<Record<string, CryptoPrice>>(DEFAULT_PRICES)
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [flashStates, setFlashStates] = useState<Record<string, 'up' | 'down' | null>>({})
  const prevPricesRef = useRef<Record<string, number>>({})

  const fetchPrices = useCallback(async () => {
    setIsLoading(true)
    try {
      // 1. Try Binance 24hr ticker API
      const symbols = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT', 'UNIUSDT', 'LINKUSDT']
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) })

      if (res.ok) {
        const data = await res.json()
        const newFlash: Record<string, 'up' | 'down' | null> = {}

        setPrices((prev) => {
          const updated = { ...prev }
          if (Array.isArray(data)) {
            data.forEach((item: any) => {
              const sym = item.symbol.replace('USDT', '')
              const currentPrice = parseFloat(item.lastPrice)
              const prevPrice = prevPricesRef.current[sym] || currentPrice

              if (currentPrice > prevPrice) newFlash[sym] = 'up'
              else if (currentPrice < prevPrice) newFlash[sym] = 'down'

              prevPricesRef.current[sym] = currentPrice

              if (updated[sym]) {
                updated[sym] = {
                  ...updated[sym],
                  price: currentPrice,
                  change24h: parseFloat(item.priceChangePercent),
                  high24h: parseFloat(item.highPrice),
                  low24h: parseFloat(item.lowPrice),
                  volume: `$${(parseFloat(item.quoteVolume) / 1e6).toFixed(1)}M`,
                }
              }
            })
          }
          return updated
        })

        setFlashStates(newFlash)
        setTimeout(() => setFlashStates({}), 1800)
        setLastUpdated(new Date())
        setIsLoading(false)
        return
      }
    } catch {
      // Fallback: try Coinbase exchange rates
      try {
        const cbRes = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD', { signal: AbortSignal.timeout(5000) })
        if (cbRes.ok) {
          const cbData = await cbRes.json()
          const rates = cbData?.data?.rates || {}
          setPrices((prev) => {
            const updated = { ...prev }
            const ethRate = rates['ETH'] ? 1 / parseFloat(rates['ETH']) : prev.ETH.price
            const btcRate = rates['BTC'] ? 1 / parseFloat(rates['BTC']) : prev.BTC.price
            const solRate = rates['SOL'] ? 1 / parseFloat(rates['SOL']) : prev.SOL.price

            updated.ETH = { ...updated.ETH, price: ethRate }
            updated.BTC = { ...updated.BTC, price: btcRate }
            updated.SOL = { ...updated.SOL, price: solRate }
            return updated
          })
          setLastUpdated(new Date())
        }
      } catch {
        // Keep fallback cached state
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrices()
    const timer = setInterval(fetchPrices, pollIntervalMs)
    return () => clearInterval(timer)
  }, [fetchPrices, pollIntervalMs])

  const convert = useCallback((amount: number, from: string, to: string): number => {
    if (!amount || isNaN(amount)) return 0
    if (from === to) return amount

    const getUsdValue = (asset: string): number => {
      if (asset === 'USD' || asset === 'USDC' || asset === 'USDT') return 1
      return prices[asset]?.price || 1
    }

    const fromUsd = getUsdValue(from)
    const toUsd = getUsdValue(to)

    const totalUsd = amount * fromUsd
    return totalUsd / toUsd
  }, [prices])

  return {
    prices,
    isLoading,
    lastUpdated,
    flashStates,
    refresh: fetchPrices,
    convert,
  }
}

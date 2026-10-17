import { useState, useId } from 'react'
import Card from '../../components/ui/Card'
import Icon from '../../components/ui/Icon'
import { useLivePrices } from './useLivePrices'
import { getCryptoIcon, PriceTrendBadge } from './CryptoIcons'

interface Props {
  onOpenGoalModal?: (prompt?: string) => void
  className?: string
}

const SUPPORTED_CURRENCIES = [
  { symbol: 'USD', name: 'US Dollar', type: 'fiat' },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'SOL', name: 'Solana', type: 'crypto' },
  { symbol: 'USDC', name: 'USD Coin', type: 'crypto' },
  { symbol: 'UNI', name: 'Uniswap', type: 'crypto' },
]

export default function LiveRatesConverterCard({ onOpenGoalModal, className = '' }: Props) {
  const { prices, isLoading, lastUpdated, convert, refresh } = useLivePrices(15000)

  // Converter state
  const [fromAsset, setFromAsset] = useState('USD')
  const [toAsset, setToAsset] = useState('ETH')
  const [amount, setAmount] = useState('100')
  const fromSelectId = useId()
  const toSelectId = useId()

  const numAmount = parseFloat(amount) || 0
  const convertedAmount = convert(numAmount, fromAsset, toAsset)

  const handleSwapAssets = () => {
    setFromAsset(toAsset)
    setToAsset(fromAsset)
  }

  const handlePlanGoalWithRate = () => {
    if (!onOpenGoalModal) return
    if (fromAsset === 'USD' || fromAsset === 'USDC') {
      onOpenGoalModal(`Swap ${amount} USDC to ${toAsset}`)
    } else if (toAsset === 'USD' || toAsset === 'USDC') {
      onOpenGoalModal(`Swap ${amount} ${fromAsset} to USDC`)
    } else {
      onOpenGoalModal(`Swap ${amount} ${fromAsset} to ${toAsset}`)
    }
  }

  // Rate ratio calculation
  const unitRate = convert(1, fromAsset, toAsset)

  return (
    <Card className={`p-6 sm:p-7 overflow-hidden ${className}`}>
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-2 shadow-sm border border-slate-200/80 dark:border-slate-700">
            {getCryptoIcon('ETH', 26)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Live Crypto Rates & Currency Converter
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-500/20 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE FEED
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Authentic market rates & instantaneous conversion for AI guarded goals
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 dark:text-slate-500 text-[11px] font-mono">
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 transition disabled:opacity-40"
            title="Refresh market prices"
          >
            <Icon name="refresh" size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
        {/* Left Side: Live Ticker Table with Authentic Logos (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2">
            <span>Asset / Network</span>
            <div className="flex items-center gap-12 sm:gap-16">
              <span>Price</span>
              <span>24h Change</span>
            </div>
          </div>

          <div className="space-y-2">
            {Object.values(prices).slice(0, 5).map((coin) => {
              return (
                <div
                  key={coin.symbol}
                  onClick={() => {
                    setToAsset(coin.symbol)
                    setFromAsset('USD')
                  }}
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 transition cursor-pointer group shadow-sm"
                >
                  {/* Left: Authentic Icon + Name */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      {getCryptoIcon(coin.symbol, 32)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                          {coin.name}
                        </p>
                        <span className="text-[10px] font-extrabold font-mono text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                          {coin.symbol}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {coin.pair} · Vol {coin.volume || '$--'}
                      </p>
                    </div>
                  </div>

                  {/* Right: Live Price + Up/Down Trend Badge with arrow */}
                  <div className="flex items-center gap-4 sm:gap-6 text-right">
                    <div>
                      <p className="text-xs sm:text-sm font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
                        ${coin.price.toLocaleString(undefined, {
                          minimumFractionDigits: coin.price < 10 ? 3 : 2,
                          maximumFractionDigits: coin.price < 10 ? 3 : 2,
                        })}
                      </p>
                      {coin.high24h && coin.low24h && (
                        <p className="text-[9px] text-slate-400 font-mono">
                          H: ${coin.high24h.toLocaleString(undefined, { maximumFractionDigits: 1 })} L: ${coin.low24h.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </p>
                      )}
                    </div>

                    {/* Authentic Up/Down Trend Badge */}
                    <PriceTrendBadge change={coin.change24h} size="md" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Side: Interactive Quick Calculator / Converter (5 cols) */}
        <div className="lg:col-span-5 bg-gradient-to-b from-slate-50 to-slate-100/70 dark:from-slate-900/70 dark:to-slate-800/50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Instant Currency Converter
              </h4>
              <span className="text-[10px] font-mono text-slate-400">
                0% Fee Reference
              </span>
            </div>

            {/* From Input */}
            <div className="space-y-1.5">
              <label htmlFor={fromSelectId} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>You Send</span>
                <span className="font-mono text-slate-400">Available: Unlimited</span>
              </label>
              <div className="flex items-center gap-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-2 shadow-sm focus-within:ring-2 focus-within:ring-[#84CC16]">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
                  {getCryptoIcon(fromAsset, 24)}
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-sm font-bold font-mono text-slate-900 dark:text-white outline-none px-1"
                />
                <select
                  id={fromSelectId}
                  aria-label="Send currency"
                  value={fromAsset}
                  onChange={(e) => setFromAsset(e.target.value)}
                  className="bg-slate-100 dark:bg-slate-800 text-xs font-bold font-mono text-slate-800 dark:text-slate-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.symbol} value={c.symbol}>
                      {c.symbol} ({c.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Swap direction button with animation */}
            <div className="flex justify-center -my-1 py-1 relative z-10">
              <button
                type="button"
                onClick={handleSwapAssets}
                className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-[#84CC16] hover:border-[#84CC16] shadow-md flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                title="Swap currencies"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" />
                </svg>
              </button>
            </div>

            {/* To Output */}
            <div className="space-y-1.5">
              <label htmlFor={toSelectId} className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                You Receive (Estimated)
              </label>
              <div className="flex items-center gap-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-2 shadow-sm">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
                  {getCryptoIcon(toAsset, 24)}
                </div>
                <div className="w-full text-sm font-bold font-mono text-slate-900 dark:text-white px-1 truncate">
                  {convertedAmount.toLocaleString(undefined, {
                    minimumFractionDigits: convertedAmount < 1 ? 4 : 2,
                    maximumFractionDigits: convertedAmount < 1 ? 6 : 2,
                  })}
                </div>
                <select
                  id={toSelectId}
                  aria-label="Receive currency"
                  value={toAsset}
                  onChange={(e) => setToAsset(e.target.value)}
                  className="bg-slate-100 dark:bg-slate-800 text-xs font-bold font-mono text-slate-800 dark:text-slate-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.symbol} value={c.symbol}>
                      {c.symbol} ({c.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Exchange Rate Badge */}
            <div className="mt-3 p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-[11px] font-mono flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#84CC16]" />
                Live Ratio:
              </span>
              <span className="font-extrabold text-slate-800 dark:text-slate-200">
                1 {fromAsset} = {unitRate < 0.01 ? unitRate.toFixed(6) : unitRate.toFixed(4)} {toAsset}
              </span>
            </div>
          </div>

          {/* Action button */}
          {onOpenGoalModal && (
            <button
              onClick={handlePlanGoalWithRate}
              className="w-full bg-[#84CC16] hover:bg-[#65A30D] text-white py-3 rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 group cursor-pointer"
            >
              <Icon name="spark" size={15} />
              <span>Plan swap with Guarded Agent</span>
              <span className="group-hover:translate-x-0.5 transition-transform">→</span>
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

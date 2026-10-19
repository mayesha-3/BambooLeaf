import { useLivePrices } from './useLivePrices'
import { getCryptoIcon, PriceTrendBadge } from './CryptoIcons'
import Icon from '../../components/ui/Icon'

export default function LiveMarketTicker() {
  const { prices, isLoading, lastUpdated, flashStates, refresh } = useLivePrices(15000)

  const items = Object.values(prices)

  return (
    <div className="w-full bg-white/80 dark:bg-[#090e1a]/85 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-8 py-2 flex items-center justify-between gap-4 select-none transition-colors duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      {/* Left: Live status indicator badge */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
          MARKETS
        </span>
      </div>

      {/* Center: Scrolling / Horizontal ticker chips with authentic crypto logos */}
      <div className="flex-1 flex items-center gap-2.5 sm:gap-4 overflow-x-auto no-scrollbar py-0.5">
        {items.map((item) => {
          const flash = flashStates[item.symbol]

          return (
            <div
              key={item.symbol}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 shadow-sm transition-all duration-300 shrink-0 ${
                flash === 'up'
                  ? 'ring-2 ring-emerald-500/70 bg-emerald-500/10 border-emerald-500/40 scale-[1.02]'
                  : flash === 'down'
                  ? 'ring-2 ring-rose-500/70 bg-rose-500/10 border-rose-500/40 scale-[1.02]'
                  : 'hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Authentic Crypto Coin Icon */}
              <div className="shrink-0 flex items-center justify-center">
                {getCryptoIcon(item.symbol, 18)}
              </div>

              {/* Symbol & Name */}
              <div className="flex flex-col">
                <span className="font-extrabold text-[11px] font-mono text-slate-800 dark:text-slate-200 leading-none">
                  {item.symbol}
                </span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium leading-tight">
                  {item.pair}
                </span>
              </div>

              {/* Real-time Price */}
              <span className="font-extrabold text-[12px] font-mono text-slate-900 dark:text-white tabular-nums tracking-tight">
                ${item.price.toLocaleString(undefined, {
                  minimumFractionDigits: item.price < 10 ? 3 : 2,
                  maximumFractionDigits: item.price < 10 ? 3 : 2,
                })}
              </span>

              {/* Authentic Up/Down Trend Badge with sharp diagonal arrow */}
              <PriceTrendBadge change={item.change24h} size="sm" />
            </div>
          )
        })}
      </div>

      {/* Right: Refresh button & last updated */}
      <div className="hidden lg:flex items-center gap-2.5 shrink-0 text-slate-400 dark:text-slate-500 text-[10px] font-mono">
        <span>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="p-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition disabled:opacity-40"
          title="Refresh market prices"
          aria-label="Refresh market prices"
        >
          <Icon name="refresh" size={11} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}

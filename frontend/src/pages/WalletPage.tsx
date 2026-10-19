import { useEffect, useState } from 'react'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'
import Icon from '../components/ui/Icon'
import type { Page, UserProfile } from '../types'
import { apiBaseUrl } from '../config/api'
import LiveRatesConverterCard from '../features/market/LiveRatesConverterCard'
import { getCryptoIcon } from '../features/market/CryptoIcons'

interface WalletPageProps {
  userProfile?: UserProfile
  onNavigate?: (page: Page) => void
}

type WalletSnapshot = {
  address: string
  chainId: number
  balanceEth: string
  balanceUsdc: string | null
  usdcAddress: string | null
}

export default function WalletPage({ userProfile, onNavigate }: WalletPageProps = {}) {
  // Privacy mode: Hide balances by default for security / shoulder-surfing protection
  const [hideBalances, setHideBalances] = useState(true)

  // Account key/card address reveal state
  const [showFullAddress, setShowFullAddress] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cardFinish, setCardFinish] = useState<'obsidian' | 'emerald' | 'titanium'>('obsidian')

  // Receive modal
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null)
  const [walletLoading, setWalletLoading] = useState(true)
  const [walletError, setWalletError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadWallet() {
      try {
        const response = await fetch(`${apiBaseUrl}/wallet/balance`, { signal: controller.signal })
        const payload = await response.json() as WalletSnapshot & { error?: string }
        if (!response.ok) throw new Error(payload.error || `Wallet API returned ${response.status}`)
        if (
          typeof payload.address !== 'string' ||
          typeof payload.chainId !== 'number' ||
          typeof payload.balanceEth !== 'string' ||
          !(typeof payload.balanceUsdc === 'string' || payload.balanceUsdc === null)
        ) throw new Error('Wallet API returned an invalid snapshot.')
        setWallet(payload)
        setWalletError('')
      } catch (loadError) {
        if (controller.signal.aborted) return
        setWalletError(loadError instanceof Error ? loadError.message : 'Unable to load wallet data.')
      } finally {
        if (!controller.signal.aborted) setWalletLoading(false)
      }
    }
    void loadWallet()
    return () => controller.abort()
  }, [])

  const walletAddress = wallet?.address || ''
  const chainLabel = wallet ? `Chain ${wallet.chainId}` : 'Network unavailable'
  const displayCardName = userProfile?.cardName || (userProfile?.name ? `${userProfile.name.toUpperCase()} · OWNER` : 'Connected signer')
  const balanceEth = wallet?.balanceEth ?? '—'
  const balanceUsdc = wallet?.balanceUsdc ?? null

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      setWalletError(error instanceof Error ? `Unable to copy address: ${error.message}` : 'Unable to copy address.')
    }
  }

  const tokens = [
    {
      symbol: 'ETH',
      name: `${chainLabel} native asset`,
      balance: balanceEth,
      contract: 'Native Asset',
    },
    ...(balanceUsdc !== null ? [{
      symbol: 'USDC',
      name: 'USD Coin',
      balance: balanceUsdc,
      contract: wallet?.usdcAddress || 'Token contract unavailable',
    }] : []),
  ]

  const groupedAddress = walletAddress
    ? `0x${walletAddress.slice(2).match(/.{1,4}/g)?.join(' ')}`
    : 'Wallet address unavailable'

  return (
    <>
      <PageHeading
        eyebrow={`Cryptographic Vault · ${chainLabel}`}
        title="Wallet & Signer"
        description="Inspect live balances and the connected signing wallet protected by backend policy."
        action={
          <div className="flex items-center gap-2.5">
            {/* Global Privacy Toggle (Eye icon) */}
            <button
              onClick={() => setHideBalances((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-sm"
              title={hideBalances ? 'Reveal amounts and balances' : 'Hide amounts for privacy'}
            >
              <Icon name={hideBalances ? 'eye' : 'eyeOff'} size={14} className={hideBalances ? 'text-slate-500' : 'text-[#65A30D] dark:text-lime-400'} />
              <span>{hideBalances ? 'Show Balances' : 'Hide Balances'}</span>
            </button>

            <Badge tone={wallet ? 'green' : 'amber'}>
              <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${wallet ? 'bg-lime-500' : 'bg-amber-500'}`} /> {chainLabel}
            </Badge>
          </div>
        }
      />
      {walletError && <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{walletError}</div>}

      {/* ================= BAMBOOLEAF REALISTIC SMART CARD SECTION ================= */}
      <div className="mb-8 grid gap-6 lg:grid-cols-12 items-start">
        
        {/* Realistic Premium Smart Card Column */}
        <div className="lg:col-span-7 flex flex-col items-center">
          
          {/* Card Finish Switcher Pill */}
          <div className="w-full flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#84CC16]" />
              Connected signer
            </span>
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-[11px] font-bold">
              {(['obsidian', 'emerald', 'titanium'] as const).map((finish) => (
                <button
                  key={finish}
                  onClick={() => setCardFinish(finish)}
                  className={`px-2.5 py-1 rounded-full capitalize transition ${
                    cardFinish === finish
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {finish}
                </button>
              ))}
            </div>
          </div>

          {/* Realistic 3D Physical Metal Card Container */}
          <div className="w-full max-w-[540px] perspective-[1000px]">
            <div
              className={`relative aspect-[1.586/1] w-full rounded-2xl sm:rounded-3xl p-6 sm:p-7 text-white select-none transition-all duration-500 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.65),0_0_30px_rgba(132,204,22,0.15)] ring-1 ring-white/20 border border-white/10 flex flex-col justify-between overflow-hidden group hover:scale-[1.01] ${
                cardFinish === 'obsidian'
                  ? 'bg-gradient-to-br from-[#070b12] via-[#0d1524] to-[#05110b]'
                  : cardFinish === 'emerald'
                  ? 'bg-gradient-to-br from-[#061e14] via-[#0a2e1d] to-[#04140d]'
                  : 'bg-gradient-to-br from-[#121824] via-[#1a2336] to-[#0e1622]'
              }`}
            >
              {/* Brushed Metal Specular Highlight Overlay */}
              <div className="absolute inset-0 bg-[linear-gradient(118deg,transparent_20%,rgba(255,255,255,0.08)_45%,rgba(255,255,255,0.18)_50%,rgba(255,255,255,0.06)_55%,transparent_80%)] pointer-events-none transition-opacity duration-300 group-hover:opacity-100 opacity-75" />

              {/* Ambient radial glows */}
              <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-[#84CC16]/20 blur-3xl pointer-events-none" />
              <div className="absolute -left-16 -bottom-16 w-56 h-56 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

              {/* Realistic Watermark: Etched Metallic Bamboo Leaf Pattern */}
              <svg
                className="absolute right-0 bottom-0 w-80 h-80 text-white/[0.04] pointer-events-none -mr-14 -mb-14"
                viewBox="0 0 200 200"
                fill="currentColor"
              >
                <path d="M40 180 C60 140, 100 100, 180 40 C140 60, 100 100, 40 180 Z" />
                <path d="M80 180 C100 130, 130 90, 190 30 C150 70, 120 110, 80 180 Z" />
                <path d="M20 140 C50 110, 90 80, 160 50 C120 80, 70 110, 20 140 Z" />
                <path d="M10 200 L190 10" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
              </svg>

              {/* Top Row: Metallic BambooLeaf Branding + Holographic Security Seal */}
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    {/* Metallic Bamboo Leaf Emblem */}
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-lime-400 via-[#84CC16] to-emerald-600 p-0.5 shadow-[0_2px_8px_rgba(132,204,22,0.4)] flex items-center justify-center">
                      <div className="w-full h-full bg-[#0a121e]/80 rounded-[10px] flex items-center justify-center text-lime-400">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2L4 12l8 10 8-10L12 2zm0 4.5l5 6.5-5 6.5-5-6.5 5-6.5z" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-sm sm:text-base font-black tracking-[0.24em] uppercase text-white font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        BAMBOOLEAF
                      </h2>
                      <p className="text-[9px] font-mono tracking-widest text-lime-400/90 font-semibold uppercase">
                        GUARDED WALLET
                      </p>
                    </div>
                  </div>
                </div>

                {/* Holographic Ethereum / Sepolia Multi-Color Security Seal */}
                <div className="flex items-center gap-2.5">
                  <div className="text-right hidden sm:block">
                    <p className="text-[8px] font-mono uppercase tracking-widest text-slate-400">Network</p>
                    <p className="text-[10px] font-mono font-bold text-slate-200">{chainLabel.toUpperCase()}</p>
                  </div>

                  {/* Prismatic Holo Foil Stamp */}
                  <div
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full p-[1.5px] bg-gradient-to-tr from-purple-500 via-pink-400 via-amber-300 via-emerald-400 to-cyan-400 shadow-[0_0_15px_rgba(255,255,255,0.2)] animate-pulse"
                    title="Cryptographic Hardware Security Seal"
                  >
                    <div className="w-full h-full rounded-full bg-slate-950/70 backdrop-blur-sm flex items-center justify-center text-white/90">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-100" viewBox="0 0 784.37 1277.39" fill="currentColor">
                        <path d="M392.07 0L383.5 29.11V874.74L392.07 883.29L784.13 651.54L392.07 0Z" fill="currentColor" fillOpacity="0.8" />
                        <path d="M392.07 0L0 651.54L392.07 883.29V472.33V0Z" fill="currentColor" fillOpacity="0.5" />
                        <path d="M392.07 956.17L387.24 962.06V1265.47L392.07 1277.39L784.37 724.89L392.07 956.17Z" fill="currentColor" fillOpacity="0.8" />
                        <path d="M392.07 1277.39V956.17L0 724.89L392.07 1277.39Z" fill="currentColor" fillOpacity="0.5" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Section: Realistic Brass EMV Chip + Contactless Symbol */}
              <div className="relative z-10 my-auto flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Brass EMV Microchip */}
                  <div className="relative w-12 h-9 rounded-lg bg-gradient-to-tr from-[#c89932] via-[#f7e089] to-[#b88523] p-[2px] shadow-[inset_0_1px_2px_rgba(255,255,255,0.6),0_2px_4px_rgba(0,0,0,0.5)] border border-[#8f6312]/60">
                    <div className="w-full h-full rounded-[6px] border border-[#7e550e]/50 grid grid-cols-3 grid-rows-3 gap-[1.5px] p-[2px] bg-gradient-to-br from-[#dfae3c] to-[#a2741d]">
                      <div className="border-r border-b border-[#7e550e]/40 rounded-tl-sm" />
                      <div className="border-b border-[#7e550e]/40" />
                      <div className="border-l border-b border-[#7e550e]/40 rounded-tr-sm" />
                      <div className="border-r border-[#7e550e]/40" />
                      <div className="bg-[#7e550e]/20 rounded-sm" />
                      <div className="border-l border-[#7e550e]/40" />
                      <div className="border-r border-t border-[#7e550e]/40 rounded-bl-sm" />
                      <div className="border-t border-[#7e550e]/40" />
                      <div className="border-l border-t border-[#7e550e]/40 rounded-br-sm" />
                    </div>
                  </div>

                  {/* Contactless RFID Wave Symbol */}
                  <svg className="w-5 h-5 text-slate-400/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M8.5 16.5a5 5 0 0 1 0-7" strokeLinecap="round" />
                    <path d="M12 19a8.5 8.5 0 0 0 0-14" strokeLinecap="round" />
                    <path d="M15.5 21.5a12 12 0 0 0 0-19" strokeLinecap="round" />
                  </svg>
                </div>

                {/* Autonomy Badge */}
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/70 border border-slate-700/60 backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
                  <span className="text-[10px] font-mono tracking-wider text-slate-200 uppercase font-semibold">
                    Policy guarded
                  </span>
                </div>
              </div>

              {/* Realistic Embossed Card / Account Number Row */}
              <div className="relative z-10 mt-1 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] sm:text-[9px] font-mono tracking-[0.2em] uppercase text-slate-400">
                    CONNECTED WALLET ADDRESS
                  </span>
                  
                  {/* Inline Mask/Reveal & Copy Controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShowFullAddress((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-lime-400 hover:text-lime-300 transition px-2 py-0.5 rounded-md hover:bg-white/10"
                      title={showFullAddress ? 'Mask address' : 'Reveal full address'}
                    >
                      <Icon name={showFullAddress ? 'eyeOff' : 'eye'} size={12} />
                      <span>{showFullAddress ? 'Mask' : 'Reveal'}</span>
                    </button>

                    <button
                      onClick={() => copyToClipboard(walletAddress)}
                      disabled={!walletAddress}
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-300 hover:text-white transition px-2 py-0.5 rounded-md hover:bg-white/10"
                      title="Copy full address"
                    >
                      <Icon name={copied ? 'check' : 'copy'} size={12} className={copied ? 'text-lime-400' : ''} />
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Laser-etched Monospace Card Number (in 4-char chunks) */}
                <div className="font-mono text-xs sm:text-[15px] tracking-[0.16em] sm:tracking-[0.22em] font-semibold text-slate-100 select-all drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] py-1 flex items-center flex-wrap gap-x-2">
                  {showFullAddress ? (
                    <span>{groupedAddress}</span>
                  ) : (
                    <span className="flex items-center gap-1.5 sm:gap-2">
                      <span>{walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'Wallet not connected'}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Row: Laser-etched Cardholder Name, Expiry & Balance */}
              <div className="relative z-10 pt-2 border-t border-white/10 flex items-end justify-between text-left">
                <div>
                  <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-slate-400">Cardholder</p>
                  <p className="text-xs sm:text-sm font-mono font-bold tracking-wider text-slate-200 uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {displayCardName}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-slate-400">Wallet Balance</p>
                  <p className="text-sm sm:text-base font-mono font-extrabold text-white tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                    {hideBalances ? (
                      <span className="tracking-[0.25em] text-slate-300 font-bold">••••••••</span>
                    ) : (
                      <span>{balanceEth} ETH · {balanceUsdc ?? '—'} USDC</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Quick Actions & Security Status Panel */}
        <div className="lg:col-span-5 flex flex-col justify-between">
          <Card className="p-5 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Quick Actions</h3>
                <span className="text-[10px] font-mono text-[#65A30D] dark:text-lime-400 font-bold bg-lime-50 dark:bg-lime-950/60 px-2 py-0.5 rounded-full">
                  Policy Enforced
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => onNavigate?.('chat')}
                  className="flex items-center gap-2 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-left group"
                >
                  <div className="w-8 h-8 rounded-xl bg-lime-100 dark:bg-lime-950/60 text-[#65A30D] dark:text-lime-400 grid place-items-center shrink-0">
                    <Icon name="arrow" size={14} className="rotate-45" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-[#65A30D] dark:group-hover:text-lime-400 transition">Transfer</p>
                    <p className="text-[10px] text-slate-400">Open guarded chat</p>
                  </div>
                </button>

                <button
                  onClick={() => setShowReceiveModal(true)}
                  className="flex items-center gap-2 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-left group"
                >
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 grid place-items-center shrink-0">
                    <Icon name="arrow" size={14} className="-rotate-135" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-500 transition">Receive</p>
                    <p className="text-[10px] text-slate-400">Wallet address</p>
                  </div>
                </button>

                {wallet?.chainId === 11155111 && (
                  <a
                    href="https://sepoliafaucet.com"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-left group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 grid place-items-center shrink-0">
                      <Icon name="spark" size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition">Sepolia faucet</p>
                      <p className="text-[10px] text-slate-400">{chainLabel}</p>
                    </div>
                  </a>
                )}

                <div className="flex items-center gap-2 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-left">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
                    <Icon name="shield" size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Firewall</p>
                    <p className="text-[10px] text-[#65A30D] dark:text-lime-400 font-bold">Backend policy active</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-lime-500" />
                Deterministic Guardrails Active
              </span>
              <span className="font-mono text-[10px] text-slate-400">{walletLoading ? 'Loading wallet…' : walletError || 'Balances from connected signer'}</span>
            </div>
          </Card>
        </div>

      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[
          { label: 'Native balance', value: `${balanceEth} ETH` },
          { label: 'USDC balance', value: balanceUsdc === null ? 'Not available on this chain' : `${balanceUsdc} USDC` },
          { label: 'Connected network', value: chainLabel },
        ].map((item) => (
          <Card key={item.label} className="p-5">
            <p className="text-xs font-bold text-slate-400">{item.label}</p>
            <p className="mt-2 break-all text-xl font-extrabold text-slate-900 dark:text-white">{walletLoading ? 'Loading…' : item.value}</p>
            <p className="mt-1 text-xs text-slate-400">{walletError ? 'Wallet data unavailable' : 'Read from configured signer and RPC'}</p>
          </Card>
        ))}
      </div>

      {/* ================= TOKEN ASSETS LIST ================= */}
      <Card className="mb-6 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Assets in Safe</h2>
            <p className="text-xs text-slate-400">Live token balances from the connected chain</p>
          </div>
          <button
            onClick={() => setHideBalances((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition font-medium"
          >
            <Icon name={hideBalances ? 'eye' : 'eyeOff'} size={14} />
            <span>{hideBalances ? 'Show Values' : 'Hide Values'}</span>
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {tokens.map((token) => (
            <div key={token.symbol} className="p-5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0">
                  {getCryptoIcon(token.symbol, 38)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{token.symbol}</p>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {token.contract}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{token.name}</p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                  {hideBalances ? `•••• ${token.symbol}` : `${token.balance} ${token.symbol}`}
                </p>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  {hideBalances ? '••••' : token.contract}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Real-time Market Rates & Currency Converter */}
      <LiveRatesConverterCard className="mt-6" />

      {/* ================= RECEIVE MODAL ================= */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Receive assets</h3>
                <p className="text-xs text-slate-400">Copy this wallet address to receive assets on {chainLabel}.</p>
              </div>
              <button
                onClick={() => setShowReceiveModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {/* Address copy block */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Wallet Address</label>
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <span className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate flex-1 select-all">
                  {walletAddress || (walletLoading ? 'Loading wallet address…' : 'Wallet address unavailable')}
                </span>
                <button
                  onClick={() => copyToClipboard(walletAddress)}
                  disabled={!walletAddress}
                  className="px-2.5 py-1 rounded-lg bg-lime-400 text-slate-950 font-bold text-xs hover:bg-lime-300 transition shrink-0"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowReceiveModal(false)}
              className="w-full py-2.5 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-black dark:hover:bg-slate-700 text-white text-xs font-bold transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

    </>
  )
}

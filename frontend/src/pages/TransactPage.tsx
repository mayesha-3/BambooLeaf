import { useState, useCallback } from 'react'
import Card from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import Badge from '../components/ui/Badge'
import { getCryptoIcon } from '../features/market/CryptoIcons'
import { useLivePrices } from '../features/market/useLivePrices'
import { apiBaseUrl } from '../config/api'
import type { Page } from '../types'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'send' | 'swap'
type PolicyStatus = 'idle' | 'checking' | 'allowed' | 'approval' | 'blocked'
type TxStatus = 'idle' | 'signing' | 'pending' | 'success' | 'failed'

type TxHistoryEntry = {
  id: string
  type: 'send' | 'swap'
  from: string
  to: string
  amount: string
  asset: string
  toAsset?: string
  toAmount?: string
  status: 'success' | 'pending' | 'blocked'
  timestamp: Date
  txHash?: string
}

const ASSETS = [
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'UNI', name: 'Uniswap' },
]

const GAS_SPEEDS = [
  { label: 'Slow', gwei: '12', time: '~5 min', color: 'text-slate-500' },
  { label: 'Standard', gwei: '18', time: '~1 min', color: 'text-amber-500' },
  { label: 'Fast', gwei: '28', time: '~15 sec', color: 'text-lime-600' },
]

const SLIPPAGE_OPTIONS = ['0.1%', '0.5%', '1.0%', 'Custom']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortenAddress(addr: string) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

function isValidAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim())
}

function PolicyBadge({ status }: { status: PolicyStatus }) {
  if (status === 'idle') return null
  if (status === 'checking')
    return (
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold">
        <span className="w-3 h-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
        Checking policy…
      </div>
    )
  if (status === 'allowed')
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-lime-50 dark:bg-lime-950/40 border border-lime-200 dark:border-lime-900/60">
        <span className="w-5 h-5 rounded-full bg-lime-500 flex items-center justify-center">
          <Icon name="check" size={11} className="text-white" />
        </span>
        <span className="text-xs font-bold text-lime-700 dark:text-lime-400">Policy check passed · Within daily limit</span>
      </div>
    )
  if (status === 'approval')
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60">
        <span className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
          <Icon name="clock" size={11} className="text-white" />
        </span>
        <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Needs T2 approval · Will queue after submit</span>
      </div>
    )
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
      <span className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center">
        <Icon name="x" size={11} className="text-white" />
      </span>
      <span className="text-xs font-bold text-rose-700 dark:text-rose-400">Blocked by policy · Exceeds per-tx cap</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TransactPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { prices, convert } = useLivePrices(15000)

  // Tab
  const [tab, setTab] = useState<Tab>('send')

  // Send state
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendAsset, setSendAsset] = useState('ETH')
  const [gasSpeed, setGasSpeed] = useState(1)

  // Swap state
  const [swapFrom, setSwapFrom] = useState('USDC')
  const [swapTo, setSwapTo] = useState('ETH')
  const [swapAmount, setSwapAmount] = useState('')
  const [slippage, setSlippage] = useState('0.5%')
  const [customSlippage, setCustomSlippage] = useState('')

  // Policy & confirm
  const [policyStatus, setPolicyStatus] = useState<PolicyStatus>('idle')
  const [showConfirm, setShowConfirm] = useState(false)
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txHash, setTxHash] = useState('')

  // History (local demo)
  const [history, setHistory] = useState<TxHistoryEntry[]>([
    {
      id: '1',
      type: 'send',
      from: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      amount: '0.005',
      asset: 'ETH',
      status: 'success',
      timestamp: new Date(Date.now() - 3600000 * 2),
      txHash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    },
    {
      id: '2',
      type: 'swap',
      from: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      to: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      amount: '25',
      asset: 'USDC',
      toAsset: 'ETH',
      toAmount: '0.0083',
      status: 'pending',
      timestamp: new Date(Date.now() - 900000),
    },
    {
      id: '3',
      type: 'send',
      from: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      to: '0xDeadBeef00000000000000000000000000000000',
      amount: '5.0',
      asset: 'ETH',
      status: 'blocked',
      timestamp: new Date(Date.now() - 7200000 * 3),
    },
  ])

  // ─── Computed values ──────────────────────────────────────────────────────

  const ethPrice = prices['ETH']?.price ?? 3000
  const sendUsdValue = sendAmount
    ? sendAsset === 'ETH'
      ? (parseFloat(sendAmount) * ethPrice).toFixed(2)
      : sendAsset === 'USDC'
      ? parseFloat(sendAmount).toFixed(2)
      : (parseFloat(sendAmount) * (prices[sendAsset]?.price ?? 0)).toFixed(2)
    : null

  const swapAmountNum = parseFloat(swapAmount) || 0
  const receivedAmount = convert(swapAmountNum, swapFrom, swapTo)
  const swapUsdValue = swapAmountNum
    ? (swapAmountNum * (prices[swapFrom]?.price ?? 1)).toFixed(2)
    : null

  const gasEth = (parseInt(GAS_SPEEDS[gasSpeed].gwei) * 21000) / 1e9
  const gasUsd = (gasEth * ethPrice).toFixed(4)

  const effectiveSlippage = slippage === 'Custom' ? customSlippage : slippage

  // ─── Policy check ─────────────────────────────────────────────────────────

  const runPolicyCheck = useCallback(async () => {
    const amount = tab === 'send' ? sendAmount : swapAmount
    if (!amount || parseFloat(amount) <= 0) return
    if (tab === 'send' && !isValidAddress(sendTo)) return

    setPolicyStatus('checking')
    await new Promise((r) => setTimeout(r, 900))

    const val = parseFloat(amount)
    if (tab === 'send' && sendAsset === 'ETH' && val > 1.0) {
      setPolicyStatus('blocked')
    } else if (tab === 'send' && val > 0.05) {
      setPolicyStatus('approval')
    } else if (tab === 'swap' && swapAmountNum > 500) {
      setPolicyStatus('blocked')
    } else if (tab === 'swap' && swapAmountNum > 100) {
      setPolicyStatus('approval')
    } else {
      setPolicyStatus('allowed')
    }
  }, [tab, sendAmount, sendTo, sendAsset, swapAmount, swapAmountNum])

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setTxStatus('signing')
    await new Promise((r) => setTimeout(r, 800))
    setTxStatus('pending')
    await new Promise((r) => setTimeout(r, 1500))

    const success = policyStatus !== 'blocked'
    if (success) {
      const hash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
      setTxHash(hash)
      setTxStatus('success')

      const entry: TxHistoryEntry = {
        id: Date.now().toString(),
        type: tab,
        from: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        to: tab === 'send' ? sendTo : '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        amount: tab === 'send' ? sendAmount : swapAmount,
        asset: tab === 'send' ? sendAsset : swapFrom,
        ...(tab === 'swap' && { toAsset: swapTo, toAmount: receivedAmount.toFixed(6) }),
        status: policyStatus === 'approval' ? 'pending' : 'success',
        timestamp: new Date(),
        txHash: hash,
      }
      setHistory((prev) => [entry, ...prev])
    } else {
      setTxStatus('failed')
    }
  }

  const handleReset = () => {
    setShowConfirm(false)
    setTxStatus('idle')
    setTxHash('')
    setPolicyStatus('idle')
    setSendTo('')
    setSendAmount('')
    setSwapAmount('')
  }

  const canPreview =
    tab === 'send'
      ? isValidAddress(sendTo) && parseFloat(sendAmount) > 0 && policyStatus === 'allowed'
      : parseFloat(swapAmount) > 0 && swapFrom !== swapTo && policyStatus === 'allowed'

  const canCheck =
    tab === 'send'
      ? isValidAddress(sendTo) && parseFloat(sendAmount) > 0
      : parseFloat(swapAmount) > 0 && swapFrom !== swapTo

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-[1400px]">

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#84CC16] to-[#4D7C0F] flex items-center justify-center shadow-[0_4px_14px_rgba(132,204,22,0.35)]">
              <Icon name="send" size={17} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Manual Transaction</h1>
              <p className="text-xs text-slate-400 mt-0.5">Direct wallet operations · Guarded by policy firewall</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-lime-200 dark:border-lime-900/60 bg-lime-50 dark:bg-lime-950/40 px-3 py-1.5 text-[11px] font-bold text-[#65A30D] dark:text-lime-400">
            <span className="w-1.5 h-1.5 rounded-full bg-[#84CC16] animate-pulse" />
            Guardrails Active
          </div>
          <button
            onClick={() => onNavigate('policy')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <Icon name="shield" size={12} /> Policy rules
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* ── LEFT: Transaction Builder (8 cols) ── */}
        <div className="xl:col-span-8 space-y-5">

          {/* Tab switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/80 dark:bg-slate-800/60 rounded-2xl w-fit">
            {(['send', 'swap'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setPolicyStatus('idle') }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                  tab === t
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Icon name={t === 'send' ? 'send' : 'refresh'} size={14} />
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Builder card */}
          <Card className="p-6 sm:p-7 space-y-6">

            {tab === 'send' ? (
              <>
                {/* Recipient */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Recipient Address</label>
                  <div className={`flex items-center gap-3 rounded-2xl border-2 p-4 transition-all duration-200 bg-slate-50/60 dark:bg-slate-800/40 ${
                    sendTo && !isValidAddress(sendTo)
                      ? 'border-rose-300 dark:border-rose-700'
                      : sendTo && isValidAddress(sendTo)
                      ? 'border-lime-300 dark:border-lime-800'
                      : 'border-slate-200 dark:border-slate-700 focus-within:border-[#84CC16] dark:focus-within:border-lime-700'
                  }`}>
                    <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <Icon name="user" size={15} className="text-slate-500" />
                    </div>
                    <input
                      type="text"
                      placeholder="0x… wallet address"
                      value={sendTo}
                      onChange={(e) => { setSendTo(e.target.value); setPolicyStatus('idle') }}
                      className="flex-1 bg-transparent text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                    />
                    {sendTo && (
                      <button onClick={() => setSendTo('')} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition">
                        <Icon name="x" size={14} />
                      </button>
                    )}
                    {isValidAddress(sendTo) && (
                      <span className="w-5 h-5 rounded-full bg-lime-500 flex items-center justify-center shrink-0">
                        <Icon name="check" size={10} className="text-white" />
                      </span>
                    )}
                  </div>
                  {sendTo && !isValidAddress(sendTo) && (
                    <p className="text-[11px] text-rose-500 font-semibold pl-1">Invalid EVM address format</p>
                  )}
                </div>

                {/* Amount + Asset */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Amount</label>
                    {sendUsdValue && <span className="text-[11px] text-slate-400 font-mono">≈ ${sendUsdValue} USD</span>}
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 p-4 bg-slate-50/60 dark:bg-slate-800/40 focus-within:border-[#84CC16] dark:focus-within:border-lime-700 transition-all duration-200">
                    <div className="w-8 h-8 flex items-center justify-center shrink-0">
                      {getCryptoIcon(sendAsset, 28)}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={sendAmount}
                      onChange={(e) => { setSendAmount(e.target.value); setPolicyStatus('idle') }}
                      className="flex-1 bg-transparent text-2xl font-extrabold font-mono text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none tabular-nums"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setSendAmount('0.01')}
                        className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 hover:bg-[#84CC16] hover:text-white text-slate-600 dark:text-slate-300 px-2 py-1 rounded-lg transition"
                      >
                        MAX
                      </button>
                      <select
                        value={sendAsset}
                        onChange={(e) => { setSendAsset(e.target.value); setPolicyStatus('idle') }}
                        aria-label="Send asset"
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white rounded-xl px-3 py-1.5 outline-none cursor-pointer"
                      >
                        {ASSETS.map((a) => (
                          <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Gas speed */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Network Fee</label>
                  <div className="grid grid-cols-3 gap-2">
                    {GAS_SPEEDS.map((g, i) => (
                      <button
                        key={g.label}
                        onClick={() => setGasSpeed(i)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all duration-200 ${
                          gasSpeed === i
                            ? 'border-[#84CC16] bg-lime-50 dark:bg-lime-950/30'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <span className={`text-xs font-extrabold ${gasSpeed === i ? 'text-[#65A30D] dark:text-lime-400' : 'text-slate-600 dark:text-slate-300'}`}>
                          {g.label}
                        </span>
                        <span className={`text-[10px] font-mono font-bold ${g.color}`}>{g.gwei} Gwei</span>
                        <span className="text-[10px] text-slate-400">{g.time}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] px-1">
                    <span className="text-slate-400 font-medium">Est. gas cost</span>
                    <span className="font-bold font-mono text-slate-700 dark:text-slate-300">{gasEth.toFixed(6)} ETH <span className="text-slate-400">(${gasUsd})</span></span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Swap from */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">You Send</label>
                    {swapUsdValue && <span className="text-[11px] text-slate-400 font-mono">≈ ${swapUsdValue} USD</span>}
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 p-4 bg-slate-50/60 dark:bg-slate-800/40 focus-within:border-[#84CC16] dark:focus-within:border-lime-700 transition-all">
                    <div className="w-8 h-8 flex items-center justify-center shrink-0">{getCryptoIcon(swapFrom, 28)}</div>
                    <input
                      type="number" min="0" step="any" placeholder="0.00"
                      value={swapAmount}
                      onChange={(e) => { setSwapAmount(e.target.value); setPolicyStatus('idle') }}
                      className="flex-1 bg-transparent text-2xl font-extrabold font-mono text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none tabular-nums"
                    />
                    <select
                      value={swapFrom}
                      onChange={(e) => { setSwapFrom(e.target.value); setPolicyStatus('idle') }}
                      aria-label="Swap from asset"
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white rounded-xl px-3 py-1.5 outline-none cursor-pointer"
                    >
                      {ASSETS.map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                    </select>
                  </div>
                </div>

                {/* Swap direction */}
                <div className="flex justify-center -my-1">
                  <button
                    onClick={() => { const t = swapFrom; setSwapFrom(swapTo); setSwapTo(t); setPolicyStatus('idle') }}
                    className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-[#84CC16] dark:hover:border-lime-700 flex items-center justify-center text-slate-500 hover:text-[#65A30D] shadow-sm transition-all hover:scale-110 active:scale-95"
                    title="Flip assets"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" />
                    </svg>
                  </button>
                </div>

                {/* Swap to */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">You Receive (Est.)</label>
                    {swapFrom !== swapTo && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        1 {swapFrom} = {convert(1, swapFrom, swapTo).toFixed(5)} {swapTo}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border-2 border-slate-100 dark:border-slate-800 p-4 bg-slate-50/30 dark:bg-slate-800/20">
                    <div className="w-8 h-8 flex items-center justify-center shrink-0">{getCryptoIcon(swapTo, 28)}</div>
                    <div className="flex-1 text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
                      {swapAmountNum > 0 && swapFrom !== swapTo
                        ? receivedAmount.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })
                        : <span className="text-slate-300 dark:text-slate-600">0.0000</span>
                      }
                    </div>
                    <select
                      value={swapTo}
                      onChange={(e) => { setSwapTo(e.target.value); setPolicyStatus('idle') }}
                      aria-label="Swap to asset"
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white rounded-xl px-3 py-1.5 outline-none cursor-pointer"
                    >
                      {ASSETS.map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                    </select>
                  </div>
                  {swapFrom === swapTo && (
                    <p className="text-[11px] text-rose-500 font-semibold pl-1">From and To assets must be different</p>
                  )}
                </div>

                {/* Slippage */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Slippage Tolerance</label>
                  <div className="flex items-center gap-2">
                    {SLIPPAGE_OPTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSlippage(s)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all duration-150 ${
                          slippage === s
                            ? 'border-[#84CC16] bg-lime-50 dark:bg-lime-950/30 text-[#65A30D] dark:text-lime-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                    {slippage === 'Custom' && (
                      <input
                        type="number" min="0.01" max="50" step="0.01"
                        placeholder="e.g. 2.0"
                        value={customSlippage}
                        onChange={(e) => setCustomSlippage(e.target.value)}
                        className="w-24 bg-slate-50 dark:bg-slate-800 border-2 border-[#84CC16] rounded-xl px-3 py-1.5 text-xs font-bold font-mono text-slate-900 dark:text-white outline-none"
                      />
                    )}
                  </div>
                </div>

                {/* Swap info row */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 font-medium">Route</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">Via Uniswap V3</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 font-medium">Network Fee</span>
                    <span className="font-bold font-mono text-slate-700 dark:text-slate-300">~${gasUsd}</span>
                  </div>
                </div>
              </>
            )}

            {/* Policy check result */}
            <PolicyBadge status={policyStatus} />

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={runPolicyCheck}
                disabled={!canCheck || policyStatus === 'checking'}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-[#84CC16] text-[#65A30D] dark:text-lime-400 font-bold text-sm hover:bg-lime-50 dark:hover:bg-lime-950/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="shield" size={15} />
                {policyStatus === 'checking' ? 'Checking…' : 'Check Policy'}
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={!canPreview}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-[#84CC16] to-[#65A30D] text-white font-bold text-sm shadow-[0_4px_14px_rgba(132,204,22,0.4)] hover:shadow-[0_6px_20px_rgba(132,204,22,0.5)] hover:from-[#65A30D] hover:to-[#4D7C0F] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <Icon name="send" size={15} />
                Preview & Sign
                <Icon name="arrow" size={13} />
              </button>
            </div>

            {!canCheck && (
              <p className="text-center text-[11px] text-slate-400">
                {tab === 'send' ? 'Enter a valid address and amount to continue' : 'Enter an amount and select different assets'}
              </p>
            )}
          </Card>
        </div>

        {/* ── RIGHT: History (4 cols) ── */}
        <div className="xl:col-span-4 space-y-5">

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Sent</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">
                {history.filter(h => h.status === 'success').length}
              </p>
              <p className="text-[10px] text-slate-400">transactions</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Blocked</p>
              <p className="text-xl font-extrabold text-rose-500">
                {history.filter(h => h.status === 'blocked').length}
              </p>
              <p className="text-[10px] text-slate-400">by guardrails</p>
            </Card>
          </div>

          {/* Transaction history */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent Transactions</h3>
              <button
                onClick={() => onNavigate('activity')}
                className="text-xs font-bold text-[#65A30D] dark:text-lime-400 hover:underline"
              >
                Full log →
              </button>
            </div>

            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No manual transactions yet</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="group flex items-center gap-3 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      h.status === 'success' ? 'bg-lime-50 dark:bg-lime-950/50 text-lime-600' :
                      h.status === 'pending' ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-500' :
                      'bg-rose-50 dark:bg-rose-950/50 text-rose-500'
                    }`}>
                      <Icon name={h.type === 'send' ? 'send' : 'refresh'} size={15} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-900 dark:text-white capitalize">
                          {h.type === 'send' ? `Send ${h.amount} ${h.asset}` : `Swap ${h.amount} ${h.asset} → ${h.toAsset}`}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono truncate">
                        {h.type === 'send' ? `To: ${shortenAddress(h.to)}` : `Get: ${h.toAmount} ${h.toAsset}`}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{h.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>

                    {/* Status */}
                    <div className="shrink-0">
                      {h.status === 'success' && <Badge tone="green">Done</Badge>}
                      {h.status === 'pending' && <Badge tone="amber">Pending</Badge>}
                      {h.status === 'blocked' && <Badge tone="red">Blocked</Badge>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Policy summary card */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-lime-400 text-white dark:text-slate-950 flex items-center justify-center">
                <Icon name="shield" size={14} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Active Policy Rules</p>
                <p className="text-[10px] text-slate-400">Manual tx guardrails</p>
              </div>
            </div>
            <div className="space-y-2 text-[11px]">
              {[
                { label: 'Per-tx ETH cap', value: '1.0 ETH', ok: true },
                { label: 'T2 approval > ', value: '0.05 ETH', ok: true },
                { label: 'Swap cap', value: '$500 USDC', ok: true },
                { label: 'Blocked addresses', value: 'OFAC list', ok: false },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">{r.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold font-mono text-slate-700 dark:text-slate-300">{r.value}</span>
                    <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${r.ok ? 'bg-lime-500' : 'bg-rose-500'}`}>
                      <Icon name={r.ok ? 'check' : 'x'} size={8} className="text-white" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => onNavigate('policy')}
              className="w-full text-center text-xs font-bold text-[#65A30D] dark:text-lime-400 hover:underline pt-1"
            >
              Edit policy rules →
            </button>
          </Card>
        </div>
      </div>

      {/* ── CONFIRM MODAL ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0d1424] rounded-3xl max-w-md w-full border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden">

            {txStatus === 'idle' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Confirm Transaction</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Review before signing</p>
                  </div>
                  <button onClick={() => setShowConfirm(false)} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition">
                    <Icon name="x" size={14} />
                  </button>
                </div>

                {/* Receipt */}
                <div className="px-6 py-5 space-y-4">
                  {/* Action pill */}
                  <div className="flex justify-center">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-lime-50 dark:bg-lime-950/40 border border-lime-200 dark:border-lime-900/60">
                      <Icon name={tab === 'send' ? 'send' : 'refresh'} size={14} className="text-[#65A30D] dark:text-lime-400" />
                      <span className="text-sm font-extrabold text-[#65A30D] dark:text-lime-400 capitalize">{tab} · Manual</span>
                    </div>
                  </div>

                  {/* Amount display */}
                  <div className="text-center py-2">
                    <div className="flex items-center justify-center gap-2">
                      {getCryptoIcon(tab === 'send' ? sendAsset : swapFrom, 32)}
                      <span className="text-4xl font-extrabold font-mono text-slate-900 dark:text-white">
                        {tab === 'send' ? sendAmount : swapAmount}
                      </span>
                      <span className="text-xl font-bold text-slate-400">{tab === 'send' ? sendAsset : swapFrom}</span>
                    </div>
                    {tab === 'swap' && (
                      <div className="flex items-center justify-center gap-2 mt-2 text-slate-400">
                        <Icon name="arrow" size={14} className="rotate-90" />
                        <span className="text-base font-bold font-mono">
                          {receivedAmount.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })} {swapTo}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-2 text-[12px]">
                    {tab === 'send' && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-slate-400 font-medium">To</span>
                        <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{shortenAddress(sendTo)}</span>
                      </div>
                    )}
                    {tab === 'swap' && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                        <span className="text-slate-400 font-medium">Slippage</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{effectiveSlippage}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 font-medium">Network fee</span>
                      <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{gasEth.toFixed(6)} ETH (${gasUsd})</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 font-medium">Policy status</span>
                      <PolicyBadge status={policyStatus} />
                    </div>
                  </div>

                  {/* Warning */}
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 text-[11px] text-amber-700 dark:text-amber-400">
                    <Icon name="shield" size={13} className="shrink-0 mt-0.5" />
                    <span className="font-medium">This is a manual transaction. Guardrails still apply. Double-check all details.</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 flex gap-3">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="flex-1 py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-[#84CC16] to-[#65A30D] text-white text-sm font-bold shadow-lg hover:shadow-xl transition-all hover:from-[#65A30D] hover:to-[#4D7C0F]"
                  >
                    Sign & Submit
                  </button>
                </div>
              </>
            )}

            {(txStatus === 'signing' || txStatus === 'pending') && (
              <div className="px-6 py-14 flex flex-col items-center gap-5">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-slate-800" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-[#84CC16] animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-lime-50 dark:bg-lime-950/30 flex items-center justify-center">
                    {getCryptoIcon('ETH', 22)}
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    {txStatus === 'signing' ? 'Signing transaction…' : 'Broadcasting to network…'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Please wait, do not close this window</p>
                </div>
              </div>
            )}

            {txStatus === 'success' && (
              <div className="px-6 py-10 flex flex-col items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-lime-500 flex items-center justify-center shadow-[0_8px_24px_rgba(132,204,22,0.4)]">
                  <Icon name="checkCircle" size={30} className="text-white" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">Transaction Submitted!</p>
                  {policyStatus === 'approval' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">Queued for T2 approval</p>
                  )}
                  <p className="text-xs text-slate-400">Tx Hash:</p>
                  <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg break-all">{txHash}</p>
                </div>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => onNavigate('activity')}
                    className="flex-1 py-2.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    View in Activity
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 py-2.5 rounded-2xl bg-[#84CC16] text-white text-xs font-bold transition hover:bg-[#65A30D]"
                  >
                    New Transaction
                  </button>
                </div>
              </div>
            )}

            {txStatus === 'failed' && (
              <div className="px-6 py-10 flex flex-col items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center shadow-[0_8px_24px_rgba(239,68,68,0.3)]">
                  <Icon name="x" size={28} className="text-white" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">Transaction Blocked</p>
                  <p className="text-xs text-slate-400">This transaction violates an active policy rule.</p>
                </div>
                <div className="flex gap-3 w-full">
                  <button onClick={() => onNavigate('policy')} className="flex-1 py-2.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                    View Policy
                  </button>
                  <button onClick={handleReset} className="flex-1 py-2.5 rounded-2xl bg-rose-500 text-white text-xs font-bold transition hover:bg-rose-600">
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

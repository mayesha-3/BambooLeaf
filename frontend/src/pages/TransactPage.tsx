import { useState, useCallback, useEffect, useMemo } from 'react'
import Card from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import Badge from '../components/ui/Badge'
import { getCryptoIcon } from '../features/market/CryptoIcons'
import { useLivePrices } from '../features/market/useLivePrices'
import { apiBaseUrl } from '../config/api'
import { authenticatedFetch } from '../lib/device-session'
import type { Page } from '../types'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'send' | 'swap'
type PolicyStatus = 'idle' | 'checking' | 'allowed' | 'approval' | 'blocked' | 'unsupported'
type TxStatus = 'idle' | 'signing' | 'pending' | 'success' | 'failed'

type TxHistoryEntry = {
  id: string
  requestId: string
  type: 'send' | 'swap'
  to: string
  amount: string
  asset: string
  toAsset?: string
  toAmount?: string
  status: 'success' | 'pending' | 'blocked'
  state: string
  error?: string
  approvalId?: string
  timestamp: Date
  txHash?: string
}

type PolicySummary = {
  maxPerTxEth: string
  maxPerRecipientPerDayEth: string
  maxSwapInputAmount: string | null
  maxTxPerWindow: number
  velocityWindowSeconds: number
  allowedRecipients: string[]
  supportedAssets: { symbol: string; name?: string }[]
}

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
  if (status === 'unsupported')
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60">
        <Icon name="clock" size={14} className="text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Preflight unavailable · Backend will validate on submit</span>
      </div>
    )
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
  const sendAsset = 'ETH'

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
  const [approvalId, setApprovalId] = useState('')

  // Transaction records and policy are loaded from the backend's MongoDB-backed APIs.
  const [history, setHistory] = useState<TxHistoryEntry[]>([])
  const [historySummary, setHistorySummary] = useState({ completed: 0, blocked: 0, pending: 0, counted: 0 })
  const [historyError, setHistoryError] = useState('')
  const [policySummary, setPolicySummary] = useState<PolicySummary | null>(null)
  const [policyError, setPolicyError] = useState('')
  const [submissionMessage, setSubmissionMessage] = useState('')
  const [requestId, setRequestId] = useState('')

  const loadHistory = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/goal/history`)
      const payload = await response.json() as {
        transactions?: Array<Omit<TxHistoryEntry, 'timestamp'> & { timestamp: string }>
        summary?: typeof historySummary
        error?: string
      }
      if (!response.ok) throw new Error(payload.error || `Transaction history failed (${response.status})`)
      setHistory((payload.transactions || []).map((entry) => ({ ...entry, timestamp: new Date(entry.timestamp) })))
      setHistorySummary(payload.summary || { completed: 0, blocked: 0, pending: 0, counted: 0 })
      setHistoryError('')
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Unable to load saved transaction history.')
    }
  }, [])

  const loadPolicySummary = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/policy`)
      const payload = await response.json() as PolicySummary & { error?: string }
      if (!response.ok) throw new Error(payload.error || `Policy request failed (${response.status})`)
      setPolicySummary(payload)
      setPolicyError('')
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : 'Unable to load active policy.')
    }
  }, [])

  const supportedSwapAssets = useMemo(() =>
    (policySummary?.supportedAssets || []).filter((asset) =>
      asset.symbol !== 'WETH' || !policySummary?.supportedAssets.some((supported) => supported.symbol === 'ETH')),
  [policySummary?.supportedAssets])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadHistory()
      void loadPolicySummary()
    }, 0)
    const timer = window.setInterval(() => void loadHistory(), 8000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
    }
  }, [loadHistory, loadPolicySummary])

  useEffect(() => {
    const symbols = supportedSwapAssets.map((asset) => asset.symbol)
    if (!symbols.length) return
    const syncAssets = window.setTimeout(() => {
      if (!symbols.includes(swapFrom)) setSwapFrom(symbols[0])
      if (!symbols.includes(swapTo) || swapTo === swapFrom) {
        setSwapTo(symbols.find((symbol) => symbol !== swapFrom) || '')
      }
    }, 0)
    return () => window.clearTimeout(syncAssets)
  }, [supportedSwapAssets, swapFrom, swapTo])

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

  const effectiveSlippage = slippage === 'Custom' ? customSlippage : slippage

  // ─── Policy check ─────────────────────────────────────────────────────────

  const runPolicyCheck = useCallback(async () => {
    const amount = tab === 'send' ? sendAmount : swapAmount
    if (!amount || parseFloat(amount) <= 0) return
    if (tab === 'send' && !isValidAddress(sendTo)) return

    setPolicyStatus('checking')
    setSubmissionMessage('')
    const goal = tab === 'send'
      ? `Send ${sendAmount} ${sendAsset} to ${sendTo}`
      : `Swap ${swapAmount} ${swapFrom} to ${swapTo} with ${effectiveSlippage} slippage`
    try {
      const response = await fetch(`${apiBaseUrl}/arena/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      })
      const result = await response.json() as { status?: string; reason?: string; error?: string }
      if (!response.ok) throw new Error(result.error || `Policy preflight failed (${response.status})`)
      if (result.status === 'policy_passed') setPolicyStatus('allowed')
      else if (result.status === 'approval_required') setPolicyStatus('approval')
      else if (result.status === 'unsupported_action') setPolicyStatus('unsupported')
      else {
        setPolicyStatus('blocked')
        setSubmissionMessage(result.reason || result.error || 'The backend policy preflight did not approve this request.')
      }
    } catch (error) {
      setPolicyStatus('blocked')
      setSubmissionMessage(error instanceof Error ? error.message : 'Unable to check active backend policy.')
    }
  }, [tab, sendAmount, sendTo, sendAsset, swapAmount, swapFrom, swapTo, effectiveSlippage])

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setTxStatus('signing')
    setSubmissionMessage('')
    const goal = tab === 'send'
      ? `Send ${sendAmount} ${sendAsset} to ${sendTo}`
      : `Swap ${swapAmount} ${swapFrom} to ${swapTo} with ${effectiveSlippage} slippage`
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ goal }),
      })
      const result = await response.json().catch(() => null) as {
        status?: string
        txHash?: string
        requestId?: string
        approvalId?: string
        expiresAt?: number
        error?: string
        reason?: string
        approval?: { id?: string }
      }
      if (!result) throw new Error(`Backend returned an unreadable response (${response.status}).`)
      setRequestId(result.requestId || '')
      if (!response.ok) throw new Error(result.error || `Transaction request failed (${response.status})`)
      setTxHash(result.txHash || '')
      setSubmissionMessage(result.reason || result.error || '')
      if (result.status === 'success' || result.status === 'confirmed') {
        if (!result.txHash) {
          setTxStatus('failed')
          setSubmissionMessage('The backend reported success without a transaction hash. Verify Activity Log before retrying.')
        } else {
          setTxStatus('success')
        }
      } else if (result.status === 'approval_required') {
        const id = result.approval?.id || result.approvalId
        if (!id) {
          setTxStatus('failed')
          setSubmissionMessage('Approval was required but no Approval Queue record ID was returned. Nothing was executed.')
        } else {
          setApprovalId(id)
          setPolicyStatus('approval')
          setTxStatus('pending')
          setSubmissionMessage(`Awaiting authorized review in the Approval Queue. Request ${id}`)
        }
      } else {
        setTxStatus('failed')
        if (!result.reason && !result.error) setSubmissionMessage(`Request was not executed (${result.status || 'unknown status'}).`)
      }
      await loadHistory()
    } catch (error) {
      setSubmissionMessage(error instanceof Error ? error.message : 'Unable to submit this transaction request.')
      setTxStatus('failed')
      await loadHistory()
    }
  }

  const handleReset = () => {
    setShowConfirm(false)
    setTxStatus('idle')
    setTxHash('')
    setApprovalId('')
    setRequestId('')
    setSubmissionMessage('')
    setPolicyStatus('idle')
    setSendTo('')
    setSendAmount('')
    setSwapAmount('')
  }

  const canPreview =
    tab === 'send'
      ? isValidAddress(sendTo) && parseFloat(sendAmount) > 0 && ['allowed', 'approval', 'unsupported'].includes(policyStatus)
      : parseFloat(swapAmount) > 0 && swapFrom !== swapTo &&
        supportedSwapAssets.some((asset) => asset.symbol === swapFrom) &&
        supportedSwapAssets.some((asset) => asset.symbol === swapTo) &&
        ['allowed', 'approval', 'unsupported'].includes(policyStatus)

  const canCheck =
    tab === 'send'
      ? isValidAddress(sendTo) && parseFloat(sendAmount) > 0
      : parseFloat(swapAmount) > 0 && swapFrom !== swapTo &&
        supportedSwapAssets.some((asset) => asset.symbol === swapFrom) &&
        supportedSwapAssets.some((asset) => asset.symbol === swapTo)

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
                      <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold dark:border-slate-700 dark:bg-slate-800">ETH</span>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">Exact network fee is determined by the signer when the transaction is submitted.</p>
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
                      {supportedSwapAssets.map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
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
                      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Market estimate only</label>
                    {swapFrom !== swapTo && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        1 {swapFrom} = {convert(1, swapFrom, swapTo).toFixed(5)} {swapTo}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">The backend obtains the router quote and enforces minimum output when submitted; this market estimate is not a guaranteed quote.</p>
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
                      {supportedSwapAssets.map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
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
                    <span className="font-bold text-slate-700 dark:text-slate-300">Via configured swap router</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 font-medium">Fee</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">Set by network at submission</span>
                  </div>
                </div>
              </>
            )}

            {/* Policy check result */}
            <PolicyBadge status={policyStatus} />
            {submissionMessage && policyStatus === 'blocked' && (
              <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{submissionMessage}</p>
            )}

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
                Review & Submit
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Confirmed</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">
                {historySummary.completed}
              </p>
              <p className="text-[10px] text-slate-400">saved transactions</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Blocked</p>
              <p className="text-xl font-extrabold text-rose-500">
                {historySummary.blocked}
              </p>
              <p className="text-[10px] text-slate-400">saved requests</p>
            </Card>
          </div>

          {historyError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{historyError} Summary and recent transactions are unavailable.</p>}

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
                <p className="text-xs text-slate-400 text-center py-8">{historyError ? 'Unable to load saved transactions.' : 'No saved transactions yet.'}</p>
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
                        {h.type === 'send' ? `To: ${shortenAddress(h.to)}` : h.toAmount ? `Minimum receive: ${h.toAmount} ${h.toAsset}` : `To: ${h.toAsset}`}
                      </p>
                      {h.error && <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate">{h.error}</p>}
                      {h.txHash && <p className="text-[9px] text-slate-400 font-mono truncate">{h.txHash}</p>}
                      <p className="text-[9px] text-slate-400 mt-0.5">{h.timestamp.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} · {h.state}</p>
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
                <p className="text-[10px] text-slate-400">Loaded from active backend policy</p>
              </div>
            </div>
            {policyError && <p role="alert" className="text-xs text-rose-600">{policyError}</p>}
            {policySummary ? <div className="space-y-2 text-[11px]">
              {[
                { label: 'Per-transaction ETH cap', value: `${policySummary.maxPerTxEth} ETH` },
                { label: 'Daily recipient limit', value: `${policySummary.maxPerRecipientPerDayEth} ETH` },
                { label: 'Transaction velocity', value: `${policySummary.maxTxPerWindow} / ${policySummary.velocityWindowSeconds}s` },
                { label: 'Maximum swap input', value: policySummary.maxSwapInputAmount || 'Not configured' },
                { label: 'Allow-listed recipients', value: String(policySummary.allowedRecipients.length) },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">{r.label}</span>
                  <span className="font-bold font-mono text-slate-700 dark:text-slate-300">{r.value}</span>
                </div>
              ))}
            </div> : !policyError && <p className="text-xs text-slate-400">Loading saved policy…</p>}
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
                    <p className="text-xs text-slate-400 mt-0.5">The backend rechecks policy before execution</p>
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
                      <span className="font-bold text-slate-800 dark:text-slate-200">Calculated at submission</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 font-medium">Policy status</span>
                      <PolicyBadge status={policyStatus} />
                    </div>
                  </div>

                  {/* Warning */}
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 text-[11px] text-amber-700 dark:text-amber-400">
                    <Icon name="shield" size={13} className="shrink-0 mt-0.5" />
                    <span className="font-medium">Submitting sends this request to the guarded backend. It may execute immediately or require approval.</span>
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
                    Submit Guarded Request
                  </button>
                </div>
              </>
            )}

            {txStatus === 'signing' && (
              <div className="px-6 py-14 flex flex-col items-center gap-5">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-slate-800" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-[#84CC16] animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-lime-50 dark:bg-lime-950/30 flex items-center justify-center">
                    {getCryptoIcon('ETH', 22)}
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-slate-900 dark:text-white">Submitting guarded request…</p>
                  <p className="text-xs text-slate-400 mt-1">Please wait, do not close this window</p>
                </div>
              </div>
            )}

            {txStatus === 'pending' && (
              <div className="px-6 py-10 flex flex-col items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-amber-400 flex items-center justify-center">
                  <Icon name="clock" size={28} className="text-white" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">Awaiting authorized approval</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">Queued only; no transaction has executed yet. An admin or approver must decide in the Approval Queue.</p>
                  {approvalId && <p className="break-all font-mono text-[10px] text-slate-500">Approval ID: {approvalId}</p>}
                  {requestId && <p className="break-all font-mono text-[10px] text-slate-500">Request ID: {requestId}</p>}
                </div>
                <div className="flex gap-3 w-full">
                  <button onClick={() => onNavigate('approvals')} className="flex-1 rounded-2xl bg-amber-500 py-2.5 text-xs font-bold text-white">Open Approval Queue</button>
                  <button onClick={handleReset} className="flex-1 rounded-2xl border-2 border-slate-200 py-2.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">Close</button>
                </div>
              </div>
            )}

            {txStatus === 'success' && (
              <div className="px-6 py-10 flex flex-col items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-lime-500 flex items-center justify-center shadow-[0_8px_24px_rgba(132,204,22,0.4)]">
                  <Icon name="checkCircle" size={30} className="text-white" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">Transaction confirmed on-chain</p>
                  {submissionMessage && <p className="text-xs text-slate-500">{submissionMessage}</p>}
                  {txHash && <>
                    <p className="text-xs text-slate-400">Tx Hash:</p>
                    <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg break-all">{txHash}</p>
                  </>}
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
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">Transaction not confirmed</p>
                  <p className="text-xs text-slate-400">{submissionMessage || 'The backend did not confirm execution. Check the Activity Log and on-chain status before retrying.'}</p>
                  {requestId && <p className="break-all font-mono text-[10px] text-slate-500">Request ID: {requestId}</p>}
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

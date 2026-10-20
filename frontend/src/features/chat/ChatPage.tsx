import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { UserProfile } from '../../types'
import { apiBaseUrl } from '../../config/api'
import { authenticatedFetch, getDeviceSessionToken } from '../../lib/device-session'

interface BalanceCard { kind: 'balance'; eth: string; usdc: string; total: string; change: string; chainId?: number }
interface TransactionCard { kind: 'transaction'; status: 'confirmed' | 'pending' | 'blocked'; type: string; amount: string; to: string; hash?: string; reason?: string }
interface PolicyCard { kind: 'policy'; perTxCap: string; dailyCap: string; usedToday: string; autonomyLevel: string }
interface ApprovalCard { kind: 'approval'; description: string; amount: string; expires: string; approvalId?: string }
interface SwapCard { kind: 'swap'; from: string; to: string; amount: string; rate: string; status: 'proposed' | 'approved' | 'blocked' }
type RichCard = BalanceCard | TransactionCard | PolicyCard | ApprovalCard | SwapCard
type MessageRole = 'user' | 'agent' | 'system'
interface ToolCall { name: string; status: 'running' | 'done' | 'failed'; detail?: string }
interface Message { id: string; role: MessageRole; text?: string; untrusted?: string[]; cards?: RichCard[]; toolCalls?: ToolCall[]; ts: Date }
interface GoalIntentSummary {
  action?: string
  amount?: string | null
  token?: string
  recipient?: string | null
  targetToken?: string | null
}
interface GoalApiResponse {
  requestId?: string
  status?: string
  txHash?: string
  reason?: string
  error?: string
  code?: string
  intent?: GoalIntentSummary
  data?: { balanceEth?: string; balanceUsdc?: string; chainId?: number }
  approvalId?: string
  expiresAt?: number
  approval?: { id?: string; digest?: string; expiresAt?: number }
}

function Icon({ d, size = 18, className = '' }: { d: ReactNode; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  )
}

const Icons = {
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  spark: <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 8h18M16 14h2" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  x: <path d="m18 6-12 12M6 6l12 12" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
  paperclip: <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
}

function BalanceCardView({ card }: { card: BalanceCard }) {
  return (
    <div className="mt-2 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] overflow-hidden max-w-[340px]">
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #84CC16 0%, #4D7C0F 100%)' }}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-lime-50/80 font-mono">Guarded wallet · Chain {card.chainId ?? '—'}</p>
          <p className="text-2xl font-black text-white mt-1 tracking-tight font-display">{card.total}</p>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <Icon d={Icons.wallet} size={18} className="text-white" />
        </div>
      </div>
      <div className="px-5 py-3 flex gap-6 text-xs bg-white dark:bg-slate-900">
        <div><p className="text-slate-400 dark:text-slate-500 font-medium">ETH</p><p className="font-extrabold text-slate-900 dark:text-white mt-0.5">{card.eth}</p></div>
        <div><p className="text-slate-400 dark:text-slate-500 font-medium">USDC</p><p className="font-extrabold text-slate-900 dark:text-white mt-0.5">{card.usdc}</p></div>
        <div className="ml-auto text-right"><p className="text-slate-400 dark:text-slate-500 font-medium">24h change</p><p className="font-extrabold text-[#65A30D] dark:text-lime-400 mt-0.5">{card.change}</p></div>
      </div>
    </div>
  )
}

function TransactionCardView({ card }: { card: TransactionCard }) {
  const s = {
    confirmed: { bg: 'bg-lime-50 dark:bg-lime-950/40 border-lime-100 dark:border-lime-900/60', dot: 'bg-[#84CC16]', text: 'text-[#65A30D] dark:text-lime-400', label: 'Confirmed' },
    pending: { bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/60', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400', label: 'Pending' },
    blocked: { bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/60', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', label: 'Blocked' },
  }[card.status]
  return (
    <div className={`mt-2 rounded-2xl border ${s.bg} p-4 max-w-[340px]`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900 dark:text-white font-display">{card.type}</p>
          <p className="text-lg font-extrabold text-slate-900 dark:text-white mt-1 tracking-tight font-display">{card.amount}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">{card.to}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${s.text} px-2 py-1 rounded-full whitespace-nowrap shrink-0`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span>
      </div>
      {card.reason && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300 font-semibold bg-rose-100/60 dark:bg-rose-950/60 rounded-xl px-3 py-2">⚠ {card.reason}</p>}
      {card.hash && <p className="mt-2 flex items-center gap-1 text-[10px] font-mono text-slate-400 dark:text-slate-500"><Icon d={Icons.external} size={11} />{card.hash}</p>}
    </div>
  )
}

function PolicyCardView({ card }: { card: PolicyCard }) {
  const usedPct = Math.min(100, (parseFloat(card.usedToday.replace('$','')) / parseFloat(card.dailyCap.replace('$',''))) * 100)
  return (
    <div className="mt-2 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] p-5 max-w-[340px]">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-lime-400 text-white dark:text-slate-950 flex items-center justify-center"><Icon d={Icons.shield} size={15} /></div>
        <div><p className="text-xs font-extrabold text-slate-900 dark:text-white font-display">Active policy limits</p><p className="text-[10px] text-slate-400 dark:text-slate-500">Autonomy {card.autonomyLevel}</p></div>
      </div>
      <div className="space-y-3 text-xs">
        <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400 font-medium">Per-tx cap</span><span className="font-bold text-slate-900 dark:text-white">{card.perTxCap}</span></div>
        <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400 font-medium">Daily cap</span><span className="font-bold text-slate-900 dark:text-white">{card.dailyCap}</span></div>
        <div>
          <div className="flex justify-between mb-1.5"><span className="text-slate-500 dark:text-slate-400 font-medium">Used today</span><span className="font-bold text-slate-900 dark:text-white">{card.usedToday}</span></div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-[#84CC16] transition-all duration-500" style={{ width: `${usedPct}%` }} /></div>
        </div>
      </div>
    </div>
  )
}

function ApprovalCardView({ card }: { card: ApprovalCard }) {
  const hasSession = Boolean(getDeviceSessionToken())
  const [status, setStatus] = useState<'checking' | 'pending' | 'executing' | 'approved' | 'rejected' | 'failed' | 'expired' | 'closed' | 'error'>(
    card.approvalId && hasSession ? 'checking' : 'error',
  )
  const [errorMessage, setErrorMessage] = useState(
    !card.approvalId
      ? 'Approval ID is missing. Submit the transaction again.'
      : hasSession
        ? ''
        : 'Sign in with your wallet to check this approval.',
  )
  const [txHash, setTxHash] = useState<string | null>(null)
  const [failureReason, setFailureReason] = useState('')

  useEffect(() => {
    let active = true
    if (!card.approvalId) return
    const token = getDeviceSessionToken()
    if (!token) return
    let timer: number | undefined
    const poll = async () => {
      try {
        const response = await authenticatedFetch(`${apiBaseUrl}/approvals/${card.approvalId}`)
        const result = await response.json() as { status?: string; txHash?: string | null; failureReason?: string | null; error?: string }
        if (!response.ok) throw new Error(result.error || 'Could not verify approval status.')
        if (!active) return
        if (result.txHash) setTxHash(result.txHash)
        if (result.failureReason) setFailureReason(result.failureReason)
        if (result.status === 'approved') setStatus('approved')
        else if (result.status === 'rejected') setStatus('rejected')
        else if (result.status === 'executing') setStatus('executing')
        else if (result.status === 'pending') setStatus('pending')
        else if (result.status === 'expired') setStatus('expired')
        else if (['failed', 'stale', 'denied'].includes(result.status || '')) setStatus('failed')
        else setStatus('closed')
        if (result.status === 'pending' || result.status === 'executing') {
          timer = window.setTimeout(() => void poll(), 2000)
        }
      } catch (error) {
        if (!active) return
        setErrorMessage(error instanceof Error ? error.message : 'Could not verify approval status.')
        setStatus('error')
      }
    }
    void poll()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [card.approvalId])

  return (
    <div className="mt-2 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 max-w-[340px]">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center shrink-0"><Icon d={Icons.clock} size={15} className="text-white" /></div>
        <div className="flex-1">
          <p className="text-xs font-extrabold text-slate-900 dark:text-white font-display">Approval required (T2)</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{card.description}</p>
          <div className="flex gap-2 text-[11px] font-bold mt-1"><span className="text-amber-700 dark:text-amber-400">{card.amount}</span><span className="text-slate-400">·</span><span className="text-slate-500 dark:text-slate-400">Expires {card.expires}</span></div>
        </div>
      </div>
      {status === 'checking' && (
        <div className="mt-3 rounded-xl py-2 flex justify-center items-center text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
          <span className="w-3 h-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin mr-2" />
          Checking approval status...
        </div>
      )}
      {status === 'pending' && <div className="mt-3 rounded-xl px-3 py-2 text-center text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">Waiting for an admin to review this request in the Approval Queue.</div>}
      {status === 'approved' && <div className="mt-3 rounded-xl py-2 text-center text-[11px] font-bold bg-lime-50 dark:bg-lime-950/60 text-[#65A30D] dark:text-lime-400">✓ Transaction confirmed{txHash ? <span className="mt-1 block break-all font-mono text-[10px]">{txHash}</span> : null}</div>}
      {status === 'rejected' && <div className="mt-3 rounded-xl py-2 text-center text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">✗ Transaction rejected</div>}
      {status === 'executing' && <div className="mt-3 rounded-xl px-3 py-2 text-center text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">Transaction broadcast; waiting for chain confirmation.{txHash ? <span className="mt-1 block break-all font-mono text-[10px]">{txHash}</span> : null}</div>}
      {status === 'expired' && <div className="mt-3 rounded-xl px-3 py-2 text-center text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Approval expired. Submit the transaction again to request a fresh approval.</div>}
      {status === 'failed' && <div role="alert" className="mt-3 rounded-xl px-3 py-2 text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">Transaction was not confirmed: {failureReason || 'Check Activity Log for the execution result.'}{txHash ? <span className="mt-1 block break-all font-mono text-[10px]">Broadcast transaction: {txHash}</span> : null}</div>}
      {status === 'closed' && <div className="mt-3 rounded-xl py-2 text-center text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">This approval is closed. Check the Approval Queue for its latest status.</div>}
      {status === 'error' && <div role="alert" className="mt-3 rounded-xl px-3 py-2 text-center text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">⚠ {errorMessage}</div>}
    </div>
  )
}

function SwapCardView({ card }: { card: SwapCard }) {
  const styleMap = {
    proposed: 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900',
    approved: 'border-lime-100 dark:border-lime-900/60 bg-lime-50 dark:bg-lime-950/30',
    blocked: 'border-rose-100 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30',
  }
  return (
    <div className={`mt-2 rounded-2xl border p-4 max-w-[340px] ${styleMap[card.status]}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1"><p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">From</p><p className="text-base font-extrabold text-slate-900 dark:text-white mt-1 font-display">{card.amount} {card.from}</p></div>
        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><Icon d={Icons.arrow} size={14} className="text-slate-600 dark:text-slate-300" /></div>
        <div className="flex-1 text-right"><p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">To</p><p className="text-base font-extrabold text-slate-900 dark:text-white mt-1 font-display">{card.to}</p></div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100/60 dark:border-slate-800 flex justify-between text-[11px]"><span className="text-slate-400 dark:text-slate-500 font-medium">Rate</span><span className="font-bold text-slate-700 dark:text-slate-300">{card.rate}</span></div>
      {card.status === 'blocked' && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">⚠ Blocked by policy firewall</p>}
    </div>
  )
}

function RichCardRenderer({ card }: { card: RichCard }) {
  if (card.kind === 'balance') return <BalanceCardView card={card} />
  if (card.kind === 'transaction') return <TransactionCardView card={card} />
  if (card.kind === 'policy') return <PolicyCardView card={card} />
  if (card.kind === 'approval') return <ApprovalCardView card={card} />
  if (card.kind === 'swap') return <SwapCardView card={card} />
  return null
}

function ToolCallIndicator({ calls }: { calls: ToolCall[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {calls.map((call, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
          {call.status === 'running' && <span className="w-3 h-3 rounded-full border-2 border-[#84CC16] border-t-transparent animate-spin" />}
          {call.status === 'done' && <span className="w-3 h-3 rounded-full bg-[#84CC16] flex items-center justify-center shrink-0"><svg width="7" height="7" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
          {call.status === 'failed' && <span className="w-3 h-3 rounded-full bg-rose-400 text-white text-[7px] flex items-center justify-center shrink-0">✕</span>}
          <span className="text-slate-600 dark:text-slate-300">{call.name}</span>
          {call.detail && <span className="text-slate-400 dark:text-slate-500">· {call.detail}</span>}
        </div>
      ))}
    </div>
  )
}

function MessageBubble({ msg, userProfile }: { msg: Message; userProfile?: UserProfile }) {
  const isUser = msg.role === 'user'
  if (msg.role === 'system') return (
    <div className="flex justify-center py-1">
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">{msg.text}</span>
    </div>
  )

  const userInitial = userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'U'
  const userAvatarGradient = userProfile?.avatarColor || 'from-[#65A30D] to-[#84CC16]'
  const userName = userProfile?.name || 'You'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <div className="w-8 h-8 rounded-2xl bg-[#F0FDF4] dark:bg-lime-950/40 border border-lime-100 dark:border-lime-900/50 flex items-center justify-center shrink-0 mt-1 shadow-sm"><Icon d={Icons.spark} size={16} className="text-[#65A30D] dark:text-lime-400" /></div>}
      {isUser && (
        <div
          className={`w-8 h-8 rounded-2xl bg-gradient-to-tr ${userAvatarGradient} text-white font-black text-xs flex items-center justify-center shrink-0 mt-1 shadow-sm ring-2 ring-white dark:ring-slate-800`}
          title={userName}
        >
          {userInitial}
        </div>
      )}
      <div className={`flex-1 max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
            {isUser ? userName : 'BambooLeaf Agent'}
          </span>
          <span className="text-[10px] text-slate-300 dark:text-slate-600">{msg.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {msg.text && <div className={`px-4 py-3 rounded-2xl text-xs leading-relaxed font-medium ${isUser ? 'bg-slate-900 dark:bg-[#84CC16] text-white dark:text-slate-950 rounded-tr-sm' : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-100 shadow-sm rounded-tl-sm'}`}>{msg.text}</div>}
        {msg.untrusted && msg.untrusted.length > 0 && (
          <details className="mt-2 w-full max-w-full rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-800 dark:text-amber-300">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-semibold">
              <Icon d={Icons.paperclip} size={12} className="shrink-0" />
              <span>Attached memo · {msg.untrusted.length} item{msg.untrusted.length === 1 ? '' : 's'}</span>
              <span className="ml-auto text-[10px] text-amber-700/70 dark:text-amber-400/70">View</span>
            </summary>
            <div className="mx-3 mb-3 max-h-36 overflow-y-auto rounded-lg bg-white/70 p-2.5 text-[11px] leading-relaxed text-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
              {msg.untrusted.map((item, index) => (
                <pre key={index} className="whitespace-pre-wrap break-words font-sans">{item}</pre>
              ))}
            </div>
          </details>
        )}
        {msg.toolCalls && msg.toolCalls.length > 0 && <div className="mt-1 px-1"><ToolCallIndicator calls={msg.toolCalls} /></div>}
        {msg.cards?.map((card, i) => <RichCardRenderer key={i} card={card} />)}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-2xl bg-[#F0FDF4] dark:bg-lime-950/40 border border-lime-100 dark:border-lime-900/50 flex items-center justify-center shrink-0 shadow-sm"><Icon d={Icons.spark} size={16} className="text-[#65A30D] dark:text-lime-400" /></div>
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1.5 mt-1">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

function ContextPanel({ width, onResizeStart, userProfile, isAuthenticated }: { width: number; onResizeStart: (e: React.MouseEvent) => void; userProfile?: UserProfile; isAuthenticated: boolean }) {
  const [walletData, setWalletData] = useState<{ balanceEth: string; balanceUsdc: string } | null>(null)
  useEffect(() => {
    if (!isAuthenticated) return

    let active = true
    authenticatedFetch(`${apiBaseUrl}/wallet/balance`)
      .then(res => {
        if (!res.ok) throw new Error(`Could not load wallet balance (${res.status}).`)
        return res.json() as Promise<{ balanceEth: string; balanceUsdc: string }>
      })
      .then(data => { if (active) setWalletData(data) })
      .catch(error => { if (active) console.error(error) })
    return () => { active = false }
  }, [isAuthenticated])

  return (
    <aside className="hidden xl:flex flex-col shrink-0 border-l border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#0c1220] overflow-y-auto relative transition-colors" style={{ width }}>
      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 left-0 w-3 h-full cursor-col-resize z-10 group flex items-center justify-center transition-colors hover:bg-[#84CC16]/8"
      >
        <div className="flex flex-col items-center gap-[3px] py-2 px-0.5 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-[#84CC16]/20 transition-colors">
          <div className="w-[3px] h-[3px] rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
          <div className="w-[3px] h-[3px] rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
          <div className="w-[3px] h-[3px] rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
          <div className="w-[3px] h-[3px] rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
          <div className="w-[3px] h-[3px] rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
        </div>
      </div>
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/80"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Live Context</p></div>
      <div className="px-5 py-4 space-y-5 flex-1">
        {userProfile && (
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 flex items-center gap-3 shadow-sm">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${userProfile.avatarColor || 'from-[#65A30D] to-[#84CC16]'} text-white font-black text-xs flex items-center justify-center shrink-0 shadow-sm ring-1 ring-white/10`}>
              {userProfile.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{userProfile.name}</p>
                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-lime-100 dark:bg-lime-950 text-[#65A30D] dark:text-lime-400">
                  Owner
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{userProfile.handle}</p>
            </div>
          </div>
        )}
        
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">Wallet</p>
          <div className="rounded-2xl p-4 text-white overflow-hidden relative shadow-sm" style={{ background: 'linear-gradient(135deg, #82C91E 0%, #65A30D 100%)' }}>
            <div className="absolute top-0 right-0 w-24 h-full opacity-[0.12] pointer-events-none">
              <svg viewBox="0 0 80 120" fill="none" className="w-full h-full">
                <circle cx="60" cy="30" r="28" stroke="white" strokeWidth="2" />
                <circle cx="60" cy="30" r="18" stroke="white" strokeWidth="1.5" />
                <circle cx="45" cy="80" r="22" stroke="white" strokeWidth="1.5" />
                <circle cx="45" cy="80" r="12" stroke="white" strokeWidth="1" />
              </svg>
            </div>
            <div className="relative z-[1] flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-lime-50/70 uppercase tracking-wider">Total balance</p>
                {isAuthenticated ? (
                  <>
                    <p className="text-2xl font-extrabold mt-1 tracking-tight">
                      {walletData ? Number(walletData.balanceEth) > 0 ? `${walletData.balanceEth} ETH` : '0 ETH' : 'Loading...'}
                    </p>
                    <div className="flex gap-4 mt-3 text-[11px]">
                      <div><p className="text-lime-50/70">ETH</p><p className="font-bold">{walletData ? walletData.balanceEth || '-' : 'Loading...'}</p></div>
                      <div><p className="text-lime-50/70">USDC</p><p className="font-bold">{walletData ? walletData.balanceUsdc || '-' : 'Loading...'}</p></div>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm font-semibold">Log in to view your balance</p>
                )}
              </div>
              <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 ml-3 mt-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="15" rx="2" />
                  <path d="M3 8h18M16 14h2" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">Active guardrails</p>
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 p-4 space-y-3">
            <div>
              <div className="flex justify-between text-[11px] mb-1.5"><span className="text-slate-500 dark:text-slate-400 font-medium">Daily cap used</span><span className="font-bold text-slate-900 dark:text-white">$0.00 / $150</span></div>
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-[#84CC16]" style={{ width: '0%' }} /></div>
            </div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-500 dark:text-slate-400 font-medium">Per-tx max</span><span className="font-bold text-slate-900 dark:text-white">$25.00</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-500 dark:text-slate-400 font-medium">Autonomy level</span><span className="font-bold text-[#65A30D] dark:text-lime-400">L2 · Standard</span></div>
          </div>
        </div>
      </div>
    </aside>
  )
}

async function getAgentResponse(userText: string, untrusted?: string[]): Promise<Message> {
  const id = crypto.randomUUID()
  try {
    const payload: { goal: string; untrusted?: string[] } = { goal: userText }
    if (untrusted && untrusted.length > 0) {
      payload.untrusted = untrusted
    }
    const res = await authenticatedFetch(`${apiBaseUrl}/goal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    })

    const data = await res.json().catch(() => null) as GoalApiResponse | null

    if (data) {
      if (data.status === 'success' && data.data) {
        return {
          id, role: 'agent',
          text: "Here's your current guarded wallet balance:",
          toolCalls: [{ name: 'wallet.getBalance()', status: 'done' as const, detail: `${data.data.balanceEth} ETH, ${data.data.balanceUsdc} USDC` }],
          cards: [{ kind: 'balance', eth: `${data.data.balanceEth} ETH`, usdc: `${data.data.balanceUsdc} USDC`, total: `${data.data.balanceEth} ETH`, change: '+0.00%', chainId: data.data.chainId } as BalanceCard],
          ts: new Date(),
        }
      }

      if (data.status === 'approval_required') {
        const approvalId = data.approvalId || data.approval?.id
        if (!approvalId) {
          return {
            id, role: 'agent',
            text: 'The request needs human approval, but it could not be added to the Approval Queue. No transaction was executed. Please try again or check the backend.',
            toolCalls: [{ name: 'approvals.create()', status: 'failed' as const, detail: 'Missing approval ID' }],
            cards: [{ kind: 'transaction', status: 'blocked', type: 'Approval request not queued', amount: `${data.intent?.amount ?? ''} ${data.intent?.token ?? ''}`.trim(), to: 'Approval Queue', reason: 'No approval record was created; nothing was executed.' } as TransactionCard],
            ts: new Date(),
          }
        }
        const expiresInMinutes = data.expiresAt
          ? Math.max(1, Math.ceil((data.expiresAt - Date.now()) / 60000))
          : 2
        return {
          id, role: 'agent',
          text: `This transaction requires your manual approval (T2).`,
          toolCalls: [{ name: 'policy.validate(intent)', status: 'done' as const, detail: 'T2 required' }],
          cards: [{ 
            kind: 'approval', 
            description: data.intent?.action === 'swap'
              ? `Swap ${data.intent?.token || ''} to ${data.intent?.targetToken || 'token'}`
              : `Transaction to ${data.intent?.recipient || 'recipient'}`,
            amount: `${data.intent?.amount} ${data.intent?.token}`, 
            expires: `in ${expiresInMinutes} min`,
            approvalId
          } as ApprovalCard],
          ts: new Date(),
        }
      }

      if (data.status === 'blocked' && data.code) {
        return {
          id, role: 'agent',
          text: `⚠ Blocked: ${data.error || 'The action violates security policy.'}`,
          toolCalls: [{ name: 'quarantine.inspect()', status: 'failed' as const, detail: data.code }],
          cards: [{ kind: 'transaction', status: 'blocked', type: 'Quarantine Blocked', amount: '', to: 'Security Firewall', reason: data.error || 'Untrusted content flagged' } as TransactionCard],
          ts: new Date(),
        }
      }

      if (data.status === 'denied') {
        return {
          id, role: 'agent',
          text: `⚠ Policy denied: ${data.reason || 'Transaction violates wallet security policy.'}`,
          toolCalls: [{ name: 'policy.evaluate(intent)', status: 'failed' as const, detail: 'Policy Denied' }],
          cards: [{ kind: 'transaction', status: 'blocked', type: data.intent?.action ? `${data.intent.action.toUpperCase()} ${data.intent.amount ?? ''}`.trim() : 'Policy Denied', amount: data.intent?.amount ? `${data.intent.amount} ${data.intent.token}` : '', to: data.intent?.recipient || 'External', reason: data.reason || 'Denied by policy guardrails' } as TransactionCard],
          ts: new Date(),
        }
      }

      if (data.status === 'not_executed' || data.error) {
        const reason = data.error || data.reason || 'The backend did not execute this request.'
        return {
          id, role: 'agent',
          text: `⚠ Request not executed: ${reason}`,
          toolCalls: [{ name: 'agent.process()', status: 'failed' as const, detail: data.status || `HTTP ${res.status}` }],
          cards: [{
            kind: 'transaction',
            status: 'blocked',
            type: 'Request not executed',
            amount: data.intent?.amount ? `${data.intent.amount} ${data.intent.token || ''}`.trim() : '',
            to: data.intent?.action === 'swap'
              ? `${data.intent.token || 'Token'} → ${data.intent.targetToken || 'token'}`
              : data.intent?.recipient || 'Transaction',
            reason: `${reason}${data.requestId ? ` (Request ID: ${data.requestId})` : ''}`,
          } as TransactionCard],
          ts: new Date(),
        }
      }

      if (data.txHash || data.status === 'confirmed' || data.status === 'success') {
        return {
          id, role: 'agent',
          text: `Transaction confirmed on-chain!`,
          toolCalls: [
            { name: 'policy.validate()', status: 'done' as const, detail: 'Approved' },
            { name: 'signer.broadcast()', status: 'done' as const, detail: 'Confirmed' },
          ],
          cards: [{ kind: 'transaction', status: 'confirmed', type: data.intent?.action ? `${data.intent.action} ${data.intent.amount || ''} ${data.intent.token || ''}`.trim() : 'Execution confirmed', amount: data.intent?.amount ? `${data.intent.amount} ${data.intent.token}` : '', to: data.intent?.recipient || 'Recipient', hash: data.txHash } as TransactionCard],
          ts: new Date(),
        }
      }
    }

    if (!res.ok) {
      return {
        id, role: 'agent',
        text: `⚠ Request failed (HTTP ${res.status}). The backend returned no readable error details.`,
        toolCalls: [{ name: 'agent.process()', status: 'failed' as const, detail: `HTTP ${res.status}` }],
        ts: new Date(),
      }
    }
  } catch (error) {
    const message = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      ? 'The request took longer than 3 minutes. Check backend logs and planner/RPC availability, then try again.'
      : error instanceof Error ? error.message : 'Backend unreachable. Please check your server.'
    return {
      id, role: 'agent',
      text: `⚠ ${message}`,
      toolCalls: [{ name: 'network.request()', status: 'failed' as const, detail: 'Connection failed' }],
      ts: new Date(),
    }
  }
  
  return {
    id, role: 'agent',
    text: `⚠ The backend returned an unrecognized response. No success or transaction confirmation was received.`,
    toolCalls: [{ name: 'agent.process()', status: 'failed' as const, detail: 'Unrecognized backend response' }],
    ts: new Date(),
  }
}

const quickPrompts = [
  { label: 'Check balance', prompt: 'Check my balance' },
  { label: 'Swap 20 USDC → ETH', prompt: 'Swap 20 USDC to ETH' },
  { label: 'Send 0.01 ETH', prompt: 'Send 0.01 ETH to 0xe2463837df0a08d3d1728a0cef444a57a879b1dd' },
  { label: 'Show policy limits', prompt: 'Show policy limits' },
]

interface ChatPageProps {
  userProfile?: UserProfile
  isAuthenticated?: boolean
}

export default function ChatPage({ userProfile: propProfile, isAuthenticated = false }: ChatPageProps = {}) {
  const [storedUserProfile] = useState<UserProfile>(() => {
    if (propProfile) return propProfile
    try {
      const saved = localStorage.getItem('bambooleaf_user_profile')
      if (saved) return JSON.parse(saved)
    } catch (error) {
      console.warn('Unable to read saved user profile.', error)
    }
    return {
      name: 'Mayes', handle: 'owner@bambooleaf.eth', email: 'mayes@bambooleaf.eth', walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      role: 'Primary Signer · Workspace Owner', avatarColor: 'from-[#65A30D] to-[#84CC16]', bio: '...', telegram: '@mayes_guard', cardName: 'MAYES · OWNER',
    }
  })
  const userProfile = propProfile || storedUserProfile

  // UPDATED: Save chat to localStorage
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('bambooleaf_chat_history')
      if (saved) {
        return JSON.parse(saved, (key, value) => {
          if (key === 'ts') return new Date(value)
          return value
        })
      }
    } catch (err) {
      console.error('Failed to load chat history', err)
    }
    return [{ id: '0', role: 'system', text: 'BambooLeaf Agent connected · Sepolia testnet · Policy active', ts: new Date() }]
  })

  // UPDATED: Save messages when they change
  useEffect(() => {
    try {
      localStorage.setItem('bambooleaf_chat_history', JSON.stringify(messages))
    } catch (err) {
      console.error('Failed to save chat history', err)
    }
  }, [messages])

  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showQuickPrompts, setShowQuickPrompts] = useState(false)
  const [showAttachment, setShowAttachment] = useState(false)
  const [attachmentText, setAttachmentText] = useState('')
  const [attachmentFileName, setAttachmentFileName] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [contextPanelWidth, setContextPanelWidth] = useState(280)
  const contextResizing = useRef(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const container = messagesContainerRef.current
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping])

  const handleContextResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    contextResizing.current = true
    const startX = e.clientX
    const startWidth = contextPanelWidth
    const onMove = (ev: MouseEvent) => {
      if (!contextResizing.current) return
      const delta = startX - ev.clientX
      const newWidth = Math.max(200, Math.min(450, startWidth + delta))
      setContextPanelWidth(newWidth)
    }
    const onUp = () => {
      contextResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [contextPanelWidth])

  async function send(text: string) {
    const trimmed = text.trim()
    const untrustedTrimmed = attachmentText.trim()
    if (!trimmed || isTyping) return

    const attachmentContent = attachmentFileName
      ? `Attached file: ${attachmentFileName}\n${untrustedTrimmed}`
      : untrustedTrimmed
    if (attachmentContent.length > 4000) {
      setAttachmentError('Memo text must be no more than 4,000 characters. Shorten the memo before sending.')
      setShowAttachment(true)
      return
    }
    const untrustedList = attachmentContent ? [attachmentContent] : undefined

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
      untrusted: untrustedList,
      ts: new Date(),
    }])
    setInput('')
    setAttachmentText('')
    setAttachmentFileName('')
    setAttachmentError('')
    setShowAttachment(false)
    setIsTyping(true)
    const agentMsg = await getAgentResponse(trimmed, untrustedList)
    setIsTyping(false)
    setMessages(prev => [...prev, agentMsg])
  }

  function handleSubmit(e: FormEvent) { e.preventDefault(); send(input) }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }
  function selectQuickPrompt(prompt: string) {
    setInput(prompt)
    inputRef.current?.focus()
  }

  async function handleAttachmentFile(file?: File) {
    if (!file) return
    if (file.size > 4 * 1024) {
      setAttachmentError('Choose a text file no larger than 4 KB, or paste the relevant invoice text.')
      return
    }
    if (!/\.(txt|md|csv|json)$/i.test(file.name)) {
      setAttachmentError('Supported files: .txt, .md, .csv, and .json. For PDFs, copy and paste the invoice text.')
      return
    }
    try {
      const content = await file.text()
      if (!content.trim()) {
        setAttachmentError('The selected file is empty. Choose a file with memo or invoice text.')
        return
      }
      if (`Attached file: ${file.name}\n${content.trim()}`.length > 4000) {
        setAttachmentError('The file text and filename must fit within 4,000 characters. Please shorten it or paste only the relevant details.')
        return
      }
      setAttachmentText(content)
      setAttachmentFileName(file.name)
      setAttachmentError('')
    } catch (error) {
      setAttachmentError(error instanceof Error ? `Unable to read file: ${error.message}` : 'Unable to read selected file.')
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[#FBFBFC] dark:bg-[#090e1a] transition-colors">
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} userProfile={userProfile} />)}
          {isTyping && <TypingIndicator />}
        </div>
        <div className="shrink-0 border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#0c1220] px-4 sm:px-6 py-3 space-y-2.5 transition-colors">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowQuickPrompts((visible) => !visible)}
              aria-expanded={showQuickPrompts}
              aria-controls="chat-quick-prompts"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Suggested prompts
              <Icon d={<path d="m9 18 6-6-6-6" />} size={12} className={`transition-transform ${showQuickPrompts ? 'rotate-90' : '-rotate-90'}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAttachment((prev) => !prev)
                setAttachmentError('')
              }}
              aria-expanded={showAttachment}
              aria-controls="chat-memo-panel"
              className={`inline-flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition ${showAttachment || attachmentText ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300' : 'border-dashed border-slate-300 text-slate-500 hover:border-amber-300 hover:text-amber-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-amber-300'}`}
            >
              <Icon d={Icons.paperclip} size={12} />
              <span className="truncate">{attachmentText ? (showAttachment ? 'Edit attached memo' : 'Memo attached · edit') : (showAttachment ? 'Close memo editor' : 'Add invoice / memo')}</span>
            </button>
            {attachmentText && (
              <span className="hidden truncate text-[10px] text-slate-500 dark:text-slate-400 sm:inline" title={attachmentFileName || 'Pasted memo'}>
                {attachmentFileName || `${attachmentText.trim().length.toLocaleString()} characters`}
              </span>
            )}
          </div>

          {showQuickPrompts && (
            <div id="chat-quick-prompts" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {quickPrompts.map(({ label, prompt }) => (
                <button
                  key={prompt}
                  type="button"
                  title={prompt}
                  onClick={() => selectQuickPrompt(prompt)}
                  className="min-w-0 truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold text-slate-600 transition hover:border-[#84CC16] hover:text-[#65A30D] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-lime-400"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {showAttachment && (
            <div id="chat-memo-panel" className="space-y-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3.5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/30 dark:to-slate-900 animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                    <Icon d={Icons.shield} size={14} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{attachmentText ? 'Invoice / memo attached' : 'Add invoice or memo'}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">This text is untrusted and will be checked before the agent plans your request.</p>
                  </div>
                </div>
                {attachmentText && (
                  <button
                    type="button"
                    onClick={() => { setAttachmentText(''); setAttachmentFileName(''); setAttachmentError('') }}
                    className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  >
                    Remove memo
                  </button>
                )}
              </div>
              <textarea
                value={attachmentText}
                onChange={e => { setAttachmentText(e.target.value); setAttachmentFileName('') }}
                placeholder="Paste invoice details, payment reference, or context for your request…"
                rows={3}
                maxLength={4000}
                className="w-full resize-y rounded-xl border border-amber-200 bg-white p-3 text-xs leading-relaxed text-slate-800 placeholder:text-slate-400 shadow-inner focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-500/10 dark:border-amber-900/70 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json"
                  className="hidden"
                  onChange={(event) => { void handleAttachmentFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }}
                />
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[10px] font-bold text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/60"
                >
                  Choose text file
                </button>
                <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{attachmentText.length.toLocaleString()} / 4,000 characters</span>
              </div>
              {attachmentError && <p role="alert" className="text-[10px] font-semibold text-rose-700 dark:text-rose-300">{attachmentError}</p>}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea ref={inputRef} id="chat-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Describe a goal… e.g. 'Swap 20 USDC to ETH' or 'Pay invoice'"
                rows={1} disabled={isTyping}
                className="w-full resize-none rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 pr-10 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#84CC16] focus:bg-white dark:focus:bg-slate-900/90 focus:ring-4 focus:ring-lime-500/10 outline-none transition disabled:opacity-60 leading-6"
                style={{ minHeight: '48px', maxHeight: '120px' }}
                onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px` }}
              />
              <div className="absolute right-3 bottom-3"><Icon d={Icons.lock} size={12} className="text-slate-300 dark:text-slate-600" /></div>
            </div>
            <button type="submit" disabled={isTyping || !input.trim()} className="w-12 h-12 rounded-2xl bg-slate-900 dark:bg-[#84CC16] text-white dark:text-slate-950 flex items-center justify-center hover:bg-black dark:hover:bg-[#65A30D] dark:hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0" aria-label="Send message">
              {isTyping ? <span className="w-4 h-4 rounded-full border-2 border-white dark:border-slate-950 border-t-transparent animate-spin" /> : <Icon d={Icons.send} size={16} />}
            </button>
          </form>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Icon d={Icons.shield} size={11} className="text-[#84CC16]" />
            Every action validated by deterministic policy before signing.
            <span className="ml-1 text-slate-300 dark:text-slate-600">Enter to send · Shift+Enter for new line</span>
          </p>
        </div>
      </div>
      <ContextPanel key={isAuthenticated ? userProfile.walletAddress || 'signed-in' : 'guest'} width={contextPanelWidth} onResizeStart={handleContextResizeStart} userProfile={userProfile} isAuthenticated={isAuthenticated} />
    </div>
  )
}
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { UserProfile } from '../../types'

interface BalanceCard { kind: 'balance'; eth: string; usdc: string; total: string; change: string }
interface TransactionCard { kind: 'transaction'; status: 'confirmed' | 'pending' | 'blocked'; type: string; amount: string; to: string; hash?: string; reason?: string }
interface PolicyCard { kind: 'policy'; perTxCap: string; dailyCap: string; usedToday: string; autonomyLevel: string }
interface ApprovalCard { kind: 'approval'; description: string; amount: string; expires: string; approvalId?: string; onApprove?: () => void; onReject?: () => void }
interface SwapCard { kind: 'swap'; from: string; to: string; amount: string; rate: string; status: 'proposed' | 'approved' | 'blocked' }
type RichCard = BalanceCard | TransactionCard | PolicyCard | ApprovalCard | SwapCard
type MessageRole = 'user' | 'agent' | 'system'
interface ToolCall { name: string; status: 'running' | 'done' | 'failed'; detail?: string }
interface Message { id: string; role: MessageRole; text?: string; untrusted?: string[]; cards?: RichCard[]; toolCalls?: ToolCall[]; ts: Date }
interface GoalIntentSummary { action?: string; amount?: string | null; token?: string; recipient?: string | null }
interface GoalApiResponse {
  status?: string
  txHash?: string
  reason?: string
  error?: string
  code?: string
  intent?: GoalIntentSummary
  data?: { balanceEth?: string; balanceUsdc?: string }
  approvalId?: string
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
          <p className="text-[10px] font-bold uppercase tracking-wider text-lime-50/80 font-mono">Guarded wallet · Sepolia</p>
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
  const hasSession = Boolean(window.sessionStorage.getItem('bambooleaf-device-session'))
  const [status, setStatus] = useState<'checking' | 'idle' | 'loading' | 'approved' | 'rejected' | 'closed' | 'error'>(
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
  const approvalHeaders = () => {
    const token = window.sessionStorage.getItem('bambooleaf-device-session')
    if (!token) throw new Error('Sign in with your wallet before managing approvals.')
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  useEffect(() => {
    let active = true
    if (!card.approvalId) return
    const token = window.sessionStorage.getItem('bambooleaf-device-session')
    if (!token) return
    fetch(`${apiBaseUrl}/approvals`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const data: { approvals?: Array<{ approvalId?: string }>; error?: string } = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not verify approval status.')
        if (!Array.isArray(data.approvals)) throw new Error('Approval status response was invalid.')
        return data.approvals.some((approval) => approval.approvalId === card.approvalId)
      })
      .then((isPending) => {
        if (active) setStatus(isPending ? 'idle' : 'closed')
      })
      .catch((error: unknown) => {
        if (!active) return
        setErrorMessage(error instanceof Error ? error.message : 'Could not verify approval status.')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [card.approvalId])

  const handleApprove = async () => {
    if (!card.approvalId) {
      setErrorMessage('Approval ID is missing. Submit the transaction again.')
      setStatus('error')
      return
    }
    setStatus('loading')
    try {
      const res = await fetch(`${apiBaseUrl}/approvals/${card.approvalId}/approve`, {
        method: 'POST',
        headers: approvalHeaders(),
      })
      const data = await res.json()
      if (res.ok && data.status === 'confirmed') {
        setTxHash(typeof data.txHash === 'string' ? data.txHash : null)
        setStatus('approved')
        card.onApprove?.()
      } else {
        setErrorMessage(data.error || `Approval failed with status ${res.status}.`)
        setStatus('error')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not reach the approval service.')
      setStatus('error')
    }
  }

  const handleReject = async () => {
    if (!card.approvalId) {
      setErrorMessage('Approval ID is missing. Submit the transaction again.')
      setStatus('error')
      return
    }
    setStatus('loading')
    try {
      const res = await fetch(`${apiBaseUrl}/approvals/${card.approvalId}/reject`, {
        method: 'POST',
        headers: approvalHeaders(),
      })
      const data = await res.json()
      if (!res.ok || data.status !== 'rejected') {
        throw new Error(data.error || 'Backend did not reject the approval.')
      }
      setStatus('rejected')
      card.onReject?.()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not reject the approval.')
      setStatus('error')
    }
  }

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
      {status === 'idle' && (
        <div className="flex gap-2 mt-3">
          <button onClick={handleApprove} className="flex-1 bg-slate-900 hover:bg-black dark:bg-lime-400 dark:hover:bg-lime-300 text-white dark:text-slate-950 rounded-xl py-2 text-[11px] font-bold transition flex items-center justify-center gap-1.5 font-display"><Icon d={Icons.check} size={12} /> Approve</button>
          <button onClick={handleReject} className="flex-1 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-xl py-2 text-[11px] font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1.5 font-display"><Icon d={Icons.x} size={12} /> Reject</button>
        </div>
      )}
      {(status === 'checking' || status === 'loading') && (
        <div className="mt-3 rounded-xl py-2 flex justify-center items-center text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
          <span className="w-3 h-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin mr-2" />
          {status === 'checking' ? 'Checking approval status...' : 'Processing...'}
        </div>
      )}
      {status === 'approved' && <div className="mt-3 rounded-xl py-2 text-center text-[11px] font-bold bg-lime-50 dark:bg-lime-950/60 text-[#65A30D] dark:text-lime-400">✓ Transaction confirmed{txHash ? <span className="mt-1 block break-all font-mono text-[10px]">{txHash}</span> : null}</div>}
      {status === 'rejected' && <div className="mt-3 rounded-xl py-2 text-center text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">✗ Transaction rejected</div>}
      {status === 'closed' && <div className="mt-3 rounded-xl py-2 text-center text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">This approval is no longer pending. Check the Approval Queue for its latest status.</div>}
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
          <div className="mt-1.5 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] max-w-full">
            <Icon d={Icons.paperclip} size={12} className="shrink-0" />
            <span className="font-semibold shrink-0">Attached memo:</span>
            <span className="truncate italic">{msg.untrusted.join('; ')}</span>
          </div>
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

function ContextPanel({ width, onResizeStart, userProfile }: { width: number; onResizeStart: (e: React.MouseEvent) => void; userProfile?: UserProfile }) {
  const [walletData, setWalletData] = useState<{ balanceEth: string; balanceUsdc: string } | null>(null)
  const apiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '')

  useEffect(() => {
    fetch(`${apiUrl}/wallet/balance`)
      .then(res => res.json() as Promise<{ balanceEth: string; balanceUsdc: string }>)
      .then(data => setWalletData(data))
      .catch(console.error)
  }, [apiUrl])

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
                <p className="text-2xl font-extrabold mt-1 tracking-tight">
                  {walletData ? `${walletData.balanceEth} ETH` : 'Loading...'}
                </p>
                <div className="flex gap-4 mt-3 text-[11px]">
                  <div><p className="text-lime-50/70">ETH</p><p className="font-bold">{walletData ? walletData.balanceEth : '-'}</p></div>
                  <div><p className="text-lime-50/70">USDC</p><p className="font-bold">{walletData ? walletData.balanceUsdc : '-'}</p></div>
                </div>
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
          <div className="flex items-center justify-between mb-2.5"><p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Pending approvals</p><span className="bg-amber-400 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">0</span></div>
          <p className="text-[11px] text-slate-400">No pending approvals</p>
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

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '')

async function getAgentResponse(userText: string, untrusted?: string[]): Promise<Message> {
  const id = crypto.randomUUID()
  try {
    const payload: { goal: string; untrusted?: string[] } = { goal: userText }
    if (untrusted && untrusted.length > 0) {
      payload.untrusted = untrusted
    }
    const res = await fetch(`${apiBaseUrl}/goal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json().catch(() => null) as GoalApiResponse | null

    if (data) {
      if (data.status === 'success' && data.data) {
        return {
          id, role: 'agent',
          text: "Here's your current guarded wallet balance:",
          toolCalls: [{ name: 'wallet.getBalance()', status: 'done' as const, detail: `${data.data.balanceEth} ETH, ${data.data.balanceUsdc} USDC` }],
          cards: [{ kind: 'balance', eth: `${data.data.balanceEth} ETH`, usdc: `${data.data.balanceUsdc} USDC`, total: `${data.data.balanceEth} ETH`, change: '+0.00%' } as BalanceCard],
          ts: new Date(),
        }
      }

      if (data.status === 'approval_required') {
        const approvalId = data.approvalId || data.approval?.id
        return {
          id, role: 'agent',
          text: `This transaction requires your manual approval (T2).`,
          toolCalls: [{ name: 'policy.validate(intent)', status: 'done' as const, detail: 'T2 required' }],
          cards: [{ 
            kind: 'approval', 
            description: `Transaction to ${data.intent?.recipient || 'recipient'}`, 
            amount: `${data.intent?.amount} ${data.intent?.token}`, 
            expires: 'in 5 min',
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
  } catch (error) {
    return {
      id, role: 'agent',
      text: `⚠ ${error instanceof Error ? error.message : 'Backend unreachable or request timed out. Please check your server.'}`,
      toolCalls: [{ name: 'network.request()', status: 'failed' as const, detail: 'Connection failed' }],
      ts: new Date(),
    }
  }
  
  return {
    id, role: 'agent',
    text: `I couldn't process that request.`,
    toolCalls: [{ name: 'agent.process()', status: 'failed' as const, detail: 'Unknown response' }],
    ts: new Date(),
  }
}

const quickPrompts = ['Check my balance', 'Swap 20 USDC to ETH', 'Send 0.01 ETH to 0xe2463837df0a08d3d1728a0cef444a57a879b1dd', 'Show policy limits']

interface ChatPageProps {
  userProfile?: UserProfile
}

export default function ChatPage({ userProfile: propProfile }: ChatPageProps = {}) {
  const [storedUserProfile] = useState<UserProfile>(() => {
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
  const [showAttachment, setShowAttachment] = useState(false)
  const [attachmentText, setAttachmentText] = useState('')
  const [contextPanelWidth, setContextPanelWidth] = useState(280)
  const contextResizing = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isTyping])

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

    const untrustedList = untrustedTrimmed ? [untrustedTrimmed] : undefined

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
      untrusted: untrustedList,
      ts: new Date(),
    }])
    setInput('')
    setAttachmentText('')
    setShowAttachment(false)
    setIsTyping(true)
    const agentMsg = await getAgentResponse(trimmed, untrustedList)
    setIsTyping(false)
    setMessages(prev => [...prev, agentMsg])
  }

  function handleSubmit(e: FormEvent) { e.preventDefault(); send(input) }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }

  return (
    <div className="flex h-full overflow-hidden bg-[#FBFBFC] dark:bg-[#090e1a] transition-colors">
      <div className="flex flex-col flex-1 h-full min-w-0">
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} userProfile={userProfile} />)}
          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#0c1220] px-4 sm:px-6 py-4 space-y-3 transition-colors">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map(p => (
                <button key={p} onClick={() => send(p)} disabled={isTyping} className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-full px-3 py-1.5 hover:border-[#84CC16] hover:text-[#65A30D] dark:hover:text-lime-400 transition disabled:opacity-50">{p}</button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowAttachment(prev => !prev)}
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-3 py-1.5 transition ${showAttachment ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border border-dashed border-slate-300 dark:border-slate-700'}`}
            >
              <Icon d={Icons.paperclip} size={12} />
              {showAttachment ? 'Close memo' : 'Attach invoice / memo'}
            </button>
          </div>

          {showAttachment && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <Icon d={Icons.shield} size={13} className="text-amber-600 dark:text-amber-400" />
                  Untrusted Content · Inspected by Quarantine
                </span>
                <button type="button" onClick={() => { setShowAttachment(false); setAttachmentText('') }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold">
                  ✕ Cancel
                </button>
              </div>
              <textarea
                value={attachmentText}
                onChange={e => setAttachmentText(e.target.value)}
                placeholder="Paste invoice text, memo, or external payment details to be inspected before planning..."
                rows={2}
                maxLength={2000}
                className="w-full resize-none rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-white dark:bg-slate-900 p-2.5 text-xs font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
              <p className="text-[10px] text-amber-800/80 dark:text-amber-400/80 font-medium">
                Quarantine guard blocks prompt injection or malicious transaction commands.
              </p>
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
      <ContextPanel width={contextPanelWidth} onResizeStart={handleContextResizeStart} userProfile={userProfile} />
    </div>
  )
}
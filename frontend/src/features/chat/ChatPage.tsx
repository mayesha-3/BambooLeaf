import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

interface BalanceCard { kind: 'balance'; eth: string; usdc: string; total: string; change: string }
interface TransactionCard { kind: 'transaction'; status: 'confirmed' | 'pending' | 'blocked'; type: string; amount: string; to: string; hash?: string; reason?: string }
interface PolicyCard { kind: 'policy'; perTxCap: string; dailyCap: string; usedToday: string; autonomyLevel: string }
interface ApprovalCard { kind: 'approval'; description: string; amount: string; expires: string; onApprove?: () => void; onReject?: () => void }
interface SwapCard { kind: 'swap'; from: string; to: string; amount: string; rate: string; status: 'proposed' | 'approved' | 'blocked' }
type RichCard = BalanceCard | TransactionCard | PolicyCard | ApprovalCard | SwapCard
type MessageRole = 'user' | 'agent' | 'system'
interface ToolCall { name: string; status: 'running' | 'done' | 'failed'; detail?: string }
interface Message { id: string; role: MessageRole; text?: string; cards?: RichCard[]; toolCalls?: ToolCall[]; ts: Date }

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
  const [voted, setVoted] = useState<'approved' | 'rejected' | null>(null)
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
      {!voted ? (
        <div className="flex gap-2 mt-3">
          <button onClick={() => { setVoted('approved'); card.onApprove?.() }} className="flex-1 bg-slate-900 hover:bg-black dark:bg-lime-400 dark:hover:bg-lime-300 text-white dark:text-slate-950 rounded-xl py-2 text-[11px] font-bold transition flex items-center justify-center gap-1.5 font-display"><Icon d={Icons.check} size={12} /> Approve</button>
          <button onClick={() => { setVoted('rejected'); card.onReject?.() }} className="flex-1 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-xl py-2 text-[11px] font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1.5 font-display"><Icon d={Icons.x} size={12} /> Reject</button>
        </div>
      ) : (
        <div className={`mt-3 rounded-xl py-2 text-center text-[11px] font-bold ${voted === 'approved' ? 'bg-lime-50 dark:bg-lime-950/60 text-[#65A30D] dark:text-lime-400' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'}`}>{voted === 'approved' ? '✓ Transaction approved' : '✗ Transaction rejected'}</div>
      )}
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

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  if (msg.role === 'system') return (
    <div className="flex justify-center py-1">
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">{msg.text}</span>
    </div>
  )
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <div className="w-8 h-8 rounded-2xl bg-[#F0FDF4] dark:bg-lime-950/40 border border-lime-100 dark:border-lime-900/50 flex items-center justify-center shrink-0 mt-1 shadow-sm"><Icon d={Icons.spark} size={16} className="text-[#65A30D] dark:text-lime-400" /></div>}
      {isUser && <div className="w-8 h-8 rounded-2xl bg-slate-900 dark:bg-lime-400 flex items-center justify-center shrink-0 mt-1 shadow-sm"><span className="text-white dark:text-black text-xs font-extrabold">M</span></div>}
      <div className={`flex-1 max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{isUser ? 'You' : 'BambooLeaf Agent'}</span>
          <span className="text-[10px] text-slate-300 dark:text-slate-600">{msg.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {msg.text && <div className={`px-4 py-3 rounded-2xl text-xs leading-relaxed font-medium ${isUser ? 'bg-slate-900 dark:bg-[#84CC16] text-white dark:text-slate-950 rounded-tr-sm' : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-100 shadow-sm rounded-tl-sm'}`}>{msg.text}</div>}
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

function ContextPanel({ width, onResizeStart }: { width: number; onResizeStart: (e: React.MouseEvent) => void }) {
  return (
    <aside className="hidden xl:flex flex-col shrink-0 border-l border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#0c1220] overflow-y-auto relative transition-colors" style={{ width }}>
      {/* Resize handle */}
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
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">Wallet</p>
          <div className="rounded-2xl p-4 text-white overflow-hidden relative shadow-sm" style={{ background: 'linear-gradient(135deg, #82C91E 0%, #65A30D 100%)' }}>
            {/* Decorative background pattern */}
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
                <p className="text-2xl font-extrabold mt-1 tracking-tight">$2,840.60</p>
                <div className="flex gap-4 mt-3 text-[11px]">
                  <div><p className="text-lime-50/70">ETH</p><p className="font-bold">0.72 ETH</p></div>
                  <div><p className="text-lime-50/70">USDC</p><p className="font-bold">$1,079.43</p></div>
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
          <div className="flex items-center justify-between mb-2.5"><p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Pending approvals</p><span className="bg-amber-400 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">2</span></div>
          <div className="space-y-2">
            {[{ label: 'Swap 12 USDC → ETH', sub: 'T2 · expires in 4 min', urgent: true }, { label: 'Transfer 0.005 ETH', sub: 'T2 · Pending review', urgent: false }].map((item, i) => (
              <div key={i} className={`rounded-xl p-3 border ${item.urgent ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50' : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800'}`}>
                <p className={`text-[11px] font-bold ${item.urgent ? 'text-amber-900 dark:text-amber-300' : 'text-slate-800 dark:text-slate-200'}`}>{item.label}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">Active guardrails</p>
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 p-4 space-y-3">
            <div>
              <div className="flex justify-between text-[11px] mb-1.5"><span className="text-slate-500 dark:text-slate-400 font-medium">Daily cap used</span><span className="font-bold text-slate-900 dark:text-white">$65.40 / $150</span></div>
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-[#84CC16]" style={{ width: '43.6%' }} /></div>
            </div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-500 dark:text-slate-400 font-medium">Per-tx max</span><span className="font-bold text-slate-900 dark:text-white">$25.00</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-slate-500 dark:text-slate-400 font-medium">Autonomy level</span><span className="font-bold text-[#65A30D] dark:text-lime-400">L2 · Standard</span></div>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">Recent actions</p>
          <div className="space-y-1.5">
            {[{ text: 'Balance checked', time: '2 min ago', tone: 'green' }, { text: 'Policy validated', time: '18 min ago', tone: 'green' }, { text: 'Transfer confirmed', time: '1 hr ago', tone: 'green' }, { text: 'Recipient blocked', time: 'Yesterday', tone: 'red' }].map((item, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.tone === 'green' ? 'bg-[#84CC16]' : 'bg-rose-400'}`} /><span className="text-slate-700 dark:text-slate-300 font-medium">{item.text}</span></div>
                <span className="text-slate-400 dark:text-slate-500">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

const demoMessages: Message[] = [
  { id: '0', role: 'system', text: 'BambooLeaf Agent connected · Sepolia testnet · Policy active', ts: new Date(Date.now() - 300000) },
  { id: '1', role: 'user', text: 'Check my wallet balance', ts: new Date(Date.now() - 290000) },
  { id: '2', role: 'agent', text: "Here's your current guarded wallet balance on Sepolia testnet:", toolCalls: [{ name: 'wallet.getBalance()', status: 'done', detail: '0.72 ETH, 1079.43 USDC' }], cards: [{ kind: 'balance', eth: '0.72 ETH', usdc: '$1,079.43', total: '$2,840.60', change: '+2.4%' } as BalanceCard], ts: new Date(Date.now() - 288000) },
  { id: '3', role: 'user', text: 'What are my current spending limits?', ts: new Date(Date.now() - 180000) },
  { id: '4', role: 'agent', text: "Your deterministic policy limits are active. All transactions are validated before signing:", toolCalls: [{ name: 'policy.getLimits()', status: 'done', detail: 'perTx: $25, daily: $150' }], cards: [{ kind: 'policy', perTxCap: '$25.00', dailyCap: '$150.00', usedToday: '$65.40', autonomyLevel: 'L2 · Standard' } as PolicyCard], ts: new Date(Date.now() - 178000) },
  { id: '5', role: 'user', text: 'Swap 12 USDC to ETH', ts: new Date(Date.now() - 60000) },
  { id: '6', role: 'agent', text: "This swap exceeds the auto-approve threshold ($10), so it needs your T2 approval:", toolCalls: [{ name: 'policy.validate(swap)', status: 'done', detail: 'T2 required' }, { name: 'swap.quote(12 USDC → ETH)', status: 'done', detail: '1 ETH = $2,490.11' }], cards: [{ kind: 'swap', from: 'USDC', to: 'ETH', amount: '12', rate: '1 ETH = $2,490.11', status: 'proposed' } as SwapCard, { kind: 'approval', description: 'Swap 12 USDC → ETH on Uniswap v3 · Sepolia', amount: '$12.00', expires: 'in 4 min' } as ApprovalCard], ts: new Date(Date.now() - 18000) },
]

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '')

async function getAgentResponse(userText: string): Promise<Message> {
  const lower = userText.toLowerCase()
  const id = crypto.randomUUID()
  try {
    const res = await fetch(`${apiBaseUrl}/goal`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ goal: userText }), signal: AbortSignal.timeout(6000) })
    if (res.ok) {
      const data = await res.json() as { status?: string; txHash?: string; reason?: string; error?: string; code?: string }
      // Handle typed planner failure codes
      if (data.status === 'blocked' && data.code) {
        const codeMessages: Record<string, string> = {
          UNTRUSTED_CONTENT_FLAGGED: 'The attached document was flagged as potentially malicious and blocked. No transaction was executed.',
          QUARANTINE_FAILED: 'Security quarantine check could not complete. Please try again.',
          INPUT_INVALID: 'Your goal text is invalid — it may be empty, too long, or contain unsupported characters.',
          MODEL_REFUSED: 'The AI planner refused this request. The action may be unsupported or out of scope.',
          INVALID_OUTPUT: 'The AI planner returned a malformed response. Please try rephrasing your goal.',
          UNGROUNDED_RECIPIENT: 'The recipient address could not be verified from your input.',
          UNKNOWN_CONTACT: 'The named contact was not found in your address book.',
          PROVIDERS_UNAVAILABLE: 'AI providers are temporarily unreachable. Please try again in a moment.',
          BUDGET_EXCEEDED: 'Token or quota limit for this planning session was exceeded.',
        }
        return { id, role: 'agent', text: `⚠ ${codeMessages[data.code] || data.error || 'Blocked, nothing executed.'}`, toolCalls: [{ name: 'planner.evaluate(goal)', status: 'failed' as const, detail: data.code }], ts: new Date() }
      }
      return { id, role: 'agent', text: data.txHash ? `Transaction confirmed! Hash: ${data.txHash}` : data.reason || `Status: ${data.status ?? 'submitted'}`, cards: data.txHash ? [{ kind: 'transaction', status: 'confirmed', type: 'Goal execution', amount: '', to: data.txHash, hash: data.txHash } as TransactionCard] : undefined, ts: new Date() }
    }
  } catch { /* fall through */ }
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 800))
  if (lower.includes('balance') || lower.includes('wallet')) return { id, role: 'agent', text: "Here's your current guarded wallet balance:", toolCalls: [{ name: 'wallet.getBalance()', status: 'done', detail: '0.72 ETH, 1079.43 USDC' }], cards: [{ kind: 'balance', eth: '0.72 ETH', usdc: '$1,079.43', total: '$2,840.60', change: '+2.4%' } as BalanceCard], ts: new Date() }
  if (lower.includes('swap') || lower.includes('usdc')) { const amt = userText.match(/\d+\.?\d*/)?.[0] ?? '20'; return { id, role: 'agent', text: `Swap of ${amt} USDC requires T2 approval:`, toolCalls: [{ name: 'policy.validate(swap)', status: 'done', detail: 'T2 required' }, { name: `swap.quote(${amt} USDC → ETH)`, status: 'done', detail: '1 ETH = $2,490.11' }], cards: [{ kind: 'swap', from: 'USDC', to: 'ETH', amount: amt, rate: '1 ETH = $2,490.11', status: 'proposed' } as SwapCard, { kind: 'approval', description: `Swap ${amt} USDC → ETH on Uniswap v3`, amount: `$${amt}.00`, expires: 'in 5 min' } as ApprovalCard], ts: new Date() } }
  if (lower.includes('send') || lower.includes('transfer')) { const amt = userText.match(/\d+\.?\d*/)?.[0] ?? '0.01'; const blocked = parseFloat(amt) > 0.5; return { id, role: 'agent', text: blocked ? `⚠ Transfer blocked — exceeds per-tx cap ($25.00).` : `Transfer validated and signed successfully.`, toolCalls: [{ name: 'policy.validate(transfer)', status: blocked ? 'failed' : 'done', detail: blocked ? 'Exceeds per-tx cap' : 'All checks passed' }, ...(!blocked ? [{ name: 'signer.sign(tx)', status: 'done' as const, detail: 'Confirmed' }] : [])], cards: [{ kind: 'transaction', status: blocked ? 'blocked' : 'confirmed', type: `Transfer ${amt} ETH`, amount: `${amt} ETH`, to: '0x3C44…93BC', hash: blocked ? undefined : '0x7a3b…f291', reason: blocked ? 'Exceeds per-transaction cap ($25.00)' : undefined } as TransactionCard], ts: new Date() } }
  if (lower.includes('policy') || lower.includes('limit')) return { id, role: 'agent', text: "Your active deterministic policy limits:", toolCalls: [{ name: 'policy.getLimits()', status: 'done', detail: 'perTx: $25, daily: $150' }], cards: [{ kind: 'policy', perTxCap: '$25.00', dailyCap: '$150.00', usedToday: '$65.40', autonomyLevel: 'L2 · Standard' } as PolicyCard], ts: new Date() }
  return { id, role: 'agent', text: `I understand: "${userText}". Analyzing against policy limits… (Demo mode — backend not reachable)`, toolCalls: [{ name: 'policy.validate(goal)', status: 'done', detail: 'Checks passed' }], ts: new Date() }
}

const quickPrompts = ['Check my balance', 'Swap 20 USDC to ETH', 'Send 0.01 ETH to Mayesha', 'Show policy limits']

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(demoMessages)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [contextPanelWidth, setContextPanelWidth] = useState(280)
  const contextResizing = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isTyping])

  // Right panel resize handler
  const handleContextResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    contextResizing.current = true
    const startX = e.clientX
    const startWidth = contextPanelWidth

    const onMove = (ev: MouseEvent) => {
      if (!contextResizing.current) return
      // Dragging left makes the panel wider
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
    if (!trimmed || isTyping) return
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: trimmed, ts: new Date() }])
    setInput('')
    setIsTyping(true)
    const agentMsg = await getAgentResponse(trimmed)
    setIsTyping(false)
    setMessages(prev => [...prev, agentMsg])
  }

  function handleSubmit(e: FormEvent) { e.preventDefault(); send(input) }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }

  return (
    <div className="flex h-full overflow-hidden bg-[#FBFBFC] dark:bg-[#090e1a] transition-colors">
      <div className="flex flex-col flex-1 h-full min-w-0">
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#0c1220] px-4 sm:px-6 py-4 space-y-3 transition-colors">
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map(p => (
              <button key={p} onClick={() => send(p)} disabled={isTyping} className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-full px-3 py-1.5 hover:border-[#84CC16] hover:text-[#65A30D] dark:hover:text-lime-400 transition disabled:opacity-50">{p}</button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea ref={inputRef} id="chat-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Describe a goal… e.g. 'Swap 20 USDC to ETH' or 'Check my balance'"
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
      <ContextPanel width={contextPanelWidth} onResizeStart={handleContextResizeStart} />
    </div>
  )
}

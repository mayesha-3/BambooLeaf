import { useState, useEffect } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'

interface ApprovalItem {
  id: string
  action: string
  amount: string
  receive: string
  recipient: string
  risk: string
  reason: string
  secondsLeft: number
  tone: 'green' | 'amber' | 'rose'
  digest: string
  tier: 'Tier 2 · Owner Approval Required' | 'Tier 3 · High Value Multi-sig'
  calldata: string
}

const initialApprovals: ApprovalItem[] = [
  {
    id: 'ap-1042',
    action: 'Swap USDC → ETH',
    amount: '12.00 USDC',
    receive: '~0.0041 ETH',
    recipient: '0xe2463837df0a08d3d1728a0cef444a57a879b1dd',
    risk: 'T2 Policy Check',
    reason: 'Exceeds autonomous auto-swap threshold ($10.00). Slippage cap validated at 0.50%.',
    secondsLeft: 245,
    tone: 'amber',
    digest: '0xa7b98d249f01bb49858de59bbd8b9bc2b84a9e102fca9b1192',
    tier: 'Tier 2 · Owner Approval Required',
    calldata: '0x38ed1739000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48...',
  },
  {
    id: 'ap-1041',
    action: 'Transfer ETH',
    amount: '0.025 ETH',
    receive: 'External Recipient',
    recipient: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    risk: 'Unsaved Recipient',
    reason: 'Destination address is not present in saved contacts. Requires explicit approval before signer acts.',
    secondsLeft: 580,
    tone: 'rose',
    digest: '0xf41b9c77102eacb92019ffab52817d9834ba12891901eeaa83',
    tier: 'Tier 2 · Owner Approval Required',
    calldata: '0x',
  },
]

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>(initialApprovals)
  const [notice, setNotice] = useState<{ message: string; tone: 'green' | 'rose' } | null>(null)
  const [inspectingItem, setInspectingItem] = useState<ApprovalItem | null>(null)

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setItems((prev) =>
        prev
          .map((item) => ({ ...item, secondsLeft: Math.max(0, item.secondsLeft - 1) }))
          .filter((item) => item.secondsLeft > 0)
      )
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  function decide(item: ApprovalItem, approved: boolean) {
    setItems((current) => current.filter((it) => it.id !== item.id))
    if (approved) {
      setNotice({
        message: `✓ Approval confirmed for ${item.id}. Transaction digest signed: ${item.digest.slice(0, 16)}…`,
        tone: 'green',
      })
    } else {
      setNotice({
        message: `✗ Action ${item.id} rejected. Signer request invalidated and audit log recorded.`,
        tone: 'rose',
      })
    }
    setInspectingItem(null)
  }

  function resetDemoQueue() {
    setItems([
      ...initialApprovals,
      {
        id: `ap-${Math.floor(1000 + Math.random() * 9000)}`,
        action: 'Approve USDC Spend',
        amount: '50.00 USDC',
        receive: 'Uniswap V2 Router',
        recipient: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        risk: 'Allowance Grant',
        reason: 'ERC-20 token spend allowance request. Strict allowance matching transaction amount only.',
        secondsLeft: 300,
        tone: 'green',
        digest: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        tier: 'Tier 2 · Owner Approval Required',
        calldata: '0x095ea7b30000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488d...',
      },
    ])
    setNotice(null)
  }

  return (
    <>
      <PageHeading
        eyebrow="Human in the loop"
        title="Approval Queue"
        description="Review planned agent transactions before the autonomous signer executes them."
        action={
          <Badge tone={items.length ? 'amber' : 'green'}>
            <Icon name="clock" size={12} /> {items.length} pending
          </Badge>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/40 p-4">
        <Icon name="eye" size={17} className="mt-0.5 shrink-0 text-blue-700 dark:text-blue-400" />
        <p className="text-xs leading-5 text-blue-900 dark:text-blue-200">
          <span className="font-bold">Explain before sign.</span> Every approval request is cryptographically bound to an exact transaction digest and expires automatically if not authorized within the window.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`mb-4 flex items-center justify-between rounded-2xl px-4 py-3 text-xs font-semibold ${
            notice.tone === 'green'
              ? 'bg-lime-50 dark:bg-lime-950/50 text-[#65A30D] dark:text-lime-300 border border-lime-200 dark:border-lime-900/50'
              : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50'
          }`}
        >
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {items.length ? (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="p-6 transition hover:border-slate-300 dark:hover:border-slate-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-2xl ${
                      item.tone === 'green'
                        ? 'bg-lime-50 dark:bg-lime-950/50 text-[#65A30D] dark:text-lime-400'
                        : item.tone === 'rose'
                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    <Icon name={item.action.startsWith('Swap') ? 'refresh' : 'send'} />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">{item.action}</h2>
                      <Badge tone={item.tone}>{item.risk}</Badge>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {item.tier}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Requested {item.id} ·{' '}
                      <span className="text-amber-700 dark:text-amber-400 font-semibold font-mono">
                        Expires in {formatTime(item.secondsLeft)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">You send</p>
                  <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">{item.amount}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected outcome</p>
                  <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{item.receive}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destination</p>
                  <p className="mt-1 break-all text-xs font-mono font-bold text-slate-800 dark:text-slate-100">
                    {item.recipient}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-2.5 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5">
                <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-[#65A30D] dark:text-lime-400" />
                <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{item.reason}</p>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInspectingItem(inspectingItem?.id === item.id ? null : item)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1.5"
                >
                  <Icon name="terminal" size={13} />
                  {inspectingItem?.id === item.id ? 'Hide transaction digest' : 'Inspect transaction digest'}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => decide(item, false)}
                    className="rounded-full border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => decide(item, true)}
                    className="rounded-full bg-slate-950 dark:bg-lime-400 dark:text-slate-950 dark:hover:bg-lime-300 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm transition"
                  >
                    Authorize & Sign
                  </button>
                </div>
              </div>

              {/* Transaction Digest Drawer */}
              {inspectingItem?.id === item.id && (
                <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-900 p-4 text-xs font-mono text-slate-100 space-y-2 animate-in fade-in duration-150">
                  <div className="flex justify-between items-center text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                    <span>EIP-712 Digest Authentication</span>
                    <span>Chain ID: 11155111 (Sepolia)</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Digest Hash: </span>
                    <span className="text-lime-400 break-all">{item.digest}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Calldata: </span>
                    <span className="text-slate-300 break-all">{item.calldata}</span>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-16 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-lime-50 dark:bg-lime-950/50 text-[#65A30D] dark:text-lime-400">
            <Icon name="checkCircle" size={20} />
          </span>
          <h2 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">Queue is clear</h2>
          <p className="mt-1 text-xs text-slate-400">There are no pending approvals requiring human review.</p>
          <button
            onClick={resetDemoQueue}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-lime-500 transition"
          >
            <Icon name="refresh" size={13} /> Reload Simulated Approvals
          </button>
        </Card>
      )}
    </>
  )
}

import { useEffect, useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'

interface ApprovalItem {
  approvalId: string
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
  chainId?: number
}

interface ApprovalRecord {
  approvalId: string
  digest: string
  expiresAt: number
  tier: string
  reasons: string[]
  intent: {
    action: string
    chainId?: number
    from?: { token?: string; amount?: string }
    to?: { token?: string }
    recipient?: string
  }
  txRequests: Array<{ to: string; data: string; description: string }>
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '')

function toApprovalItem(approval: ApprovalRecord): ApprovalItem {
  const { intent } = approval
  const fromToken = intent.from?.token ?? 'Unknown token'
  const amount = intent.from?.amount ?? 'Unknown amount'
  const action = intent.action === 'swap'
    ? `Swap ${fromToken} → ${intent.to?.token ?? 'unknown token'}`
    : `${intent.action === 'transfer' ? 'Transfer' : intent.action} ${amount} ${fromToken}`
  const destination = intent.recipient ?? approval.txRequests[0]?.to ?? 'Unknown recipient'

  return {
    approvalId: approval.approvalId,
    id: approval.approvalId.slice(0, 8),
    action,
    amount: `${amount} ${fromToken}`,
    receive: intent.to?.token ?? 'External Recipient',
    recipient: destination,
    risk: 'T2 Policy Check',
    reason: approval.reasons.join(' '),
    secondsLeft: Math.max(0, Math.ceil((approval.expiresAt - Date.now()) / 1000)),
    tone: 'amber',
    digest: approval.digest,
    tier: 'Tier 2 · Owner Approval Required',
    calldata: approval.txRequests.map((tx) => `${tx.description}: ${tx.data}`).join('\n'),
    chainId: intent.chainId,
  }
}

async function getPendingApprovals(): Promise<ApprovalItem[]> {
  const response = await fetch(`${apiBaseUrl}/approvals`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not load pending approvals.')
  return (data.approvals as ApprovalRecord[]).map(toApprovalItem)
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: 'green' | 'rose'; txHash?: string } | null>(null)
  const [inspectingItem, setInspectingItem] = useState<ApprovalItem | null>(null)

  useEffect(() => {
    let active = true
    getPendingApprovals()
      .then((approvals) => {
        if (active) setItems(approvals)
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load pending approvals.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function refreshApprovals() {
    setLoading(true)
    setLoadError(null)
    getPendingApprovals()
      .then(setItems)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Could not load pending approvals.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setItems((current) => current.map((item) => ({
        ...item,
        secondsLeft: Math.max(0, item.secondsLeft - 1),
      })))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  async function decide(item: ApprovalItem, approved: boolean) {
    setPendingActionId(item.approvalId)
    setNotice(null)
    try {
      const response = await fetch(`${apiBaseUrl}/approvals/${item.approvalId}/${approved ? 'approve' : 'reject'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      const expectedStatus = approved ? 'confirmed' : 'rejected'
      if (!response.ok || data.status !== expectedStatus) {
        throw new Error(data.error || `Approval request failed with status ${response.status}.`)
      }
      setItems((current) => current.filter((entry) => entry.approvalId !== item.approvalId))
      setNotice({
        message: approved
          ? `Transaction confirmed for approval ${item.id}.`
          : `Approval ${item.id} was rejected.`,
        tone: approved ? 'green' : 'rose',
        txHash: approved ? data.txHash : undefined,
      })
      setInspectingItem(null)
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : 'Approval request failed.',
        tone: 'rose',
      })
    } finally {
      setPendingActionId(null)
    }
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
          {notice.txHash && (
            <span className="ml-3 break-all font-mono text-[10px]">{notice.txHash}</span>
          )}
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <Card className="p-10 text-center text-sm text-slate-500">Loading pending approvals…</Card>
      ) : loadError ? (
        <Card className="p-10 text-center">
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
          <button onClick={refreshApprovals} className="mt-4 rounded-full border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold">
            Retry
          </button>
        </Card>
      ) : items.length ? (
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
                    type="button"
                    disabled={pendingActionId !== null}
                    onClick={() => decide(item, false)}
                    className="rounded-full border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    {pendingActionId === item.approvalId ? 'Processing…' : 'Reject'}
                  </button>
                  <button
                    type="button"
                    disabled={pendingActionId !== null}
                    onClick={() => decide(item, true)}
                    className="rounded-full bg-slate-950 dark:bg-lime-400 dark:text-slate-950 dark:hover:bg-lime-300 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm transition disabled:opacity-50"
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
                    <span>Chain ID: {item.chainId ?? 'unknown'}</span>
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
            onClick={refreshApprovals}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-lime-500 transition"
          >
            <Icon name="refresh" size={13} /> Refresh approvals
          </button>
        </Card>
      )}
    </>
  )
}

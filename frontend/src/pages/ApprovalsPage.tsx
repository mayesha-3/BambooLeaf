import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'
import { apiBaseUrl } from '../config/api'
import { authenticatedFetch } from '../lib/device-session'

interface ApprovalItem {
  id: string
  chainId: number
  nonce: number
  expiresAt: number
  action: string
  amount: string
  receive: string
  recipient: string
  risk: string
  reason: string
  tone: 'green' | 'amber' | 'rose'
  digest: string
  tier: 'Tier 2 · Owner Approval Required' | 'Tier 3 · High Value Multi-sig'
}

interface SupplierApprovalItem {
  supplierId: string
  name: string
  payoutAccount: string
  status: string
  requestedBy: string
  pendingChange?: { name: string; payoutAccount: string; requestedBy: string }
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [supplierItems, setSupplierItems] = useState<SupplierApprovalItem[]>([])
  const [role, setRole] = useState('')
  const [now, setNow] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ message: string; tone: 'green' | 'rose' } | null>(null)
  const [inspectingItem, setInspectingItem] = useState<ApprovalItem | null>(null)

  const loadApprovals = useCallback(async () => {
    const token = window.sessionStorage.getItem('bambooleaf-device-session')
    if (!token) {
      setError('Sign in with the owner wallet under Device Security to review approvals.')
      setLoading(false)
      return
    }
    try {
      const [response, supplierResponse] = await Promise.all([
        authenticatedFetch(`${apiBaseUrl}/approvals`, {
        headers: { Authorization: `Bearer ${token}` },
        }),
        authenticatedFetch(`${apiBaseUrl}/suppliers`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      const payload = await response.json() as {
        approvals?: Array<{
          approvalId: string
          digest: string
          chainId: number
          nonce: number
          expiresAt: number
          recipient?: string
          minimumOutput?: string
          intent: { action: string; from: { token: string; amount?: string }; to?: { token: string }; recipient?: string }
          reasons: string[]
        }>
        error?: string
      }
      if (!response.ok) throw new Error(payload.error || `Approval request failed (${response.status})`)
      const supplierPayload = await supplierResponse.json() as {
        suppliers?: SupplierApprovalItem[]
        role?: string
        error?: string
      }
      if (!supplierResponse.ok) throw new Error(supplierPayload.error || `Supplier approval request failed (${supplierResponse.status})`)
      setItems((payload.approvals || []).map((item) => ({
        id: item.approvalId,
        chainId: item.chainId,
        nonce: item.nonce,
        expiresAt: item.expiresAt,
        action: item.intent.action === 'swap'
          ? `Swap ${item.intent.from.token} → ${item.intent.to?.token ?? 'token'}`
          : `Transfer ${item.intent.from.token}`,
        amount: `${item.intent.from.amount ?? '—'} ${item.intent.from.token}`,
        receive: item.intent.action === 'swap'
          ? `At least ${item.minimumOutput ?? '—'} ${item.intent.to?.token ?? ''}`
          : 'Native ETH transfer',
        recipient: item.recipient || item.intent.recipient || 'Agent wallet',
        risk: 'Digest-bound approval',
        reason: item.reasons.join('; '),
        tone: 'amber',
        digest: item.digest,
        tier: 'Tier 2 · Owner Approval Required',
      })))
      setSupplierItems((supplierPayload.suppliers || []).filter((supplier) =>
        supplier.status === 'pending_approval' || Boolean(supplier.pendingChange)))
      setRole(supplierPayload.role || '')
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load approval requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialTime = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    const loadTimer = window.setTimeout(() => void loadApprovals(), 0)
    return () => {
      window.clearTimeout(initialTime)
      window.clearTimeout(loadTimer)
      clearInterval(timer)
    }
  }, [loadApprovals])

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  async function decide(item: ApprovalItem, approved: boolean) {
    const token = window.sessionStorage.getItem('bambooleaf-device-session')
    if (!token) {
      setError('Sign in with the owner wallet under Device Security before deciding.')
      return
    }
    setBusyId(item.id)
    setError('')
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/approvals/${item.id}/${approved ? 'approve' : 'reject'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json() as { txHash?: string; error?: string }
      if (!response.ok) throw new Error(payload.error || `Approval decision failed (${response.status})`)
      setNotice({
        message: approved
          ? `Approved exact digest ${item.digest.slice(0, 16)}…${payload.txHash ? ` · transaction ${payload.txHash}` : ''}`
          : `Approval ${item.id} was rejected.`,
        tone: approved ? 'green' : 'rose',
      })
      setInspectingItem(null)
      await loadApprovals()
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Unable to submit approval decision.')
    } finally {
      setBusyId('')
    }
  }
  async function approveSupplier(supplier: SupplierApprovalItem) {
    setBusyId(supplier.supplierId)
    setError('')
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/suppliers/${supplier.supplierId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || `Supplier approval failed (${response.status})`)
      setNotice({ message: `Supplier ${supplier.pendingChange?.name || supplier.name} verified for payments.`, tone: 'green' })
      await loadApprovals()
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Unable to approve supplier.')
    } finally {
      setBusyId('')
    }
  }
  const activeItems = items.filter((item) => item.expiresAt > now)

  return (
    <>
      <PageHeading
        eyebrow="Human in the loop"
        title="Approval Queue"
        description="Review planned agent transactions before the autonomous signer executes them."
        action={
          <Badge tone={error ? 'red' : activeItems.length ? 'amber' : 'green'}>
            <Icon name="clock" size={12} /> {error ? 'unavailable' : `${activeItems.length} pending`}
          </Badge>
        }
      />

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/40 p-4">
        <Icon name="eye" size={17} className="mt-0.5 shrink-0 text-blue-700 dark:text-blue-400" />
        <p className="text-xs leading-5 text-blue-900 dark:text-blue-200">
          <span className="font-bold">Explain before sign.</span> Native ETH transfers and token swaps can be approved here. Each digest expires after two minutes, and authorizing it submits the exact reviewed transaction after the signer rechecks its chain, nonce, simulation, and policy.
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

      {supplierItems.length > 0 && (
        <section className="mb-6 space-y-3" aria-label="Supplier registry approvals">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Supplier registry approvals</h2>
          <p className="text-xs text-slate-500">These requests verify supplier payout details; they are separate from transaction approvals.</p>
          {supplierItems.map((supplier) => {
            const change = supplier.pendingChange
            const requester = change?.requestedBy || supplier.requestedBy
            return (
              <Card key={supplier.supplierId} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{change?.name || supplier.name}</h3>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">{change?.payoutAccount || supplier.payoutAccount}</p>
                    <p className="mt-2 text-xs text-slate-500">Requested by {requester}. A different approver must verify this destination.</p>
                  </div>
                  {role === 'approver' ? (
                    <button
                      type="button"
                      disabled={busyId === supplier.supplierId}
                      onClick={() => void approveSupplier(supplier)}
                      className="rounded-full bg-lime-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {busyId === supplier.supplierId ? 'Approving…' : 'Verify supplier'}
                    </button>
                  ) : (
                    <div className="text-right">
                      <Badge tone="amber">Needs separate approver</Badge>
                      <p className="mt-2 max-w-xs text-xs text-slate-500">
                        Assign another wallet as an approver in Device Security, then sign in with that wallet to verify this supplier.
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </section>
      )}

      {activeItems.length || supplierItems.length ? (
        activeItems.length ? (
        <div className="space-y-4">
          {activeItems.map((item) => (
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
                        Expires in {formatTime(Math.ceil((item.expiresAt - now) / 1000))}
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
                    disabled={busyId === item.id}
                    onClick={() => decide(item, false)}
                    className="rounded-full border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    Reject
                  </button>
                  <button
                    disabled={busyId === item.id}
                    onClick={() => decide(item, true)}
                    className="rounded-full bg-slate-950 dark:bg-lime-400 dark:text-slate-950 dark:hover:bg-lime-300 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm transition"
                  >
                    {busyId === item.id ? 'Submitting…' : 'Authorize & Sign'}
                  </button>
                </div>
              </div>

              {/* Transaction Digest Drawer */}
              {inspectingItem?.id === item.id && (
                <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-900 p-4 text-xs font-mono text-slate-100 space-y-2 animate-in fade-in duration-150">
                  <div className="flex justify-between items-center text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                    <span>Keccak Transaction Digest</span>
                    <span>Chain ID: {item.chainId} · Nonce: {item.nonce}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Digest Hash: </span>
                    <span className="text-lime-400 break-all">{item.digest}</span>
                  </div>
                  <div><span className="text-slate-400">Expires at: </span><span>{new Date(item.expiresAt).toISOString()}</span></div>
                </div>
              )}
            </Card>
          ))}
        </div>
        ) : null
      ) : (
        <Card className="p-16 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-lime-50 dark:bg-lime-950/50 text-[#65A30D] dark:text-lime-400">
            <Icon name="checkCircle" size={20} />
          </span>
          <h2 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{loading ? 'Loading approvals…' : error ? 'Approvals unavailable' : 'Queue is clear'}</h2>
          <p className="mt-1 text-xs text-slate-400">{loading ? 'Checking the owner-authenticated approval queue.' : error ? 'Sign in with the configured owner wallet and confirm the backend is reachable.' : 'There are no pending approvals requiring human review.'}</p>
          <button
            onClick={() => void loadApprovals()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-lime-500 transition"
          >
            <Icon name="refresh" size={13} /> Refresh Approval Queue
          </button>
        </Card>
      )}
    </>
  )
}

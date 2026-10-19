import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Card from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import PageHeading from '../components/ui/PageHeading'
import { apiBaseUrl } from '../config/api'
import { authenticatedFetch, enrollOrLoginDevice } from '../lib/device-session'

type AuditEntry = {
  seq: number
  requestId: string
  type: string
  createdAt: string
  data: Record<string, unknown>
  hash: string
  prevHash: string
}

type PolicyVersion = {
  versionHash: string
  previousVersionHash: string | null
  changedFields: string[]
  snapshot: Record<string, unknown>
  createdAt: string
}

type ConsoleFilters = {
  decision: string
  tier: string
  layer: string
  from: string
  to: string
}

type InjectedWallet = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

const initialFilters: ConsoleFilters = {
  decision: 'all',
  tier: 'all',
  layer: 'all',
  from: '',
  to: '',
}

function filterQuery(filters: ConsoleFilters, limit = 100, beforeSeq?: number) {
  const query = new URLSearchParams({ ...filters, limit: String(limit) })
  if (beforeSeq !== undefined) query.set('beforeSeq', String(beforeSeq))
  return query.toString()
}

export default function ComplianceConsole() {
  const [token, setToken] = useState(() => window.sessionStorage.getItem('bambooleaf-device-session') || '')
  const [role, setRole] = useState('')
  const [filters, setFilters] = useState<ConsoleFilters>(initialFilters)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [autonomy, setAutonomy] = useState<AuditEntry[]>([])
  const [policies, setPolicies] = useState<PolicyVersion[]>([])
  const [nextBeforeSeq, setNextBeforeSeq] = useState<number | null>(null)
  const [chainResult, setChainResult] = useState<{ valid: boolean; checked: number; firstInvalidSeq?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  const requestHeaders = useCallback((sessionToken: string) => ({
    Authorization: `Bearer ${sessionToken}`,
  }), [])

  const loadConsole = useCallback(async (sessionToken: string, append = false, before?: number) => {
    setLoading(true)
    setError('')
    try {
      const query = filterQuery(filters, 100, before)
      const headers = requestHeaders(sessionToken)
      const [accessResponse, auditResponse, autonomyResponse, policyResponse] = await Promise.all([
        authenticatedFetch(`${apiBaseUrl}/audit/access`, { headers }),
        authenticatedFetch(`${apiBaseUrl}/audit?${query}`, { headers }),
        authenticatedFetch(`${apiBaseUrl}/audit/autonomy-history`, { headers }),
        authenticatedFetch(`${apiBaseUrl}/audit/policy-history`, { headers }),
      ])
      const [access, audit, autonomyHistory, policyHistory] = await Promise.all([
        accessResponse.json(),
        auditResponse.json(),
        autonomyResponse.json(),
        policyResponse.json(),
      ]) as [
        { role?: string; error?: string },
        { entries?: AuditEntry[]; nextBeforeSeq?: number | null; error?: string },
        { entries?: AuditEntry[]; error?: string },
        { versions?: PolicyVersion[]; error?: string },
      ]
      const failedResponse = [
        [accessResponse, access],
        [auditResponse, audit],
        [autonomyResponse, autonomyHistory],
        [policyResponse, policyHistory],
      ].find(([response]) => !(response as Response).ok)
      if (failedResponse) {
        const [response, payload] = failedResponse as [Response, { error?: string }]
        if (response.status === 401) {
          window.sessionStorage.removeItem('bambooleaf-device-session')
          setToken('')
        }
        throw new Error(payload.error || `Compliance API returned ${response.status}`)
      }
      if (!['admin', 'approver', 'auditor'].includes(access.role || '')) {
        throw new Error('The signed-in wallet does not have auditor or owner read access.')
      }
      setRole(access.role || '')
      setEntries((current) => append ? [...current, ...(audit.entries || [])] : audit.entries || [])
      setNextBeforeSeq(audit.nextBeforeSeq ?? null)
      setAutonomy(autonomyHistory.entries || [])
      setPolicies(policyHistory.versions || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load compliance records.')
    } finally {
      setLoading(false)
    }
  }, [filters, requestHeaders])

  useEffect(() => {
    if (token) void loadConsole(token)
  }, [token, loadConsole])

  async function connectAuditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const wallet = (window as Window & { ethereum?: InjectedWallet }).ethereum
      if (!wallet) throw new Error('No browser wallet was found.')
      const result = await enrollOrLoginDevice(wallet)
      if (result.status === 'pending' || !result.token) {
        setError('This wallet’s device access request is pending admin approval. It will remain pending until an admin approves it.')
        setLoading(false)
        return
      }
      setToken(result.token)
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Wallet sign-in failed.')
      setLoading(false)
    }
  }

  async function verifyChain() {
    if (!token) return
    setVerifying(true)
    setError('')
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/audit/verify`, { headers: requestHeaders(token) })
      const result = await response.json() as { valid?: boolean; checked?: number; firstInvalidSeq?: number; error?: string }
      if (!response.ok && response.status !== 409) throw new Error(result.error || `Verification failed (${response.status})`)
      setChainResult({
        valid: result.valid === true,
        checked: result.checked || 0,
        firstInvalidSeq: result.firstInvalidSeq,
      })
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify the audit chain.')
    } finally {
      setVerifying(false)
    }
  }

  async function downloadExport(format: 'json' | 'csv') {
    if (!token) return
    setError('')
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/audit/export?${filterQuery(filters, 1000)}` +
        `&format=${format}`, { headers: requestHeaders(token) })
      if (!response.ok) {
        const result = await response.json() as { error?: string }
        throw new Error(result.error || `Export failed (${response.status})`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `bambooleaf-audit.${format}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export audit records.')
    }
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (token) void loadConsole(token)
  }

  return (
    <>
      <PageHeading
        eyebrow="Read-only · auditor"
        title="Compliance Console"
        description="Browse tamper-evident audit records, verify the chain, and review autonomy and policy history. No policy or autonomy edits are available here."
        action={role ? <span className="rounded-full border border-lime-200 bg-lime-50 px-3 py-1.5 text-[11px] font-bold uppercase text-lime-800">{role} · read only</span> : null}
      />

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {!token ? (
        <Card className="mx-auto max-w-xl p-8">
          <h2 className="text-base font-bold">Sign in as an auditor</h2>
          <p className="mt-2 text-sm text-slate-500">Connect a wallet configured in the backend auditor allowlist. The owner wallet can also view this console. This session grants no policy-edit, freeze, or reset permission.</p>
          <form onSubmit={(event) => void connectAuditor(event)}>
            <button disabled={loading} className="mt-5 rounded-full bg-slate-950 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              {loading ? 'Connecting…' : 'Connect wallet for read access'}
            </button>
          </form>
        </Card>
      ) : (
        <>
          <Card className="mb-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold">Audit chain integrity</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {chainResult
                    ? chainResult.valid
                      ? `Valid · ${chainResult.checked} records verified`
                      : `Verification failed at sequence ${chainResult.firstInvalidSeq ?? 'unknown'}`
                    : 'Run a fresh verification against the full stored chain.'}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void verifyChain()} disabled={verifying} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                  <Icon name="shield" size={13} /> {verifying ? 'Verifying…' : 'Verify chain'}
                </button>
                <button type="button" onClick={() => void downloadExport('json')} className="rounded-full border px-4 py-2 text-xs font-bold">Export JSON</button>
                <button type="button" onClick={() => void downloadExport('csv')} className="rounded-full border px-4 py-2 text-xs font-bold">Export CSV</button>
              </div>
            </div>
          </Card>

          <Card className="mb-5 p-5">
            <h2 className="mb-3 text-sm font-bold">Audit browser</h2>
            <form onSubmit={submitFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <label className="text-xs font-semibold">Decision
                <select value={filters.decision} onChange={(event) => setFilters({ ...filters, decision: event.target.value })} className="mt-1 w-full rounded-lg border p-2">
                  {['all', 'blocked', 'denied', 'confirmed', 'approved', 'pending', 'info'].map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Tier
                <select value={filters.tier} onChange={(event) => setFilters({ ...filters, tier: event.target.value })} className="mt-1 w-full rounded-lg border p-2">
                  {['all', 'T1', 'T2', 'T3'].map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Blocked layer
                <select value={filters.layer} onChange={(event) => setFilters({ ...filters, layer: event.target.value })} className="mt-1 w-full rounded-lg border p-2">
                  {['all', 'quarantine', 'planner', 'policy', 'signer', 'approval', 'autonomy', 'system'].map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">From
                <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="mt-1 w-full rounded-lg border p-2" />
              </label>
              <label className="text-xs font-semibold">To
                <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="mt-1 w-full rounded-lg border p-2" />
              </label>
              <button disabled={loading} className="self-end rounded-lg bg-lime-600 p-2 text-xs font-bold text-white disabled:opacity-50">
                {loading ? 'Loading…' : 'Apply filters'}
              </button>
            </form>
          </Card>

          <Card className="mb-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{['Seq', 'Timestamp', 'Decision', 'Layer / Event', 'Tier', 'Details', 'Hash'].map((column) => <th key={column} className="p-3 font-bold">{column}</th>)}</tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.seq}-${entry.hash}`} className="border-t">
                    <td className="p-3 font-mono">{entry.seq}</td>
                    <td className="p-3 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="p-3">{entry.type.includes('denied') ? 'Denied' : /blocked|failed|stale/i.test(entry.type) ? 'Blocked' : /confirmed|executed/i.test(entry.type) ? 'Confirmed' : /requested|required/i.test(entry.type) ? 'Pending' : 'Info'}</td>
                    <td className="p-3"><div className="font-semibold">{entry.type}</div><div className="text-slate-500">{String(entry.data.code || '')}</div></td>
                    <td className="p-3">{String(entry.data.tier || '—')}</td>
                    <td className="max-w-md truncate p-3" title={JSON.stringify(entry.data)}>{JSON.stringify(entry.data)}</td>
                    <td className="p-3 font-mono">{entry.hash.slice(0, 14)}…</td>
                  </tr>
                ))}
                {!entries.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">{loading ? 'Loading records…' : 'No matching records.'}</td></tr>}
              </tbody>
            </table>
            {nextBeforeSeq !== null && <div className="border-t p-3 text-center"><button type="button" disabled={loading} onClick={() => void loadConsole(token, true, nextBeforeSeq)} className="rounded-full border px-4 py-2 text-xs font-bold">Load older records</button></div>}
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="overflow-x-auto p-5">
              <h2 className="mb-3 text-sm font-bold">Autonomy history</h2>
              <p className="mb-3 text-xs text-slate-500">Promotions, demotions, freezes, resets, and recorded causes.</p>
              <table className="w-full min-w-[500px] text-left text-xs">
                <thead><tr>{['Time', 'Event', 'Level change', 'Cause'].map((value) => <th className="p-2" key={value}>{value}</th>)}</tr></thead>
                <tbody>{autonomy.map((entry) => <tr key={entry.seq} className="border-t">
                  <td className="p-2 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="p-2">{entry.type}</td>
                  <td className="p-2">{String(entry.data.fromLevel || '—')} → {String(entry.data.toLevel || entry.data.level || '—')}</td>
                  <td className="p-2">{String(entry.data.reason || '—')}</td>
                </tr>)}
                {!autonomy.length && <tr><td colSpan={4} className="p-4 text-center text-slate-500">No autonomy history recorded.</td></tr>}</tbody>
              </table>
            </Card>

            <Card className="overflow-x-auto p-5">
              <h2 className="mb-3 text-sm font-bold">Policy version history</h2>
              <p className="mb-3 text-xs text-slate-500">Configuration snapshots are recorded when the backend starts with a changed policy.</p>
              <table className="w-full min-w-[500px] text-left text-xs">
                <thead><tr>{['Time', 'Version hash', 'Changed fields', 'Chain'].map((value) => <th className="p-2" key={value}>{value}</th>)}</tr></thead>
                <tbody>{policies.map((version) => <tr key={version.versionHash} className="border-t">
                  <td className="p-2 whitespace-nowrap">{new Date(version.createdAt).toLocaleString()}</td>
                  <td className="p-2 font-mono">{version.versionHash.slice(0, 14)}…</td>
                  <td className="p-2">{version.changedFields.join(', ') || 'Initial policy'}</td>
                  <td className="p-2">{String(version.snapshot.chainId)}</td>
                </tr>)}
                {!policies.length && <tr><td colSpan={4} className="p-4 text-center text-slate-500">No policy versions recorded yet.</td></tr>}</tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </>
  )
}

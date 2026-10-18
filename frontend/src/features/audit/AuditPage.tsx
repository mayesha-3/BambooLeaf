import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '../../lib/device-session'

type AuditEntry = {
  seq: number
  requestId: string
  type: string
  createdAt: string
  data: Record<string, unknown>
  prevHash: string
  hash: string
}

type ChainStatus = {
  valid: boolean
  checked: number
  headHash?: string
  firstInvalidSeq?: number
}

type Props = {
  apiBaseUrl: string
  refreshKey: number
}

function AuditPage({ apiBaseUrl, refreshKey }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const loadAudit = useCallback(async () => {
    try {
      const [entriesResponse, verifyResponse] = await Promise.all([
        authenticatedFetch(`${apiBaseUrl}/audit?limit=50`),
        authenticatedFetch(`${apiBaseUrl}/audit/verify`),
      ])
      const entriesPayload = await entriesResponse.json() as { entries?: AuditEntry[]; error?: string }
      const verifyPayload = await verifyResponse.json() as ChainStatus & { error?: string }
      if (!entriesResponse.ok) {
        throw new Error(entriesPayload.error || `Audit request failed (${entriesResponse.status})`)
      }
      if (!verifyResponse.ok && verifyResponse.status !== 409) {
        throw new Error(verifyPayload.error || `Verification request failed (${verifyResponse.status})`)
      }
      setEntries(entriesPayload.entries || [])
      setChainStatus(verifyPayload)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the audit log.')
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAudit()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadAudit, refreshKey])

  return (
    <section aria-labelledby="audit-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="audit-heading" className="text-xl font-semibold text-slate-950">Audit log</h2>
          <p className="mt-1 text-sm text-slate-600">Newest events first · read from the API</p>
        </div>
        <button
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={() => {
            setLoading(true)
            void loadAudit()
          }}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {chainStatus && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          chainStatus.valid
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-rose-200 bg-rose-50 text-rose-900'
        }`}>
          {chainStatus.valid
            ? `Hash chain verified · ${chainStatus.checked} event(s)`
            : `Hash chain verification failed at event ${chainStatus.firstInvalidSeq ?? 'unknown'}`}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && entries.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Loading audit events…</p>
        ) : entries.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No audit events yet.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li key={`${entry.seq}-${entry.hash}`} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <p className="font-medium text-slate-900">
                    <span className="mr-2 font-mono text-xs text-slate-400">#{entry.seq}</span>
                    {entry.type}
                  </p>
                  <time className="text-xs text-slate-500" dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </div>
                <p className="mt-1 text-xs text-slate-500">Request {entry.requestId}</p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(entry.data, null, 2)}
                </pre>
                <p className="mt-2 break-all font-mono text-[11px] text-slate-400">
                  SHA-256 {entry.hash}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

export default AuditPage

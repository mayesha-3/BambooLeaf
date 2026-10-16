import { useMemo, useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import PageHeading from '../components/ui/PageHeading'
import DeviceSecurityPanel from '../features/audit/DeviceSecurityPanel'
import { apiBaseUrl } from '../config/api'
import type { AuditState } from '../types'

interface ActivityPageProps {
  auditState: AuditState
  refreshAudit: () => void
}

export default function ActivityPage({ auditState, refreshAudit }: ActivityPageProps) {
  const [query, setQuery] = useState('')
  const [eventStreamOpen, setEventStreamOpen] = useState(false)
  const filtered = useMemo(
    () => auditState.entries.filter((entry) => `${entry.type} ${entry.requestId} ${JSON.stringify(entry.data)}`.toLowerCase().includes(query.toLowerCase())),
    [auditState.entries, query]
  )

  return (
    <>
      <PageHeading
        eyebrow="Verifiable by design"
        title="Activity log"
        description="Every goal, guard decision and transaction is recorded in an append-only hash chain."
        action={
          <button
            onClick={refreshAudit}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition"
          >
            <Icon name="refresh" size={13} /> Refresh
          </button>
        }
      />

      <div
        className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 ${auditState.valid === true
            ? 'border-lime-200 dark:border-lime-900/50 bg-lime-50/70 dark:bg-lime-950/40'
            : auditState.valid === false
              ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40'
              : 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40'
          }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`grid h-8 w-8 place-items-center rounded-xl ${auditState.valid === true ? 'bg-white dark:bg-slate-900 text-[#65A30D] dark:text-lime-400' : auditState.valid === false ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400' : 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400'
              }`}
          >
            <Icon name={auditState.valid === true ? 'checkCircle' : 'shield'} size={17} />
          </span>
          <div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {auditState.valid === true
                ? 'Audit chain verified'
                : auditState.valid === false
                  ? 'Audit chain verification failed'
                  : 'Audit service unavailable'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {auditState.valid === true
                ? `${auditState.checked} event(s) checked · each record is linked to the previous hash`
                : auditState.error || 'Connect the backend to read and verify production audit events.'}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-white dark:bg-slate-900 px-3 py-1 font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300 shadow-sm border border-slate-100 dark:border-slate-800">
          {auditState.valid === true ? 'SHA-256 · VALID' : 'API CONNECTION'}
        </span>
      </div>

      <Card className="overflow-hidden">
        <button
          onClick={() => setEventStreamOpen((prev) => !prev)}
          className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition cursor-pointer select-none"
          aria-expanded={eventStreamOpen}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Event stream</h2>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              {auditState.loading ? '…' : `${filtered.length} event(s)`}
            </span>
          </div>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${eventStreamOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {eventStreamOpen && (
          <>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800/80 px-6 py-3">
          <label className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/80">
            <Icon name="search" size={13} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search events"
              className="w-32 bg-transparent text-xs text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 sm:w-48"
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              <Icon name="activity" size={20} />
            </span>
            <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">{auditState.loading ? 'Loading audit entries' : 'No matching audit entries'}</p>
            <p className="mt-1 text-xs text-slate-400">{auditState.error ? 'Start the backend API and check its MongoDB connection.' : 'Submit a goal to add the first real event.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filtered.map((entry) => (
              <div key={`${entry.seq}-${entry.hash}`} className="px-6 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      <Icon name={entry.type.includes('denied') || entry.type.includes('failed') ? 'shield' : 'activity'} size={15} />
                    </span>
                    <div>
                      <p className="text-xs font-bold capitalize text-slate-800 dark:text-slate-200">{entry.type.replaceAll('.', ' ')}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Event #{entry.seq} · {entry.requestId}</p>
                    </div>
                  </div>
                  <time className="text-[11px] text-slate-400" dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </div>
                <details className="group mt-3">
                  <summary className="cursor-pointer list-none text-[11px] font-bold text-[#65A30D] dark:text-lime-400">
                    Inspect record and chain hashes <Icon name="chevron" size={12} className="ml-1 inline rotate-90 transition group-open:rotate-[270deg]" />
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-[10px] leading-5 text-lime-200 border border-slate-800">
                    {JSON.stringify({ data: entry.data, previousHash: entry.prevHash, hash: entry.hash }, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </Card>
      <DeviceSecurityPanel apiBaseUrl={apiBaseUrl} />
    </>
  )
}

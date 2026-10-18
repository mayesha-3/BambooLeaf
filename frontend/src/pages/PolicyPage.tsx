import { useEffect, useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'
import { apiBaseUrl } from '../config/api'
import { authenticatedFetch } from '../lib/device-session'

export default function PolicyPage() {
  const [maxPerTx, setMaxPerTx] = useState('0.02')
  const [dailyCap, setDailyCap] = useState('0.05')
  const [velocity, setVelocity] = useState('5')
  const [saved, setSaved] = useState(false)
  const [recipients, setRecipients] = useState<string[]>([])
  const [role, setRole] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void authenticatedFetch(`${apiBaseUrl}/policy`).then(async (response) => {
      const policy = await response.json() as {
        role?: string
        maxPerTxEth?: string
        maxPerRecipientPerDayEth?: string
        maxTxPerWindow?: number
        allowedRecipients?: string[]
        error?: string
      }
      if (!response.ok) throw new Error(policy.error || `Policy request failed (${response.status})`)
      setRole(policy.role || '')
      setMaxPerTx(policy.maxPerTxEth || '0.02')
      setDailyCap(policy.maxPerRecipientPerDayEth || '0.05')
      setVelocity(String(policy.maxTxPerWindow || 5))
      setRecipients(policy.allowedRecipients || [])
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load policy.')
    }).finally(() => setLoading(false))
  }, [])

  async function savePolicy() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxPerTxEth: maxPerTx,
          maxPerRecipientPerDayEth: dailyCap,
          maxTxPerWindow: Number(velocity),
          allowedRecipients: recipients,
        }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || `Policy update failed (${response.status})`)
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save policy.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Deterministic rules"
        title="Policy & limits"
        description="Changes are persisted, recorded in policy history, and applied at the signing boundary. Verified supplier payouts are managed in the supplier registry."
        action={<Badge tone="green"><Icon name="shield" size={12} /> {role === 'admin' ? 'Admin controls' : 'Read only'}</Badge>}
      />

      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {saved && (
        <div className="mb-4 rounded-2xl bg-lime-50 p-4 text-xs font-bold text-lime-900 border border-lime-200">
          ✓ Policy saved and versioned in the audit history.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Spending limits</h2>
            <p className="text-xs text-slate-400 mb-5">Applied to every proposed transaction</p>
            <div className="space-y-4">
              {[
                { label: 'Per transaction', value: maxPerTx, set: setMaxPerTx, prefix: '', suffix: 'ETH' },
                { label: 'Daily per-recipient cap', value: dailyCap, set: setDailyCap, prefix: '', suffix: 'ETH' },
              ].map((limit) => (
                <label key={limit.label} className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-4 first:border-0 first:pt-0">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{limit.label}</span>
                  <span className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3">
                    <span className="text-xs text-slate-400">{limit.prefix}</span>
                    <input
                      aria-label={limit.label}
                      value={limit.value}
                      onChange={(event) => limit.set(event.target.value)}
                      disabled={role !== 'admin' || loading}
                      className="w-16 py-2 text-right text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent outline-none"
                    />
                    <span className="ml-2 text-[10px] text-slate-400">{limit.suffix}</span>
                  </span>
                </label>
              ))}
              <label className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-4">
                <span>
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Velocity limit</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">Transactions per 10-minute window</span>
                </span>
                <span className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3">
                  <input
                    aria-label="Transactions per window"
                    value={velocity}
                    onChange={(event) => setVelocity(event.target.value)}
                    disabled={role !== 'admin' || loading}
                    className="w-10 py-2 text-right text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent outline-none"
                  />
                  <span className="ml-2 text-[10px] text-slate-400">tx</span>
                </span>
              </label>
              <div className="flex justify-end border-t border-slate-100 dark:border-slate-800/80 pt-4">
                <button
                  onClick={() => void savePolicy()}
                  disabled={role !== 'admin' || loading || saving}
                  className="rounded-full bg-slate-950 dark:bg-lime-400 dark:text-slate-950 dark:hover:bg-lime-300 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 shadow-sm transition"
                >
                  {saving ? 'Saving…' : 'Save policy'}
                </button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Allowed assets & contracts</h2>
            <p className="text-xs text-slate-400 mb-4">Only supported tokens and reviewed protocol routes</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">◆ ETH <Badge tone="green">Token</Badge></span>
              <span className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">◉ USDC <Badge tone="green">Token</Badge></span>
              <span className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">⇄ DEX router <Badge tone="neutral">Contract</Badge></span>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Trusted recipients</h2>
            <p className="text-xs text-slate-400 mb-4">Supplier payout addresses must be changed through the separately approved supplier registry.</p>
            <div className="space-y-3">
              {recipients.map((recipient) => (
                <div key={recipient} className="flex items-center gap-3 border-t border-slate-100 dark:border-slate-800/80 py-3 first:border-0">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-lime-50 dark:bg-lime-950/50 text-[#65A30D] dark:text-lime-400">
                    <Icon name="checkCircle" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{recipient}</p>
                    <p className="text-[10px] text-slate-400">Saved recipient · Sepolia</p>
                  </div>
                </div>
              ))}
              {!recipients.length && <p className="text-xs text-slate-400">No additional recipient addresses are configured. Verified suppliers remain separately allow-listed.</p>}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Always forbidden</h2>
            <p className="text-xs text-slate-400 mb-4">No override path—even by prompt</p>
            <div className="space-y-3">
              {['Unlimited token approvals', 'Unknown contract calls', 'Ownership transfer / delegatecall', 'Intent-to-outcome mismatch'].map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Icon name="lock" size={14} className="text-rose-600 dark:text-rose-400" />
                  {item}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

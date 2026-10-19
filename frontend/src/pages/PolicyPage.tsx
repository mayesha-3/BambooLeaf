import { useEffect, useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'
import { apiBaseUrl } from '../config/api'
import { authenticatedFetch } from '../lib/device-session'

type PolicySnapshot = {
  chainId: number
  role: string
  maxPerTxEth: string
  maxPerRecipientPerDayEth: string
  maxTxPerWindow: number
  velocityWindowSeconds: number
  maxSlippageBps: number
  maxSwapInputAmount: string | null
  maxSwapPerTokenPerDay: string | null
  allowedRecipients: string[]
  allowedContracts: string[]
  allowedSwapRouters: string[]
  swapRouterAddress: string | null
  supportedAssets: { symbol: string; address: string; decimals: number }[]
}

type PolicyDraft = {
  maxPerTxEth: string
  maxPerRecipientPerDayEth: string
  maxTxPerWindow: string
  velocityWindowSeconds: string
  maxSlippageBps: string
  maxSwapInputAmount: string
  maxSwapPerTokenPerDay: string
  allowedRecipients: string
}

const emptyDraft: PolicyDraft = {
  maxPerTxEth: '',
  maxPerRecipientPerDayEth: '',
  maxTxPerWindow: '',
  velocityWindowSeconds: '',
  maxSlippageBps: '',
  maxSwapInputAmount: '',
  maxSwapPerTokenPerDay: '',
  allowedRecipients: '',
}

function toDraft(policy: PolicySnapshot): PolicyDraft {
  return {
    maxPerTxEth: policy.maxPerTxEth,
    maxPerRecipientPerDayEth: policy.maxPerRecipientPerDayEth,
    maxTxPerWindow: String(policy.maxTxPerWindow),
    velocityWindowSeconds: String(policy.velocityWindowSeconds),
    maxSlippageBps: String(policy.maxSlippageBps),
    maxSwapInputAmount: policy.maxSwapInputAmount ?? '',
    maxSwapPerTokenPerDay: policy.maxSwapPerTokenPerDay ?? '',
    allowedRecipients: policy.allowedRecipients.join('\n'),
  }
}

function PolicyPage() {
  const [policy, setPolicy] = useState<PolicySnapshot | null>(null)
  const [trustedRecipientsExpanded, setTrustedRecipientsExpanded] = useState(false)
  const [draft, setDraft] = useState<PolicyDraft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadPolicy() {
      try {
        const response = await authenticatedFetch(`${apiBaseUrl}/policy`, { signal: controller.signal })
        const payload = await response.json() as PolicySnapshot & { error?: string }
        if (!response.ok) throw new Error(payload.error || `Policy request failed (${response.status})`)
        setPolicy(payload)
        setDraft(toDraft(payload))
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load active policy.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadPolicy()
    return () => controller.abort()
  }, [])

  function updateDraft(field: keyof PolicyDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setSaved(false)
  }

  async function savePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxPerTxEth: draft.maxPerTxEth,
          maxPerRecipientPerDayEth: draft.maxPerRecipientPerDayEth,
          maxTxPerWindow: Number(draft.maxTxPerWindow),
          velocityWindowSeconds: Number(draft.velocityWindowSeconds),
          maxSlippageBps: Number(draft.maxSlippageBps),
          maxSwapInputAmount: draft.maxSwapInputAmount,
          maxSwapPerTokenPerDay: draft.maxSwapPerTokenPerDay,
          allowedRecipients: draft.allowedRecipients.split(/[\n,]/).map((address) => address.trim()).filter(Boolean),
        }),
      })
      const payload = await response.json() as PolicySnapshot & { error?: string }
      if (!response.ok) throw new Error(payload.error || `Policy update failed (${response.status})`)
      setPolicy(payload)
      setDraft(toDraft(payload))
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save policy.')
    } finally {
      setSaving(false)
    }
  }

  const isAdmin = policy?.role === 'admin'
  const chainLabel = policy ? `Chain ${policy.chainId}` : 'Configured chain'
  const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

  return (
    <>
      <PageHeading
        eyebrow="Deterministic rules"
        title="Policy & limits"
        description="Active signing limits are loaded from the backend. Admin changes are validated, persisted, versioned, and audited."
        action={<Badge tone={policy ? 'green' : 'amber'}><Icon name="shield" size={12} /> {isAdmin ? 'ADMIN CONTROLS' : 'READ ONLY'}</Badge>}
      />

      {error && <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      {saved && <div role="status" className="mb-4 rounded-2xl border border-lime-200 bg-lime-50 p-4 text-xs font-bold text-lime-900">Policy saved and recorded in audit history.</div>}
      {loading && <p className="mb-4 text-xs text-slate-500">Loading active backend policy…</p>}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Spending limits</h2>
            <p className="mb-5 text-xs text-slate-400">Enforced by backend · {chainLabel}</p>
            {policy ? (
              <div className="space-y-3">
                {[
                  { label: 'Per transaction', value: `${policy.maxPerTxEth} ETH` },
                  { label: 'Per-recipient daily cap', value: `${policy.maxPerRecipientPerDayEth} ETH` },
                  { label: 'Transaction velocity', value: `${policy.maxTxPerWindow} per ${policy.velocityWindowSeconds}s` },
                  { label: 'Maximum swap slippage', value: `${(policy.maxSlippageBps / 100).toFixed(2)}%` },
                  { label: 'Maximum swap input', value: policy.maxSwapInputAmount || 'Not configured' },
                  { label: 'Maximum daily swap per token', value: policy.maxSwapPerTokenPerDay || 'Not configured' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 first:border-0 first:pt-0 dark:border-slate-800/80">
                    <span className="text-xs text-slate-500">{item.label}</span>
                    <span className="text-right text-sm font-bold text-slate-900 dark:text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : !loading ? <p className="text-xs text-slate-500">Active policy is unavailable.</p> : null}
          </Card>

          {isAdmin && policy && (
            <Card className="p-6">
              <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Update policy</h2>
              <p className="mb-5 text-xs text-slate-400">Updates take effect at the backend signing boundary after validation.</p>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={savePolicy}>
                {([
                  ['maxPerTxEth', 'Per-transaction limit (ETH)'],
                  ['maxPerRecipientPerDayEth', 'Daily recipient limit (ETH)'],
                  ['maxTxPerWindow', 'Transactions per window'],
                  ['velocityWindowSeconds', 'Velocity window (seconds)'],
                  ['maxSlippageBps', 'Maximum slippage (basis points)'],
                  ['maxSwapInputAmount', 'Maximum swap input'],
                  ['maxSwapPerTokenPerDay', 'Daily swap per token'],
                ] as const).map(([field, label]) => (
                  <label key={field} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {label}
                    <input className={inputClass} value={draft[field]} onChange={(event) => updateDraft(field, event.target.value)} required />
                  </label>
                ))}
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
                  Allow-listed recipients (one address per line)
                  <textarea className={`${inputClass} min-h-28 font-mono`} value={draft.allowedRecipients} onChange={(event) => updateDraft('allowedRecipients', event.target.value)} />
                </label>
                <button type="submit" disabled={saving} className="rounded-xl bg-lime-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2">
                  {saving ? 'Saving…' : 'Save policy'}
                </button>
              </form>
            </Card>
          )}

          <Card className="p-6">
            <button
              type="button"
              onClick={() => setTrustedRecipientsExpanded((expanded) => !expanded)}
              aria-expanded={trustedRecipientsExpanded}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <span>
                <span className="block text-base font-bold text-slate-900 dark:text-white">Trusted recipients</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {policy?.allowedRecipients.length ?? 0} recipient(s) · Active backend policy · {chainLabel}
                </span>
              </span>
              <Icon
                name="chevron"
                size={16}
                className={`shrink-0 text-slate-400 transition-transform ${trustedRecipientsExpanded ? '-rotate-90' : 'rotate-90'}`}
              />
            </button>
            {trustedRecipientsExpanded && (
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                <p className="mb-2 text-[11px] text-slate-400">Verified supplier payouts are added only during verified invoice execution.</p>
                {policy?.allowedRecipients.length ? (
                  <div className="max-h-64 overflow-y-auto">
                    {policy.allowedRecipients.map((recipient) => (
                      <div key={recipient} className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-0 dark:border-slate-800/80">
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-lime-50 text-[#65A30D] dark:bg-lime-950/50 dark:text-lime-400"><Icon name="checkCircle" size={15} /></span>
                        <p className="min-w-0 flex-1 break-all font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{recipient}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-500">No recipients are allow-listed. Transfers will be denied by policy.</p>}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Supported assets</h2>
            <p className="mb-4 text-xs text-slate-400">Configured token registry for {chainLabel}.</p>
            {policy?.supportedAssets.length ? policy.supportedAssets.map((asset) => (
              <div key={asset.address} className="border-t border-slate-100 py-3 first:border-0 dark:border-slate-800/80">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{asset.symbol} <span className="font-normal text-slate-400">· {asset.decimals} decimals</span></p>
                <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{asset.address}</p>
              </div>
            )) : <p className="text-xs text-slate-500">{loading ? 'Loading assets…' : 'No supported assets are configured.'}</p>}
          </Card>

          <Card className="p-6">
            <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Allowed contracts</h2>
            {policy?.allowedContracts.length ? policy.allowedContracts.map((address) => (
              <p key={address} className="mt-3 break-all border-t border-slate-100 pt-3 font-mono text-xs text-slate-500 first:border-0 dark:border-slate-800/80">{address}</p>
            )) : <p className="mt-4 text-xs text-slate-400">No contracts are allow-listed.</p>}
          </Card>

          <Card className="p-6">
            <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Swap router</h2>
            <p className="mb-4 text-xs text-slate-400">Only configured, allow-listed routes can be used.</p>
            {policy?.swapRouterAddress ? (
              <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-200">{policy.swapRouterAddress}</p>
            ) : <p className="text-xs text-slate-500">No swap router is configured.</p>}
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800/80">
              <p className="mb-2 text-[10px] font-semibold text-slate-400">{policy?.allowedSwapRouters.length ?? '—'} allow-listed router(s)</p>
              {policy?.allowedSwapRouters.map((address) => <p key={address} className="mb-1 break-all font-mono text-[10px] text-slate-500">{address}</p>)}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

export default PolicyPage

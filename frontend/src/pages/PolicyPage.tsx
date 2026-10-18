import { useEffect, useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'
import { apiBaseUrl } from '../config/api'

type PolicySnapshot = {
  chainId: number
  maxPerTxEth: string
  maxPerRecipientPerDayEth: string
  maxTransactionsPerWindow: number
  velocityWindowSeconds: number
  allowedRecipients: string[]
  allowedContracts: string[]
  allowedSwapRouters: string[]
  swapRouterAddress: string | null
  maxSlippageBps: number
  maxSwapInputAmount: string | null
  maxSwapPerTokenPerDay: string | null
  supportedAssets: { symbol: string; address: string; decimals: number }[]
}

function PolicyPage() {
  const [policy, setPolicy] = useState<PolicySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadPolicy() {
      try {
        const response = await fetch(`${apiBaseUrl}/policy`, { signal: controller.signal })
        const payload = await response.json() as PolicySnapshot & { error?: string }
        if (!response.ok) throw new Error(payload.error || `Policy API returned ${response.status}`)
        setPolicy(payload)
        setError('')
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

  const chainLabel = policy ? `Chain ${policy.chainId}` : 'Configured chain'
  const shortAddress = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`

  return (
    <>
      <PageHeading
        eyebrow="Deterministic rules"
        title="Policy & limits"
        description="Live, read-only limits loaded from the backend policy configuration. Update backend environment settings to change enforced limits."
        action={<Badge tone={policy ? 'green' : 'amber'}><Icon name="shield" size={12} /> {policy ? 'ACTIVE POLICY' : 'POLICY UNAVAILABLE'}</Badge>}
      />

      {error && <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      {loading && <p className="mb-4 text-xs text-slate-500">Loading active backend policy…</p>}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Spending limits</h2>
            <p className="mb-5 text-xs text-slate-400">Enforced by backend · {chainLabel}</p>
            <div className="space-y-4">
              {[
                { label: 'Per transaction', value: policy ? `${policy.maxPerTxEth} ETH` : '—' },
                { label: 'Per-recipient daily cap', value: policy ? `${policy.maxPerRecipientPerDayEth} ETH` : '—' },
                { label: 'Transaction velocity', value: policy ? `${policy.maxTransactionsPerWindow} per ${policy.velocityWindowSeconds}s` : '—' },
                { label: 'Maximum swap slippage', value: policy ? `${(policy.maxSlippageBps / 100).toFixed(2)}%` : '—' },
                { label: 'Maximum swap input', value: policy?.maxSwapInputAmount ?? 'Not configured' },
                { label: 'Per-token daily swap cap', value: policy?.maxSwapPerTokenPerDay ?? 'Not configured' },
              ].map((limit) => (
                <div key={limit.label} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 first:border-0 first:pt-0 dark:border-slate-800/80">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{limit.label}</span>
                  <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{limit.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Supported assets</h2>
            <p className="mb-4 text-xs text-slate-400">Token registry on {chainLabel}; this is not a guarantee that every action is enabled.</p>
            {!policy?.supportedAssets.length ? (
              <p className="text-xs text-slate-500">No assets are registered for this chain.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {policy.supportedAssets.map((asset) => (
                  <span key={`${asset.symbol}-${asset.address}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                    {asset.symbol} <Badge tone="green">Token</Badge>
                    <span className="font-mono text-[10px] font-normal text-slate-400">{asset.address === '0x0000000000000000000000000000000000000000' ? 'Native' : shortAddress(asset.address)}</span>
                  </span>
                ))}
              </div>
            )}
            {policy?.allowedContracts.length ? (
              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800/80">
                <p className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-300">Allowed contracts</p>
                <div className="space-y-2">
                  {policy.allowedContracts.map((address) => <p key={address} className="font-mono text-xs text-slate-500">{address}</p>)}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-400">No contracts are allow-listed.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Trusted recipients</h2>
            <p className="mb-4 text-xs text-slate-400">Loaded from the backend allowlist · {chainLabel}</p>
            {policy?.allowedRecipients.length ? (
              <div className="space-y-3">
                {policy.allowedRecipients.map((recipient) => (
                  <div key={recipient} className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-0 dark:border-slate-800/80">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-lime-50 text-[#65A30D] dark:bg-lime-950/50 dark:text-lime-400">
                      <Icon name="checkCircle" size={15} />
                    </span>
                    <p className="min-w-0 flex-1 break-all font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{recipient}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No recipients are allow-listed. Transfers will be denied by policy.</p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white">Swap router</h2>
            <p className="mb-4 text-xs text-slate-400">Only configured, allow-listed routes can be used.</p>
            {policy?.swapRouterAddress ? (
              <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-200">{policy.swapRouterAddress}</p>
            ) : (
              <p className="text-xs text-slate-500">No swap router is configured.</p>
            )}
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800/80">
              <p className="mb-2 text-[10px] font-semibold text-slate-400">{policy?.allowedSwapRouters.length ?? '—'} allow-listed router(s)</p>
              {policy?.allowedSwapRouters.map((address) => (
                <p key={address} className="mb-1 break-all font-mono text-[10px] text-slate-500">{address}</p>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

export default PolicyPage

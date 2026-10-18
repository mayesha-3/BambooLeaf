import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'
import { apiBaseUrl } from '../config/api'

type AutonomySnapshot = {
  level: 'L0' | 'L1' | 'L2' | 'L3'
  cleanStreak: number
  blockedInWindow: number
  frozen: boolean
  lastDemotionReason: string | null
}

export default function AutonomyPage() {
  const [snapshot, setSnapshot] = useState<AutonomySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadState = useCallback(async () => {
    const token = window.sessionStorage.getItem('bambooleaf-device-session')
    if (!token) {
      setError('Sign in with the owner wallet under Device Security to view and manage autonomy.')
      setLoading(false)
      return
    }
    try {
      const response = await fetch(`${apiBaseUrl}/autonomy`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json() as AutonomySnapshot & { error?: string }
      if (!response.ok) throw new Error(payload.error || `Autonomy request failed (${response.status})`)
      setSnapshot(payload)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load autonomy state.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadState(), 0)
    return () => window.clearTimeout(timer)
  }, [loadState])

  async function changeSafetyState() {
    if (!snapshot) return
    const resetting = snapshot.frozen || snapshot.level === 'L0'
    if (resetting && !window.confirm('Reset to L1? Signing permissions will be restored only at the restricted level.')) return
    const token = window.sessionStorage.getItem('bambooleaf-device-session')
    if (!token) {
      setError('Sign in with the owner wallet under Device Security before changing autonomy.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${apiBaseUrl}/autonomy/${resetting ? 'reset' : 'kill'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await response.json() as AutonomySnapshot & { error?: string }
      if (!response.ok) throw new Error(payload.error || `Autonomy update failed (${response.status})`)
      setSnapshot(payload)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to change autonomy state.')
    } finally {
      setBusy(false)
    }
  }

  const frozen = snapshot?.frozen ?? false
  const level = frozen ? 'L0' : snapshot?.level ?? '—'
  const requiresHumanReset = frozen || level === 'L0'
  const levelName = level === 'L0' ? 'Read-only' : level === 'L1' ? 'Restricted' : level === 'L2' ? 'Standard autonomy' : level === 'L3' ? 'Trusted autonomy' : 'Loading state'

  return (
    <>
      <PageHeading
        eyebrow="Trust follows evidence"
        title="Autonomy & safety"
        description="The agent earns narrowly scoped capability over time—and loses it immediately when behaviour looks suspicious."
        action={<Badge tone={frozen ? 'red' : level === 'L0' ? 'amber' : snapshot ? 'green' : 'amber'}>{frozen ? 'FROZEN · L0' : level === 'L0' ? 'READ-ONLY · L0' : snapshot ? `ACTIVE · ${level}` : 'STATE UNAVAILABLE'}</Badge>}
      />

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      <Card className="mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-950 to-slate-800 px-6 py-7 text-white sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-xs font-bold text-lime-400">CURRENT PERMISSION LEVEL</p>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-5xl font-extrabold tracking-tight">{loading ? '…' : level}</span>
                <span className="mb-1 text-sm text-slate-300">{levelName}</span>
              </div>
              <p className="mt-3 max-w-md text-xs leading-5 text-slate-300">
                {requiresHumanReset
                  ? 'L0 is read-only and blocks transactions. Only an owner human reset can restore action permissions.'
                  : 'Routine low-risk actions may proceed within policy. New or elevated-risk actions still require approval.'}
              </p>
            </div>
            <button
              onClick={() => void changeSafetyState()}
              disabled={!snapshot || busy}
              className={`rounded-full px-5 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${requiresHumanReset ? 'bg-white text-slate-950 hover:bg-slate-100' : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                }`}
            >
              {busy ? 'Updating…' : requiresHumanReset ? 'Human reset to L1' : 'Activate kill switch'}
            </button>
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-slate-100 dark:divide-slate-800 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-6">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Clean streak</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">{snapshot?.cleanStreak ?? '—'} <span className="text-xs font-normal text-slate-400">/ 10 to promotion</span></p>
          </div>
          <div className="p-6">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Blocked attempts</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">{snapshot?.blockedInWindow ?? '—'} <span className="text-xs font-normal text-slate-400">in current window</span></p>
          </div>
          <div className="p-6">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Human-set ceiling</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">L3 <span className="text-xs font-normal text-slate-400">never exceeded</span></p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Permission levels</h2>
          <p className="text-xs text-slate-400 mb-4">Increasing permissions are earned—not requested from the model</p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {[
              { level: 'L0', name: 'Read-only', desc: 'Balances, quotes, explanations. Never signs.' },
              { level: 'L1', name: 'Restricted', desc: 'Every action waits for owner approval.' },
              { level: 'L2', name: 'Standard', desc: 'Low-risk actions under caps may auto-execute.' },
              { level: 'L3', name: 'Trusted', desc: 'Wider limits, still bounded by owner policy.' },
            ].map((item) => (
              <div key={item.level} className="flex gap-3 py-3.5">
                <span className="grid h-8 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  {item.level}
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Demotion triggers</h2>
          <p className="text-xs text-slate-400 mb-4">Suspicious signals reduce permissions automatically</p>
          <div className="space-y-3">
            {[
              { title: 'Critical guard violation', desc: 'Intent mismatch, forbidden approval, or quarantine alarm', level: 'Immediate L0' },
              { title: 'Repeated blocked attempts', desc: '3 blocked actions inside a 10-minute window', level: 'Demote to L0' },
              { title: 'Kill switch activated', desc: 'Owner pauses all agent signing', level: 'Immediate L0' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5">
                <Icon name="shield" size={15} className="mt-0.5 text-rose-600 dark:text-rose-400" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{item.desc}</p>
                </div>
                <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400">{item.level}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

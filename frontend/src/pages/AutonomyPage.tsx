import { useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'

export default function AutonomyPage() {
  const [frozen, setFrozen] = useState(false)

  return (
    <>
      <PageHeading
        eyebrow="Trust follows evidence"
        title="Autonomy & safety"
        description="The agent earns narrowly scoped capability over time—and loses it immediately when behaviour looks suspicious."
        action={<Badge tone={frozen ? 'red' : 'green'}>{frozen ? 'FROZEN · L0' : 'ACTIVE · L2'}</Badge>}
      />

      <Card className="mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-950 to-slate-800 px-6 py-7 text-white sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-xs font-bold text-lime-400">CURRENT PERMISSION LEVEL</p>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-5xl font-extrabold tracking-tight">{frozen ? 'L0' : 'L2'}</span>
                <span className="mb-1 text-sm text-slate-300">{frozen ? 'Read-only' : 'Standard autonomy'}</span>
              </div>
              <p className="mt-3 max-w-md text-xs leading-5 text-slate-300">
                {frozen
                  ? 'All signing is paused. Only a human reset can restore action permissions.'
                  : 'Routine low-risk actions may proceed within policy. New or elevated-risk actions still require approval.'}
              </p>
            </div>
            <button
              onClick={() => setFrozen((val) => !val)}
              className={`rounded-full px-5 py-2.5 text-xs font-bold transition ${frozen ? 'bg-white text-slate-950 hover:bg-slate-100' : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                }`}
            >
              {frozen ? 'Reset agent · preview' : 'Freeze agent · preview'}
            </button>
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-slate-100 dark:divide-slate-800 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-6">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Clean streak</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">7 <span className="text-xs font-normal text-slate-400">/ 10 to promotion</span></p>
          </div>
          <div className="p-6">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Blocked attempts</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">1 <span className="text-xs font-normal text-slate-400">in current window</span></p>
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

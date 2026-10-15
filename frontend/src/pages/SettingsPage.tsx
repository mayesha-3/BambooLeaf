import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import PageHeading from '../components/ui/PageHeading'

export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Workspace"
        title="Settings"
        description="Environment and provider controls for the BambooLeaf guarded agent."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900 mb-1">Connected services</h2>
          <p className="text-xs text-slate-400 mb-4">Connection status from current application</p>
          <div className="space-y-3">
            {[
              { name: 'Backend API', status: 'Configured by environment', ok: true },
              { name: 'MongoDB', status: 'Server-side connection', ok: true },
              { name: 'Planner model', status: 'Provider credentials active', ok: true },
              { name: 'Signer', status: 'Server-side only · never exposed to client', ok: true },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-0">
                <span className={`h-2.5 w-2.5 rounded-full ${item.ok ? 'bg-[#84CC16]' : 'bg-amber-400'}`} />
                <div>
                  <p className="text-xs font-bold text-slate-800">{item.name}</p>
                  <p className="text-[10px] text-slate-400">{item.status}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900 mb-1">Security defaults</h2>
          <p className="text-xs text-slate-400 mb-4">The UI never receives signer secrets</p>
          <div className="space-y-3">
            {[
              'Keys remain server-side in environment variables',
              'Untrusted prompt text cannot bypass guard policy',
              'Arena should use isolated fake funds only',
              'All activity should be recorded in the audit chain',
            ].map((item) => (
              <div key={item} className="flex gap-2.5 border-t border-slate-100 pt-3 first:border-0 text-xs font-semibold text-slate-700">
                <Icon name="lock" size={14} className="text-[#65A30D] shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

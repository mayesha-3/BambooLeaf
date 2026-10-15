import { useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'

export default function PolicyPage() {
  const [maxPerTx, setMaxPerTx] = useState('25')
  const [dailyCap, setDailyCap] = useState('150')
  const [recipientCap, setRecipientCap] = useState('50')
  const [velocity, setVelocity] = useState('5')
  const [saved, setSaved] = useState(false)
  const [recipients, setRecipients] = useState(['0x7099…79C8', '0x3C44…93BC'])

  return (
    <>
      <PageHeading
        eyebrow="Deterministic rules"
        title="Policy & limits"
        description="Limits live in code and policy data—not in the model's prompt. Unknown destinations are never silently allowed."
        action={<Badge tone="green"><Icon name="shield" size={12} /> Deny by default</Badge>}
      />

      {saved && (
        <div className="mb-4 rounded-2xl bg-lime-50 p-4 text-xs font-bold text-lime-900 border border-lime-200">
          ✓ Preview policy updated locally.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Spending limits</h2>
            <p className="text-xs text-slate-400 mb-5">Applied to every proposed transaction</p>
            <div className="space-y-4">
              {[
                { label: 'Per transaction', value: maxPerTx, set: setMaxPerTx, prefix: '$', suffix: 'USD' },
                { label: 'Daily total', value: dailyCap, set: setDailyCap, prefix: '$', suffix: 'USD' },
                { label: 'Per-recipient daily cap', value: recipientCap, set: setRecipientCap, prefix: '$', suffix: 'USD' },
              ].map((limit) => (
                <label key={limit.label} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                  <span className="text-xs font-semibold text-slate-700">{limit.label}</span>
                  <span className="flex items-center rounded-xl border border-slate-200 bg-white px-3">
                    <span className="text-xs text-slate-400">{limit.prefix}</span>
                    <input
                      aria-label={limit.label}
                      value={limit.value}
                      onChange={(event) => limit.set(event.target.value)}
                      className="w-16 py-2 text-right text-xs font-bold text-slate-800 outline-none"
                    />
                    <span className="ml-2 text-[10px] text-slate-400">{limit.suffix}</span>
                  </span>
                </label>
              ))}
              <label className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <span>
                  <span className="block text-xs font-semibold text-slate-700">Velocity limit</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">Transactions per 10-minute window</span>
                </span>
                <span className="flex items-center rounded-xl border border-slate-200 px-3">
                  <input
                    aria-label="Transactions per window"
                    value={velocity}
                    onChange={(event) => setVelocity(event.target.value)}
                    className="w-10 py-2 text-right text-xs font-bold outline-none"
                  />
                  <span className="ml-2 text-[10px] text-slate-400">tx</span>
                </span>
              </label>
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button
                  onClick={() => setSaved(true)}
                  className="rounded-full bg-black px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 shadow-sm"
                >
                  Save policy preview
                </button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Allowed assets & contracts</h2>
            <p className="text-xs text-slate-400 mb-4">Only supported tokens and reviewed protocol routes</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">◆ ETH <Badge tone="green">Token</Badge></span>
              <span className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">◉ USDC <Badge tone="green">Token</Badge></span>
              <span className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">⇄ DEX router <Badge tone="neutral">Contract</Badge></span>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Trusted recipients</h2>
            <p className="text-xs text-slate-400 mb-4">New addresses route to human approval</p>
            <div className="space-y-3">
              {recipients.map((recipient) => (
                <div key={recipient} className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-0">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-lime-50 text-[#65A30D]">
                    <Icon name="checkCircle" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold text-slate-700">{recipient}</p>
                    <p className="text-[10px] text-slate-400">Saved recipient · Sepolia</p>
                  </div>
                  <button onClick={() => setRecipients((curr) => curr.filter((r) => r !== recipient))} className="text-[10px] text-slate-400 hover:text-rose-600 font-bold">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Always forbidden</h2>
            <p className="text-xs text-slate-400 mb-4">No override path—even by prompt</p>
            <div className="space-y-3">
              {['Unlimited token approvals', 'Unknown contract calls', 'Ownership transfer / delegatecall', 'Intent-to-outcome mismatch'].map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-xs font-semibold text-slate-700">
                  <Icon name="lock" size={14} className="text-rose-600" />
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

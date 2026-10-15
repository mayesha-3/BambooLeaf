import { useState } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'

const sampleApprovals = [
  { id: 'ap-1042', action: 'Swap USDC → ETH', amount: '12.00 USDC', receive: '~0.0041 ETH', recipient: 'Uniswap V2 Router', risk: 'Low risk', reason: 'Within daily budget. Slippage 0.30%. No token approvals requested.', expires: '04:12', tone: 'green' },
  { id: 'ap-1041', action: 'Transfer ETH', amount: '0.025 ETH', receive: 'External recipient', recipient: '0x71C7…976F', risk: 'New recipient', reason: 'This address is not in your saved contacts. Review carefully before allowing.', expires: '09:38', tone: 'amber' },
]

export default function ApprovalsPage() {
  const [items, setItems] = useState(sampleApprovals)
  const [notice, setNotice] = useState('')

  function decide(id: string, approved: boolean) {
    setItems((current) => current.filter((item) => item.id !== id))
    setNotice(approved ? 'Preview: approval recorded locally. Connect the approvals API to authorize a transaction.' : 'Approval rejected in this preview.')
  }

  return (
    <>
      <PageHeading
        eyebrow="Human in the loop"
        title="Approval queue"
        description="Review what the agent plans to do before any T2 action can be signed."
        action={<Badge tone="amber"><Icon name="clock" size={12} /> {items.length} pending</Badge>}
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <Icon name="eye" size={17} className="mt-0.5 shrink-0 text-blue-700" />
        <p className="text-xs leading-5 text-blue-900">
          <span className="font-bold">Explain before sign.</span> Each approval is intended to be bound to the exact transaction digest and expires if the transaction changes.
        </p>
      </div>

      {notice && <p role="status" className="mb-4 rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-700">{notice}</p>}

      {items.length ? (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-2xl ${item.tone === 'green' ? 'bg-lime-50 text-[#65A30D]' : 'bg-amber-50 text-amber-700'}`}>
                    <Icon name={item.action.startsWith('Swap') ? 'refresh' : 'send'} />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900">{item.action}</h2>
                      <Badge tone={item.tone}>{item.risk}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Requested {item.id} · <span className="text-amber-700 font-semibold">Expires in {item.expires}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">You send</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{item.amount}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected outcome</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{item.receive}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destination</p>
                  <p className="mt-1 break-all text-sm font-bold text-slate-800">{item.recipient}</p>
                </div>
              </div>

              <div className="mt-4 flex gap-2.5 rounded-2xl border border-slate-100 p-3.5">
                <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-[#65A30D]" />
                <p className="text-xs leading-5 text-slate-600">{item.reason}</p>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => decide(item.id, false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => decide(item.id, true)}
                  className="rounded-full bg-black px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm"
                >
                  Review & approve
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-16 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-lime-50 text-[#65A30D]">
            <Icon name="checkCircle" size={20} />
          </span>
          <h2 className="mt-4 text-sm font-bold text-slate-900">Queue is clear</h2>
          <p className="mt-1 text-xs text-slate-400">There are no pending approvals to review.</p>
        </Card>
      )}
    </>
  )
}

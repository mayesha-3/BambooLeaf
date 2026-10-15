import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import PageHeading from '../components/ui/PageHeading'

export default function WalletPage() {
  const tokens = [
    { symbol: 'ETH', name: 'Sepolia Ether', balance: '1.2846', value: '$2,576.12', change: '+3.2%', color: 'bg-lime-50 text-[#65A30D]', mark: 'Ξ' },
    { symbol: 'USDC', name: 'USD Coin', balance: '264.48', value: '$264.48', change: '0.0%', color: 'bg-blue-50 text-blue-700', mark: '＄' },
  ]

  return (
    <>
      <PageHeading
        eyebrow="Testnet wallet"
        title="Wallet & allocation"
        description="See balances, configured chain and portfolio targets on Sepolia testnet."
        action={<Badge tone="amber"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Sepolia Testnet</Badge>}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-bold text-slate-400">Total portfolio value</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight">$2,840.60</p>
          <p className="mt-1 text-xs text-slate-400">Sepolia testnet valuation</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold text-slate-400">Target allocation</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 tracking-tight">60 / 40</p>
          <p className="mt-1 text-xs text-slate-400">ETH / USDC target split</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold text-slate-400">Drift from target</p>
          <p className="mt-2 text-3xl font-extrabold text-[#65A30D] tracking-tight">+2.4%</p>
          <p className="mt-1 text-xs text-slate-400">Inside configured rebalance band</p>
        </Card>
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-slate-900">Assets</h2>
            <p className="text-xs text-slate-400">Balance and estimated value</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {tokens.map((token) => (
            <div key={token.symbol} className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-10 h-10 rounded-2xl grid place-items-center font-bold text-base ${token.color}`}>
                  {token.mark}
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800">{token.symbol}</p>
                  <p className="text-[10px] text-slate-400">{token.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-800">{token.balance} {token.symbol}</p>
                <p className="text-[10px] text-slate-400">{token.value} · <span className="text-[#65A30D] font-bold">{token.change}</span></p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

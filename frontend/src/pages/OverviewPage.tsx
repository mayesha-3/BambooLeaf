import { useState, useMemo, useEffect } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import LiveRatesConverterCard from '../features/market/LiveRatesConverterCard'
import { apiBaseUrl } from '../config/api'
import type { AuditState, Page, UserProfile } from '../types'

type WalletBalance = {
  address: string
  balanceEth: string
  chainId: number
}

type WalletState = {
  balance: WalletBalance | null
  loading: boolean
  error: string
}

type ActivityBucket = {
  label: string
  rangeLabel: string
  blocked: number
  confirmed: number
  other: number
  total: number
  height: number
}

function isBlockedEvent(type: string) {
  return /blocked|denied|failed|invalid/.test(type.toLowerCase())
}

function isConfirmedEvent(type: string) {
  return /confirmed|executed/.test(type.toLowerCase())
}

function getActivityStatus(type: string): { label: string; tone: 'red' | 'amber' | 'green' | 'neutral' } {
  const normalized = type.toLowerCase()
  if (isBlockedEvent(normalized)) return { label: 'Blocked', tone: 'red' }
  if (normalized.includes('approval.required')) return { label: 'Needs approval', tone: 'amber' }
  if (isConfirmedEvent(normalized)) return { label: 'Confirmed', tone: 'green' }
  return { label: 'Logged', tone: 'neutral' }
}

function formatActivityRange(start: Date, end: Date) {
  const format = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${format(start)} – ${format(end)}`
}

export default function OverviewPage({
  onNavigate,
  auditState,
  onOpenGoalModal,
  userProfile,
}: {
  onNavigate: (page: Page) => void
  auditState: AuditState
  onOpenGoalModal: (prompt?: string) => void
  userProfile?: UserProfile
}) {
  const displayCardName = userProfile?.cardName || (userProfile?.name ? `${userProfile.name.toUpperCase()} · OWNER` : 'MAYES · OWNER')
  const [walletState, setWalletState] = useState<WalletState>({ balance: null, loading: true, error: '' })
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | '90d'>('7d')
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(6)
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0)

  // Fetch Live Wallet Balance
  useEffect(() => {
    const controller = new AbortController()
    async function loadWalletBalance() {
      try {
        const response = await fetch(`${apiBaseUrl}/wallet/balance`, { signal: controller.signal })
        const payload = await response.json().catch(() => null) as (WalletBalance & { error?: string }) | null
        if (!response.ok) throw new Error(payload?.error || `Wallet API returned ${response.status}`)
        if (
          !payload ||
          typeof payload.address !== 'string' ||
          typeof payload.balanceEth !== 'string' ||
          !Number.isFinite(Number(payload.balanceEth)) ||
          typeof payload.chainId !== 'number' ||
          !Number.isInteger(payload.chainId)
        ) {
          throw new Error('Wallet API returned an invalid balance response.')
        }
        setWalletState({ balance: payload, loading: false, error: '' })
      } catch (error) {
        if (controller.signal.aborted) return
        setWalletState({
          balance: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load wallet balance.',
        })
      }
    }
    void loadWalletBalance()
    return () => controller.abort()
  }, [])

  // Calculate Activity Chart Data
  const daysData = useMemo<ActivityBucket[]>(() => {
    const rangeDays = Number(chartPeriod.slice(0, -1))
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    const start = new Date(end)
    start.setDate(start.getDate() - rangeDays + 1)
    start.setHours(0, 0, 0, 0)
    const bucketSize = (end.getTime() - start.getTime() + 1) / 7
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const bucketStart = new Date(start.getTime() + bucketSize * index)
      const bucketEnd = new Date(Math.min(end.getTime(), start.getTime() + bucketSize * (index + 1) - 1))
      return {
        label: bucketStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        rangeLabel: formatActivityRange(bucketStart, bucketEnd),
        blocked: 0,
        confirmed: 0,
        other: 0,
        total: 0,
        height: 0,
      }
    })

    for (const entry of auditState.entries) {
      const timestamp = new Date(entry.createdAt).getTime()
      if (!Number.isFinite(timestamp) || timestamp < start.getTime() || timestamp > end.getTime()) continue
      const index = Math.min(6, Math.floor((timestamp - start.getTime()) / bucketSize))
      const bucket = buckets[index]
      if (isBlockedEvent(entry.type)) bucket.blocked += 1
      else if (isConfirmedEvent(entry.type)) bucket.confirmed += 1
      else bucket.other += 1
      bucket.total += 1
    }

    const maxTotal = Math.max(1, ...buckets.map((bucket) => bucket.total))
    return buckets.map((bucket) => ({ ...bucket, height: bucket.total ? Math.max(8, (bucket.total / maxTotal) * 140) : 0 }))
  }, [auditState.entries, chartPeriod])

  const lineMax = Math.max(1, ...daysData.map((bucket) => bucket.total))
  const linePoints = daysData.map((bucket, index) => ({
    x: 10 + (index * 480) / (daysData.length - 1),
    y: 110 - (bucket.total / lineMax) * 100,
  }))
  const linePath = linePoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ')
  const lineAreaPath = `${linePath} L 490,120 L 10,120 Z`
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentAuditEntries = auditState.entries.filter((entry) => {
    const timestamp = new Date(entry.createdAt).getTime()
    return Number.isFinite(timestamp) && timestamp >= weekAgo
  })
  const blockedThisWeek = recentAuditEntries.filter((entry) => isBlockedEvent(entry.type)).length
  const approvalRequestsThisWeek = recentAuditEntries.filter((entry) => entry.type.toLowerCase() === 'approval.required').length
  const walletAddress = walletState.balance?.address || ''
  const formattedBalance = walletState.balance
    ? `${Number(walletState.balance.balanceEth).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ETH`
    : '0.0000 ETH'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ================= LEFT & CENTER (8 COLUMNS) ================= */}
        <div className="xl:col-span-8 space-y-6">

          {/* Hero Balance Chart */}
          <Card className="p-6 sm:p-7">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {walletState.loading ? 'Loading…' : formattedBalance}
                    </h2>
                    <p className="text-xs font-semibold text-slate-400 mt-1">
                      {walletState.error || (walletState.balance ? `Native wallet balance · Chain ${walletState.balance.chainId}` : 'Native wallet balance')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        aria-label="Time period"
                        value={chartPeriod}
                        onChange={(e) => setChartPeriod(e.target.value as "7d" | "30d" | "90d")}
                        className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-1.5 pr-7 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none cursor-pointer shadow-sm">
                        <option value="7d">7d</option>
                        <option value="30d">30d</option>
                        <option value="90d">90d</option>
                      </select>
                    </div>

                    <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
                      <button
                        onClick={() => setChartType("bar")}
                        className={`p-1.5 rounded-lg transition ${chartType === "bar" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
                        title="Bar view">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <rect x="3" y="12" width="4" height="8" rx="1" />
                          <rect x="10" y="6" width="4" height="14" rx="1" />
                          <rect x="17" y="2" width="4" height="18" rx="1" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setChartType("line")}
                        className={`p-1.5 rounded-lg transition ${chartType === "line" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
                        title="Line view">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Chart Logic (Bar & Line) */}
                <div className="relative pt-6 pb-2">
                  <div className="absolute left-0 inset-y-0 flex flex-col justify-between text-[11px] font-semibold text-slate-400 pb-7 pointer-events-none">
                    <span>{lineMax}</span>
                    <span>{Math.round(lineMax * 0.75)}</span>
                    <span>{Math.round(lineMax * 0.5)}</span>
                    <span>0</span>
                    <span />
                  </div>

                  <div className="ml-7 flex flex-col justify-between h-44 absolute inset-x-0 top-7 pointer-events-none">
                    <div className="border-b border-slate-100 dark:border-slate-800/60 w-full" />
                    <div className="border-b border-slate-100 dark:border-slate-800/60 w-full" />
                    <div className="border-b border-slate-100 dark:border-slate-800/60 w-full" />
                    <div className="border-b border-slate-200/80 dark:border-slate-700/60 w-full" />
                    <div className="border-b border-slate-100 dark:border-slate-800/60 w-full" />
                  </div>

                  {chartType === "bar" ? (
                    <div className="ml-7 relative h-44 flex items-end justify-between px-2 sm:px-4">
                      {daysData.map((item, index) => {
                        const isSelected = selectedDayIndex === index;
                        return (
                          <div
                            key={item.label}
                            onClick={() => setSelectedDayIndex(index)}
                            className="relative flex flex-col items-center group cursor-pointer h-full justify-end">
                            {isSelected && (
                              <div className="absolute -top-16 sm:-top-20 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 border border-slate-100 dark:border-slate-800 shadow-lg min-w-[150px]">
                                <p className="text-[10px] font-bold text-slate-400 mb-1.5">{item.rangeLabel}</p>
                                <div className="space-y-1 text-[11px] font-bold">
                                  <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-[#EAB308]" /> Blocked</span>
                                    <span className="text-slate-900 dark:text-white">{item.blocked}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-[#84CC16]" /> Confirmed</span>
                                    <span className="text-slate-900 dark:text-white">{item.confirmed}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-[#FB923C]" /> Other</span>
                                    <span className="text-slate-900 dark:text-white">{item.other}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="w-7 sm:w-9 flex flex-col justify-end items-center relative h-full">
                              <div className="w-full h-full bg-[#F3F5F7] dark:bg-slate-800/70 rounded-full absolute inset-0 transition group-hover:bg-[#EAEFF4] dark:group-hover:bg-slate-700/60" />
                              {isSelected ? (
                                <div className="w-full z-10 flex flex-col rounded-2xl overflow-hidden shadow-sm" style={{ height: `${item.height}px` }}>
                                  {item.blocked > 0 && <div className="bg-[#EAB308] w-full" style={{ height: `${(item.blocked / item.total) * 100}%` }} />}
                                  {item.confirmed > 0 && <div className="bg-[#84CC16] w-full" style={{ height: `${(item.confirmed / item.total) * 100}%` }} />}
                                  {item.other > 0 && <div className="bg-[#FB923C] w-full" style={{ height: `${(item.other / item.total) * 100}%` }} />}
                                </div>
                              ) : (
                                <div className="w-full z-10 rounded-2xl transition-all duration-300 group-hover:opacity-100 opacity-0 bg-lime-200/50" style={{ height: `${item.height * 0.7}px` }} />
                              )}
                            </div>
                            <span className={`mt-3 text-[11px] font-bold transition ${isSelected ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"}`}>
                              {item.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="ml-7 relative h-44 flex flex-col justify-end">
                      <svg className="w-full h-36 overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#84CC16" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#84CC16" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <path d={linePath} fill="none" stroke="#84CC16" strokeWidth="3.5" strokeLinecap="round" />
                        <path d={lineAreaPath} fill="url(#chartGradient)" />
                        {linePoints.map((point, index) => (
                          <circle key={daysData[index].label} cx={point.x} cy={point.y} r={index === selectedDayIndex ? 6 : 3} fill="#84CC16" stroke="#FFFFFF" strokeWidth="3" onClick={() => setSelectedDayIndex(index)} className="cursor-pointer" />
                        ))}
                      </svg>
                      <div className="flex justify-between px-2 pt-3 text-[11px] font-bold text-slate-400">
                        {daysData.map((item) => (
                          <span key={item.label}>{item.label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Stats */}
              <div className="lg:col-span-4 flex flex-col justify-between lg:border-l lg:border-slate-100 dark:lg:border-slate-800/80 lg:pl-7 pt-4 lg:pt-0 space-y-6">
                <div>
                  <p className="text-xs font-bold text-slate-400">Audit events · last 7 days</p>
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
                    {auditState.loading ? '—' : recentAuditEntries.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400">Approval requests · last 7 days</p>
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
                    {auditState.loading ? '—' : approvalRequestsThisWeek}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400">Blocked by guard</p>
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
                    {auditState.loading ? '—' : blockedThisWeek}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Guardrail Limits Card (Replaces Fake Limits) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Daily spending limit</h3>
                <p className="text-xs text-slate-400 mt-0.5">Policy firewall</p>
                <div className="mt-8">
                  <div className="w-full bg-[#F3F5F7] dark:bg-slate-800/80 h-5 rounded-full overflow-hidden p-1 flex items-center">
                    <div className="bg-[#84CC16] h-full rounded-full transition-all duration-500 shadow-sm" style={{ width: '0%' }} />
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-500 dark:text-slate-400 mt-3">
                    <span className="text-slate-800 dark:text-slate-200">Usage unavailable</span>
                    <span className="text-slate-400 dark:text-slate-500">API not connected</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 flex items-center justify-between gap-4">
              <div className="space-y-3 max-w-[240px]">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Earned autonomy</h3>
                  <Badge tone="neutral">Active</Badge>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Autonomy level updates based on clean executions.
                </p>
                <button onClick={() => onNavigate("autonomy")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-white hover:underline pt-1">
                  View autonomy details <Icon name="arrow" size={13} />
                </button>
              </div>
            </Card>

            <Card className="p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Guardrail limits</h3>
                <div className="mt-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Per-Transaction Cap</p>
                  <div className="mt-2.5 flex items-start gap-3">
                    <div className="flex-1">
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-1.5">
                        <div className="bg-[#84CC16] h-full rounded-full" style={{ width: '100%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <LiveRatesConverterCard onOpenGoalModal={onOpenGoalModal} />
        </div>

        {/* ================= RIGHT COLUMN (4 COLUMNS) ================= */}
        <div className="xl:col-span-4 space-y-6">
          <Card className="p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Guarded wallet</h3>
                <p className="text-xs text-slate-400 mt-0.5">Quick actions · Chain {walletState.balance?.chainId ?? '—'}</p>
              </div>
              <button onClick={() => onNavigate("wallet")} className="text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1">
                View wallet
              </button>
            </div>

            {/* Ultra-Realistic Bank Card Widget */}
            <div className="relative pt-1 pb-2">
              <div className="flex gap-3 items-center">
                {/* Active Card Container */}
                {activeCardIndex === 0 ? (
                  /* Primary: Realistic Lime-Green Satin Polymer Debit Card */
                  <div
                    onClick={() => setActiveCardIndex(0)}
                    className="w-full max-w-[340px] aspect-[1.586/1] shrink-0 rounded-[18px] p-5 text-white relative overflow-hidden transition-all duration-300 cursor-pointer select-none border border-white/30 shadow-[0_20px_40px_-8px_rgba(101,163,13,0.45),0_8px_16px_-4px_rgba(0,0,0,0.12)] hover:shadow-[0_24px_48px_-6px_rgba(101,163,13,0.55),0_10px_20px_rgba(0,0,0,0.15)] flex flex-col justify-between"
                    style={{ background: "linear-gradient(135deg, #82C91E 0%, #65A30D 48%, #497409 100%)" }}>
                    {/* Specular Gloss Sheen */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none" />
                    <div className="flex justify-between items-start z-10">
                      <div className="flex items-center gap-2">
                        {/* EMV Smart Chip */}
                        <div className="w-[45px] h-[33px] rounded-md bg-gradient-to-br from-[#FFE898] via-[#F4C430] to-[#A36A00] p-[2px] shadow-[inset_0_1px_2px_rgba(255,255,255,0.7),0_2px_4px_rgba(0,0,0,0.35)] relative overflow-hidden border border-[#8C5800]">
                          <div className="w-full h-full border border-[#6E4200]/40 rounded-[3px] flex flex-col justify-between p-1 bg-gradient-to-tr from-amber-400/20 to-yellow-200/30">
                            <div className="flex justify-between items-center h-full">
                              <div className="w-3.5 h-full border-r border-[#6E4200]/40 flex flex-col justify-around">
                                <div className="w-full h-[1px] bg-[#6E4200]/40" />
                                <div className="w-full h-[1px] bg-[#6E4200]/40" />
                              </div>
                              <div className="w-2.5 h-2.5 rounded-full border border-[#6E4200]/50 bg-gradient-to-br from-yellow-100 to-amber-300" />
                              <div className="w-3.5 h-full border-l border-[#6E4200]/40 flex flex-col justify-around">
                                <div className="w-full h-[1px] bg-[#6E4200]/40" />
                                <div className="w-full h-[1px] bg-[#6E4200]/40" />
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Hologram Patch */}
                        <div className="w-7 h-5 rounded-[4px] bg-gradient-to-tr from-cyan-300 via-pink-400 to-amber-200 opacity-90 shadow-inner flex items-center justify-center p-0.5 border border-white/50">
                          <div className="w-full h-full bg-white/20 rounded-[2px] flex items-center justify-center text-[6px] font-black text-slate-800 tracking-tighter">FINE</div>
                        </div>
                      </div>
                      <span className="text-2xl font-black italic tracking-tighter text-white font-serif">EVM</span>
                    </div>
                    <div className="z-10 mt-1">
                      <p className="font-mono text-[16px] sm:text-[17px] tracking-[0.22em] text-white font-bold select-none">
                        {walletAddress ? `${walletAddress.slice(0, 10)}…${walletAddress.slice(-8)}` : 'Wallet address unavailable'}
                      </p>
                    </div>
                    <div className="flex justify-between items-end z-10 pt-1">
                      <div>
                        <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-lime-200/80">Cardholder</p>
                        <p className="text-xs font-bold tracking-wider text-white uppercase">{displayCardName}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-lime-200/80">Chain ID</p>
                        <p className="text-xs font-mono font-bold text-white">{walletState.balance?.chainId ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Secondary: Brushed Obsidian Titanium Card */
                  <div
                    onClick={() => setActiveCardIndex(1)}
                    className="w-full max-w-[340px] aspect-[1.586/1] shrink-0 rounded-[18px] p-5 text-white relative overflow-hidden transition-all duration-300 cursor-pointer select-none border border-slate-700/60 shadow-[0_20px_40px_-8px_rgba(15,23,42,0.6),0_8px_16px_rgba(0,0,0,0.3)] flex flex-col justify-between"
                    style={{ background: "linear-gradient(135deg, #2D3748 0%, #1A202C 50%, #0F172A 100%)" }}>
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
                    <div className="flex justify-between items-start z-10">
                      <span className="text-[11px] font-semibold tracking-wider text-slate-400/80 uppercase">Credit Card</span>
                      <span className="text-2xl font-black italic tracking-tighter text-slate-300 font-serif">EVM</span>
                    </div>
                    <div className="z-10 mt-1">
                      <p className="font-mono text-[16px] sm:text-[17px] tracking-[0.22em] text-slate-200 font-bold select-none">
                        {walletAddress ? `${walletAddress.slice(0, 10)}…${walletAddress.slice(-8)}` : 'Wallet address unavailable'}
                      </p>
                    </div>
                    <div className="flex justify-between items-end z-10 pt-1">
                      <div>
                        <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-slate-500">Cardholder</p>
                        <p className="text-xs font-bold tracking-wider text-slate-300 uppercase">{displayCardName}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-slate-500">Chain ID</p>
                        <p className="text-xs font-mono font-bold text-slate-300">{walletState.balance?.chainId ?? '—'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Secondary Card Peek Strip — Toggle Button */}
                <div
                  onClick={() => setActiveCardIndex((prev) => (prev === 0 ? 1 : 0))}
                  className="w-11 h-44 rounded-2xl p-2 flex flex-col justify-between items-center cursor-pointer transition-all duration-200 hover:scale-[1.03] shadow-md border border-slate-200/80 dark:border-slate-700/80"
                  style={{
                    background: activeCardIndex === 0
                      ? "linear-gradient(180deg, #1E293B 0%, #0F172A 100%)"
                      : "linear-gradient(180deg, #84CC16 0%, #65A30D 100%)",
                  }}
                  title={activeCardIndex === 0 ? "Switch to Obsidian Credit Card" : "Switch to Lime Debit Card"}>
                  <span className="text-[9px] font-extrabold uppercase text-white/90 [writing-mode:vertical-rl] rotate-180 tracking-widest pt-1">
                    {activeCardIndex === 0 ? "Credit Card" : "Debit Card"}
                  </span>
                  <span className="text-[10px] text-white/80 font-bold">⇄</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-5 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <button onClick={() => onNavigate("transact")} className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-700 group-hover:bg-[#84CC16] group-hover:text-white transition">
                  <Icon name="send" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600">Send</span>
              </button>

              <button onClick={() => onNavigate("transact")} className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-700 group-hover:bg-[#84CC16] group-hover:text-white transition">
                  <Icon name="refresh" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600">Swap</span>
              </button>

              <button onClick={() => onNavigate("approvals")} className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-700 group-hover:bg-[#84CC16] group-hover:text-white transition">
                  <Icon name="check" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600">Approvals</span>
              </button>

              <button onClick={() => onNavigate("policy")} className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-700 group-hover:bg-[#84CC16] group-hover:text-white transition">
                  <Icon name="shield" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600">Policy</span>
              </button>

              <button onClick={() => onNavigate("autonomy")} className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-700 group-hover:bg-[#84CC16] group-hover:text-white transition">
                  <Icon name="spark" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600">Autonomy</span>
              </button>
            </div>
          </Card>

          {/* Recent Activity */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent activity</h3>
              <button onClick={() => onNavigate("activity")} className="text-xs font-bold text-[#65A30D] hover:underline">
                View all →
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {auditState.entries.length > 0 ? (
                auditState.entries.slice(0, 5).map((entry) => {
                  const status = getActivityStatus(entry.type)
                  return (
                    <div key={`${entry.seq}-${entry.hash}`} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${status.tone === 'red' ? 'bg-rose-50 text-rose-600' : status.tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-lime-50 text-[#65A30D]'}`}>
                          <Icon name={status.tone === 'red' ? "shield" : "activity"} size={15} />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-800 capitalize">{entry.type.replaceAll(".", " ")}</p>
                          <p className="text-[10px] text-slate-400">{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                  )
                })
              ) : (
                <p className="py-6 text-center text-xs text-slate-400">No audit activity recorded yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
import { useState, useMemo } from 'react'
import Icon from '../components/ui/Icon'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import GoalComposer from '../components/GoalComposer'
import type { AuditState, Page, IconName, UserProfile } from '../types'

const demoActivity = [
  { title: 'Daily allocation check', detail: 'Read-only · ETH / USDC', time: '2 min ago', status: 'Completed', tone: 'green', icon: 'activity' as IconName },
  { title: 'Swap 12 USDC → ETH', detail: 'Awaiting your review · T2 approval', time: '18 min ago', status: 'Needs approval', tone: 'amber', icon: 'clock' as IconName },
  { title: 'Transfer 0.008 ETH', detail: 'Saved recipient · policy passed', time: '1 hour ago', status: 'Confirmed', tone: 'green', icon: 'send' as IconName },
  { title: 'Unrecognized recipient blocked', detail: 'Policy firewall · address not allow-listed', time: 'Yesterday', status: 'Blocked', tone: 'red', icon: 'shield' as IconName },
]

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
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | '90d'>('7d')
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(3) // Wednesday selected by default
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0)

  // Chart daily activity data (Sepolia activity & balance trend matching Shakuro chart layout)
  const daysData = useMemo(
    () => [
      { day: 'Sun', date: 'Sun, 11 Oct', savings: 400, income: 1200, expenses: 310, height: 60 },
      { day: 'Mon', date: 'Mon, 12 Oct', savings: 650, income: 1450, expenses: 480, height: 80 },
      { day: 'Tue', date: 'Tue, 13 Oct', savings: 500, income: 1600, expenses: 390, height: 95 },
      { day: 'Wed', date: 'Wed, 14 Oct', savings: 840, income: 2100, expenses: 540, height: 140 }, // Wednesday active
      { day: 'Thu', date: 'Thu, 15 Oct', savings: 720, income: 1800, expenses: 420, height: 85 },
      { day: 'Fri', date: 'Fri, 16 Oct', savings: 900, income: 2300, expenses: 610, height: 110 },
      { day: 'Sat', date: 'Sat, 17 Oct', savings: 600, income: 1500, expenses: 350, height: 75 },
    ],
    []
  )

  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null)
  const [quickPayAmount, setQuickPayAmount] = useState<string>('25')
  const [quickPaySuccess, setQuickPaySuccess] = useState<string | null>(null)

  const quickPayContacts = [
    { name: 'Fab iya', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', address: '0x7099…79C8' },
    { name: 'Mayesha', img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80', address: '0x3C44…93BC' },
    { name: 'Araf', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80', address: '0x90F7…9b14' },
    { name: 'Razty', img: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&auto=format&fit=crop&q=80', address: '0x15d3…d34f' },
    { name: 'Humu', img: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80', address: '0x9965…6025' },
    { name: 'Ronaldo', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80', address: '0x976E…e3c2' },
  ]

  return (
    <div className="space-y-6">
      {/* 3-Column Shakuro Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ================= LEFT & CENTER (8 COLUMNS) ================= */}
        <div className="xl:col-span-8 space-y-6">
          {/* 4. ASK BAMBOOLAF (Goal Composer) CARD */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-lime-50 dark:bg-lime-950/50 text-[#65A30D] dark:text-lime-400 flex items-center justify-center">
                  <Icon name="spark" size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Ask BambooLeaf
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-400">
                    Describe a goal. Guardrails always validate
                    deterministically.
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate("policy")}
                className="text-xs font-bold text-slate-500 hover:text-[#65A30D] dark:text-slate-400 dark:hover:text-lime-400 flex items-center gap-1">
                Policy rules apply <Icon name="chevron" size={13} />
              </button>
            </div>
            <GoalComposer onSubmitted={() => onNavigate("activity")} />
          </Card>

          {/* 1. HERO BALANCE OVERVIEW & CHART CARD (Shakuro design layout) */}
          <Card className="p-6 sm:p-7">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Main Chart Area (8 cols inside card) */}
              <div className="lg:col-span-8 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      $2,840.60
                    </h2>
                    <p className="text-xs font-semibold text-slate-400 mt-1">
                      Guarded wallet balance · Sepolia testnet
                    </p>
                  </div>

                  {/* Dropdown + Bar/Line Switcher */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        aria-label="Time period"
                        value={chartPeriod}
                        onChange={(e) =>
                          setChartPeriod(e.target.value as "7d" | "30d" | "90d")
                        }
                        className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-1.5 pr-7 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none cursor-pointer shadow-sm">
                        <option value="7d">7d</option>
                        <option value="30d">30d</option>
                        <option value="90d">90d</option>
                      </select>
                      <svg
                        className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>

                    <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
                      <button
                        onClick={() => setChartType("bar")}
                        className={`p-1.5 rounded-lg transition ${chartType === "bar" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
                        title="Bar view">
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}>
                          <rect x="3" y="12" width="4" height="8" rx="1" />
                          <rect x="10" y="6" width="4" height="14" rx="1" />
                          <rect x="17" y="2" width="4" height="18" rx="1" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setChartType("line")}
                        className={`p-1.5 rounded-lg transition ${chartType === "line" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
                        title="Line view">
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 17l6-6 4 4 8-8"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center justify-end gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#EAB308]" />{" "}
                    Savings (USDC)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#84CC16]" />{" "}
                    Inflow (ETH)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FB923C]" />{" "}
                    Guarded Outflow
                  </span>
                </div>

                {/* The Chart Canvas */}
                <div className="relative pt-6 pb-2">
                  <div className="absolute left-0 inset-y-0 flex flex-col justify-between text-[11px] font-semibold text-slate-400 pb-7 pointer-events-none">
                    <span>30</span>
                    <span>20</span>
                    <span>10</span>
                    <span>0</span>
                    <span>-10</span>
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
                            key={item.day}
                            onClick={() => setSelectedDayIndex(index)}
                            className="relative flex flex-col items-center group cursor-pointer h-full justify-end">
                            {isSelected && (
                              <div className="absolute -top-16 sm:-top-20 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 border border-slate-100 dark:border-slate-800 shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.5)] min-w-[150px] animate-in fade-in zoom-in-95">
                                <p className="text-[10px] font-bold text-slate-400 mb-1.5">
                                  {item.date}
                                </p>
                                <div className="space-y-1 text-[11px] font-bold">
                                  <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#EAB308]" />{" "}
                                      Savings
                                    </span>
                                    <span className="text-slate-900 dark:text-white">
                                      ${item.savings}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#84CC16]" />{" "}
                                      Inflow
                                    </span>
                                    <span className="text-slate-900 dark:text-white">
                                      ${item.income}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#FB923C]" />{" "}
                                      Outflow
                                    </span>
                                    <span className="text-slate-900 dark:text-white">
                                      ${item.expenses}
                                    </span>
                                  </div>
                                </div>
                                <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 bg-white dark:bg-slate-900 rotate-45 border-r border-b border-slate-100 dark:border-slate-800" />
                              </div>
                            )}

                            <div className="w-7 sm:w-9 flex flex-col justify-end items-center relative h-full">
                              <div className="w-full h-full bg-[#F3F5F7] dark:bg-slate-800/70 rounded-full absolute inset-0 transition group-hover:bg-[#EAEFF4] dark:group-hover:bg-slate-700/60" />
                              {isSelected ? (
                                <div
                                  className="w-full z-10 flex flex-col rounded-2xl overflow-hidden shadow-sm"
                                  style={{ height: `${item.height}px` }}>
                                  <div className="h-[22%] bg-[#EAB308] w-full" />
                                  <div className="h-[52%] bg-[#84CC16] w-full" />
                                  <div className="h-[26%] bg-[#FB923C] w-full" />
                                </div>
                              ) : (
                                <div
                                  className="w-full z-10 rounded-2xl transition-all duration-300 group-hover:opacity-100 opacity-0 bg-lime-200/50"
                                  style={{ height: `${item.height * 0.7}px` }}
                                />
                              )}
                            </div>

                            <span
                              className={`mt-3 text-[11px] font-bold transition ${isSelected ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"}`}>
                              {item.day}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="ml-7 relative h-44 flex flex-col justify-end">
                      <svg
                        className="w-full h-36 overflow-visible"
                        viewBox="0 0 500 120"
                        preserveAspectRatio="none">
                        <defs>
                          <linearGradient
                            id="chartGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1">
                            <stop
                              offset="0%"
                              stopColor="#84CC16"
                              stopOpacity="0.28"
                            />
                            <stop
                              offset="100%"
                              stopColor="#84CC16"
                              stopOpacity="0.0"
                            />
                          </linearGradient>
                        </defs>
                        <path
                          d="M 10,80 Q 80,60 160,75 T 250,20 T 340,65 T 420,40 T 490,50"
                          fill="none"
                          stroke="#84CC16"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 10,80 Q 80,60 160,75 T 250,20 T 340,65 T 420,40 T 490,50 L 490,120 L 10,120 Z"
                          fill="url(#chartGradient)"
                        />
                        <circle
                          cx="250"
                          cy="20"
                          r="6"
                          fill="#84CC16"
                          stroke="#FFFFFF"
                          strokeWidth="3"
                        />
                      </svg>
                      <div className="flex justify-between px-2 pt-3 text-[11px] font-bold text-slate-400">
                        {daysData.map((d) => (
                          <span key={d.day}>{d.day}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side Stats Column (Our 3 key metrics styled in Shakuro's layout) */}
              <div className="lg:col-span-4 flex flex-col justify-between lg:border-l lg:border-slate-100 dark:lg:border-slate-800/80 lg:pl-7 pt-4 lg:pt-0 space-y-6">
                <div>
                  <p className="text-xs font-bold text-slate-400">
                    Actions this week
                  </p>
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
                    24
                  </p>
                  <p className="text-xs font-bold text-[#65A30D] dark:text-lime-400 flex items-center gap-1 mt-1.5">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 17l10-10M7 7h10v10"
                      />
                    </svg>
                    +6{" "}
                    <span className="text-slate-400 font-normal">
                      from last week
                    </span>
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400">
                    Awaiting approval
                  </p>
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
                    2
                  </p>
                  <p className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1.5">
                    <Icon name="clock" size={13} />
                    One expires in 4 min
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400">
                    Blocked by guard
                  </p>
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
                    3
                  </p>
                  <p className="text-xs font-bold text-[#65A30D] dark:text-lime-400 flex items-center gap-1 mt-1.5">
                    <Icon name="shield" size={13} />
                    All caught before signing
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* 2. MIDDLE ROW (2 CARDS) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Card: Spending Limit (Shakuro design style applied to BambooLeaf policy cap) */}
            <Card className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Daily spending limit
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Policy firewall · Sepolia
                    </p>
                  </div>
                  <button
                    onClick={() => onNavigate("policy")}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg transition"
                    title="Edit policy limit">
                    <Icon name="edit" size={16} />
                  </button>
                </div>

                <div className="mt-8">
                  <div className="w-full bg-[#F3F5F7] dark:bg-slate-800/80 h-5 rounded-full overflow-hidden p-1 flex items-center">
                    <div
                      className="bg-[#84CC16] h-full rounded-full transition-all duration-500 shadow-sm"
                      style={{ width: "43.6%" }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-500 dark:text-slate-400 mt-3">
                    <span className="text-slate-800 dark:text-slate-200">$65.40 used</span>
                    <span className="text-slate-400 dark:text-slate-500">$150.00 cap</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Right Card: Earned Autonomy (Shakuro quick tips & mosaic style applied to BambooLeaf Autonomy) */}
            <Card className="p-6 flex items-center justify-between gap-4">
              <div className="space-y-3 max-w-[240px]">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Earned autonomy
                  </h3>
                  <Badge tone="green">L2 · Standard</Badge>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Trust is earned through clean behaviour. 7 clean actions
                  completed towards L3.
                </p>
                <button
                  onClick={() => onNavigate("autonomy")}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-white hover:underline pt-1">
                  View autonomy details
                  <Icon name="arrow" size={13} />
                </button>
              </div>

              {/* Decorative Geometric Mosaic Pattern from Shakuro design */}
              <div className="grid grid-cols-3 gap-1.5 shrink-0 w-24 h-24 p-2 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl">
                <div className="rounded-lg bg-lime-100/60" />
                <div className="rounded-lg bg-[#A3E635]" />
                <div className="rounded-lg bg-lime-200" />
                <div className="rounded-lg bg-[#84CC16]" />
                <div className="rounded-lg bg-[#65A30D]" />
                <div className="rounded-lg bg-lime-300" />
                <div className="rounded-lg bg-lime-100" />
                <div className="rounded-lg bg-[#84CC16]/80" />
                <div className="rounded-lg bg-lime-200/50" />
              </div>
            </Card>
          </div>

          {/* 3. BOTTOM ROW (3 CARDS) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Portfolio Allocation (Shakuro Cost Analysis style) */}
            <Card className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Portfolio allocation
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Sepolia testnet
                    </p>
                  </div>
                  <button
                    onClick={() => onNavigate("wallet")}
                    className="text-xs font-bold text-[#65A30D] dark:text-lime-400 hover:underline">
                    Wallet →
                  </button>
                </div>

                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-4">
                  $2,840.60
                </p>

                {/* Progress bar */}
                <div className="mt-4 flex h-3 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 gap-0.5">
                  <span className="bg-[#84CC16] w-[62%]" title="ETH: 62%" />
                  <span className="bg-[#0284C7] w-[38%]" title="USDC: 38%" />
                </div>

                <div className="mt-5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#84CC16]" />{" "}
                      Sepolia ETH
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      62% · $1,761.17
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7]" />{" "}
                      USD Coin (USDC)
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      38% · $1,079.43
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-400">
                    <span>Target Drift</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">+2.4%</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Card 2: Autonomy Health & Gauge (Shakuro Financial Health style) */}
            <Card className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Autonomy health
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Clean action streak
                    </p>
                  </div>
                  <Badge tone="green">L2 Active</Badge>
                </div>

                <div className="flex items-baseline gap-2 mt-4">
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    7 / 10
                  </p>
                  <span className="text-[11px] font-bold text-[#65A30D] dark:text-lime-400">
                    ↗ +2 clean actions
                  </span>
                </div>

                {/* Circular Gauge Arc */}
                <div className="relative flex flex-col items-center justify-center mt-5">
                  <svg
                    className="w-44 h-28 overflow-visible"
                    viewBox="0 0 160 90">
                    <defs>
                      <linearGradient
                        id="gaugeGradient"
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0">
                        <stop offset="0%" stopColor="#FACC15" />
                        <stop offset="50%" stopColor="#A3E635" />
                        <stop offset="100%" stopColor="#84CC16" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 15 80 A 65 65 0 0 1 145 80"
                      fill="none"
                      className="stroke-slate-100 dark:stroke-slate-800"
                      strokeWidth="16"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 15 80 A 65 65 0 0 1 125 35"
                      fill="none"
                      stroke="url(#gaugeGradient)"
                      strokeWidth="16"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="text-center -mt-9">
                    <p className="text-3xl font-extrabold text-slate-900 dark:text-white">
                      70%
                    </p>
                    <p className="text-[11px] font-medium text-slate-400">
                      Clean action streak
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 mt-4 leading-relaxed text-center">
                3 clean actions remaining until promotion to Level L3 (Trusted)
              </p>
            </Card>

            {/* Card 3: Guarded Goals & Caps (Shakuro Goal Tracker style) */}
            <Card className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Guardrail limits
                  </h3>
                  <button
                    onClick={() => onOpenGoalModal()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-full px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                    + Plan goal
                  </button>
                </div>

                <div className="mt-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Per-Transaction Cap
                  </p>
                  <div className="mt-2.5 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-lime-50 dark:bg-lime-950/50 border border-lime-100 dark:border-lime-900/50 flex items-center justify-center shrink-0 text-lg">
                      🛡️
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Max per tx
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          $25.00
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-1.5">
                        <div
                          className="bg-[#84CC16] h-full rounded-full"
                          style={{ width: "48%" }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Enforced by deterministic policy
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Daily Aggregate Cap
                  </p>
                  <div className="mt-2.5 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900/50 flex items-center justify-center shrink-0 text-lg">
                      ⚡
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Daily total
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          $150.00
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-1.5">
                        <div
                          className="bg-[#FB923C] h-full rounded-full"
                          style={{ width: "43.6%" }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Resets at midnight UTC
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

         
        </div>

        {/* ================= RIGHT COLUMN (4 COLUMNS) ================= */}
        <div className="xl:col-span-4 space-y-6">
          {/* 1. GUARDED WALLET CARD & QUICK ACTIONS (Shakuro My Card layout) */}
          <Card className="p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Guarded wallet
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Quick actions · Sepolia
                </p>
              </div>
              <button
                onClick={() => onNavigate("wallet")}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                View wallet
              </button>
            </div>

            {/* Ultra-Realistic Bank Card Widget */}
            <div className="relative pt-1 pb-2">
              <div className="flex gap-3 items-center">
                {/* Active Card Container */}
                {activeCardIndex === 0 ? (
                  /* Primary: Realistic Lime-Green Satin Polymer Visa Debit Card */
                  <div
                    onClick={() => setActiveCardIndex(0)}
                    className="w-full max-w-[340px] aspect-[1.586/1] shrink-0 rounded-[18px] p-5 text-white relative overflow-hidden transition-all duration-300 cursor-pointer select-none border border-white/30 shadow-[0_20px_40px_-8px_rgba(101,163,13,0.45),0_8px_16px_-4px_rgba(0,0,0,0.12)] hover:shadow-[0_24px_48px_-6px_rgba(101,163,13,0.55),0_10px_20px_rgba(0,0,0,0.15)] flex flex-col justify-between"
                    style={{
                      background:
                        "linear-gradient(135deg, #82C91E 0%, #65A30D 48%, #497409 100%)",
                    }}>
                    {/* Realistic Specular Gloss Sheen */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none" />

                    {/* Security Micro-Guilloche Vector Contours */}
                    <svg
                      className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
                      viewBox="0 0 340 214"
                      fill="none">
                      <path
                        d="M-30,100 C50,30 130,170 210,90 C290,10 350,160 390,100"
                        stroke="white"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M-30,120 C50,50 130,190 210,110 C290,30 350,180 390,120"
                        stroke="white"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                      <path
                        d="M-30,140 C50,70 130,210 210,130 C290,50 350,200 390,140"
                        stroke="white"
                        strokeWidth="0.8"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="270"
                        cy="55"
                        r="70"
                        stroke="white"
                        strokeWidth="0.75"
                        strokeDasharray="3 3"
                      />
                    </svg>

                    {/* Card Top: Type & Official VISA Logo */}
                    <div className="flex justify-between items-start z-10">
                      <span className="text-[11px] font-semibold tracking-wider text-lime-50/90 uppercase drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
                        Debit card
                      </span>
                      <span className="text-2xl font-black italic tracking-tighter text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] font-serif">
                        VISA
                      </span>
                    </div>

                    {/* Card Center: Authentic Metallic Gold EMV Chip + Contactless Symbol */}
                    <div className="flex items-center gap-3 z-10 -mt-1">
                      {/* Realistic Gold EMV Smart Chip */}
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

                      {/* Contactless RFID Wave Symbol */}
                      <svg
                        className="w-5 h-5 text-white/80 rotate-90"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}>
                        <path
                          strokeLinecap="round"
                          d="M8.5 16.5a5 5 0 0 1 0-7"
                        />
                        <path
                          strokeLinecap="round"
                          d="M12 19a8.5 8.5 0 0 1 0-12"
                        />
                        <path
                          strokeLinecap="round"
                          d="M15.5 21.5a12 12 0 0 1 0-17"
                        />
                      </svg>
                    </div>

                    {/* Card Number: Authentic Embossed Style */}
                    <div className="z-10 mt-1">
                      <p className="font-mono text-[16px] sm:text-[17px] tracking-[0.22em] text-white font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] [text-shadow:_0_1px_1px_rgba(0,0,0,0.8),_0_-1px_0_rgba(255,255,255,0.4)]">
                        •••• &nbsp;•••• &nbsp;•••• &nbsp;7890
                      </p>
                    </div>

                    {/* Card Footer: Cardholder Name, Expiry, & Security Hologram */}
                    <div className="flex justify-between items-end z-10 pt-1">
                      <div>
                        <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-lime-200/80">
                          Cardholder
                        </p>
                        <p className="text-xs font-bold tracking-wider text-white uppercase drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                          {displayCardName}
                        </p>
                      </div>

                      <div className="text-left">
                        <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-lime-200/80">
                          Expires
                        </p>
                        <p className="text-xs font-mono font-bold text-white tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                          03/30
                        </p>
                      </div>

                      {/* Micro Hologram Patch */}
                      <div className="w-7 h-5 rounded-[4px] bg-gradient-to-tr from-cyan-300 via-pink-400 to-amber-200 opacity-90 shadow-inner flex items-center justify-center p-0.5 border border-white/50">
                        <div className="w-full h-full bg-white/20 rounded-[2px] flex items-center justify-center text-[6px] font-black text-slate-800 tracking-tighter">
                          FINE
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Secondary: Realistic Brushed Obsidian Titanium Card */
                  <div
                    onClick={() => setActiveCardIndex(1)}
                    className="w-full max-w-[340px] aspect-[1.586/1] shrink-0 rounded-[18px] p-5 text-white relative overflow-hidden transition-all duration-300 cursor-pointer select-none border border-slate-700/60 shadow-[0_20px_40px_-8px_rgba(15,23,42,0.6),0_8px_16px_rgba(0,0,0,0.3)] flex flex-col justify-between"
                    style={{
                      background:
                        "linear-gradient(135deg, #2D3748 0%, #1A202C 50%, #0F172A 100%)",
                    }}>
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />

                    <div className="flex justify-between items-start z-10">
                      <span className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
                        Credit card · Infinite
                      </span>
                      <span className="text-2xl font-black italic tracking-tighter text-slate-100 font-serif">
                        VISA
                      </span>
                    </div>

                    <div className="flex items-center gap-3 z-10 -mt-1">
                      {/* Platinum/Silver EMV Chip */}
                      <div className="w-[45px] h-[33px] rounded-md bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 p-[2px] shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.4)] relative overflow-hidden border border-slate-400">
                        <div className="w-full h-full border border-slate-500/40 rounded-[3px] flex flex-col justify-between p-1">
                          <div className="flex justify-between items-center h-full">
                            <div className="w-3.5 h-full border-r border-slate-500/40" />
                            <div className="w-2.5 h-2.5 rounded-full border border-slate-500/50 bg-slate-100" />
                            <div className="w-3.5 h-full border-l border-slate-500/40" />
                          </div>
                        </div>
                      </div>
                      <svg
                        className="w-5 h-5 text-slate-400 rotate-90"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}>
                        <path
                          strokeLinecap="round"
                          d="M8.5 16.5a5 5 0 0 1 0-7"
                        />
                        <path
                          strokeLinecap="round"
                          d="M12 19a8.5 8.5 0 0 1 0-12"
                        />
                        <path
                          strokeLinecap="round"
                          d="M15.5 21.5a12 12 0 0 1 0-17"
                        />
                      </svg>
                    </div>

                    <div className="z-10 mt-1">
                      <p className="font-mono text-[16px] sm:text-[17px] tracking-[0.22em] text-slate-200 font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                        •••• &nbsp;•••• &nbsp;•••• &nbsp;4102
                      </p>
                    </div>

                    <div className="flex justify-between items-end z-10 pt-1">
                      <div>
                        <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-slate-400">
                          Cardholder
                        </p>
                        <p className="text-xs font-bold tracking-wider text-slate-100 uppercase">
                          {displayCardName}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-slate-400">
                          Expires
                        </p>
                        <p className="text-xs font-mono font-bold text-slate-100 tracking-wider">
                          11/29
                        </p>
                      </div>
                      <div className="w-7 h-5 rounded-[4px] bg-gradient-to-tr from-slate-400 to-slate-200 opacity-80 shadow-inner flex items-center justify-center p-0.5 border border-white/30">
                        <span className="text-[6px] font-black text-slate-900">
                          VAULT
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Secondary Card Peek Strip to Toggle */}
                <div
                  onClick={() =>
                    setActiveCardIndex((prev) => (prev === 0 ? 1 : 0))
                  }
                  className="w-11 h-44 rounded-2xl p-2 flex flex-col justify-between items-center cursor-pointer transition-all duration-200 hover:scale-[1.03] shadow-md border border-slate-200/80 dark:border-slate-700/80"
                  style={{
                    background:
                      activeCardIndex === 0
                        ? "linear-gradient(180deg, #1E293B 0%, #0F172A 100%)"
                        : "linear-gradient(180deg, #84CC16 0%, #65A30D 100%)",
                  }}
                  title={
                    activeCardIndex === 0
                      ? "Switch to Obsidian Credit Card"
                      : "Switch to Lime Debit Card"
                  }>
                  <span className="text-[9px] font-extrabold uppercase text-white/90 [writing-mode:vertical-rl] rotate-180 tracking-widest pt-1">
                    {activeCardIndex === 0 ? "Credit Card" : "Debit Card"}
                  </span>
                  <span className="text-[10px] text-white/80 font-bold">⇄</span>
                </div>
              </div>
            </div>

            {/* 5 Quick Action Buttons in Shakuro style */}
            <div className="grid grid-cols-5 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <button
                onClick={() =>
                  onOpenGoalModal("Send 0.01 ETH to saved recipient")
                }
                className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:bg-[#84CC16] group-hover:text-white group-hover:border-[#84CC16] transition shadow-sm">
                  <Icon name="send" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
                  Send
                </span>
              </button>

              <button
                onClick={() => onOpenGoalModal("Swap 12 USDC to ETH")}
                className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:bg-[#84CC16] group-hover:text-white group-hover:border-[#84CC16] transition shadow-sm">
                  <Icon name="refresh" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
                  Swap
                </span>
              </button>

              <button
                onClick={() => onNavigate("approvals")}
                className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:bg-[#84CC16] group-hover:text-white group-hover:border-[#84CC16] transition shadow-sm">
                  <Icon name="check" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
                  Approvals
                </span>
              </button>

              <button
                onClick={() => onNavigate("policy")}
                className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:bg-[#84CC16] group-hover:text-white group-hover:border-[#84CC16] transition shadow-sm">
                  <Icon name="shield" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
                  Policy
                </span>
              </button>

              <button
                onClick={() => onNavigate("autonomy")}
                className="flex flex-col items-center gap-1.5 group">
                <div className="w-11 h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:bg-[#84CC16] group-hover:text-white group-hover:border-[#84CC16] transition shadow-sm">
                  <Icon name="spark" size={17} />
                </div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
                  Autonomy
                </span>
              </button>
            </div>

            {/* Quick Payment Section (Exact Shakuro Avatar Circles & Inline Payment Drawer) */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Quick payment
                </h4>
                <button
                  onClick={() => onOpenGoalModal("Send 0.01 ETH to ")}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg transition"
                  title="More payment options">
                  <Icon name="more" size={16} />
                </button>
              </div>

              {/* Avatar List matching Shakuro Dribbble Design */}
              <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
                {quickPayContacts.map((contact) => (
                  <button
                    key={contact.name}
                    onClick={() => {
                      setSelectedRecipient(contact.name);
                      setQuickPayAmount("25");
                    }}
                    className="flex flex-col items-center gap-1 group shrink-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-transparent group-hover:ring-[#84CC16] group-focus:ring-[#84CC16] transition p-0.5">
                      <img
                        src={contact.img}
                        alt={contact.name}
                        className="w-full h-full object-cover rounded-full"
                        loading="lazy"
                      />
                    </div>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
                      {contact.name}
                    </span>
                  </button>
                ))}
              </div>

              {/* Inline Quick Payment Drawer */}
              {selectedRecipient && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!quickPayAmount) return;
                    setQuickPaySuccess(
                      `Guarded transfer: $${quickPayAmount} sent to ${selectedRecipient} successfully!`,
                    );
                    setTimeout(() => {
                      setQuickPaySuccess(null);
                      setSelectedRecipient(null);
                    }, 3500);
                  }}
                  className="mt-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2.5 animate-in fade-in">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#84CC16]" />
                      Send to{" "}
                      <span className="text-[#65A30D] dark:text-lime-400">
                        {selectedRecipient}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedRecipient(null)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold">
                      ✕
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        $
                      </span>
                      <input
                        type="number"
                        min="1"
                        placeholder="Amount"
                        value={quickPayAmount}
                        onChange={(e) => setQuickPayAmount(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-7 pr-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#84CC16]"
                      />
                    </div>
                    <button
                      type="submit"
                      className="bg-[#84CC16] hover:bg-[#65A30D] text-white px-4 py-1.5 rounded-xl text-xs font-bold transition shadow-sm">
                      Send
                    </button>
                  </div>
                </form>
              )}

              {quickPaySuccess && (
                <div className="mt-2.5 p-2.5 bg-lime-50 dark:bg-lime-950/40 text-[#4D7C0F] dark:text-lime-300 text-xs rounded-xl font-bold border border-lime-200 dark:border-lime-900/50 animate-in fade-in">
                  ✓ {quickPaySuccess}
                </div>
              )}
            </div>
          </Card>

          {/* 2. RECENT ACTIVITY & AUDIT CHAIN (Shakuro Transaction History layout) */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Recent activity
              </h3>
              <button
                onClick={() => onNavigate("activity")}
                className="text-xs font-bold text-[#65A30D] dark:text-lime-400 hover:underline">
                View all →
              </button>
            </div>

            <div className="flex justify-between text-[11px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800/80 pb-2">
              <span>Event / Target</span>
              <span>Status</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {auditState.entries.length > 0
                ? auditState.entries.slice(0, 5).map((entry) => (
                    <div
                      key={`${entry.seq}-${entry.hash}`}
                      className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                            entry.type.includes("denied") ||
                            entry.type.includes("failed")
                              ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
                              : "bg-lime-50 dark:bg-lime-950/50 text-[#65A30D] dark:text-lime-400"
                          }`}>
                          <Icon
                            name={
                              entry.type.includes("denied")
                                ? "shield"
                                : "activity"
                            }
                            size={15}
                          />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 capitalize">
                            {entry.type.replaceAll(".", " ")}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(entry.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                      <Badge
                        tone={
                          entry.type.includes("denied") ||
                          entry.type.includes("failed")
                            ? "red"
                            : "green"
                        }>
                        {entry.type.includes("denied") ||
                        entry.type.includes("failed")
                          ? "Blocked"
                          : "Verified"}
                      </Badge>
                    </div>
                  ))
                : demoActivity.map((item) => (
                    <div
                      key={item.title}
                      className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                            item.tone === "red"
                              ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400"
                              : item.tone === "amber"
                                ? "bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400"
                                : "bg-lime-50 dark:bg-lime-950/50 text-[#65A30D] dark:text-lime-400"
                          }`}>
                          <Icon name={item.icon} size={15} />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {item.title}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {item.time}
                          </p>
                        </div>
                      </div>
                      <Badge tone={item.tone}>{item.status}</Badge>
                    </div>
                  ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

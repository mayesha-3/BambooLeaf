import { useCallback, useEffect, useState } from 'react'
import type { Page, AuditEntry, AuditState } from './types'
import type { IconName } from './types'
import { apiBaseUrl } from './config/api'
import Icon from './components/ui/Icon'
import GoalComposer from './components/GoalComposer'
import OverviewPage from './pages/OverviewPage'
import ActivityPage from './pages/ActivityPage'
import ApprovalsPage from './pages/ApprovalsPage'
import PolicyPage from './pages/PolicyPage'
import AutonomyPage from './pages/AutonomyPage'
import WalletPage from './pages/WalletPage'
import ArenaPage from './pages/ArenaPage'
import SettingsPage from './pages/SettingsPage'

const navGroups: { label: string; items: { id: Page; label: string; icon: IconName; count?: string }[] }[] = [
  {
    label: 'WORKSPACE',
    items: [
      { id: 'overview', label: 'Overview', icon: 'grid' },
      { id: 'activity', label: 'Activity log', icon: 'activity' },
      { id: 'approvals', label: 'Approvals', icon: 'check', count: '2' },
    ],
  },
  {
    label: 'GUARDRAILS',
    items: [
      { id: 'policy', label: 'Policy & limits', icon: 'shield' },
      { id: 'autonomy', label: 'Autonomy', icon: 'spark' },
      { id: 'wallet', label: 'Wallet', icon: 'wallet' },
    ],
  },
  {
    label: 'PLAYGROUND',
    items: [{ id: 'arena', label: 'Attack Arena', icon: 'target' }],
  },
]

export function App() {
  const [page, setPage] = useState<Page>('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [auditState, setAuditState] = useState<AuditState>({
    entries: [],
    valid: null,
    checked: 0,
    error: '',
    loading: false,
  })

  const refreshAudit = useCallback(async () => {
    setAuditState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const [eventsResponse, verifyResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/audit?limit=50`),
        fetch(`${apiBaseUrl}/audit/verify`),
      ])
      const eventPayload = (await eventsResponse.json()) as { entries?: AuditEntry[]; error?: string }
      const verifyPayload = (await verifyResponse.json()) as { valid?: boolean; checked?: number; error?: string }
      if (!eventsResponse.ok) throw new Error(eventPayload.error || `Audit API returned ${eventsResponse.status}`)
      if (!verifyResponse.ok && verifyResponse.status !== 409)
        throw new Error(verifyPayload.error || `Audit verification returned ${verifyResponse.status}`)
      setAuditState({
        entries: eventPayload.entries || [],
        valid: verifyPayload.valid ?? false,
        checked: verifyPayload.checked || 0,
        error: '',
        loading: false,
      })
    } catch (error) {
      setAuditState((current) => ({
        ...current,
        valid: null,
        error: error instanceof Error ? error.message : 'Audit API unavailable',
        loading: false,
      }))
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAudit()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshAudit])

  // Global cmd+k listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearchModal((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const navigate = (nextPage: Page) => {
    setPage(nextPage)
    setMobileNavOpen(false)
  }

  return (
    <div className="h-screen w-screen bg-[#FBFBFC] text-slate-900 flex overflow-hidden antialiased selection:bg-[#84CC16] selection:text-white">

      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* ================= LEFT SIDEBAR (BambooLeaf with Shakuro Styling) ================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 lg:static flex flex-col h-full bg-[#FBFBFC] border-r border-slate-100 shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'lg:w-[86px]' : 'lg:w-[240px]'
          } ${mobileNavOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo Header */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-transparent">
          <button
            onClick={() => navigate('overview')}
            className="flex items-center gap-2 group text-left"
          >
            <span className="text-2xl font-black tracking-tight text-slate-950 group-hover:opacity-80 transition font-sans">
              BambooLeaf
            </span>
          </button>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="text-slate-400 hover:text-slate-700 lg:hidden"
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Navigation Links: BambooLeaf sections styled in Shakuro's active/pill design */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
          {navGroups.map((group) => (
            <div key={group.label}>
              {!sidebarCollapsed && (
                <p className="mb-2 px-3 text-[10px] font-bold tracking-wider text-slate-400">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = page === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.id)}
                      className={`relative flex items-center justify-between w-full px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${isActive
                          ? 'bg-[#F2F4F7] text-slate-950 shadow-sm'
                          : 'text-slate-500 hover:bg-slate-100/60 hover:text-slate-900'
                        }`}
                    >
                      {/* Shakuro Left Dark Bar Indicator */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-5 bg-slate-950 rounded-r-md" />
                      )}
                      <div className="flex items-center gap-3">
                        <Icon name={item.icon} size={18} className={isActive ? 'text-slate-950' : 'text-slate-400'} />
                        {!sidebarCollapsed && <span>{item.label}</span>}
                      </div>
                      {item.count && !sidebarCollapsed && (
                        <span className="bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {item.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Card: Guarded Agent Status (Shakuro Pro Card style) */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-slate-100/70">
            <div className="rounded-2xl bg-[#F6F7F9] p-4 text-center border border-slate-200/60 shadow-sm space-y-2.5">
              <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center mx-auto shadow-sm">
                <Icon name="bolt" size={14} />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">Guarded Agent Active</h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Deterministic policy firewall running on Sepolia testnet.
                </p>
              </div>
              <button
                onClick={() => setShowGoalModal(true)}
                className="w-full bg-[#111] hover:bg-black text-white rounded-full py-2 text-xs font-bold transition shadow-sm"
              >
                + Plan agent goal
              </button>
            </div>
          </div>
        )}

        {/* Collapse sidebar button */}
        <div className="px-4 pb-4 pt-1">
          <button
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-700 text-xs font-bold px-2 py-1.5 transition"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!sidebarCollapsed && <span>Collapse sidebar</span>}
          </button>
        </div>

      </aside>

      {/* ================= MAIN CONTENT AREA ================= */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#FBFBFC] overflow-hidden">

        {/* Top Header Bar (Shakuro design style) */}
        <header className="h-20 px-6 sm:px-8 border-b border-slate-100/80 flex items-center justify-between gap-4 shrink-0 bg-[#FBFBFC]">

          {/* Quick Search Pill Input */}
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open mobile navigation"
            >
              <Icon name="menu" size={20} />
            </button>

            <div
              onClick={() => setShowSearchModal(true)}
              className="flex items-center gap-2.5 w-full bg-white border border-slate-200/90 hover:border-slate-300 rounded-full px-4 py-2 text-xs text-slate-400 cursor-pointer shadow-sm transition"
            >
              <Icon name="search" size={15} className="text-slate-400" />
              <span className="flex-1">Quick search</span>
              <span className="hidden sm:inline bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[10px] px-1.5 py-0.5 rounded-md">
                ⌘ K
              </span>
            </div>
          </div>

          {/* Right: Actions, Notifications, Profile, Network */}
          <div className="flex items-center gap-2.5 sm:gap-4">

            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-[11px] font-bold text-[#65A30D]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#84CC16]" />
              Sepolia testnet
            </div>

            {/* Notification Bell with Red Badge Dot */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications((prev) => !prev)}
                className="w-10 h-10 rounded-full border border-slate-200/90 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 transition shadow-sm relative"
                aria-label="Notifications"
              >
                <Icon name="bell" size={17} />
                <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-2.5 right-2.5 ring-2 ring-white" />
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl p-4 border border-slate-100 shadow-xl z-50 text-xs space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-900">Notifications</span>
                    <span className="text-[10px] text-[#65A30D] font-bold">Mark all read</span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-2 rounded-xl bg-slate-50">
                      <p className="font-bold text-slate-800">T2 Swap Approval Pending</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">12 USDC → ETH awaiting your review</p>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50">
                      <p className="font-bold text-slate-800">Policy Passed</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Transfer of 0.008 ETH signed</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Settings Gear Button */}
            <button
              onClick={() => navigate('settings')}
              className="w-10 h-10 rounded-full border border-slate-200/90 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 transition shadow-sm"
              aria-label="Settings"
            >
              <Icon name="settings" size={17} />
            </button>

            {/* User Profile Chip (Mayes / Owner Workspace) */}
            <div
              onClick={() => navigate('settings')}
              className="hidden md:flex items-center gap-3 pl-1 pr-2 py-1 rounded-full hover:bg-slate-100/70 cursor-pointer transition select-none"
            >
              <div className="w-9 h-9 rounded-full bg-lime-100 text-[#65A30D] font-extrabold flex items-center justify-center shadow-sm">
                M
              </div>
              <div className="text-left leading-tight">
                <p className="text-xs font-bold text-slate-900">Mayes</p>
                <p className="text-[10px] text-slate-400">owner@bambooleaf.eth</p>
              </div>
            </div>

            {/* + Plan goal Button */}
            <button
              onClick={() => setShowGoalModal(true)}
              className="inline-flex items-center gap-1.5 border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold px-4 py-2 rounded-full transition shadow-sm"
            >
              <Icon name="plus" size={14} />
              <span className="hidden sm:inline">Plan goal</span>
            </button>

          </div>

        </header>

        {/* Main Content Body */}
        <main className="p-5 sm:p-7 lg:p-8 flex-1 overflow-y-auto">
          {page === 'overview' && (
            <OverviewPage
              onNavigate={navigate}
              auditState={auditState}
              onOpenGoalModal={() => setShowGoalModal(true)}
            />
          )}
          {page === 'activity' && <ActivityPage auditState={auditState} refreshAudit={refreshAudit} />}
          {page === 'approvals' && <ApprovalsPage />}
          {page === 'policy' && <PolicyPage />}
          {page === 'autonomy' && <AutonomyPage />}
          {page === 'wallet' && <WalletPage />}
          {page === 'arena' && <ArenaPage />}
          {page === 'settings' && <SettingsPage />}
        </main>

      </div>

      {/* ================= GLOBAL MODALS ================= */}

      {/* 1. Ask BambooLeaf Agent Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-100 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center px-6 pt-6 pb-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">Ask BambooLeaf Copilot</h3>
                <p className="text-xs text-slate-400 mt-0.5">Describe your goal. Deterministic policy guardrails validate every step.</p>
              </div>
              <button onClick={() => setShowGoalModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <GoalComposer
              onSubmitted={() => {
                setTimeout(() => setShowGoalModal(false), 2000)
              }}
            />
          </div>
        </div>
      )}

      {/* 2. Global Quick Search Modal (⌘ K) */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-100 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <Icon name="search" size={17} className="text-slate-400" />
              <input
                autoFocus
                placeholder="Search workspace, policies, approvals, audit logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs font-bold outline-none text-slate-800 placeholder:text-slate-400"
              />
              <button onClick={() => setShowSearchModal(false)} className="text-xs text-slate-400 hover:text-slate-700">ESC</button>
            </div>
            <div className="space-y-1 text-xs">
              <p className="text-[10px] font-bold uppercase text-slate-400 px-2">Workspace Navigation</p>
              {[
                { name: 'Overview & Guarded Balance', p: 'overview' as Page },
                { name: 'Activity Log & Chain Hashes', p: 'activity' as Page },
                { name: 'Pending Approvals Queue', p: 'approvals' as Page },
                { name: 'Policy & Enforced Limits', p: 'policy' as Page },
                { name: 'Autonomy & Permission Levels', p: 'autonomy' as Page },
                { name: 'Sepolia Testnet Wallet', p: 'wallet' as Page },
                { name: 'Attack Arena Sandbox', p: 'arena' as Page },
                { name: 'Settings & Security Defaults', p: 'settings' as Page },
              ].map((item) => (
                <button
                  key={item.name}
                  onClick={() => {
                    navigate(item.p)
                    setShowSearchModal(false)
                  }}
                  className="flex items-center justify-between w-full px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 font-bold text-left"
                >
                  <span>{item.name}</span>
                  <span className="text-[10px] text-slate-400">Jump →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App

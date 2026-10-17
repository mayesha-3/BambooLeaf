import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
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
import ChatPage from './features/chat/ChatPage'


const navGroups: { label: string; items: { id: Page; label: string; icon: IconName; count?: string; isChat?: boolean }[] }[] = [
  {
    label: 'AGENT',
    items: [
      { id: 'chat', label: 'Agent Chat', icon: 'spark', isChat: true },
    ],
  },
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
  const [page, setPage] = useState<Page>('chat')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const sidebarResizing = useRef(false)
  const sidebarRef = useRef<HTMLElement>(null)

  // Dark mode theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('bambooleaf_theme')
      if (saved) return saved === 'dark'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      if (darkMode) {
        document.documentElement.classList.add('dark')
        localStorage.setItem('bambooleaf_theme', 'dark')
      } else {
        document.documentElement.classList.remove('dark')
        localStorage.setItem('bambooleaf_theme', 'light')
      }
    } catch {
      // ignore
    }
  }, [darkMode])

  // Left sidebar resize handler
  const handleSidebarResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    sidebarResizing.current = true
    setIsResizingSidebar(true)
    const startX = e.clientX
    const startWidth = sidebarCollapsed ? 86 : sidebarWidth

    const onMove = (ev: globalThis.MouseEvent) => {
      if (!sidebarResizing.current) return
      const delta = ev.clientX - startX
      const newWidth = Math.max(180, Math.min(400, startWidth + delta))
      if (newWidth <= 100) {
        setSidebarCollapsed(true)
      } else {
        setSidebarCollapsed(false)
        setSidebarWidth(newWidth)
      }
    }
    const onUp = () => {
      sidebarResizing.current = false
      setIsResizingSidebar(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarCollapsed, sidebarWidth])
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
    <div className="h-screen w-screen bg-[#FBFBFC] dark:bg-[#080d19] text-slate-900 dark:text-slate-100 flex overflow-hidden antialiased selection:bg-[#84CC16] selection:text-white transition-colors duration-200">

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
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-50 lg:static flex flex-col h-full bg-[#FBFBFC] dark:bg-[#0d1424] border-r border-slate-100 dark:border-slate-800/80 shrink-0 ${
          isResizingSidebar ? '' : 'transition-[width,transform] duration-300 ease-in-out'
        } ${mobileNavOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full lg:translate-x-0'}`}
        style={{ width: mobileNavOpen ? 260 : sidebarCollapsed ? 86 : sidebarWidth }}
      >
        {/* Logo Header */}
        <div className="h-20 flex items-center justify-between px-4 border-b border-slate-100/80 dark:border-slate-800/60 overflow-hidden">
          <button
            onClick={() => navigate('overview')}
            className="flex items-center gap-2.5 group text-left min-w-0"
          >
            {/* Logo icon — always visible */}
            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#65A30D] via-[#84CC16] to-[#A3E635] flex items-center justify-center shrink-0 shadow-[0_2px_10px_rgba(132,204,22,0.35)] ring-1 ring-white/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
              </svg>
            </span>
            {/* Name & Version — hidden when collapsed */}
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <span className="text-lg font-black tracking-tight text-slate-950 dark:text-white group-hover:opacity-85 transition font-display whitespace-nowrap">
                  BambooLeaf
                </span>
                <span className="text-[9px] uppercase font-mono tracking-wider font-semibold px-1.5 py-0.5 rounded-full bg-lime-500/10 dark:bg-lime-400/15 text-lime-700 dark:text-lime-300 border border-lime-500/25 shrink-0">
                  v2.4
                </span>
              </div>
            )}
          </button>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 lg:hidden shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Navigation Links: BambooLeaf sections styled in Shakuro's active/pill design */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-6">
          {navGroups.map((group) => (
            <div key={group.label}>
              {!sidebarCollapsed && (
                <p className="mb-2 px-3 text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-slate-500 font-display">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = page === item.id
                  // Special rendering for Agent Chat
                  if (item.isChat) {
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(item.id)}
                        className={`group relative flex items-center justify-between w-full px-3 py-2.5 rounded-2xl text-xs font-bold transition-all duration-200 ${
                          isActive
                            ? 'text-white shadow-[0_4px_16px_rgba(101,163,13,0.3)] dark:shadow-[0_4px_20px_rgba(132,204,22,0.25)]'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-lime-50/70 dark:hover:bg-lime-950/30'
                        }`}
                        style={isActive ? { background: 'linear-gradient(135deg, #84CC16 0%, #4D7C0F 100%)' } : {}}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                            isActive
                              ? 'bg-white/20 text-white shadow-inner'
                              : 'bg-lime-100/70 dark:bg-lime-950/50 text-[#65A30D] dark:text-lime-400 border border-lime-200/60 dark:border-lime-900/50 group-hover:bg-lime-200/60'
                          }`}>
                            <Icon name={item.icon} size={15} />
                          </div>
                          {!sidebarCollapsed && (
                            <span className={`font-display text-[13px] font-semibold truncate ${isActive ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                              {item.label}
                            </span>
                          )}
                        </div>
                        {!sidebarCollapsed && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75" />
                              <span className={`relative inline-flex rounded-full h-2 w-2 ${isActive ? 'bg-white' : 'bg-[#84CC16]'}`} />
                            </span>
                            {!isActive && <span className="text-[10px] font-bold font-mono text-[#65A30D] dark:text-lime-400">Live</span>}
                          </div>
                        )}
                      </button>
                    )
                  }
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.id)}
                      className={`group relative flex items-center justify-between w-full px-3 py-2 rounded-2xl text-xs font-bold transition-all duration-150 ${
                        isActive
                          ? 'bg-slate-100/90 dark:bg-slate-800/90 text-slate-950 dark:text-white dark:border dark:border-slate-700/60 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {/* Left Dark / Lime Bar Indicator */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-[#84CC16] rounded-r-full shadow-[0_0_8px_rgba(132,204,22,0.6)]" />
                      )}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                          isActive
                            ? 'bg-slate-900 dark:bg-lime-400 text-white dark:text-slate-950 shadow-sm'
                            : 'bg-slate-100/70 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white group-hover:bg-slate-200/60 dark:group-hover:bg-slate-700/50'
                        }`}>
                          <Icon name={item.icon} size={15} />
                        </div>
                        {!sidebarCollapsed && (
                          <span className="font-display text-[13px] font-medium truncate">
                            {item.label}
                          </span>
                        )}
                      </div>
                      {item.count && !sidebarCollapsed && (
                        <span className="bg-black dark:bg-lime-400 dark:text-slate-950 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
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
          <div className="p-3.5 border-t border-slate-100/80 dark:border-slate-800/60">
            {/* <div className="rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/80 dark:from-slate-800/60 dark:to-slate-900/80 p-3.5 text-center border border-slate-200/70 dark:border-slate-700/60 shadow-sm backdrop-blur-sm space-y-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-900 to-slate-700 dark:from-lime-400 dark:to-lime-500 text-white dark:text-slate-950 flex items-center justify-center mx-auto shadow-sm">
                <Icon name="bolt" size={15} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white font-display">Guarded Agent Active</h4>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Deterministic policy firewall on Sepolia testnet.
                </p>
              </div>
              <button
                onClick={() => setShowGoalModal(true)}
                className="w-full bg-slate-950 hover:bg-black dark:bg-lime-400 dark:hover:bg-lime-300 dark:text-slate-950 text-white rounded-xl py-2 text-xs font-bold transition shadow-sm font-display tracking-tight"
              >
                + Plan agent goal
              </button>
            </div> */}
          </div>
        )}

        {/* Collapse sidebar button */}
        <div className="px-3.5 pb-3.5 pt-1">
          <button
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-medium font-display px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition w-full"
          >
            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!sidebarCollapsed && <span>Collapse sidebar</span>}
          </button>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleSidebarResizeStart}
          className="absolute top-0 right-0 w-3 h-full cursor-col-resize z-10 group hidden lg:flex items-center justify-center transition-colors hover:bg-[#84CC16]/10"
        >
          <div className="flex flex-col items-center gap-[3px] py-2 px-0.5 rounded-full bg-slate-200/60 dark:bg-slate-800 group-hover:bg-[#84CC16]/30 transition-colors">
            <div className="w-[3px] h-[3px] rounded-full bg-slate-400 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
            <div className="w-[3px] h-[3px] rounded-full bg-slate-400 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
            <div className="w-[3px] h-[3px] rounded-full bg-slate-400 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
            <div className="w-[3px] h-[3px] rounded-full bg-slate-400 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
            <div className="w-[3px] h-[3px] rounded-full bg-slate-400 dark:bg-slate-600 group-hover:bg-[#84CC16] transition-colors" />
          </div>
        </div>

      </aside>

      {/* ================= MAIN CONTENT AREA ================= */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#FBFBFC] dark:bg-[#090e1a] overflow-hidden transition-colors duration-200">

        {/* Top Header Bar (Shakuro design style) */}
        <header className="h-20 px-6 sm:px-8 border-b border-slate-100/80 dark:border-slate-800/80 flex items-center justify-between gap-4 shrink-0 bg-[#FBFBFC] dark:bg-[#090e1a] transition-colors duration-200">

          {/* Quick Search Pill Input */}
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open mobile navigation"
            >
              <Icon name="menu" size={20} />
            </button>

            <div
              onClick={() => setShowSearchModal(true)}
              className="flex items-center gap-2.5 w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-full px-4 py-2 text-xs text-slate-400 cursor-pointer shadow-sm transition"
            >
              <Icon name="search" size={15} className="text-slate-400" />
              <span className="flex-1">Quick search</span>
              <span className="hidden sm:inline bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-mono text-[10px] px-1.5 py-0.5 rounded-md">
                ⌘ K
              </span>
            </div>
          </div>

          {/* Right: Actions, Notifications, Profile, Network */}
          <div className="flex items-center gap-2 sm:gap-3">

            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-lime-200 dark:border-lime-900/60 bg-lime-50 dark:bg-lime-950/40 px-3 py-1 text-[11px] font-bold text-[#65A30D] dark:text-lime-400">
              <span className="w-1.5 h-1.5 rounded-full bg-[#84CC16]" />
              Sepolia testnet
            </div>

            {/* Notification Bell with Red Badge Dot */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications((prev) => !prev)}
                className="w-10 h-10 rounded-full border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition shadow-sm relative"
                aria-label="Notifications"
              >
                <Icon name="bell" size={17} />
                <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-2.5 right-2.5 ring-2 ring-white dark:ring-slate-900" />
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-xl z-50 text-xs space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-bold text-slate-900 dark:text-white">Notifications</span>
                    <span className="text-[10px] text-[#65A30D] dark:text-lime-400 font-bold cursor-pointer">Mark all read</span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <p className="font-bold text-slate-800 dark:text-slate-200">T2 Swap Approval Pending</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">12 USDC → ETH awaiting your review</p>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                      <p className="font-bold text-slate-800 dark:text-slate-200">Policy Passed</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Transfer of 0.008 ETH signed</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dark / Light Theme Toggle */}
            <button
              onClick={() => setDarkMode((prev) => !prev)}
              className="w-10 h-10 rounded-full border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition shadow-sm"
              aria-label="Toggle theme"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              <Icon name={darkMode ? 'sun' : 'moon'} size={17} className={darkMode ? 'text-amber-400' : 'text-slate-600 dark:text-slate-300'} />
            </button>

            {/* Settings Gear Button */}
            <button
              onClick={() => navigate('settings')}
              className="w-10 h-10 rounded-full border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition shadow-sm"
              aria-label="Settings"
            >
              <Icon name="settings" size={17} />
            </button>

            {/* User Profile Chip (Mayes / Owner Workspace) */}
            <div
              onClick={() => navigate('settings')}
              className="hidden md:flex items-center gap-3 pl-1 pr-2 py-1 rounded-full hover:bg-slate-100/70 dark:hover:bg-slate-800/70 cursor-pointer transition select-none"
            >
              <div className="w-9 h-9 rounded-full bg-lime-100 dark:bg-lime-950/60 text-[#65A30D] dark:text-lime-400 font-extrabold flex items-center justify-center shadow-sm">
                M
              </div>
              <div className="text-left leading-tight">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Mayes</p>
                <p className="text-[10px] text-slate-400">owner@bambooleaf.eth</p>
              </div>
            </div>

            {/* + Plan goal Button */}
            <button
              onClick={() => setShowGoalModal(true)}
              className="inline-flex items-center gap-1.5 border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold px-4 py-2 rounded-full transition shadow-sm"
            >
              <Icon name="plus" size={14} />
              <span className="hidden sm:inline">Plan goal</span>
            </button>

          </div>

        </header>

        {/* Main Content Body with smooth page transitions */}
        <div key={page} className="flex-1 flex flex-col h-full overflow-hidden animate-page-fade">
          {page === 'chat' ? (
            <div className="flex-1 overflow-hidden">
              <ChatPage />
            </div>
          ) : (
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
          )}
        </div>

      </div>

      {/* ================= GLOBAL MODALS ================= */}

      {/* 1. Ask BambooLeaf Agent Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center px-6 pt-6 pb-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Ask BambooLeaf Copilot</h3>
                <p className="text-xs text-slate-400 mt-0.5">Describe your goal. Deterministic policy guardrails validate every step.</p>
              </div>
              <button onClick={() => setShowGoalModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">✕</button>
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
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowSearchModal(false); setSearchQuery('') } }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-100 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Icon name="search" size={17} className="text-slate-400" />
              <input
                autoFocus
                placeholder="Search workspace, policies, approvals, audit logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setShowSearchModal(false); setSearchQuery('') } }}
                className="w-full text-xs font-bold outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 bg-transparent"
              />
              <button onClick={() => { setShowSearchModal(false); setSearchQuery('') }} className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5 font-mono">ESC</button>
            </div>
            <div className="space-y-1 text-xs">
              <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 px-2">Workspace Navigation</p>
              {[
                { name: '⚡ Agent Chat — Talk to BambooLeaf', p: 'chat' as Page, keywords: 'chat agent talk bamboo' },
                { name: 'Overview & Guarded Balance', p: 'overview' as Page, keywords: 'overview dashboard balance home' },
                { name: 'Activity Log & Chain Hashes', p: 'activity' as Page, keywords: 'activity log audit chain hash history' },
                { name: 'Pending Approvals Queue', p: 'approvals' as Page, keywords: 'approvals pending review queue' },
                { name: 'Policy & Enforced Limits', p: 'policy' as Page, keywords: 'policy limits cap rules spending' },
                { name: 'Autonomy & Permission Levels', p: 'autonomy' as Page, keywords: 'autonomy level permission trust' },
                { name: 'Sepolia Testnet Wallet', p: 'wallet' as Page, keywords: 'wallet eth usdc sepolia testnet crypto' },
                { name: 'Attack Arena Sandbox', p: 'arena' as Page, keywords: 'attack arena sandbox test security' },
                { name: 'Settings & Security Defaults', p: 'settings' as Page, keywords: 'settings config security preferences' },
              ]
                .filter((item) => {
                  if (!searchQuery.trim()) return true
                  const q = searchQuery.toLowerCase()
                  return item.name.toLowerCase().includes(q) || item.keywords.includes(q)
                })
                .map((item) => (
                <button
                  key={item.name}
                  onClick={() => {
                    navigate(item.p)
                    setShowSearchModal(false)
                    setSearchQuery('')
                  }}
                  className="flex items-center justify-between w-full px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200 font-bold text-left transition"
                >
                  <span>{item.name}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Jump →</span>
                </button>
              ))}
              {searchQuery.trim() && [
                { name: '⚡ Agent Chat — Talk to BambooLeaf', p: 'chat' as Page, keywords: 'chat agent talk bamboo' },
                { name: 'Overview & Guarded Balance', p: 'overview' as Page, keywords: 'overview dashboard balance home' },
                { name: 'Activity Log & Chain Hashes', p: 'activity' as Page, keywords: 'activity log audit chain hash history' },
                { name: 'Pending Approvals Queue', p: 'approvals' as Page, keywords: 'approvals pending review queue' },
                { name: 'Policy & Enforced Limits', p: 'policy' as Page, keywords: 'policy limits cap rules spending' },
                { name: 'Autonomy & Permission Levels', p: 'autonomy' as Page, keywords: 'autonomy level permission trust' },
                { name: 'Sepolia Testnet Wallet', p: 'wallet' as Page, keywords: 'wallet eth usdc sepolia testnet crypto' },
                { name: 'Attack Arena Sandbox', p: 'arena' as Page, keywords: 'attack arena sandbox test security' },
                { name: 'Settings & Security Defaults', p: 'settings' as Page, keywords: 'settings config security preferences' },
              ].filter((item) => {
                const q = searchQuery.toLowerCase()
                return item.name.toLowerCase().includes(q) || item.keywords.includes(q)
              }).length === 0 && (
                <p className="text-center text-slate-400 py-4 text-xs">No results for "{searchQuery}"</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Page, AuditEntry, AuditState, UserProfile } from './types'
import type { IconName } from './types'
import { apiBaseUrl } from './config/api'
import Icon from './components/ui/Icon'
import OverviewPage from './pages/OverviewPage'
import ActivityPage from './pages/ActivityPage'
import ApprovalsPage from './pages/ApprovalsPage'
import PolicyPage from './pages/PolicyPage'
import AutonomyPage from './pages/AutonomyPage'
import WalletPage from './pages/WalletPage'
import ArenaPage from './pages/ArenaPage'
import SettingsPage from './pages/SettingsPage'
import TransactPage from './pages/TransactPage'
import ChatPage from './features/chat/ChatPage'
import ComplianceConsole from './pages/ComplianceConsole'
import PaymentsPage from './pages/PaymentsPage'
import ProfileDropdown from './components/ProfileDropdown'
import LiveMarketTicker from './features/market/LiveMarketTicker'
import {
  authenticatedFetch,
  clearDeviceSession,
  enrollOrLoginDevice,
  getDeviceSessionToken,
} from './lib/device-session'

const validPages: Page[] = ['overview', 'chat', 'activity', 'approvals', 'policy', 'autonomy', 'wallet', 'arena', 'compliance', 'payments', 'settings', 'transact']
const profileStorageKey = 'bambooleaf_user_profile'
const searchPages: { name: string; page: Page; keywords: string }[] = [
  { name: 'Agent Chat', page: 'chat', keywords: 'agent talk bamboo copilot' },
  { name: 'Overview & Guarded Balance', page: 'overview', keywords: 'dashboard home balance' },
  { name: 'Transact — Send & Swap', page: 'transact', keywords: 'send swap manual transfer' },
  { name: 'Activity Log', page: 'activity', keywords: 'audit chain hash history events' },
  { name: 'Approvals', page: 'approvals', keywords: 'pending review queue authorize' },
  { name: 'Policy & Limits', page: 'policy', keywords: 'cap rules spending recipients' },
  { name: 'Autonomy', page: 'autonomy', keywords: 'permission level trust' },
  { name: 'Wallet', page: 'wallet', keywords: 'eth usdc sepolia testnet crypto' },
  { name: 'Attack Arena', page: 'arena', keywords: 'sandbox test security' },
  { name: 'Compliance Console', page: 'compliance', keywords: 'auditor export verify' },
  { name: 'Supplier Payments', page: 'payments', keywords: 'supplier invoice purchase order vendor' },
  { name: 'Settings', page: 'settings', keywords: 'config security preferences profile' },
]

type AccountIdentity = { walletAddress: string; role: string | null }
type InjectedWallet = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
type AppNotification = {
  id: string
  title: string
  description: string
  page: Page
}

function roleLabel(role: string | null): string {
  if (!role) return 'Unassigned'
  return `${role.charAt(0).toUpperCase()}${role.slice(1)}`
}

function profileKey(walletAddress: string): string {
  return `${profileStorageKey}:${walletAddress.toLowerCase()}`
}

function notificationReadKey(walletAddress: string): string {
  return `bambooleaf_read_notifications:${walletAddress.toLowerCase()}`
}

function profileForAccount(walletAddress: string, role: string | null): UserProfile {
  const shortWallet = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
  let saved: Partial<UserProfile> | null = null
  try {
    const walletProfile = localStorage.getItem(profileKey(walletAddress))
    const legacyProfile = localStorage.getItem(profileStorageKey)
    const parsed = walletProfile || legacyProfile
    if (parsed) {
      const candidate = JSON.parse(parsed) as Partial<UserProfile>
      if (walletProfile || candidate.walletAddress?.toLowerCase() === walletAddress.toLowerCase()) {
        saved = candidate
      }
    }
  } catch {
    saved = null
  }
  const name = typeof saved?.name === 'string' && saved.name.trim() ? saved.name : shortWallet
  return {
    name,
    handle: typeof saved?.handle === 'string' && saved.handle ? saved.handle : shortWallet,
    email: typeof saved?.email === 'string' ? saved.email : '',
    walletAddress,
    role: roleLabel(role),
    avatarColor: typeof saved?.avatarColor === 'string' ? saved.avatarColor : 'from-[#65A30D] to-[#84CC16]',
    bio: typeof saved?.bio === 'string' ? saved.bio : '',
    telegram: typeof saved?.telegram === 'string' ? saved.telegram : '',
    cardName: typeof saved?.cardName === 'string' ? saved.cardName : `${name.toUpperCase()} · ${roleLabel(role).toUpperCase()}`,
  }
}

function guestProfile(): UserProfile {
  return {
    name: 'Guest',
    handle: 'Not signed in',
    email: '',
    walletAddress: '',
    role: 'Not signed in',
    avatarColor: 'from-slate-500 to-slate-700',
    bio: '',
    telegram: '',
    cardName: 'GUEST',
  }
}

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
      { id: 'transact', label: 'Transact', icon: 'send' },
      { id: 'activity', label: 'Activity log', icon: 'activity' },
      { id: 'approvals', label: 'Approvals', icon: 'check' },
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
    label: 'COMPLIANCE',
    items: [
      { id: 'compliance', label: 'Compliance Console', icon: 'layers' },
      { id: 'payments', label: 'Supplier payments', icon: 'wallet' },
    ],
  },
  {
    label: 'PLAYGROUND',
    items: [{ id: 'arena', label: 'Attack Arena', icon: 'target' }],
  },
]

function getInitialPage(): Page {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace(/^#\/?/, '').trim() as Page
    if (validPages.includes(hash)) return hash
    try {
      const saved = localStorage.getItem('bambooleaf_current_page') as Page
      if (saved && validPages.includes(saved)) {
        window.location.hash = `/${saved}`
        return saved
      }
    } catch {
      // ignore
    }
  }
  return 'chat'
}

export function App() {
  const [page, setPage] = useState<Page>(getInitialPage)

  // Listen to browser back/forward buttons or direct hash change
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim() as Page
      if (validPages.includes(hash)) {
        setPage(hash)
        try {
          localStorage.setItem('bambooleaf_current_page', hash)
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([])
  const [notificationLoading, setNotificationLoading] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const notificationRequestId = useRef(0)
  const notificationContainerRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSelection, setSearchSelection] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const sidebarResizing = useRef(false)
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!showNotifications) return
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !notificationContainerRef.current?.contains(event.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [showNotifications])

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

  const [account, setAccount] = useState<AccountIdentity | null>(null)
  const [sessionLoading, setSessionLoading] = useState(() => Boolean(getDeviceSessionToken()))
  const [loginBusy, setLoginBusy] = useState(false)
  const [accountMessage, setAccountMessage] = useState('')
  const [userProfile, setUserProfile] = useState<UserProfile>(guestProfile)
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  const loadNotifications = useCallback(async () => {
    const requestId = ++notificationRequestId.current
    if (!account || (account.role !== 'admin' && account.role !== 'approver')) {
      setNotifications([])
      setNotificationLoading(false)
      setNotificationError('')
      return
    }

    if (notifications.length === 0) setNotificationLoading(true)
    try {
      const [approvalResponse, supplierResponse] = await Promise.all([
        authenticatedFetch(`${apiBaseUrl}/approvals`),
        account.role === 'approver'
          ? authenticatedFetch(`${apiBaseUrl}/suppliers`)
          : Promise.resolve(null),
      ])
      if (requestId !== notificationRequestId.current) return

      const approvalPayload = await approvalResponse.json() as {
        approvals?: Array<{
          approvalId: string
          intent: { action: string; from: { token: string; amount?: string }; to?: { token: string } }
        }>
        error?: string
      }
      if (!approvalResponse.ok) {
        throw new Error(approvalPayload.error || `Could not load transaction approvals (${approvalResponse.status}).`)
      }

      const nextNotifications: AppNotification[] = (approvalPayload.approvals || []).map((approval) => ({
        id: `transaction-${approval.approvalId}`,
        title: approval.intent.action === 'swap' ? 'Swap approval requested' : 'Transfer approval requested',
        description: approval.intent.action === 'swap'
          ? `${approval.intent.from.amount ?? '—'} ${approval.intent.from.token} → ${approval.intent.to?.token ?? 'token'}`
          : `${approval.intent.from.amount ?? '—'} ${approval.intent.from.token} transfer`,
        page: 'approvals',
      }))

      if (supplierResponse) {
        const supplierPayload = await supplierResponse.json() as {
          suppliers?: Array<{
            supplierId: string
            name: string
            status: string
            pendingChange?: { name: string }
          }>
          error?: string
        }
        if (!supplierResponse.ok) {
          throw new Error(supplierPayload.error || `Could not load supplier approvals (${supplierResponse.status}).`)
        }
        for (const supplier of supplierPayload.suppliers || []) {
          if (supplier.status !== 'pending_approval' && !supplier.pendingChange) continue
          const isChange = Boolean(supplier.pendingChange)
          nextNotifications.push({
            id: `supplier-${supplier.supplierId}-${isChange ? 'change' : 'approval'}`,
            title: isChange ? 'Supplier change needs approval' : 'Supplier needs approval',
            description: supplier.pendingChange
              ? `${supplier.name} → ${supplier.pendingChange.name}`
              : `${supplier.name} is waiting for verification`,
            page: 'approvals',
          })
        }
      }

      if (requestId !== notificationRequestId.current) return
      setNotifications(nextNotifications)
      setNotificationError('')
    } catch (error) {
      if (requestId === notificationRequestId.current) {
        setNotificationError(error instanceof Error ? error.message : 'Could not load notifications.')
      }
    } finally {
      if (requestId === notificationRequestId.current) setNotificationLoading(false)
    }
  }, [account, notifications.length])

  useEffect(() => {
    if (!account?.walletAddress) {
      setReadNotificationIds([])
      return
    }
    try {
      const saved = localStorage.getItem(notificationReadKey(account.walletAddress))
      const parsed: unknown = saved ? JSON.parse(saved) : []
      setReadNotificationIds(Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') ? parsed : [])
    } catch {
      setReadNotificationIds([])
      setNotificationError('Read notification status could not be loaded from browser storage.')
    }
  }, [account?.walletAddress])

  useEffect(() => {
    void loadNotifications()
    if (!account || (account.role !== 'admin' && account.role !== 'approver')) return
    const timer = window.setInterval(() => void loadNotifications(), 30_000)
    return () => window.clearInterval(timer)
  }, [account, loadNotifications])

  const refreshSession = useCallback(async () => {
    const token = getDeviceSessionToken()
    if (!token) {
      setAccount(null)
      setUserProfile(guestProfile())
      setSessionLoading(false)
      return
    }
    try {
      const response = await authenticatedFetch(`${apiBaseUrl}/devices`)
      const result = await response.json() as { walletAddress?: string; role?: string | null; error?: string }
      if (getDeviceSessionToken() !== token) return
      if (!response.ok || typeof result.walletAddress !== 'string') {
        throw new Error(result.error || `Could not verify the signed-in wallet (${response.status}).`)
      }
      const identity = { walletAddress: result.walletAddress, role: result.role || null }
      setAccount(identity)
      setUserProfile(profileForAccount(identity.walletAddress, identity.role))
      setAccountMessage('')
    } catch (error) {
      if (!getDeviceSessionToken()) {
        setAccount(null)
        setUserProfile(guestProfile())
      } else {
        setAccountMessage(error instanceof Error ? error.message : 'Could not verify the signed-in wallet.')
      }
    } finally {
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => {
    const onSessionChange = () => { void refreshSession() }
    window.addEventListener('bambooleaf-session-changed', onSessionChange)
    window.addEventListener('storage', onSessionChange)
    window.addEventListener('focus', onSessionChange)
    void refreshSession()
    return () => {
      window.removeEventListener('bambooleaf-session-changed', onSessionChange)
      window.removeEventListener('storage', onSessionChange)
      window.removeEventListener('focus', onSessionChange)
    }
  }, [refreshSession])

  const login = async () => {
    setLoginBusy(true)
    setAccountMessage('')
    try {
      const wallet = (window as Window & { ethereum?: InjectedWallet }).ethereum
      if (!wallet) throw new Error('No browser wallet was found. Install or unlock a wallet extension and try again.')
      const result = await enrollOrLoginDevice(wallet)
      if (result.status === 'pending' || !result.token) {
        setAccountMessage('Your wallet’s device access request is pending admin approval.')
        return
      }
      await refreshSession()
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Wallet sign-in failed.')
    } finally {
      setLoginBusy(false)
    }
  }

  const signOut = () => {
    setAccount(null)
    setUserProfile(guestProfile())
    setAccountMessage('')
    clearDeviceSession()
  }

  const handleUpdateProfile = (updated: UserProfile) => {
    setUserProfile(updated)
    if (account) {
      try {
        localStorage.setItem(profileKey(account.walletAddress), JSON.stringify({
          ...updated,
          walletAddress: account.walletAddress,
          role: roleLabel(account.role),
        }))
      } catch {
        setAccountMessage('Profile was updated for this visit but could not be saved in browser storage.')
      }
    }
  }

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
    const token = getDeviceSessionToken()
    if (!token) {
      setAuditState((current) => ({
        ...current,
        valid: null,
        error: 'Sign in with an authorized admin, approver, or auditor wallet to view audit records.',
        loading: false,
      }))
      return
    }
    try {
      const [eventsResponse, verifyResponse] = await Promise.all([
        authenticatedFetch(`${apiBaseUrl}/audit?limit=50`),
        authenticatedFetch(`${apiBaseUrl}/audit/verify`),
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
    if (page !== 'overview' && page !== 'activity' && page !== 'approvals') return
    const timer = window.setTimeout(() => {
      void refreshAudit()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [page, refreshAudit])

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
    if (window.location.hash !== `#/${nextPage}`) window.location.hash = `/${nextPage}`
    try {
      localStorage.setItem('bambooleaf_current_page', nextPage)
    } catch {
      // ignore
    }
    setMobileNavOpen(false)
  }

  const filteredSearchPages = searchPages.filter((item) => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    const searchable = `${item.name} ${item.keywords}`.toLowerCase()
    return query.split(/\s+/).every((term) => searchable.includes(term))
  })

  const closeSearch = () => {
    setShowSearchModal(false)
    setSearchQuery('')
    setSearchSelection(0)
  }

  const selectSearchResult = (selectedPage: Page) => {
    navigate(selectedPage)
    closeSearch()
  }

  const unreadNotificationCount = notifications.reduce(
    (count, notification) => count + (readNotificationIds.includes(notification.id) ? 0 : 1),
    0,
  )

  const markNotificationsRead = (ids: string[]) => {
    if (!account?.walletAddress) return
    const nextReadIds = [...new Set([...readNotificationIds, ...ids])]
    try {
      localStorage.setItem(notificationReadKey(account.walletAddress), JSON.stringify(nextReadIds))
      setReadNotificationIds(nextReadIds)
      setNotificationError('')
    } catch {
      setNotificationError('Read notification status could not be saved in browser storage.')
    }
  }

  useEffect(() => {
    if (showSearchModal) searchInputRef.current?.focus()
  }, [showSearchModal])

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
                      {item.count !== undefined && !sidebarCollapsed && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 transition-all duration-200 ${
                            item.count === '0'
                              ? 'bg-slate-200/70 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500'
                              : 'bg-black dark:bg-lime-400 dark:text-slate-950 text-white shadow-sm'
                          }`}
                        >
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

            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSearchSelection(0); setShowSearchModal(true) }}
              className="flex items-center gap-2.5 w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-full px-4 py-2 text-xs text-slate-400 cursor-pointer shadow-sm transition text-left"
            >
              <Icon name="search" size={15} className="text-slate-400" />
              <span className="flex-1">Quick search</span>
              <span className="hidden sm:inline bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-mono text-[10px] px-1.5 py-0.5 rounded-md">
                ⌘ K
              </span>
            </button>
          </div>

          {/* Right: Actions, Notifications, Profile, Network */}
          <div className="flex items-center gap-2 sm:gap-3">

            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-lime-200 dark:border-lime-900/60 bg-lime-50 dark:bg-lime-950/40 px-3 py-1 text-[11px] font-bold text-[#65A30D] dark:text-lime-400">
              <span className="w-1.5 h-1.5 rounded-full bg-[#84CC16]" />
              Sepolia testnet
            </div>

            {/* Approval notifications */}
            <div ref={notificationContainerRef} className="relative">
              <button
                onClick={() => {
                  const opening = !showNotifications
                  setShowNotifications(opening)
                  if (opening) void loadNotifications()
                }}
                className="w-10 h-10 rounded-full border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition shadow-sm relative"
                aria-label="Notifications"
                aria-expanded={showNotifications}
                aria-controls="notification-panel"
              >
                <Icon name="bell" size={17} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4 font-bold ring-2 ring-white dark:ring-slate-900">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div id="notification-panel" className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[min(70vh,28rem)] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-xl z-50 text-xs space-y-3" role="region" aria-label="Notifications">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">Notifications</span>
                      <span className="ml-2 text-[10px] text-slate-400">{notifications.length}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => markNotificationsRead(notifications.map((notification) => notification.id))}
                      disabled={unreadNotificationCount === 0}
                      className="text-[10px] text-[#65A30D] dark:text-lime-400 font-bold disabled:text-slate-400 disabled:cursor-default"
                    >
                      Mark all read
                    </button>
                  </div>
                  {notificationError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300" role="alert">
                      <p>{notificationError}</p>
                      <button type="button" onClick={() => void loadNotifications()} className="mt-2 font-bold underline">Try again</button>
                    </div>
                  )}
                  {notificationLoading && notifications.length === 0 && (
                    <p className="py-4 text-center text-slate-500" role="status">Loading notifications…</p>
                  )}
                  {!account && !notificationLoading && (
                    <p className="py-4 text-center text-slate-500">Sign in to receive approval notifications.</p>
                  )}
                  {account && account.role !== 'admin' && account.role !== 'approver' && !notificationLoading && (
                    <p className="py-4 text-center text-slate-500">There are no approval notifications for this account.</p>
                  )}
                  {account && (account.role === 'admin' || account.role === 'approver') && !notificationLoading && notifications.length === 0 && !notificationError && (
                    <p className="py-4 text-center text-slate-500">You’re all caught up. No pending approvals.</p>
                  )}
                  {notifications.length > 0 && (
                    <div className="space-y-2">
                      {notifications.map((notification) => {
                        const isRead = readNotificationIds.includes(notification.id)
                        return (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => {
                              markNotificationsRead([notification.id])
                              setShowNotifications(false)
                              navigate(notification.page)
                            }}
                            className={`w-full rounded-xl p-3 text-left transition ${
                              isRead
                                ? 'bg-slate-50 dark:bg-slate-800/40'
                                : 'bg-lime-50 dark:bg-lime-950/30 ring-1 ring-lime-200 dark:ring-lime-900/60'
                            }`}
                          >
                            <span className="flex items-start justify-between gap-3">
                              <span>
                                <span className="block font-bold text-slate-800 dark:text-slate-200">{notification.title}</span>
                                <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{notification.description}</span>
                              </span>
                              {!isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Unread" />}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
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

            {/* Signed-in identity comes from the authenticated wallet session. */}
            {account ? (
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu((prev) => !prev)}
                  className="flex items-center gap-2 md:gap-3 pl-1 pr-1.5 md:pr-2.5 py-1 rounded-full hover:bg-slate-100/70 dark:hover:bg-slate-800/70 cursor-pointer transition select-none border border-transparent hover:border-slate-200/80 dark:hover:border-slate-800 focus:outline-none"
                  aria-label="User profile menu"
                  aria-expanded={showProfileMenu}
                >
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${userProfile.avatarColor} text-white font-extrabold flex items-center justify-center shadow-sm text-sm`}>
                    {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="hidden sm:block text-left leading-tight">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{userProfile.name}</p>
                    <p className="text-[10px] text-slate-400">{userProfile.role}</p>
                  </div>
                  <Icon name="chevronDown" size={12} className={`text-slate-400 hidden sm:block transition-transform duration-200 ${showProfileMenu ? 'rotate-180' : ''}`} />
                </button>

                <ProfileDropdown
                  user={userProfile}
                  isOpen={showProfileMenu}
                  onSignOut={signOut}
                  onClose={() => setShowProfileMenu(false)}
                  onNavigate={(dest) => {
                    setShowProfileMenu(false)
                    navigate(dest)
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-end">
                <button
                  type="button"
                  onClick={() => void login()}
                  disabled={loginBusy || sessionLoading}
                  className="rounded-full bg-slate-950 dark:bg-lime-400 dark:text-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {sessionLoading ? 'Checking…' : loginBusy ? 'Connecting…' : 'Login'}
                </button>
                {accountMessage && <span role="status" className="absolute right-4 top-16 z-50 max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow">{accountMessage}</span>}
              </div>
            )}

          </div>

        </header>

        {/* Keep the conversation area spacious while chatting. */}
        {page !== 'chat' && <LiveMarketTicker />}

        {/* Main Content Body with smooth page transitions */}
        <div key={page} className="flex-1 flex flex-col min-h-0 overflow-hidden animate-page-fade">
          {page === 'chat' ? (
            <div className="flex-1 min-h-0 overflow-hidden">
              <ChatPage userProfile={userProfile} />
            </div>
          ) : (
            <main className="p-5 sm:p-7 lg:p-8 flex-1 overflow-y-auto">
              {page === 'overview' && (
                <OverviewPage
                  onNavigate={navigate}
                  auditState={auditState}
                  userProfile={userProfile}
                />
              )}
              {page === 'activity' && <ActivityPage auditState={auditState} refreshAudit={refreshAudit} />}
              {page === 'approvals' && <ApprovalsPage />}
              {page === 'policy' && <PolicyPage />}
              {page === 'autonomy' && <AutonomyPage />}
              {page === 'wallet' && <WalletPage userProfile={userProfile} onNavigate={navigate} />}
              {page === 'arena' && <ArenaPage />}
              {page === 'compliance' && <ComplianceConsole />}
              {page === 'payments' && <PaymentsPage />}
              {page === 'transact' && <TransactPage onNavigate={navigate} />}
              {page === 'settings' && (
                <SettingsPage
                  userProfile={userProfile}
                  onUpdateProfile={handleUpdateProfile}
                />
              )}
            </main>
          )}
        </div>

      </div>

      {/* ================= GLOBAL MODALS ================= */}

      {/* Global Quick Search Modal (⌘ K) */}
      {showSearchModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeSearch() }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-100 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Icon name="search" size={17} className="text-slate-400" />
              <input
                ref={searchInputRef}
                placeholder="Search workspace, policies, approvals, audit logs..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchSelection(0) }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    closeSearch()
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setSearchSelection((current) => Math.min(current + 1, Math.max(filteredSearchPages.length - 1, 0)))
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setSearchSelection((current) => Math.max(current - 1, 0))
                  } else if (event.key === 'Enter' && filteredSearchPages.length) {
                    event.preventDefault()
                    selectSearchResult(filteredSearchPages[searchSelection]?.page ?? filteredSearchPages[0].page)
                  }
                }}
                className="w-full text-xs font-bold outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 bg-transparent"
              />
              <button onClick={closeSearch} className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5 font-mono">ESC</button>
            </div>
            <div className="space-y-1 text-xs">
              <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 px-2">Workspace Navigation</p>
              {filteredSearchPages.map((item, index) => (
                <button
                  key={item.name}
                  onMouseEnter={() => setSearchSelection(index)}
                  onClick={() => selectSearchResult(item.page)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-left transition ${index === searchSelection ? 'bg-slate-100 dark:bg-slate-800/80' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                >
                  <span>{item.name}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Open ↵</span>
                </button>
              ))}
              {filteredSearchPages.length === 0 && (
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

import { useState, useEffect, useRef } from 'react'
import Icon from './ui/Icon'
import Badge from './ui/Badge'
import type { UserProfile, Page } from '../types'

interface ProfileDropdownProps {
  user: UserProfile
  isOpen: boolean
  onClose: () => void
  onNavigate: (page: Page) => void
}

export default function ProfileDropdown({
  user,
  isOpen,
  onClose,
  onNavigate,
}: ProfileDropdownProps) {
  const [copied, setCopied] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(user.walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  if (!isOpen) return null

  const shortAddress = `${user.walletAddress.slice(0, 6)}…${user.walletAddress.slice(-4)}`

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-80 sm:w-88 rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200/90 dark:border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 p-4 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 transition-colors"
    >
      {/* 1. User Identity Header */}
      <div className="flex items-start gap-3.5 pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${user.avatarColor || 'from-[#65A30D] to-[#84CC16]'} text-white font-black text-lg flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(101,163,13,0.35)] ring-2 ring-white dark:ring-slate-800`}>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
              {user.name}
            </h3>
            <Badge tone="green">Owner</Badge>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-400 font-mono truncate mt-0.5">
            {user.handle}
          </p>
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1">
            {user.role}
          </p>
        </div>
      </div>

      {/* 2. Guarded Wallet Pill with Copy Action */}
      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-100 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
            Guarded Wallet · Sepolia
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-[#65A30D] dark:text-lime-400">
            <span className="w-1.5 h-1.5 rounded-full bg-[#84CC16]" />
            Active
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
            {shortAddress}
          </span>
          <button
            onClick={copyAddress}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:border-[#84CC16] dark:hover:border-lime-500 transition shadow-sm"
            title="Copy wallet address"
          >
            <Icon name={copied ? 'check' : 'copy'} size={12} className={copied ? 'text-[#65A30D] dark:text-lime-400' : ''} />
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* 3. Guard Health & Spending Mini-Metrics */}
      <div className="p-3 rounded-2xl bg-lime-50/60 dark:bg-lime-950/30 border border-lime-100 dark:border-lime-900/40 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300">Autonomy tier</span>
          <span className="font-extrabold text-[#65A30D] dark:text-lime-400">L2 · Standard</span>
        </div>
        <div>
          <div className="flex justify-between items-baseline text-[11px] text-slate-500 dark:text-slate-400 mb-1">
            <span>Today's spending</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">$65.40 / $150</span>
          </div>
          <div className="w-full bg-slate-200/70 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#84CC16] h-full rounded-full" style={{ width: '43.6%' }} />
          </div>
        </div>
      </div>

      {/* 4. Menu Actions */}
      <div className="space-y-1 pt-1 text-xs">
        <button
          onClick={() => {
            onNavigate('settings')
            onClose()
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 font-semibold transition group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center group-hover:bg-[#84CC16]/15 group-hover:text-[#65A30D] transition">
              <Icon name="user" size={14} />
            </div>
            <span>Profile & Account Info</span>
          </div>
          <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">→</span>
        </button>

        <button
          onClick={() => {
            onNavigate('settings')
            onClose()
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 font-semibold transition group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center group-hover:bg-[#84CC16]/15 group-hover:text-[#65A30D] transition">
              <Icon name="settings" size={14} />
            </div>
            <span>Workspace Settings</span>
          </div>
          <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">→</span>
        </button>

        <button
          onClick={() => {
            onNavigate('activity')
            onClose()
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 font-semibold transition group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center group-hover:bg-[#84CC16]/15 group-hover:text-[#65A30D] transition">
              <Icon name="shield" size={14} />
            </div>
            <span>Connected Devices & Security</span>
          </div>
          <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">→</span>
        </button>
      </div>

      {/* 5. Footer / Disconnect */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <button
          onClick={() => {
            onClose()
            // Clear session storage if needed
            window.sessionStorage.removeItem('bambooleaf-device-session')
            window.location.reload()
          }}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
        >
          <Icon name="close" size={13} />
          <span>Disconnect Session</span>
        </button>
      </div>
    </div>
  )
}

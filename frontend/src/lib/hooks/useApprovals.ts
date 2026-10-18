import { useState, useEffect, useCallback } from 'react'

export interface ApprovalItem {
  id: string
  action: string
  amount: string
  receive: string
  recipient: string
  risk: string
  reason: string
  secondsLeft: number
  expiresAt: number
  tone: 'green' | 'amber' | 'rose'
  digest: string
  tier: 'Tier 2 · Owner Approval Required' | 'Tier 3 · High Value Multi-sig'
  calldata: string
}

const STORAGE_KEY = 'bambooleaf_pending_approvals'
const APPROVALS_EVENT = 'bambooleaf_approvals_changed'

export const defaultApprovals: Omit<ApprovalItem, 'expiresAt'>[] = [
  {
    id: 'ap-1042',
    action: 'Swap USDC → ETH',
    amount: '12.00 USDC',
    receive: '~0.0041 ETH',
    recipient: '0xe2463837df0a08d3d1728a0cef444a57a879b1dd',
    risk: 'T2 Policy Check',
    reason: 'Exceeds autonomous auto-swap threshold ($10.00). Slippage cap validated at 0.50%.',
    secondsLeft: 245,
    tone: 'amber',
    digest: '0xa7b98d249f01bb49858de59bbd8b9bc2b84a9e102fca9b1192',
    tier: 'Tier 2 · Owner Approval Required',
    calldata: '0x38ed1739000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48...',
  },
  {
    id: 'ap-1041',
    action: 'Transfer ETH',
    amount: '0.025 ETH',
    receive: 'External Recipient',
    recipient: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    risk: 'Unsaved Recipient',
    reason: 'Destination address is not present in saved contacts. Requires explicit approval before signer acts.',
    secondsLeft: 580,
    tone: 'rose',
    digest: '0xf41b9c77102eacb92019ffab52817d9834ba12891901eeaa83',
    tier: 'Tier 2 · Owner Approval Required',
    calldata: '0x',
  },
]

function createInitialApprovals(): ApprovalItem[] {
  const now = Date.now()
  return defaultApprovals.map((item) => ({
    ...item,
    expiresAt: now + item.secondsLeft * 1000,
  }))
}

export function getStoredApprovals(): ApprovalItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ApprovalItem[]
      if (Array.isArray(parsed)) {
        const now = Date.now()
        // Compute current secondsLeft and remove expired ones
        return parsed
          .map((item) => {
            const expiresAt = item.expiresAt || (now + (item.secondsLeft || 60) * 1000)
            const secondsLeft = Math.max(0, Math.floor((expiresAt - now) / 1000))
            return { ...item, expiresAt, secondsLeft }
          })
          .filter((item) => item.secondsLeft > 0)
      }
    }
  } catch (err) {
    console.error('Failed to read approvals from localStorage', err)
  }

  // First time initialization
  const initial = createInitialApprovals()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
  } catch {
    // ignore
  }
  return initial
}

export function saveApprovals(items: ApprovalItem[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch (err) {
    console.error('Failed to save approvals to localStorage', err)
  }
  window.dispatchEvent(new CustomEvent(APPROVALS_EVENT, { detail: items }))
}

export function decideStoredApproval(id: string, approved: boolean): { success: boolean; item?: ApprovalItem } {
  const current = getStoredApprovals()
  const target = current.find((it) => it.id === id)
  const remaining = current.filter((it) => it.id !== id)
  saveApprovals(remaining)

  // Optionally log decision to audit / history
  try {
    const historyRaw = localStorage.getItem('bambooleaf_approval_history')
    const history = historyRaw ? JSON.parse(historyRaw) : []
    history.unshift({
      id,
      action: target?.action || 'Unknown action',
      decision: approved ? 'approved' : 'rejected',
      timestamp: new Date().toISOString(),
      digest: target?.digest,
    })
    localStorage.setItem('bambooleaf_approval_history', JSON.stringify(history.slice(0, 50)))
  } catch {
    // ignore
  }

  return { success: true, item: target }
}

export function resetStoredApprovals(): ApprovalItem[] {
  const now = Date.now()
  const base = defaultApprovals.map((item) => ({
    ...item,
    expiresAt: now + item.secondsLeft * 1000,
  }))
  const extra: ApprovalItem = {
    id: `ap-${Math.floor(1000 + Math.random() * 9000)}`,
    action: 'Approve USDC Spend',
    amount: '50.00 USDC',
    receive: 'Uniswap V2 Router',
    recipient: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    risk: 'Allowance Grant',
    reason: 'ERC-20 token spend allowance request. Strict allowance matching transaction amount only.',
    secondsLeft: 300,
    expiresAt: now + 300 * 1000,
    tone: 'green',
    digest: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    tier: 'Tier 2 · Owner Approval Required',
    calldata: '0x095ea7b30000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488d...',
  }
  const nextList = [...base, extra]
  saveApprovals(nextList)
  return nextList
}

export function useApprovals() {
  const [items, setItems] = useState<ApprovalItem[]>(getStoredApprovals)

  // Listen for changes from other tabs or components
  useEffect(() => {
    const handleUpdate = () => {
      setItems(getStoredApprovals())
    }
    window.addEventListener(APPROVALS_EVENT, handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener(APPROVALS_EVENT, handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  // Second-by-second countdown updater
  useEffect(() => {
    if (items.length === 0) return

    const timer = setInterval(() => {
      const now = Date.now()
      let expiredCount = 0
      const updated = items.map((it) => {
        const secondsLeft = Math.max(0, Math.floor((it.expiresAt - now) / 1000))
        if (secondsLeft === 0) expiredCount++
        return { ...it, secondsLeft }
      })

      if (expiredCount > 0) {
        const remaining = updated.filter((it) => it.secondsLeft > 0)
        setItems(remaining)
        saveApprovals(remaining)
      } else {
        setItems(updated)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [items])

  const decide = useCallback((itemOrId: ApprovalItem | string, approved: boolean) => {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId.id
    const res = decideStoredApproval(id, approved)
    setItems(getStoredApprovals())
    return res
  }, [])

  const reset = useCallback(() => {
    const list = resetStoredApprovals()
    setItems(list)
    return list
  }, [])

  return {
    items,
    count: items.length,
    decide,
    reset,
    setItems: (newItems: ApprovalItem[]) => {
      saveApprovals(newItems)
      setItems(newItems)
    },
  }
}

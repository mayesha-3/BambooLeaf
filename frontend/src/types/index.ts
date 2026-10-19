export type Page = 'chat' | 'overview' | 'activity' | 'approvals' | 'policy' | 'autonomy' | 'wallet' | 'arena' | 'settings' | 'transact'

export type IconName =
  | 'grid'
  | 'activity'
  | 'check'
  | 'shield'
  | 'spark'
  | 'wallet'
  | 'target'
  | 'settings'
  | 'search'
  | 'bell'
  | 'chevron'
  | 'chevronDown'
  | 'arrow'
  | 'plus'
  | 'refresh'
  | 'external'
  | 'copy'
  | 'send'
  | 'lock'
  | 'clock'
  | 'checkCircle'
  | 'x'
  | 'filter'
  | 'more'
  | 'menu'
  | 'close'
  | 'eye'
  | 'eyeOff'
  | 'terminal'
  | 'layers'
  | 'bolt'
  | 'edit'
  | 'sun'
  | 'moon'
  | 'user'

export interface UserProfile {
  name: string
  handle: string
  email: string
  walletAddress: string
  role: string
  avatarColor: string
  bio: string
  telegram: string
  cardName: string
}

export type AuditEntry = { seq: number; requestId: string; type: string; createdAt: string; data: Record<string, unknown>; hash: string; prevHash: string }
export type AuditState = { entries: AuditEntry[]; valid: boolean | null; checked: number; error: string; loading: boolean }
export type GoalResponse = { status?: string; txHash?: string; reason?: string; error?: string; requestId?: string; code?: string }

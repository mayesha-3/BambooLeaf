export type AutonomyLevel = 'L0' | 'L1' | 'L2' | 'L3'

type State = {
  level: AutonomyLevel
  cleanStreak: number
  blockedInWindow: number
  windowStartedAt: number
  lastDemotionReason: string | null
  frozen: boolean
}

function configuredInitialLevel(): AutonomyLevel {
  const level = process.env.AUTONOMY_LEVEL || 'L1'
  if (level === 'L0' || level === 'L1' || level === 'L2' || level === 'L3') return level
  throw new Error('AUTONOMY_LEVEL must be L0, L1, L2, or L3')
}

const PROMOTION_THRESHOLD = 10
const DEMOTION_BLOCKED = 3
const WINDOW_MS = 10 * 60 * 1000

const state: State = {
  level: configuredInitialLevel(),
  cleanStreak: 0,
  blockedInWindow: 0,
  windowStartedAt: Date.now(),
  lastDemotionReason: null,
  frozen: false,
}

// ---------------- Kill switch ----------------

export function isKillSwitchActive(): boolean {
  return state.frozen
}

export function activateKillSwitch(): void {
  state.frozen = true
  state.level = 'L0'
  state.lastDemotionReason = 'Kill switch activated'
}

export function resetKillSwitch(): void {
  state.frozen = false
  state.level = 'L1'
  state.cleanStreak = 0
  state.blockedInWindow = 0
  state.windowStartedAt = Date.now()
  state.lastDemotionReason = null
}

export function requireKillSwitchOff(): void {
  if (state.frozen) {
    throw new Error('Kill switch is active — all signing is blocked')
  }
}

// ---------------- Autonomy state ----------------

export function getLevel(): AutonomyLevel {
  return state.level
}

export function getState(): Readonly<State> {
  return { ...state }
}

function resetWindowIfNeeded(): void {
  if (Date.now() - state.windowStartedAt > WINDOW_MS) {
    state.windowStartedAt = Date.now()
    state.blockedInWindow = 0
  }
}

export function recordCleanExecution(): void {
  resetWindowIfNeeded()
  state.cleanStreak += 1

  if (state.cleanStreak >= PROMOTION_THRESHOLD && !state.frozen) {
    state.cleanStreak = 0
    if (state.level === 'L1') state.level = 'L2'
    else if (state.level === 'L2') state.level = 'L3'
    // L3 is the ceiling
  }
}

export function recordBlockedAttempt(reason: string, critical = false): void {
  resetWindowIfNeeded()
  state.cleanStreak = 0
  state.blockedInWindow += 1
  state.lastDemotionReason = reason

  if (critical || state.blockedInWindow >= DEMOTION_BLOCKED) {
    state.level = 'L0'
    state.frozen = true
  }
}

export function reset(): void {
  state.level = 'L1'
  state.cleanStreak = 0
  state.blockedInWindow = 0
  state.windowStartedAt = Date.now()
  state.lastDemotionReason = null
  state.frozen = false
}

export function restoreState(saved: Partial<State>): void {
  if (saved.level !== 'L0' && saved.level !== 'L1' && saved.level !== 'L2' && saved.level !== 'L3') {
    throw new Error('Persisted autonomy state has an invalid level')
  }
  if (typeof saved.cleanStreak !== 'number' || !Number.isInteger(saved.cleanStreak) || saved.cleanStreak < 0 ||
      typeof saved.blockedInWindow !== 'number' || !Number.isInteger(saved.blockedInWindow) || saved.blockedInWindow < 0 ||
      typeof saved.windowStartedAt !== 'number' || !Number.isFinite(saved.windowStartedAt) ||
      typeof saved.frozen !== 'boolean' ||
      (saved.lastDemotionReason !== null && typeof saved.lastDemotionReason !== 'string')) {
    throw new Error('Persisted autonomy state is invalid')
  }
  state.level = saved.level
  state.cleanStreak = saved.cleanStreak
  state.blockedInWindow = saved.blockedInWindow
  state.windowStartedAt = saved.windowStartedAt
  state.lastDemotionReason = saved.lastDemotionReason
  state.frozen = saved.frozen
  if (state.frozen) state.level = 'L0'
}
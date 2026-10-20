// Small pure helpers for the opening splash screen. The storage object is passed in, so the logic is
// easy to test, and nothing crashes when the browser blocks storage (for example in private mode).
export const BRAND_NAME = 'BambooLeaf'

/** How long the splash screen stays before the app opens (3.5 seconds). */
export const SPLASH_MS = 3500
/** The last part of that time is a fade-out. */
export const FADE_OUT_MS = 400

export const LANDING_SEEN_KEY = 'bambooleaf:landing-seen'
/** Same key and rule as App.tsx: a saved choice wins, otherwise the operating system setting. Read only. */
export const APP_THEME_KEY = 'bambooleaf_theme'

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

/** The splash is on by default. Set VITE_SHOW_LANDING=false to skip it (for example in a demo recording). */
export function isLandingEnabled(flag: string | undefined): boolean {
  return flag !== 'false'
}

export function safeSessionStorage(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function safeLocalStorage(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function hasSeenLanding(store: KeyValueStore | null): boolean {
  try {
    return store?.getItem(LANDING_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markLandingSeen(store: KeyValueStore | null): void {
  try {
    store?.setItem(LANDING_SEEN_KEY, '1')
  } catch {
    // Storage is blocked: the splash simply shows again on the next visit.
  }
}

export function prefersDarkTheme(store: KeyValueStore | null, systemPrefersDark: boolean): boolean {
  try {
    const saved = store?.getItem(APP_THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved === 'dark'
  } catch {
    // Storage is blocked: fall back to the system setting.
  }
  return systemPrefersDark
}

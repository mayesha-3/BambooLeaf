import { isLanguageCode, type LanguageCode } from './i18n'

// Small pure helpers for the opening page. The storage object is passed in, so the logic is easy
// to test, and nothing crashes when the browser blocks storage (for example in private mode).
export const LANDING_SEEN_KEY = 'bambooleaf:landing-seen'
export const LANDING_LANG_KEY = 'bambooleaf:landing-lang'

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

/** The opening page is on by default. Set VITE_SHOW_LANDING=false to skip it (for example in a demo recording). */
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
    // Storage is blocked: the opening page simply shows again on the next visit.
  }
}

export function getSavedLanguage(store: KeyValueStore | null): LanguageCode | null {
  try {
    const value = store?.getItem(LANDING_LANG_KEY)
    return isLanguageCode(value) ? value : null
  } catch {
    return null
  }
}

/** Same key and rule as App.tsx: a saved choice wins, otherwise the operating system setting. Read only. */
export const APP_THEME_KEY = 'bambooleaf_theme'

export function prefersDarkTheme(store: KeyValueStore | null, systemPrefersDark: boolean): boolean {
  try {
    const saved = store?.getItem(APP_THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved === 'dark'
  } catch {
    // Storage is blocked: fall back to the system setting.
  }
  return systemPrefersDark
}

export function safeLocalStorage(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function saveLanguage(store: KeyValueStore | null, code: LanguageCode): void {
  try {
    store?.setItem(LANDING_LANG_KEY, code)
  } catch {
    // Not saved. The language falls back to the browser language next time.
  }
}

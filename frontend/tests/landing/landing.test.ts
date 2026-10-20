import assert from 'node:assert/strict'
import test from 'node:test'
import { LANGUAGES, isLanguageCode, nextLanguage, pickLanguage } from '../../src/features/landing/i18n'
import {
  LANDING_LANG_KEY,
  getSavedLanguage,
  hasSeenLanding,
  isLandingEnabled,
  markLandingSeen,
  APP_THEME_KEY,
  prefersDarkTheme,
  saveLanguage,
} from '../../src/features/landing/landing-state'
import { BAMBOO_SEGMENTS, LEAF_POINTS } from '../../src/features/landing/logo-geometry'

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value
    },
  }
}

const blockedStore = {
  getItem: (): string | null => {
    throw new Error('storage blocked')
  },
  setItem: (): void => {
    throw new Error('storage blocked')
  },
}

test('the opening page is on unless VITE_SHOW_LANDING is the text "false"', () => {
  assert.equal(isLandingEnabled(undefined), true)
  assert.equal(isLandingEnabled('true'), true)
  assert.equal(isLandingEnabled('false'), false)
})

test('the opening page shows once per session', () => {
  const store = memoryStore()
  assert.equal(hasSeenLanding(store), false)
  markLandingSeen(store)
  assert.equal(hasSeenLanding(store), true)
})

test('blocked or missing storage never throws and shows the page again', () => {
  assert.equal(hasSeenLanding(null), false)
  assert.equal(hasSeenLanding(blockedStore), false)
  assert.doesNotThrow(() => markLandingSeen(blockedStore))
  assert.doesNotThrow(() => markLandingSeen(null))
})

test('language: saved choice wins, then browser language, then English', () => {
  assert.equal(pickLanguage('bn', 'en-US'), 'bn')
  assert.equal(pickLanguage('xx', 'bn-BD'), 'bn')
  assert.equal(pickLanguage(null, 'en-GB'), 'en')
  assert.equal(pickLanguage(null, undefined), 'en')
  assert.equal(pickLanguage('toString', 'fr'), 'en')
})

test('language switch cycles and a saved value is checked', () => {
  assert.equal(nextLanguage('en'), 'bn')
  assert.equal(nextLanguage('bn'), 'en')
  const store = memoryStore({ [LANDING_LANG_KEY]: 'nonsense' })
  assert.equal(getSavedLanguage(store), null)
  saveLanguage(store, 'bn')
  assert.equal(getSavedLanguage(store), 'bn')
  assert.equal(isLanguageCode('en'), true)
})

test('every language has the same keys and three headline lines', () => {
  const reference = Object.keys(LANGUAGES.en).sort()
  for (const copy of Object.values(LANGUAGES)) {
    assert.deepEqual(Object.keys(copy).sort(), reference)
    assert.equal(copy.headline.length, 3)
    assert.ok(copy.enter.length > 0 && copy.intro.length > 0)
    assert.ok(copy.dir === 'ltr' || copy.dir === 'rtl')
  }
})

test('theme follows the app: saved choice wins, otherwise the system setting', () => {
  assert.equal(prefersDarkTheme(memoryStore({ [APP_THEME_KEY]: 'dark' }), false), true)
  assert.equal(prefersDarkTheme(memoryStore({ [APP_THEME_KEY]: 'light' }), true), false)
  assert.equal(prefersDarkTheme(memoryStore({ [APP_THEME_KEY]: 'purple' }), true), true)
  assert.equal(prefersDarkTheme(memoryStore(), false), false)
  assert.equal(prefersDarkTheme(null, true), true)
  assert.equal(prefersDarkTheme(blockedStore, false), false)
})

test('logo geometry stays inside its boxes', () => {
  const numbers = LEAF_POINTS.split(/[ ,]/).map(Number)
  assert.equal(numbers.length % 2, 0)
  assert.ok(numbers.every((n) => Number.isFinite(n) && n >= 0 && n <= 100))
  for (const s of BAMBOO_SEGMENTS) {
    assert.ok(s.w > 0 && s.h > 0)
    assert.ok(s.x >= 0 && s.x + s.w <= 128 && s.y >= 0 && s.y + s.h <= 128)
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  APP_THEME_KEY,
  BRAND_NAME,
  FADE_OUT_MS,
  SPLASH_MS,
  hasSeenLanding,
  isLandingEnabled,
  markLandingSeen,
  prefersDarkTheme,
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

test('the splash lasts 3 to 4 seconds and the fade-out fits inside it', () => {
  assert.ok(SPLASH_MS >= 3000 && SPLASH_MS <= 4000)
  assert.ok(FADE_OUT_MS > 0 && FADE_OUT_MS < SPLASH_MS)
})

test('the only text on the splash is the brand name', () => {
  assert.equal(BRAND_NAME, 'BambooLeaf')
})

test('the splash is on unless VITE_SHOW_LANDING is the text "false"', () => {
  assert.equal(isLandingEnabled(undefined), true)
  assert.equal(isLandingEnabled('true'), true)
  assert.equal(isLandingEnabled('false'), false)
})

test('the splash shows once per session', () => {
  const store = memoryStore()
  assert.equal(hasSeenLanding(store), false)
  markLandingSeen(store)
  assert.equal(hasSeenLanding(store), true)
})

test('blocked or missing storage never throws and shows the splash again', () => {
  assert.equal(hasSeenLanding(null), false)
  assert.equal(hasSeenLanding(blockedStore), false)
  assert.doesNotThrow(() => markLandingSeen(blockedStore))
  assert.doesNotThrow(() => markLandingSeen(null))
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

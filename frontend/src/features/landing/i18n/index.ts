import { bn } from './bn'
import { en } from './en'
import type { LandingCopy, LanguageCode } from './types'

export type { LandingCopy, LanguageCode }

export const LANGUAGES: Record<LanguageCode, LandingCopy> = { en, bn }
export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && Object.keys(LANGUAGES).includes(value)
}

/** A saved choice wins. Otherwise follow the browser language. Otherwise English. */
export function pickLanguage(saved: string | null, browserLanguage: string | undefined): LanguageCode {
  if (isLanguageCode(saved)) return saved
  const browserCode = browserLanguage?.toLowerCase().split('-')[0]
  return isLanguageCode(browserCode) ? browserCode : DEFAULT_LANGUAGE
}

/** Cycles through the registered languages, so a third language needs no change here. */
export function nextLanguage(current: LanguageCode): LanguageCode {
  const codes = Object.keys(LANGUAGES) as LanguageCode[]
  return codes[(codes.indexOf(current) + 1) % codes.length]
}

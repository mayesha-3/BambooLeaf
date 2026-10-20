export type LanguageCode = 'en' | 'bn'

// Every language file must provide all of these keys. Add a new language by adding one file
// that satisfies this type, then register it in index.ts. No UI text lives in the components.
export interface LandingCopy {
  code: LanguageCode
  dir: 'ltr' | 'rtl'
  brand: string
  logoLabel: string
  headline: readonly [string, string, string]
  intro: string
  enter: string
  note: string
  footer: string
  /** Text on the button that switches to this language's counterpart. */
  switchLabel: string
  switchAria: string
}

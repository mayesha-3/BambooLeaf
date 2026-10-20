import { useEffect, useState } from 'react'
import { BambooLeafLogo } from './BambooLeafLogo'
import { LANGUAGES, nextLanguage, pickLanguage, type LanguageCode } from './i18n'
import { getSavedLanguage, prefersDarkTheme, safeLocalStorage, safeSessionStorage, saveLanguage } from './landing-state'
import './landing.css'

interface LandingPageProps {
  onEnter: () => void
}

export function LandingPage({ onEnter }: LandingPageProps) {
  const [lang, setLang] = useState<LanguageCode>(() =>
    pickLanguage(getSavedLanguage(safeSessionStorage()), typeof navigator === 'undefined' ? undefined : navigator.language),
  )
  const copy = LANGUAGES[lang]

  // The app sets `html.dark` only after it mounts, so apply the same theme here first.
  useEffect(() => {
    const systemDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', prefersDarkTheme(safeLocalStorage(), systemDark))
  }, [])

  // Keep the page language and direction right for screen readers and for right-to-left languages later.
  useEffect(() => {
    document.documentElement.lang = copy.code
    document.documentElement.dir = copy.dir
    return () => {
      document.documentElement.lang = 'en'
      document.documentElement.dir = 'ltr'
    }
  }, [copy.code, copy.dir])

  function switchLanguage() {
    const next = nextLanguage(lang)
    setLang(next)
    saveLanguage(safeSessionStorage(), next)
  }

  return (
    <div className="bl-landing">
      <header className="bl-landing__bar">
        <span className="bl-landing__brand">
          <BambooLeafLogo className="bl-landing__brand-mark" />
          {copy.brand}
        </span>
        <button type="button" className="bl-landing__lang" onClick={switchLanguage} aria-label={copy.switchAria}>
          {copy.switchLabel}
        </button>
      </header>

      <main className="bl-landing__main">
        <div className="bl-landing__copy">
          <h1 className="bl-landing__headline">
            {copy.headline.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className="bl-landing__intro">{copy.intro}</p>
          <button type="button" className="bl-landing__enter" onClick={onEnter}>
            {copy.enter}
          </button>
          <p className="bl-landing__note">{copy.note}</p>
        </div>

        <div className="bl-landing__art">
          <BambooLeafLogo className="bl-landing__logo" title={copy.logoLabel} animate />
        </div>
      </main>

      <footer className="bl-landing__footer">{copy.footer}</footer>
    </div>
  )
}

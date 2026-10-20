import { useEffect, useState } from 'react'
import { BambooLeafLogo } from './BambooLeafLogo'
import { BRAND_NAME, FADE_OUT_MS, SPLASH_MS, prefersDarkTheme, safeLocalStorage } from './landing-state'
import './landing.css'

interface LandingPageProps {
  onEnter: () => void
}

// A splash screen: the logo and the name, then the app opens by itself.
export function LandingPage({ onEnter }: LandingPageProps) {
  const [leaving, setLeaving] = useState(false)

  // The app sets `html.dark` only after it mounts, so apply the same theme here first.
  useEffect(() => {
    const systemDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', prefersDarkTheme(safeLocalStorage(), systemDark))
  }, [])

  // Fade out, then open the app. The cleanup clears both timers, so nothing fires after the page is gone.
  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), SPLASH_MS - FADE_OUT_MS)
    const enter = window.setTimeout(onEnter, SPLASH_MS)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(enter)
    }
  }, [onEnter])

  return (
    <div
      className={leaving ? 'bl-landing bl-landing--leaving' : 'bl-landing'}
      role="presentation"
      onClick={onEnter}
    >
      <BambooLeafLogo className="bl-landing__logo" title={`${BRAND_NAME} logo`} animate />
      <h1 className="bl-landing__name">{BRAND_NAME}</h1>
    </div>
  )
}

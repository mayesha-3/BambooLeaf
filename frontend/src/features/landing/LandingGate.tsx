import { useCallback, useState, type ReactNode } from 'react'
import { LandingPage } from './LandingPage'
import { hasSeenLanding, isLandingEnabled, markLandingSeen, safeSessionStorage } from './landing-state'

interface LandingGateProps {
  /** The real app. It is mounted only after the splash screen ends. */
  children: ReactNode
}

// Shows the splash screen once per browser tab session, then the app.
// A reload inside the same tab (for example after logout) goes straight to the app.
export function LandingGate({ children }: LandingGateProps) {
  const [entered, setEntered] = useState(
    () => !isLandingEnabled(import.meta.env.VITE_SHOW_LANDING) || hasSeenLanding(safeSessionStorage()),
  )

  // A stable function, so the splash timers are not restarted by a re-render.
  const enter = useCallback(() => {
    markLandingSeen(safeSessionStorage())
    setEntered(true)
  }, [])

  if (entered) return <>{children}</>
  return <LandingPage onEnter={enter} />
}

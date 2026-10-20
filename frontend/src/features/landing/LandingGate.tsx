import { useState, type ReactNode } from 'react'
import { LandingPage } from './LandingPage'
import { hasSeenLanding, isLandingEnabled, markLandingSeen, safeSessionStorage } from './landing-state'

interface LandingGateProps {
  /** The real app. It is mounted only after the visitor leaves the opening page. */
  children: ReactNode
}

// Shows the opening page once per browser tab session, then the app.
// A reload inside the same tab (for example after logout) goes straight to the app.
export function LandingGate({ children }: LandingGateProps) {
  const [entered, setEntered] = useState(
    () => !isLandingEnabled(import.meta.env.VITE_SHOW_LANDING) || hasSeenLanding(safeSessionStorage()),
  )

  if (entered) return <>{children}</>

  return (
    <LandingPage
      onEnter={() => {
        markLandingSeen(safeSessionStorage())
        setEntered(true)
      }}
    />
  )
}

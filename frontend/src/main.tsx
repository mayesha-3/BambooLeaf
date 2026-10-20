import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LandingGate } from './features/landing'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LandingGate>
      <App />
    </LandingGate>
  </StrictMode>,
)

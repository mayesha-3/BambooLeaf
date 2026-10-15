import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-slate-100/90 bg-white shadow-[0_4px_25px_rgba(0,0,0,0.02)] ${className}`}>{children}</section>
}

export default Card

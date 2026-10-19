import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-slate-100/90 dark:border-slate-800/80 bg-white dark:bg-[#0f172a] shadow-[0_4px_25px_rgba(0,0,0,0.02)] dark:shadow-[0_4px_25px_rgba(0,0,0,0.35)] text-slate-900 dark:text-slate-100 transition-colors duration-200 ${className}`}>
      {children}
    </section>
  )
}

export default Card

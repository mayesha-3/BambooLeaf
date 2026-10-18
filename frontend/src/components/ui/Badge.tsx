import type { ReactNode } from 'react'

export function toneClasses(tone: string) {
  if (tone === 'green') return 'bg-lime-50 dark:bg-lime-950/50 text-lime-800 dark:text-lime-300 ring-lime-600/20 dark:ring-lime-500/30'
  if (tone === 'amber') return 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 ring-amber-600/20 dark:ring-amber-500/30'
  if (tone === 'red') return 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 ring-rose-600/20 dark:ring-rose-500/30'
  return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/10 dark:ring-slate-700/50'
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${toneClasses(tone)}`}>{children}</span>
}

export default Badge

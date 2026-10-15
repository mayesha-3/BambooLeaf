import type { ReactNode } from 'react'

export function toneClasses(tone: string) {
  if (tone === 'green') return 'bg-lime-50 text-lime-800 ring-lime-600/20'
  if (tone === 'amber') return 'bg-amber-50 text-amber-800 ring-amber-600/20'
  if (tone === 'red') return 'bg-rose-50 text-rose-800 ring-rose-600/20'
  return 'bg-slate-100 text-slate-600 ring-slate-500/10'
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${toneClasses(tone)}`}>{children}</span>
}

export default Badge

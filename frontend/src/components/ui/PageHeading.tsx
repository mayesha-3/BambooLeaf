import type { ReactNode } from 'react'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[#65A30D] dark:text-lime-400">{eyebrow}</p>}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {description && <p className="mt-1 text-xs sm:text-sm leading-6 text-slate-400 dark:text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export default PageHeading

import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ title, actions, children, className = '' }: PanelProps) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col bg-panel ${className}`}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-edge px-3">
        <h2 className="text-xs font-semibold tracking-wide text-white">{title}</h2>
        {actions}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

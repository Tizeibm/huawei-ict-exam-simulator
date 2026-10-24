import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import type { ReactNode } from 'react'

const STYLES = { error: 'auth-alert-error', success: 'auth-alert-success', info: 'auth-alert-info' } as const
const ICONS = { error: AlertCircle, success: CheckCircle2, info: Info } as const

export function Alert({ kind, children }: { kind: keyof typeof STYLES; children: ReactNode }) {
  const Icon = ICONS[kind]
  return (
    <div className={`auth-alert ${STYLES[kind]}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function FormHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
      <h1 className="text-3xl font-bold tracking-tight text-balance">{title}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </header>
  )
}

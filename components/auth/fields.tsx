'use client'

import { useId, useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'

type Props = Omit<ComponentProps<'input'>, 'type' | 'id'> & { label: string; error?: string; hint?: string }

export function PasswordField({ label, error, hint, className, ...props }: Props) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <Input id={id} type={visible ? 'text' : 'password'} aria-invalid={!!error} aria-describedby={describedBy} className="pr-11" {...props} />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {error ? <p id={`${id}-error`} className="auth-error" role="alert">{error}</p> : hint ? <p id={`${id}-hint`} className="auth-hint">{hint}</p> : null}
    </div>
  )
}

export function TextField({ label, error, hint, ...props }: Omit<ComponentProps<'input'>, 'id'> & { label: string; error?: string; hint?: string }) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <Input id={id} aria-invalid={!!error} aria-describedby={describedBy} {...props} />
      {error ? <p id={`${id}-error`} className="auth-error" role="alert">{error}</p> : hint ? <p id={`${id}-hint`} className="auth-hint">{hint}</p> : null}
    </div>
  )
}

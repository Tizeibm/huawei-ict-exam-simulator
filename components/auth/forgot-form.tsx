'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { TextField } from './fields'
import { Alert, FormHeading } from './feedback'

export function ForgotForm({ linkError }: { linkError?: boolean }) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setPending(false)
    if (resetError && /rate limit/i.test(resetError.message)) { setError('Too many requests. Please wait a few minutes and try again.'); return }
    setSent(true) // Same message whether or not the account exists, to avoid account enumeration.
  }

  return (
    <>
      <FormHeading eyebrow="Password recovery" title="Reset your password" description="Enter your email and we will send you a secure link to choose a new password." />
      {linkError && <Alert kind="error">That reset link is invalid or has expired. Request a new one.</Alert>}
      {sent ? (
        <Alert kind="success">If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-sm" disabled={pending}>
            {pending ? <><Loader2 className="animate-spin" aria-hidden="true" /> Sending…</> : 'Send reset link'}
          </Button>
        </form>
      )}
      <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"><ArrowLeft className="size-4" aria-hidden="true" /> Back to sign in</Link>
    </>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PasswordField } from './fields'
import { Alert, FormHeading } from './feedback'

export function ResetForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setPending(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setPending(false)
    if (updateError) { setError('Your password could not be updated. Request a new reset link and try again.'); return }
    setDone(true)
    setTimeout(() => { router.replace('/'); router.refresh() }, 1200)
  }

  return (
    <>
      <FormHeading eyebrow="Password recovery" title="Choose a new password" description="Pick a strong password you do not use elsewhere." />
      {done ? <Alert kind="success">Password updated. Redirecting…</Alert> : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <PasswordField label="New password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." />
          <PasswordField label="Confirm new password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-sm" disabled={pending}>
            {pending ? <><Loader2 className="animate-spin" aria-hidden="true" /> Saving…</> : 'Update password'}
          </Button>
        </form>
      )}
    </>
  )
}

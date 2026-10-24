'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PasswordField, TextField } from './fields'
import { Alert, FormHeading } from './feedback'

export function LoginForm({ notice }: { notice?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    const { error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) {
      setPending(false)
      setError(/not confirmed/i.test(signInError.message)
        ? 'This account has not been confirmed. Ask an administrator to confirm it in Supabase.'
        : /invalid/i.test(signInError.message) ? 'Incorrect email or password.' : 'Sign-in failed. Please try again.')
      return
    }
    // The proxy routes the user to the right place based on role and approval status.
    router.replace('/')
    router.refresh()
  }

  return (
    <>
      <FormHeading eyebrow="Welcome back" title="Sign in to ICT Prep" description="Use the email and password for your approved account." />
      {notice && <Alert kind="info">{notice}</Alert>}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
        <TextField label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <PasswordField label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="-mt-1 text-right"><Link href="/forgot-password" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Forgot your password?</Link></div>
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-sm" disabled={pending}>
          {pending ? <><Loader2 className="animate-spin" aria-hidden="true" /> Signing in…</> : <>Sign in <ArrowRight aria-hidden="true" /></>}
        </Button>
      </form>
      <div className="rounded-2xl border bg-accent/60 p-4">
        <p className="text-sm font-semibold">New to ICT Prep?</p>
        <p className="mt-1 text-sm text-muted-foreground">Accounts are reviewed by an administrator before practice exams unlock.</p>
        <Link href="/signup" className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-primary/40 bg-card text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">Request access</Link>
      </div>
    </>
  )
}

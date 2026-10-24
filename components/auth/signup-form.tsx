'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { ClipboardCheck, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PasswordField, TextField } from './fields'
import { Alert, FormHeading } from './feedback'

type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>

export function validateSignup(values: { name: string; email: string; password: string; confirm: string }): Errors {
  const errors: Errors = {}
  if (values.name.trim().length < 2) errors.name = 'Enter your full name (at least 2 characters).'
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  if (values.password.length < 8) errors.password = 'Use at least 8 characters.'
  if (values.confirm !== values.password) errors.confirm = 'Passwords do not match.'
  return errors
}

export function SignupForm() {
  const router = useRouter()
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((old) => ({ ...old, [key]: e.target.value }))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    const found = validateSignup(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setPending(true)
    // No emailRedirectTo and no role: the database trigger always creates a PENDING candidate profile.
    const { data, error } = await createClient().auth.signUp({
      email: values.email.trim(),
      password: values.password,
      options: { data: { full_name: values.name.trim() } },
    })
    setPending(false)
    if (error) {
      setFormError(/rate limit/i.test(error.message) ? 'Too many attempts. Please wait a few minutes and try again.' : /password/i.test(error.message) ? 'That password is not accepted. Try a longer one.' : 'We could not create your request. Please try again.')
      return
    }
    if (data.session) {
      router.replace('/pending')
      router.refresh()
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <>
        <FormHeading eyebrow="Request received" title="Check your account status" description="Your request was sent." />
        <Alert kind="info">If this email can be used, your request is waiting for administrator approval. Try signing in; if you are asked to confirm your email, the project still has email confirmation enabled and an administrator must disable it.</Alert>
        <Link href="/login" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">Go to sign in</Link>
      </>
    )
  }

  return (
    <>
      <FormHeading eyebrow="Request access" title="Create your ICT Prep account" description="Register once. An administrator reviews every request before you can start practising." />
      <Alert kind="info"><span className="inline-flex items-center gap-1.5 font-semibold"><ClipboardCheck className="size-4" aria-hidden="true" /> Approval required.</span> No email verification is needed. Your account stays <strong>pending</strong> until an administrator approves it.</Alert>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Full name" autoComplete="name" required value={values.name} onChange={set('name')} error={errors.name} placeholder="Your full name" />
        <TextField label="Email address" type="email" autoComplete="email" required value={values.email} onChange={set('email')} error={errors.email} placeholder="you@example.com" />
        <PasswordField label="Password" autoComplete="new-password" required value={values.password} onChange={set('password')} error={errors.password} hint="At least 8 characters." />
        <PasswordField label="Confirm password" autoComplete="new-password" required value={values.confirm} onChange={set('confirm')} error={errors.confirm} />
        {formError && <Alert kind="error">{formError}</Alert>}
        <Button type="submit" size="lg" className="h-11 w-full rounded-xl text-sm" disabled={pending}>
          {pending ? <><Loader2 className="animate-spin" aria-hidden="true" /> Sending request…</> : 'Request access'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">Already approved? <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">Sign in</Link></p>
    </>
  )
}

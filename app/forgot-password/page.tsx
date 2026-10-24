import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { ForgotForm } from '@/components/auth/forgot-form'

export const metadata: Metadata = { title: 'Reset password · ICT Prep' }

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return <AuthShell><ForgotForm linkError={error === 'link'} /></AuthShell>
}

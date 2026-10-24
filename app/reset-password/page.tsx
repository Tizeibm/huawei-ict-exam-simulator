import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { ResetForm } from '@/components/auth/reset-form'

export const metadata: Metadata = { title: 'Choose a new password · ICT Prep' }

export default function ResetPasswordPage() {
  return <AuthShell><ResetForm /></AuthShell>
}

import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignupForm } from '@/components/auth/signup-form'

export const metadata: Metadata = { title: 'Request access · ICT Prep', description: 'Request an ICT Prep account. An administrator approves every account.' }

export default function SignupPage() {
  return <AuthShell><SignupForm /></AuthShell>
}

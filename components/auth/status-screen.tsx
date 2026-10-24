'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Ban, Clock3, Loader2, ShieldAlert, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AuthShell } from './auth-shell'

const COPY = {
  pending: { Icon: Clock3, tone: 'bg-amber-500/10 text-amber-700', title: 'Your request is pending approval', body: 'An administrator is reviewing your account. Practice exams, results and the dashboard unlock as soon as you are approved. You can safely close this page and come back later.' },
  rejected: { Icon: XCircle, tone: 'bg-destructive/10 text-destructive', title: 'Your request was not approved', body: 'An administrator declined this account request, so access to ICT Prep is blocked. If you believe this is a mistake, contact the administrator who manages the programme.' },
  suspended: { Icon: Ban, tone: 'bg-destructive/10 text-destructive', title: 'Your account is suspended', body: 'Access has been temporarily blocked by an administrator. Contact the administrator to find out whether it can be restored.' },
} as const

export function StatusScreen({ status, email }: { status: keyof typeof COPY; email?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const { Icon, tone, title, body } = COPY[status]

  async function signOut() {
    setPending(true)
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <span className={`flex size-14 items-center justify-center rounded-2xl ${tone}`}><Icon className="size-7" aria-hidden="true" /></span>
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Account status · {status}</p>
          <h1 className="text-3xl font-bold tracking-tight text-balance">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        </header>
        {email && <p className="flex items-center gap-2 rounded-xl border bg-muted/50 px-4 py-3 text-sm"><ShieldAlert className="size-4 text-muted-foreground" aria-hidden="true" /> Signed in as <strong className="break-all">{email}</strong></p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" size="lg" className="h-11 rounded-xl px-5" onClick={() => router.refresh()}>Check status again</Button>
          <Button size="lg" className="h-11 rounded-xl px-5" onClick={signOut} disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />} Sign out</Button>
        </div>
      </div>
    </AuthShell>
  )
}

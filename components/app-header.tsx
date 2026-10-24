'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function AppHeader({ email, isAdmin }: { email?: string; isAdmin: boolean }) {
  const router = useRouter()
  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }
  const link = 'rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
  return (
    <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-3" aria-label="ICT Prep home">
          <span className="brand-mark" aria-hidden="true"><span>ICT</span></span>
          <span className="text-lg font-bold tracking-tight">ICT Prep</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {isAdmin ? <Link className={link} href="/admin">Administration</Link> : <>
            <Link className={link} href="/dashboard">Dashboard</Link>
            <Link className={link} href="/exam">Practice exam</Link>
          </>}
        </nav>
        <div className="flex items-center gap-3">
          {email && <span className="hidden max-w-48 truncate text-sm text-muted-foreground md:block">{email}</span>}
          <Button variant="outline" onClick={signOut}><LogOut aria-hidden="true" /> Sign out</Button>
        </div>
      </div>
    </header>
  )
}

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  BarChart3,
  BookOpenCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  UserCog,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface AppHeaderProps {
  email?: string
  fullName?: string
  isAdmin: boolean
}

export function AppHeader({ email, fullName, isAdmin }: AppHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { href: '/exam', label: 'Exam Simulator', Icon: BookOpenCheck },
    { href: '/analytics', label: 'Analytics', Icon: BarChart3 },
    { href: '/profile', label: 'Profile', Icon: UserCog },
    ...(isAdmin ? [{ href: '/admin', label: 'Administration', Icon: Shield }] : []),
  ]

  function isActive(href: string) {
    if (href === '/exam' && pathname.startsWith('/results')) return false
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg" aria-label="ICT Prep dashboard">
            <span className="brand-mark" aria-hidden="true">
              <span>ICT</span>
            </span>
            <div className="leading-none">
              <span className="block text-base font-bold tracking-tight text-foreground">ICT Prep</span>
              <span className="hidden text-[11px] font-medium text-muted-foreground sm:block">
                Computing Track Simulator
              </span>
            </div>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
            {navItems.map(({ href, label, Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden items-center gap-2 sm:flex">
            <Badge variant={isAdmin ? 'default' : 'secondary'} className="uppercase tracking-wider text-[10px]">
              {isAdmin ? 'Administrator' : 'Candidate'}
            </Badge>
            {(fullName || email) && (
              <span className="max-w-44 truncate text-xs font-medium text-muted-foreground" title={email}>
                {fullName || email}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={signOut}
            disabled={signingOut}
            className="hidden sm:inline-flex"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t bg-card px-4 py-3 md:hidden">
          <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
            {navItems.map(({ href, label, Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">{fullName || email || 'Signed in'}</p>
              <p className="text-[11px] text-muted-foreground">{isAdmin ? 'Administrator & Candidate' : 'Approved Candidate'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={signOut} disabled={signingOut}>
              <LogOut className="size-3.5" aria-hidden="true" />
              <span>Sign out</span>
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}

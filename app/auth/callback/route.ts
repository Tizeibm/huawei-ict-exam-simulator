import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Completes the password-recovery link flow. Only same-site, allow-listed targets are accepted.
const ALLOWED_NEXT = new Set(['/reset-password'])

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/reset-password'
  const target = ALLOWED_NEXT.has(next) ? next : '/reset-password'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${target}`)
  }
  return NextResponse.redirect(`${origin}/forgot-password?error=link`)
}

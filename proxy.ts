import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { decideRedirect, type ProfileLike } from '@/lib/auth/access'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // getUser() validates the JWT with Supabase Auth; getSession() alone must not be trusted here.
  const { data: { user } } = await supabase.auth.getUser()
  let profile: ProfileLike | null = null
  if (user) {
    const { data } = await supabase.from('profiles').select('role, status').eq('id', user.id).maybeSingle()
    profile = (data ?? null) as ProfileLike | null // unreadable profile => treated as PENDING (fail closed)
  }

  const { pathname } = request.nextUrl
  const target = decideRedirect(pathname, !!user, profile)
  if (target && target !== pathname) {
    const redirect = NextResponse.redirect(new URL(target, request.url))
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}

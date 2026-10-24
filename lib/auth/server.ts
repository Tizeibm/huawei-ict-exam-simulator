import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isActiveAdmin, isApproved, type ProfileLike } from './access'

async function load() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null as ProfileLike | null }
  const { data } = await supabase.from('profiles').select('role, status').eq('id', user.id).maybeSingle()
  return { supabase, user, profile: (data ?? null) as ProfileLike | null }
}

/** Authenticated AND approved. The role is always read from the database, never from the request. */
export async function requireApproved() {
  const ctx = await load()
  if (!ctx.user) return { ok: false as const, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  if (!isApproved(ctx.profile)) return { ok: false as const, response: NextResponse.json({ error: 'Your account is not approved.' }, { status: 403 }) }
  return { ok: true as const, supabase: ctx.supabase, user: ctx.user, profile: ctx.profile }
}

/** Authenticated, approved administrator. */
export async function requireAdmin() {
  const ctx = await load()
  if (!ctx.user) return { ok: false as const, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  if (!isActiveAdmin(ctx.profile)) return { ok: false as const, response: NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }) }
  return { ok: true as const, supabase: ctx.supabase, user: ctx.user, profile: ctx.profile }
}

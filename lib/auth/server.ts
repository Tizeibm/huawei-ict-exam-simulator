import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isActiveAdmin, isApproved, normalizeRole, normalizeStatus, type AccountRole, type AccountStatus, type ProfileLike } from './access'

export interface UserProfileRecord extends ProfileLike {
  id: string
  email?: string
  full_name: string
  role: AccountRole
  status: AccountStatus
  created_at: string
  updated_at?: string
}

export async function getCurrentUserContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      supabase,
      user: null,
      profile: null as UserProfileRecord | null,
      isAdmin: false,
      isApproved: false,
    }
  }

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle()

  const profile: UserProfileRecord | null = data
    ? {
        id: data.id,
        email: user.email ?? '',
        full_name: data.full_name ?? '',
        role: normalizeRole(data.role),
        status: normalizeStatus(data.status),
        created_at: data.created_at,
        updated_at: data.updated_at,
      }
    : null

  return {
    supabase,
    user,
    profile,
    isAdmin: isActiveAdmin(profile),
    isApproved: isApproved(profile),
  }
}

/** Authenticated AND approved. The role is always read from the database, never from the request. */
export async function requireApproved() {
  const ctx = await getCurrentUserContext()
  if (!ctx.user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  }
  if (!ctx.isApproved || !ctx.profile) {
    return { ok: false as const, response: NextResponse.json({ error: 'Your account is not approved.' }, { status: 403 }) }
  }
  return {
    ok: true as const,
    supabase: ctx.supabase,
    user: ctx.user,
    profile: ctx.profile,
    isAdmin: ctx.isAdmin,
  }
}

/** Authenticated, approved administrator. */
export async function requireAdmin() {
  const ctx = await getCurrentUserContext()
  if (!ctx.user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  }
  if (!ctx.isAdmin || !ctx.profile) {
    return { ok: false as const, response: NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }) }
  }
  return {
    ok: true as const,
    supabase: ctx.supabase,
    user: ctx.user,
    profile: ctx.profile,
    isAdmin: true as const,
  }
}

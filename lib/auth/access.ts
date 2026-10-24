// Pure access rules (no framework imports) so they can be unit-tested with `node --test`.

export type AccountStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
export type AccountRole = 'admin' | 'candidate'

export interface ProfileLike {
  role?: string | null
  status?: string | null
}

export const ACCOUNT_STATUSES: readonly AccountStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']
export const ACCOUNT_ROLES: readonly AccountRole[] = ['candidate', 'admin']

/** Unknown / missing values collapse to the most restrictive state. */
export function normalizeStatus(value: string | null | undefined): AccountStatus {
  const upper = (value ?? '').toUpperCase()
  return (ACCOUNT_STATUSES as readonly string[]).includes(upper) ? (upper as AccountStatus) : 'PENDING'
}

export function normalizeRole(value: string | null | undefined): AccountRole {
  return (value ?? '').toLowerCase() === 'admin' ? 'admin' : 'candidate'
}

export function isApproved(profile: ProfileLike | null | undefined) {
  return !!profile && normalizeStatus(profile.status) === 'APPROVED'
}

/** An administrator must also be APPROVED; a suspended admin has no privileges. */
export function isActiveAdmin(profile: ProfileLike | null | undefined) {
  return isApproved(profile) && normalizeRole(profile?.role) === 'admin'
}

export const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback']
export const STATUS_PATHS: Record<Exclude<AccountStatus, 'APPROVED'>, string> = {
  PENDING: '/pending',
  REJECTED: '/rejected',
  SUSPENDED: '/suspended',
}

function matches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/**
 * Decide where a request should go. Returns a redirect path, or null to allow.
 * `profile === null` means no profile row could be read: treated as PENDING.
 * Note: `/` is the public homepage for anonymous visitors, while signed-in non-approved
 * accounts are always confined to their status page (`/pending`, `/rejected`, `/suspended`).
 * Approved administrators can access `/admin` AND all candidate routes (`/dashboard`, `/exam`, `/analytics`, `/profile`, `/results`).
 */
export function decideRedirect(pathname: string, signedIn: boolean, profile: ProfileLike | null): string | null {
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) return null
  if (matches(pathname, '/auth/callback')) return null
  if (matches(pathname, '/reset-password')) return signedIn ? null : '/forgot-password'

  const isPublicAuth = PUBLIC_PATHS.some((path) => matches(pathname, path))
  if (!signedIn) {
    if (pathname === '/' || isPublicAuth) return null
    return '/login'
  }

  const status = normalizeStatus(profile?.status)
  if (status !== 'APPROVED') {
    const target = STATUS_PATHS[status]
    return pathname === target ? null : target
  }

  // Approved user visiting auth/status pages redirects to their primary workspace
  if (isPublicAuth || Object.values(STATUS_PATHS).includes(pathname)) {
    return normalizeRole(profile?.role) === 'admin' ? '/admin' : '/dashboard'
  }

  // Only active admins can access /admin routes; approved admins CAN access all candidate routes
  if (matches(pathname, '/admin') && normalizeRole(profile?.role) !== 'admin') {
    return '/dashboard'
  }

  return null
}

/** Admin status changes allowed through the approval API. */
export function canChangeStatus(actor: ProfileLike | null, actorId: string, targetId: string, next: string) {
  if (!isActiveAdmin(actor)) return false
  if (!(ACCOUNT_STATUSES as readonly string[]).includes(next)) return false
  // An administrator must not lock themselves out.
  if (actorId === targetId && next !== 'APPROVED') return false
  return true
}

/** Admin role changes allowed through the user management API. */
export function canChangeRole(actor: ProfileLike | null, actorId: string, targetId: string, nextRole: string) {
  if (!isActiveAdmin(actor)) return false
  const normalized = nextRole.toLowerCase()
  if (!(ACCOUNT_ROLES as readonly string[]).includes(normalized)) return false
  // An administrator must not demote their own account.
  if (actorId === targetId && normalized !== 'admin') return false
  return true
}

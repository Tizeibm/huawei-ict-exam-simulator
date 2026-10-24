import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/server'
import { ACCOUNT_ROLES, ACCOUNT_STATUSES, normalizeRole, normalizeStatus } from '@/lib/auth/access'
import { createAdminClient } from '@/lib/supabase/admin'

const createUserSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  role: z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase() : 'candidate'), z.enum(ACCOUNT_ROLES as unknown as [string, ...string[]])).default('candidate'),
  status: z.preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : 'APPROVED'), z.enum(ACCOUNT_STATUSES as unknown as [string, ...string[]])).default('APPROVED'),
})

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid user account details.'
    return NextResponse.json({ error: firstIssue, issues: parsed.error.flatten() }, { status: 400 })
  }

  const { full_name, email, password } = parsed.data
  const role = normalizeRole(parsed.data.role)
  const status = normalizeStatus(parsed.data.status)

  let privileged
  try {
    privileged = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server service-role configuration is missing.' }, { status: 500 })
  }

  // Create user via Supabase Admin Auth API with email_confirm: true so no email confirmation is required
  const { data: created, error: createError } = await privileged.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (createError || !created.user) {
    const msg = createError?.message ?? 'Unable to create user account.'
    return NextResponse.json(
      { error: /already|exists|registered/i.test(msg) ? 'An account with this email address already exists.' : msg },
      { status: 400 },
    )
  }

  // Explicitly upsert the profile with the administrator-assigned role and status
  const nowIso = new Date().toISOString()
  const { error: profileError } = await privileged.from('profiles').upsert(
    {
      id: created.user.id,
      full_name,
      role,
      status,
      created_at: created.user.created_at ?? nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'id' },
  )

  if (profileError) {
    return NextResponse.json(
      { error: 'User authentication record was created, but profile initialization failed.' },
      { status: 500 },
    )
  }

  return NextResponse.json(
    {
      user: {
        id: created.user.id,
        email: created.user.email ?? email,
        full_name,
        role,
        status,
        created_at: created.user.created_at ?? nowIso,
        attempts_count: 0,
      },
    },
    { status: 201 },
  )
}

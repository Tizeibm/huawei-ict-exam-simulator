import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApproved } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
})

export async function PATCH(request: Request) {
  const auth = await requireApproved()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid profile data.'
    return NextResponse.json({ error: firstIssue }, { status: 400 })
  }

  const privileged = createAdminClient()
  const nowIso = new Date().toISOString()

  const { error } = await privileged
    .from('profiles')
    .update({ full_name: parsed.data.full_name, updated_at: nowIso })
    .eq('id', auth.user.id)

  if (error) {
    return NextResponse.json({ error: 'Unable to update your profile.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, full_name: parsed.data.full_name })
}

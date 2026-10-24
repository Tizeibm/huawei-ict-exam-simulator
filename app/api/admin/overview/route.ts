import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { canChangeStatus } from '@/lib/auth/access'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const privileged = createAdminClient()
  const [{ data: candidates, error: candidatesError }, { data: questions, error: questionsError }] = await Promise.all([
    privileged.from('profiles').select('id, full_name, status, role, created_at').order('created_at', { ascending: false }),
    privileged.from('questions').select('id, topic, type, question_text, created_at').order('created_at', { ascending: false }).limit(100),
  ])
  if (candidatesError || questionsError) return NextResponse.json({ error: 'Unable to load administrator data.' }, { status: 500 })
  return NextResponse.json({ candidates: candidates ?? [], questions: questions ?? [], currentUserId: auth.user.id })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null
  if (typeof body?.id !== 'string' || typeof body?.status !== 'string') {
    return NextResponse.json({ error: 'Invalid candidate status.' }, { status: 400 })
  }
  if (!canChangeStatus(auth.profile, auth.user.id, body.id, body.status)) {
    return NextResponse.json({ error: 'This status change is not allowed.' }, { status: 403 })
  }
  // Only the status column is writable here; role can never be changed through this endpoint.
  const { error } = await createAdminClient().from('profiles').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.id)
  if (error) return NextResponse.json({ error: 'Unable to update candidate.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

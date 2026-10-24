import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function adminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 })
  const privileged = adminClient()
  const [{ data: candidates, error: candidatesError }, { data: questions, error: questionsError }] = await Promise.all([
    privileged.from('profiles').select('id, full_name, status, role, created_at').order('created_at', { ascending: false }),
    privileged.from('questions').select('id, topic, type, question_text, created_at').order('created_at', { ascending: false }).limit(100),
  ])
  if (candidatesError || questionsError) return NextResponse.json({ error: 'Unable to load administrator data.' }, { status: 500 })
  return NextResponse.json({ candidates: candidates ?? [], questions: questions ?? [] })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 })
  const body = await request.json().catch(() => null) as { id?: string; status?: string } | null
  if (!body?.id || !['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(body.status ?? '')) return NextResponse.json({ error: 'Invalid candidate status.' }, { status: 400 })
  const { error } = await adminClient().from('profiles').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.id)
  if (error) return NextResponse.json({ error: 'Unable to update candidate.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

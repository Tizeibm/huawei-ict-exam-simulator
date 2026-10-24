import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const questionSchema = z.object({
  topic: z.enum(['OPENEULER', 'OPENGAUSS', 'KUNPENG']),
  type: z.enum(['SINGLE', 'MULTIPLE', 'BOOLEAN']),
  question_text: z.string().trim().min(1).max(5000),
  options: z.record(z.string(), z.string().trim().min(1).max(500)),
  correct_answers: z.array(z.string().trim().min(1)).min(1),
  explanation: z.string().trim().max(5000).default(''),
})

const payloadSchema = z.object({ questions: z.array(questionSchema).min(1).max(1000) })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid question import payload.', issues: parsed.error.flatten() }, { status: 400 })
  }

  const rows = parsed.data.questions.map((question) => ({ ...question, created_by: user.id }))
  const { data, error } = await supabase.from('questions').insert(rows).select('id, topic, type, question_text')

  if (error) {
    return NextResponse.json({ error: 'Unable to import questions.' }, { status: 500 })
  }

  return NextResponse.json({ imported: data.length, questions: data }, { status: 201 })
}

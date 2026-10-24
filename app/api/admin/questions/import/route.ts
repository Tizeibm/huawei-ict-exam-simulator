import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { payloadSchema } from '@/lib/question-import'

const MAX_BODY_BYTES = 1_000_000

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { supabase, user } = auth

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Import payload is too large.' }, { status: 413 })
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

  const questionTexts = [...new Set(parsed.data.questions.map((question) => question.question_text))]
  const { data: existingQuestions, error: duplicateLookupError } = await supabase
    .from('questions')
    .select('id, topic, type, question_text')
    .in('question_text', questionTexts)

  if (duplicateLookupError) {
    return NextResponse.json({ error: 'Unable to check for existing questions.' }, { status: 500 })
  }
  if (existingQuestions.length > 0) {
    return NextResponse.json({ error: 'One or more questions already exist.' }, { status: 409 })
  }

  const rows = parsed.data.questions.map((question) => ({ ...question, created_by: user.id }))
  const { data, error } = await supabase.from('questions').insert(rows).select('id, topic, type, question_text')

  if (error) {
    return NextResponse.json({ error: 'Unable to import questions.' }, { status: 500 })
  }

  return NextResponse.json({ imported: data.length, questions: data }, { status: 201 })
}

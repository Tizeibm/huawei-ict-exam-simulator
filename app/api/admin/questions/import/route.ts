import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { payloadSchema } from '@/lib/question-import'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BODY_BYTES = 2_000_000

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { user } = auth

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Import payload is too large (max 2 MB).' }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid question import payload.', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  let privileged
  try {
    privileged = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server service-role configuration is missing.' }, { status: 500 })
  }

  const questionTexts = [...new Set(parsed.data.questions.map((question) => question.question_text))]
  const { data: existingQuestions, error: duplicateLookupError } = await privileged
    .from('questions')
    .select('id, topic, type, question_text')
    .in('question_text', questionTexts)

  if (duplicateLookupError) {
    return NextResponse.json({ error: 'Unable to check for existing questions.' }, { status: 500 })
  }

  const existingKeys = new Set(
    (existingQuestions ?? []).map(
      (q) => `${String(q.topic).toUpperCase()}\u0000${String(q.type).toUpperCase()}\u0000${String(q.question_text).trim().toLowerCase()}`,
    ),
  )

  const duplicates = parsed.data.questions.filter((q) =>
    existingKeys.has(`${q.topic}\u0000${q.type}\u0000${q.question_text.toLowerCase()}`),
  )

  if (duplicates.length > 0 && !parsed.data.skipDuplicates) {
    return NextResponse.json(
      {
        error: `${duplicates.length} question(s) already exist in the question bank.`,
        duplicates: duplicates.map((d) => ({ topic: d.topic, type: d.type, question_text: d.question_text })),
      },
      { status: 409 },
    )
  }

  const toInsert = parsed.data.questions.filter(
    (q) => !existingKeys.has(`${q.topic}\u0000${q.type}\u0000${q.question_text.toLowerCase()}`),
  )

  if (toInsert.length === 0) {
    return NextResponse.json(
      { imported: 0, skippedDuplicates: duplicates.length, questions: [] },
      { status: 200 },
    )
  }

  const rows = toInsert.map((question) => ({
    topic: question.topic,
    type: question.type,
    question_text: question.question_text,
    options: question.options,
    correct_answers: question.correct_answers,
    explanation: question.explanation ?? '',
    created_by: user.id,
  }))

  const { data, error } = await privileged
    .from('questions')
    .insert(rows)
    .select('id, topic, type, question_text, options, correct_answers, explanation')

  if (error) {
    return NextResponse.json({ error: 'Unable to import questions into database.' }, { status: 500 })
  }

  return NextResponse.json(
    {
      imported: data.length,
      skippedDuplicates: duplicates.length,
      questions: data,
    },
    { status: 201 },
  )
}

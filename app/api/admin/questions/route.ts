import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { singleQuestionSchema } from '@/lib/question-import'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = singleQuestionSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid question data.'
    return NextResponse.json({ error: firstIssue, issues: parsed.error.flatten() }, { status: 400 })
  }

  const q = parsed.data
  const privileged = createAdminClient()

  const { data: existing } = await privileged
    .from('questions')
    .select('id')
    .eq('topic', q.topic)
    .eq('type', q.type)
    .eq('question_text', q.question_text)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A question with the same technology, type, and text already exists.' }, { status: 409 })
  }

  const { data, error } = await privileged
    .from('questions')
    .insert({
      topic: q.topic,
      type: q.type,
      question_text: q.question_text,
      options: q.options,
      correct_answers: q.correct_answers,
      explanation: q.explanation ?? '',
      created_by: auth.user.id,
    })
    .select('id, topic, type, question_text, options, correct_answers, explanation')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Unable to create question.' }, { status: 500 })
  }

  return NextResponse.json({ question: data }, { status: 201 })
}

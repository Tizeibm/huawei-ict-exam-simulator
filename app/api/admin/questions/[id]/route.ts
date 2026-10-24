import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { singleQuestionSchema } from '@/lib/question-import'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await context.params

  const body = await request.json().catch(() => null)
  const parsed = singleQuestionSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid question fields.'
    return NextResponse.json({ error: firstIssue, issues: parsed.error.flatten() }, { status: 400 })
  }

  const q = parsed.data
  const privileged = createAdminClient()

  const { data, error } = await privileged
    .from('questions')
    .update({
      topic: q.topic,
      type: q.type,
      question_text: q.question_text,
      options: q.options,
      correct_answers: q.correct_answers,
      explanation: q.explanation ?? '',
    })
    .eq('id', id)
    .select('id, topic, type, question_text, options, correct_answers, explanation, created_at')
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Unable to update question.' }, { status: 500 })
  }

  return NextResponse.json({ question: data })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await context.params

  const privileged = createAdminClient()
  const { error } = await privileged.from('questions').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: 'Unable to delete question.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id })
}

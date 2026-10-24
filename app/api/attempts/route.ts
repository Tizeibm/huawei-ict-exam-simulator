import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApproved } from '@/lib/auth/server'
import { scoreQuestion, type Question } from '@/lib/exam-service'
import { createAdminClient } from '@/lib/supabase/admin'

const bodySchema = z.object({
  answers: z.record(z.string().uuid(), z.array(z.string().max(20)).max(10)).refine((value) => {
    const size = Object.keys(value).length
    return size >= 1 && size <= 200
  }, 'Between 1 and 200 questions are required.'),
})

/** Scores an attempt on the server from the question bank, then persists it for the signed-in user. */
export async function POST(request: Request) {
  const auth = await requireApproved()
  if (!auth.ok) return auth.response

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid attempt payload.' }, { status: 400 })

  const ids = Object.keys(parsed.data.answers)
  const { data, error } = await auth.supabase
    .from('questions')
    .select('id, topic, type, question_text, options, correct_answers, explanation')
    .in('id', ids)
  if (error || !data || data.length !== ids.length) {
    return NextResponse.json({ error: 'Unable to score this attempt.' }, { status: 422 })
  }

  const details = (data as Question[]).map((question) => ({
    question_id: question.id,
    topic: question.topic,
    correct: scoreQuestion(question, parsed.data.answers[question.id] ?? []),
  }))
  const score = details.filter((item) => item.correct).length

  const { error: insertError } = await createAdminClient()
    .from('exam_attempts')
    .insert({ user_id: auth.user.id, score, total: details.length, details })
  if (insertError) return NextResponse.json({ error: 'Unable to save this attempt.' }, { status: 500 })

  return NextResponse.json({ score, total: details.length }, { status: 201 })
}

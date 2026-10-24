import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApproved } from '@/lib/auth/server'
import { compareWithPrevious } from '@/lib/exam/analytics'
import type { ExamMode, QuestionType, Topic } from '@/lib/exam/config'
import { gradeAttempt, interpretScore, percent, type GradableQuestion } from '@/lib/exam/scoring'
import { canAcceptAnswers, finalStatus, isExpired, secondsRemaining } from '@/lib/exam/timer'
import {
  packAttemptDetails,
  sanitizeQuestionsForClient,
  toAttemptSummary,
  unpackAttemptRow,
  type PersistedAttemptRow,
} from '@/lib/exam-service'
import { createAdminClient } from '@/lib/supabase/admin'

const patchAttemptSchema = z.object({
  action: z.enum(['save', 'submit', 'abandon']).default('save'),
  answers: z.record(z.string(), z.array(z.string().max(20)).max(10)).optional(),
  flagged_ids: z.array(z.string()).max(200).optional(),
})

async function loadOrderedQuestions(
  privileged: ReturnType<typeof createAdminClient>,
  questionIds: readonly string[],
): Promise<GradableQuestion[]> {
  if (!questionIds.length) return []
  const { data, error } = await privileged
    .from('questions')
    .select('id, topic, type, question_text, options, correct_answers, explanation')
    .in('id', [...questionIds])

  if (error || !data) throw new Error('Unable to load attempt questions.')

  const byId = new Map(
    data.map((q) => [
      q.id,
      {
        id: q.id,
        topic: q.topic as Topic,
        type: q.type as QuestionType,
        question_text: q.question_text,
        options: (q.options ?? {}) as Record<string, string>,
        correct_answers: (q.correct_answers ?? []) as string[],
        explanation: q.explanation ?? '',
      } satisfies GradableQuestion,
    ]),
  )

  return questionIds.map((id) => byId.get(id)).filter((q): q is GradableQuestion => !!q)
}

async function finalizeAttemptOnServer(
  privileged: ReturnType<typeof createAdminClient>,
  attempt: PersistedAttemptRow,
  incomingAnswers?: Record<string, string[]>,
  incomingFlagged?: string[],
): Promise<PersistedAttemptRow> {
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const acceptNewAnswers = canAcceptAnswers(
    attempt.status ?? 'IN_PROGRESS',
    attempt.expires_at ?? null,
    nowMs,
  )

  const mergedAnswers: Record<string, string[]> = acceptNewAnswers && incomingAnswers
    ? { ...(attempt.answers ?? {}), ...incomingAnswers }
    : (attempt.answers ?? {})

  const mergedFlagged: string[] = acceptNewAnswers && incomingFlagged
    ? incomingFlagged
    : (attempt.flagged_ids ?? [])

  const questionIds = Array.isArray(attempt.question_ids) ? attempt.question_ids : []
  const orderedQuestions = await loadOrderedQuestions(privileged, questionIds)
  const graded = gradeAttempt(orderedQuestions, mergedAnswers, mergedFlagged)
  const status = finalStatus(attempt.expires_at ?? null, nowMs)

  const startedMs = attempt.started_at ? new Date(attempt.started_at).getTime() : new Date(attempt.created_at).getTime()
  const elapsedSeconds = Math.max(1, Math.round((nowMs - startedMs) / 1000))
  const timeUsedSeconds = attempt.duration_seconds
    ? Math.min(attempt.duration_seconds, elapsedSeconds)
    : elapsedSeconds

  const packed = packAttemptDetails({
    mode: attempt.mode,
    status,
    started_at: attempt.started_at,
    expires_at: attempt.expires_at,
    submitted_at: nowIso,
    duration_seconds: attempt.duration_seconds,
    time_used_seconds: timeUsedSeconds,
    question_ids: questionIds,
    answers: mergedAnswers,
    flagged_ids: mergedFlagged,
    topic_stats: graded.topicStats,
    practice_config: attempt.practice_config,
    results: graded.results,
  })

  const { data: updated, error } = await privileged
    .from('exam_attempts')
    .update({
      score: graded.score,
      total: graded.total,
      details: packed,
    })
    .eq('id', attempt.id)
    .eq('user_id', attempt.user_id)
    .select('id, user_id, score, total, details, created_at')
    .single()

  if (error || !updated) {
    throw new Error('Unable to persist finalized exam attempt.')
  }

  return unpackAttemptRow(updated as Record<string, unknown>)
}

/**
 * GET /api/attempts/[id]
 * Loads an active (`IN_PROGRESS`) exam session for resuming OR a completed (`SUBMITTED` / `EXPIRED`)
 * exam attempt for the Results & Review page, strictly enforcing ownership (`user_id === auth.user.id`).
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApproved()
  if (!auth.ok) return auth.response
  const { id } = await context.params

  const privileged = createAdminClient()
  const { data: row, error } = await privileged
    .from('exam_attempts')
    .select('id, user_id, score, total, details, created_at')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: 'Exam attempt not found.' }, { status: 404 })
  }

  let attempt = unpackAttemptRow(row as Record<string, unknown>)
  const nowMs = Date.now()

  if (attempt.status === 'IN_PROGRESS' && isExpired(attempt.expires_at ?? null, nowMs)) {
    try {
      attempt = await finalizeAttemptOnServer(privileged, attempt)
    } catch {
      return NextResponse.json({ error: 'Unable to finalize expired attempt.' }, { status: 500 })
    }
  }

  if (attempt.status === 'IN_PROGRESS') {
    const mode = (attempt.mode as ExamMode) ?? 'FULL'
    const immediateFeedback = Boolean(attempt.practice_config?.immediateFeedback) && mode !== 'FULL'
    const orderedQuestions = await loadOrderedQuestions(privileged, attempt.question_ids ?? [])

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        mode,
        status: 'IN_PROGRESS',
        started_at: attempt.started_at ?? attempt.created_at,
        expires_at: attempt.expires_at ?? null,
        duration_seconds: attempt.duration_seconds ?? null,
        remainingSeconds: secondsRemaining(attempt.expires_at ?? null, nowMs),
        answers: attempt.answers ?? {},
        flagged_ids: attempt.flagged_ids ?? [],
        immediateFeedback,
        questions: sanitizeQuestionsForClient(orderedQuestions, mode, immediateFeedback),
      },
    })
  }

  const { data: allUserAttempts } = await privileged
    .from('exam_attempts')
    .select('id, user_id, score, total, details, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true })
    .limit(100)

  const completedSummaries = (allUserAttempts ?? [])
    .map((r) => unpackAttemptRow(r as Record<string, unknown>))
    .filter((a) => a.status === 'SUBMITTED' || a.status === 'EXPIRED')
    .map(toAttemptSummary)

  const currentSummary = toAttemptSummary(attempt)
  const comparison = compareWithPrevious(completedSummaries, attempt.id)
  const scorePercent = percent(attempt.score, attempt.total)
  const interpretation = interpretScore(scorePercent)

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      mode: currentSummary.mode,
      status: attempt.status ?? 'SUBMITTED',
      score: attempt.score,
      total: attempt.total,
      scorePercent,
      interpretation,
      started_at: attempt.started_at ?? attempt.created_at,
      submitted_at: attempt.submitted_at ?? attempt.created_at,
      duration_seconds: attempt.duration_seconds ?? null,
      time_used_seconds: attempt.time_used_seconds ?? null,
      topic_stats: currentSummary.topic_stats,
      details: Array.isArray(attempt.details) ? attempt.details : [],
      comparison,
    },
  })
}

/**
 * PATCH /api/attempts/[id]
 * Saves in-progress answers/flags (`action: 'save'`), abandons an active session (`action: 'abandon'`),
 * or finalizes and grades the attempt (`action: 'submit'`).
 * Repeated submissions are idempotent and return the already persisted result without duplicating records.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApproved()
  if (!auth.ok) return auth.response
  const { id } = await context.params

  const body = await request.json().catch(() => null)
  const parsed = patchAttemptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid attempt update payload.' }, { status: 400 })
  }

  const privileged = createAdminClient()
  const { data: row, error } = await privileged
    .from('exam_attempts')
    .select('id, user_id, score, total, details, created_at')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: 'Exam attempt not found.' }, { status: 404 })
  }

  const attempt = unpackAttemptRow(row as Record<string, unknown>)
  const { action, answers, flagged_ids } = parsed.data
  const nowMs = Date.now()

  if (attempt.status === 'SUBMITTED' || attempt.status === 'EXPIRED') {
    return NextResponse.json({
      id: attempt.id,
      status: attempt.status,
      score: attempt.score,
      total: attempt.total,
      alreadySubmitted: true,
    })
  }

  if (attempt.status === 'ABANDONED') {
    return NextResponse.json({ error: 'This exam session was abandoned.' }, { status: 409 })
  }

  if (action === 'abandon') {
    const abandonedDetails = packAttemptDetails({
      mode: attempt.mode,
      status: 'ABANDONED',
      started_at: attempt.started_at,
      expires_at: attempt.expires_at,
      submitted_at: attempt.submitted_at,
      duration_seconds: attempt.duration_seconds,
      time_used_seconds: attempt.time_used_seconds,
      question_ids: attempt.question_ids,
      answers: attempt.answers,
      flagged_ids: attempt.flagged_ids,
      topic_stats: attempt.topic_stats,
      practice_config: attempt.practice_config,
      results: attempt.details,
    })
    await privileged
      .from('exam_attempts')
      .update({ details: abandonedDetails })
      .eq('id', attempt.id)
      .eq('user_id', auth.user.id)
    return NextResponse.json({ ok: true, status: 'ABANDONED' })
  }

  if (action === 'submit' || isExpired(attempt.expires_at ?? null, nowMs)) {
    try {
      const finalized = await finalizeAttemptOnServer(privileged, attempt, answers, flagged_ids)
      return NextResponse.json({
        id: finalized.id,
        status: finalized.status,
        score: finalized.score,
        total: finalized.total,
        topic_stats: finalized.topic_stats,
        ExpiredAutoSubmit: action !== 'submit',
      })
    } catch {
      return NextResponse.json({ error: 'Unable to submit exam attempt.' }, { status: 500 })
    }
  }

  // action === 'save' (in-progress auto-save)
  if (!canAcceptAnswers(attempt.status ?? 'IN_PROGRESS', attempt.expires_at ?? null, nowMs)) {
    return NextResponse.json({ error: 'Exam time has expired.' }, { status: 409 })
  }

  const nextAnswers = answers ? { ...(attempt.answers ?? {}), ...answers } : (attempt.answers ?? {})
  const nextFlagged = flagged_ids ?? (attempt.flagged_ids ?? [])

  const savedDetails = packAttemptDetails({
    mode: attempt.mode,
    status: 'IN_PROGRESS',
    started_at: attempt.started_at,
    expires_at: attempt.expires_at,
    submitted_at: null,
    duration_seconds: attempt.duration_seconds,
    time_used_seconds: null,
    question_ids: attempt.question_ids,
    answers: nextAnswers,
    flagged_ids: nextFlagged,
    topic_stats: null,
    practice_config: attempt.practice_config,
    results: [],
  })

  const { error: saveError } = await privileged
    .from('exam_attempts')
    .update({ details: savedDetails })
    .eq('id', attempt.id)
    .eq('user_id', auth.user.id)

  if (saveError) {
    return NextResponse.json({ error: 'Unable to save progress.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    remainingSeconds: secondsRemaining(attempt.expires_at ?? null, nowMs),
    savedAt: new Date(nowMs).toISOString(),
  })
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApproved } from '@/lib/auth/server'
import {
  FULL_EXAM_DURATION_MINUTES,
  PRACTICE_MAX_QUESTIONS,
  PRACTICE_MIN_QUESTIONS,
  QUESTION_TYPES,
  TOPICS,
  type ExamMode,
  type QuestionType,
  type Topic,
} from '@/lib/exam/config'
import {
  blueprintShortages,
  buildFullExam,
  buildPractice,
  buildReview,
  countPool,
  type PoolItem,
} from '@/lib/exam/generate'
import { isExamReady } from '@/lib/exam/quality'
import { gradeAttempt, type GradableQuestion } from '@/lib/exam/scoring'
import { finalStatus, isExpired, secondsRemaining } from '@/lib/exam/timer'
import {
  extractReviewQuestionIds,
  sanitizeQuestionsForClient,
  type PersistedAttemptRow,
} from '@/lib/exam-service'
import { createAdminClient } from '@/lib/supabase/admin'

const startAttemptSchema = z.object({
  mode: z.enum(['FULL', 'PRACTICE', 'REVIEW']),
  topics: z.array(z.enum(['OPENEULER', 'OPENGAUSS', 'KUNPENG'])).min(1).optional(),
  types: z.array(z.enum(['SINGLE', 'MULTIPLE', 'BOOLEAN'])).min(1).optional(),
  count: z.number().int().min(1).max(PRACTICE_MAX_QUESTIONS).optional(),
  immediateFeedback: z.boolean().optional().default(false),
  timedMinutes: z.number().int().min(5).max(180).nullable().optional(),
  reviewFilter: z.enum(['ALL', 'INCORRECT', 'FLAGGED']).optional().default('ALL'),
})

const legacyDirectSubmitSchema = z.object({
  answers: z.record(z.string().uuid(), z.array(z.string().max(20)).max(10)).refine((value) => {
    const size = Object.keys(value).length
    return size >= 1 && size <= 200
  }, 'Between 1 and 200 questions are required.'),
  flagged: z.array(z.string().uuid()).optional().default([]),
  mode: z.enum(['FULL', 'PRACTICE', 'REVIEW']).optional().default('PRACTICE'),
  timeUsedSeconds: z.number().int().min(0).optional(),
})

async function loadExamReadyQuestions(privileged: ReturnType<typeof createAdminClient>): Promise<GradableQuestion[]> {
  const { data, error } = await privileged
    .from('questions')
    .select('id, topic, type, question_text, options, correct_answers, explanation')
    .limit(3000)

  if (error || !data) throw new Error('Unable to load question bank.')

  return data
    .filter((q) =>
      isExamReady({
        topic: q.topic,
        type: q.type,
        question_text: q.question_text,
        options: q.options as Record<string, string> | null,
        correct_answers: q.correct_answers as string[] | null,
        explanation: q.explanation,
      }),
    )
    .map((q) => ({
      id: q.id,
      topic: q.topic as Topic,
      type: q.type as QuestionType,
      question_text: q.question_text,
      options: (q.options ?? {}) as Record<string, string>,
      correct_answers: (q.correct_answers ?? []) as string[],
      explanation: q.explanation ?? '',
    }))
}

/**
 * GET /api/attempts
 * Returns question bank readiness, pool counts, shortages, reviewable question counts,
 * and any currently active (`IN_PROGRESS`) exam session for the authenticated user.
 */
export async function GET() {
  const auth = await requireApproved()
  if (!auth.ok) return auth.response

  let privileged
  try {
    privileged = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server service-role configuration is missing.' }, { status: 500 })
  }

  try {
    const [allQuestions, attemptsRes] = await Promise.all([
      loadExamReadyQuestions(privileged),
      privileged
        .from('exam_attempts')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const pool: PoolItem[] = allQuestions.map((q) => ({ id: q.id, topic: q.topic, type: q.type }))
    const poolCounts = countPool(pool)
    const shortages = blueprintShortages(pool)

    const userAttempts = (attemptsRes.data ?? []) as PersistedAttemptRow[]
    const now = Date.now()

    // Check if there is an IN_PROGRESS attempt; if it has expired, finalize it automatically
    let activeAttempt: {
      id: string
      mode: ExamMode
      started_at: string
      expires_at: string | null
      remainingSeconds: number | null
      total: number
      answeredCount: number
    } | null = null

    const inProgress = userAttempts.find((a) => a.status === 'IN_PROGRESS')
    if (inProgress) {
      if (isExpired(inProgress.expires_at ?? null, now)) {
        // Auto-finalize expired session
        const qMap = new Map(allQuestions.map((q) => [q.id, q]))
        const ordered = (inProgress.question_ids ?? [])
          .map((id) => qMap.get(id))
          .filter((q): q is GradableQuestion => !!q)

        if (ordered.length > 0) {
          const graded = gradeAttempt(ordered, inProgress.answers ?? {}, inProgress.flagged_ids ?? [])
          await privileged
            .from('exam_attempts')
            .update({
              status: 'EXPIRED',
              submitted_at: new Date(now).toISOString(),
              time_used_seconds: inProgress.duration_seconds ?? null,
              score: graded.score,
              total: graded.total,
              topic_stats: graded.topicStats,
              details: graded.results,
              updated_at: new Date(now).toISOString(),
            })
            .eq('id', inProgress.id)
            .eq('user_id', auth.user.id)
          inProgress.status = 'EXPIRED'
          inProgress.score = graded.score
          inProgress.details = graded.results
          inProgress.topic_stats = graded.topicStats
        }
      } else {
        const ansObj = inProgress.answers ?? {}
        const answeredCount = Object.values(ansObj).filter((arr) => Array.isArray(arr) && arr.length > 0).length
        activeAttempt = {
          id: inProgress.id,
          mode: (inProgress.mode as ExamMode) ?? 'FULL',
          started_at: inProgress.started_at ?? inProgress.created_at,
          expires_at: inProgress.expires_at ?? null,
          remainingSeconds: secondsRemaining(inProgress.expires_at ?? null, now),
          total: inProgress.total,
          answeredCount,
        }
      }
    }

    const reviewCandidates = extractReviewQuestionIds(userAttempts)
    const validIds = new Set(allQuestions.map((q) => q.id))
    const reviewCounts = {
      all: reviewCandidates.allReviewIds.filter((id) => validIds.has(id)).length,
      incorrect: reviewCandidates.incorrectIds.filter((id) => validIds.has(id)).length,
      flagged: reviewCandidates.flaggedIds.filter((id) => validIds.has(id)).length,
    }

    return NextResponse.json({
      totalExamReadyQuestions: allQuestions.length,
      poolCounts,
      shortages,
      fullExamReady: shortages.length === 0,
      activeAttempt,
      reviewCounts,
      completedAttemptsCount: userAttempts.filter((a) => !a.status || a.status === 'SUBMITTED' || a.status === 'EXPIRED').length,
    })
  } catch {
    return NextResponse.json({ error: 'Unable to load exam workspace configuration.' }, { status: 500 })
  }
}

/**
 * POST /api/attempts
 * Either starts a new stateful exam attempt (`{ mode: 'FULL' | 'PRACTICE' | 'REVIEW', ... }`)
 * OR grades and saves a legacy direct submission (`{ answers: { ... } }`).
 */
export async function POST(request: Request) {
  const auth = await requireApproved()
  if (!auth.ok) return auth.response

  const rawBody = await request.json().catch(() => null)
  if (!rawBody || typeof rawBody !== 'object') {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 })
  }

  let privileged
  try {
    privileged = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server service-role configuration is missing.' }, { status: 500 })
  }

  // Case 1: Legacy direct submission (`{ answers: Record<uuid, string[]> }`)
  if ('answers' in rawBody && !('question_ids' in rawBody) && !('count' in rawBody)) {
    const parsedLegacy = legacyDirectSubmitSchema.safeParse(rawBody)
    if (!parsedLegacy.success) {
      return NextResponse.json({ error: 'Invalid attempt payload.' }, { status: 400 })
    }

    const ids = Object.keys(parsedLegacy.data.answers)
    const { data, error } = await privileged
      .from('questions')
      .select('id, topic, type, question_text, options, correct_answers, explanation')
      .in('id', ids)

    if (error || !data || data.length !== ids.length) {
      return NextResponse.json({ error: 'Unable to score this attempt.' }, { status: 422 })
    }

    const orderedQuestions = ids
      .map((id) => data.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => !!q)
      .map((q) => ({
        id: q.id,
        topic: q.topic as Topic,
        type: q.type as QuestionType,
        question_text: q.question_text,
        options: (q.options ?? {}) as Record<string, string>,
        correct_answers: (q.correct_answers ?? []) as string[],
        explanation: q.explanation ?? '',
      }))

    const graded = gradeAttempt(orderedQuestions, parsedLegacy.data.answers, parsedLegacy.data.flagged)
    const nowIso = new Date().toISOString()

    const { data: inserted, error: insertError } = await privileged
      .from('exam_attempts')
      .insert({
        user_id: auth.user.id,
        mode: parsedLegacy.data.mode,
        status: 'SUBMITTED',
        started_at: nowIso,
        submitted_at: nowIso,
        time_used_seconds: parsedLegacy.data.timeUsedSeconds ?? null,
        question_ids: ids,
        answers: parsedLegacy.data.answers,
        flagged_ids: parsedLegacy.data.flagged,
        score: graded.score,
        total: graded.total,
        topic_stats: graded.topicStats,
        details: graded.results,
      })
      .select('id, score, total')
      .single()

    if (insertError) {
      // Fallback for pre-migration database with only base columns
      const { data: fallbackRow, error: fallbackError } = await privileged
        .from('exam_attempts')
        .insert({
          user_id: auth.user.id,
          score: graded.score,
          total: graded.total,
          details: graded.results,
        })
        .select('id, score, total')
        .single()

      if (fallbackError || !fallbackRow) {
        return NextResponse.json({ error: 'Unable to save this attempt.' }, { status: 500 })
      }
      return NextResponse.json(
        { id: fallbackRow.id, score: graded.score, total: graded.total, topicStats: graded.topicStats },
        { status: 201 },
      )
    }

    return NextResponse.json(
      { id: inserted.id, score: graded.score, total: graded.total, topicStats: graded.topicStats },
      { status: 201 },
    )
  }

  // Case 2: Start a new stateful exam session (`FULL`, `PRACTICE`, or `REVIEW`)
  const parsedStart = startAttemptSchema.safeParse(rawBody)
  if (!parsedStart.success) {
    return NextResponse.json({ error: 'Invalid exam configuration.' }, { status: 400 })
  }

  try {
    const allQuestions = await loadExamReadyQuestions(privileged)
    if (allQuestions.length === 0) {
      return NextResponse.json(
        { error: 'The question bank does not contain any valid exam-ready questions yet.' },
        { status: 422 },
      )
    }

    const pool: PoolItem[] = allQuestions.map((q) => ({ id: q.id, topic: q.topic, type: q.type }))
    const { mode, immediateFeedback, reviewFilter } = parsedStart.data
    const selectedTopics: readonly Topic[] = parsedStart.data.topics?.length ? parsedStart.data.topics : TOPICS
    const selectedTypes: readonly QuestionType[] = parsedStart.data.types?.length ? parsedStart.data.types : QUESTION_TYPES

    let selectedIds: string[] = []
    let durationSeconds: number | null = null

    if (mode === 'FULL') {
      const fullResult = buildFullExam(pool)
      if (!fullResult.ok) {
        return NextResponse.json(
          {
            error: 'Insufficient questions in the question bank to generate a 60-question Full Exam Simulation. Practice Mode remains available for existing questions.',
            shortages: fullResult.shortages,
          },
          { status: 422 },
        )
      }
      selectedIds = fullResult.ids
      durationSeconds = FULL_EXAM_DURATION_MINUTES * 60
    } else if (mode === 'PRACTICE') {
      const requestedCount = Math.min(
        PRACTICE_MAX_QUESTIONS,
        Math.max(1, parsedStart.data.count ?? Math.min(15, allQuestions.length)),
      )
      const practiceResult = buildPractice(pool, selectedTopics, requestedCount, Math.random, selectedTypes)
      if (practiceResult.ids.length === 0) {
        return NextResponse.json(
          { error: 'No questions in the bank match your selected technologies and question types.' },
          { status: 422 },
        )
      }
      selectedIds = practiceResult.ids
      if (parsedStart.data.timedMinutes && parsedStart.data.timedMinutes >= 5) {
        durationSeconds = parsedStart.data.timedMinutes * 60
      }
    } else {
      // REVIEW mode
      const { data: historyRows } = await privileged
        .from('exam_attempts')
        .select('*')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      const extracted = extractReviewQuestionIds((historyRows ?? []) as PersistedAttemptRow[])
      const candidateIds =
        reviewFilter === 'INCORRECT'
          ? extracted.incorrectIds
          : reviewFilter === 'FLAGGED'
            ? extracted.flaggedIds
            : extracted.allReviewIds

      const requestedCount = Math.min(PRACTICE_MAX_QUESTIONS, Math.max(1, parsedStart.data.count ?? 25))
      const reviewResult = buildReview(pool, candidateIds, selectedTopics, requestedCount)
      if (reviewResult.ids.length === 0) {
        return NextResponse.json(
          {
            error:
              reviewFilter === 'FLAGGED'
                ? 'You have no flagged questions in your past attempts matching the selected technologies.'
                : reviewFilter === 'INCORRECT'
                  ? 'You have no incorrect questions in your past attempts matching the selected technologies.'
                  : 'No previous incorrect or flagged questions were found in your exam history.',
          },
          { status: 422 },
        )
      }
      selectedIds = reviewResult.ids
    }

    const qMap = new Map(allQuestions.map((q) => [q.id, q]))
    const orderedQuestions = selectedIds
      .map((id) => qMap.get(id))
      .filter((q): q is GradableQuestion => !!q)

    const nowMs = Date.now()
    const startedAtIso = new Date(nowMs).toISOString()
    const expiresAtIso = durationSeconds ? new Date(nowMs + durationSeconds * 1000).toISOString() : null
    const allowFeedback = (mode === 'PRACTICE' || mode === 'REVIEW') && immediateFeedback

    // Abandon any previous IN_PROGRESS attempt for this user so only one active session exists at a time
    await privileged
      .from('exam_attempts')
      .update({ status: 'ABANDONED', updated_at: startedAtIso })
      .eq('user_id', auth.user.id)
      .eq('status', 'IN_PROGRESS')

    const { data: createdAttempt, error: createError } = await privileged
      .from('exam_attempts')
      .insert({
        user_id: auth.user.id,
        mode,
        status: 'IN_PROGRESS',
        started_at: startedAtIso,
        expires_at: expiresAtIso,
        duration_seconds: durationSeconds,
        question_ids: selectedIds,
        answers: {},
        flagged_ids: [],
        score: 0,
        total: orderedQuestions.length,
        practice_config: {
          topics: [...selectedTopics],
          types: [...selectedTypes],
          immediateFeedback: allowFeedback,
          requestedCount: parsedStart.data.count ?? orderedQuestions.length,
        },
      })
      .select('id')
      .single()

    if (createError || !createdAttempt) {
      return NextResponse.json(
        { error: 'Unable to initialize exam session. Ensure the latest database migration has been applied.' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        attempt: {
          id: createdAttempt.id,
          mode,
          status: 'IN_PROGRESS',
          started_at: startedAtIso,
          expires_at: expiresAtIso,
          duration_seconds: durationSeconds,
          remainingSeconds: secondsRemaining(expiresAtIso, nowMs),
          answers: {},
          flagged_ids: [],
          immediateFeedback: allowFeedback,
          questions: sanitizeQuestionsForClient(orderedQuestions, mode, allowFeedback),
        },
      },
      { status: 201 },
    )
  } catch {
    return NextResponse.json({ error: 'Unable to start exam session.' }, { status: 500 })
  }
}

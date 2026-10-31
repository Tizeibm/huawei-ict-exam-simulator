import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApproved } from '@/lib/auth/server'
import {
  FULL_EXAM_DURATION_MINUTES,
  PRACTICE_MAX_QUESTIONS,
  QUESTION_TYPES,
  TOPICS,
  type CompetitionRound,
  type ExamMode,
  type QuestionType,
  type Topic,
  type Track,
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
import { isExpired, secondsRemaining } from '@/lib/exam/timer'
import {
  extractReviewQuestionIds,
  packAttemptDetails,
  sanitizeQuestionsForClient,
  unpackAttemptRow,
} from '@/lib/exam-service'
import { createAdminClient } from '@/lib/supabase/admin'

const startAttemptSchema = z.object({
  mode: z.enum(['FULL', 'PRACTICE', 'REVIEW']),
  track: z.enum(['COMPUTING', 'NETWORK']).default('COMPUTING'),
  competitionRound: z.enum(['PRELIMINARY', 'NATIONAL']).default('PRELIMINARY'),
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

async function loadExamReadyQuestions(
  privileged: ReturnType<typeof createAdminClient>,
  track: Track = 'COMPUTING',
  competitionRound: CompetitionRound = 'PRELIMINARY',
): Promise<GradableQuestion[]> {
  const { data, error } = await privileged
    .from('questions')
    .select('id, topic, type, question_text, options, correct_answers, explanation, track, round_suitability, is_active')
    .eq('track', track)
    .eq('is_active', true)
    .contains('round_suitability', [competitionRound])
    .limit(3000)

  if (error || !data) throw new Error('Unable to load question bank.')

  return data
    .filter((q) => {
      const rounds = Array.isArray(q.round_suitability) ? q.round_suitability : ['PRELIMINARY', 'NATIONAL']
      return rounds.includes(competitionRound) && isExamReady({
        topic: q.topic,
        type: q.type,
        question_text: q.question_text,
        options: q.options as Record<string, string> | null,
        correct_answers: q.correct_answers as string[] | null,
        explanation: q.explanation,
      })
    })
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
      loadExamReadyQuestions(privileged, 'COMPUTING', 'PRELIMINARY'),
      privileged
        .from('exam_attempts')
        .select('id, user_id, score, total, details, created_at, track, competition_round, exam_mode, duration_seconds, submitted_at')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const pool: PoolItem[] = allQuestions.map((q) => ({ id: q.id, topic: q.topic, type: q.type }))
    const poolCounts = countPool(pool)
    const shortages = blueprintShortages(pool)

    const userAttempts = (attemptsRes.data ?? []).map((r) => unpackAttemptRow(r as Record<string, unknown>))
    const now = Date.now()

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
        const qMap = new Map(allQuestions.map((q) => [q.id, q]))
        const ordered = (inProgress.question_ids ?? [])
          .map((id) => qMap.get(id))
          .filter((q): q is GradableQuestion => !!q)

        if (ordered.length > 0) {
          const graded = gradeAttempt(ordered, inProgress.answers ?? {}, inProgress.flagged_ids ?? [])
          const nowIso = new Date(now).toISOString()
          const packed = packAttemptDetails({
            mode: inProgress.mode,
            status: 'EXPIRED',
            started_at: inProgress.started_at,
            expires_at: inProgress.expires_at,
            submitted_at: nowIso,
            duration_seconds: inProgress.duration_seconds,
            time_used_seconds: inProgress.duration_seconds ?? null,
            question_ids: inProgress.question_ids,
            answers: inProgress.answers,
            flagged_ids: inProgress.flagged_ids,
            topic_stats: graded.topicStats,
            practice_config: inProgress.practice_config,
            results: graded.results,
          })
          await privileged
            .from('exam_attempts')
            .update({
              score: graded.score,
              total: graded.total,
              details: packed,
              submitted_at: nowIso,
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
          mode: inProgress.mode ?? 'FULL',
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
      completedAttemptsCount: userAttempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'EXPIRED').length,
    })
  } catch {
    return NextResponse.json({ error: 'Unable to load exam workspace configuration.' }, { status: 500 })
  }
}

/**
 * POST /api/attempts
 * Either starts a new stateful exam attempt (`{ mode: 'FULL' | 'PRACTICE' | 'REVIEW', ... }`)
 * OR grades and saves a legacy direct submission (`{ answers: { ... } }`).
 * Uses only the guaranteed base columns (`user_id`, `score`, `total`, `details`) on `public.exam_attempts`
 * so it succeeds even before optional schema extensions are applied.
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

    const packed = packAttemptDetails({
      mode: parsedLegacy.data.mode,
      status: 'SUBMITTED',
      started_at: nowIso,
      expires_at: null,
      submitted_at: nowIso,
      duration_seconds: null,
      time_used_seconds: parsedLegacy.data.timeUsedSeconds ?? null,
      question_ids: ids,
      answers: parsedLegacy.data.answers,
      flagged_ids: parsedLegacy.data.flagged,
      topic_stats: graded.topicStats,
      practice_config: null,
      results: graded.results,
    })

    const { data: inserted, error: insertError } = await privileged
      .from('exam_attempts')
      .insert({
        user_id: auth.user.id,
        score: graded.score,
        total: graded.total,
        details: packed,
        track: 'COMPUTING',
        competition_round: 'PRELIMINARY',
        exam_mode: parsedLegacy.data.mode,
        submitted_at: nowIso,
      })
      .select('id, score, total')
      .single()

    if (insertError || !inserted) {
      return NextResponse.json({ error: 'Unable to save this attempt.' }, { status: 500 })
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
    const { track, competitionRound } = parsedStart.data
    const allQuestions = await loadExamReadyQuestions(privileged, track, competitionRound)
    if (allQuestions.length === 0) {
      return NextResponse.json(
        { error: `No exam-ready questions are available for ${track} / ${competitionRound}. Import active questions with the matching track and round_suitability first.` },
        { status: 422 },
      )
    }

    const pool: PoolItem[] = allQuestions.map((q) => ({ id: q.id, topic: q.topic, type: q.type }))
    const { mode, immediateFeedback, reviewFilter } = parsedStart.data
    const selectedTopics: readonly Topic[] = parsedStart.data.topics?.length ? parsedStart.data.topics : TOPICS
    const selectedTypes: readonly QuestionType[] = parsedStart.data.types?.length ? parsedStart.data.types : QUESTION_TYPES

    // Load recent user attempts using only guaranteed base columns
    const { data: historyRaw } = await privileged
      .from('exam_attempts')
        .select('id, user_id, score, total, details, created_at, track, competition_round, exam_mode, duration_seconds, submitted_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    const unpackedHistory = (historyRaw ?? []).map((r) => unpackAttemptRow(r as Record<string, unknown>))

    let selectedIds: string[] = []
    let durationSeconds: number | null = null

    if (mode === 'FULL') {
      const fullResult = buildFullExam(pool)
      if (!fullResult.ok) {
        return NextResponse.json(
          {
            error:
              'Insufficient questions in the question bank to generate a 60-question Full Exam Simulation. Practice Mode remains available for existing questions.',
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
      const extracted = extractReviewQuestionIds(unpackedHistory)
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

    // Mark any existing IN_PROGRESS attempts for this user as ABANDONED using base `details` column
    const inProgressRows = unpackedHistory.filter((a) => a.status === 'IN_PROGRESS')
    for (const old of inProgressRows) {
      await privileged
        .from('exam_attempts')
        .update({
          details: packAttemptDetails({
            mode: old.mode,
            status: 'ABANDONED',
            started_at: old.started_at,
            expires_at: old.expires_at,
            submitted_at: old.submitted_at,
            duration_seconds: old.duration_seconds,
            time_used_seconds: old.time_used_seconds,
            question_ids: old.question_ids,
            answers: old.answers,
            flagged_ids: old.flagged_ids,
            topic_stats: old.topic_stats,
            practice_config: old.practice_config,
            results: old.details,
          }),
        })
        .eq('id', old.id)
        .eq('user_id', auth.user.id)
    }

    const initialEnvelope = packAttemptDetails({
      mode,
      status: 'IN_PROGRESS',
      started_at: startedAtIso,
      expires_at: expiresAtIso,
      submitted_at: null,
      duration_seconds: durationSeconds,
      time_used_seconds: null,
      question_ids: selectedIds,
      answers: {},
      flagged_ids: [],
      topic_stats: null,
      practice_config: {
        topics: [...selectedTopics],
        types: [...selectedTypes],
        immediateFeedback: allowFeedback,
        requestedCount: parsedStart.data.count ?? orderedQuestions.length,
      },
      results: [],
    })

    const { data: createdAttempt, error: createError } = await privileged
      .from('exam_attempts')
      .insert({
        user_id: auth.user.id,
        score: 0,
        total: orderedQuestions.length,
        details: initialEnvelope,
        track,
        competition_round: competitionRound,
        exam_mode: mode,
        duration_seconds: durationSeconds,
      })
      .select('id')
      .single()

    if (createError || !createdAttempt) {
      return NextResponse.json(
        { error: createError?.message ?? 'Unable to initialize exam session.' },
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to start exam session.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

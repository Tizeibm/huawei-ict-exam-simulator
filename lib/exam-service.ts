import {
  emptyTopicStats,
  gradeAttempt,
  isCorrect,
  type GradableQuestion,
  type QuestionResult,
  type TopicStats,
} from './exam/scoring.ts'
import type { AttemptSummary } from './exam/analytics.ts'
import type { ExamMode, QuestionType, Topic } from './exam/config.ts'
import type { AttemptStatus } from './exam/timer.ts'

export type { Topic, QuestionType, ExamMode }
export type Question = GradableQuestion

/** Client-safe question representation during an active scored exam (no correct_answers or explanation). */
export interface ClientExamQuestion {
  id: string
  topic: Topic
  type: QuestionType
  question_text: string
  options: Record<string, string>
  /** Only populated in Practice/Review mode when immediate feedback is enabled, never in FULL mode. */
  correct_answers?: string[]
  explanation?: string
}

export interface PracticeConfig {
  topics?: Topic[]
  types?: QuestionType[]
  immediateFeedback?: boolean
  requestedCount?: number
}

export interface AttemptEnvelope {
  _v: 2
  mode: ExamMode
  status: AttemptStatus
  started_at: string
  expires_at: string | null
  submitted_at: string | null
  duration_seconds: number | null
  time_used_seconds: number | null
  question_ids: string[]
  answers: Record<string, string[]>
  flagged_ids: string[]
  topic_stats: TopicStats | null
  practice_config: PracticeConfig | null
  results: QuestionResult[]
}

export interface PersistedAttemptRow {
  id: string
  user_id: string
  mode: ExamMode
  status: AttemptStatus
  score: number
  total: number
  started_at: string
  expires_at: string | null
  submitted_at: string | null
  created_at: string
  duration_seconds: number | null
  time_used_seconds: number | null
  question_ids: string[]
  answers: Record<string, string[]>
  flagged_ids: string[]
  topic_stats: TopicStats | null
  details: QuestionResult[]
  practice_config: PracticeConfig | null
}

/**
 * Packs all stateful exam metadata and question results into the `details` JSONB column
 * so `public.exam_attempts` works reliably whether or not optional extended columns exist in Supabase.
 */
export function packAttemptDetails(input: Omit<AttemptEnvelope, '_v'>): AttemptEnvelope {
  return {
    _v: 2,
    mode: input.mode,
    status: input.status,
    started_at: input.started_at,
    expires_at: input.expires_at,
    submitted_at: input.submitted_at,
    duration_seconds: input.duration_seconds,
    time_used_seconds: input.time_used_seconds,
    question_ids: input.question_ids,
    answers: input.answers,
    flagged_ids: input.flagged_ids,
    topic_stats: input.topic_stats,
    practice_config: input.practice_config,
    results: input.results,
  }
}

/**
 * Unpacks a raw database row from `public.exam_attempts` into a normalized `PersistedAttemptRow`.
 * Supports:
 * 1. Envelope-packed `details` JSONB (`_v: 2` object stored in base `exam_attempts.details` column),
 * 2. Extended top-level columns (`mode`, `status`, etc.), and
 * 3. Legacy rows where `details` is a plain array of question outcomes.
 */
export function unpackAttemptRow(raw: Record<string, unknown>): PersistedAttemptRow {
  const id = String(raw.id ?? '')
  const user_id = String(raw.user_id ?? '')
  const score = Number(raw.score ?? 0)
  const total = Number(raw.total ?? 1)
  const created_at = typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString()

  const rawDetails = raw.details
  const isEnvelope =
    rawDetails !== null &&
    typeof rawDetails === 'object' &&
    !Array.isArray(rawDetails) &&
    ('status' in rawDetails || 'results' in rawDetails || '_v' in rawDetails)

  const env = isEnvelope ? (rawDetails as Partial<AttemptEnvelope>) : null

  const mode = ((env?.mode ?? raw.mode ?? 'FULL') as ExamMode)
  const status = ((env?.status ?? raw.status ?? 'SUBMITTED') as AttemptStatus)
  const started_at = String(env?.started_at ?? raw.started_at ?? created_at)
  const expires_at = (env?.expires_at ?? (raw.expires_at as string | null) ?? null)
  const submitted_at =
    env?.submitted_at !== undefined
      ? env.submitted_at
      : typeof raw.submitted_at === 'string'
        ? raw.submitted_at
        : status === 'SUBMITTED' || status === 'EXPIRED'
          ? created_at
          : null

  const duration_seconds =
    typeof env?.duration_seconds === 'number'
      ? env.duration_seconds
      : typeof raw.duration_seconds === 'number'
        ? raw.duration_seconds
        : null

  const time_used_seconds =
    typeof env?.time_used_seconds === 'number'
      ? env.time_used_seconds
      : typeof raw.time_used_seconds === 'number'
        ? raw.time_used_seconds
        : null

  const question_ids = Array.isArray(env?.question_ids)
    ? env.question_ids
    : Array.isArray(raw.question_ids)
      ? (raw.question_ids as string[])
      : []

  const answers =
    env?.answers && typeof env.answers === 'object'
      ? env.answers
      : raw.answers && typeof raw.answers === 'object'
        ? (raw.answers as Record<string, string[]>)
        : {}

  const flagged_ids = Array.isArray(env?.flagged_ids)
    ? env.flagged_ids
    : Array.isArray(raw.flagged_ids)
      ? (raw.flagged_ids as string[])
      : []

  const results: QuestionResult[] = Array.isArray(env?.results)
    ? env.results
    : Array.isArray(rawDetails)
      ? (rawDetails as QuestionResult[])
      : []

  let topic_stats: TopicStats | null =
    (env?.topic_stats ?? (raw.topic_stats as TopicStats | null) ?? null)

  if (!topic_stats && results.length > 0) {
    const computed = emptyTopicStats()
    for (const item of results as Partial<QuestionResult & { question_id?: string }>[]) {
      const topic = item.topic as Topic | undefined
      if (topic && computed[topic]) {
        computed[topic].total++
        const answered =
          item.answered !== undefined
            ? item.answered
            : Array.isArray(item.selected)
              ? item.selected.length > 0
              : true
        if (!answered) computed[topic].unanswered++
        else if (item.correct) computed[topic].correct++
        else computed[topic].incorrect++
      }
    }
    topic_stats = computed
  }

  const practice_config =
    (env?.practice_config ?? (raw.practice_config as PracticeConfig | null) ?? null)

  return {
    id,
    user_id,
    mode,
    status,
    score,
    total,
    started_at,
    expires_at,
    submitted_at,
    created_at,
    duration_seconds,
    time_used_seconds,
    question_ids,
    answers,
    flagged_ids,
    topic_stats,
    details: results,
    practice_config,
  }
}

/** Strips answer keys and explanations before sending questions to the browser during a scored exam. */
export function sanitizeQuestionsForClient(
  questions: readonly GradableQuestion[],
  mode: ExamMode,
  immediateFeedback = false,
): ClientExamQuestion[] {
  const allowFeedback = (mode === 'PRACTICE' || mode === 'REVIEW') && immediateFeedback
  return questions.map((q) => {
    const base: ClientExamQuestion = {
      id: q.id,
      topic: q.topic,
      type: q.type,
      question_text: q.question_text,
      options: q.options,
    }
    if (allowFeedback) {
      base.correct_answers = q.correct_answers
      base.explanation = q.explanation
    }
    return base
  })
}

export function scoreQuestion(question: GradableQuestion, answer: string[]) {
  return isCorrect(question, answer)
}

/**
 * Normalizes a database `exam_attempts` row (either raw or already unpacked)
 * into a strongly typed `AttemptSummary` with computed `topic_stats`.
 */
export function toAttemptSummary(row: PersistedAttemptRow | Record<string, unknown>): AttemptSummary {
  const unpacked = 'question_ids' in row && Array.isArray(row.details)
    ? (row as PersistedAttemptRow)
    : unpackAttemptRow(row as Record<string, unknown>)

  return {
    id: unpacked.id,
    mode: unpacked.mode ?? 'FULL',
    submitted_at: unpacked.submitted_at ?? unpacked.created_at,
    score: unpacked.score,
    total: unpacked.total,
    topic_stats: unpacked.topic_stats,
  }
}

/**
 * Extracts unique question IDs that the user previously answered incorrectly, left unanswered,
 * or flagged for review across their completed attempts. Used for Review Mode.
 */
export function extractReviewQuestionIds(
  rows: readonly (PersistedAttemptRow | Record<string, unknown>)[],
): {
  allReviewIds: string[]
  incorrectIds: string[]
  flaggedIds: string[]
} {
  const incorrectSet = new Set<string>()
  const flaggedSet = new Set<string>()

  for (const rawRow of rows) {
    const row = 'question_ids' in rawRow && Array.isArray(rawRow.details)
      ? (rawRow as PersistedAttemptRow)
      : unpackAttemptRow(rawRow as Record<string, unknown>)

    const status = row.status ?? 'SUBMITTED'
    if (status !== 'SUBMITTED' && status !== 'EXPIRED') continue

    if (Array.isArray(row.flagged_ids)) {
      for (const fid of row.flagged_ids) {
        if (typeof fid === 'string') flaggedSet.add(fid)
      }
    }

    if (Array.isArray(row.details)) {
      for (const item of row.details as Partial<QuestionResult & { question_id?: string }>[]) {
        const qid = item.id ?? item.question_id
        if (!qid || typeof qid !== 'string') continue
        if (item.flagged) flaggedSet.add(qid)
        if (!item.correct) incorrectSet.add(qid)
      }
    }
  }

  const allReviewSet = new Set<string>([...incorrectSet, ...flaggedSet])
  return {
    allReviewIds: [...allReviewSet],
    incorrectIds: [...incorrectSet],
    flaggedIds: [...flaggedSet],
  }
}

export { gradeAttempt }

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

export interface PersistedAttemptRow {
  id: string
  user_id: string
  mode?: ExamMode | null
  status?: AttemptStatus | null
  score: number
  total: number
  started_at?: string | null
  expires_at?: string | null
  submitted_at?: string | null
  created_at: string
  duration_seconds?: number | null
  time_used_seconds?: number | null
  question_ids?: string[] | null
  answers?: Record<string, string[]> | null
  flagged_ids?: string[] | null
  topic_stats?: TopicStats | null
  details?: unknown
  practice_config?: {
    topics?: Topic[]
    types?: QuestionType[]
    immediateFeedback?: boolean
    requestedCount?: number
  } | null
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
 * Normalizes a database `exam_attempts` row (including legacy rows created before the schema extension)
 * into a strongly typed `AttemptSummary` with computed `topic_stats` so historical analytics work seamlessly.
 */
export function toAttemptSummary(row: PersistedAttemptRow): AttemptSummary {
  const detailsArray = Array.isArray(row.details) ? (row.details as Partial<QuestionResult & { question_id?: string }>[]) : []
  let topicStats: TopicStats | null = row.topic_stats ?? null

  if (!topicStats && detailsArray.length > 0) {
    const computed = emptyTopicStats()
    for (const item of detailsArray) {
      const topic = item.topic as Topic | undefined
      if (topic && computed[topic]) {
        computed[topic].total++
        const answered = item.answered !== undefined ? item.answered : Array.isArray(item.selected) ? item.selected.length > 0 : true
        if (!answered) computed[topic].unanswered++
        else if (item.correct) computed[topic].correct++
        else computed[topic].incorrect++
      }
    }
    topicStats = computed
  }

  return {
    id: row.id,
    mode: (row.mode as ExamMode) ?? 'FULL',
    submitted_at: row.submitted_at ?? row.created_at,
    score: row.score,
    total: row.total,
    topic_stats: topicStats,
  }
}

/**
 * Extracts unique question IDs that the user previously answered incorrectly, left unanswered,
 * or flagged for review across their completed attempts. Used for Review Mode.
 */
export function extractReviewQuestionIds(rows: readonly PersistedAttemptRow[]): {
  allReviewIds: string[]
  incorrectIds: string[]
  flaggedIds: string[]
} {
  const incorrectSet = new Set<string>()
  const flaggedSet = new Set<string>()

  for (const row of rows) {
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

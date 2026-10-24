import { SIMULATOR_PASS_PERCENT, TOPICS, type QuestionType, type Topic } from './config.ts'

/** Full question snapshot used for grading. Only ever built on the server. */
export interface GradableQuestion {
  id: string
  topic: Topic
  type: QuestionType
  question_text: string
  options: Record<string, string>
  correct_answers: string[]
  explanation: string
}

/** Persisted per-question outcome. Stored in exam_attempts.details after submission. */
export interface QuestionResult extends GradableQuestion {
  selected: string[]
  answered: boolean
  correct: boolean
  flagged: boolean
}

export interface TopicStat { total: number; correct: number; incorrect: number; unanswered: number }
export type TopicStats = Record<Topic, TopicStat>

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value) => b.includes(value))
const unique = (values: readonly string[]) => [...new Set(values)]

/** Answer keys must exist in the question's options (guards against forged / stale keys). */
export function sanitizeSelection(question: Pick<GradableQuestion, 'options' | 'type'>, selected: readonly string[]): string[] {
  const valid = unique(selected).filter((key) => Object.prototype.hasOwnProperty.call(question.options, key))
  return question.type === 'MULTIPLE' ? valid : valid.slice(0, 1)
}

/**
 * Project scoring rule (not Huawei's official formula): one point per question,
 * awarded only when the selected set EXACTLY equals the correct set. No partial credit.
 */
export function isCorrect(question: GradableQuestion, selected: readonly string[]) {
  const picked = sanitizeSelection(question, selected)
  return picked.length > 0 && sameSet(picked, unique(question.correct_answers))
}

export function emptyTopicStats(): TopicStats {
  return Object.fromEntries(TOPICS.map((topic) => [topic, { total: 0, correct: 0, incorrect: 0, unanswered: 0 }])) as TopicStats
}

export function gradeAttempt(questions: readonly GradableQuestion[], answers: Record<string, string[]>, flagged: readonly string[]) {
  const results: QuestionResult[] = questions.map((question) => {
    const selected = sanitizeSelection(question, answers[question.id] ?? [])
    return { ...question, selected, answered: selected.length > 0, correct: isCorrect(question, selected), flagged: flagged.includes(question.id) }
  })
  const topicStats = emptyTopicStats()
  for (const result of results) {
    const stat = topicStats[result.topic]
    stat.total++
    if (!result.answered) stat.unanswered++
    else if (result.correct) stat.correct++
    else stat.incorrect++
  }
  const score = results.filter((result) => result.correct).length
  const answered = results.filter((result) => result.answered).length
  return { results, topicStats, score, total: results.length, answered }
}

export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)

/** Human interpretation, explicitly tied to the simulator threshold. */
export function interpretScore(scorePercent: number) {
  if (scorePercent >= 85) return { label: 'Excellent', tone: 'success' as const, text: `Well above the simulator threshold of ${SIMULATOR_PASS_PERCENT}%.` }
  if (scorePercent >= SIMULATOR_PASS_PERCENT) return { label: 'Passing (simulator)', tone: 'success' as const, text: `At or above the simulator threshold of ${SIMULATOR_PASS_PERCENT}%. This is a project setting, not an official pass mark.` }
  if (scorePercent >= 40) return { label: 'Needs improvement', tone: 'warning' as const, text: `Below the simulator threshold of ${SIMULATOR_PASS_PERCENT}%. Review the incorrect questions.` }
  return { label: 'Significant gaps', tone: 'danger' as const, text: `Well below the simulator threshold of ${SIMULATOR_PASS_PERCENT}%. Focus on the weakest technology first.` }
}

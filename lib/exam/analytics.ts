import { TOPICS, type ExamMode, type Topic } from './config.ts'
import { percent, type TopicStat, type TopicStats } from './scoring.ts'

export interface AttemptSummary {
  id: string
  mode: ExamMode
  submitted_at: string
  score: number
  total: number
  topic_stats: TopicStats | null
}

export const attemptPercent = (a: Pick<AttemptSummary, 'score' | 'total'>) => percent(a.score, a.total)
const byTime = (a: AttemptSummary, b: AttemptSummary) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
const topicPercent = (stat?: TopicStat) => (stat && stat.total > 0 ? percent(stat.correct, stat.total) : null)

export interface Comparison {
  hasPrevious: boolean
  previousId?: string
  deltaPoints: number | null
  perTopic: Record<Topic, { current: number | null; previous: number | null; delta: number | null }>
}

/** Compares an attempt with the most recent earlier attempt of the SAME mode. */
export function compareWithPrevious(attempts: readonly AttemptSummary[], currentId: string): Comparison {
  const sorted = [...attempts].sort(byTime)
  const index = sorted.findIndex((a) => a.id === currentId)
  const current = sorted[index]
  const previous = index > 0 && current ? [...sorted.slice(0, index)].reverse().find((a) => a.mode === current.mode) : undefined
  const perTopic = Object.fromEntries(TOPICS.map((topic) => {
    const now = topicPercent(current?.topic_stats?.[topic])
    const before = topicPercent(previous?.topic_stats?.[topic])
    return [topic, { current: now, previous: before, delta: now !== null && before !== null ? Math.round((now - before) * 10) / 10 : null }]
  })) as Comparison['perTopic']
  return {
    hasPrevious: !!previous,
    previousId: previous?.id,
    deltaPoints: current && previous ? Math.round((attemptPercent(current) - attemptPercent(previous)) * 10) / 10 : null,
    perTopic,
  }
}

export function summarizeHistory(attempts: readonly AttemptSummary[]) {
  const sorted = [...attempts].sort(byTime)
  if (!sorted.length) return { count: 0, latest: null, best: null, average: null }
  const percents = sorted.map(attemptPercent)
  return {
    count: sorted.length,
    latest: percents[percents.length - 1],
    best: Math.max(...percents),
    average: Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 10) / 10,
  }
}

/** Aggregate accuracy per technology across attempts; `null` when the user has no data for it. */
export function topicProgress(attempts: readonly AttemptSummary[]) {
  return Object.fromEntries(TOPICS.map((topic) => {
    let total = 0, correct = 0
    for (const a of attempts) { const s = a.topic_stats?.[topic]; if (s) { total += s.total; correct += s.correct } }
    return [topic, { total, correct, percent: total > 0 ? percent(correct, total) : null }]
  })) as Record<Topic, { total: number; correct: number; percent: number | null }>
}

/** Weakest technology by real accuracy; `null` until at least one technology has data. */
export function recommendNext(attempts: readonly AttemptSummary[]): { topic: Topic; percent: number } | null {
  const progress = topicProgress(attempts)
  const known = TOPICS.filter((t) => progress[t].percent !== null)
  if (!known.length) return null
  const weakest = known.reduce((a, b) => ((progress[b].percent as number) < (progress[a].percent as number) ? b : a))
  return { topic: weakest, percent: progress[weakest].percent as number }
}

/** Chart points, oldest first. One point per attempt; nothing is interpolated. */
export function trendSeries(attempts: readonly AttemptSummary[]) {
  return [...attempts].sort(byTime).map((a, i) => ({
    attempt: i + 1,
    id: a.id,
    date: a.submitted_at,
    overall: attemptPercent(a),
    OPENEULER: topicPercent(a.topic_stats?.OPENEULER),
    OPENGAUSS: topicPercent(a.topic_stats?.OPENGAUSS),
    KUNPENG: topicPercent(a.topic_stats?.KUNPENG),
  }))
}

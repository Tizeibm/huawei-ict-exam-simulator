'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Flag,
  HelpCircle,
  Server,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import type { Comparison } from '@/lib/exam/analytics'
import {
  SIMULATOR_PASS_PERCENT,
  TOPIC_LABELS,
  TOPICS,
  TYPE_LABELS,
  type ExamMode,
  type QuestionType,
  type Topic,
} from '@/lib/exam/config'
import { interpretScore, percent, type QuestionResult, type TopicStats } from '@/lib/exam/scoring'
import { formatClock } from '@/lib/exam/timer'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export interface AttemptResultData {
  id: string
  mode: ExamMode
  status: string
  score: number
  total: number
  scorePercent: number
  started_at: string
  submitted_at: string
  duration_seconds: number | null
  time_used_seconds: number | null
  topic_stats: TopicStats | null
  details: QuestionResult[]
  comparison: Comparison
}

const TOPIC_ICONS = {
  OPENEULER: Server,
  OPENGAUSS: Database,
  KUNPENG: Cpu,
} as const

type ReviewFilter = 'ALL' | 'CORRECT' | 'INCORRECT' | 'UNANSWERED' | 'FLAGGED'

export function ResultsView({ data }: { data: AttemptResultData }) {
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('ALL')
  const [topicFilter, setTopicFilter] = useState<'ALL' | Topic>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const interpretation = interpretScore(data.scorePercent)

  const stats = useMemo(() => {
    const details = data.details ?? []
    if (details.length > 0) {
      const answered = details.filter((d) => d.answered ?? (d.selected?.length ?? 0) > 0).length
      const unanswered = details.length - answered
      const correct = details.filter((d) => d.correct).length
      const incorrect = answered - correct
      const flagged = details.filter((d) => d.flagged).length
      return { total: details.length, answered, unanswered, correct, incorrect, flagged }
    }
    return {
      total: data.total,
      answered: data.total,
      unanswered: 0,
      correct: data.score,
      incorrect: Math.max(0, data.total - data.score),
      flagged: 0,
    }
  }, [data.details, data.score, data.total])

  const filteredDetails = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return (data.details ?? []).filter((item) => {
      const isAnswered = item.answered ?? (item.selected?.length ?? 0) > 0
      if (reviewFilter === 'CORRECT' && !item.correct) return false
      if (reviewFilter === 'INCORRECT' && (item.correct || !isAnswered)) return false
      if (reviewFilter === 'UNANSWERED' && isAnswered) return false
      if (reviewFilter === 'FLAGGED' && !item.flagged) return false
      if (topicFilter !== 'ALL' && item.topic !== topicFilter) return false
      if (!q) return true
      return (
        (item.question_text ?? '').toLowerCase().includes(q) ||
        (item.explanation ?? '').toLowerCase().includes(q)
      )
    })
  }, [data.details, reviewFilter, topicFilter, searchQuery])

  const remainingTimeSeconds =
    data.duration_seconds && data.time_used_seconds !== null
      ? Math.max(0, data.duration_seconds - data.time_used_seconds)
      : null

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            <ArrowLeft className="size-4" />
            <span>Dashboard</span>
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Exam Attempt Report
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/analytics" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <BarChart3 className="size-4" />
            <span>Historical Analytics</span>
          </Link>
          {stats.incorrect + stats.unanswered > 0 && (
            <Link
              href="/exam?mode=REVIEW"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              <span>Practice Missed Questions</span>
            </Link>
          )}
          <Link href="/exam" className={buttonVariants({ size: 'sm' })}>
            <BookOpenCheck className="size-4" />
            <span>Start New Exam</span>
          </Link>
        </div>
      </div>

      {/* Overall Result Summary Banner */}
      <Card className="overflow-hidden border-primary/25 shadow-sm">
        <div className="grid lg:grid-cols-[1.15fr_.85fr]">
          <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default" className="uppercase tracking-wider">
                  {data.mode === 'FULL'
                    ? 'Full Exam Simulation'
                    : data.mode === 'REVIEW'
                      ? 'Historical Review Session'
                      : 'Practice Session'}
                </Badge>
                <Badge variant="outline">
                  {data.status === 'EXPIRED' ? 'Auto-Submitted on Time Expiry' : 'Submitted'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Completed {new Date(data.submitted_at).toLocaleString()}
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-4 pt-1">
                <h1 className="text-4xl font-extrabold tracking-tight text-primary tabular-nums sm:text-5xl">
                  {data.scorePercent}%
                </h1>
                <span className="text-xl font-bold text-foreground tabular-nums">
                  ({data.score} / {data.total} correct)
                </span>
                <Badge
                  variant={interpretation.tone === 'success' ? 'default' : 'secondary'}
                  className={
                    interpretation.tone === 'success'
                      ? 'bg-emerald-600 text-white'
                      : interpretation.tone === 'warning'
                        ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                        : 'bg-destructive/15 text-destructive'
                  }
                >
                  {interpretation.label}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">{interpretation.text}</p>
            </div>

            {/* Key Count Breakdown */}
            <div className="grid grid-cols-2 gap-3 border-t pt-5 sm:grid-cols-5">
              <div>
                <p className="text-xs text-muted-foreground">Total Questions</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">{stats.total}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Answered</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">{stats.answered}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unanswered</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-amber-600">{stats.unanswered}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Correct</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600">{stats.correct}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Incorrect</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-destructive">{stats.incorrect}</p>
              </div>
            </div>
          </div>

          {/* Right Panel: Timing & Historical Delta vs Previous Attempt */}
          <div className="flex flex-col justify-between gap-5 border-t bg-muted/30 p-6 sm:p-8 lg:border-l lg:border-t-0">
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Session Timing & Comparison
              </h2>

              <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-3.5">
                <div className="flex items-center gap-2.5">
                  <Clock className="size-4 text-primary" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">Time Used</p>
                    <p className="text-sm font-bold tabular-nums">
                      {data.time_used_seconds !== null ? formatClock(data.time_used_seconds) : 'Untimed'}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Remaining Time</p>
                  <p className="text-sm font-bold tabular-nums">
                    {remainingTimeSeconds !== null ? formatClock(remainingTimeSeconds) : 'N/A (Untimed)'}
                  </p>
                </div>
              </div>

              {/* Comparison vs Previous Attempt */}
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Comparison vs. Previous {data.mode} Attempt
                  </span>
                  {data.comparison.hasPrevious && data.comparison.previousId && (
                    <Link
                      href={`/results/${data.comparison.previousId}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <span>View previous</span>
                      <ArrowUpRight className="size-3" />
                    </Link>
                  )}
                </div>

                {!data.comparison.hasPrevious || data.comparison.deltaPoints === null ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Not enough history for comparison yet — this is your first recorded attempt in {data.mode} mode.
                  </p>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    {data.comparison.deltaPoints >= 0 ? (
                      <TrendingUp className="size-4 text-emerald-600" />
                    ) : (
                      <TrendingDown className="size-4 text-destructive" />
                    )}
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        data.comparison.deltaPoints >= 0 ? 'text-emerald-600' : 'text-destructive'
                      }`}
                    >
                      {data.comparison.deltaPoints > 0 ? `+${data.comparison.deltaPoints}` : data.comparison.deltaPoints}{' '}
                      percentage points
                    </span>
                    <span className="text-xs text-muted-foreground">change from previous attempt</span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Scoring rule: 1 point per question. Multiple-choice items require exact option-set matching with no partial credit. The {SIMULATOR_PASS_PERCENT}% threshold is an ICT Prep simulator benchmark.
            </p>
          </div>
        </div>
      </Card>

      {/* Per-Technology Performance Breakdown */}
      <section aria-label="Per-technology breakdown" className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Per-Technology Performance</h2>
          <p className="text-xs text-muted-foreground">
            Diagnostic breakdown across openEuler, openGauss, and Kunpeng based on the actual questions in this attempt.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {TOPICS.map((topic) => {
            const Icon = TOPIC_ICONS[topic]
            const stat = data.topic_stats?.[topic] ?? { total: 0, correct: 0, incorrect: 0, unanswered: 0 }
            const pct = stat.total > 0 ? percent(stat.correct, stat.total) : null
            const topicDelta = data.comparison.perTopic?.[topic]?.delta ?? null

            return (
              <Card key={topic} className="metric-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <CardTitle className="text-base font-bold">{TOPIC_LABELS[topic]}</CardTitle>
                        <CardDescription className="text-xs">{stat.total} question(s) in attempt</CardDescription>
                      </div>
                    </div>
                    <span className="text-2xl font-extrabold text-primary tabular-nums">
                      {pct !== null ? `${pct}%` : '—'}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                  {/* Visual Progress Bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all ${
                        pct === null
                          ? 'bg-muted'
                          : pct >= 75
                            ? 'bg-emerald-600'
                            : pct >= SIMULATOR_PASS_PERCENT
                              ? 'bg-primary'
                              : 'bg-amber-500'
                      }`}
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md bg-emerald-500/10 py-1.5 text-emerald-800 dark:text-emerald-300">
                      <span className="block font-bold tabular-nums">{stat.correct}</span>
                      <span>Correct</span>
                    </div>
                    <div className="rounded-md bg-destructive/10 py-1.5 text-destructive">
                      <span className="block font-bold tabular-nums">{stat.incorrect}</span>
                      <span>Incorrect</span>
                    </div>
                    <div className="rounded-md bg-amber-500/10 py-1.5 text-amber-800 dark:text-amber-300">
                      <span className="block font-bold tabular-nums">{stat.unanswered}</span>
                      <span>Unanswered</span>
                    </div>
                  </div>

                  {topicDelta !== null && (
                    <p className="text-xs text-muted-foreground">
                      Trend vs. previous:{' '}
                      <strong className={topicDelta >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                        {topicDelta > 0 ? `+${topicDelta}` : topicDelta} percentage points
                      </strong>
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* Detailed Question-by-Question Review */}
      <section aria-label="Question-by-question review" className="flex flex-col gap-4">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-bold">Detailed Question-by-Question Review</CardTitle>
                <CardDescription>
                  Inspect every question, your submitted answer, the verified answer key, and the technical explanation.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['ALL', `All (${stats.total})`],
                    ['CORRECT', `Correct (${stats.correct})`],
                    ['INCORRECT', `Incorrect (${stats.incorrect})`],
                    ['UNANSWERED', `Unanswered (${stats.unanswered})`],
                    ['FLAGGED', `Flagged (${stats.flagged})`],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    size="xs"
                    variant={reviewFilter === key ? 'default' : 'outline'}
                    onClick={() => setReviewFilter(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-56">
                <Input
                  type="search"
                  placeholder="Filter questions or explanations by keyword…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search review questions"
                />
              </div>
              <select
                aria-label="Filter review by technology"
                className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs font-medium"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value as 'ALL' | Topic)}
              >
                <option value="ALL">All Technologies</option>
                {TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {TOPIC_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 pt-5">
            {filteredDetails.length === 0 ? (
              <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                No questions match the selected review filter.
              </div>
            ) : (
              filteredDetails.map((item, idx) => {
                const isAnswered = item.answered ?? (item.selected?.length ?? 0) > 0
                const selectedKeys = item.selected ?? []
                const correctKeys = item.correct_answers ?? []
                const options = item.options ?? {}

                return (
                  <div key={item.id ?? idx} className="rounded-xl border bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-bold tabular-nums">
                          #{idx + 1}
                        </span>
                        <Badge variant="outline">
                          {TOPIC_LABELS[item.topic as Topic] ?? item.topic}
                        </Badge>
                        {item.type && (
                          <Badge variant="secondary">
                            {TYPE_LABELS[item.type as QuestionType] ?? item.type}
                          </Badge>
                        )}
                        {item.flagged && (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
                            <Flag className="size-3" />
                            <span>Flagged</span>
                          </Badge>
                        )}
                      </div>

                      <div>
                        {item.correct ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="size-3.5" />
                            <span>Correct</span>
                          </span>
                        ) : !isAnswered ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-800 dark:text-amber-300">
                            <HelpCircle className="size-3.5" />
                            <span>Unanswered</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs font-bold text-destructive">
                            <XCircle className="size-3.5" />
                            <span>Incorrect</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="mt-3 text-base font-semibold leading-relaxed text-foreground">
                      {item.question_text || 'Question snapshot'}
                    </p>

                    {Object.keys(options).length > 0 && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {Object.entries(options).map(([key, text]) => {
                          const userPicked = selectedKeys.includes(key)
                          const isRightKey = correctKeys.includes(key)

                          return (
                            <div
                              key={key}
                              className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-xs ${
                                isRightKey
                                  ? 'border-emerald-500/60 bg-emerald-500/10 font-medium text-emerald-950 dark:text-emerald-200'
                                  : userPicked && !isRightKey
                                    ? 'border-destructive/60 bg-destructive/10 text-destructive'
                                    : 'bg-muted/20 text-muted-foreground'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="font-bold">{key}.</span>
                                <span>{text}</span>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {userPicked && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Your choice
                                  </Badge>
                                )}
                                {isRightKey && (
                                  <Badge variant="default" className="bg-emerald-600 text-white text-[10px]">
                                    Correct
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                      <div>
                        <span className="font-semibold">Your Submitted Answer: </span>
                        <span className="font-mono">
                          {selectedKeys.length > 0 ? selectedKeys.join(', ') : 'None (Unanswered)'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Correct Answer Key(s): </span>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {correctKeys.length > 0 ? correctKeys.join(', ') : '—'}
                        </span>
                      </div>
                    </div>

                    {item.explanation && (
                      <div className="mt-3 rounded-lg border border-primary/20 bg-accent/40 p-3 text-xs leading-relaxed">
                        <span className="font-bold text-primary">Explanation: </span>
                        <span className="text-foreground/90">{item.explanation}</span>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

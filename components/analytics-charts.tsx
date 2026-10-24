'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowUpRight, BarChart3, BookOpenCheck, TrendingDown, TrendingUp } from 'lucide-react'
import type { AttemptSummary, Comparison } from '@/lib/exam/analytics'
import { trendSeries } from '@/lib/exam/analytics'
import { SIMULATOR_PASS_PERCENT, TOPIC_LABELS, TOPICS, type ExamMode, type Topic } from '@/lib/exam/config'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AnalyticsChartsProps {
  attempts: AttemptSummary[]
  topicProgressData: Record<Topic, { total: number; correct: number; percent: number | null }>
  latestComparison: Comparison | null
}

export function AnalyticsCharts({
  attempts,
  topicProgressData,
  latestComparison,
}: AnalyticsChartsProps) {
  const [modeFilter, setModeFilter] = useState<'ALL' | ExamMode>('ALL')

  const filteredAttempts = useMemo(() => {
    if (modeFilter === 'ALL') return attempts
    return attempts.filter((a) => a.mode === modeFilter)
  }, [attempts, modeFilter])

  const series = useMemo(() => {
    return trendSeries(filteredAttempts).map((pt) => ({
      ...pt,
      label: `#${pt.attempt} (${new Date(pt.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`,
    }))
  }, [filteredAttempts])

  const topicBarData = useMemo(() => {
    return TOPICS.map((topic) => ({
      name: TOPIC_LABELS[topic],
      topic,
      accuracy: topicProgressData[topic]?.percent ?? 0,
      questionsAnswered: topicProgressData[topic]?.total ?? 0,
      correct: topicProgressData[topic]?.correct ?? 0,
    }))
  }, [topicProgressData])

  if (attempts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BarChart3 className="size-6" aria-hidden="true" />
          </span>
          <div className="max-w-md">
            <h2 className="text-lg font-bold">No Persisted Exam History Yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Charts and historical comparisons are generated strictly from real completed attempts. Complete your first practice session or simulated exam to unlock longitudinal trend analysis.
            </p>
          </div>
          <Link href="/exam" className={buttonVariants({ size: 'lg' })}>
            <BookOpenCheck className="size-4" />
            <span>Start Your First Exam</span>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Historical Comparison vs Previous Attempt */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-bold">Latest Attempt vs. Previous Attempt Comparison</CardTitle>
              <CardDescription>
                Compares your most recent completed exam against your immediately preceding attempt of the same mode.
              </CardDescription>
            </div>
            {latestComparison?.hasPrevious && latestComparison.previousId && (
              <Link
                href={`/results/${latestComparison.previousId}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>Open Previous Attempt Report</span>
                <ArrowUpRight className="size-3.5" />
              </Link>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          {!latestComparison || !latestComparison.hasPrevious ? (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              You have completed <strong>{attempts.length} attempt(s)</strong> so far, which establishes your initial baseline. Complete one more attempt in the same mode to unlock score delta and per-technology trend comparisons.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">Overall Score Change</p>
                <div className="mt-2 flex items-center gap-2">
                  {(latestComparison.deltaPoints ?? 0) >= 0 ? (
                    <TrendingUp className="size-5 text-emerald-600" />
                  ) : (
                    <TrendingDown className="size-5 text-destructive" />
                  )}
                  <span
                    className={`text-2xl font-extrabold tabular-nums ${
                      (latestComparison.deltaPoints ?? 0) >= 0 ? 'text-emerald-600' : 'text-destructive'
                    }`}
                  >
                    {(latestComparison.deltaPoints ?? 0) > 0
                      ? `+${latestComparison.deltaPoints}`
                      : latestComparison.deltaPoints}{' '}
                    pp
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Percentage points vs. previous attempt</p>
              </div>

              {TOPICS.map((topic) => {
                const tComp = latestComparison.perTopic[topic]
                return (
                  <div key={topic} className="rounded-xl border bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">{TOPIC_LABELS[topic]} Trend</p>
                    {tComp.delta === null ? (
                      <p className="mt-2 text-sm font-semibold text-muted-foreground">
                        {tComp.current !== null ? `${tComp.current}% (First data point)` : 'Not tested in both'}
                      </p>
                    ) : (
                      <>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span
                            className={`text-xl font-bold tabular-nums ${
                              tComp.delta >= 0 ? 'text-emerald-600' : 'text-destructive'
                            }`}
                          >
                            {tComp.delta > 0 ? `+${tComp.delta}` : tComp.delta} pp
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            ({tComp.previous}% → {tComp.current}%)
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Accuracy change in {TOPIC_LABELS[topic]}</p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        {/* Performance Over Time Chart */}
        <Card>
          <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold">Performance Over Time (%)</CardTitle>
              <CardDescription>
                Real accuracy trajectory across persisted attempts (with {SIMULATOR_PASS_PERCENT}% simulator benchmark).
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1">
              {(['ALL', 'FULL', 'PRACTICE', 'REVIEW'] as const).map((m) => (
                <Button
                  key={m}
                  size="xs"
                  variant={modeFilter === m ? 'default' : 'outline'}
                  onClick={() => setModeFilter(m)}
                >
                  {m === 'ALL' ? 'All Modes' : m}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="pt-5">
            {series.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                No completed attempts for {modeFilter} mode yet.
              </div>
            ) : (
              <>
                <div className="h-72 w-full" role="img" aria-label="Line chart of exam accuracy over time">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(val: unknown) => (typeof val === 'number' ? `${val}%` : '—')} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <ReferenceLine
                        y={SIMULATOR_PASS_PERCENT}
                        stroke="#2563eb"
                        strokeDasharray="4 4"
                        label={{ value: `${SIMULATOR_PASS_PERCENT}% target`, fontSize: 10, fill: '#2563eb' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="overall"
                        name="Overall Score"
                        stroke="#1d4ed8"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="OPENEULER"
                        name="openEuler"
                        stroke="#0284c7"
                        strokeWidth={1.75}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="OPENGAUSS"
                        name="openGauss"
                        stroke="#0d9488"
                        strokeWidth={1.75}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="KUNPENG"
                        name="Kunpeng"
                        stroke="#7c3aed"
                        strokeWidth={1.75}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Accessible textual summary */}
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing {series.length} persisted attempt(s). Latest overall score:{' '}
                  <strong>{series[series.length - 1]?.overall}%</strong>.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Cumulative Technology Accuracy Bar Chart */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base font-bold">Cumulative Accuracy by Technology</CardTitle>
            <CardDescription>Aggregate percentage correct across all completed attempts.</CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="h-72 w-full" role="img" aria-label="Bar chart of cumulative accuracy by technology">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicBarData} margin={{ top: 10, right: 12, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: unknown, _name: unknown, props: { payload?: { correct?: number; questionsAnswered?: number } }) => [
                      `${value}% (${props?.payload?.correct ?? 0}/${props?.payload?.questionsAnswered ?? 0})`,
                      'Accuracy',
                    ]}
                  />
                  <ReferenceLine y={SIMULATOR_PASS_PERCENT} stroke="#2563eb" strokeDasharray="4 4" />
                  <Bar dataKey="accuracy" name="Accuracy (%)" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              {topicBarData.map((item) => (
                <div key={item.topic} className="rounded-lg border bg-muted/30 p-2">
                  <span className="block font-semibold">{item.name}</span>
                  <span className="font-bold text-primary tabular-nums">
                    {item.questionsAnswered > 0 ? `${item.accuracy}%` : 'No data'}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {item.correct}/{item.questionsAnswered} correct
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

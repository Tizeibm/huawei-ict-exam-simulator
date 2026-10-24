import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, BookOpenCheck } from 'lucide-react'
import { AnalyticsCharts } from '@/components/analytics-charts'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentUserContext } from '@/lib/auth/server'
import {
  attemptPercent,
  compareWithPrevious,
  summarizeHistory,
  topicProgress,
} from '@/lib/exam/analytics'
import { SIMULATOR_PASS_PERCENT, TOPIC_LABELS, TOPICS } from '@/lib/exam/config'
import { percent } from '@/lib/exam/scoring'
import { toAttemptSummary, unpackAttemptRow } from '@/lib/exam-service'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Historical Analytics · ICT Prep' }

export default async function AnalyticsPage() {
  const { user, profile, isAdmin } = await getCurrentUserContext()
  const privileged = createAdminClient()

  const { data: rows } = await privileged
    .from('exam_attempts')
    .select('id, user_id, score, total, details, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const completedRows = (rows ?? [])
    .map((r) => unpackAttemptRow(r as Record<string, unknown>))
    .filter((r) => r.status === 'SUBMITTED' || r.status === 'EXPIRED')

  const summaries = completedRows.map(toAttemptSummary)
  const overallSummary = summarizeHistory(summaries)
  const perTopic = topicProgress(summaries)
  const latestComparison =
    summaries.length > 0 ? compareWithPrevious(summaries, summaries[0].id) : null

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader email={user?.email} fullName={profile?.full_name} isAdmin={isAdmin} />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Longitudinal Performance
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Historical Analytics &amp; Progress Trends
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your score evolution and technology mastery across openEuler, openGauss, and Kunpeng.
            </p>
          </div>
          <Link href="/exam" className={buttonVariants({ size: 'default' })}>
            <BookOpenCheck className="size-4" />
            <span>Start New Exam</span>
          </Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-4">
          {[
            ['Total Attempts', String(overallSummary.count)],
            ['Latest Score', overallSummary.latest === null ? '—' : `${overallSummary.latest}%`],
            ['Best Score', overallSummary.best === null ? '—' : `${overallSummary.best}%`],
            ['Average Score', overallSummary.average === null ? '—' : `${overallSummary.average}%`],
          ].map(([label, val]) => (
            <Card key={label} className="metric-card">
              <CardHeader className="pb-2">
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-2xl font-bold tabular-nums">{val}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </section>

        <AnalyticsCharts
          attempts={summaries}
          topicProgressData={perTopic}
          latestComparison={latestComparison}
        />

        {summaries.length > 0 && (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-lg font-bold">Complete Attempt Log</CardTitle>
              <CardDescription>
                Every persisted exam session for your account. Click any row to open its full question-by-question review.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="pb-3">Date</th>
                      <th className="pb-3">Mode</th>
                      <th className="pb-3 text-right">Raw Score</th>
                      <th className="pb-3 text-right">Overall %</th>
                      {TOPICS.map((t) => (
                        <th key={t} className="pb-3 text-right">
                          {TOPIC_LABELS[t]}
                        </th>
                      ))}
                      <th className="pb-3 text-right">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {summaries.map((item) => {
                      const pct = attemptPercent(item)
                      return (
                        <tr key={item.id} className="hover:bg-muted/30">
                          <td className="py-3 text-xs text-muted-foreground">
                            {new Date(item.submitted_at).toLocaleString()}
                          </td>
                          <td className="py-3">
                            <Badge variant={item.mode === 'FULL' ? 'default' : 'secondary'}>
                              {item.mode}
                            </Badge>
                          </td>
                          <td className="py-3 text-right font-medium tabular-nums">
                            {item.score} / {item.total}
                          </td>
                          <td
                            className={`py-3 text-right font-bold tabular-nums ${
                              pct >= SIMULATOR_PASS_PERCENT ? 'text-emerald-600' : 'text-primary'
                            }`}
                          >
                            {pct}%
                          </td>
                          {TOPICS.map((t) => {
                            const st = item.topic_stats?.[t]
                            const tPct = st && st.total > 0 ? `${percent(st.correct, st.total)}%` : '—'
                            return (
                              <td key={t} className="py-3 text-right text-xs tabular-nums text-muted-foreground">
                                {tPct}
                              </td>
                            )
                          })}
                          <td className="py-3 text-right">
                            <Link
                              href={`/results/${item.id}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                            >
                              <span>Inspect</span>
                              <ArrowUpRight className="size-3.5" />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}

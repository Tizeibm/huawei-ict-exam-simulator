import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  Compass,
  Cpu,
  Database,
  Server,
  Shield,
  Target,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentUserContext } from '@/lib/auth/server'
import {
  attemptPercent,
  recommendNext,
  summarizeHistory,
  topicProgress,
} from '@/lib/exam/analytics'
import {
  SIMULATOR_PASS_PERCENT,
  TOPIC_LABELS,
  TOPICS,
  type Topic,
} from '@/lib/exam/config'
import { toAttemptSummary, type PersistedAttemptRow } from '@/lib/exam-service'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Dashboard · ICT Prep' }

const TOPIC_META: Record<Topic, { Icon: typeof Server; description: string }> = {
  OPENEULER: { Icon: Server, description: 'Linux OS administration, storage & networking' },
  OPENGAUSS: { Icon: Database, description: 'Enterprise relational database architecture & SQL' },
  KUNPENG: { Icon: Cpu, description: 'ARM server architecture, porting & tuning' },
}

export default async function DashboardPage() {
  const { user, profile, isAdmin } = await getCurrentUserContext()
  const privileged = createAdminClient()

  const [attemptsRes, ...topicCountResponses] = await Promise.all([
    privileged
      .from('exam_attempts')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
    ...TOPICS.map((topic) =>
      privileged.from('questions').select('id', { count: 'exact', head: true }).eq('topic', topic),
    ),
  ])

  const allRows = (attemptsRes.data ?? []) as PersistedAttemptRow[]
  const activeSession = allRows.find((r) => r.status === 'IN_PROGRESS')
  const completedRows = allRows.filter((r) => !r.status || r.status === 'SUBMITTED' || r.status === 'EXPIRED')
  const summaries = completedRows.map(toAttemptSummary)

  const summaryStats = summarizeHistory(summaries)
  const perTopic = topicProgress(summaries)
  const recommendation = recommendNext(summaries)

  const questionCountsByTopic = Object.fromEntries(
    TOPICS.map((topic, idx) => [topic, topicCountResponses[idx]?.count ?? 0]),
  ) as Record<Topic, number>
  const totalQuestionsInBank = Object.values(questionCountsByTopic).reduce((a, b) => a + b, 0)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader email={user?.email} fullName={profile?.full_name} isAdmin={isAdmin} />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        {/* Top Welcome & Primary Actions */}
        <section className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="uppercase tracking-wider text-[10px]">
                {isAdmin ? 'Administrator & Candidate Workspace' : 'Candidate Workspace'}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Huawei ICT Competition · Computing Track
              </Badge>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              All metrics and recommendations below are computed strictly from your persisted exam attempts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isAdmin && (
              <Link href="/admin" className={buttonVariants({ variant: 'outline', size: 'default' })}>
                <Shield className="size-4" />
                <span>Admin Console</span>
              </Link>
            )}
            <Link href="/analytics" className={buttonVariants({ variant: 'secondary', size: 'default' })}>
              <BarChart3 className="size-4" />
              <span>Historical Analytics</span>
            </Link>
            <Link href="/exam" className={buttonVariants({ size: 'default' })}>
              <BookOpenCheck className="size-4" />
              <span>{activeSession ? 'Resume / Start Exam' : 'Start Exam Simulator'}</span>
            </Link>
          </div>
        </section>

        {/* Active Exam Banner if an unfinished session exists */}
        {activeSession && (
          <Card className="border-primary/40 bg-accent/40">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="default">In-Progress Exam</Badge>
                  <Badge variant="outline">{activeSession.mode ?? 'FULL'} Mode</Badge>
                </div>
                <CardTitle className="mt-1.5 text-base font-bold">
                  You have an active examination session in progress ({activeSession.total} questions)
                </CardTitle>
                <CardDescription>
                  Started {new Date(activeSession.started_at ?? activeSession.created_at).toLocaleString()}
                </CardDescription>
              </div>
              <Link href="/exam" className={buttonVariants({ size: 'sm' })}>
                <span>Return to Active Exam</span>
                <ArrowRight className="size-4" />
              </Link>
            </CardHeader>
          </Card>
        )}

        {/* Empty Question Bank Notice */}
        {totalQuestionsInBank === 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-200">
            The question bank is currently empty.{' '}
            {isAdmin ? (
              <Link href="/admin" className="font-semibold underline">
                Open the Administrator Console to import JSON questions
              </Link>
            ) : (
              'An administrator must import questions before an exam can start.'
            )}
          </div>
        )}

        {/* 4 Core KPI Cards (Real Persisted Statistics Only) */}
        <section aria-label="Personal performance summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="metric-card">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Completed Exams</span>
                <ClipboardList className="size-4 text-primary" />
              </CardDescription>
              <CardTitle className="text-3xl font-bold tabular-nums">{summaryStats.count}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Persisted under your personal account
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Latest Result</span>
                <Target className="size-4 text-primary" />
              </CardDescription>
              <CardTitle className="text-3xl font-bold tabular-nums">
                {summaryStats.latest === null ? '—' : `${summaryStats.latest}%`}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {completedRows[0]
                ? `${completedRows[0].score} / ${completedRows[0].total} on ${new Date(
                    completedRows[0].submitted_at ?? completedRows[0].created_at,
                  ).toLocaleDateString()}`
                : 'No completed attempt yet'}
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Best Result</span>
                <Award className="size-4 text-primary" />
              </CardDescription>
              <CardTitle className="text-3xl font-bold tabular-nums text-primary">
                {summaryStats.best === null ? '—' : `${summaryStats.best}%`}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Simulator target benchmark: {SIMULATOR_PASS_PERCENT}%
            </CardContent>
          </Card>

          <Card className="metric-card">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                <span>Average Accuracy</span>
                <BarChart3 className="size-4 text-primary" />
              </CardDescription>
              <CardTitle className="text-3xl font-bold tabular-nums">
                {summaryStats.average === null ? '—' : `${summaryStats.average}%`}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Across all {summaryStats.count} completed session(s)
            </CardContent>
          </Card>
        </section>

        {/* Recommended Next Area to Practice Banner */}
        {recommendation && (
          <Card className="border-primary/25 bg-accent/30">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Compass className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">
                    Recommended Next Focus Area
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {TOPIC_LABELS[recommendation.topic]} is currently your lowest-scoring technology at{' '}
                    <span className="text-primary tabular-nums">{recommendation.percent}%</span> cumulative accuracy.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Launch a targeted {TOPIC_LABELS[recommendation.topic]} practice session with immediate explanations to strengthen this track.
                  </p>
                </div>
              </div>

              <Link
                href={`/exam?mode=PRACTICE&topic=${recommendation.topic}`}
                className={buttonVariants({ size: 'sm' })}
              >
                <span>Practice {TOPIC_LABELS[recommendation.topic]}</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Progress by Technology */}
        <section aria-label="Progress by technology" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Progress by Technology</h2>
              <p className="text-xs text-muted-foreground">
                Cumulative accuracy and question bank availability across the three Computing Track technologies.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {TOPICS.map((topic) => {
              const { Icon, description } = TOPIC_META[topic]
              const prog = perTopic[topic]
              const availableInBank = questionCountsByTopic[topic]

              return (
                <Card key={topic} className="metric-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                          <CardTitle className="text-base font-bold">{TOPIC_LABELS[topic]}</CardTitle>
                          <CardDescription className="text-xs">{availableInBank} questions in bank</CardDescription>
                        </div>
                      </div>
                      <span className="text-2xl font-extrabold text-primary tabular-nums">
                        {prog.percent !== null ? `${prog.percent}%` : '—'}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">{description}</p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${prog.percent ?? 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {prog.total > 0
                          ? `${prog.correct} / ${prog.total} answered correctly`
                          : 'Not yet practiced'}
                      </span>
                      <Link
                        href={`/exam?mode=PRACTICE&topic=${topic}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        Practice →
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        {/* Recent Exam History */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b">
            <div>
              <CardTitle className="text-lg font-bold">Recent Exam History</CardTitle>
              <CardDescription>
                Click any completed session to inspect per-technology performance and review every question.
              </CardDescription>
            </div>
            {completedRows.length > 0 && (
              <Link href="/analytics" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <span>Full Analytics & Trends</span>
                <ArrowUpRight className="size-3.5" />
              </Link>
            )}
          </CardHeader>

          <CardContent className="pt-4">
            {completedRows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
                <ClipboardList className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="font-semibold">No Completed Exams Yet</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Start a Full Exam Simulation or a targeted Practice Session. Once submitted, your score breakdown and question explanations will appear here.
                </p>
                <Link href="/exam" className={buttonVariants({ size: 'sm', className: 'mt-1' })}>
                  Start Your First Exam
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {completedRows.slice(0, 12).map((item) => {
                  const summary = toAttemptSummary(item)
                  const pct = attemptPercent(summary)
                  return (
                    <li key={item.id}>
                      <Link href={`/results/${item.id}`} className="activity-row justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={summary.mode === 'FULL' ? 'default' : 'secondary'}>
                              {summary.mode}
                            </Badge>
                            <span className="font-semibold text-foreground">
                              {item.score} / {item.total} correct
                            </span>
                            {item.status === 'EXPIRED' && (
                              <Badge variant="outline" className="text-[10px]">
                                Time Expired
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(summary.submitted_at).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`text-lg font-extrabold tabular-nums ${
                              pct >= SIMULATOR_PASS_PERCENT ? 'text-emerald-600' : 'text-primary'
                            }`}
                          >
                            {pct}%
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <span>Review</span>
                            <ArrowUpRight className="size-3.5" />
                          </span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

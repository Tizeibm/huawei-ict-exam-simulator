import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { ResultsView, type AttemptResultData } from '@/components/results-view'
import { getCurrentUserContext } from '@/lib/auth/server'
import { compareWithPrevious } from '@/lib/exam/analytics'
import { percent } from '@/lib/exam/scoring'
import { toAttemptSummary, unpackAttemptRow } from '@/lib/exam-service'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Exam Results & Review · ICT Prep' }

export default async function ResultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user, profile, isAdmin } = await getCurrentUserContext()
  if (!user) notFound()

  const privileged = createAdminClient()
  const { data: row } = await privileged
    .from('exam_attempts')
    .select('id, user_id, score, total, details, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!row) notFound()

  const attempt = unpackAttemptRow(row as Record<string, unknown>)

  const { data: allRows } = await privileged
    .from('exam_attempts')
    .select('id, user_id, score, total, details, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(100)

  const completedSummaries = (allRows ?? [])
    .map((r) => unpackAttemptRow(r as Record<string, unknown>))
    .filter((a) => a.status === 'SUBMITTED' || a.status === 'EXPIRED')
    .map(toAttemptSummary)

  const currentSummary = toAttemptSummary(attempt)
  const comparison = compareWithPrevious(completedSummaries, attempt.id)
  const scorePercent = percent(attempt.score, attempt.total)

  const resultData: AttemptResultData = {
    id: attempt.id,
    mode: currentSummary.mode,
    status: attempt.status ?? 'SUBMITTED',
    score: attempt.score,
    total: attempt.total,
    scorePercent,
    started_at: attempt.started_at ?? attempt.created_at,
    submitted_at: attempt.submitted_at ?? attempt.created_at,
    duration_seconds: attempt.duration_seconds ?? null,
    time_used_seconds: attempt.time_used_seconds ?? null,
    topic_stats: currentSummary.topic_stats,
    details: attempt.details,
    comparison,
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader email={user.email} fullName={profile?.full_name} isAdmin={isAdmin} />
      <ResultsView data={resultData} />
    </div>
  )
}

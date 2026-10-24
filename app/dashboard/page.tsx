import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, Cpu, Database, Server } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Dashboard · ICT Prep' }

const TOPICS = [
  { key: 'OPENEULER', label: 'openEuler', Icon: Server },
  { key: 'OPENGAUSS', label: 'openGauss', Icon: Database },
  { key: 'KUNPENG', label: 'Kunpeng', Icon: Cpu },
] as const

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: profile }, { data: attempts }, ...topicCounts] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user!.id).maybeSingle(),
    supabase.from('exam_attempts').select('id, score, total, created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(20),
    ...TOPICS.map((topic) => supabase.from('questions').select('id', { count: 'exact', head: true }).eq('topic', topic.key)),
  ])

  const history = attempts ?? []
  const percent = (item: { score: number; total: number }) => Math.round((item.score / item.total) * 100)
  const average = history.length ? Math.round(history.reduce((sum, item) => sum + percent(item), 0) / history.length) : null
  const best = history.length ? Math.max(...history.map(percent)) : null
  const totalQuestions = topicCounts.reduce((sum, result) => sum + (result.count ?? 0), 0)

  return (
    <>
      <AppHeader email={user?.email} isAdmin={false} />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Candidate dashboard</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}</h1>
            <p className="mt-2 text-muted-foreground">Your results come only from practice sessions you complete here.</p>
          </div>
          <Link href="/exam" className={buttonVariants({ size: 'lg', className: 'h-11 rounded-xl px-5' })}>Start practice exam</Link>
        </section>

        <section aria-label="Your statistics" className="grid gap-4 sm:grid-cols-3">
          {[['Sessions completed', String(history.length)], ['Average score', average === null ? '—' : `${average}%`], ['Best score', best === null ? '—' : `${best}%`]].map(([label, value]) => (
            <Card key={label} className="metric-card"><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-3xl font-bold">{value}</CardTitle></CardHeader></Card>
          ))}
        </section>

        <section aria-label="Question bank" className="grid gap-4 md:grid-cols-3">
          {TOPICS.map(({ key, label, Icon }, index) => (
            <Card key={key} className="metric-card"><CardHeader><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Icon className="size-5" aria-hidden="true" /></span><div><CardTitle>{label}</CardTitle><CardDescription>{topicCounts[index].count ?? 0} questions available</CardDescription></div></div></CardHeader></Card>
          ))}
        </section>
        {totalQuestions === 0 && <p className="rounded-xl border bg-accent/50 p-4 text-sm">The question bank is empty. An administrator must import questions before an exam can start.</p>}

        <Card>
          <CardHeader><CardTitle>Recent results</CardTitle><CardDescription>Your last {history.length || 'completed'} sessions</CardDescription></CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center"><ClipboardList className="size-8 text-muted-foreground" aria-hidden="true" /><p className="font-medium">No exam history yet</p><p className="max-w-sm text-sm text-muted-foreground">Complete a practice exam and your score will be saved here.</p></div>
            ) : (
              <ul className="flex flex-col gap-1">
                {history.map((item) => (
                  <li key={item.id} className="activity-row">
                    <span className="flex-1"><span className="block font-medium">{item.score} / {item.total} correct</span><span className="block text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span></span>
                    <span className="text-lg font-bold text-primary">{percent(item)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  )
}

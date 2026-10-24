'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AccountStatus } from '@/lib/auth/access'

type Candidate = { id: string; full_name: string; status: AccountStatus; role: string; created_at: string }
type AdminQuestion = { id: string; topic: string; type: string; question_text: string }
type Tab = 'PENDING' | 'APPROVED' | 'BLOCKED' | 'questions'

export function AdminConsole() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [me, setMe] = useState('')
  const [tab, setTab] = useState<Tab>('PENDING')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/overview')
    if (!response.ok) { setMessage('Administrator data could not be loaded.'); setLoading(false); return }
    const data = await response.json()
    setCandidates(data.candidates); setQuestions(data.questions); setMe(data.currentUserId); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function update(id: string, status: AccountStatus) {
    setMessage('')
    const response = await fetch('/api/admin/overview', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) })
    if (!response.ok) { setMessage('Account status could not be updated.'); return }
    setCandidates((items) => items.map((item) => (item.id === id ? { ...item, status } : item)))
  }

  const count = (status: AccountStatus) => candidates.filter((item) => item.status === status).length
  const visible = candidates.filter((item) => tab === 'BLOCKED' ? item.status === 'REJECTED' || item.status === 'SUSPENDED' : item.status === tab)
  const tabs: [Tab, string][] = [['PENDING', `Pending (${count('PENDING')})`], ['APPROVED', `Approved (${count('APPROVED')})`], ['BLOCKED', `Rejected / suspended (${count('REJECTED') + count('SUSPENDED')})`], ['questions', `Question bank (${questions.length})`]]

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Administrator console</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Review and manage access</h1>
      <p className="mt-2 text-muted-foreground">Approve, reject or suspend accounts. Only approved accounts can use ICT Prep.</p>
      {message && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Administration sections">
            {tabs.map(([key, label]) => <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? 'default' : 'outline'} onClick={() => setTab(key)}>{label}</Button>)}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3" role="tabpanel">
          {loading && <p className="text-muted-foreground">Loading…</p>}
          {!loading && tab !== 'questions' && visible.map((candidate) => (
            <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
              <div><p className="font-medium">{candidate.full_name || 'Unnamed user'} {candidate.id === me && <Badge variant="outline">You</Badge>}</p><p className="text-sm text-muted-foreground">{candidate.role} · Joined {new Date(candidate.created_at).toLocaleDateString()}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={candidate.status === 'APPROVED' ? 'default' : 'secondary'}>{candidate.status}</Badge>
                {candidate.id !== me && <>
                  {candidate.status !== 'APPROVED' && <Button size="sm" onClick={() => update(candidate.id, 'APPROVED')}>{candidate.status === 'PENDING' ? 'Approve' : 'Reinstate'}</Button>}
                  {candidate.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => update(candidate.id, 'REJECTED')}>Reject</Button>}
                  {candidate.status === 'APPROVED' && <Button size="sm" variant="destructive" onClick={() => update(candidate.id, 'SUSPENDED')}>Suspend</Button>}
                </>}
              </div>
            </div>
          ))}
          {!loading && tab !== 'questions' && !visible.length && <p className="rounded-xl border border-dashed py-10 text-center text-muted-foreground">No accounts in this list.</p>}
          {!loading && tab === 'questions' && questions.map((question) => (
            <div key={question.id} className="rounded-xl border p-4"><div className="flex flex-wrap gap-2"><Badge variant="outline">{question.topic}</Badge><Badge variant="secondary">{question.type}</Badge></div><p className="mt-2 font-medium">{question.question_text}</p></div>
          ))}
          {!loading && tab === 'questions' && !questions.length && <CardDescription className="rounded-xl border border-dashed py-10 text-center">No questions imported yet. Use the secured import endpoint (POST /api/admin/questions/import) to add the question bank.</CardDescription>}
        </CardContent>
      </Card>
    </main>
  )
}

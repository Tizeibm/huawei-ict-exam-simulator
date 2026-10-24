'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchQuestions, scoreQuestion, type Question } from '@/lib/exam-service'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

const supabase = createClient()

export default function ExamPage() {
  const [email, setEmail] = useState<string>()
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string[]>>({})
  const [finished, setFinished] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ score: number; total: number } | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email)) }, [])

  async function startExam() {
    setLoading(true); setMessage(''); setSaved(null)
    try {
      const loaded = await fetchQuestions(supabase)
      setQuestions(loaded); setCurrent(0); setAnswers({}); setFinished(false)
      if (!loaded.length) setMessage('The question bank is empty. An administrator must import questions before an exam can start.')
    } catch { setMessage('Questions could not be loaded. Please try again.') }
    setLoading(false)
  }

  async function finish() {
    setFinished(true); setSaving(true); setMessage('')
    const payload = Object.fromEntries(questions.map((question, index) => [question.id, answers[index] ?? []]))
    const response = await fetch('/api/attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: payload }) })
    if (response.ok) setSaved(await response.json())
    else setMessage('Your result is shown below but could not be saved to your history.')
    setSaving(false)
  }

  const localScore = questions.reduce((total, question, index) => total + (scoreQuestion(question, answers[index] ?? []) ? 1 : 0), 0)
  const question = questions[current]
  const selected = answers[current] ?? []
  const choose = (key: string) => setAnswers((old) => ({ ...old, [current]: question.type === 'MULTIPLE' ? (selected.includes(key) ? selected.filter((v) => v !== key) : [...selected, key]) : [key] }))

  return (
    <>
      <AppHeader email={email} isAdmin={false} />
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center px-5 py-10">
        {finished ? (
          <Card><CardHeader><CardTitle>Practice complete</CardTitle><CardDescription>Your result is calculated from the questions you answered.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <p className="text-4xl font-bold">{saved ? saved.score : localScore} / {saved ? saved.total : questions.length}</p>
              {saving && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Saving your result…</p>}
              {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
              <div className="flex gap-3"><Button onClick={startExam}>Start another practice session</Button><Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>Back to dashboard</Link></div>
            </CardContent></Card>
        ) : !question ? (
          <Card><CardHeader><CardTitle>Practice exam</CardTitle><CardDescription>Questions come from the live Supabase question bank.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
              <div><Button onClick={startExam} disabled={loading}>{loading && <Loader2 className="animate-spin" aria-hidden="true" />} Start practice</Button></div>
            </CardContent></Card>
        ) : (
          <>
            <div className="mb-6"><Badge variant="outline">Question {current + 1} of {questions.length}</Badge><h1 className="mt-3 text-2xl font-bold">Technical readiness assessment</h1></div>
            <Progress value={((current + 1) / questions.length) * 100} className="mb-6" />
            <Card><CardHeader><CardDescription>{question.topic} · {question.type}</CardDescription><CardTitle>{question.question_text}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                {Object.entries(question.options).map(([key, value]) => <Button key={key} variant={selected.includes(key) ? 'default' : 'outline'} className="h-auto justify-start whitespace-normal py-2 text-left" aria-pressed={selected.includes(key)} onClick={() => choose(key)}>{key}. {value}</Button>)}
                <Separator />
                <div className="flex justify-between gap-3">
                  <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((n) => n - 1)}>Previous</Button>
                  {current === questions.length - 1 ? <Button onClick={finish}>Finish</Button> : <Button onClick={() => setCurrent((n) => n + 1)}>Next</Button>}
                </div>
              </CardContent></Card>
          </>
        )}
      </main>
    </>
  )
}

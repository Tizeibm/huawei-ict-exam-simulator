'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'
import { fetchQuestions, scoreQuestion, type Question } from '@/lib/exam-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

const supabase = createClient()

export default function Page() {
  const [session, setSession] = useState<{ email?: string } | null>(null)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [profileStatus, setProfileStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null>(null)
  const [message, setMessage] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string[]>>({})
  const [finished, setFinished] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }: { data: { session: Session | null } }) => {
      const nextSession = data.session
      setSession(nextSession?.user ? { email: nextSession.user.email } : null)
      if (nextSession?.user) {
        const { data: profile } = await supabase.from('profiles').select('status').eq('id', nextSession.user.id).maybeSingle()
        setProfileStatus(profile?.status ?? 'PENDING')
      } else {
        setProfileStatus(null)
      }
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, next: Session | null) => {
      setSession(next?.user ? { email: next.user.email } : null)
      if (!next?.user) setProfileStatus(null)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setMessage('')
    const result = authMode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`, data: { full_name: fullName.trim() } } })
    if (result.error) setMessage(result.error.message.includes('Invalid') ? 'Invalid email or password.' : result.error.message)
    else setMessage(authMode === 'signup' ? 'Check your email to confirm your account.' : 'Signed in.')
  }

  async function startExam() {
    setMessage('Loading questions…')
    try { const loaded = await fetchQuestions(supabase); setQuestions(loaded); setCurrent(0); setAnswers({}); setFinished(false); setMessage(loaded.length ? '' : 'The question bank is empty. An administrator must import questions before an exam can start.') }
    catch { setMessage('Questions could not be loaded. Please try again.') }
  }

  if (loading) return <main className="auth-stage"><p className="text-muted-foreground">Loading your session…</p></main>
  if (!session) return <main className="auth-stage"><Card className="w-full max-w-md"><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">ICT Prep</p><CardTitle>{authMode === 'signin' ? 'Welcome back' : 'Create your account'}</CardTitle><CardDescription>Real Supabase authentication for your Computing Track preparation.</CardDescription></CardHeader><CardContent><form onSubmit={submitAuth} className="flex flex-col gap-4">{authMode === 'signup' && <Input required minLength={2} type="text" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />}<Input required type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} /><Input required minLength={8} type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} /><Button type="submit">{authMode === 'signin' ? 'Sign in' : 'Sign up'}</Button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</form><Button variant="link" className="mt-3 px-0" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setMessage('') }}>{authMode === 'signin' ? 'Need an account?' : 'Already have an account?'}</Button></CardContent></Card></main>

  if (finished) { const score = questions.reduce((total, question, index) => total + (scoreQuestion(question, answers[index] ?? []) ? 1 : 0), 0); return <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-10"><Card><CardHeader><CardTitle>Practice complete</CardTitle><CardDescription>Your result is calculated from the questions you answered.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><p className="text-4xl font-bold">{score} / {questions.length}</p><Button onClick={startExam}>Start another practice session</Button></CardContent></Card></main> }
  if (!questions.length) return <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-10"><Card><CardHeader><CardTitle>{profileStatus === 'APPROVED' ? 'Candidate workspace' : 'Account under review'}</CardTitle><CardDescription>{session.email}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{profileStatus === 'APPROVED' ? <><p className="text-muted-foreground">Start a session using the live Supabase question bank. No sample questions or simulated attempts are used.</p><div className="flex gap-3"><Button onClick={startExam}>Start practice</Button><Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button></div></> : <><p className="text-muted-foreground">Your account is {profileStatus === 'REJECTED' ? 'not approved' : profileStatus === 'SUSPENDED' ? 'suspended' : 'pending administrator approval'}. You will be able to access practice exams once an administrator approves your account.</p><Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button></>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</CardContent></Card></main>

  const question = questions[current]; const selected = answers[current] ?? []; const choose = (key: string) => setAnswers((old) => ({ ...old, [current]: question.type === 'MULTIPLE' ? selected.includes(key) ? selected.filter((v) => v !== key) : [...selected, key] : [key] }))
  return <main className="mx-auto min-h-screen max-w-4xl px-5 py-10"><div className="mb-6 flex items-center justify-between"><div><Badge variant="outline">Question {current + 1} of {questions.length}</Badge><h1 className="mt-3 text-2xl font-bold">Technical readiness assessment</h1></div><Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button></div><Progress value={((current + 1) / questions.length) * 100} className="mb-6" /><Card><CardHeader><CardDescription>{question.topic} · {question.type}</CardDescription><CardTitle>{question.question_text}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">{Object.entries(question.options).map(([key, value]) => <Button key={key} variant={selected.includes(key) ? 'default' : 'outline'} className="justify-start whitespace-normal text-left" onClick={() => choose(key)}>{key}. {value}</Button>)}<div className="mt-4 flex justify-between gap-3"><Button variant="outline" disabled={current === 0} onClick={() => setCurrent((n) => n - 1)}>Previous</Button>{current === questions.length - 1 ? <Button onClick={() => setFinished(true)}>Finish</Button> : <Button onClick={() => setCurrent((n) => n + 1)}>Next</Button>}</div></CardContent></Card></main>
}

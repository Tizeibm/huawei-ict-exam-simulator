import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { canChangeRole, canChangeStatus, normalizeRole, normalizeStatus } from '@/lib/auth/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { blueprintShortages, countPool, type PoolItem } from '@/lib/exam/generate'
import { isExamReady, questionIssues } from '@/lib/exam/quality'
import { unpackAttemptRow } from '@/lib/exam-service'
import type { QuestionType, Topic } from '@/lib/exam/config'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let privileged
  try {
    privileged = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server service-role configuration is missing.' }, { status: 500 })
  }

  const [profilesRes, questionsRes, attemptsRes, authUsersRes] = await Promise.all([
    privileged.from('profiles').select('id, full_name, status, role, created_at, updated_at').order('created_at', { ascending: false }),
    privileged
      .from('questions')
      .select('id, topic, type, question_text, options, correct_answers, explanation')
      .limit(2000),
    privileged
      .from('exam_attempts')
      .select('id, user_id, score, total, details, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    privileged.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (profilesRes.error || questionsRes.error) {
    return NextResponse.json({ error: 'Unable to load administrator data.' }, { status: 500 })
  }

  const emailByUserId = new Map<string, { email: string; createdAt?: string; lastSignInAt?: string | null }>()
  if (authUsersRes.data?.users) {
    for (const u of authUsersRes.data.users) {
      emailByUserId.set(u.id, {
        email: u.email ?? '',
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      })
    }
  }

  const attemptsByUser = new Map<string, number>()
  for (const rawAtt of attemptsRes.data ?? []) {
    const att = unpackAttemptRow(rawAtt as Record<string, unknown>)
    if (att.status === 'SUBMITTED' || att.status === 'EXPIRED') {
      attemptsByUser.set(att.user_id, (attemptsByUser.get(att.user_id) ?? 0) + 1)
    }
  }

  const candidates = (profilesRes.data ?? []).map((p) => {
    const authInfo = emailByUserId.get(p.id)
    return {
      id: p.id,
      email: authInfo?.email ?? '',
      full_name: p.full_name ?? '',
      status: normalizeStatus(p.status),
      role: normalizeRole(p.role),
      created_at: p.created_at ?? authInfo?.createdAt ?? new Date().toISOString(),
      updated_at: p.updated_at ?? p.created_at,
      last_sign_in_at: authInfo?.lastSignInAt ?? null,
      attempts_count: attemptsByUser.get(p.id) ?? 0,
    }
  })

  const rawQuestions = questionsRes.data ?? []
  const questions = rawQuestions.map((q) => {
    const issues = questionIssues({
      topic: q.topic,
      type: q.type,
      question_text: q.question_text,
      options: q.options as Record<string, string> | null,
      correct_answers: q.correct_answers as string[] | null,
      explanation: q.explanation,
    })
    const ready = isExamReady({
      topic: q.topic,
      type: q.type,
      question_text: q.question_text,
      options: q.options as Record<string, string> | null,
      correct_answers: q.correct_answers as string[] | null,
      explanation: q.explanation,
    })
    return {
      id: q.id,
      topic: q.topic as Topic,
      type: q.type as QuestionType,
      question_text: q.question_text,
      options: (q.options ?? {}) as Record<string, string>,
      correct_answers: (q.correct_answers ?? []) as string[],
      explanation: q.explanation ?? '',
      issues,
      examReady: ready,
    }
  })

  const readyPool: PoolItem[] = questions
    .filter((q) => q.examReady)
    .map((q) => ({ id: q.id, topic: q.topic, type: q.type }))

  const poolCounts = countPool(readyPool)
  const shortages = blueprintShortages(readyPool)

  return NextResponse.json({
    candidates,
    questions,
    poolCounts,
    shortages,
    qualitySummary: {
      totalQuestions: questions.length,
      examReadyCount: readyPool.length,
      structuralIssueCount: questions.filter((q) => !q.examReady).length,
      missingExplanationCount: questions.filter((q) => q.issues.includes('Missing explanation')).length,
      fullExamReady: shortages.length === 0,
    },
    currentUserId: auth.user.id,
  })
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as {
    id?: unknown
    status?: unknown
    role?: unknown
    full_name?: unknown
  } | null

  if (typeof body?.id !== 'string' || !body.id.trim()) {
    return NextResponse.json({ error: 'Target user ID is required.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status !== undefined) {
    if (typeof body.status !== 'string') {
      return NextResponse.json({ error: 'Invalid account status.' }, { status: 400 })
    }
    const nextStatus = body.status.toUpperCase()
    if (!canChangeStatus(auth.profile, auth.user.id, body.id, nextStatus)) {
      return NextResponse.json(
        { error: auth.user.id === body.id ? 'You cannot suspend or reject your own administrator account.' : 'This status change is not permitted.' },
        { status: 403 },
      )
    }
    updates.status = nextStatus
  }

  if (body.role !== undefined) {
    if (typeof body.role !== 'string') {
      return NextResponse.json({ error: 'Invalid role value.' }, { status: 400 })
    }
    const nextRole = body.role.toLowerCase()
    if (!canChangeRole(auth.profile, auth.user.id, body.id, nextRole)) {
      return NextResponse.json(
        { error: auth.user.id === body.id ? 'You cannot demote your own administrator account.' : 'This role assignment is not permitted.' },
        { status: 403 },
      )
    }
    updates.role = nextRole
  }

  if (body.full_name !== undefined) {
    if (typeof body.full_name !== 'string' || body.full_name.trim().length < 2) {
      return NextResponse.json({ error: 'Full name must be at least 2 characters.' }, { status: 400 })
    }
    updates.full_name = body.full_name.trim().slice(0, 120)
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'No valid update fields provided.' }, { status: 400 })
  }

  const { error } = await createAdminClient().from('profiles').update(updates).eq('id', body.id)
  if (error) {
    return NextResponse.json({ error: 'Unable to update user profile.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: body.id, updates })
}

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  AlertCircle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileJson,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { AccountRole, AccountStatus } from '@/lib/auth/access'
import {
  blueprintTopicTotal,
  blueprintTotal,
  FULL_BLUEPRINT,
  QUESTION_TYPES,
  TOPIC_LABELS,
  TOPICS,
  TYPE_LABELS,
  type QuestionType,
  type Topic,
} from '@/lib/exam/config'
import type { Shortage } from '@/lib/exam/generate'
import { buildImportPreview, type ImportPreviewItem } from '@/lib/question-import'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface AdminCandidate {
  id: string
  email: string
  full_name: string
  status: AccountStatus
  role: AccountRole
  created_at: string
  updated_at?: string
  last_sign_in_at?: string | null
  attempts_count: number
}

interface AdminQuestion {
  id: string
  topic: Topic
  type: QuestionType
  question_text: string
  options: Record<string, string>
  correct_answers: string[]
  explanation: string
  created_at?: string
  issues: string[]
  examReady: boolean
}

interface QualitySummary {
  totalQuestions: number
  examReadyCount: number
  structuralIssueCount: number
  missingExplanationCount: number
  fullExamReady: boolean
}

type MainTab = 'users' | 'questions' | 'import' | 'blueprint'

const SAMPLE_IMPORT_JSON = JSON.stringify(
  {
    questions: [
      {
        topic: 'OPENEULER',
        type: 'SINGLE',
        question_text: 'Which command displays the current kernel release version in openEuler?',
        options: {
          A: 'uname -r',
          B: 'lsblk -f',
          C: 'systemctl status',
          D: 'ip addr show',
        },
        correct_answers: ['A'],
        explanation: 'The `uname -r` command prints the operating system kernel release version.',
      },
      {
        topic: 'OPENGAUSS',
        type: 'BOOLEAN',
        question_text: 'In openGauss, MVCC (Multi-Version Concurrency Control) allows readers to access consistent snapshots without blocking writers.',
        options: {
          A: 'True',
          B: 'False',
        },
        correct_answers: ['A'],
        explanation: 'openGauss uses MVCC so read transactions do not block write transactions.',
      },
    ],
  },
  null,
  2,
)

export function AdminConsole() {
  const [candidates, setCandidates] = useState<AdminCandidate[]>([])
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [poolCounts, setPoolCounts] = useState<Record<Topic, Record<QuestionType, number>> | null>(null)
  const [bankCounts, setBankCounts] = useState<Record<string, number>>({})
  const [shortages, setShortages] = useState<Shortage[]>([])
  const [qualitySummary, setQualitySummary] = useState<QualitySummary | null>(null)
  const [me, setMe] = useState('')
  const [tab, setTab] = useState<MainTab>('users')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // User Management state
  const [userSearch, setUserSearch] = useState('')
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | AccountStatus>('ALL')
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | AccountRole>('ALL')
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [newUser, setNewUser] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'candidate' as AccountRole,
    status: 'APPROVED' as AccountStatus,
  })
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  // Question Bank state
  const [questionSearch, setQuestionSearch] = useState('')
  const [topicFilter, setTopicFilter] = useState<'ALL' | Topic>('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | QuestionType>('ALL')
  const [qualityFilter, setQualityFilter] = useState<'ALL' | 'READY' | 'ISSUES' | 'NO_EXPLANATION'>('ALL')
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<{
    id?: string
    topic: Topic
    type: QuestionType
    question_text: string
    options: Record<string, string>
    correct_answers: string[]
    explanation: string
  } | null>(null)
  const [savingQuestion, setSavingQuestion] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Question Import state
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; content: unknown }[]>([])
  const [rawJsonPaste, setRawJsonPaste] = useState('')
  const [fileParseErrors, setFileParseErrors] = useState<{ file: string; message: string }[]>([])
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'VALID' | 'INVALID' | 'DUPLICATE'>('ALL')
  const [importing, setImporting] = useState(false)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/overview')
      if (!response.ok) {
        setFeedback({ kind: 'error', text: 'Administrator data could not be loaded.' })
        setLoading(false)
        return
      }
      const data = await response.json()
      setCandidates(data.candidates ?? [])
      setQuestions(data.questions ?? [])
      setPoolCounts(data.poolCounts ?? null)
      setBankCounts(data.bankCounts ?? {})
      setShortages(data.shortages ?? [])
      setQualitySummary(data.qualitySummary ?? null)
      setMe(data.currentUserId ?? '')
    } catch {
      setFeedback({ kind: 'error', text: 'Network error while loading administrator console.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  // User Actions
  async function handleUpdateUser(id: string, patch: { status?: AccountStatus; role?: AccountRole }) {
    setFeedback(null)
    setBusyUserId(id)
    try {
      const response = await fetch('/api/admin/overview', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ kind: 'error', text: result.error ?? 'Unable to update user account.' })
        return
      }
      setCandidates((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                status: patch.status ?? item.status,
                role: patch.role ?? item.role,
              }
            : item,
        ),
      )
      setFeedback({
        kind: 'success',
        text: patch.status
          ? `Account status updated to ${patch.status}.`
          : `Account role updated to ${patch.role}.`,
      })
    } finally {
      setBusyUserId(null)
    }
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    setFeedback(null)
    setCreatingUser(true)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ kind: 'error', text: result.error ?? 'Unable to create user account.' })
        return
      }
      setCandidates((prev) => [result.user, ...prev])
      setNewUser({ full_name: '', email: '', password: '', role: 'candidate', status: 'APPROVED' })
      setShowCreateUser(false)
      setFeedback({
        kind: 'success',
        text: `Created account for ${result.user.email} (${result.user.role}, ${result.user.status}).`,
      })
    } finally {
      setCreatingUser(false)
    }
  }

  // Question Actions
  function openCreateQuestionModal() {
    setEditingQuestion({
      topic: 'OPENEULER',
      type: 'SINGLE',
      question_text: '',
      options: { A: '', B: '', C: '', D: '' },
      correct_answers: ['A'],
      explanation: '',
    })
  }

  function openEditQuestionModal(q: AdminQuestion) {
    setEditingQuestion({
      id: q.id,
      topic: q.topic,
      type: q.type,
      question_text: q.question_text,
      options: { ...q.options },
      correct_answers: [...q.correct_answers],
      explanation: q.explanation,
    })
  }

  function handleQuestionTypeChange(nextType: QuestionType) {
    if (!editingQuestion) return
    if (nextType === 'BOOLEAN') {
      setEditingQuestion({
        ...editingQuestion,
        type: 'BOOLEAN',
        options: { A: editingQuestion.options.A || 'True', B: editingQuestion.options.B || 'False' },
        correct_answers: ['A'],
      })
    } else if (nextType === 'SINGLE') {
      const nextOpts = Object.keys(editingQuestion.options).length >= 4
        ? editingQuestion.options
        : { A: editingQuestion.options.A || '', B: editingQuestion.options.B || '', C: '', D: '' }
      setEditingQuestion({
        ...editingQuestion,
        type: 'SINGLE',
        options: nextOpts,
        correct_answers: editingQuestion.correct_answers.slice(0, 1),
      })
    } else {
      const nextOpts = Object.keys(editingQuestion.options).length >= 4
        ? editingQuestion.options
        : { A: editingQuestion.options.A || '', B: editingQuestion.options.B || '', C: '', D: '' }
      setEditingQuestion({
        ...editingQuestion,
        type: 'MULTIPLE',
        options: nextOpts,
        correct_answers:
          editingQuestion.correct_answers.length >= 2 ? editingQuestion.correct_answers : ['A', 'B'],
      })
    }
  }

  async function handleSaveQuestion(e: FormEvent) {
    e.preventDefault()
    if (!editingQuestion) return
    setFeedback(null)
    setSavingQuestion(true)
    try {
      const isEdit = Boolean(editingQuestion.id)
      const url = isEdit ? `/api/admin/questions/${editingQuestion.id}` : '/api/admin/questions'
      const method = isEdit ? 'PATCH' : 'POST'
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: editingQuestion.topic,
          type: editingQuestion.type,
          question_text: editingQuestion.question_text,
          options: editingQuestion.options,
          correct_answers: editingQuestion.correct_answers,
          explanation: editingQuestion.explanation,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ kind: 'error', text: result.error ?? 'Unable to save question.' })
        return
      }
      setEditingQuestion(null)
      setFeedback({
        kind: 'success',
        text: isEdit ? 'Question updated and re-validated.' : 'New question added to the question bank.',
      })
      await loadOverview()
    } finally {
      setSavingQuestion(false)
    }
  }

  async function handleDeleteQuestion(id: string) {
    setFeedback(null)
    setDeletingId(id)
    try {
      const response = await fetch(`/api/admin/questions/${id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ kind: 'error', text: result.error ?? 'Unable to delete question.' })
        return
      }
      setConfirmDeleteId(null)
      setFeedback({ kind: 'success', text: 'Question removed from the question bank.' })
      await loadOverview()
    } finally {
      setDeletingId(null)
    }
  }

  // Import Actions
  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    setFeedback(null)
    const parsedFiles: { name: string; content: unknown }[] = []
    const parseErrs: { file: string; message: string }[] = []

    for (const file of Array.from(fileList)) {
      try {
        const text = await file.text()
        const json = JSON.parse(text)
        parsedFiles.push({ name: file.name, content: json })
      } catch {
        parseErrs.push({ file: file.name, message: 'File is not valid JSON syntax.' })
      }
    }

    setUploadedFiles((prev) => [...prev, ...parsedFiles])
    setFileParseErrors((prev) => [...prev, ...parseErrs])
    e.target.value = ''
  }

  function handleParseRawJson() {
    if (!rawJsonPaste.trim()) return
    setFeedback(null)
    try {
      const json = JSON.parse(rawJsonPaste)
      setUploadedFiles((prev) => [...prev, { name: `pasted-batch-${prev.length + 1}.json`, content: json }])
      setRawJsonPaste('')
    } catch {
      setFeedback({ kind: 'error', text: 'Pasted content is not valid JSON syntax.' })
    }
  }

  const importPreview = useMemo(() => {
    return buildImportPreview(uploadedFiles, questions)
  }, [uploadedFiles, questions])

  const filteredPreviewItems = useMemo(() => {
    return importPreview.items.filter((item) => {
      if (previewFilter === 'VALID') return item.valid && !item.duplicateInBank
      if (previewFilter === 'INVALID') return !item.valid
      if (previewFilter === 'DUPLICATE') return item.duplicateInBank || item.duplicateInBatch
      return true
    })
  }, [importPreview.items, previewFilter])

  async function handleExecuteImport() {
    const validCandidates = importPreview.items.filter(
      (item: ImportPreviewItem) => item.valid && (!item.duplicateInBank || !skipDuplicates),
    )
    if (validCandidates.length === 0) {
      setFeedback({ kind: 'error', text: 'No valid non-duplicate questions to import.' })
      return
    }

    setImporting(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/admin/questions/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          skipDuplicates,
          duplicate_strategy: skipDuplicates ? 'SKIP' : 'CANCEL',
          metadata: {
            bank_id: `${validCandidates[0].track}_${validCandidates[0].round_suitability[0]}`,
            track: validCandidates[0].track,
            round: validCandidates[0].round_suitability[0],
            language: validCandidates[0].language,
            total_questions: validCandidates.length,
            schema_version: '1.0',
          },
          questions: validCandidates.map((q) => ({
            external_id: q.external_id,
            track: q.track,
            certification_level: q.certification_level,
            technology: q.technology,
            topic: q.topic,
            round_suitability: q.round_suitability,
            difficulty: q.difficulty,
            type: q.type,
            language: q.language,
            question_text: q.question_text,
            options: q.options,
            correct_answers: q.correct_answers,
            explanation: q.explanation,
            source_type: 'DOCUMENT',
            source_reference: q.sourceFile,
            review_status: 'DRAFT',
            tags: [],
            version: 1,
          })),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ kind: 'error', text: result.detail ? `${result.error ?? 'Question import failed.'} ${result.detail}` : result.error ?? 'Question import failed.' })
        return
      }
      setUploadedFiles([])
      setFileParseErrors([])
      setFeedback({
        kind: 'success',
        text: `Imported ${result.imported} question(s) into the bank${
          result.skippedDuplicates ? ` (${result.skippedDuplicates} existing duplicate(s) skipped)` : ''
        }.`,
      })
      await loadOverview()
      setTab('questions')
    } finally {
      setImporting(false)
    }
  }

  // Filtered lists
  const filteredCandidates = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    return candidates.filter((c) => {
      if (userStatusFilter !== 'ALL' && c.status !== userStatusFilter) return false
      if (userRoleFilter !== 'ALL' && c.role !== userRoleFilter) return false
      if (!q) return true
      return (
        c.full_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q)
      )
    })
  }, [candidates, userSearch, userStatusFilter, userRoleFilter])

  const filteredQuestions = useMemo(() => {
    const q = questionSearch.trim().toLowerCase()
    return questions.filter((item) => {
      if (topicFilter !== 'ALL' && item.topic !== topicFilter) return false
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false
      if (qualityFilter === 'READY' && !item.examReady) return false
      if (qualityFilter === 'ISSUES' && item.examReady) return false
      if (qualityFilter === 'NO_EXPLANATION' && !item.issues.includes('Missing explanation')) return false
      if (!q) return true
      return (
        item.question_text.toLowerCase().includes(q) ||
        item.explanation.toLowerCase().includes(q)
      )
    })
  }, [questions, questionSearch, topicFilter, typeFilter, qualityFilter])

  const countStatus = (s: AccountStatus) => candidates.filter((c) => c.status === s).length

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Header Banner */}
      <section className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="uppercase tracking-wider text-[10px]">
              Platform Administration
            </Badge>
            <Badge variant="outline" className="text-xs">
              Full Candidate Access Enabled
            </Badge>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Administrator Console</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage user approvals, curate the four track and round question banks, review imports, and configure credible examination practice under your own profile.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={loadOverview} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </Button>
          <Link href="/dashboard" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            My Candidate Dashboard
          </Link>
          <Link href="/exam" className={buttonVariants({ size: 'sm' })}>
            <BookOpenCheck className="size-4" />
            <span>Take Practice / Full Exam</span>
          </Link>
        </div>
      </section>

      {/* Top KPI Cards */}
      <section aria-label="Platform metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="metric-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Registered Accounts</span>
              <Users className="size-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums">{candidates.length}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-amber-700 dark:text-amber-400">{countStatus('PENDING')} Pending</span>
            <span>·</span>
            <span className="font-medium text-emerald-700 dark:text-emerald-400">{countStatus('APPROVED')} Approved</span>
            <span>·</span>
            <span>{countStatus('REJECTED') + countStatus('SUSPENDED')} Blocked</span>
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Question Bank Size</span>
              <FileJson className="size-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums">
              {qualitySummary ? `${qualitySummary.examReadyCount} / ${qualitySummary.totalQuestions}` : questions.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {qualitySummary ? (
              <span>
                {qualitySummary.examReadyCount} exam-ready · {qualitySummary.missingExplanationCount} without explanation
              </span>
            ) : (
              <span>Total questions stored in Supabase</span>
            )}
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Full-Exam Blueprint (60 Q)</span>
              {shortages.length === 0 && questions.length >= 60 ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <AlertCircle className="size-4 text-amber-600" />
              )}
            </CardDescription>
            <CardTitle className="text-2xl font-bold">
              {shortages.length === 0 && (qualitySummary?.examReadyCount ?? 0) >= blueprintTotal()
                ? 'Ready'
                : `${shortages.length} Shortage(s)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {shortages.length === 0 && (qualitySummary?.examReadyCount ?? 0) >= blueprintTotal()
              ? 'All 9 technology × type cells satisfy the 60-question blueprint.'
              : 'Click "Blueprint & Quality" to inspect missing topic/type slots.'}
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Data Quality Health</span>
              <Shield className="size-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums">
              {qualitySummary?.structuralIssueCount === 0 ? '100% Valid' : `${qualitySummary?.structuralIssueCount ?? 0} Issue(s)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Strict option & answer-key integrity validation
          </CardContent>
        </Card>
      </section>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-sm ${
            feedback.kind === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.kind === 'error' ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="rounded-md p-1 hover:bg-black/5"
            aria-label="Dismiss message"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" role="tablist" aria-label="Administration sections">
        <div className="flex flex-wrap gap-2">
          <Button
            role="tab"
            aria-selected={tab === 'users'}
            variant={tab === 'users' ? 'default' : 'outline'}
            onClick={() => setTab('users')}
          >
            <Users className="size-4" />
            <span>User Management ({candidates.length})</span>
            {countStatus('PENDING') > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {countStatus('PENDING')}
              </span>
            )}
          </Button>

          <Button
            role="tab"
            aria-selected={tab === 'questions'}
            variant={tab === 'questions' ? 'default' : 'outline'}
            onClick={() => setTab('questions')}
          >
            <FileJson className="size-4" />
            <span>Question Bank ({questions.length})</span>
          </Button>

          <Button
            role="tab"
            aria-selected={tab === 'import'}
            variant={tab === 'import' ? 'default' : 'outline'}
            onClick={() => setTab('import')}
          >
            <Upload className="size-4" />
            <span>Import JSON Questions</span>
          </Button>

          <Button
            role="tab"
            aria-selected={tab === 'blueprint'}
            variant={tab === 'blueprint' ? 'default' : 'outline'}
            onClick={() => setTab('blueprint')}
          >
            <Filter className="size-4" />
            <span>Blueprint & Quality Matrix</span>
          </Button>
        </div>
      </div>

      {/* TAB 1: USER MANAGEMENT */}
      {tab === 'users' && (
        <section className="flex flex-col gap-5" role="tabpanel">
          <Card>
            <CardHeader className="flex flex-col gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-bold">User Accounts & Access Control</CardTitle>
                <CardDescription>
                  Approve or reject access requests, manage roles, or create pre-approved accounts directly. Passwords are never visible.
                </CardDescription>
              </div>
              <Button onClick={() => setShowCreateUser((v) => !v)}>
                <UserPlus className="size-4" />
                <span>{showCreateUser ? 'Close Account Form' : 'Create User Account'}</span>
              </Button>
            </CardHeader>

            {/* Create User Form */}
            {showCreateUser && (
              <div className="border-b bg-accent/30 p-5">
                <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                      Create New User Account (Server-Side Admin Auth)
                    </h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" htmlFor="new-user-name">Full Name</label>
                      <Input
                        id="new-user-name"
                        required
                        minLength={2}
                        placeholder="e.g. Jean-Pierre Kamga"
                        value={newUser.full_name}
                        onChange={(e) => setNewUser((s) => ({ ...s, full_name: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" htmlFor="new-user-email">Email Address</label>
                      <Input
                        id="new-user-email"
                        type="email"
                        required
                        placeholder="candidate@example.com"
                        value={newUser.email}
                        onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" htmlFor="new-user-password">Initial Password</label>
                      <Input
                        id="new-user-password"
                        type="password"
                        required
                        minLength={8}
                        placeholder="Min. 8 characters"
                        value={newUser.password}
                        onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" htmlFor="new-user-role">Role</label>
                      <select
                        id="new-user-role"
                        className="h-8 rounded-lg border border-input bg-card px-2.5 text-sm"
                        value={newUser.role}
                        onChange={(e) => setNewUser((s) => ({ ...s, role: e.target.value as AccountRole }))}
                      >
                        <option value="candidate">Candidate</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" htmlFor="new-user-status">Initial Status</label>
                      <select
                        id="new-user-status"
                        className="h-8 rounded-lg border border-input bg-card px-2.5 text-sm"
                        value={newUser.status}
                        onChange={(e) => setNewUser((s) => ({ ...s, status: e.target.value as AccountStatus }))}
                      >
                        <option value="APPROVED">APPROVED (Immediate access)</option>
                        <option value="PENDING">PENDING</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setShowCreateUser(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creatingUser}>
                      {creatingUser && <Loader2 className="size-4 animate-spin" />}
                      <span>Create Account</span>
                    </Button>
                  </div>
                </form>
              </div>
            )}

            <CardContent className="flex flex-col gap-4 pt-4">
              {/* Search and Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-60">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search users by full name or email…"
                    className="pl-8"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    aria-label="Search users"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
                    {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setUserStatusFilter(status)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          userStatusFilter === status
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {status === 'ALL' ? `All (${candidates.length})` : `${status} (${countStatus(status)})`}
                      </button>
                    ))}
                  </div>

                  <select
                    aria-label="Filter by role"
                    className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs font-medium"
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value as 'ALL' | AccountRole)}
                  >
                    <option value="ALL">All Roles</option>
                    <option value="candidate">Candidates Only</option>
                    <option value="admin">Administrators Only</option>
                  </select>
                </div>
              </div>

              {/* Users List */}
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Loading registered accounts…</span>
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                  No user accounts match the current search and filter criteria.
                </div>
              ) : (
                <div className="divide-y rounded-xl border">
                  {filteredCandidates.map((candidate) => {
                    const isSelf = candidate.id === me
                    const isBusy = busyUserId === candidate.id
                    return (
                      <div
                        key={candidate.id}
                        className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {candidate.full_name || 'Unnamed User'}
                            </span>
                            {isSelf && <Badge variant="outline">You</Badge>}
                            <Badge variant={candidate.role === 'admin' ? 'default' : 'secondary'}>
                              {candidate.role}
                            </Badge>
                            <Badge
                              variant={
                                candidate.status === 'APPROVED'
                                  ? 'default'
                                  : candidate.status === 'PENDING'
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {candidate.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {candidate.email && <span className="font-medium text-foreground/80">{candidate.email}</span>}
                            <span>Registered {new Date(candidate.created_at).toLocaleDateString()}</span>
                            {candidate.last_sign_in_at && (
                              <span>Last sign-in {new Date(candidate.last_sign_in_at).toLocaleDateString()}</span>
                            )}
                            <span>{candidate.attempts_count} completed exam(s)</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground" title="Administrators cannot suspend or demote their own active account">
                              Protected (Current Admin)
                            </span>
                          ) : (
                            <>
                              <select
                                aria-label={`Role for ${candidate.full_name || candidate.email}`}
                                disabled={isBusy}
                                value={candidate.role}
                                onChange={(e) =>
                                  handleUpdateUser(candidate.id, { role: e.target.value as AccountRole })
                                }
                                className="h-7 rounded-md border border-input bg-card px-2 text-xs font-medium"
                              >
                                <option value="candidate">Role: Candidate</option>
                                <option value="admin">Role: Admin</option>
                              </select>

                              {candidate.status !== 'APPROVED' && (
                                <Button
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => handleUpdateUser(candidate.id, { status: 'APPROVED' })}
                                >
                                  {candidate.status === 'PENDING' ? 'Approve' : 'Reinstate'}
                                </Button>
                              )}

                              {candidate.status === 'PENDING' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => handleUpdateUser(candidate.id, { status: 'REJECTED' })}
                                >
                                  Reject
                                </Button>
                              )}

                              {candidate.status === 'APPROVED' && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={isBusy}
                                  onClick={() => handleUpdateUser(candidate.id, { status: 'SUSPENDED' })}
                                >
                                  Suspend
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* TAB 2: QUESTION BANK */}
      {tab === 'questions' && (
        <section className="flex flex-col gap-5" role="tabpanel">
          <Card>
            <CardHeader className="flex flex-col gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Question Bank Browser & Editor</CardTitle>
                <CardDescription>
                  Search, filter by technology and question type, inspect answer keys, or create, edit, and delete individual questions.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setTab('import')}>
                  <Upload className="size-4" />
                  <span>Bulk JSON Import</span>
                </Button>
                <Button onClick={openCreateQuestionModal}>
                  <Plus className="size-4" />
                  <span>Add Question</span>
                </Button>
              </div>
            </CardHeader>

            {/* Create / Edit Question Form */}
            {editingQuestion && (
              <div className="border-b bg-accent/30 p-5">
                <form onSubmit={handleSaveQuestion} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                      {editingQuestion.id ? 'Edit Question' : 'Create New Question'}
                    </h3>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => setEditingQuestion(null)}>
                      <X className="size-4" />
                    </Button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" htmlFor="q-topic">Technology Track</label>
                      <select
                        id="q-topic"
                        className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
                        value={editingQuestion.topic}
                        onChange={(e) =>
                          setEditingQuestion({ ...editingQuestion, topic: e.target.value as Topic })
                        }
                      >
                        {TOPICS.map((t) => (
                          <option key={t} value={t}>
                            {TOPIC_LABELS[t]} ({t})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium" htmlFor="q-type">Question Type</label>
                      <select
                        id="q-type"
                        className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
                        value={editingQuestion.type}
                        onChange={(e) => handleQuestionTypeChange(e.target.value as QuestionType)}
                      >
                        {QUESTION_TYPES.map((qt) => (
                          <option key={qt} value={qt}>
                            {TYPE_LABELS[qt]} ({qt})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" htmlFor="q-text">Question Prompt</label>
                    <textarea
                      id="q-text"
                      required
                      rows={3}
                      className="rounded-lg border border-input bg-card p-3 text-sm"
                      placeholder="Enter the complete question text…"
                      value={editingQuestion.question_text}
                      onChange={(e) =>
                        setEditingQuestion({ ...editingQuestion, question_text: e.target.value })
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        Answer Options & Correct Key(s) ({editingQuestion.type === 'MULTIPLE' ? 'Select 2 or more' : 'Select exactly 1'})
                      </span>
                      {editingQuestion.type !== 'BOOLEAN' && Object.keys(editingQuestion.options).length < 6 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            const nextLetter = String.fromCharCode(65 + Object.keys(editingQuestion.options).length)
                            setEditingQuestion({
                              ...editingQuestion,
                              options: { ...editingQuestion.options, [nextLetter]: '' },
                            })
                          }}
                        >
                          + Add Option
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {Object.entries(editingQuestion.options).map(([key, val]) => {
                        const isChecked = editingQuestion.correct_answers.includes(key)
                        return (
                          <div key={key} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (editingQuestion.type === 'MULTIPLE') {
                                  const next = isChecked
                                    ? editingQuestion.correct_answers.filter((k) => k !== key)
                                    : [...editingQuestion.correct_answers, key]
                                  setEditingQuestion({ ...editingQuestion, correct_answers: next })
                                } else {
                                  setEditingQuestion({ ...editingQuestion, correct_answers: [key] })
                                }
                              }}
                              className={`flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                                isChecked
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'bg-secondary text-muted-foreground'
                              }`}
                              title={isChecked ? 'Marked as Correct Answer' : 'Click to mark as Correct Answer'}
                            >
                              {key}
                            </button>
                            <Input
                              required
                              value={val}
                              placeholder={`Option ${key} text`}
                              onChange={(e) =>
                                setEditingQuestion({
                                  ...editingQuestion,
                                  options: { ...editingQuestion.options, [key]: e.target.value },
                                })
                              }
                            />
                            {editingQuestion.type !== 'BOOLEAN' && Object.keys(editingQuestion.options).length > 2 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => {
                                  const copy = { ...editingQuestion.options }
                                  delete copy[key]
                                  setEditingQuestion({
                                    ...editingQuestion,
                                    options: copy,
                                    correct_answers: editingQuestion.correct_answers.filter((k) => k !== key),
                                  })
                                }}
                                aria-label={`Remove option ${key}`}
                              >
                                <X className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium" htmlFor="q-exp">Explanation (Shown in Practice & Post-Exam Review)</label>
                    <textarea
                      id="q-exp"
                      rows={2}
                      className="rounded-lg border border-input bg-card p-3 text-sm"
                      placeholder="Explain why the correct answer is right…"
                      value={editingQuestion.explanation}
                      onChange={(e) =>
                        setEditingQuestion({ ...editingQuestion, explanation: e.target.value })
                      }
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditingQuestion(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={savingQuestion}>
                      {savingQuestion && <Loader2 className="size-4 animate-spin" />}
                      <span>{editingQuestion.id ? 'Save Changes' : 'Create Question'}</span>
                    </Button>
                  </div>
                </form>
              </div>
            )}

            <CardContent className="flex flex-col gap-4 pt-4">
              {/* Question Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-60">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search questions or explanations…"
                    className="pl-8"
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                    aria-label="Search questions"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Filter by technology"
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

                  <select
                    aria-label="Filter by question type"
                    className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs font-medium"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as 'ALL' | QuestionType)}
                  >
                    <option value="ALL">All Types</option>
                    {QUESTION_TYPES.map((qt) => (
                      <option key={qt} value={qt}>
                        {TYPE_LABELS[qt]}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter by quality"
                    className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs font-medium"
                    value={qualityFilter}
                    onChange={(e) =>
                      setQualityFilter(e.target.value as 'ALL' | 'READY' | 'ISSUES' | 'NO_EXPLANATION')
                    }
                  >
                    <option value="ALL">All Quality States</option>
                    <option value="READY">Exam Ready Only</option>
                    <option value="ISSUES">Structural Issues</option>
                    <option value="NO_EXPLANATION">Missing Explanation</option>
                  </select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Showing {filteredQuestions.length} of {questions.length} question(s)
              </p>

              {/* Questions List */}
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Loading question bank…</span>
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                  {questions.length === 0
                    ? 'No questions imported yet. Switch to the "Import JSON Questions" tab or click "Add Question" above.'
                    : 'No questions match the active filters.'}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredQuestions.map((question) => {
                    const isExpanded = expandedQuestionId === question.id
                    const isConfirmingDelete = confirmDeleteId === question.id
                    return (
                      <div key={question.id} className="rounded-xl border bg-card p-4 transition-colors">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="default">{TOPIC_LABELS[question.topic] ?? question.topic}</Badge>
                            <Badge variant="secondary">{TYPE_LABELS[question.type] ?? question.type}</Badge>
                            {question.examReady ? (
                              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                                Exam Ready
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Structural Issue</Badge>
                            )}
                            {question.issues.map((issue) => (
                              <Badge key={issue} variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                                {issue}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setExpandedQuestionId(isExpanded ? null : question.id)}
                            >
                              {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                              <span>{isExpanded ? 'Hide Details' : 'Inspect'}</span>
                            </Button>
                            <Button variant="outline" size="xs" onClick={() => openEditQuestionModal(question)}>
                              <Edit3 className="size-3" />
                              <span>Edit</span>
                            </Button>
                            {isConfirmingDelete ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="destructive"
                                  size="xs"
                                  disabled={deletingId === question.id}
                                  onClick={() => handleDeleteQuestion(question.id)}
                                >
                                  {deletingId === question.id ? 'Deleting…' : 'Confirm Delete'}
                                </Button>
                                <Button variant="ghost" size="xs" onClick={() => setConfirmDeleteId(null)}>
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="xs"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setConfirmDeleteId(question.id)}
                              >
                                <Trash2 className="size-3" />
                                <span>Delete</span>
                              </Button>
                            )}
                          </div>
                        </div>

                        <p className="mt-2.5 text-sm font-medium leading-relaxed text-foreground">
                          {question.question_text}
                        </p>

                        {isExpanded && (
                          <div className="mt-4 flex flex-col gap-3 border-t pt-3 text-sm">
                            <div className="grid gap-2 sm:grid-cols-2">
                              {Object.entries(question.options).map(([key, text]) => {
                                const isCorrectOpt = question.correct_answers.includes(key)
                                return (
                                  <div
                                    key={key}
                                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs ${
                                      isCorrectOpt
                                        ? 'border-emerald-500/50 bg-emerald-500/10 font-semibold text-emerald-900 dark:text-emerald-200'
                                        : 'bg-muted/30 text-muted-foreground'
                                    }`}
                                  >
                                    <span className="font-bold">{key}.</span>
                                    <span className="flex-1">{text}</span>
                                    {isCorrectOpt && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="rounded-lg bg-muted/50 p-3 text-xs">
                              <span className="font-semibold text-foreground">Explanation: </span>
                              <span className="text-muted-foreground">
                                {question.explanation || 'No explanation provided.'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* TAB 3: QUESTION IMPORT */}
      {tab === 'import' && (
        <section className="flex flex-col gap-5" role="tabpanel">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold">Multi-File JSON Question Import & Validation</CardTitle>
                  <CardDescription>
                    Upload one or multiple JSON files, inspect validation results and duplicate candidates, and import valid questions into Supabase.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRawJsonPaste(SAMPLE_IMPORT_JSON)
                  }}
                >
                  Load Sample JSON Format
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-6 pt-5">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* File Upload Box */}
                <div className="flex flex-col justify-between gap-4 rounded-xl border border-dashed bg-muted/20 p-5">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold">1. Select One or Multiple JSON Files</span>
                    <p className="text-xs text-muted-foreground">
                      Each file can contain `{`{ "questions": [...] }`}` or a direct JSON array `[...]` of question objects.
                    </p>
                  </div>

                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border bg-card py-8 text-center transition-colors hover:border-primary hover:bg-accent/30">
                    <Upload className="size-7 text-primary" />
                    <span className="text-sm font-medium text-primary">Click to choose .json file(s)</span>
                    <span className="text-xs text-muted-foreground">Supports selecting multiple files at once</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      multiple
                      onChange={handleFilesSelected}
                      className="sr-only"
                    />
                  </label>

                  {uploadedFiles.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
                      <span className="font-medium">
                        {uploadedFiles.length} file(s) loaded: {uploadedFiles.map((f) => f.name).join(', ')}
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setUploadedFiles([])
                          setFileParseErrors([])
                        }}
                      >
                        Clear All
                      </Button>
                    </div>
                  )}
                </div>

                {/* Paste JSON Box */}
                <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">2. Or Paste JSON Payload Directly</span>
                  </div>
                  <textarea
                    rows={6}
                    value={rawJsonPaste}
                    onChange={(e) => setRawJsonPaste(e.target.value)}
                    placeholder='{"questions": [{"topic": "OPENEULER", "type": "SINGLE", ...}]}'
                    className="w-full rounded-lg border bg-card p-3 font-mono text-xs"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!rawJsonPaste.trim()}
                      onClick={handleParseRawJson}
                    >
                      Validate & Add to Preview
                    </Button>
                  </div>
                </div>
              </div>

              {/* File-level parse errors */}
              {[...fileParseErrors, ...importPreview.fileErrors].length > 0 && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
                  <p className="font-bold">File Format Errors:</p>
                  <ul className="mt-1 list-disc pl-4">
                    {[...fileParseErrors, ...importPreview.fileErrors].map((fe, idx) => (
                      <li key={idx}>
                        <strong>{fe.file}:</strong> {fe.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview & Summary Section */}
              {importPreview.items.length > 0 && (
                <div className="flex flex-col gap-4 border-t pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold">Validation & Duplicate Preview</h3>
                      <p className="text-xs text-muted-foreground">
                        Review parsed questions before committing them to the Supabase question bank.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <input
                          type="checkbox"
                          checked={skipDuplicates}
                          onChange={(e) => setSkipDuplicates(e.target.checked)}
                          className="size-4 rounded border-input accent-primary"
                        />
                        <span>Skip questions already in bank ({importPreview.summary.duplicateInBankCount})</span>
                      </label>

                      <Button
                        onClick={handleExecuteImport}
                        disabled={
                          importing ||
                          (skipDuplicates
                            ? importPreview.summary.readyToInsertCount === 0
                            : importPreview.summary.validCount === 0)
                        }
                      >
                        {importing && <Loader2 className="size-4 animate-spin" />}
                        <span>
                          Import {skipDuplicates ? importPreview.summary.readyToInsertCount : importPreview.summary.validCount} Valid Question(s)
                        </span>
                      </Button>
                    </div>
                  </div>

                  {/* Summary Metrics */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      ['Total Parsed', importPreview.summary.totalParsed],
                      ['Ready to Insert', importPreview.summary.readyToInsertCount],
                      ['Invalid Schema', importPreview.summary.invalidCount],
                      ['Duplicate in Upload', importPreview.summary.duplicateInBatchCount],
                      ['Already in Bank', importPreview.summary.duplicateInBankCount],
                      ['Missing Explanation', importPreview.summary.missingExplanationCount],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="rounded-lg border bg-card p-3">
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums">{val}</p>
                      </div>
                    ))}
                  </div>

                  {/* Filter pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {(['ALL', 'VALID', 'INVALID', 'DUPLICATE'] as const).map((f) => (
                      <Button
                        key={f}
                        size="xs"
                        variant={previewFilter === f ? 'default' : 'outline'}
                        onClick={() => setPreviewFilter(f)}
                      >
                        {f}
                      </Button>
                    ))}
                  </div>

                  {/* Preview Items List */}
                  <div className="max-h-96 divide-y overflow-y-auto rounded-xl border bg-card">
                    {filteredPreviewItems.map((item) => (
                      <div key={item.index} className="flex flex-col gap-1.5 p-3.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-muted-foreground">#{item.index + 1}</span>
                            <Badge variant="outline">{item.sourceFile}</Badge>
                            <Badge variant="default">{item.topic}</Badge>
                            <Badge variant="secondary">{item.type}</Badge>
                            {item.valid && !item.duplicateInBank && (
                              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
                                Ready
                              </Badge>
                            )}
                            {item.duplicateInBank && (
                              <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                                Duplicate in Bank
                              </Badge>
                            )}
                            {item.duplicateInBatch && (
                              <Badge variant="destructive">Duplicate in Upload</Badge>
                            )}
                            {!item.valid && <Badge variant="destructive">Invalid</Badge>}
                          </div>
                          <span className="text-muted-foreground">
                            Keys: {item.correct_answers.join(', ') || 'None'}
                          </span>
                        </div>
                        <p className="font-medium text-foreground">{item.question_text || '(Empty question text)'}</p>
                        {item.errors.length > 0 && (
                          <p className="font-medium text-destructive">Errors: {item.errors.join(' · ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* TAB 4: BLUEPRINT & QUALITY MATRIX */}
      {tab === 'blueprint' && (
        <section className="flex flex-col gap-5" role="tabpanel">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-bold">Four Competition Banks</CardTitle>
                <CardDescription>Coverage is calculated from active questions classified for each track and competition round.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 pt-0 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['COMPUTING_PRELIMINARY', 'Computing', 'Preliminary'],
                  ['NETWORK_PRELIMINARY', 'Network', 'Preliminary'],
                  ['COMPUTING_NATIONAL', 'Computing', 'National'],
                  ['NETWORK_NATIONAL', 'Network', 'National'],
                ].map(([key, track, round]) => (
                  <div key={key} className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{track}</p>
                      <Badge variant={round === 'National' ? 'default' : 'secondary'}>{round}</Badge>
                    </div>
                    <p className="mt-4 text-2xl font-bold tabular-nums">{bankCounts[key] ?? 0}</p>
                    <p className="text-xs text-muted-foreground">active classified questions</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-lg font-bold">Full-Exam Blueprint & Question Bank Coverage</CardTitle>
              <CardDescription>
                Compares available exam-ready questions in Supabase against the configured 60-question Full Exam Simulation blueprint.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="pb-3">Technology</th>
                      {QUESTION_TYPES.map((qt) => (
                        <th key={qt} className="pb-3 text-right">
                          {TYPE_LABELS[qt]} (Avail / Req)
                        </th>
                      ))}
                      <th className="pb-3 text-right">Total (Avail / Req)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {TOPICS.map((topic) => {
                      const reqTotal = blueprintTopicTotal(topic)
                      const availTotal = QUESTION_TYPES.reduce(
                        (acc, qt) => acc + (poolCounts?.[topic]?.[qt] ?? 0),
                        0,
                      )
                      return (
                        <tr key={topic}>
                          <td className="py-3.5 font-semibold">{TOPIC_LABELS[topic]}</td>
                          {QUESTION_TYPES.map((qt) => {
                            const avail = poolCounts?.[topic]?.[qt] ?? 0
                            const req = FULL_BLUEPRINT[topic][qt]
                            const ok = avail >= req
                            return (
                              <td key={qt} className="py-3.5 text-right tabular-nums">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                                    ok
                                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                  }`}
                                >
                                  {avail} / {req}
                                </span>
                              </td>
                            )
                          })}
                          <td className="py-3.5 text-right font-bold tabular-nums">
                            {availTotal} / {reqTotal}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {shortages.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-bold">Blueprint Shortages Preventing Full 60-Question Exam Generation:</p>
                  <ul className="mt-1.5 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {shortages.map((s) => (
                      <li key={`${s.topic}-${s.type}`}>
                        • <strong>{TOPIC_LABELS[s.topic]} ({TYPE_LABELS[s.type]}):</strong> {s.available} available, {s.needed} required (short by {s.needed - s.available})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  )
}

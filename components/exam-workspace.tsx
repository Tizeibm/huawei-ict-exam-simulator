'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  Grid,
  History,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  blueprintTopicTotal,
  blueprintTotal,
  FULL_BLUEPRINT,
  FULL_EXAM_DURATION_MINUTES,
  PRACTICE_MAX_QUESTIONS,
  PRACTICE_MIN_QUESTIONS,
  QUESTION_TYPES,
  TOPIC_LABELS,
  TOPICS,
  TYPE_LABELS,
  type ExamMode,
  type QuestionType,
  type Topic,
} from '@/lib/exam/config'
import type { Shortage } from '@/lib/exam/generate'
import { sanitizeSelection } from '@/lib/exam/scoring'
import { formatClock } from '@/lib/exam/timer'
import type { ClientExamQuestion } from '@/lib/exam-service'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ActiveAttemptState {
  id: string
  mode: ExamMode
  status: 'IN_PROGRESS'
  started_at: string
  expires_at: string | null
  duration_seconds: number | null
  remainingSeconds: number | null
  answers: Record<string, string[]>
  flagged_ids: string[]
  immediateFeedback: boolean
  questions: ClientExamQuestion[]
}

interface SetupOverview {
  totalExamReadyQuestions: number
  poolCounts: Record<Topic, Record<QuestionType, number>>
  shortages: Shortage[]
  fullExamReady: boolean
  activeAttempt: {
    id: string
    mode: ExamMode
    started_at: string
    expires_at: string | null
    remainingSeconds: number | null
    total: number
    answeredCount: number
  } | null
  reviewCounts: {
    all: number
    incorrect: number
    flagged: number
  }
  completedAttemptsCount: number
}

export function ExamWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialModeParam = searchParams.get('mode')?.toUpperCase()
  const initialTopicParam = searchParams.get('topic')?.toUpperCase()

  const [setupData, setSetupData] = useState<SetupOverview | null>(null)
  const [loadingSetup, setLoadingSetup] = useState(true)
  const [error, setError] = useState('')

  // Exam Setup form state
  const [selectedMode, setSelectedMode] = useState<ExamMode>(
    initialModeParam === 'PRACTICE' || initialModeParam === 'REVIEW' ? initialModeParam : 'FULL',
  )
  const [practiceTopics, setPracticeTopics] = useState<Topic[]>(
    initialTopicParam && (TOPICS as readonly string[]).includes(initialTopicParam)
      ? [initialTopicParam as Topic]
      : [...TOPICS],
  )
  const [practiceTypes, setPracticeTypes] = useState<QuestionType[]>([...QUESTION_TYPES])
  const [practiceCount, setPracticeCount] = useState<number>(15)
  const [immediateFeedback, setImmediateFeedback] = useState<boolean>(true)
  const [practiceTimedMinutes, setPracticeTimedMinutes] = useState<number | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'ALL' | 'INCORRECT' | 'FLAGGED'>('ALL')

  // Active Exam Workspace state
  const [activeAttempt, setActiveAttempt] = useState<ActiveAttemptState | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [flaggedIds, setFlaggedIds] = useState<string[]>([])
  const [revealedFeedbackIds, setRevealedFeedbackIds] = useState<string[]>([])
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [navFilter, setNavFilter] = useState<'ALL' | 'UNANSWERED' | 'FLAGGED'>('ALL')

  const autoSubmittedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSetup = useCallback(async () => {
    setLoadingSetup(true)
    setError('')
    try {
      const response = await fetch('/api/attempts')
      if (!response.ok) {
        setError('Unable to load exam simulator configuration.')
        setLoadingSetup(false)
        return
      }
      const data = (await response.json()) as SetupOverview
      setSetupData(data)
      if (!data.fullExamReady && !initialModeParam) {
        setSelectedMode('PRACTICE')
      }
    } catch {
      setError('Network error while connecting to the exam simulator.')
    } finally {
      setLoadingSetup(false)
    }
  }, [initialModeParam])

  useEffect(() => {
    loadSetup()
  }, [loadSetup])

  // Resume an active session by ID
  async function handleResumeAttempt(attemptId: string) {
    setStarting(true)
    setError('')
    try {
      const response = await fetch(`/api/attempts/${attemptId}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.attempt) {
        setError(data.error ?? 'Could not resume the exam session.')
        return
      }
      if (data.attempt.status !== 'IN_PROGRESS') {
        router.push(`/results/${attemptId}`)
        return
      }
      const restored = data.attempt as ActiveAttemptState
      // Check local storage backup in case unsaved answers existed before refresh
      let mergedAnswers = restored.answers ?? {}
      let mergedFlagged = restored.flagged_ids ?? []
      try {
        const cached = sessionStorage.getItem(`ictprep_attempt_${restored.id}`)
        if (cached) {
          const parsedCache = JSON.parse(cached) as {
            answers?: Record<string, string[]>
            flagged_ids?: string[]
            currentIndex?: number
          }
          if (parsedCache.answers) mergedAnswers = { ...mergedAnswers, ...parsedCache.answers }
          if (parsedCache.flagged_ids) mergedFlagged = parsedCache.flagged_ids
          if (typeof parsedCache.currentIndex === 'number') {
            setCurrentIndex(Math.min(restored.questions.length - 1, Math.max(0, parsedCache.currentIndex)))
          }
        }
      } catch {
        // Ignore storage errors
      }
      autoSubmittedRef.current = false
      setActiveAttempt(restored)
      setAnswers(mergedAnswers)
      setFlaggedIds(mergedFlagged)
      setRemainingSeconds(restored.remainingSeconds)
    } finally {
      setStarting(false)
    }
  }

  async function handleAbandonActiveAttempt(attemptId: string) {
    setError('')
    await fetch(`/api/attempts/${attemptId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'abandon' }),
    })
    try {
      sessionStorage.removeItem(`ictprep_attempt_${attemptId}`)
    } catch {
      // ignore
    }
    await loadSetup()
  }

  async function handleStartExam() {
    setStarting(true)
    setError('')
    try {
      const payload =
        selectedMode === 'FULL'
          ? { mode: 'FULL' as const }
          : selectedMode === 'PRACTICE'
            ? {
                mode: 'PRACTICE' as const,
                topics: practiceTopics,
                types: practiceTypes,
                count: practiceCount,
                immediateFeedback,
                timedMinutes: practiceTimedMinutes,
              }
            : {
                mode: 'REVIEW' as const,
                topics: practiceTopics,
                count: practiceCount,
                immediateFeedback: true,
                reviewFilter,
              }

      const response = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.attempt) {
        setError(data.error ?? 'Unable to start the exam session.')
        return
      }

      const started = data.attempt as ActiveAttemptState
      autoSubmittedRef.current = false
      setActiveAttempt(started)
      setCurrentIndex(0)
      setAnswers(started.answers ?? {})
      setFlaggedIds(started.flagged_ids ?? [])
      setRevealedFeedbackIds([])
      setRemainingSeconds(started.remainingSeconds)
      setSaveState('saved')
    } catch {
      setError('Network error while starting the exam.')
    } finally {
      setStarting(false)
    }
  }

  // Persist to sessionStorage and debounce server save
  const scheduleServerSave = useCallback(
    (attemptId: string, nextAnswers: Record<string, string[]>, nextFlagged: string[], nextIndex: number) => {
      try {
        sessionStorage.setItem(
          `ictprep_attempt_${attemptId}`,
          JSON.stringify({ answers: nextAnswers, flagged_ids: nextFlagged, currentIndex: nextIndex }),
        )
      } catch {
        // ignore storage errors
      }

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      setSaveState('saving')
      saveTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/attempts/${attemptId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'save',
              answers: nextAnswers,
              flagged_ids: nextFlagged,
            }),
          })
          setSaveState(res.ok ? 'saved' : 'error')
        } catch {
          setSaveState('error')
        }
      }, 650)
    },
    [],
  )

  // Submit Exam handler (idempotent)
  const submitExam = useCallback(
    async (isAutoExpiry = false) => {
      if (!activeAttempt || submitting) return
      setSubmitting(true)
      setShowSubmitConfirm(false)
      setError('')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

      try {
        const response = await fetch(`/api/attempts/${activeAttempt.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'submit',
            answers,
            flagged_ids: flaggedIds,
          }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
          setError(
            result.error ??
              (isAutoExpiry
                ? 'Time expired, and there was a network issue finalizing your attempt. Retrying will preserve your saved answers.'
                : 'Your answers are saved locally, but submission encountered a network error. Please click Submit again.'),
          )
          setSubmitting(false)
          return
        }

        try {
          sessionStorage.removeItem(`ictprep_attempt_${activeAttempt.id}`)
        } catch {
          // ignore
        }
        router.push(`/results/${activeAttempt.id}`)
      } catch {
        setError('Network connection interrupted during submission. Your answers remain saved; please retry.')
        setSubmitting(false)
      }
    },
    [activeAttempt, answers, flaggedIds, router, submitting],
  )

  // Authoritative countdown timer derived from expires_at
  useEffect(() => {
    if (!activeAttempt || !activeAttempt.expires_at) return
    const expiresMs = new Date(activeAttempt.expires_at).getTime()

    const tick = () => {
      const secs = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000))
      setRemainingSeconds(secs)
      if (secs <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true
        submitExam(true)
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [activeAttempt, submitExam])

  // Select/deselect answer option according to SINGLE / MULTIPLE / BOOLEAN rules
  const currentQuestion = activeAttempt?.questions[currentIndex]
  const currentSelection = currentQuestion ? (answers[currentQuestion.id] ?? []) : []
  const isCurrentFlagged = currentQuestion ? flaggedIds.includes(currentQuestion.id) : false
  const isFeedbackRevealed = currentQuestion ? revealedFeedbackIds.includes(currentQuestion.id) : false

  const handleSelectOption = useCallback(
    (key: string) => {
      if (!activeAttempt || !currentQuestion || submitting) return
      const existing = answers[currentQuestion.id] ?? []
      let rawNext: string[]
      if (currentQuestion.type === 'MULTIPLE') {
        rawNext = existing.includes(key) ? existing.filter((k) => k !== key) : [...existing, key]
      } else {
        // SINGLE and BOOLEAN replace the previous selection with the single chosen key
        rawNext = [key]
      }
      const sanitized = sanitizeSelection(currentQuestion, rawNext)
      const nextAnswers = { ...answers, [currentQuestion.id]: sanitized }
      setAnswers(nextAnswers)
      scheduleServerSave(activeAttempt.id, nextAnswers, flaggedIds, currentIndex)
    },
    [activeAttempt, answers, currentIndex, currentQuestion, flaggedIds, scheduleServerSave, submitting],
  )

  const handleToggleFlag = useCallback(() => {
    if (!activeAttempt || !currentQuestion || submitting) return
    const nextFlagged = flaggedIds.includes(currentQuestion.id)
      ? flaggedIds.filter((id) => id !== currentQuestion.id)
      : [...flaggedIds, currentQuestion.id]
    setFlaggedIds(nextFlagged)
    scheduleServerSave(activeAttempt.id, answers, nextFlagged, currentIndex)
  }, [activeAttempt, answers, currentIndex, currentQuestion, flaggedIds, scheduleServerSave, submitting])

  // Keyboard navigation shortcuts in active exam
  useEffect(() => {
    if (!activeAttempt || !currentQuestion || showSubmitConfirm) return
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }
      if (e.key === 'ArrowRight' && currentIndex < activeAttempt!.questions.length - 1) {
        e.preventDefault()
        setCurrentIndex((i) => i + 1)
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault()
        setCurrentIndex((i) => i - 1)
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        handleToggleFlag()
      } else {
        const optionKeys = Object.keys(currentQuestion!.options)
        const upper = e.key.toUpperCase()
        if (optionKeys.includes(upper)) {
          e.preventDefault()
          handleSelectOption(upper)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeAttempt, currentIndex, currentQuestion, handleSelectOption, handleToggleFlag, showSubmitConfirm])

  const answeredCount = useMemo(() => {
    if (!activeAttempt) return 0
    return activeAttempt.questions.filter((q) => (answers[q.id]?.length ?? 0) > 0).length
  }, [activeAttempt, answers])

  const unansweredCount = activeAttempt ? activeAttempt.questions.length - answeredCount : 0

  const practiceAvailableCount = useMemo(() => {
    if (!setupData?.poolCounts) return 0
    let sum = 0
    for (const t of practiceTopics) {
      for (const qt of practiceTypes) {
        sum += setupData.poolCounts[t]?.[qt] ?? 0
      }
    }
    return sum
  }, [setupData, practiceTopics, practiceTypes])

  // ============================================================================
  // VIEW 1: ACTIVE EXAMINATION WORKSPACE
  // ============================================================================
  if (activeAttempt && currentQuestion) {
    const totalQuestions = activeAttempt.questions.length
    const progressPercent = Math.round((answeredCount / totalQuestions) * 100)
    const isLowTime = remainingSeconds !== null && remainingSeconds <= 300

    return (
      <div className="exam-stage flex min-h-[calc(100vh-4rem)] flex-col bg-background">
        {/* Sticky Exam Workspace Bar */}
        <div className="sticky top-14 z-20 border-b bg-card/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-3">
              <Badge variant="default" className="uppercase tracking-wider">
                {activeAttempt.mode === 'FULL'
                  ? 'Full Exam Simulation'
                  : activeAttempt.mode === 'REVIEW'
                    ? 'Historical Review Mode'
                    : 'Practice Session'}
              </Badge>
              <span className="text-sm font-semibold tabular-nums">
                Question {currentIndex + 1} of {totalQuestions}
              </span>
              <span className="hidden text-xs text-muted-foreground md:inline">
                ({answeredCount} answered · {unansweredCount} remaining · {flaggedIds.length} flagged)
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Save state indicator */}
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {saveState === 'saving'
                  ? 'Saving…'
                  : saveState === 'saved'
                    ? 'Progress saved'
                    : saveState === 'error'
                      ? 'Local backup active'
                      : ''}
              </span>

              {/* Timer chip */}
              {remainingSeconds !== null ? (
                <div
                  role="timer"
                  aria-label="Remaining exam time"
                  className={`timer-chip ${
                    isLowTime
                      ? 'border-destructive/50 bg-destructive/10 text-destructive animate-pulse'
                      : 'border-primary/30 text-foreground'
                  }`}
                >
                  <Clock className="size-4 text-primary" aria-hidden="true" />
                  <span>{formatClock(remainingSeconds)}</span>
                </div>
              ) : (
                <div className="timer-chip text-muted-foreground">
                  <Clock className="size-4" aria-hidden="true" />
                  <span>Untimed Mode</span>
                </div>
              )}

              {/* Mobile Navigator Toggle */}
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setShowMobileNav((v) => !v)}
              >
                <Grid className="size-4" />
                <span>Navigator ({answeredCount}/{totalQuestions})</span>
              </Button>

              <Button
                size="sm"
                onClick={() => setShowSubmitConfirm(true)}
                disabled={submitting}
              >
                <Send className="size-3.5" />
                <span>Submit Exam</span>
              </Button>
            </div>
          </div>

          {/* Slim Progress Bar */}
          <div className="h-1 w-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Mobile Question Navigator Drawer */}
        {showMobileNav && (
          <div className="border-b bg-card p-4 lg:hidden">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Question Navigator
              </span>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowMobileNav(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
              {activeAttempt.questions.map((q, idx) => {
                const isAns = (answers[q.id]?.length ?? 0) > 0
                const isFlg = flaggedIds.includes(q.id)
                const isCur = idx === currentIndex
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx)
                      setShowMobileNav(false)
                    }}
                    className={`question-dot ${isCur ? 'question-dot-current' : ''} ${
                      isFlg ? 'question-dot-flagged' : isAns ? 'question-dot-answered' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6">
            <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Main Two-Column Desktop Layout */}
        <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
          {/* Left Column: Active Question & Options */}
          <div className="flex flex-col gap-5">
            <Card className="flex-1">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground tabular-nums">
                      Q{currentIndex + 1}
                    </span>
                    <Badge variant="outline" className="font-semibold">
                      {TOPIC_LABELS[currentQuestion.topic]}
                    </Badge>
                    <Badge variant="secondary">
                      {TYPE_LABELS[currentQuestion.type]}
                    </Badge>
                  </div>

                  <Button
                    type="button"
                    variant={isCurrentFlagged ? 'default' : 'outline'}
                    size="sm"
                    onClick={handleToggleFlag}
                    aria-pressed={isCurrentFlagged}
                    className={isCurrentFlagged ? 'bg-amber-600 text-white hover:bg-amber-600/90' : ''}
                  >
                    <Flag className="size-3.5" />
                    <span>{isCurrentFlagged ? 'Flagged for Review' : 'Flag for Review'}</span>
                  </Button>
                </div>

                {/* Question Type Instruction Helper */}
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  {currentQuestion.type === 'MULTIPLE'
                    ? 'Multiple Choice: Select TWO or MORE options that apply. Full credit requires selecting the exact set of correct options.'
                    : currentQuestion.type === 'BOOLEAN'
                      ? 'True / False: Select the single correct statement option below.'
                      : 'Single Choice: Select exactly ONE option below.'}
                </p>

                <CardTitle className="mt-3 text-lg font-semibold leading-relaxed text-foreground sm:text-xl">
                  {currentQuestion.question_text}
                </CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col gap-3 pt-5">
                {Object.entries(currentQuestion.options).map(([key, optionText]) => {
                  const isSelected = currentSelection.includes(key)
                  const isCorrectOption =
                    isFeedbackRevealed && currentQuestion.correct_answers?.includes(key)
                  const isWrongSelection =
                    isFeedbackRevealed && isSelected && !currentQuestion.correct_answers?.includes(key)

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={submitting}
                      role={currentQuestion.type === 'MULTIPLE' ? 'checkbox' : 'radio'}
                      aria-checked={isSelected}
                      onClick={() => handleSelectOption(key)}
                      className={`answer-option ${isSelected ? 'answer-option-selected' : ''} ${
                        isCorrectOption
                          ? 'border-emerald-600 bg-emerald-500/10'
                          : isWrongSelection
                            ? 'border-destructive bg-destructive/10'
                            : ''
                      }`}
                    >
                      <span
                        className={`answer-key ${isSelected ? 'answer-key-selected' : ''} ${
                          isCorrectOption ? 'border-emerald-600 bg-emerald-600 text-white' : ''
                        }`}
                      >
                        {key}
                      </span>
                      <span className="flex-1 pt-0.5 text-sm leading-relaxed">{optionText}</span>
                    </button>
                  )
                })}

                {/* Practice/Review Immediate Feedback Panel */}
                {activeAttempt.immediateFeedback && currentQuestion.correct_answers && (
                  <div className="mt-2 flex flex-col gap-3 border-t pt-4">
                    {!isFeedbackRevealed ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Immediate practice verification is enabled for this session.
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={currentSelection.length === 0}
                          onClick={() =>
                            setRevealedFeedbackIds((prev) =>
                              prev.includes(currentQuestion.id) ? prev : [...prev, currentQuestion.id],
                            )
                          }
                        >
                          <Eye className="size-3.5" />
                          <span>Check Answer & Explanation</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-primary/25 bg-accent/50 p-4 text-sm">
                        <div className="flex items-center gap-2 font-bold">
                          <span>Correct Answer Key(s): {currentQuestion.correct_answers.join(', ')}</span>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                          {currentQuestion.explanation || 'No explanation stored for this question.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom Navigation Bar */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={currentIndex === 0 || submitting}
                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  >
                    <ArrowLeft className="size-4" />
                    <span>Previous</span>
                  </Button>

                  <span className="text-xs text-muted-foreground">
                    Tip: Use <kbd className="rounded border px-1.5 py-0.5 font-mono">←</kbd>{' '}
                    <kbd className="rounded border px-1.5 py-0.5 font-mono">→</kbd> to navigate,{' '}
                    <kbd className="rounded border px-1.5 py-0.5 font-mono">F</kbd> to flag
                  </span>

                  {currentIndex < totalQuestions - 1 ? (
                    <Button
                      type="button"
                      onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
                    >
                      <span>Next</span>
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : (
                    <Button type="button" onClick={() => setShowSubmitConfirm(true)} disabled={submitting}>
                      <Send className="size-4" />
                      <span>Review & Submit Exam</span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Persistent Question Navigator Grid */}
          <aside className="hidden lg:block" aria-label="Question navigator">
            <Card className="sticky top-32">
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-sm font-bold">Question Navigator</CardTitle>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(['ALL', 'UNANSWERED', 'FLAGGED'] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => setNavFilter(filterKey)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                        navFilter === filterKey
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {filterKey === 'ALL'
                        ? `All (${totalQuestions})`
                        : filterKey === 'UNANSWERED'
                          ? `Unanswered (${unansweredCount})`
                          : `Flagged (${flaggedIds.length})`}
                    </button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-4 pt-4">
                <div className="grid max-h-80 grid-cols-5 gap-2 overflow-y-auto p-0.5">
                  {activeAttempt.questions.map((q, idx) => {
                    const isAns = (answers[q.id]?.length ?? 0) > 0
                    const isFlg = flaggedIds.includes(q.id)
                    const isCur = idx === currentIndex
                    if (navFilter === 'UNANSWERED' && isAns) return null
                    if (navFilter === 'FLAGGED' && !isFlg) return null

                    return (
                      <button
                        key={q.id}
                        type="button"
                        aria-label={`Question ${idx + 1}${isAns ? ', answered' : ', unanswered'}${isFlg ? ', flagged' : ''}`}
                        aria-current={isCur ? 'step' : undefined}
                        onClick={() => setCurrentIndex(idx)}
                        className={`question-dot ${isCur ? 'question-dot-current' : ''} ${
                          isFlg ? 'question-dot-flagged' : isAns ? 'question-dot-answered' : ''
                        }`}
                      >
                        {idx + 1}
                      </button>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="grid grid-cols-2 gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-sm border border-primary/40 bg-primary/15" />
                    <span>Answered ({answeredCount})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-sm border bg-card" />
                    <span>Unanswered ({unansweredCount})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-sm border border-amber-500/60 bg-amber-500/20" />
                    <span>Flagged ({flaggedIds.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-sm ring-2 ring-primary" />
                    <span>Current (#{currentIndex + 1})</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => setShowSubmitConfirm(true)}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  <span>{submitting ? 'Submitting Exam…' : 'Submit Exam'}</span>
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>

        {/* Submission Confirmation Dialog */}
        {showSubmitConfirm && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-dialog-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          >
            <Card className="w-full max-w-md shadow-xl">
              <CardHeader className="border-b">
                <CardTitle id="submit-dialog-title" className="text-lg font-bold">
                  Confirm Exam Submission
                </CardTitle>
                <CardDescription>
                  Once submitted, your answers are locked and graded on the server.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-3 text-center">
                  <div>
                    <p className="text-xl font-bold text-primary tabular-nums">{answeredCount}</p>
                    <p className="text-xs text-muted-foreground">Answered</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold tabular-nums">{unansweredCount}</p>
                    <p className="text-xs text-muted-foreground">Unanswered</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-amber-600 tabular-nums">{flaggedIds.length}</p>
                    <p className="text-xs text-muted-foreground">Flagged</p>
                  </div>
                </div>

                {unansweredCount > 0 && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <span>
                      You still have <strong>{unansweredCount} unanswered question(s)</strong>. Unanswered questions receive 0 points.
                    </span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowSubmitConfirm(false)}
                    disabled={submitting}
                  >
                    Return to Exam
                  </Button>
                  <Button type="button" onClick={() => submitExam(false)} disabled={submitting}>
                    {submitting && <Loader2 className="size-4 animate-spin" />}
                    <span>Submit Final Answers</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    )
  }

  // ============================================================================
  // VIEW 2: EXAM SETUP & MODE SELECTION
  // ============================================================================
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Examination Workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Configure Your Session</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose between a strict 60-question Full Exam Simulation, a customizable Practice Session, or Historical Review Mode.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Back to Dashboard
          </Link>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Resumable Active Session Banner */}
      {setupData?.activeAttempt && (
        <Card className="border-primary/40 bg-accent/40">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="default">In-Progress Session Found</Badge>
                <Badge variant="outline">{setupData.activeAttempt.mode} Mode</Badge>
              </div>
              <CardTitle className="mt-2 text-base font-bold">
                Resume your unfinished exam ({setupData.activeAttempt.answeredCount} of {setupData.activeAttempt.total} answered)
              </CardTitle>
              <CardDescription>
                Started {new Date(setupData.activeAttempt.started_at).toLocaleTimeString()}
                {setupData.activeAttempt.remainingSeconds !== null
                  ? ` · ${formatClock(setupData.activeAttempt.remainingSeconds)} remaining`
                  : ' · Untimed session'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAbandonActiveAttempt(setupData.activeAttempt!.id)}
              >
                <RotateCcw className="size-3.5" />
                <span>Discard</span>
              </Button>
              <Button
                size="sm"
                onClick={() => handleResumeAttempt(setupData.activeAttempt!.id)}
                disabled={starting}
              >
                {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                <span>Resume Session</span>
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Mode Selection Cards */}
      <section aria-label="Select examination mode" className="grid gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setSelectedMode('FULL')}
          className={`flex flex-col justify-between rounded-xl border p-5 text-left transition-all ${
            selectedMode === 'FULL'
              ? 'border-primary bg-accent/60 shadow-sm ring-2 ring-primary/20'
              : 'bg-card hover:border-primary/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BookOpenCheck className="size-5" />
              </span>
              <Badge variant={setupData?.fullExamReady ? 'default' : 'secondary'}>
                {setupData?.fullExamReady ? '60 Questions · 90m' : 'Shortage Detected'}
              </Badge>
            </div>
            <h2 className="mt-4 text-base font-bold">1. Full Exam Simulation</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Fixed 60-question blueprint (30 openEuler, 18 openGauss, 12 Kunpeng), 90-minute countdown, no explanations until final submission.
            </p>
          </div>
          <p className="mt-4 text-xs font-semibold text-primary">
            {selectedMode === 'FULL' ? '● Selected Mode' : 'Select Full Exam'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setSelectedMode('PRACTICE')}
          className={`flex flex-col justify-between rounded-xl border p-5 text-left transition-all ${
            selectedMode === 'PRACTICE'
              ? 'border-primary bg-accent/60 shadow-sm ring-2 ring-primary/20'
              : 'bg-card hover:border-primary/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Layers className="size-5" />
              </span>
              <Badge variant="outline">
                {setupData?.totalExamReadyQuestions ?? 0} Available
              </Badge>
            </div>
            <h2 className="mt-4 text-base font-bold">2. Practice Mode</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Choose specific technologies, question formats, question count, and optional immediate answer explanations.
            </p>
          </div>
          <p className="mt-4 text-xs font-semibold text-primary">
            {selectedMode === 'PRACTICE' ? '● Selected Mode' : 'Select Practice Mode'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setSelectedMode('REVIEW')}
          className={`flex flex-col justify-between rounded-xl border p-5 text-left transition-all ${
            selectedMode === 'REVIEW'
              ? 'border-primary bg-accent/60 shadow-sm ring-2 ring-primary/20'
              : 'bg-card hover:border-primary/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <History className="size-5" />
              </span>
              <Badge variant="outline">
                {setupData?.reviewCounts.all ?? 0} Review Items
              </Badge>
            </div>
            <h2 className="mt-4 text-base font-bold">3. Historical Review Mode</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Revisit questions you previously answered incorrectly or flagged for review across your completed attempts.
            </p>
          </div>
          <p className="mt-4 text-xs font-semibold text-primary">
            {selectedMode === 'REVIEW' ? '● Selected Mode' : 'Select Review Mode'}
          </p>
        </button>
      </section>

      {/* Mode Configuration Card */}
      {loadingSetup ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Verifying question bank against exam blueprint…</span>
          </CardContent>
        </Card>
      ) : selectedMode === 'FULL' ? (
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg font-bold">Full Exam Simulation Blueprint</CardTitle>
                <CardDescription>
                  Configured 60-question Computing Track allocation (30 Single Choice, 15 Multiple Choice, 15 True/False).
                </CardDescription>
              </div>
              <Badge variant={setupData?.fullExamReady ? 'default' : 'destructive'}>
                {setupData?.fullExamReady ? 'Blueprint Verified' : 'Insufficient Question Bank'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 pt-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2.5">Technology</th>
                    <th className="pb-2.5 text-right">Single</th>
                    <th className="pb-2.5 text-right">Multiple</th>
                    <th className="pb-2.5 text-right">Boolean</th>
                    <th className="pb-2.5 text-right">Required Total</th>
                    <th className="pb-2.5 text-right">Bank Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {TOPICS.map((topic) => {
                    const topicShortages = (setupData?.shortages ?? []).filter((s) => s.topic === topic)
                    return (
                      <tr key={topic}>
                        <td className="py-3 font-semibold">{TOPIC_LABELS[topic]}</td>
                        {QUESTION_TYPES.map((qt) => {
                          const req = FULL_BLUEPRINT[topic][qt]
                          const avail = setupData?.poolCounts?.[topic]?.[qt] ?? 0
                          return (
                            <td key={qt} className="py-3 text-right tabular-nums">
                              <span className={avail < req ? 'font-bold text-amber-600' : ''}>
                                {req} <span className="text-xs text-muted-foreground">({avail} avail)</span>
                              </span>
                            </td>
                          )
                        })}
                        <td className="py-3 text-right font-bold tabular-nums">{blueprintTopicTotal(topic)}</td>
                        <td className="py-3 text-right">
                          {topicShortages.length === 0 ? (
                            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700">
                              Ready
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                              Shortage
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {!setupData?.fullExamReady && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-950 dark:text-amber-200">
                <p className="font-bold">
                  Why Full Exam Simulation is currently unavailable:
                </p>
                <p className="mt-1">
                  ICT Prep never invents fake or placeholder questions. The question bank currently has{' '}
                  <strong>{setupData?.totalExamReadyQuestions ?? 0} exam-ready question(s)</strong>, which is short in{' '}
                  <strong>{setupData?.shortages.length ?? 0} topic/type slot(s)</strong>:
                </p>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {(setupData?.shortages ?? []).map((s) => (
                    <li key={`${s.topic}-${s.type}`}>
                      • {TOPIC_LABELS[s.topic]} · {TYPE_LABELS[s.type]}: {s.available} available / {s.needed} required
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Button size="sm" variant="secondary" onClick={() => setSelectedMode('PRACTICE')}>
                    Switch to Practice Mode ({setupData?.totalExamReadyQuestions ?? 0} questions available)
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" />
                <span>
                  Duration: {FULL_EXAM_DURATION_MINUTES} minutes · Strict multiple-choice matching · Server-graded
                </span>
              </div>

              <Button
                size="lg"
                onClick={handleStartExam}
                disabled={starting || !setupData?.fullExamReady}
                title={
                  !setupData?.fullExamReady
                    ? 'Full Exam requires all 60 blueprint slots to be populated in the question bank'
                    : undefined
                }
              >
                {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                <span>Start 60-Question Full Exam</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : selectedMode === 'PRACTICE' ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-lg font-bold">Practice Mode Configuration</CardTitle>
            <CardDescription>
              Customize technologies, question formats, session length, and immediate answer verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 pt-5">
            {/* Select Technologies */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Technologies to Include
              </span>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((topic) => {
                  const active = practiceTopics.includes(topic)
                  return (
                    <Button
                      key={topic}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => {
                        if (active && practiceTopics.length > 1) {
                          setPracticeTopics(practiceTopics.filter((t) => t !== topic))
                        } else if (!active) {
                          setPracticeTopics([...practiceTopics, topic])
                        }
                      }}
                    >
                      {TOPIC_LABELS[topic]}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Select Question Types */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Question Formats
              </span>
              <div className="flex flex-wrap gap-2">
                {QUESTION_TYPES.map((qt) => {
                  const active = practiceTypes.includes(qt)
                  return (
                    <Button
                      key={qt}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => {
                        if (active && practiceTypes.length > 1) {
                          setPracticeTypes(practiceTypes.filter((t) => t !== qt))
                        } else if (!active) {
                          setPracticeTypes([...practiceTypes, qt])
                        }
                      }}
                    >
                      {TYPE_LABELS[qt]}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Question Count & Options */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="practice-count">
                  3. Number of Questions ({PRACTICE_MIN_QUESTIONS}–{PRACTICE_MAX_QUESTIONS})
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[5, 10, 15, 30, 45, 60].map((n) => (
                    <Button
                      key={n}
                      type="button"
                      size="sm"
                      variant={practiceCount === n ? 'default' : 'outline'}
                      onClick={() => setPracticeCount(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="practice-timer">
                  4. Optional Timer
                </label>
                <select
                  id="practice-timer"
                  className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
                  value={practiceTimedMinutes ?? ''}
                  onChange={(e) =>
                    setPracticeTimedMinutes(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">Untimed (Self-paced)</option>
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="45">45 Minutes</option>
                  <option value="60">60 Minutes</option>
                  <option value="90">90 Minutes</option>
                </select>
              </div>

              <div className="flex flex-col justify-end gap-1.5">
                <label className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-2.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={immediateFeedback}
                    onChange={(e) => setImmediateFeedback(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  <span>Enable &ldquo;Check Answer &amp; Explanation&rdquo; during practice</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                <strong>{practiceAvailableCount}</strong> real question(s) in the bank match your filters.
                {practiceAvailableCount > 0 && practiceAvailableCount < practiceCount
                  ? ` Your session will include all ${practiceAvailableCount} available question(s).`
                  : ''}
              </p>

              <Button
                size="lg"
                onClick={handleStartExam}
                disabled={starting || practiceAvailableCount === 0}
                title={
                  practiceAvailableCount === 0
                    ? 'No questions in the question bank match the selected filters'
                    : undefined
                }
              >
                {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                <span>
                  Start Practice ({Math.min(practiceCount, practiceAvailableCount)} Question
                  {Math.min(practiceCount, practiceAvailableCount) === 1 ? '' : 's'})
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* REVIEW MODE */
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-lg font-bold">Historical Review Mode</CardTitle>
            <CardDescription>
              Practice strictly from questions you missed or flagged in your previous completed attempts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 pt-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  key: 'ALL' as const,
                  label: 'All Incorrect & Flagged',
                  count: setupData?.reviewCounts.all ?? 0,
                  desc: 'Every question you missed, left blank, or flagged',
                },
                {
                  key: 'INCORRECT' as const,
                  label: 'Incorrect / Unanswered Only',
                  count: setupData?.reviewCounts.incorrect ?? 0,
                  desc: 'Questions where your submitted answer was not correct',
                },
                {
                  key: 'FLAGGED' as const,
                  label: 'Flagged Questions Only',
                  count: setupData?.reviewCounts.flagged ?? 0,
                  desc: 'Questions you explicitly bookmarked for review',
                },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setReviewFilter(item.key)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    reviewFilter === item.key
                      ? 'border-primary bg-accent/60'
                      : 'bg-card hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">{item.label}</span>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{item.desc}</p>
                </button>
              ))}
            </div>

            {(setupData?.reviewCounts.all ?? 0) === 0 && (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                You do not have any incorrect or flagged questions in your exam history yet. Complete a Full Exam or Practice Session first to unlock targeted historical review.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <span className="text-xs text-muted-foreground">
                Immediate answer verification and explanations are automatically enabled in Review Mode.
              </span>
              <Button
                size="lg"
                onClick={handleStartExam}
                disabled={
                  starting ||
                  (reviewFilter === 'ALL' && (setupData?.reviewCounts.all ?? 0) === 0) ||
                  (reviewFilter === 'INCORRECT' && (setupData?.reviewCounts.incorrect ?? 0) === 0) ||
                  (reviewFilter === 'FLAGGED' && (setupData?.reviewCounts.flagged ?? 0) === 0)
                }
              >
                {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                <span>Start Review Session</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}

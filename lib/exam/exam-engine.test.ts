import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  blueprintTopicTotal,
  blueprintTotal,
  FULL_BLUEPRINT,
  QUESTION_TYPES,
  TOPICS,
} from './config.ts'
import {
  blueprintShortages,
  buildFullExam,
  buildPractice,
  buildReview,
  countPool,
  type PoolItem,
} from './generate.ts'
import { isExamReady, questionIssues } from './quality.ts'
import {
  gradeAttempt,
  interpretScore,
  isCorrect,
  percent,
  sanitizeSelection,
  type GradableQuestion,
} from './scoring.ts'
import {
  canAcceptAnswers,
  finalStatus,
  formatClock,
  isExpired,
  secondsRemaining,
} from './timer.ts'
import {
  compareWithPrevious,
  recommendNext,
  summarizeHistory,
  trendSeries,
  type AttemptSummary,
} from './analytics.ts'
import {
  extractReviewQuestionIds,
  packAttemptDetails,
  sanitizeQuestionsForClient,
  toAttemptSummary,
  unpackAttemptRow,
} from '../exam-service.ts'

function createSyntheticPool(multiplier = 1): PoolItem[] {
  const pool: PoolItem[] = []
  let seq = 1
  for (const topic of TOPICS) {
    for (const type of QUESTION_TYPES) {
      const count = Math.ceil(FULL_BLUEPRINT[topic][type] * multiplier)
      for (let i = 0; i < count; i++) {
        pool.push({ id: `q-${topic}-${type}-${seq++}`, topic, type })
      }
    }
  }
  return pool
}

test('Blueprint configuration matches 60-question specification (30 openEuler, 18 openGauss, 12 Kunpeng)', () => {
  assert.equal(blueprintTotal(), 60)
  assert.equal(blueprintTopicTotal('OPENEULER'), 30)
  assert.equal(blueprintTopicTotal('OPENGAUSS'), 18)
  assert.equal(blueprintTopicTotal('KUNPENG'), 12)

  const singleTotal = TOPICS.reduce((acc, t) => acc + FULL_BLUEPRINT[t].SINGLE, 0)
  const multipleTotal = TOPICS.reduce((acc, t) => acc + FULL_BLUEPRINT[t].MULTIPLE, 0)
  const booleanTotal = TOPICS.reduce((acc, t) => acc + FULL_BLUEPRINT[t].BOOLEAN, 0)
  assert.equal(singleTotal, 30)
  assert.equal(multipleTotal, 15)
  assert.equal(booleanTotal, 15)
})

test('Full exam generation respects the exact blueprint when sufficient questions exist', () => {
  const pool = createSyntheticPool(2) // 120 questions
  const result = buildFullExam(pool, () => 0.42)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.ids.length, 60)
    assert.equal(new Set(result.ids).size, 60)
    const selectedItems = result.ids.map((id) => pool.find((p) => p.id === id)!)
    const selectedCounts = countPool(selectedItems)
    for (const topic of TOPICS) {
      for (const type of QUESTION_TYPES) {
        assert.equal(selectedCounts[topic][type], FULL_BLUEPRINT[topic][type])
      }
    }
  }
})

test('Insufficient question bank is detected without fabricating placeholder questions', () => {
  const smallPool = createSyntheticPool(1).filter(
    (item) => !(item.topic === 'KUNPENG' && item.type === 'BOOLEAN'),
  )
  const shortages = blueprintShortages(smallPool)
  assert.equal(shortages.length, 1)
  assert.deepEqual(shortages[0], {
    topic: 'KUNPENG',
    type: 'BOOLEAN',
    needed: 4,
    available: 0,
  })

  const fullResult = buildFullExam(smallPool)
  assert.equal(fullResult.ok, false)

  // Practice mode still works with real available questions without inventing placeholders
  const practice = buildPractice(smallPool, ['KUNPENG'], 20)
  assert.equal(practice.ids.length, 8) // 6 SINGLE + 2 MULTIPLE available in Kunpeng
  assert.equal(practice.short, true)
})

test('Review mode selects only from previously incorrect or flagged question IDs', () => {
  const pool = createSyntheticPool(1)
  const targetIds = [pool[0].id, pool[15].id, pool[45].id]
  const review = buildReview(pool, targetIds, TOPICS, 10)
  assert.equal(review.ids.length, 3)
  assert.equal(review.short, false)

  const emptyReview = buildReview(pool, [], TOPICS, 10)
  assert.equal(emptyReview.ids.length, 0)
  assert.equal(emptyReview.short, true)
})

test('SINGLE, MULTIPLE, and BOOLEAN answer sanitization and strict scoring', () => {
  const singleQ: GradableQuestion = {
    id: 'q1',
    topic: 'OPENEULER',
    type: 'SINGLE',
    question_text: 'Which command shows kernel version?',
    options: { A: 'uname -r', B: 'ls', C: 'pwd', D: 'whoami' },
    correct_answers: ['A'],
    explanation: 'uname -r prints kernel release.',
  }
  const multiQ: GradableQuestion = {
    id: 'q2',
    topic: 'OPENGAUSS',
    type: 'MULTIPLE',
    question_text: 'Select two valid openGauss features:',
    options: { A: 'MVCC', B: 'MOT', C: 'Invalid1', D: 'Invalid2' },
    correct_answers: ['A', 'B'],
    explanation: 'Both MVCC and MOT are supported.',
  }
  const boolQ: GradableQuestion = {
    id: 'q3',
    topic: 'KUNPENG',
    type: 'BOOLEAN',
    question_text: 'Kunpeng 920 is based on ARMv8 architecture.',
    options: { A: 'True', B: 'False' },
    correct_answers: ['A'],
    explanation: 'Kunpeng 920 implements ARMv8.2.',
  }

  assert.deepEqual(sanitizeSelection(singleQ, ['A', 'B', 'Z']), ['A'])
  assert.equal(isCorrect(singleQ, ['A']), true)
  assert.equal(isCorrect(singleQ, ['B']), false)
  assert.equal(isCorrect(singleQ, []), false)

  assert.equal(isCorrect(multiQ, ['B', 'A']), true)
  assert.equal(isCorrect(multiQ, ['A']), false)
  assert.equal(isCorrect(multiQ, ['A', 'B', 'C']), false)

  assert.equal(isCorrect(boolQ, ['A']), true)
  assert.equal(isCorrect(boolQ, ['B']), false)

  const graded = gradeAttempt(
    [singleQ, multiQ, boolQ],
    { q1: ['A'], q2: ['A'] },
    ['q2'],
  )
  assert.equal(graded.score, 1)
  assert.equal(graded.total, 3)
  assert.equal(graded.answered, 2)
  assert.deepEqual(graded.topicStats.OPENEULER, { total: 1, correct: 1, incorrect: 0, unanswered: 0 })
  assert.deepEqual(graded.topicStats.OPENGAUSS, { total: 1, correct: 0, incorrect: 1, unanswered: 0 })
  assert.deepEqual(graded.topicStats.KUNPENG, { total: 1, correct: 0, incorrect: 0, unanswered: 1 })
  assert.equal(graded.results[1].flagged, true)
})

test('Active scored exam sanitization never leaks correct_answers or explanations to client', () => {
  const questions: GradableQuestion[] = [
    {
      id: 'q1',
      topic: 'OPENEULER',
      type: 'SINGLE',
      question_text: 'Test?',
      options: { A: '1', B: '2' },
      correct_answers: ['A'],
      explanation: 'Secret explanation',
    },
  ]

  const fullSanitized = sanitizeQuestionsForClient(questions, 'FULL', true)
  assert.equal(fullSanitized[0].correct_answers, undefined)
  assert.equal(fullSanitized[0].explanation, undefined)

  const practiceNoFeedback = sanitizeQuestionsForClient(questions, 'PRACTICE', false)
  assert.equal(practiceNoFeedback[0].correct_answers, undefined)

  const practiceWithFeedback = sanitizeQuestionsForClient(questions, 'PRACTICE', true)
  assert.deepEqual(practiceWithFeedback[0].correct_answers, ['A'])
  assert.equal(practiceWithFeedback[0].explanation, 'Secret explanation')
})

test('Timer expiry, grace period, and status transitions work accurately', () => {
  const now = 1_700_000_000_000
  const future = new Date(now + 125_000).toISOString()
  const justExpired = new Date(now - 5_000).toISOString()
  const longExpired = new Date(now - 30_000).toISOString()

  assert.equal(secondsRemaining(future, now), 125)
  assert.equal(formatClock(125), '02:05')
  assert.equal(formatClock(5400), '1:30:00')

  assert.equal(isExpired(future, now), false)
  assert.equal(isExpired(justExpired, now), true)
  assert.equal(canAcceptAnswers('IN_PROGRESS', justExpired, now), true)
  assert.equal(canAcceptAnswers('IN_PROGRESS', longExpired, now), false)
  assert.equal(canAcceptAnswers('SUBMITTED', future, now), false)

  assert.equal(finalStatus(future, now), 'SUBMITTED')
  assert.equal(finalStatus(justExpired, now), 'EXPIRED')
})

test('Historical analytics & comparisons handle zero, one, and multiple attempts without mock stats', () => {
  const emptySummary = summarizeHistory([])
  assert.deepEqual(emptySummary, { count: 0, latest: null, best: null, average: null })
  assert.equal(recommendNext([]), null)
  assert.deepEqual(trendSeries([]), [])

  const a1: AttemptSummary = {
    id: 'att-1',
    mode: 'FULL',
    submitted_at: '2026-10-20T10:00:00Z',
    score: 36,
    total: 60,
    topic_stats: {
      OPENEULER: { total: 30, correct: 21, incorrect: 9, unanswered: 0 },
      OPENGAUSS: { total: 18, correct: 9, incorrect: 9, unanswered: 0 },
      KUNPENG: { total: 12, correct: 6, incorrect: 6, unanswered: 0 },
    },
  }
  const singleComp = compareWithPrevious([a1], 'att-1')
  assert.equal(singleComp.hasPrevious, false)
  assert.equal(singleComp.deltaPoints, null)

  const a2: AttemptSummary = {
    id: 'att-2',
    mode: 'FULL',
    submitted_at: '2026-10-22T10:00:00Z',
    score: 45,
    total: 60,
    topic_stats: {
      OPENEULER: { total: 30, correct: 24, incorrect: 6, unanswered: 0 },
      OPENGAUSS: { total: 18, correct: 12, incorrect: 6, unanswered: 0 },
      KUNPENG: { total: 12, correct: 9, incorrect: 3, unanswered: 0 },
    },
  }

  const multiSummary = summarizeHistory([a1, a2])
  assert.equal(multiSummary.count, 2)
  assert.equal(multiSummary.latest, 75)
  assert.equal(multiSummary.best, 75)
  assert.equal(multiSummary.average, 67.5)

  const multiComp = compareWithPrevious([a1, a2], 'att-2')
  assert.equal(multiComp.hasPrevious, true)
  assert.equal(multiComp.previousId, 'att-1')
  assert.equal(multiComp.deltaPoints, 15)
  assert.equal(multiComp.perTopic.OPENEULER.delta, 10)
  assert.equal(multiComp.perTopic.KUNPENG.delta, 25)

  const rec = recommendNext([a1, a2])
  assert.equal(rec?.topic, 'OPENGAUSS')
})

test('packAttemptDetails and unpackAttemptRow work with base exam_attempts schema without extra columns', () => {
  const packed = packAttemptDetails({
    mode: 'PRACTICE',
    status: 'IN_PROGRESS',
    started_at: '2026-10-24T10:00:00Z',
    expires_at: '2026-10-24T10:30:00Z',
    submitted_at: null,
    duration_seconds: 1800,
    time_used_seconds: null,
    question_ids: ['q-1', 'q-2'],
    answers: { 'q-1': ['A'] },
    flagged_ids: ['q-2'],
    topic_stats: null,
    practice_config: { topics: ['OPENEULER'], immediateFeedback: true, requestedCount: 2 },
    results: [],
  })

  // Simulate base Supabase row with ONLY (id, user_id, score, total, details, created_at)
  const dbRow = {
    id: 'attempt-uuid-1',
    user_id: 'user-uuid-1',
    score: 0,
    total: 2,
    details: packed,
    created_at: '2026-10-24T10:00:00Z',
  }

  const unpacked = unpackAttemptRow(dbRow)
  assert.equal(unpacked.id, 'attempt-uuid-1')
  assert.equal(unpacked.mode, 'PRACTICE')
  assert.equal(unpacked.status, 'IN_PROGRESS')
  assert.deepEqual(unpacked.question_ids, ['q-1', 'q-2'])
  assert.deepEqual(unpacked.answers, { 'q-1': ['A'] })
  assert.deepEqual(unpacked.flagged_ids, ['q-2'])
  assert.equal(unpacked.practice_config?.immediateFeedback, true)
})

test('Question quality check and legacy attempt normalization', () => {
  const healthy = questionIssues({
    topic: 'OPENEULER',
    type: 'BOOLEAN',
    question_text: 'Is openEuler Linux-based?',
    options: { A: 'True', B: 'False' },
    correct_answers: ['A'],
    explanation: 'Yes, openEuler is an enterprise Linux distribution.',
  })
  assert.equal(healthy.length, 0)
  assert.equal(
    isExamReady({
      topic: 'OPENEULER',
      type: 'BOOLEAN',
      question_text: 'Is openEuler Linux-based?',
      options: { A: 'True', B: 'False' },
      correct_answers: ['A'],
      explanation: '',
    }),
    true,
  )

  const legacyRow = {
    id: 'leg-1',
    user_id: 'u-1',
    score: 1,
    total: 2,
    created_at: '2026-10-01T00:00:00Z',
    details: [
      { question_id: 'q-1', topic: 'OPENEULER', correct: true },
      { question_id: 'q-2', topic: 'KUNPENG', correct: false },
    ],
  }
  const norm = toAttemptSummary(legacyRow)
  assert.equal(norm.topic_stats?.OPENEULER.correct, 1)
  assert.equal(norm.topic_stats?.KUNPENG.incorrect, 1)

  const extracted = extractReviewQuestionIds([legacyRow])
  assert.deepEqual(extracted.incorrectIds, ['q-2'])
  assert.equal(percent(45, 60), 75)
  assert.equal(interpretScore(75).tone, 'success')
})

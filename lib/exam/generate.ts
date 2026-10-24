import { FULL_BLUEPRINT, QUESTION_TYPES, TOPICS, type QuestionType, type Topic } from './config.ts'

export interface PoolItem { id: string; topic: Topic; type: QuestionType }
export interface Shortage { topic: Topic; type: QuestionType; needed: number; available: number }
export type FullExamResult = { ok: true; ids: string[] } | { ok: false; shortages: Shortage[] }

/** Fisher–Yates; `rng` is injectable so tests are deterministic. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function countPool(pool: readonly PoolItem[]) {
  const counts = Object.fromEntries(TOPICS.map((t) => [t, Object.fromEntries(QUESTION_TYPES.map((q) => [q, 0]))])) as Record<Topic, Record<QuestionType, number>>
  for (const item of pool) if (counts[item.topic]?.[item.type] !== undefined) counts[item.topic][item.type]++
  return counts
}

/** Where the bank cannot satisfy the blueprint. Empty array = a full exam can be generated. */
export function blueprintShortages(pool: readonly PoolItem[], blueprint = FULL_BLUEPRINT): Shortage[] {
  const counts = countPool(pool)
  const shortages: Shortage[] = []
  for (const topic of TOPICS) for (const type of QUESTION_TYPES) {
    const needed = blueprint[topic][type]
    if (counts[topic][type] < needed) shortages.push({ topic, type, needed, available: counts[topic][type] })
  }
  return shortages
}

/** Exact-blueprint selection. Never pads: if the bank is short it reports the shortage instead. */
export function buildFullExam(pool: readonly PoolItem[], rng: () => number = Math.random, blueprint = FULL_BLUEPRINT): FullExamResult {
  const shortages = blueprintShortages(pool, blueprint)
  if (shortages.length) return { ok: false, shortages }
  const ids: string[] = []
  for (const topic of TOPICS) for (const type of QUESTION_TYPES) {
    const candidates = pool.filter((item) => item.topic === topic && item.type === type)
    ids.push(...shuffle(candidates, rng).slice(0, blueprint[topic][type]).map((item) => item.id))
  }
  return { ok: true, ids: shuffle(ids, rng) }
}

/** Practice selection: only real questions matching selected topics & optional types, at most `count`. */
export function buildPractice(
  pool: readonly PoolItem[],
  topics: readonly Topic[],
  count: number,
  rng: () => number = Math.random,
  types: readonly QuestionType[] = QUESTION_TYPES,
) {
  const eligible = pool.filter((item) => topics.includes(item.topic) && types.includes(item.type))
  const ids = shuffle(eligible, rng).slice(0, Math.max(0, count)).map((item) => item.id)
  return { ids, available: eligible.length, short: ids.length < count }
}

/**
 * Review mode selection: selects only from questions the user previously answered incorrectly
 * or flagged for review (`reviewQuestionIds`), filtered by optional topics. Never fabricates questions.
 */
export function buildReview(
  pool: readonly PoolItem[],
  reviewQuestionIds: readonly string[],
  topics: readonly Topic[] = TOPICS,
  count = 30,
  rng: () => number = Math.random,
) {
  const targetSet = new Set(reviewQuestionIds)
  const eligible = pool.filter((item) => targetSet.has(item.id) && topics.includes(item.topic))
  const ids = shuffle(eligible, rng).slice(0, Math.max(0, count)).map((item) => item.id)
  return { ids, available: eligible.length, short: ids.length === 0 }
}

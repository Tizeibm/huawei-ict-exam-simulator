// Central exam configuration. Change values here; nothing else hard-codes them.
// NOTE: this blueprint, duration and pass mark are ICT Prep project settings.
// They are NOT claimed to be Huawei's official exam parameters.

export type Topic = 'OPENEULER' | 'OPENGAUSS' | 'KUNPENG'
export type QuestionType = 'SINGLE' | 'MULTIPLE' | 'BOOLEAN'
export type ExamMode = 'FULL' | 'PRACTICE' | 'REVIEW'

export const TOPICS: readonly Topic[] = ['OPENEULER', 'OPENGAUSS', 'KUNPENG']
export const QUESTION_TYPES: readonly QuestionType[] = ['SINGLE', 'MULTIPLE', 'BOOLEAN']

export const TOPIC_LABELS: Record<Topic, string> = { OPENEULER: 'openEuler', OPENGAUSS: 'openGauss', KUNPENG: 'Kunpeng' }
export const TYPE_LABELS: Record<QuestionType, string> = { SINGLE: 'Single choice', MULTIPLE: 'Multiple choice', BOOLEAN: 'True / False' }

/** Questions required per technology and type for a full simulated exam (60 total). */
export const FULL_BLUEPRINT: Record<Topic, Record<QuestionType, number>> = {
  OPENEULER: { SINGLE: 15, MULTIPLE: 8, BOOLEAN: 7 },
  OPENGAUSS: { SINGLE: 9, MULTIPLE: 5, BOOLEAN: 4 },
  KUNPENG: { SINGLE: 6, MULTIPLE: 2, BOOLEAN: 4 },
}

export const FULL_EXAM_DURATION_MINUTES = 90
/** Practice and review sessions are untimed. */
export const PRACTICE_MIN_QUESTIONS = 5
export const PRACTICE_MAX_QUESTIONS = 60
/** Server accepts a submission this long after expiry to absorb network latency. */
export const SUBMIT_GRACE_SECONDS = 10
/** Simulator-only threshold used to label results; not an official pass mark. */
export const SIMULATOR_PASS_PERCENT = 60

export function blueprintTotal(blueprint = FULL_BLUEPRINT) {
  return TOPICS.reduce((sum, topic) => sum + QUESTION_TYPES.reduce((inner, type) => inner + blueprint[topic][type], 0), 0)
}
export function blueprintTopicTotal(topic: Topic, blueprint = FULL_BLUEPRINT) {
  return QUESTION_TYPES.reduce((sum, type) => sum + blueprint[topic][type], 0)
}

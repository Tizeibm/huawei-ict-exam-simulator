// Central exam configuration. Change values here; nothing else hard-codes them.
// NOTE: this blueprint, duration and pass mark are ICT Prep project settings.
// They are NOT claimed to be Huawei's official exam parameters.

export type Topic = 'OPENEULER' | 'OPENGAUSS' | 'KUNPENG' | 'DATACOM' | 'SECURITY' | 'WLAN'
export type QuestionType = 'SINGLE' | 'MULTIPLE' | 'BOOLEAN'
export type ExamMode = 'FULL' | 'PRACTICE' | 'REVIEW'
export type Track = 'COMPUTING' | 'NETWORK'
export type CompetitionRound = 'PRELIMINARY' | 'NATIONAL'

export const TRACKS: readonly Track[] = ['COMPUTING', 'NETWORK']
export const COMPETITION_ROUNDS: readonly CompetitionRound[] = ['PRELIMINARY', 'NATIONAL']
export const TRACK_LABELS: Record<Track, string> = { COMPUTING: 'Computing Track', NETWORK: 'Network Track' }
export const ROUND_LABELS: Record<CompetitionRound, string> = {
  PRELIMINARY: 'Preliminary Round',
  NATIONAL: 'National Round',
}

export const COMPUTING_TOPICS: readonly Topic[] = ['OPENEULER', 'OPENGAUSS', 'KUNPENG']
export const NETWORK_TOPICS: readonly Topic[] = ['DATACOM', 'SECURITY', 'WLAN']
export const TOPICS: readonly Topic[] = [...COMPUTING_TOPICS, ...NETWORK_TOPICS]
export const TOPICS_BY_TRACK: Record<Track, readonly Topic[]> = {
  COMPUTING: COMPUTING_TOPICS,
  NETWORK: NETWORK_TOPICS,
}
export const QUESTION_TYPES: readonly QuestionType[] = ['SINGLE', 'MULTIPLE', 'BOOLEAN']

export const TOPIC_LABELS: Record<Topic, string> = {
  OPENEULER: 'openEuler', OPENGAUSS: 'openGauss', KUNPENG: 'Kunpeng',
  DATACOM: 'DATACOM', SECURITY: 'Security', WLAN: 'WLAN',
}
export const KNOWN_TECHNOLOGIES = TOPICS
export const TECHNOLOGY_LABELS = TOPIC_LABELS
export const TYPE_LABELS: Record<QuestionType, string> = { SINGLE: 'Single choice', MULTIPLE: 'Multiple choice', BOOLEAN: 'True / False' }

const EMPTY_TOPIC_BLUEPRINT = { SINGLE: 0, MULTIPLE: 0, BOOLEAN: 0 }

/** Project-configured allocation for a 60-question Computing Track simulation. */
export const FULL_BLUEPRINT: Record<Topic, Record<QuestionType, number>> = {
  OPENEULER: { SINGLE: 15, MULTIPLE: 8, BOOLEAN: 7 },
  OPENGAUSS: { SINGLE: 9, MULTIPLE: 5, BOOLEAN: 4 },
  KUNPENG: { SINGLE: 6, MULTIPLE: 2, BOOLEAN: 4 },
  DATACOM: EMPTY_TOPIC_BLUEPRINT,
  SECURITY: EMPTY_TOPIC_BLUEPRINT,
  WLAN: EMPTY_TOPIC_BLUEPRINT,
}

/** Network simulation uses an even per-technology allocation (20 each, 60 total). */
export const NETWORK_FULL_BLUEPRINT: Record<Topic, Record<QuestionType, number>> = {
  OPENEULER: EMPTY_TOPIC_BLUEPRINT,
  OPENGAUSS: EMPTY_TOPIC_BLUEPRINT,
  KUNPENG: EMPTY_TOPIC_BLUEPRINT,
  DATACOM: { SINGLE: 10, MULTIPLE: 5, BOOLEAN: 5 },
  SECURITY: { SINGLE: 10, MULTIPLE: 5, BOOLEAN: 5 },
  WLAN: { SINGLE: 10, MULTIPLE: 5, BOOLEAN: 5 },
}
export const TRACK_BLUEPRINTS: Record<Track, Record<Topic, Record<QuestionType, number>>> = {
  COMPUTING: FULL_BLUEPRINT,
  NETWORK: NETWORK_FULL_BLUEPRINT,
}
export const blueprintForTrack = (track: Track) => TRACK_BLUEPRINTS[track]

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

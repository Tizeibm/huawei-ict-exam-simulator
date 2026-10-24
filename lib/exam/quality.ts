import type { QuestionType, Topic } from './config.ts'

export interface QualityInput {
  topic: string
  type: string
  question_text: string
  options: Record<string, string> | null
  correct_answers: string[] | null
  explanation: string | null
}

/** Data-quality problems for a stored question; empty array = healthy. */
export function questionIssues(q: QualityInput): string[] {
  const issues: string[] = []
  const options = q.options ?? {}
  const keys = Object.keys(options)
  const answers = q.correct_answers ?? []
  if (!(['OPENEULER', 'OPENGAUSS', 'KUNPENG'] as Topic[]).includes(q.topic as Topic)) issues.push('Unknown technology')
  if (!(['SINGLE', 'MULTIPLE', 'BOOLEAN'] as QuestionType[]).includes(q.type as QuestionType)) issues.push('Unknown type')
  if (keys.length < 2) issues.push('Fewer than two options')
  if (!answers.length) issues.push('No correct answer')
  if (answers.some((a) => !keys.includes(a))) issues.push('Correct answer does not match an option')
  if (q.type === 'SINGLE' && answers.length !== 1) issues.push('SINGLE needs exactly one correct answer')
  if (q.type === 'MULTIPLE' && answers.length < 2) issues.push('MULTIPLE needs at least two correct answers')
  if (q.type === 'BOOLEAN' && keys.slice().sort().join(',') !== 'A,B') issues.push('BOOLEAN needs options A and B')
  if (!(q.explanation ?? '').trim()) issues.push('Missing explanation')
  return issues
}

/** A question is usable in an exam if it has no structural problems (explanations are optional). */
export function isExamReady(q: QualityInput) {
  return questionIssues(q).filter((issue) => issue !== 'Missing explanation').length === 0
}

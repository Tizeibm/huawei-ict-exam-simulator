import { z } from 'zod'
import { questionIssues } from './exam/quality'

export const singleQuestionSchema = z.object({
  topic: z.preprocess((val) => (typeof val === 'string' ? val.trim().toUpperCase() : val), z.enum(['OPENEULER', 'OPENGAUSS', 'KUNPENG'])),
  type: z.preprocess((val) => (typeof val === 'string' ? val.trim().toUpperCase() : val), z.enum(['SINGLE', 'MULTIPLE', 'BOOLEAN'])),
  question_text: z.string().trim().min(5, 'Question text must be at least 5 characters.').max(5000),
  options: z.record(z.string().trim().min(1), z.string().trim().min(1).max(1000)),
  correct_answers: z.array(z.string().trim().min(1)).min(1, 'At least one correct answer is required.'),
  explanation: z.string().trim().max(5000).optional().default(''),
}).superRefine((question, ctx) => {
  const optionKeys = Object.keys(question.options)
  if (optionKeys.length < 2) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'At least two answer options are required.' })
  }
  const keySet = new Set(optionKeys)
  const invalidAnswers = question.correct_answers.filter((answer) => !keySet.has(answer))
  if (invalidAnswers.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['correct_answers'], message: `Correct answer key(s) [${invalidAnswers.join(', ')}] must match option keys.` })
  }
  if (question.type === 'SINGLE' && question.correct_answers.length !== 1) {
    ctx.addIssue({ code: 'custom', path: ['correct_answers'], message: 'SINGLE choice questions require exactly one correct answer.' })
  }
  if (question.type === 'MULTIPLE' && question.correct_answers.length < 2) {
    ctx.addIssue({ code: 'custom', path: ['correct_answers'], message: 'MULTIPLE choice questions require at least two correct answers.' })
  }
  if (question.type === 'BOOLEAN' && optionKeys.slice().sort().join(',') !== 'A,B') {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'BOOLEAN questions require exact option keys A and B.' })
  }
})

export const payloadSchema = z.object({
  questions: z.array(singleQuestionSchema).min(1, 'At least one question is required.').max(1000, 'Maximum 1000 questions per batch.'),
  skipDuplicates: z.boolean().optional().default(false),
}).superRefine((payload, ctx) => {
  const seen = new Set<string>()
  for (const [index, question] of payload.questions.entries()) {
    const identity = `${question.topic}\u0000${question.type}\u0000${question.question_text.toLowerCase()}`
    if (seen.has(identity)) {
      ctx.addIssue({ code: 'custom', path: ['questions', index], message: 'Duplicate question within the uploaded batch.' })
    }
    seen.add(identity)
  }
})

export type SingleQuestionInput = z.infer<typeof singleQuestionSchema>
export type QuestionImportPayload = z.infer<typeof payloadSchema>

export interface ImportPreviewItem {
  index: number
  sourceFile: string
  topic: string
  type: string
  question_text: string
  options: Record<string, string>
  correct_answers: string[]
  explanation: string
  valid: boolean
  errors: string[]
  warnings: string[]
  duplicateInBatch: boolean
  duplicateInBank: boolean
}

/**
 * Parses and validates raw JSON content from one or multiple uploaded files on the client or server,
 * returning structured preview items, duplicate detection, and summary statistics.
 */
export function buildImportPreview(
  files: readonly { name: string; content: unknown }[],
  existingQuestions: readonly { topic: string; type: string; question_text: string }[] = [],
) {
  const existingSet = new Set(
    existingQuestions.map((q) => `${q.topic.toUpperCase()}\u0000${q.type.toUpperCase()}\u0000${q.question_text.trim().toLowerCase()}`),
  )
  const batchSeen = new Set<string>()
  const items: ImportPreviewItem[] = []
  const fileErrors: { file: string; message: string }[] = []

  let globalIndex = 0
  for (const file of files) {
    let rawList: unknown[] | null = null
    if (Array.isArray(file.content)) {
      rawList = file.content
    } else if (file.content && typeof file.content === 'object' && Array.isArray((file.content as { questions?: unknown }).questions)) {
      rawList = (file.content as { questions: unknown[] }).questions
    } else {
      fileErrors.push({ file: file.name, message: 'JSON must be an array of questions or an object with a "questions" array.' })
      continue
    }

    for (const raw of rawList) {
      const idx = globalIndex++
      const parsed = singleQuestionSchema.safeParse(raw)
      const rawObj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const topic = typeof rawObj.topic === 'string' ? rawObj.topic.trim().toUpperCase() : 'UNKNOWN'
      const type = typeof rawObj.type === 'string' ? rawObj.type.trim().toUpperCase() : 'UNKNOWN'
      const question_text = typeof rawObj.question_text === 'string' ? rawObj.question_text.trim() : ''
      const options = (rawObj.options && typeof rawObj.options === 'object' && !Array.isArray(rawObj.options))
        ? (rawObj.options as Record<string, string>)
        : {}
      const correct_answers = Array.isArray(rawObj.correct_answers)
        ? rawObj.correct_answers.filter((a): a is string => typeof a === 'string')
        : []
      const explanation = typeof rawObj.explanation === 'string' ? rawObj.explanation.trim() : ''

      const identity = `${topic}\u0000${type}\u0000${question_text.toLowerCase()}`
      const duplicateInBatch = question_text.length > 0 && batchSeen.has(identity)
      if (question_text.length > 0) batchSeen.add(identity)
      const duplicateInBank = question_text.length > 0 && existingSet.has(identity)

      const errors = parsed.success ? [] : parsed.error.issues.map((i) => i.message)
      if (duplicateInBatch) errors.push('Duplicate question within the selected upload files.')

      const quality = questionIssues({ topic, type, question_text, options, correct_answers, explanation })
      const warnings = quality.filter((q) => q === 'Missing explanation')

      items.push({
        index: idx,
        sourceFile: file.name,
        topic,
        type,
        question_text,
        options,
        correct_answers,
        explanation,
        valid: parsed.success && !duplicateInBatch,
        errors,
        warnings,
        duplicateInBatch,
        duplicateInBank,
      })
    }
  }

  const readyToInsert = items.filter((item) => item.valid && !item.duplicateInBank)
  return {
    items,
    fileErrors,
    summary: {
      totalParsed: items.length,
      validCount: items.filter((i) => i.valid).length,
      invalidCount: items.filter((i) => !i.valid).length,
      duplicateInBatchCount: items.filter((i) => i.duplicateInBatch).length,
      duplicateInBankCount: items.filter((i) => i.duplicateInBank).length,
      missingExplanationCount: items.filter((i) => i.warnings.includes('Missing explanation')).length,
      readyToInsertCount: readyToInsert.length,
    },
  }
}

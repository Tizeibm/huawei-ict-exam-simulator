import { z } from 'zod'
import { questionIssues } from './exam/quality'

const enumValue = (values: readonly string[]) => z.preprocess((value) => (typeof value === 'string' ? value.trim().toUpperCase() : value), z.enum(values as [string, ...string[]]))

export const importMetadataSchema = z.object({
  bank_id: enumValue(['COMPUTING_PRELIMINARY', 'NETWORK_PRELIMINARY', 'COMPUTING_NATIONAL', 'NETWORK_NATIONAL']),
  track: enumValue(['COMPUTING', 'NETWORK']),
  round: enumValue(['PRELIMINARY', 'NATIONAL']),
  language: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Language must be a valid language code.'),
  total_questions: z.number().int().positive().optional(),
  generation_batch: z.number().int().positive().optional(),
  generation_batches_total: z.number().int().positive().optional(),
  reference_edition: z.string().trim().optional(),
  schema_version: z.string().trim().min(1).default('1.0'),
}).superRefine((metadata, ctx) => {
  if (metadata.schema_version !== '1.0') ctx.addIssue({ code: 'custom', path: ['schema_version'], message: `Unsupported schema version ${metadata.schema_version}. Only 1.0 is supported.` })
  if (metadata.total_questions !== undefined && metadata.total_questions < 1) ctx.addIssue({ code: 'custom', path: ['total_questions'], message: 'total_questions must be positive.' })
})

const optionSchema = z.object({ id: z.string().trim().min(1).max(10), text: z.string().trim().min(1).max(1000) })
const difficultySchema = enumValue(['EASY', 'MEDIUM', 'HARD', 'EXPERT', 'FOUNDATION', 'INTERMEDIATE', 'ADVANCED'])

const optionsSchema = z.union([
  z.record(z.string().trim().min(1), z.string().trim().min(1).max(1000)),
  z.array(optionSchema).min(2).transform((options) => Object.fromEntries(options.map((option) => [option.id, option.text]))),
])

export const singleQuestionSchema = z.object({
  external_id: z.string().trim().min(1).max(160).optional(),
  track: enumValue(['COMPUTING', 'NETWORK']),
  certification_level: enumValue(['HCIA', 'HCIP']),
  technology: z.string().trim().min(1).max(80),
  topic: z.string().trim().min(1).max(120),
  round_suitability: z.array(enumValue(['PRELIMINARY', 'NATIONAL'])).min(1),
  difficulty: difficultySchema,
  type: enumValue(['SINGLE', 'MULTIPLE', 'BOOLEAN']).optional(),
  question_type: enumValue(['SINGLE', 'MULTIPLE', 'BOOLEAN']).optional(),
  language: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional().default('en'),
  question_text: z.string().trim().min(5, 'Question text must be at least 5 characters.').max(5000),
  options: optionsSchema,
  correct_answers: z.array(z.string().trim().min(1)).min(1, 'At least one correct answer is required.'),
  explanation: z.string().trim().max(5000).optional().default(''),
  source_type: enumValue(['GENERATED', 'DOCUMENT', 'MANUAL']).optional().default('MANUAL'),
  source_reference: z.string().trim().max(1000).optional(),
  review_status: enumValue(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional().default('DRAFT'),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  version: z.number().int().positive().optional().default(1),
}).superRefine((question, ctx) => {
  const type = question.question_type ?? question.type
  if (!type) ctx.addIssue({ code: 'custom', path: ['question_type'], message: 'question_type is required.' })
  if (!question.type && !question.question_type) return
  if (question.round_suitability.length > 2) ctx.addIssue({ code: 'custom', path: ['round_suitability'], message: 'round_suitability may contain PRELIMINARY, NATIONAL, or both.' })
  if (question.type && question.question_type && question.type !== question.question_type) ctx.addIssue({ code: 'custom', path: ['question_type'], message: 'type and question_type must match.' })
  const optionKeys = Object.keys(question.options)
  if (new Set(optionKeys).size !== optionKeys.length || optionKeys.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must contain at least two unique IDs.' })
  const answers = new Set(question.correct_answers)
  const invalidAnswers = question.correct_answers.filter((answer) => !optionKeys.includes(answer) && !(type === 'BOOLEAN' && ['TRUE', 'FALSE'].includes(answer.toUpperCase())))
  if (invalidAnswers.length > 0) ctx.addIssue({ code: 'custom', path: ['correct_answers'], message: `Correct answer key(s) [${invalidAnswers.join(', ')}] must match option keys.` })
  if (type === 'SINGLE' && question.correct_answers.length !== 1) ctx.addIssue({ code: 'custom', path: ['correct_answers'], message: 'SINGLE choice questions require exactly one correct answer.' })
  if (type === 'MULTIPLE' && answers.size < 2) ctx.addIssue({ code: 'custom', path: ['correct_answers'], message: 'MULTIPLE choice questions require at least two correct answers.' })
  if (type === 'BOOLEAN' && optionKeys.length !== 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'BOOLEAN questions require exactly two options.' })
})

const normalizedQuestionSchema = singleQuestionSchema.transform((question) => ({
  ...question,
  type: question.question_type ?? question.type!,
  track: question.track ?? 'COMPUTING',
  technology: question.technology ?? question.topic,
  round_suitability: question.round_suitability ?? ['PRELIMINARY', 'NATIONAL'],
}))

export const payloadSchema = z.object({
  metadata: importMetadataSchema.optional(),
  questions: z.array(normalizedQuestionSchema).min(1, 'At least one question is required.').max(1000, 'Maximum 1000 questions per batch.'),
  skipDuplicates: z.boolean().optional().default(true),
  duplicate_strategy: z.enum(['SKIP', 'UPDATE', 'CANCEL']).optional().default('SKIP'),
}).superRefine((payload, ctx) => {
  if (payload.metadata && payload.metadata.total_questions !== undefined && payload.metadata.total_questions !== payload.questions.length) ctx.addIssue({ code: 'custom', path: ['metadata', 'total_questions'], message: `Metadata declares ${payload.metadata.total_questions} questions but ${payload.questions.length} were supplied.` })
  const seen = new Set<string>()
  for (const [index, question] of payload.questions.entries()) {
    const identity = question.external_id ?? `${question.track}\u0000${question.type}\u0000${question.question_text.toLowerCase()}`
    if (seen.has(identity)) ctx.addIssue({ code: 'custom', path: ['questions', index], message: 'Duplicate question identity within the uploaded batch.' })
    seen.add(identity)
  }
})

export type SingleQuestionInput = z.infer<typeof normalizedQuestionSchema>
export type QuestionImportPayload = z.infer<typeof payloadSchema>

export interface ImportPreviewItem {
  index: number
  sourceFile: string
  external_id?: string
  track: string
  certification_level: string
  language: string
  difficulty: string
  round_suitability: string[]
  technology: string
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

export function buildImportPreview(files: readonly { name: string; content: unknown }[], existingQuestions: readonly { external_id?: string | null; track?: string; type: string; topic: string; question_text: string }[] = []) {
  const existingSet = new Set(existingQuestions.map((q) => q.external_id || `${String(q.track ?? 'COMPUTING').toUpperCase()}\u0000${q.type.toUpperCase()}\u0000${q.question_text.trim().toLowerCase()}`))
  const batchSeen = new Set<string>()
  const items: ImportPreviewItem[] = []
  const fileErrors: { file: string; message: string }[] = []
  let globalIndex = 0
  for (const file of files) {
    const rawObject = file.content && typeof file.content === 'object' && !Array.isArray(file.content) ? file.content as { metadata?: unknown; questions?: unknown } : null
    const rawList = Array.isArray(file.content) ? file.content : rawObject?.questions
    if (!Array.isArray(rawList)) { fileErrors.push({ file: file.name, message: 'JSON must be an array or an object with metadata and a questions array.' }); continue }
    for (const raw of rawList) {
      const idx = globalIndex++
      const parsed = normalizedQuestionSchema.safeParse(raw)
      const rawObj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
      const preview = parsed.success ? parsed.data : { external_id: typeof rawObj.external_id === 'string' ? rawObj.external_id : undefined, track: 'UNKNOWN', certification_level: 'UNKNOWN', language: 'en', difficulty: 'UNKNOWN', round_suitability: [], technology: 'UNKNOWN', topic: 'UNKNOWN', type: 'UNKNOWN', question_text: typeof rawObj.question_text === 'string' ? rawObj.question_text.trim() : '', options: {}, correct_answers: [], explanation: '', source_type: 'DOCUMENT', source_reference: file.name, review_status: 'DRAFT', tags: [], version: 1 }
      const identity = preview.external_id ?? `${preview.track}\u0000${preview.type}\u0000${preview.question_text.toLowerCase()}`
      const duplicateInBatch = batchSeen.has(identity)
      batchSeen.add(identity)
      const duplicateInBank = existingSet.has(identity)
      const errors = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
      if (duplicateInBatch) errors.push('Duplicate question within the selected upload files.')
      const warnings = questionIssues({ topic: preview.topic, type: preview.type, question_text: preview.question_text, options: preview.options, correct_answers: preview.correct_answers, explanation: preview.explanation }).filter((issue) => issue === 'Missing explanation')
      items.push({ index: idx, sourceFile: file.name, external_id: preview.external_id, track: preview.track, certification_level: preview.certification_level, language: preview.language, difficulty: preview.difficulty, round_suitability: preview.round_suitability, technology: preview.technology, topic: preview.topic, type: preview.type, question_text: preview.question_text, options: preview.options, correct_answers: preview.correct_answers, explanation: preview.explanation, valid: parsed.success && !duplicateInBatch, errors, warnings, duplicateInBatch, duplicateInBank })
    }
  }
  const readyToInsert = items.filter((item) => item.valid && !item.duplicateInBank)
  return { items, fileErrors, summary: { totalParsed: items.length, validCount: items.filter((i) => i.valid).length, invalidCount: items.filter((i) => !i.valid).length, duplicateInBatchCount: items.filter((i) => i.duplicateInBatch).length, duplicateInBankCount: items.filter((i) => i.duplicateInBank).length, missingExplanationCount: items.filter((i) => i.warnings.includes('Missing explanation')).length, readyToInsertCount: readyToInsert.length } }
}

import { z } from 'zod'

const baseQuestionSchema = z.object({
  topic: z.enum(['OPENEULER', 'OPENGAUSS', 'KUNPENG']),
  type: z.enum(['SINGLE', 'MULTIPLE', 'BOOLEAN']),
  question_text: z.string().trim().min(1).max(5000),
  options: z.record(z.string(), z.string().trim().min(1).max(500)),
  correct_answers: z.array(z.string().trim().min(1)).min(1),
  explanation: z.string().trim().max(5000).default(''),
})

export const payloadSchema = z.object({
  questions: z.array(baseQuestionSchema).min(1).max(1000),
}).superRefine((payload, ctx) => {
  const seen = new Set<string>()
  for (const [index, question] of payload.questions.entries()) {
    const identity = `${question.topic}\u0000${question.type}\u0000${question.question_text}`
    if (seen.has(identity)) {
      ctx.addIssue({ code: 'custom', path: ['questions', index], message: 'Duplicate question in import.' })
    }
    seen.add(identity)

    const optionKeys = new Set(Object.keys(question.options))
    const invalidAnswers = question.correct_answers.filter((answer) => !optionKeys.has(answer))
    if (invalidAnswers.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['questions', index, 'correct_answers'], message: 'Every correct answer must match an option key.' })
    }

    if (question.type === 'SINGLE' && question.correct_answers.length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['questions', index, 'correct_answers'], message: 'SINGLE questions require exactly one correct answer.' })
    }
    if (question.type === 'BOOLEAN' && (Object.keys(question.options).sort().join(',') !== 'A,B')) {
      ctx.addIssue({ code: 'custom', path: ['questions', index, 'options'], message: 'BOOLEAN questions require A and B options.' })
    }
  }
})

export type QuestionImportPayload = z.infer<typeof payloadSchema>

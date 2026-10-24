import type { SupabaseClient } from '@supabase/supabase-js'

export type Topic = 'OPENEULER' | 'OPENGAUSS' | 'KUNPENG'
export type QuestionType = 'SINGLE' | 'MULTIPLE' | 'BOOLEAN'

export interface Question {
  id: string
  topic: Topic
  type: QuestionType
  question_text: string
  options: Record<string, string>
  correct_answers: string[]
  explanation: string
}

export async function fetchQuestions(supabase: SupabaseClient, limit = 60) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, topic, type, question_text, options, correct_answers, explanation')
    .limit(limit)

  if (error) throw error
  return (data ?? []) as Question[]
}

export function scoreQuestion(question: Question, answer: string[]) {
  return answer.length === question.correct_answers.length && answer.every((value) => question.correct_answers.includes(value))
}

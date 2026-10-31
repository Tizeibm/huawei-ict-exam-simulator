import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { payloadSchema } from '@/lib/question-import'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_BODY_BYTES = 2_000_000
const difficultyForDatabase = (difficulty: string) => ({ EASY: 'FOUNDATION', MEDIUM: 'INTERMEDIATE', HARD: 'ADVANCED', EXPERT: 'ADVANCED', FOUNDATION: 'FOUNDATION', INTERMEDIATE: 'INTERMEDIATE', ADVANCED: 'ADVANCED' }[difficulty.toUpperCase()] ?? 'FOUNDATION')
const topicForDatabase = (technology: string) => ({ OPENEULER: 'OPENEULER', OPENGAUSS: 'OPENGAUSS', KUNPENG: 'KUNPENG', DATACOM: 'DATACOM' }[technology.trim().toUpperCase()] ?? null)

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { user } = auth
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Import payload is too large (max 2 MB).' }, { status: 413 })

  let payload: unknown
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }) }
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid question import payload.', issues: parsed.error.flatten() }, { status: 400 })
  if (parsed.data.metadata) {
    const metadata = parsed.data.metadata
    const expectedTrack = metadata.bank_id.startsWith('COMPUTING_') ? 'COMPUTING' : 'NETWORK'
    const expectedRound = metadata.bank_id.endsWith('_PRELIMINARY') ? 'PRELIMINARY' : 'NATIONAL'
    if (metadata.track !== expectedTrack || metadata.round !== expectedRound) return NextResponse.json({ error: `bank_id ${metadata.bank_id} is inconsistent with track ${metadata.track} and round ${metadata.round}.` }, { status: 400 })
    if (!parsed.data.questions.every((question) => question.track === metadata.track)) return NextResponse.json({ error: 'Every question must match the metadata track.' }, { status: 400 })
    if (!parsed.data.questions.every((question) => question.round_suitability.includes(metadata.round))) return NextResponse.json({ error: 'Every question must be compatible with the metadata round.' }, { status: 400 })
    if (metadata.generation_batch && metadata.generation_batches_total && metadata.generation_batch > metadata.generation_batches_total) return NextResponse.json({ error: 'generation_batch cannot exceed generation_batches_total.' }, { status: 400 })
  }

  let privileged
  try { privileged = createAdminClient() } catch { return NextResponse.json({ error: 'Server service-role configuration is missing.' }, { status: 500 }) }
  const externalIds = parsed.data.questions.flatMap((question) => question.external_id ? [question.external_id] : [])
  const questionTexts = [...new Set(parsed.data.questions.map((question) => question.question_text))]
  const [textLookup, externalLookup] = await Promise.all([
    questionTexts.length ? privileged.from('questions').select('id, external_id, track, topic, type, question_text, review_status').in('question_text', questionTexts) : Promise.resolve({ data: [], error: null }),
    externalIds.length ? privileged.from('questions').select('id, external_id, track, topic, type, question_text, review_status').in('external_id', externalIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (textLookup.error || externalLookup.error) return NextResponse.json({ error: 'Unable to check for existing questions.' }, { status: 500 })

  const existingByIdentity = new Map<string, { id: string; review_status?: string }>()
  for (const question of [...(textLookup.data ?? []), ...(externalLookup.data ?? [])]) {
    existingByIdentity.set(question.external_id ?? `${String(question.track ?? 'COMPUTING').toUpperCase()}\u0000${String(question.type).toUpperCase()}\u0000${String(question.question_text).trim().toLowerCase()}`, question)
  }
  const identity = (question: typeof parsed.data.questions[number]) => question.external_id ?? `${question.track}\u0000${question.type}\u0000${question.question_text.toLowerCase()}`
  const duplicates = parsed.data.questions.filter((question) => existingByIdentity.has(identity(question)))
  if (duplicates.length > 0 && parsed.data.duplicate_strategy === 'CANCEL') return NextResponse.json({ error: `${duplicates.length} duplicate question(s) found. Import cancelled.`, duplicates: duplicates.map((question) => ({ external_id: question.external_id, question_text: question.question_text })) }, { status: 409 })
  if (duplicates.length > 0 && parsed.data.duplicate_strategy === 'UPDATE') {
    const reviewed = duplicates.find((question) => existingByIdentity.get(identity(question))?.review_status === 'APPROVED')
    if (reviewed) return NextResponse.json({ error: 'Updating approved questions requires a separate review workflow.', question: reviewed.external_id ?? reviewed.question_text }, { status: 409 })
  }

  const unsupportedTechnology = parsed.data.questions.find((question) => !topicForDatabase(question.technology))
  if (unsupportedTechnology) return NextResponse.json({ error: `Unsupported technology for the current question bank: ${unsupportedTechnology.technology}. Use OPENEULER, OPENGAUSS, KUNPENG, or DATACOM.` }, { status: 400 })

  const toInsert = parsed.data.questions.filter((question) => !existingByIdentity.has(identity(question)))
  const toUpdate = parsed.data.duplicate_strategy === 'UPDATE' ? parsed.data.questions.filter((question) => existingByIdentity.has(identity(question))) : []
  const rows = (questions: typeof parsed.data.questions) => questions.map((question) => ({ external_id: question.external_id, track: question.track, certification_level: question.certification_level, technology: question.technology, topic: topicForDatabase(question.technology), round_suitability: question.round_suitability, difficulty: difficultyForDatabase(question.difficulty), type: question.type, language: question.language, question_text: question.question_text, options: question.options, correct_answers: question.correct_answers, explanation: question.explanation, source_type: question.source_type, source_reference: question.source_reference, review_status: 'DRAFT', tags: question.tags, version: question.version, created_by: user.id, updated_at: new Date().toISOString() }))

  const insertRows = rows(toInsert)
  const inserted = toInsert.length ? await privileged.from('questions').insert(insertRows).select('id, external_id, track, topic, type, question_text, review_status') : { data: [], error: null }
  if (inserted.error) {
    console.error('[v0] Question import database error', { code: inserted.error.code, message: inserted.error.message, details: inserted.error.details, hint: inserted.error.hint, rowCount: insertRows.length })
    return NextResponse.json({ error: 'Unable to import questions into database.', detail: inserted.error.message, code: inserted.error.code, hint: inserted.error.hint }, { status: 500 })
  }
  let updatedCount = 0
  for (const question of toUpdate) {
    const existing = existingByIdentity.get(identity(question))
    if (!existing) continue
    const result = await privileged.from('questions').update(rows([question])[0]).eq('id', existing.id)
    if (result.error) return NextResponse.json({ error: 'Unable to update a duplicate question.', detail: result.error.message }, { status: 500 })
    updatedCount += 1
  }
  return NextResponse.json({ imported: inserted.data?.length ?? 0, updated: updatedCount, skippedDuplicates: parsed.data.duplicate_strategy === 'SKIP' ? duplicates.length : 0, rejected: 0, questions: inserted.data ?? [] }, { status: 201 })
}

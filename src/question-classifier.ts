import { normalizeQuestion } from './transcript-utils'

export type QuestionClassification = {
  is_interview_question: boolean
  question: string
  confidence: number
  reason: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseQuestionClassification(
  responseText: string,
  transcriptSegment: string,
): QuestionClassification {
  let value: unknown
  try {
    value = JSON.parse(responseText)
  } catch {
    throw new Error('Groq returned malformed question-classification JSON.')
  }

  if (!isRecord(value)) {
    throw new Error('Groq returned an invalid question classification.')
  }

  if (
    typeof value.is_interview_question !== 'boolean' ||
    typeof value.question !== 'string' ||
    value.question.length > 500 ||
    typeof value.confidence !== 'number' ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    typeof value.reason !== 'string' ||
    value.reason.length > 1000
  ) {
    throw new Error('Groq returned a question classification with invalid fields.')
  }

  const transcriptQuestion = transcriptSegment.trim()
  const question = value.question.trim()
  if (value.is_interview_question) {
    const normalizedQuestion = normalizeQuestion(question)
    const normalizedSegment = normalizeQuestion(transcriptQuestion)
    if (!normalizedQuestion || normalizedQuestion !== normalizedSegment) {
      throw new Error(
        'Groq returned question wording that did not match the finalized transcript.',
      )
    }
  } else if (question) {
    throw new Error('Groq returned a question for a negative classification.')
  }

  return {
    is_interview_question: value.is_interview_question,
    question: value.is_interview_question ? transcriptQuestion : '',
    confidence: value.confidence,
    reason: value.reason.trim(),
  }
}

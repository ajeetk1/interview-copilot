export function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

const questionLeadIn =
  /^(?:(?:so|well|okay|all right)[, ]+)*(?:(?:can|could|would|will|should|do|does|did|is|are|am|was|were|have|has|had)\s+(?:you|we|i|they|he|she|it)\b|(?:what|how|why|when|where|who|whom|whose|which)\b|(?:tell (?:me|us) about|explain|describe|walk me through)\b)/i
const indirectInterviewLeadIn =
  /^(?:i want to understand|i would like to understand|i'd like to understand)\s+(?:how|what|why|whether)\b/i
const tutorialQuestionFraming =
  /\b(?:in this (?:video|tutorial|lesson|guide|course)|(?:common|typical|sample|practice|example) interview questions?|(?:sample|practice|example) questions?|sample answers?|interviewers? (?:often|sometimes|might|may|will) ask|you (?:might|may|could|will) be asked|how to answer (?:this|these|an?) interview question)\b/i

export function getQuestionCandidates(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 10 && sentence.length <= 500)
    .filter(
      (sentence) =>
        sentence.includes('?') ||
        questionLeadIn.test(sentence) ||
        indirectInterviewLeadIn.test(sentence),
    )
}

export function isTutorialQuestionExample(
  candidate: string,
  context: string,
): boolean {
  const candidateIndex = context.toLowerCase().lastIndexOf(candidate.toLowerCase())
  const start = candidateIndex < 0 ? Math.max(0, context.length - 500) : Math.max(0, candidateIndex - 400)
  const end =
    candidateIndex < 0
      ? context.length
      : Math.min(context.length, candidateIndex + candidate.length + 250)
  return tutorialQuestionFraming.test(context.slice(start, end))
}

export function getTranscriptRemainder(previous: string, next: string): string {
  if (!previous || !next) return next

  const nextWords = next.trim().split(/\s+/)
  const previousWords = previous.trim().split(/\s+/).slice(-nextWords.length)
  const previousNormalized = previousWords.map(normalizeQuestion)
  const nextNormalized = nextWords.map(normalizeQuestion)
  const maxOverlap = Math.min(previousWords.length, nextWords.length)

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const matches = previousNormalized
      .slice(-overlap)
      .every((word, index) => word === nextNormalized[index])

    if (matches && overlap >= 2) {
      return nextWords.slice(overlap).join(' ')
    }
  }

  return next
}

export function appendTranscript(previous: string, next: string): string {
  return previous ? `${previous} ${next}` : next
}

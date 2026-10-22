import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendTranscript,
  getQuestionCandidates,
  isTutorialQuestionExample,
  normalizeQuestion,
} from '../src/transcript-utils'
import { parseQuestionClassification } from '../src/question-classifier'

test('extracts direct question candidates and keeps their wording', () => {
  const examples = [
    'What is the difference between ChatGPT and an AI agent?',
    'Can you explain how RAG works?',
    'How would you design a scalable API?',
    'What do you feed in the context window?',
  ]

  for (const question of examples) {
    assert.deepEqual(getQuestionCandidates(question), [question])
  }
})

test('extracts interviewer lead-ins and indirect question candidates', () => {
  assert.deepEqual(
    getQuestionCandidates('So, can you tell me about your experience with RAG?'),
    ['So, can you tell me about your experience with RAG?'],
  )
  assert.deepEqual(
    getQuestionCandidates('Tell me about a challenging project you worked on.'),
    ['Tell me about a challenging project you worked on.'],
  )
  assert.deepEqual(
    getQuestionCandidates('I want to understand how you would design a reliable API.'),
    ['I want to understand how you would design a reliable API.'],
  )
})

test('does not classify technical narration or tutorial rhetorical questions', () => {
  const narration = [
    'Even if you have a model for 1,000,000 context size, you do not want to feed everything.',
    'You want to stick it to a temporary, short context which is a focused context.',
    'Context window sliding window algorithm.',
    "Let's say that you have a lot of chat.",
    'My name is Piyush.',
  ].join(' ')
  const tutorialContext =
    'Even if you have a model for 1,000,000 context size, you do not want to feed everything. You want to use a focused context. Let us say that you have a lot of chat.'

  assert.deepEqual(getQuestionCandidates(narration), [])
  const rhetorical = 'What happens if you feed everything into the context window?'
  assert.deepEqual(getQuestionCandidates(rhetorical), [rhetorical])
  assert.equal(
    parseQuestionClassification(
      JSON.stringify({
        is_interview_question: false,
        question: '',
        confidence: 0.95,
        reason: 'This is a rhetorical tutorial example.',
      }),
      rhetorical,
    ).is_interview_question,
    false,
  )
  assert.deepEqual(
    getQuestionCandidates('I want to understand how a sliding window works.'),
    ['I want to understand how a sliding window works.'],
  )
})

test('retains a direct question in context and does not alter repeated speech', () => {
  const tutorialContext =
    'Even if you have a model for 1,000,000 context size, you do not want to feed everything. Let us say that you have a lot of chat.'
  const question = 'What do you feed in the context window?'
  assert.deepEqual(getQuestionCandidates(question), [question])

  const repeatedQuestion = `${question} ${question}`
  assert.deepEqual(getQuestionCandidates(repeatedQuestion), [question, question])
  assert.equal(normalizeQuestion(question), normalizeQuestion(`${question} `))
  assert.equal(
    appendTranscript(question, question),
    `${question} ${question}`,
  )
})

test('accepts confident interviewer classifications with exact transcript wording', () => {
  const questions = [
    'Tell me about yourself.',
    'Can you explain the difference between a process and a thread in Python?',
    'Describe a challenging technical problem you solved.',
    'How would you design a system to handle a million requests per day?',
  ]

  for (const question of questions) {
    assert.deepEqual(parseQuestionClassification(
      JSON.stringify({
        is_interview_question: true,
        question,
        confidence: 0.96,
        reason: 'The interviewer is directly asking the candidate.',
      }),
      question,
    ), {
      is_interview_question: true,
      question,
      confidence: 0.96,
      reason: 'The interviewer is directly asking the candidate.',
    })
  }
})

test('accepts a negative classification for tutorial interview-question examples', () => {
  const segment =
    'Interview question number two is, why do you want this job? Here is a great sample answer.'
  assert.equal(
    parseQuestionClassification(
      JSON.stringify({
        is_interview_question: false,
        question: '',
        confidence: 0.98,
        reason: 'The speaker is introducing a tutorial example.',
      }),
      segment,
    ).is_interview_question,
    false,
  )
})

test('filters interview-question examples when tutorial framing is nearby', () => {
  const tutorialExamples = [
    'In this video, we will cover common interview questions. What are your strengths?',
    'A sample question is: What are your strengths?',
    'Interviewers often ask, what are your strengths?',
    'You might be asked, what are your strengths?',
    'How to answer this interview question: What are your strengths?',
  ]

  for (const context of tutorialExamples) {
    assert.equal(
      isTutorialQuestionExample('What are your strengths?', context),
      true,
    )
  }

  assert.equal(
    isTutorialQuestionExample(
      'What are your strengths?',
      'Interviewer: What are your strengths?',
    ),
    false,
  )
})

test('rejects malformed classifications and questions not in the transcript', () => {
  assert.throws(
    () => parseQuestionClassification('{not json', 'Tell me about yourself.'),
    /malformed/,
  )
  assert.throws(
    () =>
      parseQuestionClassification(
        JSON.stringify({
          is_interview_question: true,
          question: 'Why do you want this job?',
          confidence: 0.9,
          reason: 'Interviewer question.',
        }),
        'This is a tutorial about interviews.',
      ),
      /did not match/,
  )
  assert.throws(
      () =>
        parseQuestionClassification(
          JSON.stringify({
            is_interview_question: true,
            question: 'Why would you use an LLM?',
            confidence: 0.9,
            reason: 'Interviewer question.',
          }),
          'Why would you use an LLM instead of a traditional ML model?',
        ),
      /did not match/,
  )
})

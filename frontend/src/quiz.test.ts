import { beforeEach } from 'vitest'
import type { QuizQuestion } from './api'
import { asked, buildQuiz, byLecture, clearLocalRun, shuffle, takeLocalRun, tally, topicRows, type QuizRun } from './quiz'

/* a fixed sequence, so a shuffle is the same shuffle every run */
function seeded(seed = 7) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const q = (id: number, conceptId: number, lectureId: number, lecture = `L${lectureId}.pdf`): QuizQuestion => ({
  id, conceptId, lectureId, lecture, topic: `topic ${conceptId}`, type: 'MC', prompt: `q${id}`, options: ['a', 'b'], sourcePages: '1',
})

// two lectures; lecture 1 has topics 1 (three questions) and 2 (one), lecture 2 has topic 3 (two)
const bank = [q(1, 1, 1), q(2, 1, 1), q(3, 1, 1), q(4, 2, 1), q(5, 3, 2), q(6, 3, 2)]

test('a shuffle keeps every item and moves them', () => {
  const out = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seeded())
  expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  expect(out).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8])
})

test('a full quiz asks every question in the chosen lectures, once each', () => {
  const order = buildQuiz(bank, new Set([1, 2]), null, seeded())
  expect([...order].sort()).toEqual([1, 2, 3, 4, 5, 6])
  expect(buildQuiz(bank, new Set([2]), null, seeded()).sort()).toEqual([5, 6])
})

test('a length at or over the pool is the whole pool', () => {
  expect(buildQuiz(bank, new Set([1, 2]), 50, seeded()).sort()).toEqual([1, 2, 3, 4, 5, 6])
})

test('a shorter quiz reaches every topic before any topic gets a second question', () => {
  for (let seed = 1; seed < 40; seed++) {
    const order = buildQuiz(bank, new Set([1, 2]), 3, seeded(seed))
    expect(order).toHaveLength(3)
    const topics = new Set(order.map(id => bank.find(b => b.id === id)!.conceptId))
    expect(topics).toEqual(new Set([1, 2, 3]))
  }
})

test('a quiz of four takes a second question from a topic only after all three have one', () => {
  const order = buildQuiz(bank, new Set([1, 2]), 4, seeded(3))
  const topics = order.map(id => bank.find(b => b.id === id)!.conceptId)
  expect(new Set(topics)).toEqual(new Set([1, 2, 3]))
  expect(new Set(order).size).toBe(4)
})

const run: QuizRun = {
  order: [1, 5, 4, 99],
  answers: { 1: { picked: 0, text: '', correct: true }, 5: { picked: 1, text: '', correct: false }, 4: { picked: 1, text: '', correct: false } },
  finished: false,
}

test('the run keeps its order and drops a question that is no longer in the bank', () => {
  expect(asked(run, new Map(bank.map(b => [b.id, b]))).map(b => b.id)).toEqual([1, 5, 4])
})

test('the tally counts answered and right among the questions still asked', () => {
  expect(tally(run, [bank[0], bank[4], bank[3]])).toEqual({ right: 1, answered: 3 })
  expect(tally(run, [bank[0]])).toEqual({ right: 1, answered: 1 })
})

test('lectures come back weakest first', () => {
  expect(byLecture(run, [bank[0], bank[4], bank[3]])).toEqual([
    { lecture: 'L2.pdf', right: 0, answered: 1 },
    { lecture: 'L1.pdf', right: 1, answered: 2 },
  ])
})

test('questions with no lecture are scored together, as no lecture rather than a made-up file', () => {
  const loose = { ...bank[0], id: 99, lecture: null }
  const withLoose: QuizRun = { ...run, answers: { ...run.answers, 99: { picked: 0, text: '', correct: false } } }
  expect(byLecture(withLoose, [bank[0], loose])).toEqual([
    { lecture: null, right: 0, answered: 1 },
    { lecture: 'L1.pdf', right: 1, answered: 1 },
  ])
})

describe('a leftover local run', () => {
  beforeEach(() => localStorage.clear())

  test('takeLocalRun reads once and clears the key', () => {
    localStorage.setItem('studyos.quiz.2', JSON.stringify(run))
    expect(takeLocalRun(2)).toEqual(run)
    expect(localStorage.getItem('studyos.quiz.2')).toBeNull()
    expect(takeLocalRun(2)).toBeNull()
    expect(takeLocalRun(3)).toBeNull()
  })

  test('anything else under the key is no run at all, and still clears', () => {
    localStorage.setItem('studyos.quiz.2', '{"order":"nope"}')
    expect(takeLocalRun(2)).toBeNull()
    expect(localStorage.getItem('studyos.quiz.2')).toBeNull()
    localStorage.setItem('studyos.quiz.2', 'not json')
    expect(takeLocalRun(2)).toBeNull()
  })

  test('clearLocalRun drops the key without reading it', () => {
    localStorage.setItem('studyos.quiz.2', JSON.stringify(run))
    clearLocalRun(2)
    expect(localStorage.getItem('studyos.quiz.2')).toBeNull()
  })
})

test('the side panel gathers a quiz by topic, in the order the quiz first reaches each', () => {
  const q = (id: number, conceptId: number, sourcePages: string | null): QuizQuestion => ({
    id, conceptId, lectureId: 7, topic: `topic ${conceptId}`, lecture: 'Lecture 3.pdf', type: 'MC',
    prompt: `q${id}`, options: ['a', 'b'], sourcePages,
  })
  const quiz = [q(1, 20, '14'), q(2, 10, '3'), q(3, 20, '15,14'), q(4, 30, null)]
  const run: QuizRun = { order: [1, 2, 3, 4], finished: false, answers: {
    1: { picked: 0, text: '', correct: true },
    2: { picked: 1, text: '', correct: false },
  } }
  const rows = topicRows(run, quiz, 3)
  expect(rows.map(r => r.conceptId)).toEqual([20, 10, 30])
  expect(rows[0]).toMatchObject({ topic: 'topic 20', pages: '14,15', asked: 2, answered: 1, right: 1, current: true })
  expect(rows[1]).toMatchObject({ pages: '3', asked: 1, answered: 1, right: 0, current: false })
  expect(rows[2]).toMatchObject({ pages: null, asked: 1, answered: 0, right: 0 })
})

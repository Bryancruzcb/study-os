import { screen, waitFor, within } from '@testing-library/react'
import { SERVER_PROBLEM } from '../errors'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { api, type QuestionReview, type QuizQuestion } from '../api'
import { renderInCourse } from '../test/render'
import QuizPage from './QuizPage'

const course = { id: 1, name: 'CS 149', term: 'Fall 2026', concepts: 3, questions: 3, dueToday: 2, archived: false }

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(), quiz: vi.fn(), review: vi.fn(), exams: vi.fn(), retire: vi.fn(), restore: vi.fn(),
    quizProgress: vi.fn(), saveQuizProgress: vi.fn(), clearQuizProgress: vi.fn(),
  },
}))

// jsdom cannot lay out an SVG, so the diagram stands in as a figure carrying its label
vi.mock('./Diagram', () => ({
  default: ({ label }: { label: string }) => <figure aria-label={label} />,
}))

const mc: QuizQuestion = {
  id: 9, conceptId: 1, lectureId: 7, topic: 'TCP handshake', lecture: 'Lecture 3.pdf', lectureTitle: 'TCP connections', type: 'MC',
  prompt: 'How many segments open a TCP connection?', options: ['1', '2', '3', '4'], sourcePages: '3',
}
const sa: QuizQuestion = {
  id: 10, conceptId: 2, lectureId: 7, topic: 'Connection setup', lecture: 'Lecture 3.pdf', lectureTitle: 'TCP connections', type: 'SHORT_ANSWER',
  prompt: 'Describe the handshake.', options: [], sourcePages: '3,4',
}
const tlb: QuizQuestion = {
  id: 11, conceptId: 3, lectureId: 8, topic: 'Paging', lecture: 'Paging.pdf', type: 'MC',
  prompt: 'What does the TLB cache?', options: ['Translations', 'Pages'], sourcePages: '12',
}

const reviews: Record<number, QuestionReview> = {
  9: {
    id: 9, correctIndex: 2, modelAnswer: null, rubric: null, explanation: 'Slide 3 shows SYN, SYN-ACK and ACK.',
    optionExplanations: ['Only the SYN.', 'Stops before the ACK.', 'All three on slide 3.', 'Slide 3 never shows a fourth.'],
    diagram: 'sequenceDiagram\n  Client->>Server: SYN',
  },
  10: {
    id: 10, correctIndex: null, modelAnswer: 'SYN, SYN-ACK, ACK', rubric: '- names all three segments\n- in order',
    explanation: 'Slides 3 and 4 name the three segments in order.', optionExplanations: [], diagram: null,
  },
  11: { id: 11, correctIndex: 0, modelAnswer: null, rubric: null, explanation: null, optionExplanations: [], diagram: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // no swaps: the quiz asks in bank order, so each test knows which question comes next
  vi.spyOn(Math, 'random').mockReturnValue(0.999)
  vi.mocked(api.overview).mockResolvedValue([course])
  vi.mocked(api.quiz).mockResolvedValue([mc, sa, tlb])
  vi.mocked(api.quizProgress).mockResolvedValue(null)
  vi.mocked(api.saveQuizProgress).mockImplementation(async (_id, run) => run)
  vi.mocked(api.clearQuizProgress).mockResolvedValue(undefined)
  vi.mocked(api.review).mockImplementation(async id => reviews[id])
  vi.mocked(api.exams).mockResolvedValue([])
  vi.mocked(api.retire).mockResolvedValue(undefined)
  vi.mocked(api.restore).mockResolvedValue(undefined)
})

const answered = () => screen.getByRole('progressbar', { name: 'Questions answered' })
const rail = () => screen.getByRole('complementary', { name: 'This quiz' })
const meta = () => document.querySelector<HTMLElement>('.quiz-meta')!
// the score tiles, apart from the per-lecture counts that can read the same
const scoreTiles = () => within(document.querySelector<HTMLElement>('.quiz-summary .figures')!)

async function startQuiz() {
  renderInCourse(<QuizPage />, 'quiz')
  await userEvent.click(await screen.findByRole('button', { name: 'Start the quiz · 3 questions' }))
  await screen.findByText(mc.prompt)
}

test('the setup covers every lecture and starts a quiz of every question in the course', async () => {
  renderInCourse(<QuizPage />, 'quiz')
  expect(await screen.findByRole('heading', { name: 'Quiz' })).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /TCP connections/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /^Paging/ })).toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: 'Start the quiz · 3 questions' }))
  expect(await screen.findByText(mc.prompt)).toBeInTheDocument()
  expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
  expect(meta()).toHaveTextContent('TCP handshake')
  expect(within(meta()).getByText('TCP connections · slide 3')).toBeInTheDocument()
  expect(meta()).toHaveTextContent('Multiple choice')
  expect(answered()).toHaveAttribute('aria-valuenow', '0')
  expect(api.quiz).toHaveBeenCalledWith(1)
  await waitFor(() => expect(api.saveQuizProgress).toHaveBeenCalledWith(1, expect.objectContaining({
    order: [9, 10, 11], finished: false,
  })))
})

test('a lecture with no title and a numbered filename is named after its first two topics', async () => {
  vi.mocked(api.quiz).mockResolvedValueOnce([{ ...mc, lectureTitle: null }, { ...sa, lectureTitle: null }, tlb])
  renderInCourse(<QuizPage />, 'quiz')
  expect(await screen.findByRole('checkbox', { name: /TCP handshake and Connection setup/ })).toBeChecked()
  expect(screen.queryByText(/Lecture 3/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Start the quiz · 3 questions' }))
  await screen.findByText(mc.prompt)
  expect(within(rail()).getAllByRole('listitem')[0]).toHaveTextContent('TCP handshake and Connection setup · slide 3')
})

test('unticking a lecture leaves its questions out, and no lectures is no quiz', async () => {
  renderInCourse(<QuizPage />, 'quiz')
  await userEvent.click(await screen.findByRole('checkbox', { name: /TCP connections/ }))
  expect(screen.getByRole('button', { name: 'Start the quiz · 1 question' })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: 'None' }))
  expect(screen.getByRole('button', { name: 'Start the quiz · 0 questions' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox', { name: /^Paging/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Start the quiz · 1 question' }))
  expect(await screen.findByText(tlb.prompt)).toBeInTheDocument()
  expect(screen.getByText('Question 1 of 1')).toBeInTheDocument()
})

test('a shorter quiz is on offer once the lectures hold more questions than it asks', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ ...tlb, id: 100 + i, conceptId: 100 + i, prompt: `question ${i}` }))
  vi.mocked(api.quiz).mockResolvedValueOnce(many)
  renderInCourse(<QuizPage />, 'quiz')
  expect(await screen.findByRole('radio', { name: 'All 12' })).toBeChecked()
  expect(screen.queryByRole('radio', { name: '25' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: '10' }))
  await userEvent.click(screen.getByRole('button', { name: 'Start the quiz · 10 questions' }))
  expect(await screen.findByText('Question 1 of 10')).toBeInTheDocument()
})

test('a wrong pick leads with the verdict, then marks every option with why, the explanation and the diagram', async () => {
  await startQuiz()
  await userEvent.click(screen.getByRole('button', { name: '1' }))
  expect(await screen.findByText('Incorrect')).toBeInTheDocument()
  expect(api.review).toHaveBeenCalledWith(9)
  // the verdict comes before the options it sums up
  const verdict = screen.getByText('Incorrect')
  const list = screen.getByRole('list', { name: 'Why each option is right or wrong' })
  expect(verdict.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  const options = within(screen.getByRole('list', { name: 'Why each option is right or wrong' })).getAllByRole('listitem')
  expect(options).toHaveLength(4)
  expect(options[0]).toHaveClass('is-miss')
  expect(options[0]).toHaveTextContent('Your answer')
  expect(options[0]).toHaveTextContent('Only the SYN.')
  expect(options[1]).toHaveTextContent('Stops before the ACK.')
  expect(options[2]).toHaveClass('is-key')
  expect(options[2]).toHaveTextContent('Right answer')
  expect(options[3]).toHaveTextContent('Slide 3 never shows a fourth.')

  expect(screen.getByText('From slide 3')).toBeInTheDocument()
  expect(screen.getByText('Slide 3 shows SYN, SYN-ACK and ACK.')).toBeInTheDocument()
  expect(screen.getByRole('figure', { name: `Diagram: ${mc.prompt}` })).toBeInTheDocument()
  const open = screen.getByRole('link', { name: 'Open slide 3' })
  expect(open).toHaveAttribute('href', '/api/materials/7/pdf#page=3')
  expect(open).toHaveAttribute('target', '_blank')
  expect(answered()).toHaveAttribute('aria-valuenow', '1')

  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  expect(await screen.findByText(sa.prompt)).toBeInTheDocument()
  expect(screen.getByText('Question 2 of 3')).toBeInTheDocument()
})

test('a right pick says so on the option, and the caret follows the quiz', async () => {
  await startQuiz()
  expect(screen.getByText(mc.prompt)).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  expect(await screen.findByText('Correct')).toBeInTheDocument()
  expect(screen.getByText('Your answer, right')).toBeInTheDocument()
  expect(screen.getByText('Correct').closest('.quiz-verdict')).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  expect(await screen.findByText(sa.prompt)).toHaveFocus()
})

test('a short answer shows the model answer, what it needs and why, and the student marks it', async () => {
  await startQuiz()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Next question' }))
  await userEvent.type(await screen.findByRole('textbox', { name: 'Your answer' }), 'SYN then ACK')
  await userEvent.click(screen.getByRole('button', { name: 'Show the answer' }))

  expect((await screen.findByText('Model answer')).closest('p')).toHaveTextContent('Model answerSYN, SYN-ACK, ACK')
  expect(screen.getByText('SYN then ACK')).toBeInTheDocument()
  expect(screen.getByText('What a right answer needs').parentElement).toHaveTextContent('names all three segments')
  expect(screen.getByText('Slides 3 and 4 name the three segments in order.')).toBeInTheDocument()
  // the head's chip and the explanation's source line both cite the slides
  expect(screen.getAllByText('TCP connections · slides 3, 4')).toHaveLength(2)

  await userEvent.click(screen.getByRole('button', { name: 'I got it wrong' }))
  expect(await screen.findByText(tlb.prompt)).toBeInTheDocument()
  expect(answered()).toHaveAttribute('aria-valuenow', '2')
})

test('the last answer leads to the results: the score, lectures weakest first, and the missed questions to retake', async () => {
  await startQuiz()
  await userEvent.click(screen.getByRole('button', { name: '1' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Next question' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Show the answer' }))
  await userEvent.click(await screen.findByRole('button', { name: 'I got it right' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Translations' }))

  // nobody has explained this one yet: the key and the slides still show
  expect(await screen.findByText('No explanation has been written for this question yet.')).toBeInTheDocument()
  expect(screen.getAllByText('Paging · slide 12')).toHaveLength(2)

  await userEvent.click(screen.getByRole('button', { name: 'See results' }))
  expect(await screen.findByRole('heading', { name: 'Quiz finished' })).toHaveFocus()
  expect(scoreTiles().getByText('2 / 3')).toBeInTheDocument()
  expect(scoreTiles().getByText('67%')).toBeInTheDocument()
  const lectures = document.querySelectorAll('.quiz-scores li')
  expect(lectures[0]).toHaveTextContent('TCP connections1 / 2')
  expect(lectures[1]).toHaveTextContent('Paging1 / 1')

  await userEvent.click(screen.getByText(mc.prompt))
  expect(screen.getByText('You picked A: 1')).toBeInTheDocument()
  expect(screen.getByText('Right answer').closest('p')).toHaveTextContent('Right answerC: 3')

  await userEvent.click(screen.getByRole('button', { name: 'Retake the 1 missed question' }))
  expect(await screen.findByText('Question 1 of 1')).toBeInTheDocument()
  expect(screen.getByText(mc.prompt)).toBeInTheDocument()
})

test('a quiz left halfway picks up at its next question, and ending it early scores only what was answered', async () => {
  const halfway = {
    order: [11, 9, 10], answers: { 11: { picked: 1, text: '', correct: false } }, finished: false,
  }
  vi.mocked(api.quizProgress).mockResolvedValueOnce(halfway)
  renderInCourse(<QuizPage />, 'quiz')
  expect(await screen.findByText(mc.prompt)).toBeInTheDocument()
  expect(screen.getByText('Question 2 of 3')).toBeInTheDocument()
  expect(api.quizProgress).toHaveBeenCalledWith(1)

  await userEvent.click(screen.getByRole('button', { name: 'End quiz' }))
  expect(await screen.findByRole('heading', { name: 'Quiz ended' })).toBeInTheDocument()
  expect(scoreTiles().getByText('0 / 1')).toBeInTheDocument()
  expect(screen.getByText(/2 questions unanswered/)).toBeInTheDocument()
  await waitFor(() => expect(api.saveQuizProgress).toHaveBeenCalledWith(1, expect.objectContaining({ finished: true })))

  // nothing was fetched for it this visit, so its why loads when it opens
  await userEvent.click(screen.getByText(tlb.prompt))
  await waitFor(() => expect(api.review).toHaveBeenCalledWith(11))
  expect(await screen.findByText('You picked B: Pages')).toBeInTheDocument()
  expect(await screen.findByText('No explanation has been written for this question yet.')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'New quiz' }))
  expect(await screen.findByRole('heading', { name: 'Quiz' })).toHaveFocus()
  await waitFor(() => expect(api.clearQuizProgress).toHaveBeenCalledWith(1))
})

test('a leftover localStorage run migrates onto the account once', async () => {
  const leftover = {
    order: [11, 9, 10], answers: { 11: { picked: 1, text: '', correct: false } }, finished: false,
  }
  localStorage.setItem('studyos.quiz.1', JSON.stringify(leftover))
  renderInCourse(<QuizPage />, 'quiz')
  expect(await screen.findByText(mc.prompt)).toBeInTheDocument()
  expect(screen.getByText('Question 2 of 3')).toBeInTheDocument()
  await waitFor(() => expect(api.saveQuizProgress).toHaveBeenCalledWith(1, leftover))
  expect(localStorage.getItem('studyos.quiz.1')).toBeNull()
})

test('a review that fails to load says so and leaves the question answerable', async () => {
  vi.mocked(api.review).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  await startQuiz()
  await userEvent.click(screen.getByRole('button', { name: '1' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(SERVER_PROBLEM)
  expect(screen.getByRole('button', { name: '3' })).toBeEnabled()
  expect(answered()).toHaveAttribute('aria-valuenow', '0')
})

// ---- the desk: the side panel, Report, and the keys --------------------------------------

test('the side panel lists every topic with its lecture, its slides and how it has gone', async () => {
  await startQuiz()
  const topics = within(rail()).getAllByRole('listitem')
  expect(topics).toHaveLength(3)
  expect(topics[0]).toHaveAttribute('aria-current', 'step')
  expect(topics[0]).toHaveTextContent('TCP handshake')
  expect(topics[0]).toHaveTextContent('TCP connections · slide 3 · on now')
  expect(topics[0]).toHaveTextContent('0 of 1')
  expect(topics[1]).toHaveTextContent('TCP connections · slides 3, 4')
  expect(topics[2]).toHaveTextContent('Paging · slide 12')
  expect(rail()).toHaveTextContent('0 right · 0 missed · 3 to go')
  expect(within(rail()).getByText('O')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '1' }))
  await screen.findByText('Incorrect')
  expect(within(rail()).getAllByRole('listitem')[0]).toHaveTextContent('1 of 1')
  expect(within(rail()).getByRole('img', { name: 'Missed' })).toBeInTheDocument()
  expect(rail()).toHaveTextContent('0 right · 1 missed · 2 to go')
})

test('the nearest exam heads the side panel', async () => {
  vi.mocked(api.exams).mockResolvedValue([{
    id: 1, name: 'Midterm 1', date: '2026-12-03', lectureIds: [7, 8], status: 'upcoming',
    plan: { daysLeft: 14, reviewDays: 3, lastNewDay: '2026-11-30', topics: 3, topicsLeft: 3, newToday: 1, reviewsToday: 0 },
  }])
  await startQuiz()
  expect(await within(rail()).findByText('Midterm 1 in 14 days')).toBeInTheDocument()
  expect(rail()).toHaveTextContent('Thu, Dec 3 · covers 2 lectures')
})

test('reporting a question takes it out of the bank and the quiz, and Undo puts it back', async () => {
  await startQuiz()
  await userEvent.click(screen.getByRole('button', { name: 'Report question' }))
  await waitFor(() => expect(api.retire).toHaveBeenCalledWith(9))
  expect(await screen.findByText(sa.prompt)).toBeInTheDocument()
  expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
  expect(document.querySelector('.quiz-reported')).toHaveTextContent(`Took “${mc.prompt}” out of your bank`)

  await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() => expect(api.restore).toHaveBeenCalledWith(9))
  expect(await screen.findByText(mc.prompt)).toBeInTheDocument()
  expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
  expect(document.querySelector('.quiz-reported')).toBeNull()
})

test('a number key picks an option, Enter goes on, and O opens the cited slide', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  await startQuiz()
  await userEvent.keyboard('3')
  expect(await screen.findByText('Correct')).toBeInTheDocument()
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByText(sa.prompt)).toHaveFocus()

  await userEvent.keyboard('o')
  expect(open).toHaveBeenCalledWith('/api/materials/7/pdf#page=3', '_blank', 'noopener')
  // a key typed into the answer box is the answer, not a shortcut
  open.mockClear()
  await userEvent.type(screen.getByRole('textbox', { name: 'Your answer' }), 'o')
  expect(open).not.toHaveBeenCalled()
  open.mockRestore()
})

test('a course with no questions says how to get some', async () => {
  vi.mocked(api.quiz).mockResolvedValueOnce([])
  renderInCourse(<QuizPage />, 'quiz')
  expect(await screen.findByText(/no questions yet/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open the bank' })).toHaveAttribute('href', '/courses/1/bank')
})

test('a quiz that fails to load shows the alert', async () => {
  vi.mocked(api.quiz).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  renderInCourse(<QuizPage />, 'quiz')
  // the sentence alone: no "Error:" in front, no status, no URL
  expect((await screen.findByRole('alert')).textContent).toBe(SERVER_PROBLEM)
})

test('the setup shows how many questions are available and links to generate in the bank', async () => {
  renderInCourse(<QuizPage />, 'quiz')
  expect(await screen.findByText('3 questions available for this selection.')).toBeInTheDocument()
  const link = screen.getByRole('link', { name: 'Need more? Generate in Bank' })
  expect(link).toHaveAttribute('href', '/courses/1/bank?concepts=1,2,3')
  await userEvent.click(screen.getByRole('checkbox', { name: /^Paging/ }))
  expect(screen.getByText('2 questions available for this selection.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Need more? Generate in Bank' }))
    .toHaveAttribute('href', '/courses/1/bank?concepts=1,2')
})

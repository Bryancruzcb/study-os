import { screen, waitFor, within } from '@testing-library/react'
import { SERVER_PROBLEM } from '../errors'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { api, type AnsweredAttempt, type Attempt, type QuestionReview, type StudyQuestion } from '../api'
import { renderInCourse } from '../test/render'
import StudyPage from './StudyPage'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 16, archived: false }

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    next: vi.fn(),
    answer: vi.fn(),
    override: vi.fn(),
    selfGrade: vi.fn(),
    review: vi.fn(),
  },
}))

const reviews: Record<number, QuestionReview> = {
  9: {
    id: 9, correctIndex: 2, modelAnswer: null, rubric: null, explanation: 'Slide 3 shows SYN, SYN-ACK and ACK.',
    optionExplanations: ['Only the SYN.', 'Stops before the ACK.', 'All three on slide 3.', 'Slide 3 never shows a fourth.'],
    diagram: null,
  },
  10: {
    id: 10, correctIndex: null, modelAnswer: 'SYN, then SYN-ACK, then ACK.', rubric: '- names all three segments\n- in order',
    explanation: 'Slides 3 and 4 name the three segments in order.', optionExplanations: [], diagram: null,
  },
  12: { id: 12, correctIndex: 3, modelAnswer: null, rubric: null, explanation: null, optionExplanations: [], diagram: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
  vi.mocked(api.next).mockResolvedValue({
    id: 9, conceptId: 1, topic: 'TCP handshake', lecture: 'Lecture 3.pdf', lectureId: 4, type: 'MC', prompt: 'Steps in the TCP handshake?', options: ['1', '2', '3', '4'], sourcePages: '3',
  })
  vi.mocked(api.answer).mockResolvedValue({ id: 1, verdict: 'CORRECT', score: 1, feedback: null, answerKey: '3' })
  vi.mocked(api.review).mockImplementation(async id => reviews[id])
})

const shortAnswer: StudyQuestion = {
  id: 10, conceptId: 2, topic: 'Connection setup', lecture: 'Lecture 3.pdf', lectureId: 4, type: 'SHORT_ANSWER', prompt: 'Describe the handshake.', options: [], sourcePages: '3,4',
}

async function renderWithQuestion() {
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument())
}

async function renderShortAnswer(attempt: Attempt) {
  vi.mocked(api.next).mockResolvedValueOnce(shortAnswer)
  vi.mocked(api.answer).mockResolvedValueOnce({ ...attempt, answerKey: 'SYN, SYN-ACK, ACK' })
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  await userEvent.type(screen.getByRole('textbox'), 'SYN then SYN-ACK')
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
}

const meta = () => document.querySelector<HTMLElement>('.quiz-meta')!
const marked = () => screen.getByRole('list', { name: 'Why each option is right or wrong' })
const option = (text: string) => within(marked()).getByText(text).closest('li')!

test('shows the question under one meta line with its concept, lecture and slide, and type', async () => {
  await renderWithQuestion()
  expect(meta()).toHaveTextContent('TCP handshake')
  expect(meta()).toHaveTextContent('Multiple choice')
  expect(within(meta()).getByText('Lecture 3.pdf · slide 3')).toBeInTheDocument()
  // the meta line comes before the prompt it describes
  expect(meta().compareDocumentPosition(screen.getByText('Steps in the TCP handshake?')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(document.querySelector('.chip')).toBeNull()
})

test('a right pick leads with the verdict and keeps every option on screen, marked, with why', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  const verdict = await screen.findByText('Correct')
  expect(api.answer).toHaveBeenCalledWith({ questionId: 9, answerIndex: 2 })
  expect(api.review).toHaveBeenCalledWith(9)
  expect(verdict.compareDocumentPosition(marked()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(marked()).getAllByRole('listitem')).toHaveLength(4)
  expect(option('3')).toHaveTextContent('Your answer, right')
  expect(option('3')).toHaveTextContent('All three on slide 3.')
  expect(option('1')).toHaveTextContent('Only the SYN.')
  // the marks say which was picked, and a raw score never sits beside the verdict
  expect(screen.queryByText(/You picked/)).not.toBeInTheDocument()
  expect(verdict).toHaveTextContent(/^Correct$/)
  // nothing to click: an answered question is not answered again
  expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument()
})

test('a wrong pick marks Your answer and Right answer, then the explanation from the slide with Open slide', async () => {
  vi.mocked(api.answer).mockResolvedValueOnce({ id: 1, verdict: 'INCORRECT', score: 0, feedback: null, answerKey: '3' })
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '1' }))
  expect(await screen.findByText('Incorrect')).toBeInTheDocument()
  expect(option('1')).toHaveTextContent('Your answer')
  expect(option('1')).toHaveClass('is-miss')
  expect(option('3')).toHaveTextContent('Right answer')
  expect(option('3')).toHaveClass('is-key')
  expect(option('2')).not.toHaveTextContent(/answer/)
  const why = screen.getByRole('region', { name: 'Why, from the slides' })
  expect(within(why).getByText('From slide 3')).toBeInTheDocument()
  expect(why).toHaveTextContent('Slide 3 shows SYN, SYN-ACK and ACK.')
  expect(within(why).getByRole('link', { name: 'Open slide 3' })).toHaveAttribute('href', '/api/materials/4/pdf#page=3')
  // no disclosure to open and no box holding the answer
  expect(document.querySelector('details')).toBeNull()
})

test('when the review fails to load, the verdict and the key the answer came back with still show', async () => {
  vi.mocked(api.review).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  expect(await screen.findByText('Correct')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(SERVER_PROBLEM)
  expect(screen.getByText('You picked C: 3')).toBeInTheDocument()
  expect(screen.getByText('Right answer').closest('.answer-key')).toHaveTextContent('Right answer3')
  // the attempt was saved all the same, and the visit goes on
  expect(api.answer).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Next question' })).toBeEnabled()
})

test('a question met again in the visit uses the review it already has', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Next question' }))
  await screen.findByRole('button', { name: '3' })
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  expect(await screen.findByText('Correct')).toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledTimes(2)
  expect(api.review).toHaveBeenCalledTimes(1)
})

test('I was actually right reverses a wrong pick, refetches the head figure, and keeps the marks', async () => {
  vi.mocked(api.answer).mockResolvedValueOnce({ id: 1, verdict: 'INCORRECT', score: 0, feedback: null, answerKey: '3' })
  vi.mocked(api.override).mockResolvedValueOnce({ id: 1, verdict: 'CORRECT', score: 1, feedback: null })
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '1' }))
  await userEvent.click(await screen.findByRole('button', { name: 'I was actually right' }))
  expect(await screen.findByText('Correct')).toBeInTheDocument()
  expect(api.override).toHaveBeenCalledWith(1)
  // the override is a verdict like any other: it moves the schedule and the evaluation counts it
  await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(3))
  expect(screen.getByRole('button', { name: 'I was actually wrong' })).toBeInTheDocument()
  expect(option('1')).toHaveTextContent('Your answer')
  expect(option('3')).toHaveTextContent('Right answer')
  expect(api.review).toHaveBeenCalledTimes(1)
})

test('the head figure shows what is left and the overview is refetched after an answer', async () => {
  await renderWithQuestion()
  const figure = screen.getByText('left today').closest('.figure')!
  // the page portals its figure into the course head, beside the tabs
  expect(figure.closest('.course-head-slot')).not.toBeNull()
  expect(screen.getByText('left today').previousElementSibling).toHaveTextContent('16')
  const fill = () => figure.parentElement!.querySelector<HTMLElement>('.bar > span')!
  expect(fill().style.width).toBe('0%')
  vi.mocked(api.overview).mockResolvedValueOnce([{ ...course, dueToday: 15, archived: false }])
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByText('left today').previousElementSibling).toHaveTextContent('15'))
  // one of sixteen done: the bar moves, the verdict stays, and no next question was fetched for it
  expect(fill().style.width).toBe('6%')
  expect(screen.getByText(/Correct/)).toBeInTheDocument()
  expect(api.next).toHaveBeenCalledTimes(1)
})

test('with nothing due at the start of the visit there is no bar to fill', async () => {
  vi.mocked(api.overview).mockResolvedValue([{ ...course, dueToday: 0, archived: false }])
  await renderWithQuestion()
  const figure = screen.getByText('left today').closest('.figure')!
  expect(figure).toHaveTextContent('0')
  expect(figure.parentElement!.querySelector('.bar')).toBeNull()
})

test('empty state when nothing due, with a way to the bank', async () => {
  vi.mocked(api.next).mockResolvedValueOnce(null)
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText(/Nothing due/)).toBeInTheDocument())
  expect(screen.getByRole('link', { name: 'Open the bank' })).toHaveAttribute('href', '/courses/1/bank')
})

test('shows an alert when loading the next question fails', async () => {
  vi.mocked(api.next).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  renderInCourse(<StudyPage />, 'study')
  // the sentence alone: no "Error:" in front, no status, no URL
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(SERVER_PROBLEM))
})

test('shows an alert when answering fails', async () => {
  vi.mocked(api.answer).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(SERVER_PROBLEM))
  expect(screen.getByRole('button', { name: '3' })).toBeEnabled()
})

test('ignores a second click while an answer is pending', async () => {
  let resolveAnswer!: (a: AnsweredAttempt) => void
  vi.mocked(api.answer).mockReturnValueOnce(new Promise<AnsweredAttempt>(r => { resolveAnswer = r }))
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await userEvent.click(screen.getByRole('button', { name: '4' }))
  expect(api.answer).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '4' })).toBeDisabled()
  resolveAnswer({ id: 1, verdict: 'CORRECT', score: 1, feedback: null, answerKey: '3' })
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
})

test('keeps the graded question locked when loading the next one fails', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  vi.mocked(api.next).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(SERVER_PROBLEM))
  expect(screen.getByText(/Correct/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next question' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledTimes(1)
})

test('a short answer shows the answer as sent, the verdict, the grader, the model answer and rubric, then why', async () => {
  await renderShortAnswer({ id: 2, verdict: 'INCORRECT', score: 0.4, feedback: 'Missed ACK.' })
  const verdict = await screen.findByText('Incorrect')
  expect(api.answer).toHaveBeenCalledWith({ questionId: 10, answerText: 'SYN then SYN-ACK' })
  expect(api.review).toHaveBeenCalledWith(10)
  const sent = screen.getByText('SYN then SYN-ACK')
  const grader = screen.getByText('Grader: Missed ACK.')
  // the model answer is the review's, and the rubric under it says what a right answer needs
  const model = screen.getByText('Model answer').closest('.answer-key')!
  expect(model).toHaveTextContent('SYN, then SYN-ACK, then ACK.')
  expect(screen.getByText('What a right answer needs').closest('.answer-key')).toHaveTextContent('names all three segments')
  const why = screen.getByRole('region', { name: 'Why, from the slides' })
  expect(within(why).getByText('From slides 3, 4')).toBeInTheDocument()
  expect(within(why).getByRole('link', { name: 'Open slide 3' })).toBeInTheDocument()
  const inOrder = [sent, verdict, grader, model, why, screen.getByRole('button', { name: 'I was actually right' })]
  for (let i = 1; i < inOrder.length; i++) {
    expect(inOrder[i - 1].compareDocumentPosition(inOrder[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
  // the grader's score stays off the screen: the verdict says it
  expect(screen.queryByText('0.4')).not.toBeInTheDocument()
})

test('a pending verdict shows the model answer, then offers self-grade', async () => {
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  expect(await screen.findByText('Grader unavailable. Grade this one yourself')).toBeInTheDocument()
  const model = screen.getByText('Model answer').closest('.answer-key')!
  expect(model).toHaveTextContent('SYN, then SYN-ACK, then ACK.')
  const right = screen.getByRole('button', { name: /I got it right/i })
  expect(model.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByRole('button', { name: /I got it wrong/i })).toBeInTheDocument()
})

test('a short answer whose review fails still shows the key the answer came back with', async () => {
  vi.mocked(api.review).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await screen.findByText('Grader unavailable. Grade this one yourself')
  expect(screen.getByRole('alert')).toHaveTextContent(SERVER_PROBLEM)
  expect(screen.getByText('Model answer').closest('.answer-key')).toHaveTextContent('SYN, SYN-ACK, ACK')
  expect(screen.queryByRole('region', { name: 'Why, from the slides' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /I got it right/i })).toBeEnabled()
})

test('shows an alert when self-grading fails and keeps the self-grade buttons', async () => {
  vi.mocked(api.selfGrade).mockRejectedValueOnce(new Error(SERVER_PROBLEM))
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /I got it right/i }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(SERVER_PROBLEM))
  expect(api.selfGrade).toHaveBeenCalledWith(2, true)
  expect(screen.getByRole('button', { name: /I got it right/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /I got it wrong/i })).toBeEnabled()
})

test('disables Next question while a self-grade is in flight', async () => {
  let resolveSelfGrade!: (a: Attempt) => void
  vi.mocked(api.selfGrade).mockReturnValueOnce(new Promise<Attempt>(r => { resolveSelfGrade = r }))
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /I got it right/i }))
  expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled()
  resolveSelfGrade({ id: 2, verdict: 'CORRECT', score: 1, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next question' })).toBeEnabled())
  expect(api.next).toHaveBeenCalledTimes(1)
})

test('ignores a second Next question click while the next question is loading', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  let resolveNext!: (q: StudyQuestion | null) => void
  vi.mocked(api.next).mockClear()
  vi.mocked(api.next).mockReturnValueOnce(new Promise<StudyQuestion | null>(r => { resolveNext = r }))
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  expect(api.next).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled()
  resolveNext(null)
  await waitFor(() => expect(screen.getByText(/Nothing due/)).toBeInTheDocument())
})

test('will not send a blank or whitespace-only short answer to the grader', async () => {
  vi.mocked(api.next).mockResolvedValueOnce(shortAnswer)
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await userEvent.type(screen.getByRole('textbox'), '   ')
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  expect(api.answer).not.toHaveBeenCalled()
  await userEvent.clear(screen.getByRole('textbox'))
  await userEvent.type(screen.getByRole('textbox'), '  SYN then SYN-ACK  ')
  expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  // the padding is gated on the trim, so it is not part of what gets billed and stored
  expect(api.answer).toHaveBeenCalledWith({ questionId: 10, answerText: 'SYN then SYN-ACK' })
})

test('shows no citation for a question with no lecture and no source pages', async () => {
  vi.mocked(api.next).mockResolvedValueOnce({
    id: 11, conceptId: 1, topic: 'TCP handshake', lecture: null, lectureId: null, type: 'MC', prompt: 'Steps in the TCP handshake?', options: ['1', '2', '3', '4'], sourcePages: null,
  })
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument())
  expect(screen.queryByText(/slide|Lecture/)).not.toBeInTheDocument()
})

test('grading hands focus to the verdict, so the next Tab goes on down through the answer', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  const band = (await screen.findByText(/Correct/)).closest('.quiz-verdict')!
  await waitFor(() => expect(band).toHaveFocus())
  await userEvent.tab()
  expect(screen.getByRole('link', { name: 'Open slide 3' })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'I was actually wrong' })).toHaveFocus()
})

test('a self-grade hands focus to the verdict that replaces the pending band', async () => {
  vi.mocked(api.selfGrade).mockResolvedValueOnce({ id: 2, verdict: 'CORRECT', score: 1, feedback: null })
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await userEvent.click(await screen.findByRole('button', { name: /I got it right/i }))
  const band = (await screen.findByText(/Correct/)).closest('.quiz-verdict')!
  await waitFor(() => expect(band).toHaveFocus())
})

test('Next question puts focus on the new prompt, one Tab from the first option', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toHaveFocus())
  await userEvent.tab()
  expect(screen.getByRole('button', { name: '1' })).toHaveFocus()
})

test('a second Enter on the heels of Next question answers nothing', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  screen.getByRole('button', { name: 'Next question' }).focus()
  await userEvent.keyboard('{Enter}')
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toHaveFocus())
  // the repeat of a held key, or a stuttered second press, lands on the prompt
  await userEvent.keyboard('{Enter}')
  expect(api.answer).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
  expect(screen.queryByText(/Correct/)).not.toBeInTheDocument()
})

test('Next question puts focus on a short answer prompt, one Tab from the textarea', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  vi.mocked(api.next).mockResolvedValueOnce(shortAnswer)
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toHaveFocus())
  await userEvent.tab()
  expect(screen.getByRole('textbox')).toHaveFocus()
})

test('when the queue runs out after Next question, focus lands on the empty state, one Tab from the bank', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  vi.mocked(api.next).mockResolvedValueOnce(null)
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await waitFor(() => expect(screen.getByText('Nothing due. Come back tomorrow.')).toHaveFocus())
  await userEvent.tab()
  expect(screen.getByRole('link', { name: 'Open the bank' })).toHaveFocus()
})

/* ---- looking back through the visit ---------------------------------------------------- */

const secondMc: StudyQuestion = {
  id: 12, conceptId: 3, topic: 'Connection teardown', lecture: 'Lecture 4.pdf', lectureId: 5, type: 'MC', prompt: 'Which flag closes a connection?', options: ['1', '2', '3', '4'], sourcePages: '9',
}

/* answers the MC question on the table with option 3 and takes Next question to the given one */
async function answerAndMoveOn(next: StudyQuestion) {
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await screen.findByRole('button', { name: 'Next question' })
  vi.mocked(api.next).mockResolvedValueOnce(next)
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await screen.findByText(next.prompt)
}

test('there is nothing to step back to before the first answer', async () => {
  await renderWithQuestion()
  expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
})

test('after Next question the answered question is one step back, as it went', async () => {
  await renderWithQuestion()
  await answerAndMoveOn(shortAnswer)
  expect(screen.getByText('2 of 2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByText('1 of 2')).toBeInTheDocument()
  expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument()
  expect(screen.getByText('Correct')).toBeInTheDocument()
  expect(option('3')).toHaveTextContent('Your answer, right')
  expect(screen.getByText('From slide 3')).toBeInTheDocument()
  expect(screen.queryByText('Describe the handshake.')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('2 of 2')).toBeInTheDocument()
  expect(screen.getByText('Describe the handshake.')).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toBeInTheDocument()
  // looking back and forward again fetched nothing and answered nothing
  expect(api.next).toHaveBeenCalledTimes(2)
  expect(api.answer).toHaveBeenCalledTimes(1)
})

test('a half-typed answer is still there after a look back', async () => {
  await renderWithQuestion()
  await answerAndMoveOn(shortAnswer)
  await userEvent.type(screen.getByRole('textbox'), 'SYN first')
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByRole('textbox')).toHaveValue('SYN first')
})

test('a question looked back on can be self-graded there, and its new band takes the caret', async () => {
  vi.mocked(api.selfGrade).mockResolvedValueOnce({ id: 2, verdict: 'CORRECT', score: 1, feedback: null })
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await screen.findByRole('button', { name: /I got it right/i })
  vi.mocked(api.next).mockResolvedValueOnce(secondMc)
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await screen.findByText('Which flag closes a connection?')

  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByText('Grader unavailable. Grade this one yourself')).toBeInTheDocument()
  expect(screen.getByText('Model answer').closest('.answer-key')).toHaveTextContent('SYN, then SYN-ACK, then ACK.')
  // looking back changes a verdict; it never answers again or moves the queue on
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Next question' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /I got it right/i }))
  const band = (await screen.findByText('Correct')).closest('.quiz-verdict')!
  await waitFor(() => expect(band).toHaveFocus())
  expect(api.selfGrade).toHaveBeenCalledWith(2, true)
  expect(screen.getByText('1 of 2')).toBeInTheDocument()
})

test('an override made while looking back is recorded on that attempt, and it sticks', async () => {
  await renderShortAnswer({ id: 2, verdict: 'INCORRECT', score: 0.4, feedback: 'Missed ACK.' })
  await screen.findByRole('button', { name: /I was actually right/i })
  vi.mocked(api.next).mockResolvedValueOnce(secondMc)
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await screen.findByText('Which flag closes a connection?')

  vi.mocked(api.override).mockResolvedValueOnce({ id: 2, verdict: 'CORRECT', score: 1, feedback: 'Missed ACK.' })
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  await userEvent.click(screen.getByRole('button', { name: /I was actually right/i }))
  await screen.findByText('Correct')
  expect(api.override).toHaveBeenCalledWith(2)
  // a changed verdict moves the schedule, so the head figure is refetched as after any answer
  await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(3))

  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByText('Correct')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /I was actually wrong/i })).toBeInTheDocument()
})

test('looking back shows the verdict as it stood when the question was left, override included', async () => {
  vi.mocked(api.override).mockResolvedValueOnce({ id: 2, verdict: 'CORRECT', score: 1, feedback: 'Missed ACK.' })
  await renderShortAnswer({ id: 2, verdict: 'INCORRECT', score: 0.4, feedback: 'Missed ACK.' })
  await userEvent.click(await screen.findByRole('button', { name: /I was actually right/i }))
  await screen.findByRole('button', { name: /I was actually wrong/i })
  vi.mocked(api.next).mockResolvedValueOnce(secondMc)
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await screen.findByText('Which flag closes a connection?')

  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByText('Correct')).toBeInTheDocument()
  expect(screen.queryByText('Incorrect')).not.toBeInTheDocument()
})

/* the backend only changes a concept's most recent attempt, so the page offers no control
   it would refuse */
test('a later answer on the same concept makes the earlier verdict final', async () => {
  await renderWithQuestion()
  await answerAndMoveOn({ ...secondMc, conceptId: 1 })
  await answerAndMoveOn(shortAnswer)
  expect(screen.getByText('3 of 3')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  // the second question is still its concept's latest answer, so its verdict can change
  expect(screen.getByText('Which flag closes a connection?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /I was actually wrong/i })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument()
  expect(screen.getByText('You answered this concept again later in the visit, so this verdict is final.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /I was actually/i })).not.toBeInTheDocument()
  // a final verdict still shows how it went
  expect(option('3')).toHaveTextContent('Your answer, right')
})

test('a step to either end of the visit hands the caret to the card that arrived', async () => {
  await renderWithQuestion()
  await answerAndMoveOn(shortAnswer)
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  // Previous has nowhere further to go, so the caret is on the question it brought back
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toHaveFocus())
  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toHaveFocus())
})

test('a step with further to go leaves the caret on its button', async () => {
  await renderWithQuestion()
  await answerAndMoveOn(secondMc)
  await answerAndMoveOn(shortAnswer)
  expect(screen.getByText('3 of 3')).toBeInTheDocument()
  screen.getByRole('button', { name: 'Previous' }).focus()
  await userEvent.keyboard('{Enter}')
  expect(screen.getByText('2 of 3')).toBeInTheDocument()
  expect(screen.getByText('Which flag closes a connection?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous' })).toHaveFocus()
})

test('the step buttons wait while an answer is out being graded', async () => {
  await renderWithQuestion()
  await answerAndMoveOn(shortAnswer)
  let resolveAnswer!: (a: AnsweredAttempt) => void
  vi.mocked(api.answer).mockReturnValueOnce(new Promise<AnsweredAttempt>(r => { resolveAnswer = r }))
  await userEvent.type(screen.getByRole('textbox'), 'SYN')
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  resolveAnswer({ id: 3, verdict: 'CORRECT', score: 1, feedback: null, answerKey: 'SYN, SYN-ACK, ACK' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled())
})

test('when the queue runs out, the answered questions are still one step back', async () => {
  await renderWithQuestion()
  vi.mocked(api.next).mockResolvedValueOnce(null)
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Next question' }))
  await screen.findByText('Nothing due. Come back tomorrow.')
  expect(screen.getByText('2 of 2')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(option('3')).toHaveTextContent('Your answer, right')
  expect(screen.queryByText('Nothing due. Come back tomorrow.')).not.toBeInTheDocument()
})

import type { StudyQuestion } from '../api'
import { citation } from '../source'

/* One quiet line saying what the question tests, the lecture and slides to check it against,
   and its kind, then the prompt, which takes the caret when a new question arrives. The line
   is the quiz's, so a question reads the same in both, and it costs one line where three
   chips cost a phone's first screen. */
export default function QuestionHead({ question, lecture, landing }: {
  question: StudyQuestion
  /* the question's lecture by its name, not its file */
  lecture: string | null
  landing: (el: HTMLElement | null) => void
}) {
  const source = citation(lecture, question.sourcePages)
  return (
    <>
      <p className="quiz-meta">
        {question.topic && <span>{question.topic}</span>}
        {source && <span>{source}</span>}
        <span>{question.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
      </p>
      <p className="prompt" tabIndex={-1} ref={landing}>{question.prompt}</p>
    </>
  )
}

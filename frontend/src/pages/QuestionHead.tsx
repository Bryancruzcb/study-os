import type { StudyQuestion } from '../api'
import { citation } from '../source'

/* The question's kind, the concept it tests, and the lecture and slides to check it against,
   then the prompt, which takes the caret when a new question arrives. Shared by Study and Quiz,
   so a question reads the same in both. */
export default function QuestionHead({ question, landing }: {
  question: StudyQuestion
  landing: (el: HTMLElement | null) => void
}) {
  const source = citation(question.lecture, question.sourcePages)
  return (
    <>
      <div className="chips">
        <span className="chip">{question.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
        {question.topic && <span className="chip">{question.topic}</span>}
        {source && <span className="chip chip--mono">{source}</span>}
      </div>
      <p className="prompt" tabIndex={-1} ref={landing}>{question.prompt}</p>
    </>
  )
}

import type { Ref } from 'react'
import type { QuestionReview, StudyQuestion } from '../api'
import Icon from '../icons'
import { letter } from '../letter'
import { citation, firstSlide, slideHref, slides } from '../source'
import Diagram from './Diagram'

/* An answered question as Study and Quiz both show it, so a question reads the same in both:
   the verdict first, every option kept on screen and marked, and why, from the slides. */

/* the verdict, first thing after an answer and where the caret lands; the check or the x
   beside the word means the colour is never the only signal */
export function Verdict({ correct, band }: { correct: boolean; band?: Ref<HTMLDivElement> }) {
  return (
    <div ref={band} tabIndex={-1} className={`quiz-verdict ${correct ? 'is-ok' : 'is-bad'}`}>
      <Icon name={correct ? 'check' : 'x'} size={20} />
      {correct ? 'Correct' : 'Incorrect'}
    </div>
  )
}

/* An answered multiple-choice question: the verdict first, where the caret lands, then every
   option marked, each with why the slides make it right or wrong, then the explanation. The
   marks say which was picked, so the verdict needs no "you picked" line of its own. */
export function McReview({ question, picked, correct, review, band }: {
  question: StudyQuestion
  picked: number | null
  correct: boolean
  review: QuestionReview
  band?: Ref<HTMLDivElement>
}) {
  const pick = picked ?? -1
  return (
    <>
      <Verdict correct={correct} band={band} />
      <ol className="quiz-review" aria-label="Why each option is right or wrong">
        {question.options.map((option, i) => {
          const isKey = i === review.correctIndex
          const isPick = i === pick
          const tag = isKey && isPick ? 'Your answer, right' : isKey ? 'Right answer' : isPick ? 'Your answer' : null
          return (
            <li key={i} className={`quiz-opt${isKey ? ' is-key' : ''}${isPick && !isKey ? ' is-miss' : ''}`}>
              <span className="letter" aria-hidden="true">{isKey ? <Icon name="check" size={16} /> : letter(i)}</span>
              <span className="quiz-opt-main">
                <span className="quiz-opt-text">{option}</span>
                {tag && <span className="quiz-tag">{tag}</span>}
              </span>
              {review.optionExplanations[i] && <p className="quiz-opt-why">{review.optionExplanations[i]}</p>}
            </li>
          )
        })}
      </ol>
      <Why question={question} review={review} />
    </>
  )
}

/* why the answer is what it is, from the slides: the explanation, a diagram where one helps, and
   the lecture and slides to check it against, with the slide itself a click away */
export function Why({ question, review }: { question: StudyQuestion; review: QuestionReview }) {
  const source = citation(question.lecture, question.sourcePages)
  const first = firstSlide(question.sourcePages)
  const href = question.lectureId === null ? null : slideHref(question.lectureId, question.sourcePages)
  return (
    <section className="why" aria-label="Why, from the slides">
      <p className="why-label">{question.sourcePages ? `From ${slides(question.sourcePages)}` : 'From the slides'}</p>
      {review.explanation
        ? review.explanation.split(/\n{2,}/).map((paragraph, i) => <p key={i} className="why-text">{paragraph}</p>)
        : <p className="why-text">No explanation has been written for this question yet.</p>}
      {review.diagram && <Diagram source={review.diagram} label={`Diagram: ${question.prompt}`} />}
      {(source || href) && (
        <p className="why-source">
          {source && <span>{source}</span>}
          {href && (
            <a className="why-open" href={href} target="_blank" rel="noopener">
              Open slide {first}<Icon name="external-link" size={14} />
            </a>
          )}
        </p>
      )}
    </section>
  )
}

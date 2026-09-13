# Study OS

[![CI](https://github.com/Bryancruzcb/study-os/actions/workflows/ci.yml/badge.svg)](https://github.com/Bryancruzcb/study-os/actions/workflows/ci.yml)

Claude grades my short answers against a rubric, I overrule it when it is wrong, and
every override is counted. The app reports how often the grader and I disagreed, so
the number it publishes about its own grader is one I can check.

Around that: I upload a lecture PDF, get back concepts and questions cited to their
source pages, then study them daily with spaced repetition, paced to my exam dates. When
I want to test myself on everything at once, a quiz shuffles every question from every
topic together and shows, after each answer, why each option is right or wrong according
to the slides, with a diagram where a picture helps. The project page is at
https://bryancruzcb.github.io/study-os/.

## Walkthrough

[![A walkthrough of Study OS: the home page's cards lighting up under the pointer, the
evaluation page listing a failed question and opening its card in the bank, a study
session that answers two questions and steps back through them, a concept's questions
in the bank, a midterm two weeks out added on the dashboard with the plan it makes for
today, and the dashboard's weakest concepts and lecture bars](docs/walkthrough.gif)](docs/walkthrough.mp4)

*The app end to end, recorded against a copy of my own data. The answers and the exam
given on camera went into that copy, so the numbers move the way they would for real
while my actual schedule stayed as it was. The preview is a compressed GIF; click it for
the full-quality video.*

![The Study OS home: one tile per course with its due-today count and the size of its
bank, the middle tile lit where the pointer rests](docs/screenshots/courses.jpg)

*Home. Each class is a tile; the number is what the schedule wants from me today, and
the dashed tile after the courses makes a new one. Cards and buttons catch a light that
follows the pointer, and the pill in the top bar slides to the page I am on.*

![A quiz question on fork() after a wrong pick: four options, the picked one red and the
right one green, each with a sentence from the slides on why, then the Incorrect verdict
with the explanation and a sequence diagram of the parent and child
processes](docs/screenshots/quiz.jpg)

*A quiz question after I missed it. Every option says why the slides make it right or
wrong, with the right answer in green and my pick in red, and the explanation underneath
cites the slides it comes from and draws the parent and child processes. The quiz is
every question from every lecture I pick, shuffled, and it never touches the study
schedule.*

![The question bank: the course's concept list on the left with the open concept filled
dark, and on the right that concept's lecture file and slides above its question cards,
each tagged with its type and the slides it came from, with three pill-toggle labels, a
save button and a retire link](docs/screenshots/bank.jpg)

*The bank. The list on the left is every concept the course's lectures produced. The open
one names the lecture file and slides it came from, and every question card carries its
own slides, so a question can be checked against the source. The three pill toggles are
how I judge the generator. Retire is a quiet link that asks for a confirm, because when it
sat next to the label button I retired two questions by misclicking. A question I decided
was bad is struck through rather than deleted, and I can put it back.*

![The dashboard: an exams card with a midterm two weeks out, the new topics and reviews
it puts on today, how many of its topics are started and the day new topics give way to
review, then four figure tiles for due today, percent correct, concepts to work on and
concepts not started, and the concepts whose last answer was wrong with their lecture
and slides](docs/screenshots/dashboard.jpg)

*The schedule for one course. The exam card says what today holds: the new topics its
plan puts on today, the reviews due, how much of its material is started, and the day
new topics stop so the days left are for review. The tiles say where I stand. Below them
are the concepts I got wrong last time, weakest first, each with the slides to reread.
Further down, every lecture is one row whose bar splits its concepts into right last
time, to work on, and not started; opening the row lists them, and the lectures come
eight to a page.*

![The evaluation page: three question checks over 31 labeled questions, passing 31, 30
and 29 of them, with the two questions that failed the clarity check listed under it,
each naming its course and concept](docs/screenshots/eval.jpg)

*The evaluation page. The checks cover the 31 questions I have labeled, not the whole
bank, and each check lists the questions it failed, linked to their cards in the bank.
Further down, the grader agreement wears a flag until there are 30 graded short answers,
because one graded answer at 100% means "no disagreement yet", not "the grader is
right".*

## How it works

- Spring Boot backend (Java 21), React and TypeScript frontend (Vite), Postgres.
- Ingest: the PDF goes to Claude as a document block, and a structured-output schema
  returns concepts and questions with their source pages, and with each question its
  explanation, a note for each option and a diagram where one helps. The response is
  streamed, because that much output would outlast a single HTTP response. An explanation
  that does not line up with its question is dropped instead of failing the upload. A file
  I have already ingested is recognized by its hash and handed back as it is, so I do not
  pay to read it twice. A failed extraction is retried once, then the material is marked
  FAILED, so there are no silent partial ingests; uploading that same file again retries
  it. Lectures can come in one at a time as they are released: each upload adds its
  concepts beside the ones already there and leaves my progress on those alone.
- Study: SM-2-lite scheduling per concept. A new concept starts with a 1 day interval and
  ease 2.5, due on the first day from today that is still under
  `app.study.new-concepts-per-day` (8) for its course, so a big upload fills the calendar
  forward instead of landing all at once. A correct answer multiplies the interval by the
  ease and always adds at least a day. A miss resets the interval to 1 day and drops the
  ease by 0.2, with a floor of 1.3.
- Exams: a course can have exams, each with a date and the lectures it covers, and a
  lecture uploaded later joins the nearest exam ahead. A topic (the exam card's word for a
  concept) is paced to the nearest exam still ahead that covers its lecture, so when a
  midterm and a final share a lecture, its topics move on to the final once the midterm
  has passed. The plan is worked out again on the first read of each day, from the days
  left, and again whenever an exam is added, changed or deleted or a lecture joins one.
  The topics not started yet are spread evenly over the days before a review stretch,
  which is a share of the time left (`app.study.exam-review-share`, 0.2), so a day holds a
  few topics while the exam is far off and more as it gets close, and a skipped day is
  spread over the days that remain. A topic counts as started once an answer to it has
  been graded, and from then on its next review never lands after its exam. Of the topics
  due today, the ones an exam covers that I missed last time come first.
- Grading: multiple choice is checked against the stored answer index. A short answer
  gets one grader call against the question's rubric. If that call fails the attempt
  stays PENDING and I grade it myself, so studying never blocks on the API.
- Quiz: every question in the course, or in the lectures I pick, shuffled into one quiz.
  A shorter quiz deals from every topic in turn, so ten questions cover ten topics before
  any topic gets a second. A short answer shows the model answer and its rubric and I mark
  it myself, so a quiz spends nothing on the grader. A quiz records no attempts and moves
  no review dates. The results list each lecture weakest first and the questions I missed,
  with a way to retake just those, and the run is kept in the browser, so a long quiz
  picks up where I left it.
- Explanations: a question can carry an explanation, a note for each option and a Mermaid
  diagram, all drawn only from its lecture's slides and cited by slide number. New uploads
  get them from ingest. The questions banked before ingest could write them were explained
  from each deck's slide text, reading the figure slides as images, and every deck had to
  pass a validator before it went in: every question covered, every cited slide one the
  deck really has, and every diagram parsed by the same mermaid version the app ships.
  Where a slide contradicted a question's answer key, the key was corrected; a class poll
  whose slide never gives the answer says so rather than guessing. Diagrams are drawn in mermaid's strict mode, in the page's own colours, and
  mermaid loads only when a question has a diagram.
- Home is a grid of course tiles, one per class, each showing what is due today and how
  much is in the bank, and a New course tile that makes a course and opens its bank for
  the first upload. Inside a course there are four tabs: Study (answer, override a
  verdict, self-grade a PENDING one, and step back through the questions already
  answered in this visit to override or self-grade them there), Quiz (above), Bank
  (upload a PDF, open a concept, label its questions, retire bad ones behind a confirm
  step and restore them when I misclick), and Dashboard (the course's exams, added,
  edited and deleted there, each with what today holds for it and when new topics give
  way to review, how many concepts are due, the share of graded answers I got right, the
  five weakest concepts to work on next, and a row per lecture with a bar of how its
  concepts stand that opens to the concepts themselves, eight lectures to a page).
  Every question names its concept, the lecture file and the slides it came from, so I
  can check it against the source. Eval (the report below) is global, and it grades the
  app rather than me.

## Evaluation

- Question bank: I hand-label questions on three checks (answerable from the source,
  correct answer, unambiguous). The eval page reports the share of labeled questions
  that pass each one, and lists the questions that fail, each linked to its card in the
  bank.
- Grader: agreement = 1 - overridden / graded, counted over the short answers the
  grader actually judged. Reported on the same page.

Both numbers only cover what I have labeled and answered so far. With nothing labeled
the page says so instead of showing 0%. One narrowing worth knowing when reading the
agreement number: I can only override the concept's most recent attempt, because that is
the only one whose schedule change can still be undone. Within a visit I can step back
to an earlier question and override it there, so a disagreement I notice a few questions
later still counts. It stops counting once the same concept has been answered again, or
once I leave the study page and the visit's history goes with it.

## Run it

It needs Java 21 or newer, Maven, Node (CI uses 26) and Docker.

    docker compose up -d
    export ANTHROPIC_API_KEY=...   # PowerShell: $env:ANTHROPIC_API_KEY="..."
    mvn -f backend/pom.xml spring-boot:run
    cd frontend && npm install && npm run dev

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend on port
8080. Compose starts the Postgres the backend expects: database, user and password all
`studyos`, on port 5432. A local Postgres set up the same way works too. Hibernate
creates the tables on the first run, and adds the ones a later version brings without
touching the data.

The API key is read from the environment at run time and is never stored in the repo.
Everything else is in `backend/src/main/resources/application.yml`: the two models under
`app.model.generation` and `app.model.grading`, and the two study settings above under
`app.study`.

## Tests

    mvn -f backend/pom.xml test
    cd frontend && npm install && npm test

115 backend tests and 180 frontend tests. Neither suite calls the Claude API or needs a
database, so no key is needed to run them.

One suite is deliberately not in that number. `PersistenceTest`, 12 tests, runs against
a real Postgres, because some things cannot be checked without one: that
`Attempt.createdAt` is non-null, that the concept and question lookups really are
ordered, that the home tiles' counts see only their own course and only its live
questions, that the exam plan's queries find the exams still ahead of a lecture, nearest
first, and count a concept as started only once an answer to it was graded, and that the
quiz reads one course's live questions in lecture order into columns wide enough for a
full explanation. The ordering is what the latest-attempt override guard trusts. It is
tagged `jpa` and excluded by default, so run it with a database up:

    mvn -f backend/pom.xml test -Dtest.excludedGroups=none -Dgroups=jpa

It uses the database in `application.yml` unless `SPRING_DATASOURCE_URL` names another,
and every test rolls back, so it leaves no rows behind.

GitHub Actions runs all three jobs on push and on pull requests: the hermetic backend
suite, the JPA suite against a Postgres service container, and the frontend tests and
build. A second workflow publishes the project page from `site/` and
`docs/screenshots/`.

## Limits

This is v1 and it is built for one person: me. There are no accounts and no auth, so
anyone who can reach the port can use it. It runs on my laptop, and only the static
project page is published. Uploads must be PDFs. Anything else is refused on its first
bytes, before the upload reaches Claude, so uploading a PowerPoint deck costs nothing and
comes back telling me to export it first. Files are capped at 32MB. Ingest is one call
per file with no progress and no background queue, so a long deck takes a while and the
upload request waits for it.

A lecture cannot be deleted or replaced yet. An edited PDF posted again is a different
file, so it comes in as a second lecture beside the first, and the old copy's questions
can only be retired one at a time. Exam pacing counts topics, not how long they take, so
a dense lecture's topics get the same share of a day as a light one's. Deleting an exam
leaves its topics on the days its last plan gave them.

A quiz's progress lives in the browser it was taken in, so it does not follow me to
another machine.

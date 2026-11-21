# Study OS

[![CI](https://github.com/Bryancruzcb/study-os/actions/workflows/ci.yml/badge.svg)](https://github.com/Bryancruzcb/study-os/actions/workflows/ci.yml)

Claude grades my short answers against a rubric, I overrule it when it is wrong, and
every override is recorded on the answer it overrules. How often the grader and I
disagreed is one query over those records, so it is a number I can check rather than
take on trust. [Evaluation](#evaluation) has the last reading.

Around that: I drop in a lecture (a PDF, a PowerPoint deck, Word notes, a photo of the
board or a saved web page), get back concepts and questions cited to their
source pages, then study them daily with spaced repetition, paced to my exam dates. When
I want to test myself on everything at once, a quiz shuffles every question from every
topic together and shows, after each answer, why each option is right or wrong according
to the slides, with a diagram where a picture helps. The project page is at
https://bryancruzcb.github.io/study-os/.

## Walkthrough

[![A walkthrough of Study OS: the home page's course tiles lighting up under the pointer,
the Practice tab switching from Study to Quiz, a ten-question quiz on one lecture with a
missed answer explained option by option and drawn as a diagram, a concept's questions in
the bank, a midterm two weeks out added on the dashboard with the plan it makes for today,
a lecture on the path opened to its concepts, and the course menu's Edit
course](docs/walkthrough.gif)](docs/walkthrough.mp4)

*The app end to end, recorded in November 2026 against a copy of my own data. The quiz
answers and the exam given on camera went into that copy, so the numbers move the way
they would for real while my actual schedule stayed as it was. The pointer is drawn in,
because the recording has none of its own. The preview is a compressed GIF; click it for
the full-quality video.*

![The Study OS home: the total due today as a serif headline, then a tile for each
current course with a tinted top, its due-today count, the size of its bank and a green
Study button, a New course button beside the Courses heading, and an archived course
listed underneath](docs/screenshots/courses.jpg)

*Home. Each class is a tile; the number is what the schedule wants from me today, and
Study opens it. New course sits beside the heading, and a finished class waits under
Archived until I restore or delete it. The moon in the top bar switches to the dark
theme.*

![The Practice tab in Quiz mode: a Study / Quiz switch at the top, a side panel with the
midterm 14 days out and the topics in this quiz, and a question on two processes
printing at once after a wrong pick: four options, the picked one red and the right one
green, each with a note from the slides on why, then the explanation from slide 48 and a
diagram of both processes writing to one terminal](docs/screenshots/quiz.jpg)

*Practice, in Quiz mode, after I missed a question. The switch at the top flips between
Study, which is today's spaced-repetition queue, and Quiz. Every option says why the
slides make it right or wrong, with the right answer in green and my pick in red, and
the explanation underneath cites its slide and draws the two processes. The panel on the
left shows the nearest exam, the score so far and every topic in the quiz. A quiz never
touches the study schedule.*

![The question bank: the course's concept list on the left with fork() Semantics open,
and on the right that concept's lecture and slides above its question cards, each tagged
with its type and slides, with its options, the right one checked, and a Retire
link](docs/screenshots/bank.jpg)

*The bank. The list on the left is every concept the course's lectures produced, under
links to generate more questions and to the lectures themselves. The open concept names
the lecture and slides it came from, and every card carries its own slides and its
options with the right one marked, so a question can be checked against the source.
Retire asks for a confirm, and a retired question is struck through rather than deleted,
so I can put it back.*

![The dashboard: a midterm on Saturday, December 5, 14 days out, then the headline
"Today: 22 new topics and 10 reviews." with the line that adds it up to 32 due today, a
green Start studying button, four small figures for due today, percent correct with the
answers behind it, concepts to work on and concepts not started, and a peach card listing
the concepts whose last answer was wrong with their lecture and
slides](docs/screenshots/dashboard.jpg)

*The schedule for one course. The headline is what the nearest exam's plan puts on
today, and the line under it says how that adds up against everything due, the day new
topics stop so the days left are for review, and what the exam covers. Start studying
opens the queue. The figures say where I stand, and the percent correct names the number
of graded answers behind it. The card beside them lists the concepts I got wrong last
time, weakest first, each with the slides to reread.*

![The lecture path further down the dashboard: "Your path through 28 lectures" with 10
of 248 topics started, then each lecture with its icon, its topic count, how its topics
stand and a bar, and a "Pick up here" flag on the first one](docs/screenshots/path.jpg)

*Further down, every lecture sits on one path in the order I uploaded them, with a bar
that splits its concepts into right last time, to work on, and not started, and a link
that opens the concepts themselves. Each lecture's icon is picked from its
title and its tint from its filename, and "Pick up here" marks the first lecture with
something to work on.*

## How it works

- Spring Boot backend (Java 21), React and TypeScript frontend (Vite), Postgres.
- Any file becomes a PDF first (`LectureFile`), so everything after it works on one
  format. A PDF passes through as it is. PowerPoint slides are drawn one to a page with
  Apache POI, so slide N is still page N. Pictures (JPEG, PNG, GIF, BMP, TIFF, WebP) are
  one page each, turned upright from a phone's EXIF tag. Word files, saved web pages and
  plain text or Markdown are set as pages of text. The bytes decide what a file is, not
  its extension. Formats it cannot read (HEIC, old .ppt/.doc, spreadsheets, Keynote)
  come back FAILED with a sentence on how to export them, without a call to Claude.
- Ingest: the PDF goes to Claude Opus 5.5 as a document block, and a structured-output
  schema returns concepts and questions with their source pages, and with each question
  its explanation, a note for each option and a diagram where one helps. Each concept is
  asked for four to six questions, each testing a different point. The prompt asks Claude
  to merge a concept the slides cannot fill that many questions for into its closest
  neighbor instead of padding it; a concept that still comes back short is kept, and the
  server logs it. The response is streamed, because that much output would outlast a
  single HTTP response. An explanation that does not line up with its question is dropped instead of
  failing the upload. A file I have already ingested is recognized by its hash and handed
  back as it is, so I do not pay to read it twice. A failed extraction is retried once,
  then the material is marked FAILED, so there are no silent partial ingests; uploading
  that same file again retries it. A refusal, or an answer cut off at the length limit,
  is not retried, because a second try would fail the same way at the same cost. A cited
  slide outside that PDF's pages counts as a failed extraction. The lecture stores the
  page count PDFBox read from the file. Lectures can come in one at a time as they are
  released: each upload adds its concepts beside the ones already there and leaves my
  progress on those alone.
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
  gets one call to Claude Sonnet 5.5 against the question's rubric. If that call fails,
  or Claude declines or runs out of room, the attempt stays PENDING and I grade it
  myself, so studying never blocks on the API.
- Quiz: every question in the course, or in the lectures I pick, shuffled into one quiz.
  A shorter quiz deals from every topic in turn, so ten questions cover ten topics before
  any topic gets a second. A short answer shows the model answer and its rubric and I mark
  it myself, so a quiz spends nothing on the grader. A quiz records no attempts and moves
  no review dates. The results list each lecture weakest first and the questions I missed,
  with a way to retake just those, and the run is saved on the account, so a long quiz
  picks up where I left it in any browser. While a quiz runs, a side panel shows the
  nearest exam, the score so far and every topic in the quiz with its lecture, its slides
  and how it has gone. O opens the cited slide in the lecture's PDF, and Report question
  takes a bad question out of the bank and the quiz, with Undo.
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
  much is in the bank, with a Study button when something is due. A New course button
  beside the heading makes a course and opens its bank for the first upload. Inside a
  course there are three tabs. Practice has a Study / Quiz
  switch at the top: Study (answer, override a verdict, self-grade a PENDING one, and step
  back through the questions already answered in this visit to override or self-grade
  them there) and Quiz (above). The other two are Bank (upload lecture files, open a concept,
  retire bad questions behind a confirm step and restore them when I misclick) and
  Dashboard (the course's exams, added, edited and deleted there, the nearest one leading with what today holds for it and when
  new topics give way to review, how many concepts are due, the share of graded answers I
  got right, the five weakest concepts to work on next, and every lecture on one path with
  a bar of how its concepts stand that opens to the concepts themselves).
  Every question names its concept, the lecture file and the slides it came from, so I
  can check it against the source. The menu beside a course's name renames it (name and
  term), archives it or deletes it.
- Look: light by default with a matching dark theme. It follows the system setting until
  the moon or sun button in the top bar picks one, and the browser remembers the pick.
  The style rules (palette, type, components, motion) are in [DESIGN.md](DESIGN.md).

## Evaluation

Until November 2026 the app had an Evaluation page with two measurements:

- Question bank: I hand-labeled questions on three checks (answerable from the source,
  correct answer, unambiguous). The page reported the share of labeled questions that
  passed each one and listed the ones that failed, each linked to its card in the bank.
- Grader: agreement = 1 - overridden / graded, over this account's attempts whose grader
  verdict is set and is not PENDING.

Its last reading covered 31 labeled questions and one graded short answer. Of the 31, all
31 passed the source check, 30 the answer check and 29 the clarity check (100%, 97% and
94%). At one answer, 100% agreement
means "no disagreement yet", not "the grader is right", so the page flagged it until there
were 30 graded short answers.

The page, and the label buttons in the bank, were removed in November 2026. The data
behind them stays. Every override is still recorded on its attempt, and the backend
still answers `GET /api/eval/report` for the signed-in account with both measurements:
`EvalService.report` loads the graded attempts with
`AttemptRepo.findByQuestionConceptCourseOwnerIdAndGraderVerdictIsNotNull` and drops
PENDING. `POST /api/questions/{id}/label` still saves a question's labels, but nothing in
the app calls it now.

One narrowing worth knowing when reading the agreement number: I can only override the
concept's most recent attempt, because that is the only one whose schedule change can
still be undone. Within a visit I can step back to an earlier question and override it
there, so a disagreement I notice a few questions later still counts. It stops counting
once the same concept has been answered again, or once I leave the study page and the
visit's history goes with it.

## Run it

It needs Java 21 or newer, Maven, Node (CI uses 26) and Docker.

    docker compose up -d db
    export ANTHROPIC_API_KEY=...   # PowerShell: $env:ANTHROPIC_API_KEY="..."
    mvn -f backend/pom.xml spring-boot:run
    cd frontend && npm install && npm run dev

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend on port
8080. The first visit shows a sign-in / create-account form; locally the invite code is
blank, so you can create an account right away. `docker compose up -d db` starts the
Postgres the backend expects: database, user and password all `studyos`, on port 5432. A
local Postgres set up the same way works too. Flyway owns the schema, and
`spring.jpa.hibernate.ddl-auto` is `none`. On an empty database Flyway applies the scripts
in `backend/src/main/resources/db/migration`. A database that already has tables is
baselined at version 1 and left as it is.

The API key is read from the environment at run time and is never stored in the repo.
Everything else is in `backend/src/main/resources/application.yml`: the two models under
`app.model.generation` (`claude-opus-5-5`, which reads lectures, names them and writes
questions) and `app.model.grading` (`claude-sonnet-5-5`, which grades short answers and
names the lectures uploaded before titles existed), and the two study settings above
under `app.study`. The environment variables `APP_MODEL_GENERATION`
and `APP_MODEL_GRADING` override the models without a rebuild.

On start, the server names any lecture uploaded before lectures had titles, with one short
Claude call each, in the background. Set `TITLE_BACKFILL=false` to skip it.

## Tests

    mvn -f backend/pom.xml test
    cd frontend && npm install && npm test

262 backend tests and 332 frontend tests. Neither suite calls the Claude API or needs a
database, so no key is needed to run them.

Two suites are deliberately not in that number. `PersistenceTest` (16 tests) and
`AccountsIsolationTest` (4 tests) run against a real Postgres, because some things cannot
be checked without one:

- `Attempt.createdAt` is non-null.
- The concept and question lookups really are ordered. The latest-attempt override guard
  trusts that ordering.
- The home tiles' counts see only their own course and only its live questions.
- The exam plan's queries find the exams still ahead of a lecture, nearest first, and
  count a concept as started only once an answer to it was graded.
- The quiz reads one course's live questions in lecture order, into columns wide enough
  for a full explanation.
- One account never sees another's courses, lists or report.

Both are tagged `jpa` and excluded by default, so run them with a database up:

    mvn -f backend/pom.xml test -Dtest.excludedGroups=none -Dgroups=jpa

They use the database in `application.yml` unless `SPRING_DATASOURCE_URL` names another,
and every test rolls back, so they leave no rows behind.

GitHub Actions runs four jobs on pushes to the main branches and on pull requests: the
hermetic backend suite, the JPA suite against a Postgres service container, the frontend
tests and build, and a Docker image build that starts the app against Postgres and checks
the page, sign-in and invite-gated sign-up. A second workflow publishes the project page from `site/` and
`docs/screenshots/`.

## Limits

Accounts exist. Sign-up needs a username, a password, and (when `APP_INVITE_CODE` is set)
an invite code; the share link puts the code in `#invite=` so a friend never has to type
it. Each account owns only its own courses. Locally the invite code is blank, so sign-up
is open. A forgotten password is reset from the sign-in form: username (and invite when
required), then a new password. There is no email step; the reset token stays in the
browser for that visit.

The static project page at https://bryancruzcb.github.io/study-os/ is published from
`site/` whenever that tree changes on `master`. A public live demo runs at https://study-os-7o9j.onrender.com (invite code required).
The steps to stand up your own copy on Render with Neon Postgres, plus invite sharing and
the free-tier cold-start quirks, are in [docs/DEPLOY.md](docs/DEPLOY.md).

Uploads can be PDF, PowerPoint (.pptx), Word (.docx), images, web pages (.html) or
plain text and Markdown; each is turned into a PDF on the server before it reaches
Claude. A format it cannot read is refused on its first bytes, so it costs nothing and
comes back saying how to export it. Files are capped at 32MB. Several files can be
picked or dragged onto any course page at once; each becomes its own lecture, and they
upload one after another. Upload returns as soon as the file is stored; extraction runs
in the background and the app keeps checking until the lecture is ready or failed, even
after I leave the page.

A lecture can be deleted from the bank. Uploading again under the same filename replaces
the old lecture (and its concepts, questions, and review state); a different hash under a
new name still adds a second lecture. Exam pacing counts topics, not how long they take, so
a dense lecture's topics get the same share of a day as a light one's. Deleting an exam
leaves its topics on the days its last plan gave them.

A finished class can be archived from the menu beside its name. It leaves the home grid
and the due count and waits under Archived at the bottom of the home page, where it can
be opened, restored, or deleted. Deleting a course removes everything in it (lectures,
questions, attempts, exams, the saved quiz) and asks twice first, because nothing brings
it back.

A quiz's progress is saved on the account for that course, so it follows me across
browsers. A retake overwrites the previous run. The quiz still does not record study
attempts or move review dates.

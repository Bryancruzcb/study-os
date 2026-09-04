# Study OS

[![CI](https://github.com/Bryancruzcb/study-os/actions/workflows/ci.yml/badge.svg)](https://github.com/Bryancruzcb/study-os/actions/workflows/ci.yml)

Claude grades my short answers against a rubric, I overrule it when it is wrong, and
every override is counted. The app reports how often the grader and I disagreed, so
the number it publishes about its own grader is one I can check.

Around that: I upload a lecture PDF, get back concepts and questions cited to their
source pages, then study them daily with spaced repetition.

![The question bank: concepts and questions extracted from a lecture PDF, each with its
source page, the three label checkboxes, and a retired question struck
through](docs/screenshots/bank.jpg)

*The bank after an ingest. Every question carries the pages it came from, the three
label checkboxes are how I judge the generator, and a question I decided was bad is
struck through rather than deleted.*

![The dashboard: a table of concepts with streak, correct-out-of-attempted, and next
due date](docs/screenshots/dashboard.jpg)

*The schedule. New concepts are due today; the ones I answered correctly have moved out
to the sixth.*

![The evaluation page: 31 labeled questions at 100, 97 and 94 percent, and one graded
short answer at 100 percent grader agreement](docs/screenshots/eval.jpg)

*The evaluation page, and the honest state of it. The label rates are worth reading at
31 questions. The grader agreement line is not: it is one graded short answer, so 100%
there means "no disagreement yet", not "the grader is right".*

## How it works

- Spring Boot backend (Java 21), React and TypeScript frontend (Vite), Postgres.
- Ingest: the PDF goes to Claude as a document block, and a structured-output schema
  returns concepts and questions with their source pages. A file I have already ingested
  is recognized by its hash and handed back as it is, so I do not pay to read it twice.
  A failed extraction is retried once, then the material is marked FAILED, so there are
  no silent partial ingests; uploading that same file again retries it.
- Study: SM-2-lite scheduling per concept. A concept starts due today with a 1 day
  interval and ease 2.5. A correct answer multiplies the interval by the ease and always
  adds at least a day. A miss resets the interval to 1 day and drops the ease by 0.2,
  with a floor of 1.3.
- Grading: multiple choice is checked against the stored answer index. A short answer
  gets one grader call against the question's rubric. If that call fails the attempt
  stays PENDING and I grade it myself, so studying never blocks on the API.
- Four pages: Bank (upload a PDF, read the questions, retire bad ones behind a confirm
  step and restore them when I misclick, label them), Study (answer, override a verdict,
  self-grade a PENDING one), Dashboard (how many concepts are due, and per concept the
  streak, the correct-out-of-attempted count and the next due date), Eval (the report
  below).

## Evaluation

- Question bank: I hand-label questions on three checks (answerable from the source,
  correct answer, unambiguous). The eval page reports the share of labeled questions
  that pass each one.
- Grader: agreement = 1 - overridden / graded, counted over the short answers the
  grader actually judged. Reported on the same page.

Both numbers only cover what I have labeled and answered so far. With nothing labeled
the page says so instead of showing 0%. One narrowing worth knowing when reading the
agreement number: I can only override the concept's most recent attempt, because that is
the only one whose schedule change can still be undone. A disagreement I notice after
clicking Next is never recorded, so the dataset holds in-the-moment disagreements only.

## Run it

    docker compose up -d
    export ANTHROPIC_API_KEY=...   # PowerShell: $env:ANTHROPIC_API_KEY="..."
    mvn -f backend/pom.xml spring-boot:run
    cd frontend && npm install && npm run dev

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend on port
8080. Compose starts the Postgres the backend expects: database, user and password all
`studyos`, on port 5432. A local Postgres set up the same way works too. Hibernate
creates the tables on the first run.

The API key is read from the environment at run time and is never stored in the repo.
The two models are set in `backend/src/main/resources/application.yml` under
`app.model.generation` and `app.model.grading`.

## Tests

    mvn -f backend/pom.xml test
    cd frontend && npm install && npm test

71 backend tests and 50 frontend tests. Neither suite calls the Claude API or needs a
database, so no key is needed to run them.

One suite is deliberately not in that number. `PersistenceTest` runs against a real
Postgres, because two things cannot be checked without one: that `Attempt.createdAt`
is non-null, and that the concept and question lookups really are ordered. That
ordering is what the latest-attempt override guard trusts. It is tagged `jpa` and
excluded by default, so run it with a database up:

    mvn -f backend/pom.xml test -Dtest.excludedGroups=none -Dgroups=jpa

GitHub Actions runs all three jobs on push and on pull requests: the hermetic backend
suite, the JPA suite against a Postgres service container, and the frontend.

## Limits

This is v1 and it is built for one person: me. There are no accounts and no auth, so
anyone who can reach the port can use it. It runs on my laptop and nothing is deployed.
Uploads must be PDFs. Anything else is refused on its first bytes, before the upload
reaches Claude, so uploading a PowerPoint deck costs nothing and comes back telling me
to export it first. Files are capped at 32MB. Ingest is one call per file with no
progress and no background queue, so a long deck takes a while and the upload request
waits for it.

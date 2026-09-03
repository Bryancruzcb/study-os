# Study OS

Quiz myself on my own lecture slides. I upload a PDF, get back concepts and questions
cited to page numbers, then study them daily with spaced repetition. Short answers are
graded by Claude against a rubric. I can override the grader, and the overrides become
the dataset that measures it.

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
- Four pages: Bank (upload a PDF, read the questions, retire bad ones, label them),
  Study (answer, override a verdict, self-grade a PENDING one), Dashboard (how many
  concepts are due, and per concept the streak, the correct-out-of-attempted count and
  the next due date), Eval (the report below).

## Evaluation

- Question bank: I hand-label questions on three checks (answerable from the source,
  correct answer, unambiguous). The eval page reports the share of labeled questions
  that pass each one.
- Grader: agreement = 1 - overridden / graded, counted over the short answers the
  grader actually judged. Reported on the same page.

Both numbers only cover what I have labeled and answered so far. With nothing labeled
the page says so instead of showing 0%.

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
    cd frontend && npm test

63 backend tests and 27 frontend tests. Neither suite calls the Claude API or needs a
database, so no key is needed to run them. GitHub Actions runs both on push and on
pull requests.

## Limits

This is v1 and it is built for one person: me. There are no accounts and no auth, so
anyone who can reach the port can use it. It runs on my laptop and nothing is deployed.
Uploads must be PDFs; nothing checks that, so anything else just fails ingest. Files are
capped at 32MB. Ingest is one call per file with no progress and no background queue, so
a long deck takes a while and the upload request waits for it.

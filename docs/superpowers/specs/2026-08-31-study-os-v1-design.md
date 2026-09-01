# Study OS v1 — Design

Date: 2026-08-31
Status: Approved (pending final spec review)

## Problem

Bryan is a third-year SJSU CS student. Studying from lecture slides is passive; there is no
active-recall loop over his actual course material. Study OS ingests the slides and syllabi he
already has, builds a question bank cited to source pages, and drives a daily quiz session with
spaced repetition and per-concept mastery tracking.

v1 is a daily-use tool, single-user, running locally. Deployment, auth, and resume polish are
deferred until the tool has real usage behind it.

## Decisions (settled during brainstorming)

| Decision | Choice |
|---|---|
| v1 goal | Daily-use tool first; resume artifact later |
| Input materials | Syllabi + lecture slides/PDFs only (no audio, no notes OCR) |
| Core loop | Quiz + mastery tracking + spaced repetition |
| Question formats | Multiple choice (deterministic grading) + short answer (LLM-graded) |
| Interface | Local web app: React/TS frontend, REST backend |
| Backend | Java 21 + Spring Boot 3 + Maven |
| Generation strategy | Pre-generated question bank at ingest (approach A); on-demand follow-ups parked for v2 |

## Architecture

```
frontend/   React + TypeScript + Vite
backend/    Spring Boot 3, Java 21, Maven, JPA
docs/       specs, eval notes
docker-compose.yml   Postgres
```

- Single-user, no auth, no User table.
- Postgres via docker-compose (`docker compose up` is the only prerequisite besides JDK + Node).
- AI calls through the official Anthropic Java SDK (`com.anthropic:anthropic-java`).
- Lecture PDFs go to Claude as native document blocks with citations enabled. Returned
  concepts and questions carry page-level citations. No PDF-parsing library in v1.
- Models are config-driven, not hardcoded: `app.model.generation` and `app.model.grading`,
  both defaulting to `claude-opus-5`. Dropping grading to `claude-haiku-4-5` is a known cost
  lever, exercised by config change only.

## Data model

JPA entities. Names are final; fields listed are the v1 minimum.

- **Course** — name, term.
- **Material** — course, filename, file hash, page count, status (`PENDING | INGESTED | FAILED`),
  error message.
- **Concept** — course, name, one-line summary, source material, source pages.
- **Question** — concept, type (`MC | SHORT_ANSWER`), prompt, options + correct index (MC),
  model answer + rubric (short answer), source pages, status (`ACTIVE | RETIRED`).
- **Attempt** — question, given answer, verdict (`CORRECT | INCORRECT | PENDING`), score
  (0 or 1 for MC; 0.0–1.0 for short answer), feedback, grader raw output (JSON),
  overridden (bool), timestamp.
- **ReviewState** — one per concept: interval days, ease factor, due date, streak.
  Initial values: interval 1, ease 2.5, due date = ingest day, streak 0.

## Ingestion flow

1. Upload a PDF against a course. Material row created `PENDING`; file hash recorded.
2. Re-upload of an identical hash is a no-op (idempotent ingest).
3. Backend sends the PDF to the generation model with citations enabled; a structured-output
   schema returns concepts, each with MC and short-answer questions cited to pages.
4. On success: Concept/Question rows written, Material `INGESTED`, ReviewState created per
   concept with due date = today.
5. On failure: Material `FAILED` with the error; no partial rows kept; retry is a fresh ingest.
6. Malformed model output: one retry, then fail visibly. Never silently truncate or discard.

Bank browser UI: per material, list concepts and questions with their page citations, and let
the user retire bad questions by hand.

## Study loop

1. `GET /api/study/next` — concepts with `dueDate <= today`, most overdue first; questions for
   those concepts served least-recently-attempted first.
2. MC answers graded deterministically in the backend.
3. Short answers graded by one call to the grading model with question, model answer, rubric,
   and the given answer. Structured JSON verdict: `{correct, score, feedback}`. Raw grader
   output stored on the Attempt.
4. Override: the user can flip any verdict ("I was actually right/wrong"). The flip is applied
   to the review schedule and the disagreement is logged — overrides are the labeled dataset
   for grader evaluation.
5. Scheduling (SM-2-lite): correct → interval = max(1, round(interval × ease)), streak + 1;
   incorrect → interval = 1, ease reduced (floor 1.3), streak = 0. Due date = today + interval.
6. Session summary: concepts touched, accuracy, what is due next.

Dashboard: per-concept mastery (streak, accuracy), due-today count, coverage (concepts with
zero attempts) per course.

## Error handling

- Grading API failure: Attempt saved with verdict `PENDING`; UI offers self-grade buttons.
  Studying never blocks on the API.
- Ingest failure: visible `FAILED` status with error; retryable; idempotent by hash.
- All model responses parsed via structured outputs; schema violations are failures, not
  best-effort parses.

## Testing and evaluation

- **JUnit**: SM-2 scheduler math, grading state machine (including overrides and PENDING
  resolution), ingest idempotency.
- **Vitest**: quiz flow components.
- **Question-bank eval**: after the first real course ingest, hand-label 30–50 sampled
  questions on three axes — answerable from source, correct answer, unambiguous. Report
  generator quality as a percentage per axis. Bad questions are `RETIRED`.
- **Grader eval**: override log = human-vs-grader disagreement set. Report agreement rate.
- **CI**: GitHub Actions running backend tests, frontend tests, and both builds.

## Phases

1. **Ingest** — pipeline + bank browser UI with citations.
2. **Study loop** — MC grading, spaced repetition, dashboard.
3. **Short-answer grading** — LLM grader, overrides, PENDING fallback.
4. **Eval + polish** — question-bank eval, grader agreement report, README, demo.

Each phase ends usable: after phase 1 the bank is browsable; after phase 2 the tool is worth
opening daily.

## Parked for v2

- On-demand follow-up questions for twice-failed concepts (approach C).
- Deployment + auth (resume-artifact pass).
- Study planner / deadline awareness from syllabi.
- Multi-user.

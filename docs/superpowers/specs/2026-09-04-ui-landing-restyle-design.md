# Study OS UI: the landing page's language, Canvas-style course tiles

Date: 2026-09-04
Status: Approved in brainstorming (mockup approved, Study A + Bank A chosen)
Mockup: https://claude.ai/code/artifact/c65985f6-ced4-442d-810e-3a59fd0ae7b1
(page "Directions"; the boards named Home, Study A: Focus, Bank A: Concept tiles are the ones to build)

## Problem

The app is styled on the CreatorFlow instrument language (dark, square, hairlines, 11px labels)
while its own project page (`site/index.html`) is light, rounded and airy. Bryan wants the app to
look like its landing page, and wants course selection to work like Canvas: a home screen of
course tiles, each carrying the course name and its numbers, instead of a `<select>` repeated on
three pages. His review of the first mockup pass: the Study and Bank surfaces had "too much text
that's little"; the second pass (one centered question card; concept tiles that open into
question cards) was chosen.

## Decisions

| Decision | Choice |
|---|---|
| Theme | Light only, the landing page's tokens verbatim. No dark mode, no `prefers-color-scheme` block. |
| Home | Canvas-style course tiles: tinted top block with the course code and term, a due-today figure, concept and question counts. Whole tile is a link. |
| Tile hover | The AWS Startups card glow Bryan screenshotted (2026-09-03): a soft cyan-blue halo, `box-shadow: 0 0 0 1px oklch(78% 0.11 230 / 0.7), 0 0 30px 6px oklch(84% 0.10 228 / 0.55)`, plus the border taking `oklch(78% 0.11 230)`. Same glow on concept tiles and on answer options. |
| Navigation | Course-scoped routes. `/` is the course grid; Study, Bank and Dashboard live under `/courses/:courseId/...` as tabs inside a course shell; Evaluation stays global. |
| Study | Direction A "Focus": one centered column, one question card, 28px prompt, lettered 60px options, a coloured verdict band after answering, a progress figure and bar in the course head. |
| Bank | Direction A "Concept tiles": the bank opens as a grid of concept tiles; a tile opens the concept at its own route, showing its questions as cards with pill-toggle labels, a quiet retire link, and greyed retired cards with Restore. |
| New course | A dashed "+ New course" tile on the home grid opens the inline name/term form in its place. Creating navigates into the new course's Bank, where the only useful next step (upload) is. |
| Eval readout | Stays in the top nav, right-aligned, mono: `31 labeled · 1 graded · 100% agreement`. Hidden when the report fails to load. |
| Type floor | 12px (the landing's smallest size, the mono eyebrow). The CreatorFlow 11px floor rule is retired with the rest of that language. |
| Fonts | IBM Plex Sans 400/500/600/700 and IBM Plex Mono 400/500/600, self-hosted via `@fontsource` (the 700 and mono 500/600 faces are added; they ship in the installed packages). |
| Favicon | Replace the Vite-template purple bolt with the landing page's mark (near-black square, cyan square inset), as SVG. |
| Backend | One new endpoint, `GET /api/courses/overview`, so the tiles and course head get their counts in one call. No other API change. |
| Screenshots | Retake `docs/screenshots/{bank,dashboard,eval}.jpg`, add `courses.jpg`; README and `site/index.html` captions and alt text updated to describe what is now in the picture. Pages redeploys on push. |

## Visual system

All values come from `site/index.html`; nothing is rounded or invented except the four new
tokens marked (new).

Colour (oklch):

| Token | Value | Use |
|---|---|---|
| `--page` | `oklch(99% 0.002 250)` | page ground |
| `--card` | `oklch(100% 0 0)` | cards, nav pill, tiles |
| `--sunken` | `oklch(97.5% 0.006 250)` | panels, chips, your-answer block, retired cards |
| `--line` | `oklch(91% 0.006 250)` | every border and rule |
| `--ink` | `oklch(22% 0.012 250)` | text, primary button fill (`oklch(20% 0.012 250)` on the button, verbatim from `.btn`) |
| `--ink-soft` | `oklch(38% 0.012 250)` | secondary text, nav links |
| `--ink-dim` | `oklch(46% 0.012 250)` | labels, counts, captions |
| `--accent` | `oklch(50% 0.14 232)` | wordmark square, focus ring, progress bar |
| `--accent-strong` | `oklch(40% 0.14 232)` | eyebrows, links |
| `--flag` | `oklch(52% 0.16 28)` | retire, incorrect verdict, the `n=` flag on eval |
| `--ok` (new) | `oklch(50% 0.14 152)` | correct verdict mark |
| `--ok-wash` (new) | `oklch(95% 0.06 152)` | correct verdict band |
| `--flag-wash` (new) | `oklch(95% 0.045 28)` | incorrect verdict band |
| `--glow` (new) | the two-shadow value in Decisions | hover on tiles and options |

Course washes for the tile's top block, keyed by `course.id % 5`, each a two-stop
`linear-gradient(135deg, a, b)` drawn from the band's own hues:
0 `oklch(93% 0.055 218)` to `oklch(95% 0.035 265)`; 1 `oklch(95% 0.035 265)` to `oklch(94% 0.05 12)`;
2 `oklch(94% 0.05 152)` to `oklch(93% 0.055 218)`; 3 `oklch(94% 0.05 12)` to `oklch(95% 0.05 80)`;
4 `oklch(95% 0.05 80)` to `oklch(94% 0.05 152)`.

The band: `linear-gradient(118deg, oklch(93% 0.055 218) 0%, oklch(95% 0.035 265) 42%, oklch(94% 0.05 12) 100%)`,
on the home page only, `padding: 22px 0 56px`. Every other page is plain `--page`.

Type: body 15px / 1.6; h1 40px/700/-0.03em (course code on the course head), h2 26px/700/-0.03em,
h3 19px/600/-0.015em; question prompt 28px/600/1.25/-0.02em; option text 17px; card body 15px;
eyebrow = mono 12px/500, `letter-spacing 0.16em`, uppercase, `--accent-strong`; figure = mono
32px/600/-0.04em with a 12px uppercase `0.1em` label in `--ink-dim`; counts and citations = mono 13px
`--ink-dim`. Mono is for measured values, citations, eyebrows and captions only.

Shape: cards, tiles and question cards `border-radius: 14px` with a 1px `--line` border and no
shadow; sunken panels and the deck header 18px; the nav pill 12px with the landing's shadow
(`0 1px 2px oklch(22% 0.012 250 / 0.06), 0 8px 24px oklch(22% 0.012 250 / 0.06)`); buttons, tabs,
chips and toggles `999px`. Option rows 14px; the letter badge is a 34px circle.

Controls:
- `.btn` primary: dark ink fill, white text, `min-height 44px`, `padding 11px 22px`, 15px/600.
  Hover `oklch(28% 0.012 250)`. `.btn--secondary`: white with a `--line` border. `.btn--ghost`:
  no fill, `--accent-strong` text. `.btn--danger`: `--flag` outline. `.btn--micro`: 36px, 13px.
- Tabs: pills; the current tab is filled dark, the others white with a `--line` border.
- Chips: 28px pills on `--sunken`, 13px; `.chip--mono` for pages.
- Label toggles: 36px pills; on = dark fill white text with a check glyph (inline SVG, stroke), off
  = white with `--line`. Implemented as a `<label>` wrapping a visually hidden checkbox so the
  control keeps checkbox semantics.
- Progress bar: 6px, `--line` track, `--accent` fill, 999px.
- Status: a 26px rounded (7px) bracket square in the verdict colour beside the verdict word;
  colour is never the only signal.
- Focus: `outline: 2px solid var(--accent); outline-offset: 3px` on every focusable control.

Motion: `transition: border-color 160ms ease, box-shadow 160ms ease` on tiles and options,
`background-color 160ms ease` on buttons. `prefers-reduced-motion` kill-switch kept. No
fade-in, no scroll effects, no opacity transitions.

The twenty-item banned list (`.superpowers/sdd/ui-antipatterns.md`) is re-checked at review. The
two items that need a sentence: the band is one very light wash in one place with a plain page
under it (the composition rule the landing page already follows), and the glow is a hover
affordance that adds light rather than fading anything.

## Routes

| Route | Screen |
|---|---|
| `/` | Home: band, nav pill, hero figure, course grid |
| `/courses/:courseId` | redirects to `/courses/:courseId/study` |
| `/courses/:courseId/study` | Study |
| `/courses/:courseId/bank` | Bank: concept tiles |
| `/courses/:courseId/bank/:conceptId` | Bank: one concept's question cards |
| `/courses/:courseId/dashboard` | Dashboard |
| `/eval` | Evaluation |
| `/study`, `/dashboard`, `/bank`, anything else | redirect to `/` |

A non-numeric `courseId` or one not in the course list renders the course shell's not-found
state (an `alert` saying no course has that id, and a link back to Courses) instead of the tabs.
Same for a `conceptId` not in the bank.

## Screens

### Nav pill (every page)

Wordmark (9px accent square + "Study OS", 16px/700) · links "Courses" and "Evaluation" (15px,
`--ink-soft`, current one `--ink` 600) · the eval readout on the right in mono 13px `--ink-dim`.
The readout renders only when `/api/eval/report` resolves; a failed load leaves the pill with the
brand and links alone and raises no alert. On the home page the pill sits inside the band; on
every other page it sits on the plain page with the same shadow.

### Home (`/`)

- Band holding the nav pill and a hero: eyebrow `FALL 2026 · 3 COURSES` (the term of the most
  recently created course; the count), h1 `43 due today.` (sum of `dueToday` over the courses),
  lede naming the per-course split: `16 in CS 149, 16 in CS 158A and 11 in CS 47.` With no
  courses: h1 `No courses yet.` and the lede `Add one below and upload a lecture PDF.`
- Below the band: h2 `Courses`, then the grid `repeat(auto-fill, minmax(260px, 1fr))`, gap 24px.
- Tile (`<a>` to `/courses/:id/study`): top block 128px on the course wash holding the code
  (26px/700) and the term as a mono eyebrow in `--ink-soft`; body with the figure (`16` + `DUE
  TODAY`) and the counts line `248 concepts · 844 questions` (14px `--ink-dim`). Hover and
  `:focus-visible` apply the glow. Order: by id ascending, so the newest course is last.
- New course tile: dashed `oklch(82% 0.008 250)` border, a stroke plus glyph and `New course`.
  Clicking it swaps the tile for a card holding the existing form (Name, Term prefilled with the
  most recent course's term, Create, Cancel; Escape cancels; Name focused on open; focus returns
  to the tile on close). Create posts the trimmed name and term, then navigates to the new
  course's `/bank`. A failed create shows the alert and leaves the form open with what was typed.
- Data: one call, `GET /api/courses/overview`. A failed load shows the alert under the hero and no
  grid.

### Course shell (`/courses/:courseId/*`)

Loads `/api/courses/overview` once, finds the course, and renders: eyebrow `FALL 2026 · 248
CONCEPTS · 844 QUESTIONS`, h1 `CS 149`, the tab pills Study / Bank / Dashboard (each a
`NavLink`), and a right-hand slot the page fills (Study: the progress figure; Bank: the upload
control). Under the head, a 1px `--line` rule. The shell passes `{course, refresh}` to the page
through outlet context; `refresh()` refetches the overview so the due figure updates.

### Study (`/courses/:courseId/study`)

- Head slot: figure `16` + `LEFT TODAY` from the course's `dueToday`; the progress bar under the
  head fills by `1 - left / startOfVisit`, where `startOfVisit` is the count when the page
  mounted (0 left = full bar; the bar is not rendered when `startOfVisit` is 0). After every
  graded answer, self-grade or override, `refresh()`.
- Centered column, max 820px. One card (`padding 40px`): chips `Multiple choice` or `Short
  answer` and `pp. 12–14` (omitted when there are no pages); the prompt; then either the
  lettered options (A, B, C, D, ... one per option, whole row is the button) or the textarea
  (17px, 120px min height) with a `Submit` primary pill, disabled until the trimmed text is
  non-empty.
- After answering, the options are replaced by the verdict band inside the same card. MC:
  band coloured by verdict, `Correct` / `Incorrect` beside the bracket, the picked option named
  in 17px. Short answer: the submitted text in a `--sunken` block above the band; the band shows
  the verdict, the score in mono, `Grader: …` feedback in 17px, and the override button (`I was
  actually right` / `I was actually wrong`). PENDING: a neutral (`--sunken`) band saying `Grader
  unavailable. Self-grade this one:` with `I got it right` / `I got it wrong`. Every band ends
  with `Next question` (primary).
- Nothing due: the card says `Nothing due. Come back tomorrow.` with a ghost link to the bank.
- The single-flight guard, the submit guard, the alert region, and "attempt cleared only after the
  next question loads" all stay exactly as they are; only the markup and classes change.

### Bank (`/courses/:courseId/bank`)

- Head slot: `Upload a lecture PDF` (primary pill wrapping the file input, `accept=".pdf"`) and
  the `PDF only` hint. While uploading: the button reads `Ingesting…` and is disabled; a FAILED
  material shows its message in the alert. After any upload the bank refetches.
- Caption line in mono: `248 concepts · 844 questions · 12 retired`.
- Grid `repeat(auto-fill, minmax(300px, 1fr))`, gap 20px, of concept tiles (`<a>` to
  `bank/:conceptId`): h3 name, summary clamped to two lines (`-webkit-line-clamp: 2`), a footer
  rule with `3 questions · 1 retired` in mono and the pages chip. Glow on hover.
- Empty: one card, `No concepts yet. Upload a lecture PDF to build the bank.`

### Bank, one concept (`/courses/:courseId/bank/:conceptId`)

- `← All concepts` link, h2 name, summary 17px, pages chip.
- Question cards (max 900px): chips (type, pages, `Retired` in `--flag` when retired); prompt
  18px/500; footer: the three label toggles (`Answerable`, `Correct`, `Unambiguous`) followed by
  `Save labels` (secondary micro) or the word `labeled` in mono once saved; on the right `Retire`
  as a `--flag` text button. Clicking Retire arms the card: the right slot becomes
  `Confirm retire` (danger micro pill) + `Cancel` (secondary micro pill), Cancel focused, one card
  armed at a time; confirm posts retire and refetches. Retired card: `--sunken`, prompt struck
  through, no toggles, `Restore` (secondary micro) in the right slot. Focus hand-back after
  retire, cancel and restore, and the label seeding rules (null defaults to checked, never over
  a stored false), are unchanged from today.
- The bank list is fetched once per course visit and kept in the Bank route's state, so opening
  a concept does not refetch; retire, restore and upload refetch it.

### Dashboard (`/courses/:courseId/dashboard`)

- Three figure tiles in a row (`--card`, `--line`, 14px): `16 DUE TODAY`, `248 CONCEPTS`,
  `844 QUESTIONS` from the overview.
- The concept ledger inside a card: header row 12px uppercase `0.1em` `--ink-dim` on `--sunken`;
  rows 48px, 15px text, numerals mono; hover `--sunken`; never-attempted rows keep the `(new)`
  mark and 600 weight. Columns and data unchanged.
- Empty: `No concepts yet.` in the card.

### Evaluation (`/eval`)

The landing page's panel, in the app: h1 `Evaluation`, then a `--sunken` 18px panel with the
lede sentence (`31 labeled questions`), a four-figure grid (`Answerable from source`, `Correct
answer`, `Unambiguous`, `Grader agreement`), each a `--card` 12px tile with the mono figure and
the uppercase label. The grader tile carries `n=<graded>` in mono beside its figure and takes
a `--flag` border while `graded < 30`, with the caveat sentence under the grid saying what that
means. With nothing labeled the three label tiles are replaced by `No labeled questions yet.`;
with nothing graded the grader tile is replaced by `No graded short answers yet.` The count
sentences keep their singular/plural rule.

## Backend

`GET /api/courses/overview` → `[{ id, name, term, concepts, questions, dueToday }]`, ordered by id.
New `com.studyos.course.CourseController` with a `CourseOverview` record, taking `CourseRepo`,
`ConceptRepo`, `QuestionRepo`, `ReviewStateRepo` and `Clock`. Counts per course from three
derived queries added to the repos:

- `ConceptRepo.countByCourseId(Long)`
- `QuestionRepo.countByConceptCourseIdAndStatus(Long, QuestionStatus)` (ACTIVE only)
- `ReviewStateRepo.countByConceptCourseIdAndDueDateLessThanEqual(Long, LocalDate)`

Three queries per course is fine at three courses; a grouped query is not worth its own test yet.
`@WebMvcTest(CourseController.class)` with mocked repos and the fixed-clock `@TestConfiguration`
already used by `DashboardControllerTest`: asserts the shape, the ordering, that retired questions
are not counted, and that a course with nothing in it reports zeros. `PersistenceTest` (the `jpa`
group) gains one case proving the three count queries against Postgres, since two of them traverse
`concept.course`.

## Frontend structure

```
src/
  App.tsx                 routes only
  shell/Nav.tsx           nav pill + eval readout (useEvalReport)
  shell/CourseLayout.tsx  loads the overview, not-found state, course head, tabs, <Outlet/>
  shell/courses.ts        useCourses(): overview fetch + refresh, shared by Home and the layout
  pages/HomePage.tsx      hero + tile grid + new-course tile/form
  pages/StudyPage.tsx     as today, reading course from useOutletContext
  pages/BankPage.tsx      concept grid; BankConceptPage.tsx for one concept; both under a
                          BankRoute that owns the bank state
  pages/DashboardPage.tsx
  pages/EvalPage.tsx
  styles/tokens.css       the table above
  styles/base.css         reset, type, controls (btn, chip, toggle, tab, field, alert, hint)
  styles/shell.css        band, nav pill, course head, page layout
  styles/home.css         hero, tile grid, new-course tile
  styles/study.css        question card, options, verdict band
  styles/bank.css         concept grid, concept view, question cards
  styles/dashboard.css    figures, ledger
  styles/eval.css         panel, figures
```

`api.ts` gains `overview: () => get<CourseOverview[]>('/api/courses/overview')` and the
`CourseOverview` type. Nothing else in the API client changes.

## Error handling

Every page keeps the pattern in place today: one `alert` region per page, set from the catch of
each call, cleared at the start of the next action. The course shell's not-found state is an
alert plus a link. A failed overview load on Home shows the alert and no grid; in the shell it
shows the alert and no tabs. The Study page's in-flight guard and the Bank page's one-armed-card
rule carry over unchanged.

## Testing

Frontend (vitest + Testing Library, all existing 50 tests kept or migrated, not deleted):
- Pages that read a course render inside a `MemoryRouter` at `/courses/1/...` with the layout
  route and a mocked overview, through one test helper `renderInCourse(element, path)`.
- New: Home renders a tile per course with its figure and counts; the tile links to
  `/courses/:id/study`; the hero sums due counts; the empty state; the new-course tile opens the
  form and creating navigates to the new bank; a failed overview shows the alert.
- New: the course shell renders tabs for a known id, not-found for an unknown or non-numeric id;
  `/courses/2` redirects to `/courses/2/study`; `/study`, `/bank`, `/dashboard` redirect to `/`.
- New: the bank grid links to `bank/:conceptId`; the concept page renders the cards; retire arms,
  confirm and cancel and restore behave and hand focus back (the existing tests, re-pointed at the
  cards); labels save with the toggle values; the concept-not-found state.
- New: the Study progress figure comes from the overview and `refresh` is called after an answer.
- New: the eval grader tile carries `n=` and the flag below 30.
- A type-floor test: after rendering each page, no computed `font-size` under 12px (jsdom
  reports declared sizes; the test asserts the stylesheet's smallest declared size instead, by
  parsing every `font-size:` in `src/styles/*.css`).

Backend: the `CourseControllerTest` above; `PersistenceTest` gains the count case.

Live acceptance in Chrome against the running backend and real data (no attempt rows written
unless the question is MC, and any test attempt is deleted after): all routes, hover glow, the
keyboard path through a concept (arm, cancel, confirm, restore), one MC answer end to end, an
upload of an already-ingested PDF (hash hit, no spend), one new course created then deleted from
the database. Screenshots retaken at 1400x850 for the README and the landing page.

`npm test`, `npm run build`, `npm run lint`, `mvn verify` green before the PR; CI green on the PR.

## Out of scope

Dark mode. Any change to scheduling, grading, ingest or the data model. Course deletion or
editing. Per-course colour choice (the wash is keyed by id). Mobile-specific layouts beyond the
grids collapsing to one column under 720px and the nav pill wrapping. Deployment.

## Execution

Branch `ui-landing` off `master`, one PR. Task-by-task via the Workflow tool with every agent on
Fable 5.1 and the Opus fallback from the standing policy; each task reviewed by a second agent
against this spec, the banned list, and the TypeScript standard before it is committed. Bryan's
review at the end. The `show-me-your-work` trail continues at `.audit/study-os-ui-landing.tsv`.

# UI landing restyle: what was built, and why

Written 2026-09-06, at the end of the `ui-landing` branch, by the session that built it.
Companion to the design spec (`specs/2026-09-04-ui-landing-restyle-design.md`) and the
implementation plan (`plans/2026-09-04-ui-landing-restyle.md`). The spec says what the app
should be; the plan said how to get there; this file says what the code actually does and
why it does it that way. Corrected 2026-09-07 after a claim-by-claim check against master
`ea41b7a`: commit counts, the one SHA the rebase merge rewrote, and which test file pins
what; nothing about the behaviour changed.

**Read this before changing these surfaces, and before filing a defect against them.** A
good deal of what looks odd here is deliberate, and the reason is usually one of: a lint
rule, a react-router behaviour, a test that had to keep passing, or a decision Bryan made
during the mockup round. Each of those is written down below. If a finding is already in
"Deliberately not done", it was considered and left; say so rather than re-raising it.

## The ask

Bryan: "i want the ui of study os to look like its landing page and make it where it has
class selections like canvas like square icons that say the class name/info", plus "the
glow when hovering above the tiles that the aws amazon website had", plus a less
text-dense Study and Bank. He picked Study direction A ("Focus", one centred question
card) and, after seeing both, the Bank split view over concept tiles.

## What shipped

Twenty commits from `4cbc013` to `ea41b7a`: three for the spec and plan, one per planned
task, one review fix for task 3, two controller fixes between tasks, three for the fix batch
that came out of the whole-branch review, one for the token header after the delta
re-review, one for the screenshots, the captions and this file, and one after these notes
for the README's test counts.

| Surface | Route | Lives in |
| --- | --- | --- |
| Home, course tiles | `/` | `pages/HomePage.tsx`, `styles/home.css` |
| Course shell | `/courses/:courseId` (index redirects to `study`) | `shell/CourseLayout.tsx`, `styles/shell.css` |
| Study | `/courses/:courseId/study` | `pages/StudyPage.tsx`, `styles/study.css` |
| Bank, split view | `/courses/:courseId/bank`, `.../bank/:conceptId` | `pages/BankRoute.tsx` + `BankPage.tsx` + `BankConceptPage.tsx`, `styles/bank.css` |
| Dashboard | `/courses/:courseId/dashboard` | `pages/DashboardPage.tsx`, `styles/dashboard.css` |
| Evaluation, global | `/eval` | `pages/EvalPage.tsx`, `styles/eval.css` |
| Nav pill | every page | `shell/Nav.tsx` |
| Frame | every page but Home | `shell/Frame.tsx` |
| Design tokens | every page | `styles/tokens.css`, `styles/base.css` |

Anything else, including the old top-level `/study`, `/bank` and `/dashboard`, redirects
to `/`.

Tests went from 50 to 93 on the frontend, 71 to 75 hermetic on the backend, and 8 to 9 in
the JPA group.

## Decisions a reviewer would otherwise re-litigate

### Home is not inside `Frame`, and draws its own `<main>`

`App.tsx` mounts `HomePage` outside the `Frame` route. Home is the only page with the
pastel band, and the nav pill has to sit *on* that band, so Home renders `<Nav />` itself
inside the band and then its own `<main className="wrap home">`. `Frame` renders the nav on
the plain page followed by `<main><Outlet /></main>` for everything else. Both paths give
exactly one `<main>` per page, which is what the landmark tests assert.

Do not "fix" this by moving Home under `Frame` or by swapping Home's `<main>` for a
`<div>`: the first breaks the band, the second leaves Home with no `main` landmark (the nav
and the hero banner would remain) and fails the landmark test in `App.test.tsx`.

The cost, accepted: `Nav` is a different instance on Home than under `Frame`, so moving
between Home and a course remounts it and refetches the eval report. It is one small GET
and it keeps the readout fresh.

### `<Outlet key={course.id}>` in `CourseLayout`

Without the key, react-router keeps the same page instance when only `:courseId` changes,
so Study carried the previous course's `startOfVisit` figure and its in-flight guard into
the new course. Keying the outlet makes a course switch a fresh visit. `refresh()` hands
down new objects with the same ids and deliberately does *not* remount, which is what lets
the head counts move without throwing away the page's state. `shell/CourseLayout.test.tsx` pins
the first half with a probe page that keeps the course it mounted with; `StudyPage.test.tsx`
pins the second: after an answer the figure moves, the verdict stays on screen and `api.next`
was called once.

### `refresh()` runs after every verdict, upload, retire and restore

`CourseContext.refresh` refetches `/api/courses/overview`. The head eyebrow and the Study
figure are counts of ACTIVE questions and of what is due, so any action that changes those
has to call it or the head goes stale while the page below it is right. Retire and restore
were the case that shipped wrong first and was caught by the whole-branch review, not by a
per-task one, because each task only ever saw its own diff.

### `plural.ts` is its own module, and so is `shell/courses.ts`

`plural.ts` exists to satisfy oxlint's `react(only-export-components)`, and `dueSplit` moved
into `shell/courses.ts` (which already held `useCourses`) for the same rule: a module that
exports a component may not also export a plain function. `dueSplit` came out of `HomePage.tsx` into
`shell/courses.ts`, and `plural` came out of `BankRoute.tsx` into `plural.ts`. `plural` is
generic and is now used by Home, the course head, the bank and Eval; do not fold it back
into a page.

### Two `oxlint-disable-next-line react/set-state-in-effect` comments

`BankRoute.tsx` sets state in a mount effect only after an `await`, and the rule fires
anyway. `StudyPage.tsx` routes its mount load through `run()` to share the single-flight
guard, which sets `submitting` synchronously first: one extra render before any control
exists, which is all the rule is warning about. Both carry a reason comment above the
suppression (one line in `BankRoute.tsx`, three in `StudyPage.tsx`). They were reviewed twice
and judged justified. There are no other suppressions in the frontend.

### Focus is handed back on purpose, in three places

- The bank arms a retire, moves the caret to `Cancel`, and hands it back to the control
  that replaces the one the user was on: `Retire` after a cancel, `Restore` after a
  confirm, `Retire` after a restore. `ConceptCards` keeps a `pendingFocus` ref for this,
  and is keyed by concept id so the bookkeeping cannot leak between concepts.
- Study focuses the verdict band once an attempt lands (`useLayoutEffect` on `[attempt]`,
  `tabIndex={-1}` on the band), then focuses the first option, the textarea or the empty
  queue's "Open the bank" link after `Next question`. Before this, the caret fell to
  `body` twice per question and a keyboard user paid about a dozen Tabs per card.
- The home form focuses the name field when it opens and the "New course" tile when it
  closes.

`base.css` gives `.verdict` and `.detail` a focus ring, since both are scripted focus
targets that are not otherwise focusable.

### The bank list has a skip link

A real bank is 248 concept rows, and the list precedes the cards in the DOM, so reaching a
card's `Retire` by keyboard took roughly 250 Tab presses. The first tabbable in the list
is now a "Skip to the open concept" link, hidden until focused, that moves the caret to
`section#concept`. It keeps a real `href="#concept"` so it works without JavaScript and
reads as a link, and also focuses in `onClick` because a fragment does not move focus in
every browser. Known cost: it pushes one history entry, so the first Back after using it
is a no-op. React Router matches on pathname only, and a fragment navigation leaves the pathname
unchanged (the browser fires `popstate` and then `hashchange`, and the router's handler
re-reads the same location), so the catch-all route cannot fire on it.

A deep link, a reload or a cross-document Back opens the concept on the right while the
sticky list sits at its top, and on a real bank the filled row can be thousands of pixels
down. After the bank loads and whenever the path changes, the list scrolls the current row
into view with `block: 'nearest'`, so a row the user just clicked never moves.

### The bank has two `role="alert"` regions

One in `BankRoute` above the split for load, upload and action failures, and one in
`BankConceptPage` for "No concept has id N." The spec asks for both, and they coexist
only when `error` is set while the URL carries a bad concept id: an upload that fails on
such a URL, or an earlier action failure still on screen when Back returns to one, since
`error` clears at the start of the next action, not on navigation.

### Eval renders its figure grid even when both counts are zero

The empty grid leaves the two empty-state sentences a little far apart. It is the spec's
markup and the case is only reachable before anything has been labeled or graded. The graded count appears
three times in the panel (on the tile as `n=`, in the sentence, in the caveat) because the
sentence predates the tile and three older tests pin it.

### Colours are tokens, and a test says so

`styles/tokens.test.ts` fails on a raw `oklch()`, hex, `rgb()` or `hsl()` in any stylesheet
but `tokens.css`. `--on-fill` and `--on-fill-dim` were added during the fix batch for the
ink on filled controls, which had been a hand-written `oklch(99% 0 0)` in six places (five
in `base.css`, one in `bank.css`), plus one `oklch(85% 0.01 250)` in `bank.css`.

Eleven values in `tokens.css` come from the landing page's `:root` unchanged; the header
comment names them. Most of the rest are the landing page's component values lifted into
tokens (the filled-control pair and its ink, the band, the nav shadow, the fonts, and the
wrap, gutter, radius and motion scales). Only the ones marked (new), the dashed line, the
washes and `--on-fill-dim` are the app's own, because the landing page has no app to style.

### The 12px type floor is a test, not a convention

`styles/typeFloor.test.ts` reads every stylesheet and fails on a `font-size` under 12px, on
one written with `var()`, `clamp()` or `em`, and on a `font:` shorthand carrying a size.
This is the guardrail from the CreatorFlow restyle, where "looks AI-generated" turned out
to be 88% of type under 12px. Keep new sizes as px literals.

### The Eval tiles are 14px, and the spec was amended to say so

The spec originally said 12px for the Eval tiles and 14px for the Dashboard's. They share
`.figure-tile`. One tile shape across both pages is better than a one-line override, so the
spec line was changed rather than the CSS.

### `surfaces.css` was deleted early

The plan removed the old stylesheet in task 8. It was imported last, so its dead rules won
the cascade over every new page as it landed, and the live checks for tasks 6 and 7 would
have been looking at the wrong thing. It went in `6c91e4d` (`f6efc92` before the rebase merge), right after the bank, so the
delete and the import removal in task 8's step 1 became no-ops; the step's third part,
dropping the `surfaces.css` exclusion from `typeFloor.test.ts`, still landed in `f5c93ff`.

### `App.test.tsx` keeps a `next` mock

Task 8 dropped the unused `courses`, `next`, `bank` and `dashboard` mock entries. Dropping
`next` did not fail anything, but it made the "a bare course path opens that course on its
study tab" test render `StudyPage` in its *error* state (the call threw, the catch caught
it) while still asserting the heading. The mock came back with a comment, and the test now
also asserts there is no alert.

### `Course` stayed in `api.ts` after `api.courses` went

`api.courses` had no caller left once Home read the overview instead. The `Course`
interface is still `createCourse`'s return type.

### The backend endpoint does 1+3N queries on purpose

`GET /api/courses/overview` lists courses in id order, then counts concepts, ACTIVE
questions and review states due today for each. Due today means due today or earlier on
a concept that still has an ACTIVE question, which is what the study queue will serve; a
count that included a concept whose every question was retired sat at one for good, so
the Study figure read "1 left today" beside "Nothing due". The dashboard's own `dueToday`
uses the same count. One course costs four queries and three cost ten; the
Javadoc says three count queries per course is fine at a handful of courses. Today's date comes from the injected `Clock` bean, so the controller test
can fix it. A `@WebMvcTest` covers the shape and the ACTIVE-only rule; one JPA case proves
the due-date boundary is `<=` today, that the count does not leak across courses, and that
a due concept with only retired questions is left out.

## Test map

| What | Where |
| --- | --- |
| Route tree, redirects, one `<main>`, nav readout | `App.test.tsx` |
| `aria-current` on both nav links, both directions | `shell/Nav.test.tsx` |
| Course head, not-found, failed overview, current tab, remount on switch | `shell/CourseLayout.test.tsx` |
| Tiles, create form, escape and cancel, loading, plurals | `pages/HomePage.test.tsx` |
| Options, verdict bands, PENDING self-grade, figure and bar, focus, no remount on refresh | `pages/StudyPage.test.tsx` |
| First-concept redirect, empty bank, upload states, skip link, deep-link scroll | `pages/BankPage.test.tsx` |
| Cards, toggles, label seeding, arm/confirm/cancel/restore, focus, overview refetch | `pages/BankConceptPage.test.tsx` |
| Figure tiles from the course, ledger, empty card, alert | `pages/DashboardPage.test.tsx` |
| Four panel states, `n=`, the flag under 30, the caveat | `pages/EvalPage.test.tsx` |
| 12px floor; no hand-written colours | `styles/typeFloor.test.ts`, `styles/tokens.test.ts` |
| Endpoint shape, ACTIVE only, fixed clock | `backend/.../CourseControllerTest.java` |
| Due-date boundary, course isolation, retired-only concepts left out, against Postgres | `backend/.../PersistenceTest.java` (jpa group) |

The four course-scoped pages are tested through the real router and the real
`CourseLayout` via the helpers in `test/render.tsx`; Home renders under its own
`MemoryRouter` and Eval with no router; only `api` is mocked.

## Deliberately not done

Each of these was raised in a review and left, with the reason. They are follow-ups, not
defects.

- **Shared CSS recipes.** The 12px uppercase caption recipe and the card recipe are each
  restated in several stylesheets. That is how the landing page writes CSS, and naming
  them (`.caps`, `.card`) is worth doing on the next stylesheet touch, not in this branch.
- **Splitting `base.css`.** It is about 500 lines of reset, type roles and controls, with
  banners between the three. Split it when it grows past the next feature.
- **`FixedClock` duplication.** The same `@TestConfiguration` sits in two backend tests and
  the same instant is inlined in three more. A shared `TestClock` is a five-file mechanical
  follow-up.
- **Course endpoints in two packages.** `POST/GET /api/courses`, materials and bank live in
  `ingest`; the overview lives in `course`. The spec named the new package.
- **`GET /api/courses` has no frontend caller.** Left in place; removing an endpoint is a
  separate decision from restyling.
- **Two "Loading…" under a failed first bank load.** The list caption and the pane both
  show it forever if the first fetch fails. A "could not load" caption would read better.
- **`Number(courseId)` accepts `0x2`.** It opens course 2. Harmless.
- **`node` types in the app tsconfig.** Two test files need them (`tokens.test.ts` and `typeFloor.test.ts`); isolating them
  needs a separate test tsconfig.
- **`index.css` is not scanned by the two stylesheet tests.** They read `src/styles`, and
  `index.css` is eight `@import` lines.
- **Retired cards show `labeled` or `not labeled`.** Extra against the spec, and useful.
- **Home's lede adds "Pick a class to start the queue."** Extra against the spec, and it
  reads better than a bare count.
- **The Escape-while-saving guard on the home form is unreachable from the browser**,
  because every control including Cancel is disabled while saving. It is pinned by a test
  and costs one condition.

## Process and models

Subagent-driven: a fresh implementer per task, a review package built from the diff, a
task-scoped reviewer, a fix pass, then a ledger line. Tasks 1 through 8, all eight
task reviews, the whole-branch review and the sixteen-item fix batch ran on **Fable 5.1**.
Fable ran out of credits at the end, so the delta re-review of the fix batch, the live
acceptance pass, the screenshots, the captions and these notes are **Opus 5**. Three Fable
session limits killed agents mid-run (the last one left half-written edits), which is why
the ledger carries STATE lines.

The process artifacts are untracked and live in `.superpowers/sdd/`: `progress.md` (the
ledger), `ui-task-N-brief.md` and `-report.md`, `review-BASE..HEAD.diff` packages,
`ui-final-review.md` (the whole-branch review and its fix batch), `ui-fix-report.md`, and
`ui-antipatterns.md` (the twenty-item banned list that every UI change on this repo is
checked against).

## How to verify

```
cd frontend && npm test && npm run build && npm run lint
mvn -B -f backend/pom.xml verify
mvn -B -f backend/pom.xml test -Dtest.excludedGroups=none -Dgroups=jpa   # needs Postgres
```

The live pass needs the backend on 8080, Vite on 5173 and Postgres on 5432. Walk `/`,
`/courses/2/study`, `/courses/2/bank` (it should land on the first concept),
`/courses/2/bank/<another id>`, `/courses/2/dashboard`, `/eval`, `/courses/99/study`,
`/study` and `/courses/2`. Hover a course tile and an answer option for the glow. Tab into
the bank list and use the skip link. Answer one question and watch the head figure drop.

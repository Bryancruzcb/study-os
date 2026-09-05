# UI landing restyle + Canvas-style course tiles: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Study OS frontend on its landing page's visual language and replace the per-page course dropdown with a Canvas-style home of course tiles that open course-scoped Study / Bank / Dashboard tabs.

**Architecture:** One new backend endpoint (`GET /api/courses/overview`) feeds counts to the tiles and the course head. The frontend gets a route tree (`/`, `/courses/:courseId/{study,bank,bank/:conceptId,dashboard}`, `/eval`), a `CourseLayout` that loads the course once and hands it to pages through outlet context, and a stylesheet set ported value-for-value from `site/index.html`. Pages keep every behaviour they have today (single-flight guards, arm-then-confirm retire, focus hand-back, label seeding); only their markup, classes and data source change.

**Tech Stack:** Spring Boot 3 / Java 21 / Maven (JUnit 5, MockMvc, Mockito), React 19 + TypeScript 6 + Vite 8 + react-router-dom 7, Vitest 4 + Testing Library, `@fontsource/ibm-plex-*`.

Spec: `docs/superpowers/specs/2026-09-04-ui-landing-restyle-design.md`. Mockup (page "Directions", boards Home / Study A / Bank A): https://claude.ai/code/artifact/c65985f6-ced4-442d-810e-3a59fd0ae7b1

## Global Constraints

- Branch `ui-landing` off `master`; every task ends in a commit on it. Never commit on `master`.
- Light theme only, tokens verbatim from `site/index.html` (the table in the spec). No `prefers-color-scheme` block.
- Type floor 12px: no `font-size` under 12px anywhere in `frontend/src/styles/*.css` (a test enforces it from Task 2 on).
- Fonts self-hosted through `@fontsource`: IBM Plex Sans 400/500/600/700, IBM Plex Mono 400/500/600, nothing else.
- Mono (`var(--font-mono)`) is for measured values, page citations, eyebrows and captions only; body copy and labels are sans.
- The banned list in `.superpowers/sdd/ui-antipatterns.md` applies: no purple-to-blue gradient (the one band is the landing's light wash, home page only), no fade-on-hover (hover adds the glow or changes a border, never opacity), no icon boxes, no emoji in copy, no em dashes in new copy, no Inter, no glassmorphism.
- Hover glow, exact: `border-color: var(--glow-line)` plus `box-shadow: var(--glow)`; course tiles and answer options only.
- Every page keeps one `role="alert"` region, set from each call's catch and cleared at the start of the next action.
- Tests: never delete a behaviour test; migrate it. Frontend suite must stay green at every commit (`npm test`), `npm run build` and `npm run lint` clean, backend `mvn -q -f backend/pom.xml test` green.
- Commit messages: imperative, lowercase type prefix (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`), no attribution lines.
- Working directory for every command below: `C:\Users\isdis\git\study-os` unless the command says otherwise. Frontend commands run from `frontend/`.
- The backend on :8080, vite on :5173 and Postgres on :5432 are already running from this checkout; do not start second copies. Vite hot-reloads.

---

### Task 1: `GET /api/courses/overview`

**Files:**
- Modify: `backend/src/main/java/com/studyos/repo/ConceptRepo.java`
- Modify: `backend/src/main/java/com/studyos/repo/QuestionRepo.java`
- Modify: `backend/src/main/java/com/studyos/repo/ReviewStateRepo.java`
- Create: `backend/src/main/java/com/studyos/course/CourseController.java`
- Create: `backend/src/test/java/com/studyos/course/CourseControllerTest.java`
- Modify: `backend/src/test/java/com/studyos/repo/PersistenceTest.java` (append one test)

**Interfaces:**
- Consumes: `CourseRepo` (`JpaRepository<Course, Long>`), `Course` (public fields `id`, `name`, `term`), `QuestionStatus.ACTIVE`, the `Clock` bean (`com.studyos.config.ClockConfig`; `@WebMvcTest` slices do not load it, so the test supplies a fixed one, exactly as `DashboardControllerTest` does).
- Produces: `GET /api/courses/overview` returning `[{ id, name, term, concepts, questions, dueToday }]` ordered by id ascending, `questions` counting ACTIVE only, `dueToday` counting review states with `dueDate <= today`. Frontend type `CourseOverview` (Task 3) mirrors it.

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/studyos/course/CourseControllerTest.java`:

```java
package com.studyos.course;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.studyos.domain.Course;
import com.studyos.domain.QuestionStatus;
import com.studyos.repo.ConceptRepo;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.QuestionRepo;
import com.studyos.repo.ReviewStateRepo;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.data.domain.Sort;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CourseController.class)
class CourseControllerTest {
    @TestConfiguration
    static class FixedClock {
        @Bean Clock clock() { return Clock.fixed(Instant.parse("2026-09-01T12:00:00Z"), ZoneOffset.UTC); }
    }

    @Autowired MockMvc mvc;
    @MockBean CourseRepo courseRepo;
    @MockBean ConceptRepo conceptRepo;
    @MockBean QuestionRepo questionRepo;
    @MockBean ReviewStateRepo reviewStateRepo;

    private static Course course(long id, String name, String term) {
        Course c = new Course();
        c.id = id;
        c.name = name;
        c.term = term;
        return c;
    }

    @Test
    void reportsEveryCourseWithItsCountsInIdOrder() throws Exception {
        when(courseRepo.findAll(Sort.by("id"))).thenReturn(List.of(
            course(1L, "CS 47", "Spring 2026"), course(2L, "CS 149", "Fall 2026")));
        when(conceptRepo.countByCourseId(1L)).thenReturn(18L);
        when(conceptRepo.countByCourseId(2L)).thenReturn(248L);
        when(questionRepo.countByConceptCourseIdAndStatus(1L, QuestionStatus.ACTIVE)).thenReturn(55L);
        when(questionRepo.countByConceptCourseIdAndStatus(2L, QuestionStatus.ACTIVE)).thenReturn(844L);
        when(reviewStateRepo.countByConceptCourseIdAndDueDateLessThanEqual(1L, LocalDate.of(2026, 9, 1)))
            .thenReturn(11L);
        when(reviewStateRepo.countByConceptCourseIdAndDueDateLessThanEqual(2L, LocalDate.of(2026, 9, 1)))
            .thenReturn(16L);

        mvc.perform(get("/api/courses/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].id").value(1))
            .andExpect(jsonPath("$[0].name").value("CS 47"))
            .andExpect(jsonPath("$[0].term").value("Spring 2026"))
            .andExpect(jsonPath("$[0].concepts").value(18))
            .andExpect(jsonPath("$[0].questions").value(55))
            .andExpect(jsonPath("$[0].dueToday").value(11))
            .andExpect(jsonPath("$[1].id").value(2))
            .andExpect(jsonPath("$[1].concepts").value(248))
            .andExpect(jsonPath("$[1].questions").value(844))
            .andExpect(jsonPath("$[1].dueToday").value(16));
    }

    @Test
    void countsOnlyActiveQuestionsAndTakesTodayFromTheClock() throws Exception {
        when(courseRepo.findAll(Sort.by("id"))).thenReturn(List.of(course(3L, "CS 158A", "Fall 2026")));

        mvc.perform(get("/api/courses/overview")).andExpect(status().isOk());

        verify(questionRepo).countByConceptCourseIdAndStatus(3L, QuestionStatus.ACTIVE);
        verify(reviewStateRepo).countByConceptCourseIdAndDueDateLessThanEqual(3L, LocalDate.of(2026, 9, 1));
    }

    @Test
    void aCourseWithNothingInItReportsZeros() throws Exception {
        when(courseRepo.findAll(Sort.by("id"))).thenReturn(List.of(course(4L, "CS 46B", "Spring 2027")));

        mvc.perform(get("/api/courses/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].concepts").value(0))
            .andExpect(jsonPath("$[0].questions").value(0))
            .andExpect(jsonPath("$[0].dueToday").value(0));
    }

    @Test
    void noCoursesIsAnEmptyList() throws Exception {
        when(courseRepo.findAll(Sort.by("id"))).thenReturn(List.of());

        mvc.perform(get("/api/courses/overview"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `mvn -q -f backend/pom.xml test -Dtest=CourseControllerTest`
Expected: compilation error, `package com.studyos.course does not exist` / `cannot find symbol CourseController` (and the three count methods).

- [ ] **Step 3: Add the three count queries**

`backend/src/main/java/com/studyos/repo/ConceptRepo.java`, add inside the interface:

```java
    long countByCourseId(Long courseId);
```

`backend/src/main/java/com/studyos/repo/QuestionRepo.java`, add:

```java
    // the overview counts what can still be asked, so retired questions stay out of it
    long countByConceptCourseIdAndStatus(Long courseId, QuestionStatus status);
```

`backend/src/main/java/com/studyos/repo/ReviewStateRepo.java`, add:

```java
    long countByConceptCourseIdAndDueDateLessThanEqual(Long courseId, LocalDate date);
```

- [ ] **Step 4: Write the controller**

Create `backend/src/main/java/com/studyos/course/CourseController.java`:

```java
package com.studyos.course;

import com.studyos.domain.QuestionStatus;
import com.studyos.repo.ConceptRepo;
import com.studyos.repo.CourseRepo;
import com.studyos.repo.QuestionRepo;
import com.studyos.repo.ReviewStateRepo;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * One row per course with the numbers the home tiles and the course head show. Three
 * count queries per course is fine at a handful of courses; a grouped query can replace
 * them when there are enough courses for it to matter.
 */
@RestController
public class CourseController {
    private final CourseRepo courseRepo;
    private final ConceptRepo conceptRepo;
    private final QuestionRepo questionRepo;
    private final ReviewStateRepo reviewStateRepo;
    private final Clock clock;

    public CourseController(CourseRepo courseRepo, ConceptRepo conceptRepo, QuestionRepo questionRepo,
                            ReviewStateRepo reviewStateRepo, Clock clock) {
        this.courseRepo = courseRepo;
        this.conceptRepo = conceptRepo;
        this.questionRepo = questionRepo;
        this.reviewStateRepo = reviewStateRepo;
        this.clock = clock;
    }

    public record CourseOverview(Long id, String name, String term, long concepts, long questions,
                                 long dueToday) {}

    @GetMapping("/api/courses/overview")
    public List<CourseOverview> overview() {
        LocalDate today = LocalDate.now(clock);
        // id order, so the newest course is the last tile and the order never shuffles
        return courseRepo.findAll(Sort.by("id")).stream()
            .map(c -> new CourseOverview(c.id, c.name, c.term,
                conceptRepo.countByCourseId(c.id),
                questionRepo.countByConceptCourseIdAndStatus(c.id, QuestionStatus.ACTIVE),
                reviewStateRepo.countByConceptCourseIdAndDueDateLessThanEqual(c.id, today)))
            .toList();
    }
}
```

- [ ] **Step 5: Run the controller test to see it pass**

Run: `mvn -q -f backend/pom.xml test -Dtest=CourseControllerTest`
Expected: `Tests run: 4, Failures: 0, Errors: 0` (Maven prints nothing else with `-q` on success; exit code 0).

- [ ] **Step 6: Add the Postgres case for the three derived counts**

Append to `backend/src/test/java/com/studyos/repo/PersistenceTest.java`, before the final closing brace:

```java
    // --- the counts behind the course overview ---------------------------------------

    @Test
    void theOverviewCountsSeeOnlyTheirCourseAndOnlyActiveQuestions() {
        Course mine = course("CS 149");
        Course other = course("CS 158A");
        Material m = material(mine, "hash-overview");
        Material om = material(other, "hash-overview-other");
        Concept a = concept(mine, m, "kernel mode");
        Concept b = concept(mine, m, "process control block");
        Concept elsewhere = concept(other, om, "tcp handshake");
        question(a, QuestionType.MC, QuestionStatus.ACTIVE);
        question(a, QuestionType.SHORT_ANSWER, QuestionStatus.RETIRED);
        question(b, QuestionType.MC, QuestionStatus.ACTIVE);
        question(elsewhere, QuestionType.MC, QuestionStatus.ACTIVE);
        LocalDate today = LocalDate.of(2026, 9, 4);
        reviewStates.save(ReviewState.initial(a, today.minusDays(1)));
        reviewStates.save(ReviewState.initial(b, today.plusDays(3)));
        reviewStates.save(ReviewState.initial(elsewhere, today));

        // two of the three concepts, two of the three ACTIVE questions, one of the two due states
        assertThat(concepts.countByCourseId(mine.id)).isEqualTo(2);
        assertThat(questions.countByConceptCourseIdAndStatus(mine.id, QuestionStatus.ACTIVE)).isEqualTo(2);
        assertThat(reviewStates.countByConceptCourseIdAndDueDateLessThanEqual(mine.id, today)).isEqualTo(1);
    }
```

- [ ] **Step 7: Run the JPA suite against the local Postgres**

`@DataJpaTest` rolls every test back, so this leaves the studyos database as it was.

Run: `mvn -q -f backend/pom.xml test -Dtest.excludedGroups=none -Dgroups=jpa -Dtest=PersistenceTest`
Expected: exit code 0, `Tests run: 8` in `backend/target/surefire-reports/com.studyos.repo.PersistenceTest.txt`.

- [ ] **Step 8: Run the whole hermetic backend suite**

Run: `mvn -q -f backend/pom.xml test`
Expected: exit code 0 (75 tests: the 71 that exist plus the 4 above).

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/studyos/course/CourseController.java backend/src/main/java/com/studyos/repo backend/src/test/java/com/studyos/course/CourseControllerTest.java backend/src/test/java/com/studyos/repo/PersistenceTest.java
git commit -m "feat: one endpoint with every course's counts for the home tiles"
```

---

### Task 2: Tokens, base styles, shell styles, fonts, favicon, type-floor test

**Files:**
- Rewrite: `frontend/src/styles/tokens.css`
- Rewrite: `frontend/src/styles/base.css`
- Rewrite: `frontend/src/styles/shell.css`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/main.tsx` (font imports)
- Modify: `frontend/tsconfig.app.json` (`"node"` in `types`)
- Rewrite: `frontend/public/favicon.svg`
- Create: `frontend/src/styles/typeFloor.test.ts`

`frontend/src/styles/surfaces.css` stays untouched until Task 8 (it still styles the old pages while they are being replaced; its variables simply resolve to nothing in the meantime).

**Interfaces:**
- Produces the class vocabulary every later task's markup uses: `.wrap .band .frame .nav .wordmark .nav-links .readout .page .page-head .course-head .course-head-slot .tabs .tab .eyebrow .count .caption .figure .figures .figure-tile .figure-tile--flag .figure-n .lede .empty .hint .btn .btn--secondary .btn--ghost .btn--danger .btn--micro .chip .chip--mono .chip--flag .chips .toggle .toggle-check .field .field-label .input .textarea .alert .bar .bracket .visually-hidden`.
- Produces the tokens named in the spec table plus `--line-dashed --ink-fill --ink-fill-hover --glow-line --glow --shadow-nav --band --wash-0..4 --radius --radius-panel --radius-nav --radius-pill --wrap --gutter --motion --ease`.

- [ ] **Step 1: Write the failing type-floor test**

Create `frontend/src/styles/typeFloor.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// jsdom does not lay text out, so the floor is checked where it is declared: every
// font-size in the stylesheets, in px or rem, has to come out at 12px or more
test('no stylesheet declares a font-size under 12px', () => {
  const sizes: { file: string; value: string; px: number }[] = []
  for (const file of readdirSync(here).filter(f => f.endsWith('.css'))) {
    const css = readFileSync(join(here, file), 'utf8')
    for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
      const value = m[1].trim()
      if (value === 'inherit') continue
      const px = value.endsWith('rem') ? parseFloat(value) * 16
        : value.endsWith('px') ? parseFloat(value)
        : Number.NaN
      sizes.push({ file, value, px })
    }
  }
  expect(sizes.length).toBeGreaterThan(0)
  expect(sizes.filter(s => Number.isNaN(s.px))).toEqual([])
  expect(sizes.filter(s => s.px < 12)).toEqual([])
})

test('the smallest declared size is exactly the 12px floor', () => {
  const all: number[] = []
  for (const file of readdirSync(here).filter(f => f.endsWith('.css'))) {
    for (const m of readFileSync(join(here, file), 'utf8').matchAll(/font-size:\s*(\d+(?:\.\d+)?)px;/g)) {
      all.push(parseFloat(m[1]))
    }
  }
  expect(Math.min(...all)).toBe(12)
})
```

- [ ] **Step 2: Run it to see it fail**

Run (from `frontend/`): `npx vitest run src/styles/typeFloor.test.ts`
Expected: FAIL. `tokens.css` declares `--text-3xs: 0.6875rem`-based sizes through `var()` (unparsed, NaN) and `surfaces.css` uses `var(--text-3xs)` (11px). The first test's `unparsed` assertion fails.

Also run `npx tsc -b` and note the `Cannot find module 'node:fs'` error: `tsconfig.app.json` lists `types` explicitly, which switches off automatic `@types/node` inclusion.

- [ ] **Step 3: Let the test compile**

In `frontend/tsconfig.app.json` change the `types` line to:

```json
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom/vitest", "node"],
```

- [ ] **Step 4: Write the tokens**

Replace `frontend/src/styles/tokens.css` with:

```css
/* The landing page's palette (site/index.html), value for value. Light only: one :root,
   no prefers-color-scheme block. The four tokens marked (new) are the ones the app needs
   that a marketing page does not: a correct/incorrect pair and the hover glow. */
:root {
  color-scheme: light;

  --page: oklch(99% 0.002 250);
  --card: oklch(100% 0 0);
  --sunken: oklch(97.5% 0.006 250);
  --line: oklch(91% 0.006 250);
  --line-dashed: oklch(82% 0.008 250);

  --ink: oklch(22% 0.012 250);
  --ink-fill: oklch(20% 0.012 250);
  --ink-fill-hover: oklch(28% 0.012 250);
  --ink-soft: oklch(38% 0.012 250);
  --ink-dim: oklch(46% 0.012 250);

  --accent: oklch(50% 0.14 232);
  --accent-strong: oklch(40% 0.14 232);
  --flag: oklch(52% 0.16 28);
  --flag-wash: oklch(95% 0.045 28); /* (new) */
  --ok: oklch(50% 0.14 152); /* (new) */
  --ok-wash: oklch(95% 0.06 152); /* (new) */

  /* (new) the AWS Startups card hover: a soft cyan-blue halo, never a fade */
  --glow-line: oklch(78% 0.11 230);
  --glow: 0 0 0 1px oklch(78% 0.11 230 / 0.7), 0 0 30px 6px oklch(84% 0.10 228 / 0.55);

  --shadow-nav: 0 1px 2px oklch(22% 0.012 250 / 0.06), 0 8px 24px oklch(22% 0.012 250 / 0.06);

  /* one wash, one band, home page only */
  --band: linear-gradient(118deg, oklch(93% 0.055 218) 0%, oklch(95% 0.035 265) 42%, oklch(94% 0.05 12) 100%);

  /* course tile washes, keyed by course id modulo five, drawn from the band's own hues */
  --wash-0: linear-gradient(135deg, oklch(93% 0.055 218), oklch(95% 0.035 265));
  --wash-1: linear-gradient(135deg, oklch(95% 0.035 265), oklch(94% 0.05 12));
  --wash-2: linear-gradient(135deg, oklch(94% 0.05 152), oklch(93% 0.055 218));
  --wash-3: linear-gradient(135deg, oklch(94% 0.05 12), oklch(95% 0.05 80));
  --wash-4: linear-gradient(135deg, oklch(95% 0.05 80), oklch(94% 0.05 152));

  --font-sans: 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;

  --radius: 14px;
  --radius-panel: 18px;
  --radius-nav: 12px;
  --radius-pill: 999px;

  --wrap: 1180px;
  --gutter: clamp(20px, 4vw, 56px);

  --motion: 160ms;
  --ease: ease;
}
```

- [ ] **Step 5: Write the base styles**

Replace `frontend/src/styles/base.css` with:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1,
h2,
h3 {
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

h1 {
  font-size: 40px;
  font-weight: 700;
}

h2 {
  font-size: 26px;
  font-weight: 700;
}

h3 {
  font-size: 19px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.015em;
}

p {
  margin: 0;
  text-wrap: pretty;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

a {
  color: var(--accent-strong);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

button {
  font-family: inherit;
}

:where(a, button, input, select, textarea):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

/* out of sight, still in the accessibility tree and the tab order */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* ---- type roles ---------------------------------------------------------- */

.eyebrow {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-strong);
}

.count {
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.02em;
  color: var(--ink-dim);
}

.caption {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.caption::before {
  content: '';
  width: 24px;
  height: 1px;
  background: var(--ink-dim);
}

/* a measured number with its label: the landing page's .figure */
.figure {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.figure > b {
  font-family: var(--font-mono);
  font-size: 32px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.04em;
}

.figure > span {
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.figures {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 20px;
}

.figure-tile {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 22px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.figure-tile > b {
  display: flex;
  align-items: baseline;
  gap: 9px;
  font-family: var(--font-mono);
  font-size: 32px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.04em;
}

.figure-tile > span {
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

/* a sample too small to trust wears the flag colour on its border and its n */
.figure-tile--flag {
  border-color: var(--flag);
}

.figure-n {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--flag);
}

.lede {
  font-size: 17px;
  color: var(--ink-soft);
}

.empty {
  font-size: 15px;
  color: var(--ink-soft);
}

.hint {
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

/* ---- controls ------------------------------------------------------------ */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 11px 22px;
  border: 1px solid var(--ink-fill);
  border-radius: var(--radius-pill);
  background: var(--ink-fill);
  color: oklch(99% 0 0);
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color var(--motion) var(--ease),
    border-color var(--motion) var(--ease),
    color var(--motion) var(--ease);
}

.btn:hover:not(:disabled) {
  border-color: var(--ink-fill-hover);
  background: var(--ink-fill-hover);
  color: oklch(99% 0 0);
  text-decoration: none;
}

.btn:disabled {
  cursor: not-allowed;
  border-color: var(--line);
  background: var(--sunken);
  color: var(--ink-dim);
}

.btn--secondary {
  border-color: var(--line);
  background: var(--card);
  color: var(--ink);
}

.btn--secondary:hover:not(:disabled) {
  border-color: var(--ink-soft);
  background: var(--card);
  color: var(--ink);
}

.btn--ghost {
  padding-inline: 4px;
  border-color: transparent;
  background: transparent;
  color: var(--accent-strong);
}

.btn--ghost:hover:not(:disabled) {
  border-color: transparent;
  background: transparent;
  color: var(--ink);
  text-decoration: underline;
}

/* destructive: outlined in the flag colour, filled only on hover */
.btn--danger {
  border-color: var(--flag);
  background: transparent;
  color: var(--flag);
}

.btn--danger:hover:not(:disabled) {
  border-color: var(--flag);
  background: var(--flag);
  color: oklch(99% 0 0);
}

.btn--micro {
  min-height: 36px;
  padding: 6px 14px;
  font-size: 13px;
}

.chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 3px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--sunken);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-soft);
}

.chip--mono {
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}

.chip--flag {
  color: var(--flag);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/* a pill wrapping a real checkbox: the box stays in the tree for the keyboard and the
   tests, the pill draws its state */
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--card);
  color: var(--ink-soft);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--motion) var(--ease),
    border-color var(--motion) var(--ease),
    color var(--motion) var(--ease);
}

.toggle:hover {
  border-color: var(--ink-soft);
}

.toggle:has(input:checked) {
  border-color: var(--ink-fill);
  background: var(--ink-fill);
  color: oklch(99% 0 0);
}

.toggle:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.toggle:has(input:disabled) {
  cursor: not-allowed;
  color: var(--ink-dim);
}

.toggle-check {
  display: none;
  flex: none;
}

.toggle:has(input:checked) .toggle-check {
  display: inline;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 22px;
}

.tab {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 8px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--card);
  color: var(--ink-soft);
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
  transition:
    background-color var(--motion) var(--ease),
    border-color var(--motion) var(--ease),
    color var(--motion) var(--ease);
}

.tab:hover {
  border-color: var(--ink-soft);
  color: var(--ink);
  text-decoration: none;
}

.tab.is-current {
  border-color: var(--ink-fill);
  background: var(--ink-fill);
  color: oklch(99% 0 0);
  font-weight: 600;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.input {
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 15px;
}

.input:hover:not(:disabled) {
  border-color: var(--ink-soft);
}

.input:disabled {
  background: var(--sunken);
  color: var(--ink-dim);
}

.textarea {
  width: 100%;
  min-height: 120px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--card);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 17px;
  line-height: 1.5;
  resize: vertical;
}

.textarea:hover:not(:disabled) {
  border-color: var(--ink-soft);
}

.textarea:disabled {
  background: var(--sunken);
  color: var(--ink-dim);
}

.alert {
  padding: 14px 18px;
  border: 1px solid var(--flag);
  border-radius: var(--radius);
  background: var(--flag-wash);
  color: var(--ink);
  font-size: 15px;
}

.bar {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--line);
  overflow: hidden;
}

.bar > span {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--accent);
  transition: width var(--motion) var(--ease);
}

/* a rounded square in the verdict colour beside the verdict word, so colour is never
   the only signal */
.bracket {
  display: inline-block;
  flex: none;
  width: 26px;
  height: 26px;
  border: 2px solid currentColor;
  border-radius: 7px;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 6: Write the shell styles**

Replace `frontend/src/styles/shell.css` with:

```css
.wrap {
  max-width: var(--wrap);
  margin: 0 auto;
  padding-inline: var(--gutter);
}

/* one wash, one place: the top of the home page. Everything else is the plain page. */
.band {
  padding: 22px 0 56px;
  background: var(--band);
}

/* every page but home: the nav pill on the plain page, then the page */
.frame {
  padding: 22px 0 64px;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: clamp(16px, 3vw, 40px);
  padding: 15px 24px;
  background: var(--card);
  border-radius: var(--radius-nav);
  box-shadow: var(--shadow-nav);
}

.wordmark {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.wordmark::before {
  content: '';
  width: 9px;
  height: 9px;
  background: var(--accent);
}

.nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(14px, 2vw, 28px);
  font-size: 15px;
}

.nav-links a {
  color: var(--ink-soft);
}

.nav-links a:hover {
  color: var(--ink);
}

.nav-links a.is-current {
  color: var(--ink);
  font-weight: 600;
}

/* the number the app publishes about itself, always in view */
.readout {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink-dim);
}

.readout span + span::before {
  content: ' · ';
}

.page {
  display: flex;
  flex-direction: column;
  gap: 32px;
  margin-top: 44px;
}

.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--line);
}

.course-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--line);
}

.course-head h1 {
  margin-top: 12px;
}

/* the page fills this: the study figure, the upload control */
.course-head-slot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding-bottom: 6px;
}

@media (max-width: 720px) {
  .readout {
    margin-left: 0;
  }

  .page {
    margin-top: 32px;
  }
}
```

- [ ] **Step 7: Fonts, favicon, imports**

`frontend/src/main.tsx`, replace the four font import lines and their comment with:

```ts
// self-hosted, so nothing loads from a network at runtime: the landing page's faces,
// Plex Sans 400/500/600/700 and Plex Mono 400/500/600, and nothing else
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
```

Replace `frontend/public/favicon.svg` with the landing page's mark:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0f1417"/><rect x="8" y="8" width="16" height="16" fill="#38bdf8"/></svg>
```

`frontend/src/index.css` stays as it is for now (tokens, base, shell, surfaces). Later tasks add their page stylesheet to it.

- [ ] **Step 8: Run the floor test, the suite, the build**

Run (from `frontend/`): `npx vitest run src/styles/typeFloor.test.ts`
Expected: FAIL on `surfaces.css` (its `var(--text-3xs)` sizes are unparsed). That file is deleted in Task 8; until then, exclude it explicitly. Change both `readdirSync(here).filter(f => f.endsWith('.css'))` calls in the test to:

```ts
readdirSync(here).filter(f => f.endsWith('.css') && f !== 'surfaces.css')
```

with the comment `// surfaces.css is the old language and goes in Task 8` on the line above the first one. Re-run: PASS, 2 tests.

Run: `npm test` → all files pass (52 tests: 50 + 2). Run: `npm run build` → clean. Run: `npm run lint` → clean.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/styles/tokens.css frontend/src/styles/base.css frontend/src/styles/shell.css frontend/src/styles/typeFloor.test.ts frontend/src/main.tsx frontend/tsconfig.app.json frontend/public/favicon.svg
git commit -m "feat: port the landing page's tokens, controls and shell styles"
```

---

### Task 3: Home page, nav pill, course shell, route tree

**Files:**
- Modify: `frontend/src/api.ts` (add `CourseOverview`, `api.overview`)
- Create: `frontend/src/shell/courses.ts`
- Create: `frontend/src/shell/Nav.tsx`
- Create: `frontend/src/shell/Frame.tsx`
- Create: `frontend/src/shell/CourseLayout.tsx`
- Create: `frontend/src/pages/HomePage.tsx`
- Create: `frontend/src/styles/home.css`
- Modify: `frontend/src/index.css`
- Rewrite: `frontend/src/App.tsx`
- Rewrite: `frontend/src/App.test.tsx`
- Create: `frontend/src/pages/HomePage.test.tsx`
- Create: `frontend/src/shell/CourseLayout.test.tsx`

**Interfaces:**
- Consumes: `GET /api/courses/overview` (Task 1), the class vocabulary (Task 2).
- Produces:
  - `api.overview(): Promise<CourseOverview[]>` with `interface CourseOverview { id: number; name: string; term: string; concepts: number; questions: number; dueToday: number }`.
  - `useCourses(): { courses: CourseOverview[] | null; error: string | null; refresh: () => Promise<void> }`.
  - `interface CourseContext { course: CourseOverview; refresh: () => Promise<void>; slot: HTMLDivElement | null }` from `shell/CourseLayout.tsx`, read by pages with `useOutletContext<CourseContext>()`. `slot` is the course head's right-hand cell; pages portal into it.
  - Routes: `/` Home; `/courses/:courseId` → `study`; `/courses/:courseId/{study,bank,dashboard}`; `/eval`; `*` → `/`.

Until Tasks 4-6 land, the three course pages still render their own course dropdown inside the shell. That is an intermediate state, not a bug to fix here.

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/App.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { api } from './api'
import App from './App'

const overview = [{ id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16 }]

vi.mock('./api', () => ({
  api: {
    overview: vi.fn().mockResolvedValue([
      { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16 },
    ]),
    courses: vi.fn().mockResolvedValue([{ id: 2, name: 'CS 149', term: 'Fall 2026' }]),
    next: vi.fn().mockResolvedValue(null),
    bank: vi.fn().mockResolvedValue([]),
    dashboard: vi.fn().mockResolvedValue({ dueToday: 0, concepts: [] }),
    createCourse: vi.fn(),
    evalReport: vi.fn().mockResolvedValue({
      labeled: 31, pctAnswerable: 1, pctCorrectAnswer: 0.97, pctUnambiguous: 0.94,
      gradedShortAnswers: 1, graderAgreement: 1,
    }),
  },
}))

beforeEach(() => vi.mocked(api.overview).mockResolvedValue(overview))
afterEach(() => window.history.pushState({}, '', '/'))

test('renders the wordmark', async () => {
  render(<App />)
  expect(screen.getByText('Study OS')).toBeInTheDocument()
  await screen.findByRole('heading', { name: 'Courses' })
})

test('the nav carries the eval counts once they load', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByText('31 labeled')).toBeInTheDocument())
  expect(screen.getByText('1 graded')).toBeInTheDocument()
  expect(screen.getByText('100% agreement')).toBeInTheDocument()
})

test('a failed eval load leaves the nav showing the brand and links alone', async () => {
  vi.mocked(api.evalReport).mockRejectedValueOnce(new Error('500'))
  render(<App />)
  await screen.findByRole('heading', { name: 'Courses' })
  expect(screen.queryByText(/labeled/)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('an unknown path lands on the course grid', async () => {
  window.history.pushState({}, '', '/nowhere')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/'))
  expect(await screen.findByRole('heading', { name: 'Courses' })).toBeInTheDocument()
})

test('the old top-level study route lands on the course grid too', async () => {
  window.history.pushState({}, '', '/study')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/'))
})

test('a bare course path opens that course on its study tab', async () => {
  window.history.pushState({}, '', '/courses/2')
  render(<App />)
  await waitFor(() => expect(window.location.pathname).toBe('/courses/2/study'))
  expect(await screen.findByRole('heading', { level: 1, name: 'CS 149' })).toBeInTheDocument()
})
```

Create `frontend/src/pages/HomePage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { api, type Course } from '../api'
import HomePage, { dueSplit } from './HomePage'

const overview = [
  { id: 1, name: 'CS 47', term: 'Spring 2026', concepts: 18, questions: 55, dueToday: 11 },
  { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16 },
]

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    createCourse: vi.fn(),
    evalReport: vi.fn().mockResolvedValue({
      labeled: 31, pctAnswerable: 1, pctCorrectAnswer: 0.97, pctUnambiguous: 0.94,
      gradedShortAnswers: 1, graderAgreement: 1,
    }),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue(overview)
})

function Probe() {
  const { pathname } = useLocation()
  return <p>at {pathname}</p>
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('dueSplit names every course', () => {
  expect(dueSplit([])).toBe('')
  expect(dueSplit([overview[0]])).toBe('11 in CS 47')
  expect(dueSplit(overview)).toBe('11 in CS 47 and 16 in CS 149')
  expect(dueSplit([...overview, { id: 3, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 16 }]))
    .toBe('11 in CS 47, 16 in CS 149 and 16 in CS 158A')
})

test('draws a tile per course with its figure and counts, linking into the course', async () => {
  renderHome()
  const tile = await screen.findByRole('link', { name: /CS 149/ })
  expect(tile).toHaveAttribute('href', '/courses/2/study')
  expect(tile).toHaveTextContent('16')
  expect(tile).toHaveTextContent('248 concepts · 844 questions')
  expect(screen.getByRole('link', { name: /CS 47/ })).toHaveAttribute('href', '/courses/1/study')
})

test('the hero sums what is due and names the split', async () => {
  renderHome()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('27 due today.')
  expect(screen.getByText(/11 in CS 47 and 16 in CS 149/)).toBeInTheDocument()
  expect(screen.getByText('Fall 2026 · 2 courses')).toBeInTheDocument()
})

test('with no courses the hero says so and only the new-course tile is drawn', async () => {
  vi.mocked(api.overview).mockResolvedValueOnce([])
  renderHome()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('No courses yet.')
  expect(screen.queryByRole('link', { name: /due today/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New course' })).toBeInTheDocument()
})

test('a failed overview shows the alert and no grid', async () => {
  vi.mocked(api.overview).mockRejectedValueOnce(new Error('500 /api/courses/overview'))
  renderHome()
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses/overview')
  expect(screen.queryByRole('heading', { name: 'Courses' })).not.toBeInTheDocument()
})

test('the new-course tile opens the form focused and prefilled with the newest term, and Escape closes it', async () => {
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  expect(screen.getByLabelText('Name')).toHaveFocus()
  expect(screen.getByLabelText('Term')).toHaveValue('Fall 2026')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New course' })).toHaveFocus()
})

test('Create stays disabled until both fields hold more than whitespace', async () => {
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.clear(screen.getByLabelText('Term'))
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Name'), '   ')
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Term'), 'Spring 2027')
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Name'), 'CS 158A')
  expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
})

test('creating a course posts the trimmed name and the term, then opens its bank', async () => {
  vi.mocked(api.createCourse).mockResolvedValueOnce({ id: 3, name: 'CS 158A', term: 'Fall 2026' })
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), '  CS 158A  ')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  await waitFor(() => expect(api.createCourse).toHaveBeenCalledWith('CS 158A', 'Fall 2026'))
  expect(await screen.findByText('at /courses/3/bank')).toBeInTheDocument()
})

test('Create is disabled for as long as the create is in flight', async () => {
  let land!: (c: Course) => void
  vi.mocked(api.createCourse).mockReturnValueOnce(new Promise<Course>(resolve => { land = resolve }))
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), 'CS 158A')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  land({ id: 3, name: 'CS 158A', term: 'Fall 2026' })
  expect(await screen.findByText('at /courses/3/bank')).toBeInTheDocument()
})

test('a failed create shows the alert and leaves the form open with what was typed', async () => {
  vi.mocked(api.createCourse).mockRejectedValueOnce(new Error('500 /api/courses'))
  renderHome()
  await userEvent.click(await screen.findByRole('button', { name: 'New course' }))
  await userEvent.type(screen.getByLabelText('Name'), 'CS 158A')
  await userEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses')
  expect(screen.getByLabelText('Name')).toHaveValue('CS 158A')
  expect(screen.getByLabelText('Term')).toHaveValue('Fall 2026')
})

test('cancelling hands the caret back to the new-course tile', async () => {
  renderHome()
  const open = await screen.findByRole('button', { name: 'New course' })
  await userEvent.click(open)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'New course' })).toHaveFocus()
})
```

Create `frontend/src/shell/CourseLayout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { api } from '../api'
import CourseLayout from './CourseLayout'

vi.mock('../api', () => ({
  api: {
    overview: vi.fn().mockResolvedValue([
      { id: 2, name: 'CS 149', term: 'Fall 2026', concepts: 248, questions: 844, dueToday: 16 },
    ]),
  },
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/courses/:courseId" element={<CourseLayout />}>
          <Route index element={<Navigate to="study" replace />} />
          <Route path="study" element={<p>study page</p>} />
          <Route path="bank" element={<p>bank page</p>} />
        </Route>
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

test('a known course gets its head and tabs, and the index route lands on study', async () => {
  renderAt('/courses/2')
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('CS 149')
  expect(screen.getByText('Fall 2026 · 248 concepts · 844 questions')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Study' })).toHaveAttribute('href', '/courses/2/study')
  expect(screen.getByRole('link', { name: 'Bank' })).toHaveAttribute('href', '/courses/2/bank')
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/courses/2/dashboard')
  expect(await screen.findByText('study page')).toBeInTheDocument()
})

test('the current tab is marked', async () => {
  renderAt('/courses/2/bank')
  await screen.findByText('bank page')
  expect(screen.getByRole('link', { name: 'Bank' })).toHaveClass('is-current')
  expect(screen.getByRole('link', { name: 'Study' })).not.toHaveClass('is-current')
})

test('an unknown id is a not-found state with a way back', async () => {
  renderAt('/courses/99/study')
  expect(await screen.findByRole('alert')).toHaveTextContent('No course has id 99.')
  expect(screen.getByRole('link', { name: 'All courses' })).toHaveAttribute('href', '/')
  expect(screen.queryByText('study page')).not.toBeInTheDocument()
})

test('a non-numeric id is a not-found state too', async () => {
  renderAt('/courses/abc/study')
  expect(await screen.findByRole('alert')).toHaveTextContent('No course has id abc.')
})

test('a failed overview shows the alert instead of the tabs', async () => {
  vi.mocked(api.overview).mockRejectedValueOnce(new Error('500 /api/courses/overview'))
  renderAt('/courses/2/study')
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses/overview')
  expect(screen.queryByRole('link', { name: 'Study' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to see them fail**

Run (from `frontend/`): `npx vitest run src/App.test.tsx src/pages/HomePage.test.tsx src/shell/CourseLayout.test.tsx`
Expected: FAIL. `Cannot find module './HomePage'` / `'./CourseLayout'`; App tests fail on the missing `Courses` heading.

- [ ] **Step 3: API client**

In `frontend/src/api.ts`, after the `Course` interface add:

```ts
export interface CourseOverview {
  id: number
  name: string
  term: string
  concepts: number
  questions: number
  dueToday: number
}
```

and in the `api` object, right after `courses:`:

```ts
  overview: () => get<CourseOverview[]>('/api/courses/overview'),
```

- [ ] **Step 4: The courses hook**

Create `frontend/src/shell/courses.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { api, type CourseOverview } from '../api'

export interface CoursesState {
  courses: CourseOverview[] | null
  error: string | null
  refresh: () => Promise<void>
}

/* Every course with its counts. null until the first load lands; error is only ever
   the first load's, because a refresh that fails should keep the numbers it had: a
   stale figure beats a torn-down page. */
export function useCourses(): CoursesState {
  const [courses, setCourses] = useState<CourseOverview[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.overview().then(setCourses).catch(e => setError(String(e)))
  }, [])

  const refresh = useCallback(
    () => api.overview().then(setCourses).catch(() => undefined),
    [],
  )

  return { courses, error, refresh }
}
```

- [ ] **Step 5: Nav and Frame**

Create `frontend/src/shell/Nav.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { api, type EvalReport } from '../api'

/* The floating nav pill from the landing page. The readout is chrome: a failed load
   leaves the pill with the brand and links alone rather than raising an alert over
   whichever page the user actually came for. */
export default function Nav() {
  const { pathname } = useLocation()
  const [report, setReport] = useState<EvalReport | null>(null)

  useEffect(() => {
    api.evalReport().then(setReport).catch(() => setReport(null))
  }, [])

  // "Courses" covers the grid and everything inside a course
  const inCourses = !pathname.startsWith('/eval')

  return (
    <nav className="nav" aria-label="Primary">
      <span className="wordmark">Study OS</span>
      <span className="nav-links">
        <NavLink to="/" className={inCourses ? 'is-current' : undefined}>Courses</NavLink>
        <NavLink to="/eval" className={({ isActive }) => (isActive ? 'is-current' : undefined)}>Evaluation</NavLink>
      </span>
      {report && (
        <span className="readout">
          <span>{report.labeled} labeled</span>
          <span>{report.gradedShortAnswers} graded</span>
          {report.gradedShortAnswers > 0 && <span>{Math.round(report.graderAgreement * 100)}% agreement</span>}
        </span>
      )}
    </nav>
  )
}
```

Create `frontend/src/shell/Frame.tsx`:

```tsx
import { Outlet } from 'react-router-dom'
import Nav from './Nav'

/* every page but home: the nav pill on the plain page, then the page */
export default function Frame() {
  return (
    <div className="frame">
      <div className="wrap">
        <Nav />
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: The course shell**

Create `frontend/src/shell/CourseLayout.tsx`:

```tsx
import { useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import type { CourseOverview } from '../api'
import { useCourses } from './courses'

export interface CourseContext {
  course: CourseOverview
  /* refetch the overview, so the head's figures follow what the page just did */
  refresh: () => Promise<void>
  /* the head's right-hand cell; a page portals its own control into it */
  slot: HTMLDivElement | null
}

const tab = ({ isActive }: { isActive: boolean }) => `tab${isActive ? ' is-current' : ''}`

/* Loads the course once and hands it to whichever tab is open. Everything under
   /courses/:courseId renders inside this. */
export default function CourseLayout() {
  const { courseId } = useParams()
  const { courses, error, refresh } = useCourses()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)

  if (error) {
    return (
      <div className="page">
        <p className="alert" role="alert">{error}</p>
      </div>
    )
  }
  if (!courses) {
    return (
      <div className="page">
        <p className="empty">Loading…</p>
      </div>
    )
  }

  // Number('abc') is NaN and matches nothing, which is the not-found state we want
  const course = courses.find(c => c.id === Number(courseId))
  if (!course) {
    return (
      <div className="page">
        <p className="alert" role="alert">No course has id {courseId}.</p>
        <Link className="btn btn--ghost" to="/">All courses</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="course-head">
        <div>
          <p className="eyebrow">{course.term} · {course.concepts} concepts · {course.questions} questions</p>
          <h1>{course.name}</h1>
          <nav className="tabs" aria-label="Course">
            <NavLink to="study" className={tab}>Study</NavLink>
            <NavLink to="bank" className={tab}>Bank</NavLink>
            <NavLink to="dashboard" className={tab}>Dashboard</NavLink>
          </nav>
        </div>
        <div className="course-head-slot" ref={setSlot} />
      </header>
      <Outlet context={{ course, refresh, slot } satisfies CourseContext} />
    </div>
  )
}
```

- [ ] **Step 7: The home page**

Create `frontend/src/pages/HomePage.tsx`:

```tsx
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type CourseOverview } from '../api'
import Nav from '../shell/Nav'
import { useCourses } from '../shell/courses'

/* five washes cycle by id, so courses made one after the other never share one */
const WASHES = 5

/* "11 in CS 47, 16 in CS 149 and 16 in CS 158A" */
export function dueSplit(courses: CourseOverview[]): string {
  const parts = courses.map(c => `${c.dueToday} in ${c.name}`)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export default function HomePage() {
  const { courses, error } = useCourses()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [term, setTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const nameField = useRef<HTMLInputElement>(null)
  const newTile = useRef<HTMLButtonElement>(null)

  // the form is only reachable from the keyboard if opening it moves the caret inside,
  // and closing it has to hand the caret back rather than drop it on document.body
  const wasCreating = useRef(false)
  useLayoutEffect(() => {
    if (creating) {
      nameField.current?.focus()
      wasCreating.current = true
    } else if (wasCreating.current) {
      newTile.current?.focus()
      wasCreating.current = false
    }
  }, [creating])

  const list = courses ?? []
  const due = list.reduce((n, c) => n + c.dueToday, 0)
  const newest = list[list.length - 1]

  function openForm() {
    // term seeded from the newest course rather than a literal that goes stale in a year
    setName('')
    setTerm(newest?.term ?? '')
    setCreateError(null)
    setCreating(true)
  }

  function closeForm() {
    setCreating(false)
    setName('')
    setTerm('')
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = name.trim()
    const t = term.trim()
    if (!n || !t || saving) return
    setSaving(true)
    setCreateError(null)
    try {
      const c = await api.createCourse(n, t)
      // an empty course has one useful next step, uploading a PDF, and that lives in the bank
      navigate(`/courses/${c.id}/bank`)
    } catch (err) {
      // the form stays open and keeps what was typed, so a failure costs a click
      setCreateError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const shown = error ?? createError

  return (
    <>
      <div className="band">
        <div className="wrap">
          <Nav />
          <header className="hero">
            {courses && courses.length > 0 && (
              <>
                <p className="eyebrow">{newest.term} · {courses.length} {courses.length === 1 ? 'course' : 'courses'}</p>
                <h1>{due} due today.</h1>
                <p className="lede">{dueSplit(courses)}. Pick a class to start the queue.</p>
              </>
            )}
            {courses && courses.length === 0 && (
              <>
                <h1>No courses yet.</h1>
                <p className="lede">Add one below and upload a lecture PDF.</p>
              </>
            )}
          </header>
        </div>
      </div>
      <main className="wrap home">
        {shown && <p className="alert" role="alert">{shown}</p>}
        {courses && (
          <section className="courses">
            <h2>Courses</h2>
            <div className="grid">
              {courses.map(c => (
                <Link key={c.id} className="tile" to={`/courses/${c.id}/study`}>
                  <span className={`tile-wash wash-${c.id % WASHES}`}>
                    <span className="tile-code">{c.name}</span>
                    <span className="tile-term">{c.term}</span>
                  </span>
                  <span className="tile-body">
                    <span className="figure"><b>{c.dueToday}</b><span>due today</span></span>
                    <span className="tile-counts">{c.concepts} concepts · {c.questions} questions</span>
                  </span>
                </Link>
              ))}
              {creating ? (
                <form className="tile tile--form" onSubmit={onCreate}
                  onKeyDown={e => { if (e.key === 'Escape') closeForm() }}>
                  <label className="field">
                    <span className="field-label">Name</span>
                    <input className="input" ref={nameField} value={name} disabled={saving}
                      onChange={e => setName(e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field-label">Term</span>
                    <input className="input" value={term} disabled={saving}
                      onChange={e => setTerm(e.target.value)} />
                  </label>
                  <span className="tile-form-actions">
                    <button className="btn btn--micro" type="submit"
                      disabled={saving || !name.trim() || !term.trim()}>Create</button>
                    <button className="btn btn--secondary btn--micro" type="button" disabled={saving}
                      onClick={closeForm}>Cancel</button>
                  </span>
                </form>
              ) : (
                <button ref={newTile} className="tile tile--new" type="button" onClick={openForm}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                    strokeWidth="1.8" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
                  New course
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  )
}
```

- [ ] **Step 8: Home styles and the import**

Create `frontend/src/styles/home.css`:

```css
.hero {
  margin-top: 44px;
}

.hero h1 {
  margin-top: 12px;
}

.hero .lede {
  margin-top: 12px;
  max-width: 46ch;
}

.home {
  padding-bottom: 64px;
}

.courses {
  margin-top: 48px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 24px;
  margin-top: 24px;
}

/* a course: the Canvas card, in the landing page's clothes. The whole tile is the link. */
.tile {
  display: flex;
  flex-direction: column;
  min-height: 280px;
  padding: 0;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  color: var(--ink);
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition:
    border-color var(--motion) var(--ease),
    box-shadow var(--motion) var(--ease);
}

.tile:hover,
.tile:focus-visible {
  border-color: var(--glow-line);
  box-shadow: var(--glow);
  color: var(--ink);
  text-decoration: none;
}

.tile-wash {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  height: 128px;
  padding: 20px 22px;
}

.wash-0 { background: var(--wash-0); }
.wash-1 { background: var(--wash-1); }
.wash-2 { background: var(--wash-2); }
.wash-3 { background: var(--wash-3); }
.wash-4 { background: var(--wash-4); }

.tile-code {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
}

.tile-term {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.tile-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px 22px;
}

.tile-counts {
  font-size: 14px;
  color: var(--ink-dim);
}

.tile--new {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--line-dashed);
  background: transparent;
  color: var(--ink-soft);
  font-size: 15px;
  font-weight: 600;
}

.tile--new:hover,
.tile--new:focus-visible {
  border-style: solid;
}

.tile--form {
  justify-content: center;
  gap: 14px;
  padding: 22px;
  cursor: default;
}

.tile--form:hover {
  border-color: var(--line);
  box-shadow: none;
}

.tile-form-actions {
  display: flex;
  gap: 8px;
}
```

`frontend/src/index.css` becomes:

```css
@import './styles/tokens.css';
@import './styles/base.css';
@import './styles/shell.css';
@import './styles/home.css';
@import './styles/surfaces.css';
```

- [ ] **Step 9: The route tree**

Replace `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import CourseLayout from './shell/CourseLayout'
import Frame from './shell/Frame'
import BankPage from './pages/BankPage'
import DashboardPage from './pages/DashboardPage'
import EvalPage from './pages/EvalPage'
import HomePage from './pages/HomePage'
import StudyPage from './pages/StudyPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route element={<Frame />}>
          <Route path="/courses/:courseId" element={<CourseLayout />}>
            <Route index element={<Navigate to="study" replace />} />
            <Route path="study" element={<StudyPage />} />
            <Route path="bank" element={<BankPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
          </Route>
          <Route path="/eval" element={<EvalPage />} />
        </Route>
        {/* the old top-level /study, /bank and /dashboard, and anything else, land on the grid */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 10: Run the three test files, then everything**

Run (from `frontend/`): `npx vitest run src/App.test.tsx src/pages/HomePage.test.tsx src/shell/CourseLayout.test.tsx`
Expected: PASS, 6 + 11 + 5 tests.

Run: `npm test` → all green (68 tests). `npm run build` → clean. `npm run lint` → clean.

Open http://localhost:5173/ in a browser: the band, the nav pill, `43 due today.` and three tiles, the dashed New course tile. Hover a tile: the cyan halo.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/api.ts frontend/src/shell frontend/src/pages/HomePage.tsx frontend/src/pages/HomePage.test.tsx frontend/src/styles/home.css frontend/src/index.css frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: a home of course tiles, a nav pill, and course-scoped routes"
```

---

### Task 4: Study page

**Files:**
- Create: `frontend/src/test/render.tsx`
- Rewrite: `frontend/src/pages/StudyPage.tsx`
- Rewrite: `frontend/src/pages/StudyPage.test.tsx`
- Create: `frontend/src/styles/study.css`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `CourseContext` (`course`, `refresh`, `slot`) from Task 3; `api.next / answer / override / selfGrade` unchanged.
- Produces: `renderInCourse(page: ReactElement, tab: string, courseId = 1)` test helper for Tasks 5 and 6.

Copy that changes, and the tests that pin it: the verdict word is `Correct` / `Incorrect` (was the raw `CORRECT` / `INCORRECT`), the advance button is `Next question` (was `Next`), the PENDING line is `Grader unavailable. Self-grade this one:`.

- [ ] **Step 1: The test helper**

Create `frontend/src/test/render.tsx`:

```tsx
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CourseLayout from '../shell/CourseLayout'

/* a page under the course shell at /courses/<id>/<tab>: the layout fetches api.overview,
   which every test file mocks, and hands the course to the page */
export function renderInCourse(page: ReactElement, tab: string, courseId = 1) {
  return render(
    <MemoryRouter initialEntries={[`/courses/${courseId}/${tab}`]}>
      <Routes>
        <Route path="/courses/:courseId" element={<CourseLayout />}>
          <Route path={tab} element={page} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}
```

- [ ] **Step 2: Write the failing tests**

Replace `frontend/src/pages/StudyPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { api, type Attempt, type StudyQuestion } from '../api'
import { renderInCourse } from '../test/render'
import StudyPage from './StudyPage'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 16 }

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    next: vi.fn(),
    answer: vi.fn(),
    override: vi.fn(),
    selfGrade: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
  vi.mocked(api.next).mockResolvedValue({
    id: 9, type: 'MC', prompt: 'Steps in the TCP handshake?', options: ['1', '2', '3', '4'], sourcePages: '3',
  })
  vi.mocked(api.answer).mockResolvedValue({ id: 1, verdict: 'CORRECT', score: 1, feedback: null })
})

const shortAnswer: StudyQuestion = {
  id: 10, type: 'SHORT_ANSWER', prompt: 'Describe the handshake.', options: [], sourcePages: '3,4',
}

async function renderWithQuestion() {
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument())
}

async function renderShortAnswer(attempt: Attempt) {
  vi.mocked(api.next).mockResolvedValueOnce(shortAnswer)
  vi.mocked(api.answer).mockResolvedValueOnce(attempt)
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  await userEvent.type(screen.getByRole('textbox'), 'SYN then SYN-ACK')
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
}

test('shows the question with its type and pages, submits an MC answer, shows the verdict', async () => {
  await renderWithQuestion()
  expect(screen.getByText('Multiple choice')).toBeInTheDocument()
  expect(screen.getByText('pp. 3')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  expect(screen.getByText('You picked C: 3')).toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledWith({ questionId: 9, answerIndex: 2 })
})

test('the head figure shows what is left and the overview is refetched after an answer', async () => {
  await renderWithQuestion()
  expect(screen.getByText('left today').previousElementSibling).toHaveTextContent('16')
  vi.mocked(api.overview).mockResolvedValueOnce([{ ...course, dueToday: 15 }])
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByText('left today').previousElementSibling).toHaveTextContent('15'))
})

test('empty state when nothing due, with a way to the bank', async () => {
  vi.mocked(api.next).mockResolvedValueOnce(null)
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText(/Nothing due/)).toBeInTheDocument())
  expect(screen.getByRole('link', { name: 'Open the bank' })).toHaveAttribute('href', '/courses/1/bank')
})

test('shows an alert when loading the next question fails', async () => {
  vi.mocked(api.next).mockRejectedValueOnce(new Error('500 /api/study/next'))
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/next'))
})

test('shows an alert when answering fails', async () => {
  vi.mocked(api.answer).mockRejectedValueOnce(new Error('500 /api/study/answer'))
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/answer'))
  expect(screen.getByRole('button', { name: '3' })).toBeEnabled()
})

test('ignores a second click while an answer is pending', async () => {
  let resolveAnswer!: (a: Attempt) => void
  vi.mocked(api.answer).mockReturnValueOnce(new Promise<Attempt>(r => { resolveAnswer = r }))
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await userEvent.click(screen.getByRole('button', { name: '4' }))
  expect(api.answer).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '4' })).toBeDisabled()
  resolveAnswer({ id: 1, verdict: 'CORRECT', score: 1, feedback: null })
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
})

test('keeps the graded question locked when loading the next one fails', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  vi.mocked(api.next).mockRejectedValueOnce(new Error('500 /api/study/next'))
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/next'))
  expect(screen.getByText(/Correct/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next question' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledTimes(1)
})

test('short answer flow shows the submitted text, the verdict, the feedback and the override', async () => {
  await renderShortAnswer({ id: 2, verdict: 'INCORRECT', score: 0.4, feedback: 'Missed ACK.' })
  await waitFor(() => expect(screen.getByText(/Incorrect/)).toBeInTheDocument())
  expect(screen.getByText('SYN then SYN-ACK')).toBeInTheDocument()
  expect(screen.getByText('Grader: Missed ACK.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /I was actually right/i })).toBeInTheDocument()
  expect(api.answer).toHaveBeenCalledWith({ questionId: 10, answerText: 'SYN then SYN-ACK' })
})

test('pending verdict offers self-grade', async () => {
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await waitFor(() => expect(screen.getByText(/grader unavailable/i)).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /I got it wrong/i })).toBeInTheDocument()
})

test('shows an alert when self-grading fails and keeps the self-grade buttons', async () => {
  vi.mocked(api.selfGrade).mockRejectedValueOnce(new Error('500 /api/study/attempts/2/self-grade'))
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /I got it right/i }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/study/attempts/2/self-grade'))
  expect(api.selfGrade).toHaveBeenCalledWith(2, true)
  expect(screen.getByRole('button', { name: /I got it right/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /I got it wrong/i })).toBeEnabled()
})

test('disables Next question while a self-grade is in flight', async () => {
  let resolveSelfGrade!: (a: Attempt) => void
  vi.mocked(api.selfGrade).mockReturnValueOnce(new Promise<Attempt>(r => { resolveSelfGrade = r }))
  await renderShortAnswer({ id: 2, verdict: 'PENDING', score: null, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: /I got it right/i })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /I got it right/i }))
  expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled()
  resolveSelfGrade({ id: 2, verdict: 'CORRECT', score: 1, feedback: null })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next question' })).toBeEnabled())
  expect(api.next).toHaveBeenCalledTimes(1)
})

test('ignores a second Next question click while the next question is loading', async () => {
  await renderWithQuestion()
  await userEvent.click(screen.getByRole('button', { name: '3' }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  let resolveNext!: (q: StudyQuestion | null) => void
  vi.mocked(api.next).mockClear()
  vi.mocked(api.next).mockReturnValueOnce(new Promise<StudyQuestion | null>(r => { resolveNext = r }))
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  await userEvent.click(screen.getByRole('button', { name: 'Next question' }))
  expect(api.next).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled()
  resolveNext(null)
  await waitFor(() => expect(screen.getByText(/Nothing due/)).toBeInTheDocument())
})

test('will not send a blank or whitespace-only short answer to the grader', async () => {
  vi.mocked(api.next).mockResolvedValueOnce(shortAnswer)
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Describe the handshake.')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await userEvent.type(screen.getByRole('textbox'), '   ')
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  expect(api.answer).not.toHaveBeenCalled()
  await userEvent.clear(screen.getByRole('textbox'))
  await userEvent.type(screen.getByRole('textbox'), '  SYN then SYN-ACK  ')
  expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: /submit/i }))
  await waitFor(() => expect(screen.getByText(/Correct/)).toBeInTheDocument())
  // the padding is gated on the trim, so it is not part of what gets billed and stored
  expect(api.answer).toHaveBeenCalledWith({ questionId: 10, answerText: 'SYN then SYN-ACK' })
})

test('shows no page chip for a question with no source pages', async () => {
  vi.mocked(api.next).mockResolvedValueOnce({
    id: 11, type: 'MC', prompt: 'Steps in the TCP handshake?', options: ['1', '2', '3', '4'], sourcePages: null,
  })
  renderInCourse(<StudyPage />, 'study')
  await waitFor(() => expect(screen.getByText('Steps in the TCP handshake?')).toBeInTheDocument())
  expect(screen.queryByText(/pp\./)).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Run them to see them fail**

Run (from `frontend/`): `npx vitest run src/pages/StudyPage.test.tsx`
Expected: FAIL. The old page calls `api.courses` (not mocked, `TypeError`), and nothing renders `left today`, `Next question`, `Correct`.

- [ ] **Step 4: Rewrite the page**

Replace `frontend/src/pages/StudyPage.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type Attempt, type StudyQuestion } from '../api'
import type { CourseContext } from '../shell/CourseLayout'

const LETTERS = 'ABCDEFGHIJ'
const letter = (i: number) => LETTERS[i] ?? String(i + 1)

export default function StudyPage() {
  const { course, refresh, slot } = useOutletContext<CourseContext>()
  const [question, setQuestion] = useState<StudyQuestion | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // a ref, not the state: two clicks in one tick both read the pre-render value of `submitting`
  const inFlight = useRef(false)
  // what was due when the visit started, so the bar has a whole to fill against
  const [startOfVisit] = useState(course.dueToday)

  // every call that talks to the API goes through here, so only one is ever in flight
  const run = useCallback(async (work: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(String(e))
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }, [])

  const load = useCallback(() => run(async () => {
    const q = await api.next(course.id)
    setQuestion(q)
    setAttempt(null)
    setPicked(null)
    setSubmitted('')
    setDone(q === null)
  }), [run, course.id])

  useEffect(() => {
    load()
  }, [load])

  // every verdict moves the concept out of today's queue, so the head figure is stale after one
  function submit(call: () => Promise<Attempt>) {
    return run(async () => {
      setAttempt(await call())
      await refresh()
    })
  }

  function answerMc(index: number) {
    if (!question) return
    setPicked(index)
    submit(() => api.answer({ questionId: question.id, answerIndex: index }))
  }

  function answerShort() {
    if (!question) return
    // trimmed on the way out for the same reason Submit is gated on the trim: the
    // padding is not part of the answer and it is billed and stored either way
    const answer = text.trim()
    submit(async () => {
      const a = await api.answer({ questionId: question.id, answerText: answer })
      setSubmitted(answer)
      setText('')
      return a
    })
  }

  const left = course.dueToday
  const fill = startOfVisit === 0 ? null : Math.max(0, Math.min(100, Math.round((1 - left / startOfVisit) * 100)))

  return (
    <div className="study">
      {slot && createPortal(
        <div className="progress">
          <p className="figure"><b>{left}</b><span>left today</span></p>
          {fill != null && <div className="bar"><span style={{ width: `${fill}%` }} /></div>}
        </div>,
        slot,
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      {done && (
        <div className="qcard-big">
          <p className="empty">Nothing due. Come back tomorrow.</p>
          <Link className="btn btn--ghost" to="../bank">Open the bank</Link>
        </div>
      )}
      {question && (
        <article className="qcard-big">
          <div className="chips">
            <span className="chip">{question.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
            {question.sourcePages && <span className="chip chip--mono">pp. {question.sourcePages}</span>}
          </div>
          <p className="prompt">{question.prompt}</p>
          {question.type === 'MC' && !attempt && (
            <div className="opts">
              {question.options.map((o, i) => (
                <button className="opt" key={i} disabled={submitting} onClick={() => answerMc(i)}>
                  <span className="letter" aria-hidden="true">{letter(i)}</span>{o}
                </button>
              ))}
            </div>
          )}
          {question.type === 'SHORT_ANSWER' && !attempt && (
            <div className="short-answer">
              <textarea className="textarea" aria-label="Your answer" value={text} disabled={submitting}
                onChange={e => setText(e.target.value)} />
              {/* a blank or whitespace-only answer still buys a real grader call and banks an attempt that drags the schedule */}
              <button className="btn" disabled={submitting || !text.trim()} onClick={answerShort}>Submit</button>
            </div>
          )}
          {attempt && (
            <>
              {submitted && <p className="your-answer">{submitted}</p>}
              {attempt.verdict === 'PENDING' ? (
                <div className="verdict verdict--pending">
                  <p className="verdict-line">
                    <span className="bracket" aria-hidden="true" />
                    Grader unavailable. Self-grade this one:
                  </p>
                  <div className="actions">
                    <button className="btn btn--secondary" disabled={submitting}
                      onClick={() => submit(() => api.selfGrade(attempt.id, true))}>I got it right</button>
                    <button className="btn btn--secondary" disabled={submitting}
                      onClick={() => submit(() => api.selfGrade(attempt.id, false))}>I got it wrong</button>
                    <button className="btn" disabled={submitting} onClick={load}>Next question</button>
                  </div>
                </div>
              ) : (
                <div className={`verdict ${attempt.verdict === 'CORRECT' ? 'verdict--ok' : 'verdict--bad'}`}>
                  <p className="verdict-line">
                    <span className="bracket" aria-hidden="true" />
                    {attempt.verdict === 'CORRECT' ? 'Correct' : 'Incorrect'}
                    {attempt.score != null && <span className="score">{attempt.score}</span>}
                  </p>
                  {picked != null && question.type === 'MC' && (
                    <p className="verdict-note">You picked {letter(picked)}: {question.options[picked]}</p>
                  )}
                  {attempt.feedback && <p className="verdict-note">Grader: {attempt.feedback}</p>}
                  <div className="actions">
                    <button className="btn btn--secondary" disabled={submitting}
                      onClick={() => submit(() => api.override(attempt.id))}>
                      {attempt.verdict === 'INCORRECT' ? 'I was actually right' : 'I was actually wrong'}
                    </button>
                    <button className="btn" disabled={submitting} onClick={load}>Next question</button>
                  </div>
                </div>
              )}
            </>
          )}
        </article>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Study styles and the import**

Create `frontend/src/styles/study.css`:

```css
/* one centered column, one question, nothing else on screen */
.study {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
}

.progress {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.progress .bar {
  width: 220px;
}

.qcard-big {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: clamp(24px, 4vw, 40px);
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.prompt {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.opts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.opt {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 60px;
  padding: 12px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
  color: var(--ink);
  font-size: 17px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--motion) var(--ease),
    box-shadow var(--motion) var(--ease);
}

.opt:hover:not(:disabled),
.opt:focus-visible {
  border-color: var(--glow-line);
  box-shadow: var(--glow);
}

.opt:disabled {
  cursor: not-allowed;
  color: var(--ink-dim);
}

.letter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--sunken);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-soft);
}

.short-answer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
}

.your-answer {
  padding: 18px 22px;
  border-radius: 12px;
  background: var(--sunken);
  font-size: 17px;
  line-height: 1.5;
  color: var(--ink-soft);
}

/* the verdict band: a wash in the verdict colour, the bracket beside the word */
.verdict {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 28px 32px;
  border-radius: var(--radius);
  background: var(--sunken);
}

.verdict--ok {
  background: var(--ok-wash);
}

.verdict--bad {
  background: var(--flag-wash);
}

.verdict--ok .bracket {
  color: var(--ok);
}

.verdict--bad .bracket {
  color: var(--flag);
}

.verdict--pending .bracket {
  color: var(--ink-dim);
}

.verdict-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.score {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 500;
  color: var(--ink-dim);
}

.verdict-note {
  font-size: 17px;
  line-height: 1.5;
  color: var(--ink-soft);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 4px;
}
```

In `frontend/src/index.css` add `@import './styles/study.css';` after the `home.css` line.

- [ ] **Step 6: Run the study tests, then everything**

Run (from `frontend/`): `npx vitest run src/pages/StudyPage.test.tsx`
Expected: PASS, 14 tests.

Run: `npm test` (all green), `npm run build`, `npm run lint`. Open http://localhost:5173/courses/2/study: the figure and bar at the head's right, one card, lettered options, the glow on hover. Do not answer a short-answer question (it spends a grader call and lands in the agreement denominator); answering one MC question is fine.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/test/render.tsx frontend/src/pages/StudyPage.tsx frontend/src/pages/StudyPage.test.tsx frontend/src/styles/study.css frontend/src/index.css
git commit -m "feat: study is one question card with lettered options and a verdict band"
```

---

### Task 5: Bank as a split view: concept list on the left, one concept's question cards on the right

**Files:**
- Create: `frontend/src/pages/BankRoute.tsx`
- Rewrite: `frontend/src/pages/BankPage.tsx`
- Create: `frontend/src/pages/BankConceptPage.tsx`
- Modify: `frontend/src/test/render.tsx` (add `renderBank`)
- Rewrite: `frontend/src/pages/BankPage.test.tsx`
- Create: `frontend/src/pages/BankConceptPage.test.tsx`
- Create: `frontend/src/styles/bank.css`
- Modify: `frontend/src/index.css`, `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `CourseContext` (Task 3), `api.bank / upload / retire / restore / label` unchanged.
- Produces: `interface BankContext extends CourseContext { bank: ConceptWithQuestions[] | null; reload: () => Promise<void>; setError: (e: string | null) => void }` from `pages/BankRoute.tsx`; routes `bank` (the split: list + outlet; index → `BankPage`, which sends `/bank` to the first concept or shows the empty state) and `bank/:conceptId` (`BankConceptPage`, the right pane); `renderBank(path)` test helper.

Copy that changes, and the tests that pin it: `Retire` / `Confirm retire` / `Cancel` / `Restore` (were lowercase), labels `Answerable` / `Correct` / `Unambiguous` with `Save labels` and the word `labeled` (was `label` / `labeled ✓`), the upload control reads `Upload a lecture PDF`. The New course form moved to Home in Task 3; its tests moved with it.

- [ ] **Step 1: Extend the test helper**

Append to `frontend/src/test/render.tsx`:

```tsx
import BankConceptPage from '../pages/BankConceptPage'
import BankPage from '../pages/BankPage'
import BankRoute from '../pages/BankRoute'

/* the bank's split view under the course shell, at the given path */
export function renderBank(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/courses/:courseId" element={<CourseLayout />}>
          <Route path="bank" element={<BankRoute />}>
            <Route index element={<BankPage />} />
            <Route path=":conceptId" element={<BankConceptPage />} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}
```

(Move the three new imports up with the other imports at the top of the file.)

- [ ] **Step 2: Write the failing tests**

Replace `frontend/src/pages/BankPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api } from '../api'
import { renderBank } from '../test/render'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 2, questions: 3, dueToday: 2 }

const bank = [
  {
    id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4',
    questions: [
      { id: 9, type: 'MC' as const, prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3', status: 'ACTIVE' as const, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
      { id: 10, type: 'SHORT_ANSWER' as const, prompt: 'Why three?', optionsJson: null, correctIndex: null, sourcePages: '4', status: 'RETIRED' as const, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
    ],
  },
  {
    id: 6, name: 'Sockets', summary: 'bind/listen/accept', sourcePages: null,
    questions: [
      { id: 11, type: 'SHORT_ANSWER' as const, prompt: 'What does bind do?', optionsJson: null, correctIndex: null, sourcePages: null, status: 'ACTIVE' as const, labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null },
    ],
  },
]

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    bank: vi.fn(),
    upload: vi.fn(),
    retire: vi.fn(),
    restore: vi.fn(),
    label: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
  vi.mocked(api.bank).mockResolvedValue(bank)
})

test('lists every concept with its active count, linking to it', async () => {
  renderBank('/courses/1/bank/6')
  const row = await screen.findByRole('link', { name: /TCP handshake/ })
  expect(row).toHaveAttribute('href', '/courses/1/bank/5')
  expect(row.querySelector('.count')).toHaveTextContent('1')
  expect(screen.getByRole('link', { name: /Sockets/ })).toHaveAttribute('href', '/courses/1/bank/6')
  expect(screen.getByText('2 concepts')).toBeInTheDocument()
})

test('the bank on its own opens the first concept, and the list marks it', async () => {
  renderBank('/courses/1/bank')
  expect(await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /TCP handshake/ })).toHaveClass('is-current')
  expect(screen.getByRole('link', { name: /Sockets/ })).not.toHaveClass('is-current')
})

test('picking a concept in the list opens it on the right', async () => {
  renderBank('/courses/1/bank')
  await userEvent.click(await screen.findByRole('link', { name: /Sockets/ }))
  expect(await screen.findByRole('heading', { level: 2, name: 'Sockets' })).toBeInTheDocument()
  expect(screen.getByText('What does bind do?')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Sockets/ })).toHaveClass('is-current')
})

test('an empty bank says what to do next', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([])
  renderBank('/courses/1/bank')
  expect(await screen.findByText(/No concepts yet/)).toBeInTheDocument()
  expect(screen.getByText('0 concepts')).toBeInTheDocument()
})

test('a failed bank load shows the alert', async () => {
  vi.mocked(api.bank).mockRejectedValueOnce(new Error('500 /api/courses/1/bank'))
  renderBank('/courses/1/bank')
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/courses/1/bank')
})

test('the upload control sits in the course head and refreshes the bank and the counts', async () => {
  vi.mocked(api.upload).mockResolvedValueOnce({ id: 2, filename: 'week1.pdf', status: 'INGESTED', errorMessage: null })
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  const overviewCalls = vi.mocked(api.overview).mock.calls.length
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  expect(input.closest('label')).toHaveTextContent('Upload a lecture PDF')
  await userEvent.upload(input, new File(['%PDF-1.4'], 'week1.pdf', { type: 'application/pdf' }))
  await waitFor(() => expect(api.upload).toHaveBeenCalledWith(1, expect.any(File)))
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
  await waitFor(() => expect(vi.mocked(api.overview).mock.calls.length).toBe(overviewCalls + 1))
})

test('shows a failed ingest in the alert and refreshes the bank', async () => {
  vi.mocked(api.upload).mockResolvedValueOnce({ id: 2, filename: 'week1.pdf', status: 'FAILED', errorMessage: 'boom' })
  const { container } = renderBank('/courses/1/bank')
  await screen.findByRole('link', { name: /TCP handshake/ })
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  await userEvent.upload(input, new File(['%PDF-1.4'], 'week1.pdf', { type: 'application/pdf' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
})
```

Create `frontend/src/pages/BankConceptPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { api, type ConceptWithQuestions, type Question } from '../api'
import { renderBank } from '../test/render'

const course = { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 1, questions: 2, dueToday: 1 }

function question(over: Partial<Question>): Question {
  return {
    id: 9, type: 'MC', prompt: 'Steps?', optionsJson: '["1","2","3","4"]', correctIndex: 2, sourcePages: '3',
    status: 'ACTIVE', labelAnswerable: null, labelCorrectAnswer: null, labelUnambiguous: null, ...over,
  }
}

function concept(questions: Question[]): ConceptWithQuestions[] {
  return [{ id: 5, name: 'TCP handshake', summary: 'SYN/SYN-ACK/ACK', sourcePages: '3,4', questions }]
}

vi.mock('../api', () => ({
  api: {
    overview: vi.fn(),
    bank: vi.fn(),
    upload: vi.fn(),
    retire: vi.fn(),
    restore: vi.fn(),
    label: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.overview).mockResolvedValue([course])
  vi.mocked(api.bank).mockResolvedValue(concept([question({})]))
  vi.mocked(api.retire).mockResolvedValue(undefined)
  vi.mocked(api.restore).mockResolvedValue(undefined)
  vi.mocked(api.label).mockResolvedValue(undefined)
})

const at = () => renderBank('/courses/1/bank/5')

test('renders the concept with its summary, pages, counts and question cards', async () => {
  at()
  expect(await screen.findByRole('heading', { level: 2, name: 'TCP handshake' })).toBeInTheDocument()
  expect(screen.getByText('SYN/SYN-ACK/ACK')).toBeInTheDocument()
  expect(screen.getByText('pp. 3,4')).toBeInTheDocument()
  expect(screen.getByText('1 question')).toBeInTheDocument()
  expect(screen.getByText('Steps?')).toBeInTheDocument()
  expect(screen.getByText('Multiple choice')).toBeInTheDocument()
  expect(screen.getByText('pp. 3')).toBeInTheDocument()
})

test('a concept and a question with no pages render no citation', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce([{
    id: 5, name: 'Sockets', summary: 'bind/listen/accept', sourcePages: null,
    questions: [question({ id: 11, type: 'SHORT_ANSWER', prompt: 'What does bind do?', optionsJson: null, correctIndex: null, sourcePages: null })],
  }])
  at()
  await screen.findByRole('heading', { level: 2, name: 'Sockets' })
  expect(screen.queryByText(/pp\./)).not.toBeInTheDocument()
})

test('an unknown concept is a not-found state beside the list', async () => {
  renderBank('/courses/1/bank/99')
  expect(await screen.findByRole('alert')).toHaveTextContent('No concept has id 99.')
  expect(screen.getByRole('link', { name: /TCP handshake/ })).toBeInTheDocument()
})

test('one click on Retire arms the card instead of retiring it', async () => {
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  expect(api.retire).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  await waitFor(() => expect(api.retire).toHaveBeenLastCalledWith(9))
})

test('Cancel disarms the card and retires nothing', async () => {
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Confirm retire' })).not.toBeInTheDocument()
  expect(api.retire).not.toHaveBeenCalled()
})

test('arming from the keyboard leaves focus on Cancel, so a repeated Enter disarms', async () => {
  at()
  const retire = await screen.findByRole('button', { name: 'Retire' })
  retire.focus()
  await userEvent.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  // the repeat of a held Enter goes wherever the first press left focus
  await userEvent.keyboard('{Enter}')
  expect(api.retire).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument()
})

test('arming a second card disarms the first', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({}),
    question({ id: 10, type: 'SHORT_ANSWER', prompt: 'Why three?', optionsJson: null, correctIndex: null, sourcePages: '4' }),
  ]))
  at()
  const retires = await screen.findAllByRole('button', { name: 'Retire' })
  await userEvent.click(retires[0])
  // the only Retire left on screen belongs to the card that is still disarmed
  await userEvent.click(screen.getByRole('button', { name: 'Retire' }))
  expect(screen.getAllByRole('button', { name: 'Confirm retire' })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  await waitFor(() => expect(api.retire).toHaveBeenLastCalledWith(10))
})

test('a retired question is struck, marked, and offers Restore, which reloads the bank', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({ status: 'RETIRED' })]))
  at()
  const restore = await screen.findByRole('button', { name: 'Restore' })
  expect(screen.getByText('Retired')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Answerable')).not.toBeInTheDocument()
  const bankCalls = vi.mocked(api.bank).mock.calls.length
  await userEvent.click(restore)
  await waitFor(() => expect(api.restore).toHaveBeenLastCalledWith(9))
  await waitFor(() => expect(vi.mocked(api.bank).mock.calls.length).toBe(bankCalls + 1))
})

test('Restore clears the alert an earlier failure left on screen', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({}),
    question({ id: 12, type: 'SHORT_ANSWER', prompt: 'Why three?', optionsJson: null, correctIndex: null, sourcePages: '4', status: 'RETIRED' }),
  ]))
  vi.mocked(api.retire).mockRejectedValueOnce(new Error('500 /api/questions/9/retire'))
  let land!: () => void
  vi.mocked(api.restore).mockReturnValueOnce(new Promise(resolve => { land = () => resolve(undefined) }))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/retire')
  await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
  // the stale error goes at the click, not once the restore lands
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  land()
  await waitFor(() => expect(api.restore).toHaveBeenLastCalledWith(12))
})

test('shows a failed retire in the alert', async () => {
  vi.mocked(api.retire).mockRejectedValueOnce(new Error('500 /api/questions/9/retire'))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/retire')
})

test('labels a question with the toggles as set', async () => {
  at()
  await userEvent.click(await screen.findByLabelText('Unambiguous'))
  await userEvent.click(screen.getByRole('button', { name: 'Save labels' }))
  await waitFor(() =>
    expect(api.label).toHaveBeenCalledWith(9, { answerable: true, correctAnswer: true, unambiguous: false }))
  expect(await screen.findByText('labeled')).toBeInTheDocument()
  // changing a toggle after the save means the stored labels no longer match what is shown
  await userEvent.click(screen.getByLabelText('Correct'))
  expect(screen.getByRole('button', { name: 'Save labels' })).toBeInTheDocument()
})

test('shows a failed label in the alert and leaves the question unlabelled', async () => {
  vi.mocked(api.label).mockRejectedValueOnce(new Error('500 /api/questions/9/label'))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Save labels' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('500 /api/questions/9/label')
  expect(screen.getByRole('button', { name: 'Save labels' })).toBeInTheDocument()
})

test('seeds the toggles from the labels the question arrives with', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({ labelAnswerable: true, labelCorrectAnswer: false, labelUnambiguous: true }),
  ]))
  at()
  expect(await screen.findByLabelText('Answerable')).toBeChecked()
  expect(screen.getByLabelText('Correct')).not.toBeChecked()
  expect(screen.getByLabelText('Unambiguous')).toBeChecked()
  expect(screen.getByText('labeled')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save labels' })).not.toBeInTheDocument()
})

test('re-saving a labelled question posts the stored labels with the one change, not the defaults', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([
    question({ labelAnswerable: true, labelCorrectAnswer: false, labelUnambiguous: true }),
  ]))
  at()
  await userEvent.click(await screen.findByLabelText('Unambiguous'))
  await userEvent.click(screen.getByRole('button', { name: 'Save labels' }))
  await waitFor(() =>
    expect(api.label).toHaveBeenCalledWith(9, { answerable: true, correctAnswer: false, unambiguous: false }))
})

test('cancelling puts the caret back on the card it was working', async () => {
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Retire' })).toHaveFocus()
})

test('confirming leaves the caret on the Restore that takes the card over', async () => {
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({})]))
  vi.mocked(api.bank).mockResolvedValueOnce(concept([question({ status: 'RETIRED' })]))
  at()
  await userEvent.click(await screen.findByRole('button', { name: 'Retire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm retire' }))
  const restore = await screen.findByRole('button', { name: 'Restore' })
  await waitFor(() => expect(restore).toHaveFocus())
})
```

- [ ] **Step 3: Run them to see them fail**

Run (from `frontend/`): `npx vitest run src/pages/BankPage.test.tsx src/pages/BankConceptPage.test.tsx`
Expected: FAIL. `Cannot find module '../pages/BankConceptPage'` / `'../pages/BankRoute'` from the helper.

- [ ] **Step 4: The bank route: state owner, upload control, the split**

Create `frontend/src/pages/BankRoute.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useOutletContext } from 'react-router-dom'
import { api, type ConceptWithQuestions } from '../api'
import type { CourseContext } from '../shell/CourseLayout'

export interface BankContext extends CourseContext {
  bank: ConceptWithQuestions[] | null
  reload: () => Promise<void>
  setError: (e: string | null) => void
}

export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

const row = ({ isActive }: { isActive: boolean }) => `crow${isActive ? ' is-current' : ''}`

/* Owns the bank for both panes, so picking a concept never refetches; retire, restore
   and an upload do. Draws the concept list on the left and the open concept on the
   right. The upload control lives in the course head's slot. */
export default function BankRoute() {
  const ctx = useOutletContext<CourseContext>()
  const { course, refresh, slot } = ctx
  const [bank, setBank] = useState<ConceptWithQuestions[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setBank(await api.bank(course.id))
    } catch (e) {
      setError(String(e))
    }
  }, [course.id])

  useEffect(() => {
    reload()
  }, [reload])

  async function onUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const m = await api.upload(course.id, file)
      if (m.status === 'FAILED') setError(m.errorMessage ?? 'Ingest failed')
      await reload()
      // the course head's concept and question counts just moved
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {slot && createPortal(
        <>
          <label className="btn upload">
            {/* the extension keeps a .pptx out of the default picker; the mime type alone
                does not, because the OS file dialog matches on either */}
            <input className="visually-hidden" type="file" accept=".pdf,application/pdf" disabled={uploading}
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onUpload(file)
              }} />
            {uploading ? 'Ingesting…' : 'Upload a lecture PDF'}
          </label>
          <small className="hint">PDF only</small>
        </>,
        slot,
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="split">
        <nav className="clist" aria-label="Concepts">
          <p className="clist-head">{bank ? plural(bank.length, 'concept') : 'Loading…'}</p>
          {bank?.map(c => (
            <NavLink key={c.id} className={row} to={String(c.id)}>
              <span className="crow-name">{c.name}</span>
              <span className="count">{c.questions.filter(q => q.status === 'ACTIVE').length}</span>
            </NavLink>
          ))}
        </nav>
        <section className="detail">
          <Outlet context={{ ...ctx, bank, reload, setError } satisfies BankContext} />
        </section>
      </div>
    </>
  )
}
```

- [ ] **Step 5: The bank's index: first concept, or the empty state**

Replace `frontend/src/pages/BankPage.tsx`:

```tsx
import { Navigate, useOutletContext } from 'react-router-dom'
import type { BankContext } from './BankRoute'

/* /bank on its own: open the first concept, or say what to do when there is none yet */
export default function BankPage() {
  const { bank } = useOutletContext<BankContext>()
  if (!bank) return <p className="empty">Loading…</p>
  if (bank.length === 0) {
    return (
      <div className="bank-empty">
        <p className="empty">No concepts yet. Upload a lecture PDF to build the bank.</p>
      </div>
    )
  }
  return <Navigate to={String(bank[0].id)} replace />
}
```

- [ ] **Step 6: The right pane: one concept's question cards**

Create `frontend/src/pages/BankConceptPage.tsx`:

```tsx
import { useLayoutEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { api, type ConceptWithQuestions, type Question } from '../api'
import { plural, type BankContext } from './BankRoute'

interface LabelBody { answerable: boolean; correctAnswer: boolean; unambiguous: boolean }

const labelled = (q: Question) =>
  q.labelAnswerable != null || q.labelCorrectAnswer != null || q.labelUnambiguous != null

export default function BankConceptPage() {
  const { conceptId } = useParams()
  const { bank, reload, setError } = useOutletContext<BankContext>()
  if (!bank) return <p className="empty">Loading…</p>
  const concept = bank.find(c => c.id === Number(conceptId))
  // the list is right there, so a bad id needs no way back, only the word
  if (!concept) return <p className="alert" role="alert">No concept has id {conceptId}.</p>
  // keyed, so the arming and the focus bookkeeping start over when the concept changes
  return <ConceptCards key={concept.id} concept={concept} reload={reload} setError={setError} />
}

function ConceptCards({ concept, reload, setError }: {
  concept: ConceptWithQuestions
  reload: () => Promise<void>
  setError: (e: string | null) => void
}) {
  // the question whose retire is armed, or null. one at a time, so arming a card takes
  // the arming away from whichever card held it and only one confirm is ever on screen
  const [armed, setArmed] = useState<number | null>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  // the danger cell's button per question, so the caret can be put back on the card it
  // was working when confirm, cancel or restore unmounts the control it was sitting on
  const dangerButtons = useRef(new Map<number, HTMLButtonElement | null>())
  // a ref, not state: this is a one-shot command to the DOM after the next render
  const pendingFocus = useRef<number | null>(null)

  // an armed card holds focus on Cancel rather than on the confirm that took Retire's
  // place, so the repeat of a held Enter, or a stuttered second press, disarms the card
  useLayoutEffect(() => {
    if (armed != null) cancelButton.current?.focus()
  }, [armed])

  // runs after whichever render the handler queued, so the caret lands on whatever the
  // cell now holds rather than on document.body
  useLayoutEffect(() => {
    const id = pendingFocus.current
    if (id == null) return
    pendingFocus.current = null
    dangerButtons.current.get(id)?.focus()
  })

  async function onRetire(qid: number) {
    // disarming first means a second click of an accidental double lands on Cancel, which
    // takes over the pixels Retire gave up at the card's right edge
    setArmed(null)
    setError(null)
    try {
      await api.retire(qid)
      await reload()
      pendingFocus.current = qid
    } catch (e) {
      setError(String(e))
    }
  }

  async function onRestore(qid: number) {
    setError(null)
    try {
      await api.restore(qid)
      await reload()
      pendingFocus.current = qid
    } catch (e) {
      setError(String(e))
    }
  }

  async function onLabel(qid: number, body: LabelBody) {
    setError(null)
    try {
      await api.label(qid, body)
      return true
    } catch (e) {
      setError(String(e))
      return false
    }
  }

  const active = concept.questions.filter(q => q.status === 'ACTIVE').length
  const retired = concept.questions.length - active

  return (
    <div className="concept">
      <div className="concept-top">
        <div className="chips">
          {concept.sourcePages && <span className="chip chip--mono">pp. {concept.sourcePages}</span>}
          <span className="count">{plural(active, 'question')}{retired > 0 && ` · ${retired} retired`}</span>
        </div>
        <h2>{concept.name}</h2>
        <p className="concept-summary">{concept.summary}</p>
      </div>
      <ul className="qcards">
        {concept.questions.map(q => (
          <li className={q.status === 'RETIRED' ? 'qcard qcard--retired' : 'qcard'} key={q.id}>
            <div className="chips">
              <span className="chip">{q.type === 'MC' ? 'Multiple choice' : 'Short answer'}</span>
              {q.sourcePages && <span className="chip chip--mono">pp. {q.sourcePages}</span>}
              {q.status === 'RETIRED' && <span className="chip chip--flag">Retired</span>}
            </div>
            <p className="qcard-prompt">{q.prompt}</p>
            <div className="qcard-foot">
              {q.status === 'RETIRED' ? (
                <>
                  <span className="count">{labelled(q) ? 'labeled' : 'not labeled'}</span>
                  <button key="restore" ref={el => { dangerButtons.current.set(q.id, el) }}
                    className="btn btn--secondary btn--micro" onClick={() => onRestore(q.id)}>Restore</button>
                </>
              ) : (
                <>
                  {/* keyed on the saved labels so a refreshed bank re-seeds the toggles */}
                  <LabelControl key={`${q.labelAnswerable}/${q.labelCorrectAnswer}/${q.labelUnambiguous}`}
                    question={q} onSave={onLabel} />
                  <div className="qcard-danger">
                    {armed === q.id ? (
                      <>
                        {/* keyed apart from Retire and Restore: an unkeyed fragment reconciles
                            child-for-child by position, so confirm would inherit Retire's host
                            node and the focus sitting on it, and a held Enter would retire */}
                        <button key="confirm" className="btn btn--danger btn--micro"
                          onClick={() => onRetire(q.id)}>Confirm retire</button>
                        {/* Cancel goes last: it sits on the pixels Retire just gave up, so the
                            second click of an accidental double cancels rather than confirms */}
                        <button key="cancel" ref={cancelButton} className="btn btn--secondary btn--micro"
                          onClick={() => { setArmed(null); pendingFocus.current = q.id }}>Cancel</button>
                      </>
                    ) : (
                      <button key="retire" ref={el => { dangerButtons.current.set(q.id, el) }}
                        className="ghost-danger" onClick={() => setArmed(q.id)}>Retire</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Toggle({ label, checked, disabled, onChange }: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="toggle">
      <input className="visually-hidden" type="checkbox" checked={checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)} />
      <svg className="toggle-check" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
        strokeWidth="2" aria-hidden="true"><path d="m2.5 7.5 3 3 6-6.5" /></svg>
      {label}
    </label>
  )
}

function LabelControl({ question, onSave }: {
  question: Question
  onSave: (qid: number, body: LabelBody) => Promise<boolean>
}) {
  // an unlabelled question comes back with all three null: default those to checked, but never
  // default over a stored false, or re-saving would overwrite the label the eval report counts
  const [answerable, setAnswerable] = useState(question.labelAnswerable ?? true)
  const [correctAnswer, setCorrectAnswer] = useState(question.labelCorrectAnswer ?? true)
  const [unambiguous, setUnambiguous] = useState(question.labelUnambiguous ?? true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(labelled(question))

  return (
    <div className="qcard-labels">
      <Toggle label="Answerable" checked={answerable} disabled={saving}
        onChange={v => { setAnswerable(v); setSaved(false) }} />
      <Toggle label="Correct" checked={correctAnswer} disabled={saving}
        onChange={v => { setCorrectAnswer(v); setSaved(false) }} />
      <Toggle label="Unambiguous" checked={unambiguous} disabled={saving}
        onChange={v => { setUnambiguous(v); setSaved(false) }} />
      {saved ? (
        <span className="count">labeled</span>
      ) : (
        <button className="btn btn--secondary btn--micro" disabled={saving} onClick={async () => {
          setSaving(true)
          const ok = await onSave(question.id, { answerable, correctAnswer, unambiguous })
          setSaving(false)
          setSaved(ok)
        }}>Save labels</button>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Bank styles, the import, the routes**

Create `frontend/src/styles/bank.css`:

```css
/* the bank: the concept list on the left, the open concept on the right */
.split {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}

.clist {
  position: sticky;
  top: 22px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 44px);
  padding: 10px;
  overflow-y: auto;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.clist-head {
  padding: 10px 14px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

/* a concept row: the name and how many questions it can still ask */
.crow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 10px 14px;
  border-radius: 10px;
  color: var(--ink);
  font-size: 16px;
  font-weight: 500;
  text-decoration: none;
  transition:
    background-color var(--motion) var(--ease),
    color var(--motion) var(--ease);
}

.crow:hover {
  background: var(--sunken);
  color: var(--ink);
  text-decoration: none;
}

.crow.is-current {
  background: var(--ink-fill);
  color: oklch(99% 0 0);
}

.crow.is-current .count {
  color: oklch(85% 0.01 250);
}

.crow-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.detail {
  min-width: 0;
}

.bank-empty {
  padding: 40px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

/* the upload control is a primary pill wrapping the real file input */
.upload:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.upload:has(input:disabled) {
  cursor: not-allowed;
  border-color: var(--line);
  background: var(--sunken);
  color: var(--ink-dim);
}

.concept {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.concept-top {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.concept-summary {
  max-width: 70ch;
  font-size: 17px;
  line-height: 1.5;
  color: var(--ink-soft);
}

.qcards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.qcard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 26px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.qcard-prompt {
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.01em;
}

.qcard-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.qcard-labels {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

/* the only destructive control on the card, pinned to its right edge */
.qcard-danger {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}

.ghost-danger {
  padding: 6px 0;
  border: 0;
  background: none;
  font-size: 14px;
  font-weight: 600;
  color: var(--flag);
  cursor: pointer;
}

.ghost-danger:hover {
  text-decoration: underline;
}

/* a retired question is de-emphasised by ground, by ink, and by a rule through the
   prompt, never by colour alone */
.qcard--retired {
  background: var(--sunken);
}

.qcard--retired .qcard-prompt {
  color: var(--ink-dim);
  text-decoration: line-through;
  text-decoration-color: var(--line-dashed);
}

@media (max-width: 720px) {
  .split {
    grid-template-columns: minmax(0, 1fr);
  }

  .clist {
    position: static;
    max-height: none;
  }
}
```

In `frontend/src/index.css` add `@import './styles/bank.css';` after the `study.css` line.

In `frontend/src/App.tsx` add the imports

```tsx
import BankConceptPage from './pages/BankConceptPage'
import BankRoute from './pages/BankRoute'
```

and replace the `bank` route line with:

```tsx
            <Route path="bank" element={<BankRoute />}>
              <Route index element={<BankPage />} />
              <Route path=":conceptId" element={<BankConceptPage />} />
            </Route>
```

- [ ] **Step 8: Run the bank tests, then everything**

Run (from `frontend/`): `npx vitest run src/pages/BankPage.test.tsx src/pages/BankConceptPage.test.tsx`
Expected: PASS, 7 + 16 tests.

Run: `npm test`, `npm run build`, `npm run lint`: all clean. Open http://localhost:5173/courses/2/bank: the list on the left with the first concept filled dark, its cards on the right, the upload pill in the head; click another row: the right pane follows, the URL carries the concept id. Tab to a Retire, Enter, Enter: still not retired, focus on Cancel.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/BankRoute.tsx frontend/src/pages/BankPage.tsx frontend/src/pages/BankConceptPage.tsx frontend/src/pages/BankPage.test.tsx frontend/src/pages/BankConceptPage.test.tsx frontend/src/test/render.tsx frontend/src/styles/bank.css frontend/src/index.css frontend/src/App.tsx
git commit -m "feat: the bank is a split view, concept list beside one concept's question cards"
```

---

### Task 6: Dashboard

**Files:**
- Rewrite: `frontend/src/pages/DashboardPage.tsx`
- Rewrite: `frontend/src/pages/DashboardPage.test.tsx`
- Create: `frontend/src/styles/dashboard.css`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `CourseContext.course` (Task 3) for the three figures, `api.dashboard` unchanged, `renderInCourse` (Task 4).

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/pages/DashboardPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { api } from '../api'
import { renderInCourse } from '../test/render'
import DashboardPage from './DashboardPage'

vi.mock('../api', () => ({
  api: {
    overview: vi.fn().mockResolvedValue([
      { id: 1, name: 'CS 158A', term: 'Fall 2026', concepts: 39, questions: 139, dueToday: 2 },
    ]),
    dashboard: vi.fn().mockResolvedValue({
      dueToday: 2,
      concepts: [
        { conceptId: 5, name: 'TCP', streak: 1, attempts: 4, correct: 3, dueDate: '2026-09-04', neverAttempted: false },
        { conceptId: 6, name: 'UDP', streak: 0, attempts: 0, correct: 0, dueDate: '2026-09-05', neverAttempted: true },
      ],
    }),
  },
}))

const figure = (label: string) => screen.getByText(label).closest('li')!

test('renders the three figures from the course and the concept rows', async () => {
  renderInCourse(<DashboardPage />, 'dashboard')
  await waitFor(() => expect(screen.getByText('TCP')).toBeInTheDocument())
  expect(figure('due today')).toHaveTextContent('2')
  expect(figure('concepts')).toHaveTextContent('39')
  expect(figure('questions')).toHaveTextContent('139')
  expect(screen.getByText('3/4')).toBeInTheDocument()
  expect(screen.getByText('UDP').closest('tr')).toHaveClass('is-new')
  expect(screen.getByText('(new)')).toBeInTheDocument()
})

test('an empty schedule says so inside the card', async () => {
  vi.mocked(api.dashboard).mockResolvedValueOnce({ dueToday: 0, concepts: [] })
  renderInCourse(<DashboardPage />, 'dashboard')
  expect(await screen.findByText('No concepts yet.')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('shows an alert when the dashboard load fails', async () => {
  vi.mocked(api.dashboard).mockRejectedValueOnce(new Error('500 /api/dashboard'))
  renderInCourse(<DashboardPage />, 'dashboard')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('500 /api/dashboard'))
})
```

- [ ] **Step 2: Run them to see them fail**

Run (from `frontend/`): `npx vitest run src/pages/DashboardPage.test.tsx`
Expected: FAIL (the old page calls `api.courses`, which is not mocked; no figures).

- [ ] **Step 3: Rewrite the page**

Replace `frontend/src/pages/DashboardPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, type Dashboard } from '../api'
import type { CourseContext } from '../shell/CourseLayout'

export default function DashboardPage() {
  const { course } = useOutletContext<CourseContext>()
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.dashboard(course.id).then(setDash).catch(e => setError(String(e)))
  }, [course.id])

  return (
    <div className="dashboard">
      <ul className="figures">
        <li className="figure-tile"><b>{course.dueToday}</b><span>due today</span></li>
        <li className="figure-tile"><b>{course.concepts}</b><span>concepts</span></li>
        <li className="figure-tile"><b>{course.questions}</b><span>questions</span></li>
      </ul>
      {error && <p className="alert" role="alert">{error}</p>}
      {dash && dash.concepts.length === 0 && (
        <div className="ledger-card">
          <p className="empty">No concepts yet.</p>
        </div>
      )}
      {dash && dash.concepts.length > 0 && (
        <div className="ledger-card">
          <table className="ledger">
            <thead><tr><th>Concept</th><th>Streak</th><th>Correct</th><th>Due</th></tr></thead>
            <tbody>
              {dash.concepts.map(c => (
                <tr key={c.conceptId} className={c.neverAttempted ? 'is-new' : undefined}>
                  <td>{c.name}{c.neverAttempted && <span className="row-mark"> (new)</span>}</td>
                  <td className="num">{c.streak}</td>
                  <td className="num">{c.correct}/{c.attempts}</td>
                  <td className="num">{c.dueDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Dashboard styles and the import**

Create `frontend/src/styles/dashboard.css`:

```css
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.ledger-card {
  overflow: hidden;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.ledger-card .empty {
  padding: 24px;
}

.ledger {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.ledger th {
  height: 44px;
  padding-inline: 18px;
  text-align: left;
  background: var(--sunken);
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.ledger td {
  height: 48px;
  padding: 8px 18px;
  vertical-align: middle;
  border-bottom: 1px solid var(--line);
  font-size: 15px;
  line-height: 1.4;
}

.ledger tbody tr:last-child td {
  border-bottom: 0;
}

.ledger tbody tr:hover {
  background: var(--sunken);
}

.ledger .num {
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--ink-soft);
}

.ledger th:nth-child(1) {
  width: 46%;
}

.ledger th:nth-child(2) {
  width: 14%;
}

.ledger th:nth-child(3) {
  width: 16%;
}

/* a concept nobody has attempted: weight plus the word the row already carries */
.ledger tr.is-new td {
  font-weight: 600;
}

.row-mark {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent-strong);
}

@media (max-width: 720px) {
  .ledger-card {
    overflow-x: auto;
  }

  .ledger {
    min-width: 40rem;
  }
}
```

In `frontend/src/index.css` add `@import './styles/dashboard.css';` after the `bank.css` line.

- [ ] **Step 5: Run the dashboard tests, then everything**

Run (from `frontend/`): `npx vitest run src/pages/DashboardPage.test.tsx` → PASS, 3 tests. Then `npm test`, `npm run build`, `npm run lint`. Open http://localhost:5173/courses/2/dashboard: three figure tiles, the ledger in a card.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.test.tsx frontend/src/styles/dashboard.css frontend/src/index.css
git commit -m "feat: dashboard figures in tiles and the ledger in a card"
```

---

### Task 7: Evaluation page

**Files:**
- Rewrite: `frontend/src/pages/EvalPage.tsx`
- Modify: `frontend/src/pages/EvalPage.test.tsx` (add two tests, keep the five)
- Create: `frontend/src/styles/eval.css`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `api.evalReport` unchanged; `.figures .figure-tile .figure-tile--flag .figure-n .page .page-head .lede` (Task 2).

- [ ] **Step 1: Add the failing tests**

Append to `frontend/src/pages/EvalPage.test.tsx`:

```tsx
test('the grader tile carries its n and is flagged while the sample is under thirty', async () => {
  render(<EvalPage />)
  const tile = (await screen.findByText('Grader agreement')).closest('li')!
  expect(tile).toHaveClass('figure-tile--flag')
  expect(tile).toHaveTextContent('n=20')
  expect(screen.getByText(/The flag stays until there are 30/)).toBeInTheDocument()
})

test('at thirty graded answers the flag comes off', async () => {
  vi.mocked(api.evalReport).mockResolvedValueOnce({
    labeled: 40, pctAnswerable: 0.95, pctCorrectAnswer: 0.9, pctUnambiguous: 0.85,
    gradedShortAnswers: 30, graderAgreement: 0.9,
  })
  render(<EvalPage />)
  const tile = (await screen.findByText('Grader agreement')).closest('li')!
  expect(tile).not.toHaveClass('figure-tile--flag')
  expect(tile).toHaveTextContent('n=30')
  expect(screen.queryByText(/The flag stays/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to see the two new tests fail**

Run (from `frontend/`): `npx vitest run src/pages/EvalPage.test.tsx`
Expected: 5 pass, 2 fail (`Unable to find an element with the text: Grader agreement`).

- [ ] **Step 3: Rewrite the page**

Replace `frontend/src/pages/EvalPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { api, type EvalReport } from '../api'

/* under this many graded short answers, the agreement figure wears the flag */
const REAL_SAMPLE = 30

export default function EvalPage() {
  const [report, setReport] = useState<EvalReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.evalReport().then(setReport).catch(e => setError(String(e)))
  }, [])

  const pct = (x: number) => `${Math.round(x * 100)}%`
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

  return (
    <div className="page">
      <header className="page-head">
        <h1>Evaluation</h1>
      </header>
      {error && <p className="alert" role="alert">{error}</p>}
      {!report && !error && <p className="empty">Loading…</p>}
      {report && (
        <div className="eval-panel">
          {/* the backend reports 0.0 rates for "nothing labeled" too, and 0% would read as
              "no question is answerable" rather than "no question has been judged yet" */}
          {report.labeled === 0
            ? <p className="empty">No labeled questions yet.</p>
            : <p className="lede">{count(report.labeled, 'labeled question')}</p>}
          <ul className="figures">
            {report.labeled > 0 && (
              <>
                <li className="figure-tile"><b>{pct(report.pctAnswerable)}</b><span>Answerable from source</span></li>
                <li className="figure-tile"><b>{pct(report.pctCorrectAnswer)}</b><span>Correct answer</span></li>
                <li className="figure-tile"><b>{pct(report.pctUnambiguous)}</b><span>Unambiguous</span></li>
              </>
            )}
            {report.gradedShortAnswers > 0 && (
              <li className={`figure-tile${report.gradedShortAnswers < REAL_SAMPLE ? ' figure-tile--flag' : ''}`}>
                <b>{pct(report.graderAgreement)}<span className="figure-n">n={report.gradedShortAnswers}</span></b>
                <span>Grader agreement</span>
              </li>
            )}
          </ul>
          {/* the backend reports 0.0 agreement for "nothing graded" too, and 0% would read as total disagreement */}
          {report.gradedShortAnswers === 0
            ? <p className="empty">No graded short answers yet.</p>
            : <p className="eval-line">{count(report.gradedShortAnswers, 'graded short answer')}, {pct(report.graderAgreement)} grader agreement</p>}
          {report.gradedShortAnswers > 0 && report.gradedShortAnswers < REAL_SAMPLE && (
            <p className="caveat">
              The grader agreement covers only {count(report.gradedShortAnswers, 'graded short answer')}.
              The flag stays until there are {REAL_SAMPLE}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Eval styles and the import**

Create `frontend/src/styles/eval.css`:

```css
/* the landing page's evaluation panel, in the app */
.eval-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: clamp(28px, 4vw, 44px) clamp(24px, 4vw, 48px);
  background: var(--sunken);
  border-radius: var(--radius-panel);
}

.eval-line {
  font-size: 15px;
  color: var(--ink-soft);
}

.caveat {
  max-width: 74ch;
  font-size: 15px;
  color: var(--ink-dim);
}
```

In `frontend/src/index.css` add `@import './styles/eval.css';` after the `dashboard.css` line.

- [ ] **Step 5: Run the eval tests, then everything**

Run (from `frontend/`): `npx vitest run src/pages/EvalPage.test.tsx` → PASS, 7 tests. Then `npm test`, `npm run build`, `npm run lint`. Open http://localhost:5173/eval: the sunken panel, four tiles, the grader tile flagged with `n=1`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/EvalPage.tsx frontend/src/pages/EvalPage.test.tsx frontend/src/styles/eval.css frontend/src/index.css
git commit -m "feat: the evaluation page is the landing page's figure panel, with n on the grader tile"
```

---

### Task 8: Remove the old language, tidy the API client, update the READMEs

**Files:**
- Delete: `frontend/src/styles/surfaces.css`
- Modify: `frontend/src/index.css`, `frontend/src/styles/typeFloor.test.ts`
- Modify: `frontend/src/api.ts` (remove `courses` if nothing uses it), `frontend/src/api.test.ts` if it tests `courses`
- Modify: `frontend/src/App.test.tsx` (drop the `courses`, `next`, `bank`, `dashboard` mock entries the old pages needed)
- Modify: `README.md`, `frontend/README.md`

- [ ] **Step 1: Delete the old stylesheet and its exclusions**

```bash
git rm frontend/src/styles/surfaces.css
```

Remove the `@import './styles/surfaces.css';` line from `frontend/src/index.css`. In `frontend/src/styles/typeFloor.test.ts` change both filters back to `readdirSync(here).filter(f => f.endsWith('.css'))` and delete the `surfaces.css is the old language` comment.

- [ ] **Step 2: Find what still uses the old class names and the old API call**

Run (from `frontend/`):

```bash
grep -rn "className=\"select\|page-title\|toolbar\|strip\|rail\|qrow\|qtype\|qlist\|concept-head\|due-line\|file-input\|course-form" src --include=*.tsx
grep -rn "api\.courses\b\|courses:" src --include=*.ts --include=*.tsx
```

Expected: no class hits. For `api.courses`: hits only in `api.ts` (the definition) and mocks in test files. Remove the `courses:` line from the `api` object in `api.ts` and from every `vi.mock` block that still lists it (`App.test.tsx`). If `api.test.ts` exercises `api.courses`, point that test at `api.overview` with the same assertion shape. Also drop the now-unused `next`, `bank` and `dashboard` mock entries from `App.test.tsx`.

- [ ] **Step 3: READMEs**

In `README.md`, replace the paragraph that starts `- Four pages: Bank (upload a PDF, ...` with:

```markdown
- Home is a grid of course tiles, one per class, each showing what is due today and how
  much is in the bank. Inside a course there are three tabs: Study (answer, override a
  verdict, self-grade a PENDING one), Bank (upload a PDF, open a concept, label its
  questions, retire bad ones behind a confirm step and restore them when I misclick), and
  Dashboard (how many concepts are due, and per concept the streak, the correct-out-of-
  attempted count and the next due date). Eval (the report below) is global.
```

In `frontend/README.md`, replace the first paragraph with:

```markdown
The React and TypeScript client. A home of course tiles, three tabs inside a course
(Study, Bank, Dashboard) and a global Evaluation page. Vite serves it and proxies `/api`
to the backend on port 8080, so I have to have the backend and Postgres running before
anything loads.
```

- [ ] **Step 4: Everything, both sides**

Run (from `frontend/`): `npm test`, `npm run build`, `npm run lint`. Run (from the repo root): `mvn -q -f backend/pom.xml test`. All clean.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src README.md frontend/README.md
git commit -m "refactor: drop the old stylesheet and the course list call nothing reads"
```

---

### Task 9: Live acceptance, screenshots, landing page captions, PR (controller-run)

This task needs the browser tools and Bryan's data, so the session controller runs it rather than a subagent.

**Files:**
- Replace: `docs/screenshots/bank.jpg`, `docs/screenshots/dashboard.jpg`, `docs/screenshots/eval.jpg`
- Create: `docs/screenshots/courses.jpg`
- Modify: `README.md` (image captions and alt text; add the courses screenshot at the top), `site/index.html` (alt text of the hero image and the two gallery figures; the hero image becomes `screenshots/courses.jpg`)

- [ ] **Step 1: Walk every route in Chrome against the running app**

`/`, `/courses/2/study`, `/courses/2/bank` (lands on the first concept), `/courses/2/bank/<another concept id>`, `/courses/2/dashboard`, `/eval`, `/courses/99/study` (not found), `/study` (redirect), `/courses/2` (redirect). Hover a course tile and an option: the glow. Keyboard through a concept: Tab to Retire, Enter, Enter (still there, Cancel focused), Escape does nothing, click Cancel. Answer one MC question on `/courses/2/study` (the figure drops by one). Upload an already-ingested PDF from `Downloads/` (hash hit: the bank is unchanged, no spend). Create a course `ZZ test` / `Fall 2026` from the home tile, confirm it lands on its empty bank, then delete it: `psql -U studyos -d studyos -c "delete from course where name = 'ZZ test'"`.

- [ ] **Step 2: Screenshots at 1400x850**

Playwright MCP `browser_take_screenshot` with `type: "jpeg"`, `filename` set to each path: `courses.jpg` at `/`, `bank.jpg` at `/courses/2/bank/<concept>` (the list beside the cards), `dashboard.jpg` at `/courses/2/dashboard`, `eval.jpg` at `/eval`. Downsample to under 300 KB each if larger (`magick in.jpg -quality 82 out.jpg`).

- [ ] **Step 3: Captions and alt text**

README: the first image becomes `courses.jpg` with alt `The Study OS home: one tile per course with its due-today count and the size of its bank` and the caption `Home. Each class is a tile; the number is what the schedule wants from me today.` The bank image's alt and caption describe the concept list beside the open concept's question cards, the pill-toggle labels and the retire link. Landing page (`site/index.html`): the hero `<img>` becomes `screenshots/courses.jpg` with the same alt; the `og:image` stays `bank.jpg`; the gallery figcaptions for dashboard and eval are re-read against the new pictures and corrected where they no longer match.

- [ ] **Step 4: Full verification, push, PR**

From `frontend/`: `npm test`, `npm run build`, `npm run lint`. From the root: `mvn -q -f backend/pom.xml verify`. Then:

```bash
git add docs/screenshots README.md site/index.html
git commit -m "docs: screenshots and captions for the restyled app"
git push -u origin ui-landing
gh pr create --title "Restyle on the landing page, Canvas-style course tiles" --body-file .superpowers/sdd/ui-landing-pr.md
```

The PR body (`.superpowers/sdd/ui-landing-pr.md`, written by the controller) lists: what changed per surface, the one new endpoint, the test counts before and after, the twenty-item banned-list check, and the four screenshots. Wait for CI (three jobs) to go green; Pages redeploys on merge because `site/` and `docs/screenshots/` changed.

---

## Self-review

**Spec coverage.** Tokens, type, shape, controls, motion → Task 2. Routes and redirects → Task 3 (App) and the not-found states in Tasks 3 (course) and 5 (concept). Nav pill and readout → Task 3. Home hero, tiles, washes, glow, new-course tile → Task 3. Course shell, eyebrow, tabs, slot → Task 3. Study figure, bar, card, options, verdict bands, PENDING, empty state, refresh after every verdict → Task 4. Bank split view (list, first-concept redirect, empty state), upload in the slot, concept pane, toggles, retire arming, restore, focus hand-back, label seeding → Task 5. Dashboard figures and ledger card → Task 6. Eval panel, `n=`, flag under 30 → Task 7. Backend endpoint, count queries, WebMvcTest, JPA case → Task 1. Fonts, favicon, floor test → Task 2. Screenshots, captions, Pages → Task 9. Out-of-scope items are not touched anywhere.

**Placeholders.** None: every code step carries its full content; the only prose-only steps are Task 9's browser walk and Task 8's grep, which name their exact commands.

**Type consistency.** `CourseOverview` (Task 3 api.ts) matches the Java record field for field. `CourseContext { course, refresh, slot }` is defined in Task 3 and read identically in Tasks 4, 5, 6. `BankContext` extends it in Task 5 and is read by `BankPage` and `BankConceptPage`. `renderInCourse(page, tab, courseId)` (Task 4) is used by Tasks 4 and 6; `renderBank(path)` (Task 5) by Task 5. Copy pinned by tests (`Next question`, `Correct`, `Retire`, `Confirm retire`, `Cancel`, `Restore`, `Save labels`, `labeled`, `Upload a lecture PDF`, `Open the bank`, `left today`, `No course has id`, `No concept has id`) matches the components that render it.

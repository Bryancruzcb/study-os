# DESIGN.md: Study OS

## The look in one sentence
Study path: warm off-white paper, a serif headline that answers "what do I do today", one green pill that starts the work, and the course's lectures as a dotted path with a bold icon on each, with one playful moment (the "Pick up here" bubble).

## References
- Brilliant, course list (`brilliant-courses`): every item gets its own bold icon chip and a one-line status, so lectures are easy to tell apart.
- Brilliant, landing hero (`brilliant2-hero`): serif headline on warm off-white, a green pill button, real product UI beside it.
- Brilliant, Koji task (`brilliant-koji`): the task in a friendly white card on a soft peach panel ("Work on these next").
- Khan Academy classroom (`khan-classroom`): progress as a dotted path with nodes (the lecture path).
- Duolingo: the one playful moment per screen, the green "Pick up here" bubble on the current node.

The approved mockup is direction A of the 2026-10 makeover preview. The code lives in `frontend/src`; tokens are in `frontend/src/styles/tokens.css` and every other stylesheet uses them (`tokens.test.ts` fails on a raw colour anywhere else).

## Colors
| Token | Light | Dark | Used for |
|---|---|---|---|
| background (`--page`) | #F6F3EC | #171613 | page background |
| surface (`--card`) | #FFFFFF | #22201C | cards, the top bar's current pill, inputs |
| sunken (`--sunken`) | #EFEBE1 | #2A2823 | tab track, chips, skeletons |
| panel (`--panel`) | #FBE6D8 | #3B2A20 | the peach panel behind "Work on these next" |
| text (`--ink`) | #1C1B18 | #F3EFE6 | body text, headings |
| text-muted (`--ink-soft` / `--ink-dim`) | #46423A / #5B574D | #D6D0C3 / #B5AE9F | secondary text, labels |
| border (`--line`) | #E3DDD0 | #38342C | dividers |
| primary (`--accent`) | #2DBE60, text on it #04260F | #3CCB6C, text on it #04260F | the main button, the current path node, the bubble |
| primary text (`--accent-strong`) | #17703A | #74DB97 | green that carries text (eyebrows), checkbox accent |
| link / focus ring (`--link`, `--focus`) | #1D4ED8 | #93B4FF | links, disclosure summaries, the focus outline |
| success (`--ok`) | #17703A on #DDF5E3 | #74DB97 on #173D24 | right answers, "right last time" |
| warning / danger (`--flag`) | #B23A0E on #FBE3D9 | #F7A27A on #3A2219 | wrong answers, "to work on", errors, delete |
| info | uses `--link` | uses `--link` | neutral notices |
| mastery fills | right #2A9E53, weak #DD6630, track #DDD6C7 | #3CCB6C, #F08A5D, #45403A | lecture bars (3:1 on the page and card) |
| tints 1–6 | soft ground + ink pairs (blue, orange, yellow, teal, pink, green), each over 4.5:1 | the same hues at night | lecture icon chips and course tiles |

White text on the green is under 3:1, so the green always carries the dark ink #04260F (6.7:1). Mermaid diagrams are drawn once in fixed colours, so a diagram keeps a white paper background in both themes.

Dark mode: the page follows `prefers-color-scheme` until the toggle in the top bar (and on the sign-in card) picks a theme. The pick is stored in `localStorage` under `studyos.theme`, and `index.html` applies it before the first paint.

## Type
- Headings and big numbers: Fraunces (variable, optical size on), weight 600.
- Body and UI: Figtree 400/500/600/700, 16px base, line height 1.5.
- Both are self-hosted with Fontsource; nothing loads from a font CDN.
- Scale: 12 / 13 / 14 / 16 / 18 / 22 / 28 / 40 / 52. Nothing under 12px (`typeFloor.test.ts`).
- Numbers that line up (figures, tables, counts, slides): tabular figures.

## Spacing and shape
- Spacing steps: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- Radius: 12px for inputs, 20px for cards, 28px for the peach panel, pills fully round.
- Shadows: one soft shadow (`--shadow-card`) for things that sit on the page: cards and the current pill. A hovered course tile lifts (`--shadow-lift`).

## Components
- Plain React components and one global stylesheet per area (`styles/*.css`), as the app already does. No component library.
- Buttons: primary = green pill with dark ink (`.btn`, `.btn--go` for the big one); secondary = white pill with a border (`.btn--secondary`); quiet = underlined ink text (`.btn--ghost`); destructive = outlined in the flag colour, filled on hover (`.btn--danger`).
- Tabs: a sunken track with the current tab lifted onto a white pill.
- Icons: Lucide, pasted as inline SVG in `src/icons.tsx`. A lecture's icon comes from the first keyword in its cleaned title (`src/lectures.ts`, about 20 rules, an open book when nothing matches) and its tint from a hash of the filename, so the same file always looks the same.
- Cards: no cards inside cards. The peach panel holding the white card is the one intentional layer.

## Motion
- CSS transitions only, 200–260 ms, ease-out.
- At most two moving things per screen: the top bar's pill sliding to the current page, and the "Pick up here" bubble rising in once.
- Everything is switched off under `prefers-reduced-motion`.

## Icons and art
- Small UI icons: Lucide only, as inline SVG.
- No illustrations; the lecture icon chips are the art.
- No emoji anywhere.

## Rules (every screen, always)
1. Skeleton loaders that match the final layout for anything that loads data (no layout shift). Skip them for near-instant loads.
2. Semantic colors (success, warning, danger, info) from the table above. Never use color as the only signal; pair it with an icon or text.
3. No clutter: no subtitle that restates a heading, no redundant helper text, no decorative dividers, no duplicate labels. If it isn't useful, remove it.
4. Accessibility, WCAG 2.2 AA: 4.5:1 text contrast (3:1 for large text and controls), full keyboard navigation with visible focus, a label on every input, aria-labels on icon-only buttons, alt text on meaningful images, semantic HTML, targets at least 24×24px, prefers-reduced-motion respected.

# Redesign protocol

Changing a surface that already exists is a different job from building one, and
**misclassifying which job you are doing is the largest single source of bad
redesign work.**

> **Derived from [taste-skill](https://github.com/Leonxlnx/taste-skill) by
> Leonxlnx (MIT).** Full attribution and licence: `NOTICE.md`.

---

## 1. Detect the mode first

| Mode | Meaning | Dial baseline |
|---|---|---|
| **Greenfield** | No existing surface, or a full overhaul is approved | From `design-craft.md` §2 |
| **Preserve** | Modernise without breaking the brand | Match the existing surface, motion +1 |
| **Overhaul** | New visual language over existing content and IA | Existing +2 on expression and motion |

If ambiguous, ask **once**: *"Should this preserve the existing brand, or are we
starting visually from scratch?"*

---

## 2. Audit before touching anything

Document the current state before proposing a single change:

- **Brand tokens** — colours, type stack, logo treatment, radii, spacing scale.
- **Information architecture** — page tree, primary nav, conversion paths.
- **Content blocks** — what exists, what is doing work, what is filler.
- **Patterns to preserve** — signature interactions, recognisable hero, copy voice.
- **Patterns to retire** — tells, broken layouts, dead links, performance traps.
- **Dial reading of the existing surface** — infer its current EXPRESSION,
  MOTION and DENSITY. **That is your starting point, not the table baseline.**
- **Accessibility baseline** — existing focus states, alt text, keyboard paths,
  contrast. You may not regress these.
- **SEO baseline** — ranking pages, meta titles, structured data, share cards.

**SEO migration is the single biggest redesign risk.** Capture the baseline
before, not after.

In a DevFlow project, the audit belongs in the objective's `CONTEXT.md` so the
planner reads it before generating jobs. For a brownfield repository,
`/devflow:map-codebase` has usually already captured the structural half.

---

## 3. Preservation rules

- **Do not change information architecture** unless asked. Slugs, anchor IDs and
  nav labels stay stable, for search ranking and for muscle memory.
- **Extract the brand before applying any colour guidance.** A brand that is
  already purple stays purple.
- **Preserve copy voice** unless a rewrite was requested. Visual modernisation is
  not a content rewrite.
- **Honour existing accessibility wins.** Never regress focus, alt text, keyboard
  navigation or contrast.
- **Respect existing analytics.** Renaming buttons, form fields or section IDs
  silently breaks downstream tracking.

### Never change without explicit approval

- URL structure and route slugs
- Primary navigation labels
- Form field names and order — breaks analytics and autofill
- Logo and wordmark
- Legal, consent and cookie copy

In DevFlow terms these are `checkpoint:decision` material. Park them rather than
guessing; in autonomous mode they go to the decision queue.

---

## 4. Modernisation levers, in priority order

Apply in order and **stop when the brief is satisfied**. Each one costs more risk
than the one above it.

1. **Typography** — the largest visual lift per unit of risk.
2. **Spacing and rhythm** — section padding, vertical rhythm.
3. **Colour recalibration** — desaturate, unify neutrals, keep the brand accent.
4. **Motion layer** — micro-interactions appropriate to the motion dial.
5. **Hero and key-section recomposition.**
6. **Full block replacement** — only when a block is genuinely unsalvageable.

---

## 5. Choosing evolution over redesign

- IA, content and search performance are sound → **targeted evolution**, levers
  1-4. Roughly 70% of the value at roughly 40% of the risk.
- Visual debt is structural — broken IA, no design system, broken mobile →
  **full redesign** with strict content preservation.
- The brand itself is changing → **greenfield**.

Most requests that arrive worded as "redesign this" are satisfied by levers 1-3.
Say so when that is true, rather than rebuilding to look busy.

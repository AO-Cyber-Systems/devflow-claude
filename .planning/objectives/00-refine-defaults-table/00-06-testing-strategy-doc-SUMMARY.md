---
objective: 00-refine-defaults-table
job: "06"
subsystem: testing
tags: [testing-strategy, matrix, flutter-web, codegen, platform-routing, reference-doc]

# Dependency graph
requires: []
provides:
  - "Layer x tool x stack matrix reference doc for planner agent consumption"
  - "Flutter-web semantics gotcha documented for executor awareness"
  - "Codegen discipline (commit generated code, regen as separate commit)"
  - "Platform routing guide (outside-in layer selection per platform)"
affects:
  - "00-03-planner-agent-update (reads this doc via @~/.claude/devflow/references/testing-strategy.md)"
  - "00-01-defaults-table-update (soft-bundled: both read by planner)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Layer x tool x stack matrix: descriptive of org practice, not aspirational; deferred cells honest about absent tooling"
    - "Soft-bundled reference doc: planner reads alongside defaults-table.md; neither coupled to resolver"

key-files:
  created:
    - plugins/devflow/devflow/references/testing-strategy.md
  modified: []

key-decisions:
  - "Visual/golden and AI exploratory cells marked deferred per codebase survey (no golden-file or visual-diff tooling in org)"
  - "Doc is read-only reference (no executable content); sync-runtime hook mirrors it to ~/.claude/devflow/references/ automatically"
  - "Closes GitHub issue #7 soft-bundled with #20 per CONTEXT.md section 5 (no resolver coupling)"

patterns-established:
  - "Reference doc style: matter-of-fact, second-person, no frontmatter, GFM tables, H2 section headings"
  - "Deferred cell pattern: mark absent tooling as deferred rather than aspirational"

requirements-completed: [SC-5]

# Verification evidence
verification:
  gates_defined: 4
  gates_passed: 4
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 2min
completed: 2026-05-04
---

# Objective 0 TRD 6: Testing Strategy Doc Summary

**Layer x tool x stack matrix (Rails/Go/Flutter/Node, 7 layers) plus Flutter-web, codegen, and platform-routing reference docs authored at `plugins/devflow/devflow/references/testing-strategy.md`**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-04T15:01:14Z
- **Completed:** 2026-05-04T15:02:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Authored `plugins/devflow/devflow/references/testing-strategy.md` — 90 lines, 7 H2 sections, full matrix
- Layer x tool x stack matrix covering 4 stack families x 7 layer rows (unit, integration, system/E2E, AI exploratory, visual/golden, wrong-tenant, contract/parity)
- Three required paragraph treatments: Flutter-web semantics gotcha, codegen discipline, platform routing
- Visual/golden and AI exploratory cells honestly marked deferred per org codebase survey
- Cross-referenced `defaults-table.md`, `tdd.md`, `verification-patterns.md`, `anti-patterns.md`
- Closes GitHub issue #7 (soft-bundled with issue #20 per CONTEXT.md section 5)

## Document structure (table of contents)

1. Intro paragraph (soft-bundle relationship to defaults-table.md)
2. `## Testing strategy matrix` — 4-column x 7-row GFM table + 3-step planner usage guide
3. `## Flutter-web semantics gotcha` — pumpAndSettle divergence, Patrol recommendation
4. `## Codegen discipline` — commit generated code, 3-commit regen sequence
5. `## Platform routing` — outside-in layer selection per platform (web/mobile/API/CLI/plugin)
6. `## Cross-references` — links to defaults-table.md, tdd.md, verification-patterns.md, anti-patterns.md
7. `## Out of scope` — visual-regression tooling, AI exploratory, property-based, non-primary stacks
8. `## Versioning` — propagation note, what to update when modifying

**Matrix dimensions:** 4 stack columns (Rails Sorbet/RSpec, Go ConnectRPC+templ, Flutter mobile+web, Node CLI/plugin) x 7 layer rows

**Deferred cells:** Visual/golden row (Percy/Chromatic deferred for Rails; matchesGoldenFile deferred for Flutter) and AI exploratory row (all 4 stacks: no formal pattern in org)

**Three paragraph summaries:**
- Flutter-web gotcha: `pumpAndSettle` diverges on web vs mobile; use Patrol or explicit Future.delayed after nav events
- Codegen discipline: commit generated code; regen as separate commit (schema commit, regen commit, consumer code commit)
- Platform routing: outside-in entry point varies by platform; planner uses this when resolver returns `outside_in: true`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Author testing-strategy.md | `test -f plugins/devflow/devflow/references/testing-strategy.md` | 0 | PASS |
| 1: Flutter-web present | `grep -E 'Flutter-web' plugins/devflow/devflow/references/testing-strategy.md` | 0 | PASS |
| 1: Section count >= 4 | `grep -cE '^## ' ... \| awk '$1 < 4 { exit 1 }'` | 0 | PASS |
| 1: Line count >= 60 | `wc -l ... \| awk '$1 < 60 { exit 1 }'` | 0 | PASS |

Actual counts: 7 H2 sections, 90 lines, 9 table rows with pipe characters.

## Task Commits

1. **Task 1: Author references/testing-strategy.md with matrix + 3 required paragraphs** - `df9fb0e` (docs)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| file-exists | `test -f plugins/devflow/devflow/references/testing-strategy.md` | 0 | PASS |
| flutter-web | `grep -E 'Flutter-web' plugins/devflow/devflow/references/testing-strategy.md` | 0 | PASS |
| section-count | `grep -cE '^## ' ... \| awk '$1 < 4 { exit 1 }'` | 0 | PASS |
| line-count | `wc -l ... \| awk '$1 < 60 { exit 1 }'` | 0 | PASS |

Note: `npm test` validation gate in TRD is not applicable — this TRD creates a documentation file only; no source code changed and no existing tests are affected.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 8/8 (all truths confirmed — file exists, matrix present, Flutter-web section, codegen section, platform routing section, read-only reference, sync-runtime hook mirrors automatically, planner path resolves correctly)
- **Gate failures:** None

## Sync-runtime hook confirmation

The new file at `plugins/devflow/devflow/references/testing-strategy.md` will be mirrored to `~/.claude/devflow/references/testing-strategy.md` on next session start by `plugins/devflow/hooks/sync-runtime.js` (already in place). The planner agent reads it via `@~/.claude/devflow/references/testing-strategy.md` path convention. No hook changes needed.

## Files Created/Modified

- `plugins/devflow/devflow/references/testing-strategy.md` — Layer x tool x stack matrix with 7 layers, 4 stack families; Flutter-web gotcha, codegen discipline, platform routing paragraphs; cross-references; out-of-scope and versioning sections

## Decisions Made

- Marked visual/golden and AI exploratory cells as deferred/no formal pattern (not aspirational) — honest per org codebase survey findings
- Did not couple doc to resolver (per CONTEXT.md section 5 soft-bundle decision)
- Used "x" instead of Unicode multiplication sign in title to avoid emoji-like characters per style preferences
- Matched tone of existing references (matter-of-fact, second-person, no frontmatter, GFM tables)

## Deviations from Plan

None - TRD executed exactly as written. The file content matches the TRD action section's template with minor prose improvements (converted arrow characters in platform routing list to plain English "then" for cleaner Markdown rendering).

## Issues Encountered

None.

## Next Objective Readiness

- TRD 0.6 complete. Wave 1 now complete (TRD 0.1 + TRD 0.6 both ship reference docs with no resolver dependency).
- TRD 0.3 (planner agent update) can now reference `@~/.claude/devflow/references/testing-strategy.md` — the path will resolve correctly after next session start.
- Wave 2 (TRD 0.2 — resolver schema) can proceed independently.

---
*Objective: 00-refine-defaults-table*
*Completed: 2026-05-04*

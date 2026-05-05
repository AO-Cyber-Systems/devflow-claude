---
objective: 03-planning-time-org-awareness
job: "06"
subsystem: planning
tags: [plan-objective, planner, cross-repo, context-injection, advisory]

# Dependency graph
requires:
  - objective: 03-04
    provides: formatConsiderations renderer that writes Cross-Repo Considerations to CONTEXT.md

provides:
  - plan-objective.md workflow extracts Cross-Repo Considerations section from CONTEXT.md and injects into planner prompt
  - planner.md agent documents advisory behavior for the section with three bias directions

affects: [03-07-library-export-and-dogfood, any future plan-objective invocations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "awk section extraction pattern: /^## Header/ to next /^## / used to isolate CONTEXT.md section"
    - "printf '%s' over echo for multi-line variable expansion with special characters"
    - "advisory context injection via <additional_context> block in planner prompt"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/workflows/plan-objective.md
    - plugins/devflow/agents/planner.md

key-decisions:
  - "CROSS_REPO extraction uses printf '%s' (not echo) to avoid special-char interpretation in CONTEXT_CONTENT"
  - "Planner's advisory guidance covers three biases: eden-libs reuse, sibling-repo cross-pollination, misfiling surface"
  - "Advisory is strictly non-blocking: both the placeholder text and the skip auth text are treated as no-op by the planner"

patterns-established:
  - "Advisory context block pattern: extract from CONTEXT.md in Step 8, inject in <additional_context> in Step 9 planner prompt"

requirements-completed: [SC-8]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 2min
completed: 2026-05-05
---

# Objective 03 TRD 06: /df:plan-objective workflow + planner agent read Cross-Repo Considerations Summary

**plan-objective.md Step 8 extracts `## Cross-Repo Considerations` from CONTEXT.md via awk, Step 9 injects it verbatim into planner prompt's `<additional_context>`; planner.md documents three advisory biases (eden-libs reuse, sibling cross-pollination, misfiling surface)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-05T01:44:42Z
- **Completed:** 2026-05-05T01:46:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added awk-based CROSS_REPO extraction to plan-objective.md Step 8 (after CONTEXT_CONTENT extraction); empty/missing → placeholder
- Injected `{CROSS_REPO}` into planner prompt's new `<additional_context>` block (between `</planning_context>` and `<downstream_consumer>`)
- Extended planner.md `<user_preferences>` with Cross-Repo advisory guidance: three biases enumerated, non-blocking advisory documented

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Extract + inject in plan-objective.md | `grep -A 5 'Cross-Repo Considerations' plugins/devflow/devflow/workflows/plan-objective.md` | 0 | PASS |
| 1: CROSS_REPO occurrence count | `grep -c 'CROSS_REPO' plugins/devflow/devflow/workflows/plan-objective.md` returns 4 | 0 | PASS |
| 1: Frontmatter intact | `head -5 plugins/devflow/devflow/workflows/plan-objective.md` shows `status: active` | 0 | PASS |
| 2: Advisory in planner.md | `grep -A 10 'Cross-Repo Considerations.*advisory' plugins/devflow/agents/planner.md` | 0 | PASS |
| regression: npm test | `npm test` | 0 | PASS |

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract + inject Cross-Repo Considerations in plan-objective.md** - `f3f0c5d` (feat)
2. **Task 2: Document advisory pattern in planner.md** - `1961a0c` (docs)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (839/839, 15 skipped) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5 (workflow extracts, handles absence gracefully, planner biases documented, verbatim pass-through, no new agents)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/workflows/plan-objective.md` — Step 8: CROSS_REPO extraction via awk; Step 9: `<additional_context>` block with `{CROSS_REPO}`
- `plugins/devflow/agents/planner.md` — `<user_preferences>` extended with Cross-Repo advisory guidance (3 biases, non-blocking)

## Decisions Made

- Used `printf '%s'` instead of `echo` for CONTEXT_CONTENT to avoid escape interpretation of backticks, `$`, and other special chars in CONTEXT.md content
- Placeholder text is `_(none — research-objective did not run, or scan returned empty)_` — matches the text that planners are told to treat as no-op
- Added both the placeholder text AND the auth-skip text to the planner's "do NOT block" guidance so both no-op cases are explicitly documented

## Deviations from Plan

None — TRD executed exactly as written.

## Issues Encountered

None.

## Next Objective Readiness

- SC-8 is complete: plan-objective.md and planner.md both reference Cross-Repo Considerations
- TRD 03-07 (library export lock + dogfood) is the final wave-6 TRD; can proceed independently
- TRD 03-05 (research-skill integration, parallel sibling) must also complete before 03-07 dogfood runs

---
*Objective: 03-planning-time-org-awareness*
*Completed: 2026-05-05*

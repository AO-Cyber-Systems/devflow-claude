---
objective: 12-skill-consolidation
job: "04"
subsystem: skill-routing
tags: [skill-route, workstreams, tdd, dispatch, stub]

requires:
  - objective: 12-01-skill-route-and-objective
    provides: SKILL_ROUTES table, routeSkill dispatch engine, export-lock (8 entries)
provides:
  - SKILL_ROUTES.workstreams with 4 subcommands (setup, status, merge, run)
  - workstreams-run.md stub workflow locked for v1.2 obj 6
  - Updated workstreams SKILL.md using skill-route dispatch (consistent with obj/milestone/todo/status)
affects:
  - 12-07-docs-and-routing-prep
  - v1.2-obj-6-phase-a-routing-keystone

tech-stack:
  added: []
  patterns:
    - "SKILL_ROUTES.workstreams insertion order: between milestone and todo (declaration order = --list order)"
    - "Stub-and-fill: workstreams-run.md exists at v1.2 obj 6 Phase A dispatch, informs-only until then"
    - "No DEPRECATION_MAP entries for workstreams: no legacy sibling skill dirs existed"

key-files:
  created:
    - plugins/devflow/devflow/workflows/workstreams-run.md
  modified:
    - plugins/devflow/devflow/bin/lib/skill-route.cjs
    - plugins/devflow/devflow/bin/lib/skill-route.test.cjs
    - plugins/devflow/skills/workstreams/SKILL.md

key-decisions:
  - "DEPRECATION_MAP unchanged — no workstreams-* sibling skill dirs ever existed, so no deprecation entries needed (confirmed via TRD CONTEXT.md research)"
  - "run subcommand is a stub locked for v1.2 obj 6 Phase A — informs user, exits 0, no worktree mutation"
  - "workstreams inserted between milestone and todo in SKILL_ROUTES to match expected --list order in SR4/WL1 tests"
  - "SR4 test updated from 4-key to 5-key assertion (adds workstreams) — this is a legitimate test evolution, not a deviation"

patterns-established:
  - "SKILL_ROUTES insertion order is tested via SR4 — update that test when adding new skills"
  - "Stub workflows use status: stub + locked_by + will_implement frontmatter fields"

requirements-completed:
  - PHASE-G1

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 5min
completed: 2026-05-06
---

# Objective 12 TRD 04: Workstreams Extension Summary

**SKILL_ROUTES.workstreams with 4 subcommands (setup/status/merge/run stub) — workstreams SKILL.md migrated to skill-route dispatch, run stub locks v1.2 obj 6 Phase A surface**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-06T02:24:37Z
- **Completed:** 2026-05-06T02:29:00Z
- **Tasks:** 2 (Task 1: TDD dispatch extension, Task 2: SKILL.md + stub workflow)
- **Files modified:** 4

## Accomplishments

- Extended SKILL_ROUTES with workstreams entry (4 subcommands: setup, status, merge, run)
- Created workstreams-run.md stub workflow — informs user, no worktree mutation, locks dispatch surface
- Migrated workstreams SKILL.md from inline prose parsing to unified skill-route dispatch pattern
- DEPRECATION_MAP unchanged at 13 entries (correct — no sibling skill dirs existed)
- module.exports unchanged at 8 entries (EX5 export-lock passes)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: TDD — extend SKILL_ROUTES with workstreams | `node --test lib/skill-route.test.cjs` (in bin/) | 0 | PASS |
| 2: Update SKILL.md + create run stub | `grep -q "not yet implemented" workstreams-run.md && npm test` | 0 | PASS |

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing tests** - `4dfdc6e` (test: add failing tests for workstreams routing)
2. **Task 1 GREEN: implementation** - `3889ff9` (feat: extend SKILL_ROUTES with workstreams)
3. **Task 2: SKILL.md + stub** - `2503e0e` (feat: update workstreams SKILL.md + create run stub)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1471 pass, 1 pre-existing E2E1 failure unrelated to this TRD) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test lib/skill-route.test.cjs` (in bin/) | 1 | FAIL (7 W/WL tests fail — correct) |
| GREEN | `node --test lib/skill-route.test.cjs` (in bin/) | 0 | PASS (80/80 pass — correct) |

No REFACTOR phase needed — implementation was clean on first pass.

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (insertion order fix — workstreams placed before todo per SR4 assertion)
- **Must-haves verified:** 5/5
- **Gate failures:** None (pre-existing E2E1 failure is not a gate failure — it predates this TRD)

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/skill-route.cjs` — Added SKILL_ROUTES.workstreams (4 subcommands, workflow_for map), placed between milestone and todo
- `plugins/devflow/devflow/bin/lib/skill-route.test.cjs` — Added Groups W, WL, WD, EX5; updated SR4 from 4-key to 5-key assertion
- `plugins/devflow/skills/workstreams/SKILL.md` — Migrated from inline prose to skill-route dispatch; added run subcommand to objective + execution_context
- `plugins/devflow/devflow/workflows/workstreams-run.md` — New stub workflow (status: stub, locked_by: TRD 12-04, exits 0 with informational message)

## Decisions Made

- DEPRECATION_MAP unchanged — confirmed via TRD research that no sibling `workstreams-*` skill directories ever existed, so no deprecation entries are needed
- run subcommand is strictly a stub (no implementation logic) to lock the dispatch surface for v1.2 obj 6
- workstreams inserted between milestone and todo in SKILL_ROUTES declaration order (matches expected key order in SR4 test)
- SR4 test updated to reflect 5-key SKILL_ROUTES — legitimate evolution, not a deviation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SKILL_ROUTES insertion order mismatch**
- **Found during:** Task 1 GREEN phase (after first GREEN attempt)
- **Issue:** workstreams was initially inserted after todo instead of before it; SR4 asserted `['objective', 'milestone', 'workstreams', 'todo', 'status']` but actual order was `['objective', 'milestone', 'todo', 'workstreams', 'status']`
- **Fix:** Moved workstreams entry in SKILL_ROUTES to precede todo (between milestone and todo)
- **Files modified:** plugins/devflow/devflow/bin/lib/skill-route.cjs
- **Verification:** All 80 skill-route tests pass after reorder
- **Committed in:** 3889ff9 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 insertion-order bug caught in GREEN phase)
**Impact on plan:** Zero scope impact. Fix was inline during GREEN phase. SR4 is the canonical order enforcement test.

## Stub Sample Output

When user runs `/devflow:workstreams run`, the stub delivers:

```
/devflow:workstreams run is not yet implemented.
   Tracked for v1.2 obj 6 (Phase A — Authoritative routing keystone, GitHub #26).
   Use /devflow:workstreams setup | status | merge today.
```

No worktree operations execute. Exit status: 0 (informational).

## DEPRECATION_MAP Confirmation

DEPRECATION_MAP has exactly 13 entries after this TRD (unchanged from 12-03):

| Key | Value |
|---|---|
| add-objective | objective add |
| insert-objective | objective add |
| remove-objective | objective remove |
| new-milestone | milestone new |
| audit-milestone | milestone audit |
| complete-milestone | milestone complete |
| plan-milestone-gaps | milestone gaps |
| add-todo | todo add |
| check-todos | todo list |
| pause-work | status pause |
| resume-work | status resume |
| progress | status |
| health | status check |

No `workstreams-*` entries added (confirmed by WD1 + WD2 tests).

## Issues Encountered

One pre-existing test failure (`E2E1: SELF-TEST`) was present before this TRD (baseline: 1462 pass, 8 fail when RED tests were stashed). This TRD added 9 new passing tests and did not introduce any new failures. Net result: 1471 pass, 1 fail (same E2E1).

## Next Objective Readiness

- TRD 12-07 (docs and routing prep) can read `SKILL_ROUTES` for the complete 5-skill catalog
- v1.2 obj 6 Phase A sees `df-tools skill-route --list` with 4 workstreams subcommands including `run`
- All 5 consolidated skills (objective, milestone, workstreams, todo, status) are now shape-identical

---
*Objective: 12-skill-consolidation*
*Completed: 2026-05-06*

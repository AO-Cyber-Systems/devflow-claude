---
objective: 18-v1-1-polish-bundle
job: "03"
subsystem: init
tags: [init, check-todos, awareness, cache, preview, tdd]

# Dependency graph
requires:
  - objective: 06-check-todos
    provides: check-todos cache format (.planning/.check-todos-cache.json with `now` lane)
  - objective: 02-cross-repo-awareness
    provides: awareness cache format (.planning/.awareness-cache.json with peer.branches[])
provides:
  - _buildCheckTodosPreview helper in init.cjs (cache-only, no subprocess)
  - _buildAwarenessPreview helper in init.cjs (cache-only, filters current branch)
  - check_todos_preview field on cmdInitPlanObjective + cmdInitExecuteObjective output
  - awareness_preview field on both init commands
  - advisories_warnings array on both init commands (empty or warning strings)
affects: [plan-objective skill, execute-objective skill, any consumer parsing init JSON]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cache-only preview helpers: fs.existsSync + readFileSync + JSON.parse, no subprocess"
    - "Underscore-prefix export (_buildCheckTodosPreview) for test-only access to internal helpers"
    - "advisories_warnings always emitted as array (even when empty) for stable JSON shape"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/init.cjs
    - plugins/devflow/devflow/bin/lib/init.test.cjs

key-decisions:
  - "Preview reads top-level `now` array from cache (post-aggregate shape). If not present, degrades gracefully to null — no error, no subprocess fallback."
  - "advisories_warnings always initialized to [] and always emitted — downstream consumers can safely .length without null-check."
  - "Both new fields are additive to the existing JSON — no existing keys renamed or removed."

patterns-established:
  - "Cache-only helper pattern: existsSync guard → try/catch JSON.parse → null fallback on parse error with warning string"
  - "Group 18I test naming for TRD 18-03 tests (avoids collision with pre-existing Group I from TRD 02-06)"

requirements-completed:
  - POLISH-CHECK-TODOS-PREVIEW
  - POLISH-AWARENESS-PREVIEW

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 7min
completed: 2026-05-06
---

# Objective 18 TRD 03: init-output-preview Summary

**Cache-only `_buildCheckTodosPreview` + `_buildAwarenessPreview` helpers added to init.cjs, surfacing one-line ambient signals (check-todos Now lane count, peer branch count) in both `init plan-objective` and `init execute-objective` JSON output**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-06T07:06:49Z
- **Completed:** 2026-05-06T07:13:28Z
- **Tasks:** 3 (RED, GREEN, sanity check)
- **Files modified:** 2

## Accomplishments

- `_buildCheckTodosPreview(cwd)`: reads `.planning/.check-todos-cache.json`, returns `'📋 N todos in Now lane (run /devflow:check-todos)'` when `parsed.now` has ≥1 entry; null otherwise
- `_buildAwarenessPreview(cwd)`: reads `.planning/.awareness-cache.json`, filters current branch from `peer.branches[]`, returns `'⚠ N other branches active (run df-tools awareness show)'` when ≥1 peer remains; null otherwise
- Both helpers wired into `cmdInitPlanObjective` and `cmdInitExecuteObjective` — DRY across entry points
- `advisories_warnings: []` always emitted (stable shape for downstream consumers)
- Helpers exported for unit testing (`_buildCheckTodosPreview`, `_buildAwarenessPreview`)
- 10 new Group 18I tests (4 unit for check-todos, 3 unit for awareness, 3 integration); all pass
- Sanity check against live repo: `init plan-objective 18-v1-1-polish-bundle` emits `awareness_preview: "⚠ 16 other branches active"` (correct — awareness cache present in this repo)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 (RED): Write failing tests I1-I10 | `npm test 2>&1 \| grep -E "^ℹ pass\|^ℹ fail"` | 0 (1832 pass, 22 fail) | PASS (10 new failures expected) |
| 2 (GREEN): Implement helpers + wire | `npm test 2>&1 \| grep -E "^ℹ pass\|^ℹ fail"` | 0 (1852 pass, 2 fail) | PASS |
| 3: Sanity check live output | `node df-tools.cjs init plan-objective 18-... \| jq '{check_todos_preview,awareness_preview,advisories_warnings}'` | 0 | PASS |

## Task Commits

1. **Task 1: RED phase tests** - `0cafc21` (test)
2. **Task 2: GREEN phase implementation** - `db0bce3` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1852 pass, 2 pre-existing fail) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test 2>&1 \| grep "^ℹ pass\|^ℹ fail"` | 0 | 1832 pass, 22 fail — 10 new failures (FAIL correct) |
| GREEN | `npm test 2>&1 \| grep "^ℹ pass\|^ℹ fail"` | 0 | 1852 pass, 2 fail — all 10 pass (PASS correct) |
| REFACTOR | N/A — implementation was clean on first pass; no refactor needed | — | — |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 8/8
  - [x] `cmdInitPlanObjective` emits `check_todos_preview` as string when `now` lane ≥1
  - [x] `cmdInitPlanObjective` emits `awareness_preview` as string when ≥1 peer branch (excluding current)
  - [x] `cmdInitExecuteObjective` emits same two fields (DRY wiring verified by 18I8)
  - [x] Both fields null when cache absent or empty (18I2, 18I3, 18I6, 18I7)
  - [x] Warning pushed on malformed JSON (18I4); init continues
  - [x] No subprocess spawn — pure `fs.readFileSync` + `JSON.parse`
  - [x] `advisories_warnings` always an array (18I10 confirms `[]` when no warnings)
  - [x] 1832 pre-existing tests still pass (1852 total = 1832 + 10 new + 10 existing init tests that were always in file)
- **Gate failures:** None

## Sample JSON Output

```json
{
  "check_todos_preview": null,
  "awareness_preview": "⚠ 16 other branches active (run df-tools awareness show)",
  "advisories_warnings": [],
  "awareness_refresh": true
}
```

(`check_todos_preview` is null because this repo has no `.planning/.check-todos-cache.json` with a top-level `now` array yet — user must run `/devflow:check-todos` once to populate it.)

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/init.cjs` — Added `_buildCheckTodosPreview` + `_buildAwarenessPreview` helpers (~70 lines); wired into `cmdInitPlanObjective` and `cmdInitExecuteObjective`; exported both for testing
- `plugins/devflow/devflow/bin/lib/init.test.cjs` — Rewrote to consolidate TRD 02-06 Group I + TRD 18-03 Group 18I tests; added 10 new test cases + `makeFixture` helper

## Decisions Made

- Preview reads top-level `parsed.now` array from cache (post-aggregate shape) — conservative fallback: if field absent, null preview emitted. Rationale: avoids re-running lane-assignment pipeline in init context.
- `advisories_warnings` always emitted as `[]` (never absent) — downstream `json.advisories_warnings.length` is always safe without null-check.
- Both helpers share the same `{ line, warning }` return shape — uniform contract for callers.

## Deviations from Plan

None - TRD executed exactly as written. File restructuring of init.test.cjs (requires hoisted to top) was required to fix Node.js hoisting constraint, not a deviation from the TRD design.

## Issues Encountered

Minor: Initial attempt to prepend new tests to the existing init.test.cjs caused a `ReferenceError: Cannot access 'test' before initialization` because the `const test = require('node:test')` declaration was after the new test blocks. Fixed by rewriting the file with all requires at the top (single pass, no regression).

## Next Objective Readiness

- `check_todos_preview` and `awareness_preview` fields available in init JSON for skill UIs to render
- `_buildCheckTodosPreview` degrades gracefully until user runs `/devflow:check-todos` once
- TRD 18-03 complete; objective 18 has all 3 TRDs executed

---
*Objective: 18-v1-1-polish-bundle*
*Completed: 2026-05-06*

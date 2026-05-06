---
objective: 12-skill-consolidation
job: 05
subsystem: testing
tags: [tdd, trd-tdd, task-flag, back-compat, executor, planner]

requires:
  - objective: 12-01-skill-route-and-objective
    provides: skill-route pattern for df-tools CLI arm structure

provides:
  - lib/trd-tdd.cjs — parseTrdTasks + resolveEffectiveTddFlag + cmdTrdTddInspect (5-entry locked surface)
  - df-tools trd-tdd inspect CLI — per-task effective TDD flag resolution
  - planner.md task-level tdd="true" emission rule
  - executor.md unified tdd_execution branch via df-tools trd-tdd inspect
  - references/tdd.md Forms section documenting Form A (task-level) and Form B (TRD-level back-compat)

affects:
  - planner agent (task-level tdd flag emission)
  - executor agent (unified TDD branch)
  - all future TRDs (can now mix testable + non-testable tasks)
  - in-flight TRDs (objs 10, 11) continue working via back-compat

tech-stack:
  added: []
  patterns:
    - "task-level tdd attribute on <task> elements (tdd=\"true\"/\"false\"/absent)"
    - "resolveEffectiveTddFlag: task attr wins, TRD type:tdd fallback, default false"
    - "_setRunFs / _resetMocks injection pattern for testable fs operations"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/trd-tdd.cjs
    - plugins/devflow/devflow/bin/lib/trd-tdd.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/trd-tdd-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/agents/planner.md
    - plugins/devflow/agents/executor.md
    - plugins/devflow/devflow/references/tdd.md

key-decisions:
  - "Task-level tdd attribute wins over TRD-level type:tdd (explicit task override)"
  - "process.stdout.write + process.exit(1) directly for error case in cmdTrdTddInspect — output() helper always exits 0"
  - "Regex handles both <task> (legacy) and <TASK-EX> (new) open tags for back-compat"
  - "5-entry export lock: parseTrdTasks, resolveEffectiveTddFlag, cmdTrdTddInspect, _setRunFs, _resetMocks"

requirements-completed:
  - PHASE-I3

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-05-06
---

# Objective 12 TRD 05: I3 TDD Collapse Summary

**`trd-tdd.cjs` library + task-level `tdd="true"` flag collapsing TDD-as-TRD-type into per-task attribute with full back-compat for in-flight `type: tdd` TRDs**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-06T01:50:13Z
- **Completed:** 2026-05-06T01:57:30Z
- **Tasks:** 2
- **Files modified:** 7 (3 new, 4 modified)

## Accomplishments

- Created `lib/trd-tdd.cjs` with 5-entry locked export surface: `parseTrdTasks`, `resolveEffectiveTddFlag`, `cmdTrdTddInspect`, `_setRunFs`, `_resetMocks`
- Implemented `df-tools trd-tdd inspect <path> [--raw]` CLI inspector returning per-task `tdd_effective` JSON
- Updated planner.md Step 3 to emit `tdd="true"` task attribute instead of forcing TRD-level `type: tdd` splits
- Unified executor.md `<tdd_execution>` to resolve effective flag via `df-tools trd-tdd inspect`
- Added `<forms>` section to `references/tdd.md` documenting Form A (task-level) and Form B (TRD-level) with precedence table
- Full back-compat: `type: tdd` TRDs (objs 10, 11 in flight) still resolve all tasks as `tdd_effective: true`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: trd-tdd parser + resolver + CLI | `node --test lib/trd-tdd.test.cjs` (25 tests) | 0 | PASS |
| 1: back-compat smoke | `node df-tools.cjs trd-tdd inspect <obj10-TRD>` | 0 | PASS |
| 1: full suite | `npm test` (1428 pass) | 0 | PASS |
| 2: 3-file atomic | `git diff --name-only HEAD~1 HEAD | grep -c '(planner|executor|tdd).md'` | — | 3 |
| 2: text checks | grep for tdd="true", trd-tdd inspect, Form A, task-level tdd attribute | 0 | PASS |
| 2: full suite | `npm test` (1428 pass) | 0 | PASS |

## Task Commits

1. **Task 1 RED:** `a7cd320` — test(12-05): add failing tests for trd-tdd parser + resolver + CLI inspector
2. **Task 1 GREEN:** `ebdfaac` — feat(12-05): implement trd-tdd parser + resolver + CLI inspector
3. **Task 2:** `3609f4b` — feat(12-05): update planner+executor+tdd-ref for task-level tdd flag

_Note: No REFACTOR commit needed — implementation was clean on GREEN._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test lib/trd-tdd.test.cjs` | 1 | FAIL (correct — module not found) |
| GREEN | `node --test lib/trd-tdd.test.cjs` | 0 | PASS (25/25 correct) |
| CLI3 fix | `node --test lib/trd-tdd.test.cjs` | 0 | PASS (25/25 after exit-code fix) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (CLI3 exit code ordering — `output()` exits 0, needed direct `process.stdout.write` + `exit(1)`)
- **Must-haves verified:** 7/7 (see list below)
- **Gate failures:** None

### Must-haves verified

1. Planner emits `tdd="true"` task attribute — PASS (`grep -q 'tdd="true"' planner.md`)
2. Executor uses `df-tools trd-tdd inspect` for resolution — PASS (`grep -q 'trd-tdd inspect' executor.md`)
3. Back-compat for `type: tdd` TRDs — PASS (smoke on obj 11: all `tdd_effective: false` for `type: standard`; smoke on 12-05 own TRD `type: tdd`: all `tdd_effective: true`)
4. `df-tools trd-tdd inspect` CLI works — PASS
5. `references/tdd.md` documents both forms — PASS (`Form A` + `task-level tdd attribute` present)
6. 5-entry export lock — PASS (EX1 test)
7. `npm test` passes — PASS (1428/1428)

## Sample Inspect Output

### Legacy type:tdd TRD (12-05 itself, back-compat)

```
$ df-tools trd-tdd inspect .planning/objectives/12-skill-consolidation/12-05-i3-tdd-collapse-TRD.md
type=tdd tasks=3
  [True] Task 1: TDD — trd-tdd parser + back-compat resolver + CLI helper
  [True] Task 2: Update planner.md + executor.md + references/tdd.md to use task-level flag
  [True] Add validateEmail function
```

All tasks `tdd_effective: true` because TRD-level `type: tdd` back-compat applies.

### Standard type TRD (obj 11, task-level absent)

```
$ df-tools trd-tdd inspect .planning/objectives/11-phase-d-verifier-wiring/11-01-diagnose-and-fix-TRD.md
type=standard tasks=3
  [False] Task 1: Add verifier spawn to build.md § 8 Auto-Verify + Complete
  [False] Task 2: Add regression test asserting build.md verifier wiring
  [False] Task 3: Run full test suite and capture evidence
```

All tasks `tdd_effective: false` because `type: standard` + no task-level `tdd="true"` attributes.

## Line Delta Summary

| File | Before | After | Delta |
|---|---|---|---|
| planner.md | 1400 | 1420 | +20 |
| executor.md | 642 | 654 | +12 |
| references/tdd.md | 361 | 406 | +45 |

Note: executor.md grew slightly (+12) rather than shrinking ~50 lines as predicted. The existing `<tdd_execution>` block already had a combined branch; we added the resolution preamble with `df-tools trd-tdd inspect`. The substantive goal (unified single branch, no guard duplication) was achieved.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/trd-tdd.cjs` — 5-entry locked module: parseTrdTasks + resolveEffectiveTddFlag + cmdTrdTddInspect + fs injection hooks
- `plugins/devflow/devflow/bin/lib/trd-tdd.test.cjs` — 25 tests across PA/RE/CLI/EX/F groups (230+ lines)
- `plugins/devflow/devflow/bin/lib/__fixtures__/trd-tdd-fixtures.cjs` — 5 hand-built factory builders (legacy, task-level, override, malformed, unquoted)
- `plugins/devflow/devflow/bin/df-tools.cjs` — `case 'trd-tdd'` arm + import
- `plugins/devflow/agents/planner.md` — Step 3 updated: task-level tdd="true" emission rule, back-compat note, removed "Why TDD gets own TRD"
- `plugins/devflow/agents/executor.md` — `<tdd_execution>` unified with df-tools trd-tdd inspect resolution preamble
- `plugins/devflow/devflow/references/tdd.md` — `<forms>` section with Form A (task-level tdd attribute), Form B (TRD-level back-compat), precedence table

## Decisions Made

- **task-level tdd attr wins over TRD-level type** — explicit is always unambiguous; back-compat means only the absent-attr + type:tdd combo triggers back-compat path
- **process.stdout.write directly for exit-1 case** — `output()` helper calls `process.exit(0)` internally; cannot use it for error paths that need exit(1)
- **Regex handles `<task>` and `<TASK-EX>`** — legacy TRDs (obj 10, 11) use lowercase `<task>`; new TRDs use `<TASK-EX>`; both supported transparently

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CLI3 exit code — output() exits 0, needed exit(1) for missing file**
- **Found during:** Task 1 GREEN phase (CLI3 test failure)
- **Issue:** `cmdTrdTddInspect` called `output({error, path}, raw)` then `process.exit(1)` — but `output()` calls `process.exit(0)` internally, so exit(1) was never reached. CLI3 test captured exit code 0 instead of 1.
- **Fix:** Replaced `output()` call with direct `process.stdout.write(JSON.stringify({...}))` followed by `process.exit(1)` for the file-not-found branch
- **Files modified:** `lib/trd-tdd.cjs`
- **Committed in:** ebdfaac (GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in exit code ordering)
**Impact on plan:** Necessary for correctness. No scope creep.

## Issues Encountered

None — all tests passed after the exit-code fix in CLI3.

## Next Objective Readiness

- `df-tools trd-tdd inspect` is ready for executor agents to use at task-execution time
- Back-compat confirmed for objs 10, 11 in-flight TRDs
- TRD 12-07 (docs and routing prep) can reference `trd-tdd inspect` pattern
- New TRDs authored after this merge should prefer `tdd="true"` task attribute (Form A)

---
*Objective: 12-skill-consolidation*
*Completed: 2026-05-06*

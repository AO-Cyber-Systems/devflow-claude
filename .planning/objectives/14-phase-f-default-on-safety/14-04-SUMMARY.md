---
objective: 14-phase-f-default-on-safety
job: "04"
subsystem: config
tags: [config, defaults, job-checker, regression-test, phase-f]

# Dependency graph
requires:
  - objective: 11-phase-d-verifier-wiring
    provides: build.md § 8 verifier spawn that F4 regression test guards
provides:
  - Fresh-project config template with explicit job_checker_enabled: true (F1-CONFIG)
  - Phase F config defaults regression test asserting job_checker_enabled
  - F4 acceptance regression test guarding build.md verifier-wiring invariant
affects: [14-01-cheap-trd-pre-checker, 14-02-novel-domain-detection, 14-03-brownfield-map-detector]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-assert test pattern: fs.readFileSync + JSON.parse + assert.strictEqual for config templates"
    - "Belt-and-suspenders regression test: Phase F test block duplicates Phase D invariant explicitly for F4 acceptance"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/templates/config.json
    - plugins/devflow/devflow/bin/df-tools.test.cjs

key-decisions:
  - "Variant A chosen: top-level job_checker_enabled: true added to template (config.cjs reads job_checker top-level OR workflow.job_check fallback; explicit field added for surface clarity per F1 spec)"
  - "Test assertion uses null-coalescing fallback: cfg.job_checker_enabled ?? cfg.workflow?.job_check covers both surfaces in one assertion"
  - "F4 test intentionally duplicates Phase D describe block under Phase F for explicit acceptance traceability to issue #31"

patterns-established:
  - "Phase F regression pattern: static-assert test block that explicitly names the phase/issue for discoverability"

requirements-completed: [F1-CONFIG, F4]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 5min
completed: 2026-05-06
---

# Objective 14 TRD 04: Config Defaults Flip Summary

**Flipped fresh-project config to explicit `job_checker_enabled: true` and added Phase F + F4 acceptance regression tests in df-tools.test.cjs (1473/1498 tests pass)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-06T03:48:00Z
- **Completed:** 2026-05-06T03:52:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `job_checker_enabled: true` top-level field to `templates/config.json` (F1-CONFIG requirement)
- Appended `describe('Phase F config defaults + F4 acceptance', ...)` block with 2 new passing tests
- Phase D regression tests remain intact; Phase F F4 guard adds belt-and-suspenders coverage

## Config Diff

```diff
--- a/plugins/devflow/devflow/templates/config.json
+++ b/plugins/devflow/devflow/templates/config.json
@@ -1,6 +1,7 @@
 {
   "mode": "yolo",
   "depth": "standard",
+  "job_checker_enabled": true,
   "workflow": {
```

## Variant Choice

**Variant A** — top-level `job_checker_enabled: true` added. `config.cjs`'s `loadConfig` already reads `workflow.job_check` as a fallback for `job_checker`, so the template was functionally correct before this change. Adding the explicit top-level field makes the surface match what agents query (`init plan-objective` returns `job_checker_enabled: config.job_checker`) and satisfies the F1-CONFIG acceptance criterion unambiguously.

## Test Count Delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Tests | 1496 | 1498 | +2 |
| Pass | 1471 | 1473 | +2 |
| Fail | 1 | 1 | 0 (pre-existing) |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Update templates/config.json | `grep -c "job_checker_enabled" plugins/devflow/devflow/templates/config.json` | 0 | PASS |
| 1: Update templates/config.json | `node -e "console.log(require('./plugins/devflow/devflow/templates/config.json').job_checker_enabled)"` (prints `true`) | 0 | PASS |
| 2: Add regression tests | `npm test 2>&1 \| grep -E "Phase F config\|F4 acceptance"` (both tests shown as passing) | 0 | PASS |
| 2: Add regression tests | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` (1473 pass, 1 fail pre-existing) | 0 | PASS |

## Task Commits

1. **Tasks 1+2: config flip + regression tests** - `0b5b29e` (feat(14-04))

**Plan metadata:** (pending — docs commit)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1473/1498, 1 pre-existing fail) |

## Phase D Regression Test Status

`npm test 2>&1 | grep -E "Phase D verifier wiring"` confirms:
- `build.md workflow asserts (Phase D verifier wiring)` — PASS
- All 3 Phase D assertions still green: § 8 header, `subagent_type="verifier"`, `model="{verifier_model}"`

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 3/3 (config field present + F4 regression test + baseline tests pass)
- **Gate failures:** None

## Files Created/Modified
- `plugins/devflow/devflow/templates/config.json` — Added `job_checker_enabled: true` top-level field
- `plugins/devflow/devflow/bin/df-tools.test.cjs` — Appended `describe('Phase F config defaults + F4 acceptance', ...)` block (2 tests)

## Decisions Made
- Chose Variant A (explicit top-level field) rather than relying solely on the `workflow.job_check` fallback path — makes the template surface unambiguous for F1 acceptance
- F4 test intentionally re-asserts Phase D invariants under a Phase F describe block for explicit issue #31 F4 traceability
- Both tasks committed in single `feat(14-04):` commit per TRD spec (both files are atomic: config flip is meaningless without the test that guards it)

## Deviations from Plan

None - TRD executed exactly as written.

## Issues Encountered
None — task was exactly as scoped. The `workflow.job_check: true` fallback path in `config.cjs` already made the system functionally correct; this TRD added the explicit top-level field for clarity and the regression guard.

## Next Objective Readiness
- F1-CONFIG and F4 requirements closed
- Wave 1 sibling 14-01 (cheap TRD pre-checker) can be verified independently — different files, no conflict
- Remaining TRDs in objective 14: 14-02 (novel domain detection), 14-03 (brownfield map detector), 14-05 (confidence scoring removal)

---
*Objective: 14-phase-f-default-on-safety*
*Completed: 2026-05-06*

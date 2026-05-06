---
objective: 14-phase-f-default-on-safety
trd: "03"
subsystem: brownfield-detector
tags: [tdd, detection, brownfield, file-walker, cli]
dependency_graph:
  requires: ["14-02"]
  provides: ["cmdDetectBrownfieldMap", "detectBrownfieldMap"]
  affects: ["plugins/devflow/devflow/bin/df-tools.cjs"]
tech_stack:
  added: []
  patterns: ["pure-function + I/O wrapper", "recursive fs walker", "tmpdir scaffolding for tests"]
key_files:
  created:
    - plugins/devflow/devflow/bin/lib/brownfield-detector.cjs
    - plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/brownfield-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
decisions:
  - "Walker excludes directories by exact name (not path), allowing paths like src/node_modules_demo to count"
  - "ENOENT/EACCES on subdirs is silently swallowed — walk continues, never crashes"
  - "codebase_map_exists treated as truthy on directory presence alone (content quality is Phase A concern)"
  - "Phase A (classify-session.js integration) explicitly deferred — this TRD ships detector helper only"
metrics:
  duration: "272 seconds (~4.5 minutes)"
  completed: "2026-05-06"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Objective 14 TRD 03: Brownfield Map Detector Summary

**One-liner:** Pure-logic brownfield detector with recursive fs walker, 50-file threshold, and `df-tools detect brownfield-map` CLI subcommand.

## What Was Built

A self-contained detector module that identifies projects where:
1. `.planning/` exists (project is using DevFlow)
2. `.planning/codebase/` does NOT exist (no codebase map yet)
3. `>= 50 source files` are present (substantial code, not a scaffold)

When all three hold, `should_offer_map: true` signals that `/devflow:map-codebase` should be offered.

## Commits

| Commit | Phase | Description |
|---|---|---|
| `ba1501f` | RED | `test(14-03): add failing tests for brownfield map detector` |
| `bbfb9c7` | GREEN | `feat(14-03): implement df-tools detect brownfield-map detector` |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — fixtures + tests | `node --test lib/brownfield-detector.test.cjs` | 1 | FAIL (correct RED) |
| 2: GREEN — detector + dispatcher | `node --test lib/brownfield-detector.test.cjs` | 0 | PASS |
| 2: Full suite regression | `npm test` | 0 | PASS (1548/1549, 1 pre-existing) |
| 2: Smoke test | `df-tools detect brownfield-map --raw \| jq .` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test lib/brownfield-detector.test.cjs` | 1 | FAIL (correct — no implementation) |
| GREEN | `node --test lib/brownfield-detector.test.cjs` | 0 | PASS (21/21) |
| REFACTOR | n/a — no refactor needed | — | — |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (1548/1549) |

## Test Count Delta

- Pre-TRD: 1527 passing
- Post-TRD: 1548 passing (+21 new tests)
- Pre-existing failure: 1 (unrelated, unchanged)

## Smoke Test Output

Running `df-tools detect brownfield-map .` against this repo (`devflow-claude-v1.1`):

```json
{
  "should_offer_map": true,
  "planning_exists": true,
  "codebase_map_exists": false,
  "source_file_count": 130,
  "threshold": 50
}
```

`.planning/codebase/` has not been created for this repo, and 130 source files are present — correct signal.

## Artifact Verification

| Artifact | Min Lines | Actual Lines | Exports |
|---|---|---|---|
| `brownfield-detector.cjs` | 90 | 173 | `cmdDetectBrownfieldMap`, `detectBrownfieldMap` |
| `brownfield-detector.test.cjs` | 150 | 423 | — |
| `__fixtures__/brownfield-fixtures.cjs` | 50 | 158 | `makeScaffold`, `makeSourceFile`, `makeNestedSourceTree` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cleanup helper in test 20 (permission denied) failed to remove locked dir**

- **Found during:** Task 2 GREEN phase (first test run)
- **Issue:** `removeTmp()` used simple `fs.rmSync` which throws ENOTEMPTY when a subdirectory has chmod 0o000 because it can't list the directory to remove its contents.
- **Fix:** Replaced `removeTmp` with a two-pass implementation: first restore permissions recursively (handles unreadable dirs by attempting chmod before listing), then rmSync.
- **Files modified:** `brownfield-detector.test.cjs`
- **Commit:** Included in GREEN commit `bbfb9c7`

None other — TRD executed as written.

## Phase A Deferred Note

Phase A (objective #26) will wire this detector into `classify-session.js` SessionStart hook to produce the brownfield map offer on first session per project. This TRD ships only the detector helper — the one-line integration (`cmdDetectBrownfieldMap(cwd)` call + result dispatch) is Phase A's task.

## Post-TRD Verification

- Auto-fix cycles used: 1 (test cleanup helper fix)
- Must-haves verified: 5/5
  - `df-tools detect brownfield-map <cwd>` returns structured signal block: PASS
  - Identifies projects where `.planning/` exists but `.planning/codebase/` does not: PASS
  - Counts source files excluding node_modules/.git/dist/.planning: PASS
  - Returns `should_offer_map:true` when all three conditions hold: PASS
  - Gate failures: None

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/brownfield-detector.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/__fixtures__/brownfield-fixtures.cjs` — FOUND
- RED commit `ba1501f` — FOUND
- GREEN commit `bbfb9c7` — FOUND

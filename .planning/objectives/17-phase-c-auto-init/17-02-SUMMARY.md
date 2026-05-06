---
objective: 17-phase-c-auto-init
job: "02"
subsystem: cli
tags: [decline-tracker, json-persistence, atomic-write, df-tools, phase-c]

# Dependency graph
requires:
  - objective: 17-phase-c-auto-init
    provides: Phase C auto-init context and classify-session infrastructure
provides:
  - "decline-tracker.cjs with writeDecline + readDecline + clearDecline pure helpers"
  - "Atomic .tmp-rename write to ~/.claude/devflow/declined-projects.json"
  - "df-tools project-decline + project-accept CLI subcommands"
  - "30-day default expiry with --duration-days N override"
  - "Auto-pruning of expired entries on readDecline"
affects: [17-01-project-state, 17-03-init-offer-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fs injection via _setRunFs for atomic-write spy tests (mirrors skill-active.cjs)"
    - "path override via _setDeclinePath to prevent real ~/.claude/devflow/ writes in tests"
    - "Atomic JSON write via .tmp rename (same dir = same filesystem)"
    - "readDecline auto-prune: expired entries removed from file as a side-effect of read"
    - "Fail-open corrupt JSON: return {} rather than throw"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/decline-tracker.cjs
    - plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/decline-tracker-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "Time injected as ISO string parameter (not Date object) for deterministic test assertions"
  - "_resetMocks() resets both _runFs and _runDeclinePath to prevent module-state bleed across tests"
  - "clearDecline writes {} when last entry removed — avoids TOCTOU race on delete + re-create"
  - "readDecline prunes ALL expired entries (not just the queried cwd) on each read"

patterns-established:
  - "Fixture cleanup: caller calls fs.rmSync(homeDir, {recursive:true,force:true}) in afterEach"
  - "Subprocess tests redirect HOME env var so os.homedir() resolves to tmpdir"

requirements-completed: [C3]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 15min
completed: 2026-05-06
---

# Objective 17 TRD 02: Decline Tracker Summary

**Atomic JSON persistence layer for project-decline/project-accept with 30-day expiry, auto-prune on read, and fs-injected atomic writes — ships decline tracking backbone for Phase C auto-init**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-06T06:10:00Z
- **Completed:** 2026-05-06T06:24:23Z
- **Tasks:** 2 (Task 1: pure helpers TDD; Task 2: CLI + df-tools wiring TDD)
- **Files modified:** 4 (3 new, 1 modified)

## Accomplishments
- `decline-tracker.cjs` with `writeDecline`, `readDecline`, `clearDecline` — all with time injection, fs injection, and path override for test isolation
- Atomic write via `.tmp` rename; spy test (case 15) verifies `renameSync` is called with correct paths
- `readDecline` auto-prunes expired entries from file on every read (side-effect documented)
- `df-tools project-decline [<cwd>] [--duration-days N]` and `df-tools project-accept [<cwd>]` end-to-end subprocess round-trip verified

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: TDD pure helpers (writeDecline/readDecline/clearDecline) | `node --test plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs` | 0 | PASS |
| 2: TDD CLI + df-tools wiring (project-decline/project-accept) | `node --test plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs` | 0 | PASS |

## Task Commits

Each task was committed atomically:

1. **Fixtures + RED phase (failing tests)** - `7fae949` (test)
2. **GREEN phase (implementation + df-tools wiring)** - `717da76` (feat)

**Plan metadata:** _(created in this session)_

_Note: TDD tasks may have multiple commits (test → feat → refactor). REFACTOR omitted — implementation was clean as written._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (decline-tracker only) | `node --test plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs` | 0 | PASS (30/30) |
| test (full suite) | `npm test` | 0 | PASS (1756/1782, 2 pre-existing failures) |
| lint (JS syntax) | `node -c plugins/devflow/devflow/bin/lib/decline-tracker.cjs` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (fixtures + failing tests) | `node --test plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs` | non-zero (MODULE_NOT_FOUND) | FAIL (correct) |
| GREEN (implementation + wiring) | `node --test plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs` | 0 | PASS (30/30 correct) |
| REFACTOR | n/a — implementation was clean as written | — | — |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6
- **Gate failures:** None

Truth coverage:
- Truth #1 (write entry): cases 1-5, 16-19, 23-24, 27 — PASS
- Truth #2 (default 30d + --duration-days): cases 4-5, 18-19, 26 — PASS
- Truth #3 (project-accept idempotent): cases 11-14, 20-22, 25, 28 — PASS
- Truth #4 (readDecline auto-prune): cases 6-10 — PASS
- Truth #5 (corrupt JSON graceful): case 10 — PASS
- Truth #6 (atomic .tmp rename): case 15 — PASS

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/decline-tracker.cjs` — writeDecline, readDecline, clearDecline, cmdProjectDecline, cmdProjectAccept, DECLINED_PROJECTS_PATH, _setDeclinePath, _setRunFs, _resetMocks
- `plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs` — 30 test cases across 8 describe blocks
- `plugins/devflow/devflow/bin/lib/__fixtures__/decline-tracker-fixtures.cjs` — mkTmpDeclineHome, mkDeclineFile, SCENARIOS, locked timestamps
- `plugins/devflow/devflow/bin/df-tools.cjs` — added require + case 'project-decline' + case 'project-accept'

## Decisions Made

- Time injected as ISO string parameter (not `Date` object) — avoids serialization ambiguity in test assertions
- `_resetMocks()` resets both `_runFs` and `_runDeclinePath` — prevents module-scope state bleed between tests
- `clearDecline` writes `{}` when the last entry is removed rather than deleting the file — avoids TOCTOU race
- `readDecline` prunes ALL expired entries (not just the queried cwd) on each invocation — keeps file compact automatically
- Case arms inserted before `case 'skill-active'` in df-tools switch — alphabetical ordering maintained

## Deviations from Plan

None - TRD executed exactly as written.

## Issues Encountered

None.

## Next Objective Readiness

- `readDecline(cwd)` is ready for 17-01 to consume (`previously_declined` field in project-state output)
- `writeDecline`/`clearDecline` are ready for 17-03 to wire into the init-offer flow
- Phase C acceptance criterion #4 (decline persistence + 30-day expiry) satisfied

---
*Objective: 17-phase-c-auto-init*
*Completed: 2026-05-06*

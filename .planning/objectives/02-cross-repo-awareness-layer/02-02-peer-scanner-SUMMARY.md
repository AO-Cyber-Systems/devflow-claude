---
objective: 02-cross-repo-awareness-layer
job: 02-02
subsystem: awareness
tags: [git, scanPeer, peer-scanner, branch-walker, test-injection]

# Dependency graph
requires:
  - objective: 02-01-state-md-parser-and-fixtures
    provides: parseStateMd, buildStateMd, buildGitFixtureRepo
  - objective: 02-04-cache-layer
    provides: readCache, writeCache, isStale, awareness.cjs region structure
provides:
  - "scanPeer(opts) — git-branch walker that fetches origin/*, enumerates remote refs, reads STATE.md per branch, returns structured per-branch state"
  - "_setRunGit(fn) + _resetGitMock() — test injection hook mirroring _setRunGh from lib/gh.cjs"
  - "buildMockRunGit + 7 canned-response helpers in awareness-fixtures.cjs"
affects: [02-03-org-scanner, 02-05-skill-and-cli, 02-06-lifecycle-integration, 02-07-library-export]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_setRunGit / _runGit injection: module-level mutable reference + setter; production always routes through _runGit; tests inject mock via _setRunGit(fn); _setRunGit(null) restores default"
    - "NUL-separated git log format: git log -1 --format=%H%x00%cI%x00%s for safe multi-field parsing"
    - "Fault-tolerant scanner: missing STATE.md = silent skip; malformed = warning+skip; fetch failure = warning+continue"
    - "Stale-filter with 0=disabled semantics: peer_stale_days=0 uses -Infinity threshold"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/awareness.cjs
    - plugins/devflow/devflow/bin/lib/awareness.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs

key-decisions:
  - "_setRunGit symmetric with _setRunGh: `let _runGit = runGit; function _setRunGit(fn) { _runGit = (fn != null) ? fn : runGit; }` — exact mirror of obj 1 pattern"
  - "stdout NOT trimmed in runGit (git show content preserves whitespace); stderr IS trimmed — locked"
  - "peer_stale_days=0 disables stale filter entirely (uses -Infinity threshold) vs blocking all branches"
  - "S5 test uses 2-days-ago timestamp to pass default 30-day stale filter — test data must respect scanner filter semantics"

patterns-established:
  - "Git test injection: _setRunGit mirror of _setRunGh. Future TRDs touching git calls must route through _runGit."
  - "scanPeer fault tolerance SC-2: missing STATE.md = silent skip (no warning); malformed = warning; fetch fail = warning+continue"

requirements-completed: [SC-1, SC-2]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 6min
completed: 2026-05-04
---

# Objective 2 TRD 02: Peer Scanner Summary

**git-based peer branch scanner with _setRunGit injection hook: walks origin/* refs, reads per-branch STATE.md via git show, returns structured {branches, fetched_at, warnings, current_branch} with full fault-tolerance per SC-2**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-04T21:46:05Z
- **Completed:** 2026-05-04T21:52:00Z
- **Tasks:** 3 (fixture extension + RED phase + GREEN phase)
- **Files modified:** 3

## Accomplishments

- `scanPeer(opts)` implemented in `lib/awareness.cjs` TRD 02-02 region: git fetch + for-each-ref + per-branch git show + parseStateMd + git log; full fault tolerance (SC-2)
- `_setRunGit` / `_resetGitMock` injection hook added, exact mirror of `_setRunGh` from `lib/gh.cjs`
- 8 new fixture helpers in `awareness-fixtures.cjs`: `buildMockRunGit` + 7 canned-response builders
- 29-case test suite (Groups S/SF/SS/SP/SI/SU/SR) covering happy paths, fault tolerance, stale filtering, pattern filtering, injection mechanics

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Extend awareness-fixtures.cjs | `node -e 'const f=require("..."); for (const k of [...8 keys...]) if(typeof f[k]!=="function") throw; console.log("OK")'` | 0 | PASS |
| 2: RED phase — write failing tests | `npm test` (24 failures expected) | 1 | PASS (RED correct) |
| 3: GREEN phase — implement scanPeer | `npm test` (0 failures) | 0 | PASS |

## Task Commits

1. **Task 2 (RED phase):** `843aca8` — `test(02-02): add failing tests for scanPeer + _setRunGit injection`
2. **Task 3 (GREEN phase):** `d377444` — `feat(02-02): implement scanPeer with _setRunGit injection`

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test -- --grep awareness` | 0 | PASS |
| exports | `node -e 'const a=require(...); if(typeof a.scanPeer!=="function") throw ...; console.log("OK")'` | 0 | PASS |
| test(02-02) commit | `git log --oneline ... \| grep test\(02-02\)` | 0 | PASS |
| feat(02-02) commit | `git log --oneline ... \| grep feat\(02-02\)` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` (after test file written, before awareness.cjs GREEN) | 1 (24 failures) | FAIL (correct) |
| GREEN | `npm test` (after scanPeer implemented) | 0 (636 pass) | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (S5 test used timestamp 33 days ago — older than default 30-day stale threshold; fixed to use 2-days-ago timestamp)
- **Must-haves verified:** 11/11 (all must_haves truths verified via test suite)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/awareness.cjs` — Added TRD 02-02 region: `runGit`, `_runGit`, `_setRunGit`, `_resetGitMock`, `_matchesPattern`, `scanPeer`; updated module.exports
- `plugins/devflow/devflow/bin/lib/awareness.test.cjs` — Added Groups S/SF/SS/SP/SI/SU/SR (29 test cases)
- `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` — Added TRD 02-02 region: `buildMockRunGit` + 7 canned-response helpers; updated exports

## Decisions Made

- **_setRunGit exact mirror of _setRunGh** — `let _runGit = runGit; function _setRunGit(fn) { _runGit = (fn != null) ? fn : runGit; }` — no divergence from obj 1 pattern
- **stdout NOT trimmed in runGit** — git show needs whitespace preservation; only stderr trimmed. Locked in implementation comments.
- **peer_stale_days=0 = disabled** — uses `-Infinity` as threshold so all branches pass; locked behavior per TRD and SS3 test
- **S5 test timestamp fix** — test used `'2026-04-01T12:00:00Z'` (33 days old) which violated the 30-day default stale filter; fixed to `new Date(Date.now() - 2 * 86400000).toISOString()` (2 days ago)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] S5 test timestamp was 33 days old, violating 30-day stale filter**
- **Found during:** Task 3 (GREEN phase) — S5 was the only remaining failing test
- **Issue:** S5 used `timestamp: '2026-04-01T12:00:00Z'` (33 days before 2026-05-04) in per_branch_log. The default `peer_stale_days=30` correctly filtered this branch out, so `result.branches.length === 0` instead of 1.
- **Fix:** Changed S5 to compute `recentTs = new Date(Date.now() - 2 * 86400000).toISOString()` (2 days ago) and assert `lc.timestamp === recentTs`
- **Files modified:** `plugins/devflow/devflow/bin/lib/awareness.test.cjs`
- **Verification:** `npm test` → 636 pass, 0 fail
- **Committed in:** `d377444` (GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (1 test data bug — timestamp violated scanner's own stale filter)
**Impact on plan:** No scope creep. Test intent preserved — S5 still verifies that git log fields are populated correctly.

## Issues Encountered

None beyond the S5 test data fix above.

## Self-Check

- `d377444` feat(02-02) commit: verified via `git log --oneline ... | grep feat(02-02)` ✓
- `843aca8` test(02-02) commit: verified via `git log --oneline ... | grep test(02-02)` ✓
- `scanPeer`, `_setRunGit`, `_resetGitMock` exported: verified via node -e check ✓
- 636/636 tests passing (0 failures): verified via npm test ✓
- TRD 02-01 + 02-04 tests still pass (no regression): verified ✓

## Self-Check: PASSED

## Next Objective Readiness

- `scanPeer` is fully tested and exported — ready for TRD 02-03 (org scanner), TRD 02-05 (CLI surface), TRD 02-06 (lifecycle hook)
- `_setRunGit` injection hook ready for downstream tests in 02-07 integration tests
- TRD 02-02 region divider preserved in awareness.cjs; TRD 02-03 (org scanner, Wave 4) can append below

---
*Objective: 02-cross-repo-awareness-layer*
*Completed: 2026-05-04*

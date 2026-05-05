---
objective: 04-duplicate-work-detection
job: "01"
subsystem: dup-detect
tags: [lexical-matching, peer-scanner, org-overlap, injection-hooks, fixtures, cli]

# Dependency graph
requires:
  - objective: 02-cross-repo-awareness
    provides: scanPeer, parseStateMd, readCache, _setRunGit — peer branch aggregation
  - objective: 03-planning-time-org-awareness
    provides: scanOrgOverlap, _tokenize, _setRunFs — org project walker + tokenizer
provides:
  - detectDuplicates() — three-signal-class (hard/strong/weak) detection engine with injection hooks
  - _detectHardMatch/_detectStrongMatch/_detectWeakMatch — testable signal helpers
  - _readPeerFilesModified — git show + extractFrontmatter peer TRD reader
  - _setRunPeer/_setRunOrgOverlap/_setRunFs/_resetMocks — injection hooks
  - buildPeerBranch/buildPeerScanResult/buildOrgOverlapMatch/buildDupDetectFixtures — hand-built fixture builders
  - cmdDupDetectRoute/cmdDupDetectDetect — df-tools dup-detect CLI router
  - df-tools case 'dup-detect' arm wired and working
affects:
  - 04-02-resolution-recorder (extends dup-detect.cjs with recordResolution/applyResolution)
  - 04-03-format-detection-markdown (extends dup-detect.cjs with formatDetectionMarkdown)
  - 04-04-plan-skill-integration (calls df-tools dup-detect --mode plan)
  - 04-05-execute-skill-integration (calls df-tools dup-detect --mode execute)
  - 04-06-library-export-and-integration (finalizes module.exports + e2e tests)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "_setRunPeer/_setRunOrgOverlap higher-level injection (mocks composed scanners directly, not underlying git/fs)"
    - "files_modified short-circuit: use peer.files_modified if pre-populated, else git show fallback"
    - "execute-time advisory filtering at result construction time (not at consumer)"
    - "TDD: test: commit with failing tests → feat: commit with implementation"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/dup-detect.cjs
    - plugins/devflow/devflow/bin/lib/dup-detect.test.cjs
    - plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs
    - plugins/devflow/devflow/bin/lib/dup-detect-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "Peer files_modified short-circuit: if peer branch entry already has files_modified populated (from fixture/cache), use directly instead of git show — avoids round-trip for unit tests and cached scans"
  - "execute-time advisory=[]: filter applied at detectDuplicates() construction, not at CLI/skill consumer, per locked decision #5"
  - "Hard match from BOTH paths: peer github_issue equality (path 1) + org-overlap chain_match+issue_ref (path 2)"

patterns-established:
  - "dup-detect injection: _setRunPeer(fn) + _setRunOrgOverlap(fn) mock composed scanners at the highest useful level"
  - "TDD test grouping: H (hard), SF/SK (strong file/keyword), W (weak), RP (peer reader), D (end-to-end) in one file per module"
  - "Fixture helpers: buildDupDetectFixtures() returns all signal variants (hard/strong_file/strong_keyword/weak/no_match) in one call"

requirements-completed: [SC-1, SC-2, SC-3, SC-4]

# Verification evidence
verification:
  gates_defined: 5
  gates_passed: 5
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 8min
completed: 2026-05-04
---

# Objective 04 TRD 01: Detection engine + signal scoring + injection helpers + buildDupDetectFixtures Summary

**Lexical dup-detect engine with hard/strong/weak signal classes, _setRunPeer/_setRunOrgOverlap injection hooks, df-tools dup-detect CLI router, and hand-built fixture builders — foundation for all subsequent 04-xx TRDs**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-04T17:07:53Z
- **Completed:** 2026-05-04T17:15:30Z
- **Tasks:** 2 (RED + GREEN — TDD)
- **Files modified:** 6

## Accomplishments

- Detection engine ships: `detectDuplicates()` with 3 signal classes (hard/strong/weak), 2 detection paths for hard match (peer + org-overlap), execute-time advisory filtering at result construction
- Hand-built fixture builders added to awareness-fixtures.cjs: `buildPeerBranch`, `buildPeerScanResult`, `buildOrgOverlapMatch`, `buildDupDetectFixtures` — 4 factory functions covering all signal variants
- CLI router `cmdDupDetectRoute` wired to `df-tools.cjs` case 'dup-detect'; --mode plan/execute routes to `detectDuplicates`; resolve/log stubs for TRD 04-02
- 47 new tests (dup-detect.test.cjs: 30 cases across H/SF/SK/W/RP/D groups + module export check; dup-detect-cli.test.cjs: 8 CLI routing cases)
- All 903 tests pass (856 pre-existing + 47 new, 0 failures)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| RED: fixture builders + test files | `npm test -- --grep 'dup-detect'` (expect fail) | 1 | FAIL (correct — RED) |
| GREEN: dup-detect.cjs + cli + df-tools arm | `npm test` | 0 | PASS |
| Exports verification | `node -e 'const a=require(...); for s of [...required] if typeof a[s]==="undefined" throw; console.log("OK")'` | 0 | PASS |
| Fixture builders verification | `node -e 'const f=require(...); for s of [...] if typeof f[s]!=="function" throw; console.log("OK")'` | 0 | PASS |
| CLI help text | `node ./plugins/devflow/devflow/bin/df-tools.cjs dup-detect 2>&1 \| grep -E 'mode plan\|mode execute\|resolve\|log'` | 0 | PASS |

## Task Commits

1. **RED: fixture builders + failing tests** — `51e5d18` (test)
2. **GREEN: detection engine + CLI router + df-tools arm** — `a86cb27` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (full suite) | `npm test` | 0 | PASS |
| exports check | `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/dup-detect.cjs"); ...all 12 symbols...'` | 0 | PASS |
| fixtures check | `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); ...4 builders...'` | 0 | PASS |
| CLI routing | `node ./plugins/devflow/devflow/bin/df-tools.cjs dup-detect 2>&1 \| grep -E 'mode plan\|mode execute\|resolve\|log'` | 0 | PASS |
| test: commit exists | `git log --oneline -- dup-detect.cjs dup-detect.test.cjs \| grep -E '^[a-f0-9]+ test'` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test -- --grep 'dup-detect\|detectDuplicates'` | 1 | FAIL (correct) — module not yet created |
| GREEN | `npm test -- --grep 'dup-detect\|detectDuplicates'` | 0 | PASS (correct) — 903 total, 0 failures |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (files_modified short-circuit — see Deviations)
- **Must-haves verified:** 10/10
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/dup-detect.cjs` — Detection engine: detectDuplicates, signal helpers, injection hooks, constants
- `plugins/devflow/devflow/bin/lib/dup-detect.test.cjs` — 30+ test cases across H/SF/SK/W/RP/D groups
- `plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs` — CLI router: cmdDupDetectRoute, cmdDupDetectDetect, stubs for 04-02
- `plugins/devflow/devflow/bin/lib/dup-detect-cli.test.cjs` — 8 CLI routing + help text tests
- `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` — Extended with 4 dup-detect fixture builders
- `plugins/devflow/devflow/bin/df-tools.cjs` — Added require('./lib/dup-detect-cli.cjs') + case 'dup-detect' arm

## Decisions Made

- **files_modified short-circuit pattern:** When `_readPeerFilesModified` is called during `detectDuplicates`, if the peer branch entry already has a non-empty `files_modified` array (populated from fixture or awareness cache pre-read), use it directly rather than running `git show`. This avoids unnecessary git round-trips for unit tests and pre-cached scans. Production code falls through to git show when files_modified is absent/empty.
- **execute-time advisory=[]: filter at construction** (per locked decision #5, no change) — `detectDuplicates` always returns `{ advisory: [] }` when `mode='execute'` so all consumers see consistent shape.
- **Hard match dual-path coverage:** Org-overlap hard match (path 2) is checked before iterating peer branches, emitting a synthetic `source: 'org-overlap'` match entry without needing a peer branch to carry the issue ref.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] files_modified short-circuit for pre-populated peer branch entries**
- **Found during:** GREEN phase, test D3 (SC-3 strong file overlap)
- **Issue:** `detectDuplicates` called `_readPeerFilesModified(peer.branch, cwd)` for every peer branch. In unit tests the branch name (`feature/peer-file-overlap`) doesn't exist in the local repo, so git show returns `[]`, causing the file overlap detection to see empty peer files and miss the match.
- **Fix:** Added short-circuit: `Array.isArray(peer.files_modified) && peer.files_modified.length > 0 ? peer.files_modified : _readPeerFilesModified(...)`. Pre-populated entries (from fixtures or awareness cache) bypass the git call. TRD's intent is preserved — live detection still falls through to git show.
- **Files modified:** `plugins/devflow/devflow/bin/lib/dup-detect.cjs` (line in peer loop)
- **Verification:** D3 test passes, all 903 tests pass
- **Committed in:** `a86cb27` (feat commit — incorporated before green commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix)
**Impact on plan:** Correct behavior improvement. The short-circuit is semantically correct per CONTEXT.md — awareness cache pre-reads files_modified to avoid redundant git calls at detection time. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviation above.

## Next Objective Readiness

- TRD 04-02 (resolution recorder) can extend `dup-detect.cjs` in its region (recordResolution + applyResolution + _writeCoordinationNote + _writeDeferredState) — no conflicts with 04-01's region
- Fixture builders available for all subsequent TRDs via `buildDupDetectFixtures()`
- CLI stubs for resolve/log are in place — 04-02 replaces them with implementations
- df-tools dup-detect route is live and tested

---
*Objective: 04-duplicate-work-detection*
*Completed: 2026-05-04*

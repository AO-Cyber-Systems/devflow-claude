---
objective: 02-cross-repo-awareness-layer
job: "02-01"
subsystem: awareness
tags: [parser, fixtures, state-md, tdd, cross-repo]

requires:
  - objective: 01-github-coordination-layer
    provides: gh.cjs primitives (resolveChain, requireGhAuth, _setRunGh) that later awareness TRDs reuse

provides:
  - "lib/awareness.cjs module skeleton with parseStateMd + aggregateOrgByProductQuarter + 4 constants"
  - "lib/__fixtures__/awareness-fixtures.cjs with 5 hand-built factory builders (buildStateMd, buildOrgItem, buildSubIssue, buildOrgScanResult, buildGitFixtureRepo)"
  - "lib/awareness.test.cjs with 29 enumerated test cases (27 non-gated, 2 gated on GIT_INTEGRATION=1)"

affects: [02-02-peer-scanner, 02-03-org-scanner, 02-04-cache-layer, 02-07-library-export-and-integration]

tech-stack:
  added: []
  patterns:
    - "awareness.cjs region ownership — each TRD owns a named section divider; waves prevent concurrent edits"
    - "GIT_INTEGRATION=1 gating pattern for live-git tests (mirrors GH_INTEGRATION=1 from obj 1)"
    - "buildStateMd factory: construct-only-passed-fields pattern (no defaults beyond header/section)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/awareness.cjs
    - plugins/devflow/devflow/bin/lib/awareness.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  modified: []

key-decisions:
  - "parseStateMd returns null on any unrecognized content — fault-tolerant, never throws (Iron Law)"
  - "Objective in-flight preferred over plain **Objective:** — in-flight pattern matched first, falls back to older format"
  - "aggregateOrgByProductQuarter shape locked: { [Product]: { [Quarter]: items[] } } — TRD 02-03 emits this shape"
  - "buildStateMd constructs only explicitly-passed fields — no random defaults, test assertions stable"
  - "github_issue shorthand #11 NOT expanded by parser — expansion is scanner's job (test E7 enforces this)"
  - "TRD 02-01 region divider (// ─── TRD 02-01: parseStateMd ───) marks downstream TRDs' append boundary"

patterns-established:
  - "awareness.cjs module: each wave owns a named section divider; partial module.exports after each TRD"
  - "GIT_INTEGRATION=1 env-var gating for buildGitFixtureRepo tests"
  - "Fixture builder: all params optional with safe defaults; build only explicitly-passed fields"

requirements-completed: [SC-2]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 4min
completed: 2026-05-04
---

# Objective 2 TRD 01: STATE.md Parser + Fixtures Summary

**Fault-tolerant STATE.md parser (parseStateMd) + org aggregator (aggregateOrgByProductQuarter) + hand-built fixture-builder module that all subsequent awareness TRDs depend on**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-04T21:31:05Z
- **Completed:** 2026-05-04T21:34:55Z
- **Tasks:** 3 (Task 1: fixtures scaffold, Task 2: RED phase tests, Task 3: GREEN implementation)
- **Files modified:** 3 created

## Accomplishments

- `lib/awareness.cjs` created with `parseStateMd` (heuristic STATE.md parser, 5 field extraction patterns, null-on-garbage contract) + `aggregateOrgByProductQuarter` (stable Product x Quarter grouping) + 4 constants
- `lib/__fixtures__/awareness-fixtures.cjs` created with 5 locked-signature factory builders (buildStateMd, buildOrgItem, buildSubIssue, buildOrgScanResult, buildGitFixtureRepo) — hand-built, no LLM data
- 29 test cases across 8 groups (P/E/F/A/B/G/O) with TDD RED → GREEN ordering; all 27 non-gated pass; G1+G2 skip on GIT_INTEGRATION unset

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: awareness-fixtures.cjs scaffold | `node -e 'const f=require(...); for (const k of [...5 keys...]) if (typeof f[k] !== "function") throw new Error(k); console.log("OK")'` | 0 | PASS |
| 2: RED phase (awareness.test.cjs) | `npm test 2>&1 \| grep "fail"` → 18 failing (stub returns null/empty) | 1 (intentional RED) | PASS (RED confirmed) |
| 3: GREEN phase (awareness.cjs) | `npm test` — 592 tests, 586 pass, 0 fail, 6 skipped | 0 | PASS |

## Task Commits

1. **Task 2: RED phase tests + fixtures + stub** - `d8b3c75` (test(02-01))
2. **Task 3: GREEN implementation** - `cddcc7e` (feat(02-01))

_Note: Task 1 (fixture scaffold) bundled with Task 2 RED commit per TDD Playbook habit 4._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` (stub awareness.cjs returning null/empty) | 18 fails | FAIL (correct) |
| GREEN | `npm test` (real awareness.cjs) | 0 | PASS (correct) |
| REFACTOR | n/a — implementation was minimal and clear on first pass | — | — |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 11/11 (all truths in TRD must_haves confirmed)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/awareness.cjs` — Module skeleton with parseStateMd + aggregateOrgByProductQuarter + constants; TRD 02-01 region dividers for downstream TRD append boundaries
- `plugins/devflow/devflow/bin/lib/awareness.test.cjs` — 29-case test suite covering happy paths, edge cases, failure modes, factory contracts
- `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` — 5 hand-built factory builders with locked signatures (TRDs 02-02, 02-03, 02-04, 02-07 call these)

## Decisions Made

- `parseStateMd` returns null on no-recognizable-fields (not empty object) — callers check for null to skip branch
- `**Objective in flight:**` pattern matched before `**Objective:**` — in-flight is the canonical v1.1 format; plain falls back for older repos
- `github_issue` shorthand `#11` returned as-is — expansion to full ref is scanner's job, not parser's
- Factory function `buildStateMd` includes ONLY explicitly-passed fields in output — no surprise defaults that mask test assertion gaps
- `buildGitFixtureRepo` throws (not returns null) on git-not-installed; callers `t.skip()` on that error — mirrors GH_INTEGRATION=1 pattern

## Deviations from Plan

None — TRD executed exactly as written. Stub awareness.cjs created during RED phase as directed by TRD recovery note (consistent failure before GREEN).

## Issues Encountered

None.

## Next Objective Readiness

- TRD 02-04 (cache layer, Wave 2): can now `require('./awareness.cjs')` and append `readCache`/`writeCache`/`isStale` after the `// ─── TRD 02-01: parseStateMd ───` region
- TRD 02-02 (peer scanner, Wave 3): `buildGitFixtureRepo` and `buildStateMd` are ready for its GIT_INTEGRATION-gated tests
- TRD 02-03 (org scanner, Wave 4): `buildOrgItem`, `buildOrgScanResult`, `buildSubIssue` are ready
- TRD 02-07 (export lock, Wave 7): test suite already has 29 cases; wave 7 appends integration cases

## Self-Check: PASSED

- `awareness.cjs` exists: FOUND
- `awareness.test.cjs` exists: FOUND
- `awareness-fixtures.cjs` exists: FOUND
- Commit `d8b3c75` (test:): FOUND
- Commit `cddcc7e` (feat:): FOUND
- Test suite: 592 total, 586 pass, 0 fail, 6 skipped

---
*Objective: 02-cross-repo-awareness-layer*
*Completed: 2026-05-04*

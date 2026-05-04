---
objective: 02-cross-repo-awareness-layer
job: "07"
subsystem: awareness
tags: [awareness, integration-tests, cassette, tdd, export-surface]

requires:
  - objective: 02-cross-repo-awareness-layer
    provides: "lib/awareness.cjs with all 6 waves of functions (parseStateMd, aggregateOrgByProductQuarter, readCache, writeCache, isStale, scanPeer, scanOrg, parseTaskListFallback, _setRunGit, _resetGitMock, 4 constants)"
  - objective: 01-github-coordination-layer
    provides: "gh.cjs walkProject + _setRunGh test hook; __fixtures__/gh-cassettes/ pattern"
provides:
  - "Locked 14-entry lib/awareness.cjs module.exports surface (SC-9 asserted by L1 test)"
  - "product-roadmap-walk.json cassette captured live (48 items, 1 page) for replay testing"
  - "Integration tests gated on GIT_INTEGRATION=1 (IT1 peer scan with self-remote) and GH_INTEGRATION=1 (OT1 live walk)"
  - "Cache round-trip integration tests (CT1-CT3) in default test run"
  - "Cassette replay tests (CR1-CR3) in default test run"
  - "Bug fix: scanPeer for-each-ref pattern corrected (refs/remotes/origin/ not refs/remotes/origin/*)"
affects: [obj-4-duplicate-detection, obj-5-initiative-context, obj-6-check-todos, obj-8-tui]

tech-stack:
  added: []
  patterns:
    - "Export surface lock via deepStrictEqual on Object.keys (L1 test pattern)"
    - "Self-remote fixture: git remote add origin <self> + git fetch --all populates refs/remotes/origin/ for scanPeer"
    - "Cassette capture: recording wrapper around _setRunGh captures live GraphQL response to disk"
    - "Replay pattern: load cassette from disk, inject via gh._setRunGh, assert shape not strict content"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json
    - .planning/objectives/02-cross-repo-awareness-layer/02-07-library-export-and-integration-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/awareness.cjs
    - plugins/devflow/devflow/bin/lib/awareness.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs

key-decisions:
  - "for-each-ref pattern corrected from refs/remotes/origin/* to refs/remotes/origin/ — git glob * does not cross path separators so nested branches like feature/foo were never enumerated"
  - "IT1 self-remote trick: fixture repo adds itself as origin and fetches so refs/remotes/origin/ refs populate for scanPeer integration test"
  - "Cassette captured as single merged object (48 items from 1 page) — multi-page merge logic included for future use"
  - "CR tests guard on _placeholder field so placeholder cassette (if ever committed) gracefully skips replay assertions"

patterns-established:
  - "Cassette pattern: capture once with recording wrapper + inject via _setRunGh for replay; same as obj 1 pattern"
  - "Integration test env gates: SKIP_GIT_INTEG = GIT_INTEGRATION !== '1'; SKIP_GH_INTEG = GH_INTEGRATION !== '1'"

requirements-completed: [SC-9, SC-10]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-05-04
---

# Objective 02 TRD 07: Library Export and Integration Summary

**Locked 14-entry lib/awareness.cjs export surface + live product-roadmap-walk.json cassette (48 items) + integration tests gated on GIT_INTEGRATION/GH_INTEGRATION env vars**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-04T22:28:51Z
- **Completed:** 2026-05-04T22:37:33Z
- **Tasks:** 2 (Task 1: RED, Task 2: GREEN + bug fix)
- **Files modified:** 4

## Accomplishments

- Export surface lock test (L1) asserts exact 14-entry `Object.keys` equality — prevents accidental drift in obj 4/5/6
- Live cassette captured from PVT_kwDODwqLrc4BRsOP: 48 Product Roadmap items, 1 page, committed as product-roadmap-walk.json
- Integration test pair: IT1 (peer, GIT_INTEGRATION=1) and OT1 (org, GH_INTEGRATION=1) both pass; both skip cleanly without env
- Cache round-trip tests (CT1-CT3) and cassette replay tests (CR1-CR3) pass in default `npm test`
- Bug fix: `scanPeer` for-each-ref pattern corrected — `refs/remotes/origin/*` glob misses nested branches like `feature/foo`; fixed to `refs/remotes/origin/` (trailing slash)
- All 731 tests pass (718 pass + 13 skip in default run; 731/731 with both integration flags)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — write failing tests | `npm test` (L1,L2,CT1-CT3,CR1-CR3 pass; IT/OT skip) | 0 | PASS |
| 2: GREEN — lock exports + cassette capture + bug fix | `npm test` (731 tests, 0 fail) | 0 | PASS |
| Verify 14 exports | `node -e 'const a=require(...); for (const k of expected) if (a[k] === undefined) throw...'` | 0 | PASS |
| Cassette exists | `test -f plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json` | 0 | PASS |
| Integration flags | `GIT_INTEGRATION=1 GH_INTEGRATION=1 npm test` (731 pass, 0 fail) | 0 | PASS |

## Task Commits

1. **Task 1: RED** - `d0d2642` (test(02-07): add library surface lock + integration + cassette replay tests)
2. **Task 2: GREEN** - `5ae30b0` (feat(02-07): lock awareness.cjs export surface + capture product-roadmap cassette)
3. **Rule 1 Bug Fix** - `617d946` (feat(02-07): fix scanPeer for-each-ref pattern + wire IT1 self-remote setup)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (default) | `npm test` | 0 | PASS |
| test (integration) | `GIT_INTEGRATION=1 GH_INTEGRATION=1 npm test` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` (with new L/CT/IT/CR/OT groups) | 0 | PASS (L1,L2,CT1-CT3,CR1-CR3 pass; IT/OT skip — no env set) |
| GREEN | `npm test` (after export lock + cassette + bug fix) | 0 | PASS (731 tests, 0 fail) |
| GREEN (integration) | `GIT_INTEGRATION=1 GH_INTEGRATION=1 npm test` | 0 | PASS (731/731) |

Note: RED phase tests had no failures at commit time because L1 test happened to pass (exports were already correct) and IT/OT tests skipped (no env). This is expected for a "lock" TRD — we're asserting the already-correct surface, not driving new feature code.

## Post-TRD Verification

- **Auto-fix cycles used:** 1
- **Must-haves verified:** 6/6 (export lock, cassette shape, peer integration, org integration, cache round-trip, cassette replay)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/awareness.cjs` — module.exports block updated with authoritative 14-entry lock comment; for-each-ref bug fixed (Rule 1)
- `plugins/devflow/devflow/bin/lib/awareness.test.cjs` — Groups L, CT, IT, CR, OT added (12 test cases); mock keys updated for corrected for-each-ref pattern
- `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json` — Created: live cassette, 48 items, 1 GraphQL page
- `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` — Docstring comment updated for corrected for-each-ref command

## Decisions Made

- **for-each-ref pattern fix** — `refs/remotes/origin/*` (glob) was silently skipping all branches with `/` in their name (e.g., `feature/foo`, `df/obj-2`). Fixed to `refs/remotes/origin/` (trailing slash = recursive prefix match). All mock keys and docstrings updated. This is the correct git behavior per documentation.
- **Self-remote trick for IT1** — `buildGitFixtureRepo` creates local branches only. To get `refs/remotes/origin/*` populated, IT1 adds the fixture root as `origin` and runs `git fetch --all`. Same pattern as existing SR1 test.
- **Cassette capture at execution time** — auth (project, repo scopes) was available at agent execution time, so the cassette was captured live (48 items) rather than committed as a placeholder. No placeholder needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed scanPeer for-each-ref glob pattern missing nested branch names**

- **Found during:** Task 2 GREEN phase — IT1 integration test with GIT_INTEGRATION=1
- **Issue:** `git for-each-ref refs/remotes/origin/*` uses glob `*` which does NOT match path separators. Branches like `feature/foo` are stored at `refs/remotes/origin/feature/foo` (2 levels deep), so the pattern only returned `origin` and `origin/main` from the fixture.
- **Fix:** Changed pattern to `refs/remotes/origin/` (trailing slash) which is a prefix match and includes all sub-paths recursively. Updated all mock test keys (`for-each-ref refs/remotes/origin/ --format=%(refname:short)`) and `awareness-fixtures.cjs` docstring.
- **Files modified:** `awareness.cjs`, `awareness.test.cjs`, `awareness-fixtures.cjs`
- **Verification:** All 731 tests pass; IT1 finds 2 branches correctly with GIT_INTEGRATION=1
- **Committed in:** `617d946`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** Essential — scanPeer was silently returning 0 branches for all branch-pattern-matched names containing `/`. Production feature branches (feature/*, df/*, fix/*, proposal/*) ALL have slashes and would have been invisible. Critical correctness fix.

## Issues Encountered

None beyond the for-each-ref bug above.

## Next Objective Readiness

- Objective 2 COMPLETE — all 10 SC met across waves 1-7
- `lib/awareness.cjs` export surface is locked and integration-tested; safe for obj 4/5/6/8 consumption
- Cassette committed; replay tests pass in CI without auth
- Integration test pairs provide regression protection for live scanPeer + scanOrg behavior

---
*Objective: 02-cross-repo-awareness-layer*
*Completed: 2026-05-04*

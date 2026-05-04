---
objective: 01-github-coordination-layer
job: "03"
subsystem: auth
tags: [github, auth, error-handling, cli, gh-cli]

# Dependency graph
requires:
  - objective: 01-github-coordination-layer
    trd: "01-02"
    provides: resolveChain, findRoadmapIssue, addToProject, linkSubIssue, cmdGhResolve, _setRunGh test injection hook
provides:
  - requireGhAuth(requiredScopes) — hard-fail auth check throwing structured GhAuthError
  - GhAuthError class with .name, .remediation, .scopes_missing fields
  - parseScopes(stdout) — internal gh auth status output parser (single/double quote, multiline)
  - cmdGhResolve hard-fail integration — exits non-zero with structured stderr JSON on auth failure
affects:
  - 01-04-gh-sync-skill-and-cli (will call requireGhAuth for new subcommands)
  - 01-05-pm-backend-seam (any new gh-gated commands should use requireGhAuth)
  - 01-06-dogfood-and-integration (integration tests will hit auth gate path)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hard-fail auth layer — requireGhAuth throws GhAuthError; structured stderr JSON + exit(1)"
    - "Graceful-skip vs hard-fail co-existence — existing subcommands use ghStatus(); new ones use requireGhAuth()"
    - "GhAuthError shape — extends Error with .remediation (runnable shell command) and .scopes_missing array"
    - "Exact remediation format — comma-joined scopes: gh auth refresh -h github.com -s scope1,scope2"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/gh.test.cjs

key-decisions:
  - "Hard-fail is a hard inversion of the existing graceful-skip pattern — both coexist; new resolver subcommands use requireGhAuth, existing sync/comment/close-issue subcommands keep ghStatus graceful-skip (back-compat locked in CONTEXT.md §7)"
  - "Structured stderr JSON on auth failure — { error, remediation, scopes_missing } — stdout stays clean for downstream JSON consumers"
  - "Exact remediation argument order locked: -h github.com -s scope1,scope2 (comma-joined, not repeated -s flags)"
  - "parseScopes handles both single-quote (modern gh 2.40+) and double-quote (older) scope formats plus multiline wrapping"
  - "H1/H2/H3/H4 existing cmdGhResolve tests updated to include auth status mock — required because cmdGhResolve now calls requireGhAuth before any resolve logic (Rule 1 auto-fix)"

patterns-established:
  - "requireGhAuth pattern: call at top of any gh-gated CLI command; throw GhAuthError on any failure; callers write structured error to stderr + exit(1)"
  - "Test injection pattern (established TRD 01-02, reinforced 01-03): _setRunGh mock includes auth status key for all cmdGhResolve tests"

requirements-completed: [SC-8]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 18min
completed: 2026-05-04
---

# Objective 01 TRD 03: Auth + Error Handling Summary

**GhAuthError class + requireGhAuth() hard-fail wrapper added to gh.cjs, wired into cmdGhResolve with structured stderr JSON and non-zero exit on missing binary, unauthenticated, expired token, or insufficient scopes**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-04T19:56:40Z
- **Completed:** 2026-05-04T20:14:40Z
- **Tasks:** 2 (RED + GREEN, no REFACTOR needed)
- **Files modified:** 2

## Accomplishments

- `GhAuthError` class with `.name === 'GhAuthError'`, `.remediation` (runnable shell command), `.scopes_missing` (always array)
- `requireGhAuth(requiredScopes)` distinguishes 4 fail modes: no binary (install URL), unauthenticated (gh auth login), expired token (gh auth refresh), insufficient scopes (gh auth refresh -h github.com -s <comma-joined>)
- `parseScopes(stdout)` handles single-quote/double-quote scope formats and multiline scope lists from older gh versions
- `cmdGhResolve` now hard-fails with structured JSON to stderr + `process.exit(1)` on auth failure; stdout stays clean
- 20 new tests (Groups A-E); 503/503 total tests pass; existing 483 unaffected

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 (RED): Add failing tests | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` | 0 (503 tests, 486 pass, 17 fail) | PASS (RED confirmed) |
| 2 (GREEN): Implement requireGhAuth | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` | 0 (503 tests, 503 pass, 0 fail) | PASS |

## Task Commits

1. **Task 1: RED — failing test list** - `f673a31` (test)
2. **Task 2: GREEN — implementation** - `91289c4` (feat)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |
| export-check | `node -e 'const gh=require("./plugins/devflow/devflow/bin/lib/gh.cjs"); if(typeof gh.requireGhAuth!=="function") throw new Error("not exported"); console.log("OK");'` | 0 | PASS |
| remediation-check | `node -e 'const gh=require(...); gh._setRunGh(()=>({ok:false,...})); gh.requireGhAuth([...])'` | 0 | PASS |
| test-commit-check | `git log --oneline feature/v1.1 -- lib/gh.cjs lib/gh.test.cjs \| grep test\\(01-03\\)` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` (after adding tests, before implementation) | 0 runner exit / 17 test failures | FAIL (correct — 17 tests referencing requireGhAuth/GhAuthError/cmdGhResolve hard-fail) |
| GREEN | `npm test` (after implementing requireGhAuth + wiring) | 0 | PASS (503/503) |
| REFACTOR | N/A | — | Skipped — small surface, no cleanup needed |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (H1/H2/H3/H4 test updates)
- **Must-haves verified:** 7/7 (all TRD truths confirmed by test pass)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/gh.cjs` — Added `GhAuthError` class, `parseScopes()` internal helper, `requireGhAuth()` public function, auth guard at top of `cmdGhResolve`; exports updated
- `plugins/devflow/devflow/bin/lib/gh.test.cjs` — Added 20 tests (Groups A-E TRD 01-03); H1/H2/H3/H4 mocks updated to include `auth status` key

## Decisions Made

- Hard-fail is a hard inversion of the existing graceful-skip pattern — both coexist in same module. `requireGhAuth` throws; `ghStatus` returns. New resolver subcommands use the former; existing sync/comment/close-issue subcommands keep the latter. Back-compat locked in CONTEXT.md §7.
- Structured stderr JSON on auth failure — `{ error, remediation, scopes_missing }` — stdout stays clean so downstream JSON consumers (e.g., piping `gh resolve` output into scripts) are not corrupted.
- Exact remediation argument order locked: `gh auth refresh -h github.com -s scope1,scope2` (comma-joined, not repeated `-s` flags). Test B4 enforces this.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated H1/H2/H3/H4 cmdGhResolve tests to mock auth status**
- **Found during:** Task 2 (GREEN phase, after implementing requireGhAuth)
- **Issue:** Existing Group H tests called `cmdGhResolve` but their `buildMockRunGh` maps did not include an `auth status` key. After wiring `requireGhAuth` into `cmdGhResolve`, the auth check ran first and received `{ ok: false }` from the default mock fallback, triggering `GhAuthError` before the resolve logic ran.
- **Fix:** Added `['auth status', { ok: true, status: 0, stdout: AUTH_STDOUT_FULL_SCOPES, stderr: '' }]` to H1, H2, H3, H4 mock maps. H3 already happened to pass (its assertion checks for either "objective not found" OR non-zero exit, which was satisfied by the GhAuthError path), but was corrected for clarity. H4 failed because it expected `exit(0)`.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh.test.cjs`
- **Committed in:** `91289c4` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in existing tests)
**Impact on plan:** Necessary correctness fix. No scope creep. Pre-existing test behavior was implicitly assuming no auth gate; the new gate made that assumption explicit and testable.

## Issues Encountered

None beyond the H1/H2/H3/H4 test update documented above.

## Next Objective Readiness

- Wave 3 complete. `requireGhAuth` is ready for use by any new subcommand in TRD 01-04.
- TRD 01-04 (gh-sync skill + CLI) should call `requireGhAuth(['project', 'read:project', 'repo'])` at the top of each new `cmdGh*` function that performs live API calls.
- Back-compat surface confirmed stable: `cmdGhSyncObjectives`, `cmdGhComment`, `cmdGhCloseIssue`, `cmdGhSyncRelease` all pass unchanged.

---
*Objective: 01-github-coordination-layer*
*Completed: 2026-05-04*

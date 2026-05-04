---
objective: 02-cross-repo-awareness-layer
job: 02-03
subsystem: awareness
tags: [github, graphql, project-v2, org-scanner, task-list-parser, tdd]

requires:
  - objective: 02-01
    provides: parseStateMd, aggregateOrgByProductQuarter, awareness-fixtures.cjs scaffold
  - objective: 02-02
    provides: scanPeer, _setRunGit injection, peer scanner baseline
  - objective: 02-04
    provides: readCache, writeCache, isStale cache layer
  - objective: 01-06
    provides: PRODUCT_ROADMAP_FIELDS._project_id, requireGhAuth, _setRunGh injection, GhAuthError

provides:
  - walkProject(projectId) in lib/gh.cjs — paginates Project v2 items via GraphQL, returns flat array with sub_issues
  - scanOrg(opts) in lib/awareness.cjs — requireGhAuth-first, composes walkProject + task-list enrichment
  - parseTaskListFallback(body) in lib/awareness.cjs — parses - [ ]/- [x] checkbox lines for sub-issue fallback

affects: [02-05-skill-and-cli, 02-06-lifecycle-integration, 02-07-library-export-and-integration]

tech-stack:
  added: []
  patterns:
    - "walkProject pagination: while(true) + pageCount guard (MAX_PAGES=100) + endCursor threading"
    - "Task-list fallback: regex /^\\s*[-*]\\s+\\[([ xX])\\]\\s+(\\S*#\\d+)/ matches both full and shorthand refs"
    - "sub_issues_source annotation: 'tracked_issues'|'task_list'|'none' per enriched item"
    - "Auth mock format: text 'Token scopes: ...' not JSON — matches parseScopes() in gh.cjs"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/gh.test.cjs
    - plugins/devflow/devflow/bin/lib/awareness.cjs
    - plugins/devflow/devflow/bin/lib/awareness.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs

key-decisions:
  - "walkProject lives in lib/gh.cjs (not awareness.cjs) — it's a GitHub primitive obj 5/6 also reuse; shares _runGh injection"
  - "walkProject does NOT call requireGhAuth — auth is caller's responsibility (scanOrg calls it first)"
  - "parseTaskListFallback uses \\S*#\\d+ (not \\S+#\\d+) to handle shorthand #NN refs"
  - "Auth mock for requireGhAuth must use 'Token scopes: ...' text format — parseScopes() parses text, not JSON"
  - "sub_issues_source annotation added per item ('tracked_issues'|'task_list'|'none') for skill renderer provenance"
  - "parseTaskListFallback exported separately from scanOrg per SC-9 export-lock requirement (TRD 02-07)"

patterns-established:
  - "Fixture mock for gh auth status: use text format 'github.com\\n  ✓ Logged in\\n  - Token scopes: ...' matching parseScopes()"
  - "buildGhResponse_projectItemsList: items[] with content_type, issue_ref, tracked_total/tracked_nodes fields"

requirements-completed: [SC-3, SC-4, SC-5]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-05-04
---

# Objective 2 TRD 3: Org Scanner — walkProject + scanOrg with task-list fallback Summary

**GraphQL Project v2 walker (walkProject in gh.cjs) + org-scan orchestrator (scanOrg + parseTaskListFallback in awareness.cjs) with requireGhAuth-first hard-fail and checkbox body-parsing fallback for sub-issues**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-04T21:55:30Z
- **Completed:** 2026-05-04T22:04:12Z
- **Tasks:** 3 (fixtures + 2 RED/GREEN cycles)
- **Files modified:** 5

## Accomplishments

- `walkProject(projectId)` added to `lib/gh.cjs`: paginates Project v2 items via GraphQL with 100-page loop guard, normalizes to `{item_type, issue_ref, title, body, product, quarter, status, sub_issues}` for both Issue and DraftIssue content types
- `parseTaskListFallback(body)` + `scanOrg(opts)` added to `lib/awareness.cjs`: auth-first ordering enforced (OA1/OA2 tests prove it), task-list fallback activates when `trackedIssues` is empty (current reality for all 9 [Roadmap] issues)
- 31 enumerated test cases all pass; 667 total tests pass (up from 636), 0 fail

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Extend gh-fixtures.cjs | `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs"); for (const k of ["buildGhResponse_projectItemsList","buildGhResponse_subIssuesByTrackedIssues","buildGhResponse_subIssuesByTaskList"]) if (typeof f[k] !== "function") throw new Error(k); console.log("OK")'` | 0 | PASS |
| 2: RED+GREEN walkProject | `npm test -- --grep "02-03"` (W1-W7, WF1-WF4, GG1-GG2 pass) | 0 | PASS |
| 3: RED+GREEN scanOrg | `npm test -- --grep "02-03"` (T1-T7, O1-O5, OA1-OA2, OS1, F1-F3 pass) | 0 | PASS |

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend gh-fixtures.cjs** - fixtures appended, no separate commit (included in RED commit)
2. **Task 2: RED — walkProject tests** - `ffdbffc` (test(02-03))
3. **Task 2: GREEN — walkProject impl** - `91766ef` (feat(02-03))
4. **Task 3: RED — scanOrg tests** - `0838037` (test(02-03))
5. **Task 3: GREEN — scanOrg impl** - `db89e0a` (feat(02-03))

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## TDD Evidence

### Cycle 1: walkProject (lib/gh.cjs)

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test -- --grep "02-03"` (W1-W7, WF1-WF4, GG1-GG2) | 1 | FAIL (correct — walkProject undefined) |
| GREEN | `npm test -- --grep "02-03"` | 0 | PASS (correct — 13 new tests pass) |

### Cycle 2: scanOrg + parseTaskListFallback (lib/awareness.cjs)

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test -- --grep "02-03"` (T1-T7, O1-O5, OA1-OA2, OS1) | 1 | FAIL (correct — scanOrg/parseTaskListFallback undefined) |
| GREEN | `npm test -- --grep "02-03"` | 0 | PASS (correct — 18 new awareness tests pass) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (regex fix for T3 shorthand `#50` ref; auth mock format fix for O1-O5)
- **Must-haves verified:** 11/11 (all TRD must_haves verified via test cases)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/gh.cjs` — walkProject function + module.exports extended
- `plugins/devflow/devflow/bin/lib/gh.test.cjs` — Groups W, WF, GG (13 tests)
- `plugins/devflow/devflow/bin/lib/awareness.cjs` — gh require + parseTaskListFallback + scanOrg + module.exports extended
- `plugins/devflow/devflow/bin/lib/awareness.test.cjs` — Groups T, O, OA, OS, F (18 tests)
- `plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs` — 3 new factory builders

## Decisions Made

- `walkProject` uses `\S*#\d+` (zero-or-more before `#`) rather than `\S+#\d+` to handle shorthand `#NN` refs (T3 catch)
- Auth mock in O tests uses text format `"Token scopes: 'project', ..."` not JSON — matches `parseScopes()` which parses `gh auth status` text output (O1-O5 fix, Rule 1 auto-fix)
- `parseTaskListFallback` exported separately from `scanOrg` per SC-9 export-lock (TRD 02-07 verifier warning honored)
- `sub_issues_source: 'tracked_issues'|'task_list'|'none'` annotation added per item beyond TRD spec — low-cost provenance for skill renderer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] parseTaskListFallback regex too strict for shorthand refs**
- **Found during:** Task 3 RED phase (T3 failing: `parseTaskListFallback('- [ ] #50')` returned `[]`)
- **Issue:** Regex `\S+#\d+` requires 1+ non-whitespace chars before `#`, so `#50` (starts with `#`) didn't match
- **Fix:** Changed to `\S*#\d+` (zero-or-more before `#`) — handles both `owner/repo#NN` and `#NN`
- **Files modified:** `plugins/devflow/devflow/bin/lib/awareness.cjs`
- **Verification:** T3 passes after fix
- **Committed in:** db89e0a (Task 3 GREEN commit)

**2. [Rule 1 - Bug] Auth mock format mismatch for O tests**
- **Found during:** Task 3 GREEN phase (O1-O5 throwing GhAuthError despite ok:true mock)
- **Issue:** O tests used `JSON.stringify([{token:{scopes:[...]}}])` as stdout, but `requireGhAuth` calls `parseScopes(r.stdout)` which parses `gh auth status` text output (looks for `Token scopes:` line), not JSON
- **Fix:** Changed all O-group auth mocks to text format: `"github.com\n  ✓ Logged in\n  - Token scopes: 'project', 'read:project', 'repo'"`
- **Files modified:** `plugins/devflow/devflow/bin/lib/awareness.test.cjs`
- **Verification:** O1-O5, OS1 all pass after fix
- **Committed in:** db89e0a (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs — regex + mock format)
**Impact on plan:** Both fixes necessary for correctness. No scope creep. The regex fix corrects TRD test case T3 (shorthand ref support was in the spec). The mock fix corrects test infrastructure to match the real parseScopes contract.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## Next Objective Readiness

- SC-3, SC-4, SC-5 satisfied — org scanner complete
- `walkProject` + `scanOrg` + `parseTaskListFallback` exported and tested
- TRD 02-05 (skill + CLI) can now wire `df-tools awareness scan-org` against `scanOrg`
- TRD 02-07 export-lock test will find `parseTaskListFallback` in module.exports (per verifier warning honored)

---
*Objective: 02-cross-repo-awareness-layer*
*Completed: 2026-05-04*

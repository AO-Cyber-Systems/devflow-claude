---
objective: 01-github-coordination-layer
job: "06"
subsystem: github-integration
tags: [gh-cli, graphql, cassettes, replay-mode, integration-test, project-v2]

requires:
  - objective: 01-github-coordination-layer/01-05
    provides: pm-backend seam (getBackend dispatch)
  - objective: 01-github-coordination-layer/01-04
    provides: syncObjective + PRODUCT_ROADMAP_FIELDS stub + updateProjectFields stub
  - objective: 01-github-coordination-layer/01-03
    provides: requireGhAuth + GhAuthError
  - objective: 01-github-coordination-layer/01-02
    provides: resolveChain + _walkParent + _setRunGh + _resetCache

provides:
  - "obj 0 OBJECTIVE.md with github_issue/parent_issue frontmatter (dogfood target)"
  - "gh-cassettes/devflow-claude-9-walk.json — recorded GraphQL walk of devflow-claude#9"
  - "gh-cassettes/product-roadmap-fields.json — Product Roadmap field-list"
  - "PRODUCT_ROADMAP_FIELDS constant populated from cassette (_captured: true, flat field structure)"
  - "updateProjectFields fully wired using captured field IDs + addToProject-first pattern"
  - "Replay-mode integration tests (22 new tests, Groups H-L)"
  - "requireGhAuth scope inheritance: project covers read:project"

affects:
  - objective 2 and beyond (planner reads resolver output; sync uses updateProjectFields)
  - any future TRD that calls syncObjective or updateProjectFields

tech-stack:
  added: []
  patterns:
    - "Cassette-based replay testing: captured JSON committed as __fixtures__/gh-cassettes/, tests load via fs.readFileSync"
    - "Scope inheritance in requireGhAuth: SCOPE_SUPERSET map, project covers read:project"
    - "addToProject-first pattern in updateProjectFields: idempotent membership before mutation"
    - "Live-mode gating: GH_INTEGRATION=1 env var controls whether L-group tests run or skip"

key-files:
  created:
    - ".planning/objectives/00-refine-defaults-table/OBJECTIVE.md"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json"
  modified:
    - "plugins/devflow/devflow/bin/lib/gh.cjs"
    - "plugins/devflow/devflow/bin/lib/gh.test.cjs"

key-decisions:
  - "PRODUCT_ROADMAP_FIELDS loaded at module init from cassette (sync fs.readFileSync at require time); flat structure: PRODUCT_ROADMAP_FIELDS.Status = { field_id, options } not nested under .fields sub-key"
  - "updateProjectFields calls addToProject first (idempotent membership); falls back to project items query on already_exists error path"
  - "requireGhAuth SCOPE_SUPERSET: project scope covers read:project (GitHub's implicit hierarchy); avoids auth refresh requirement when full project access is already granted"
  - "Cassette for devflow-claude-9-walk uses _walkParent's existing GraphQL shape (project { id title } already included); no change to production query needed"
  - "E1/E2/E4 updateProjectFields tests updated to match new 4-call sequence (addToProject x2 + mutations); prior mock had 3-call sequence for old getItemId-first pattern"
  - "L-group live tests (GH_INTEGRATION=1) all pass: L1+L2 prove cassette shape matches live data; L3+L4 prove sync round-trip is idempotent"

requirements-completed: [SC-9, SC-10]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 45min
completed: 2026-05-04
---

# Objective 01 TRD 06: Dogfood + Integration Summary

**End-to-end round-trip validated: devflow-claude#20 walks to #9 via resolveChain, cassettes recorded from live gh API, PRODUCT_ROADMAP_FIELDS populated with real Product Roadmap field IDs (Status, Product, Quarter), and syncObjective proven idempotent against live GitHub**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-04T (wave 6)
- **Completed:** 2026-05-04
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 5

## Accomplishments

- Backfilled `00-refine-defaults-table/OBJECTIVE.md` with `github_issue: AO-Cyber-Systems/devflow-claude#20` and `parent_issue: AO-Cyber-Systems/devflow-claude#9` — the dogfood target for resolver + sync
- Captured two cassettes from live gh API: `devflow-claude-9-walk.json` (GraphQL walk of #9 → Product Roadmap) and `product-roadmap-fields.json` (Status/Product/Quarter field IDs + option IDs)
- `PRODUCT_ROADMAP_FIELDS` now loads from cassette at module-init time (`_captured: true`, flat field structure); `updateProjectFields` fully wired using captured IDs
- 22 new tests across Groups H–L (18 pass default, 4 live pass with `GH_INTEGRATION=1`); all 541 pre-existing tests still pass
- `requireGhAuth` extended with SCOPE_SUPERSET map: `project` scope covers `read:project` (GitHub implicit hierarchy), preventing false auth failures when full project access is already granted

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED (integration tests) | `npm test 2>&1 \| grep -E '^ℹ (tests\|fail)'` | 1 (fail expected) | PASS (18 RED) |
| 2: GREEN (cassettes + constants) | `npm test 2>&1 \| grep -E '^ℹ (tests\|pass\|fail)'` | 0 | PASS |
| 2: cassette files | `test -f plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json` | 0 | PASS |
| 2: OBJECTIVE.md | `grep -q github_issue .planning/objectives/00-refine-defaults-table/OBJECTIVE.md` | 0 | PASS |
| 2: live tests | `GH_INTEGRATION=1 npm test 2>&1 \| grep -E '^ℹ (tests\|pass\|fail)'` | 0 | PASS (563/563) |

## Task Commits

Each task was committed atomically:

1. **Task 1: RED** - `2c74f9e` (test: add failing integration tests + cassette schema assertions for dogfood + live round-trip)
2. **Task 2: GREEN** - `97855d0` (feat: backfill obj 0 OBJECTIVE.md, capture cassettes, populate PRODUCT_ROADMAP_FIELDS, finalize updateProjectFields)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (default) | `npm test` | 0 | PASS (559/563 pass, 4 skip) |
| test (live) | `GH_INTEGRATION=1 npm test` | 0 | PASS (563/563 pass) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test 2>&1 \| grep -E "^ℹ (tests\|fail)"` — 18 fail | 1 | FAIL (correct — Groups H,I,J,K all red) |
| GREEN | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` — 559 pass, 0 fail | 0 | PASS (correct) |
| REFACTOR | n/a — no refactor pass needed | n/a | n/a |

## Post-TRD Verification

- **Auto-fix cycles used:** 1
- **Must-haves verified:** 7/7 (OBJECTIVE.md backfill, both cassettes, PRODUCT_ROADMAP_FIELDS._captured, replay tests, live tests, df-tools gh resolve chain)
- **Gate failures:** None

## Files Created/Modified

- `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md` — Frontmatter declaring github_issue + parent_issue for obj 0 (dogfood target)
- `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json` — Captured GraphQL response for devflow-claude#9 walk (project item + field values)
- `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json` — Captured `gh project field-list` output (Status, Product, Quarter field IDs + option IDs)
- `plugins/devflow/devflow/bin/lib/gh.cjs` — PRODUCT_ROADMAP_FIELDS populated from cassette; updateProjectFields rewritten with addToProject-first pattern; requireGhAuth SCOPE_SUPERSET added
- `plugins/devflow/devflow/bin/lib/gh.test.cjs` — 22 new tests (Groups H-L); E1/E2/E4 updated for new updateProjectFields call sequence

## Decisions Made

- **PRODUCT_ROADMAP_FIELDS flat structure** — Fields live directly on the constant (`PRODUCT_ROADMAP_FIELDS.Status`) not under a nested `.fields` sub-key. Simplifies access and aligns with the TRD's codebase_examples pattern.
- **updateProjectFields addToProject-first** — Calls `addToProject(issueRef, projectId)` before mutations to ensure issue is in the project. On `already_exists` error, falls back to querying `projectItems` nodes to find existing `item_id`. This is the idempotent membership contract.
- **requireGhAuth SCOPE_SUPERSET** — GitHub's `project` scope implicitly grants `read:project` access. The `parseScopes` output shows `'project'` not `'read:project'` when refresh was done with `-s project`. The SCOPE_SUPERSET map (`read:project: ['project']`) prevents false auth failures without weakening the check for cases where only `read:project` is present.
- **Cassette stability** — Cassettes are committed artifacts, not regenerated on test runs. The E4 drift-detection pattern (L2 test) compares live result against cassette and fails if the `product` field changes, surfacing drift without auto-overwriting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] requireGhAuth false-positive on read:project when project scope present**
- **Found during:** Task 2 (live integration tests L3/L4)
- **Issue:** `requireGhAuth(['project', 'read:project', 'repo'])` threw GhAuthError for `read:project` even though the token has `project` scope, which in GitHub's hierarchy covers `read:project`. This caused L3/L4 live tests to fail.
- **Fix:** Added `SCOPE_SUPERSET = { 'read:project': ['project'] }` map in `requireGhAuth`. Missing scope check now checks if any superset scope is present before flagging as missing.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh.cjs`
- **Verification:** L3+L4 pass with `GH_INTEGRATION=1 npm test`
- **Committed in:** `97855d0` (part of feat commit)

**2. [Rule 1 - Bug] E1/E2/E4 updateProjectFields tests broken by new call sequence**
- **Found during:** Task 2 (after rewriting updateProjectFields to use addToProject-first)
- **Issue:** Pre-existing E1/E2/E4 tests mocked 3 ordered responses for the old getItemId-first pattern. New code calls addToProject (2 gh calls: node ID + addProjectV2ItemById) before mutations, requiring 4 responses.
- **Fix:** Updated E1/E2/E4 mock response arrays to include addToProject's 2 gh calls, then field mutation calls.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh.test.cjs`
- **Verification:** All updateProjectFields tests pass (`npm test 2>&1 | grep -E 'updateProjectFields'`)
- **Committed in:** `97855d0` (part of feat commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — behavior bugs)
**Impact on plan:** Both fixes were necessary for correctness. No scope creep. Scope inheritance fix is a soundness improvement (would have required auth refresh that provides no new access). Test fixture fix is a required consequence of the implementation change.

## Issues Encountered

- **Auth scope `read:project`**: Token had `project` scope (superset) but not `read:project` as a separate entry. `requireGhAuth` literal scope check was a false positive. Fixed via SCOPE_SUPERSET map. Did not need to run `gh auth refresh`.
- **`devflow-claude#9` in Product Roadmap project**: Confirmed present. Walk returns `PVT_kwDODwqLrc4BRsOP` project with Status=In Progress, Product=DevFlow, Quarter=Q2 2026. Cassette B3 assertion passes.

## Auth Gates

None encountered (token already had `project` scope which covers the required access). The SCOPE_SUPERSET fix removes the false auth gate for `read:project` when `project` is present.

## Next Objective Readiness

- **Objective 1 complete.** All 6 TRDs done, 563/563 tests pass.
- Resolver + sync pipeline fully validated end-to-end against this repo's own state (SC-9, SC-10).
- `PRODUCT_ROADMAP_FIELDS` populated — `updateProjectFields` can now update Status/Product/Quarter on live GitHub Projects v2.
- Objective 2 (cross-worktree session telemetry) can start; it depends on objective 1's coordination layer.

---
*Objective: 01-github-coordination-layer*
*Completed: 2026-05-04*

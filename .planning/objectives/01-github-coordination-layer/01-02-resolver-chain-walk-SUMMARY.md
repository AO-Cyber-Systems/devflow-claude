---
objective: 01-github-coordination-layer
trd: 01-02
subsystem: github-resolver, lib/gh.cjs
tags: [github, resolver, graphql, in-memory-cache, provenance, shorthand-resolution, tdd]

dependency_graph:
  requires:
    - objective: 01-01-frontmatter-fields-and-templates
      provides: GH-link frontmatter field conventions (github_issue, parent_issue, org_initiative, org_project)
  provides:
    - resolveChain(frontmatter, projectCtx) with per-field provenance + per-process in-memory cache
    - findRoadmapIssue(repo) GitHub [Roadmap] issue search
    - addToProject(issueRef, projectId) Project v2 item add via GraphQL
    - linkSubIssue(parentRef, childRef) sub-issue link via GraphQL
    - cmdGhResolve(cwd, objectiveId, raw) CLI entry point + df-tools gh resolve routing
    - __fixtures__/gh-fixtures.cjs hand-built factory functions
    - __fixtures__/gh-cassettes/ placeholder dir for TRD 01-06 cassettes
  affects: [01-03-auth-and-error-handling, 01-04-gh-sync-skill-and-cli, 01-05-pm-backend-seam, 01-06-dogfood-and-integration]

tech_stack:
  added: []
  patterns:
    - per-process in-memory cache (module-scope Map + _resetCache()) mirroring intent.cjs::loadDefaultsTable pattern
    - _setRunGh(fn) test injection hook for mocking gh CLI without subprocess
    - provenance vocabulary (frontmatter/inherited_from_project/walked_from_parent/absent/cached)
    - _resolveRef() helper for full-ref vs shorthand vs absent normalization
    - _walkParent() GraphQL walk for [Roadmap] title + Project v2 field values

key_files:
  created:
    - plugins/devflow/devflow/bin/lib/gh.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/.gitkeep
  modified:
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "_setRunGh(fn) injection hook added to gh.cjs so unit tests mock runGh without subprocess; existing cmdGhSync*/cmdGhComment/etc. continue using runGh directly (back-compat)"
  - "Cache hit transforms walked_from_parent and inherited_from_project provenance to 'cached'; frontmatter and absent stay as-is (re-reading frontmatter is free; we cache the walked values)"
  - "Fallback path: when frontmatter has no parent_issue but github_repo is set, findRoadmapIssue is called as fallback; if it returns a hit, that becomes roadmap_issue with walked_from_parent provenance"
  - "cmdGhResolve handles --help explicitly, outputs usage text to stderr with exit 0"
  - "No REFACTOR commit — GREEN implementation was already clean with _resolveRef and _walkParent private helpers extracted"

patterns-established:
  - "_setRunGh(fn) / _resetCache() test hook pattern: add after the production function, export both, tests use beforeEach to reset"
  - "Provenance vocabulary locked: frontmatter | inherited_from_project | walked_from_parent | absent | cached"
  - "buildMockRunGh(responses) fixture: exact match first, then prefix match (longest prefix wins); callCount() + calls() for spy assertions"

requirements-completed: [SC-2, SC-3, SC-6]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: "2026-05-04"
---

# Objective 01 TRD 02: Resolver Chain Walk Summary

**`resolveChain()` walker with frontmatter shorthand expansion, GraphQL [Roadmap]+Project-v2 walk, per-process in-memory cache, provenance vocabulary, and `df-tools gh resolve` CLI — 32 new tests (Groups A-I), all RED-first per TDD Playbook.**

## Performance

- **Duration:** ~7 minutes
- **Started:** 2026-05-04T19:46:14Z
- **Completed:** 2026-05-04T19:52:57Z
- **Tasks:** 2 (RED phase + GREEN phase; REFACTOR skipped — not needed)
- **Files modified:** 5 (gh.cjs, df-tools.cjs, gh.test.cjs, gh-fixtures.cjs, gh-cassettes/.gitkeep)

## Accomplishments

- `resolveChain(frontmatter, projectCtx)` walks objective GH-link fields through the full org chain with per-field provenance reporting
- Shorthand `#NN` resolution against `projectCtx.github_repo` with graceful warnings for missing/malformed repo
- Per-process in-memory cache (module-scope Map); cache hits mark walked/inherited provenance as `'cached'` while frontmatter fields stay as `'frontmatter'`
- `findRoadmapIssue(repo)` searches open issues by `[Roadmap] in:title`, returns lowest-numbered hit (deterministic)
- `addToProject` and `linkSubIssue` look up GitHub-internal node IDs then execute GraphQL mutations
- `cmdGhResolve` + `df-tools gh resolve <objectiveId>` CLI routing; hard-error on missing objective with exact path in stderr
- 32 new tests (Groups A through I) covering happy path, edge cases, failure modes, and cache provenance

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|------|----------------|-----------|--------|
| 1: RED — gh.test.cjs + fixtures | `npm test 2>&1 \| grep -E 'ℹ (tests\|pass\|fail)'` | 0 (483 tests, 451 pass, 32 fail) | PASS (RED) |
| 2: GREEN — gh.cjs + df-tools routing | `npm test 2>&1 \| grep -E 'ℹ (pass\|fail)'` | 0 (483 pass, 0 fail) | PASS (GREEN) |
| 2: exports check | `node -e 'const gh=require(...); typeof gh.resolveChain...'` | 0 (`OK`) | PASS |
| 2: gh resolve --help | `node df-tools.cjs gh resolve --help 2>&1 \| grep -q 'resolve'` | 0 | PASS |
| 2: objective not found | `df-tools gh resolve nonexistent-objective 2>&1 \| grep -q 'objective not found'` | 0 | PASS |

## Task Commits

TDD atomic commit sequence:

1. **Task 1: RED phase — fixtures + failing tests** — `8ac655c` (test:)
2. **Task 2: GREEN phase — implementation** — `b91e7e6` (feat:)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|------|---------|-----------|--------|
| test | `npm test` | 0 (483 pass, 0 fail) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|-------|---------|-----------|----------|
| RED | `npm test 2>&1 \| grep -E 'ℹ (pass\|fail)'` | 0 (451 pass, 32 fail) | FAIL on new tests (correct) |
| GREEN | `npm test 2>&1 \| grep -E 'ℹ (pass\|fail)'` | 0 (483 pass, 0 fail) | PASS (correct) |
| REFACTOR | N/A — skipped (implementation already clean) | N/A | N/A |

## Verification Commands (TRD Frontmatter)

All 4 `verification_commands` from TRD frontmatter passed:

1. `npm test` — 483 pass, 0 fail (exit 0)
2. `git log --oneline feature/v1.1 -- lib/gh.cjs lib/gh.test.cjs | grep -E '^[a-f0-9]+ test\('` — returns `8ac655c test(01-02): ...`
3. `node -e 'const gh=require("./plugins/.../gh.cjs"); typeof gh.resolveChain...'` — prints `OK`
4. `node df-tools.cjs gh resolve --help 2>&1 | grep -q 'resolve'` — exit 0

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9
  - resolveChain returns correct shape with all fields: confirmed
  - Provenance vocabulary is exactly the 5 allowed values: confirmed (C2 test)
  - Shorthand resolves against projectCtx.github_repo: confirmed (B1, B2)
  - Missing/malformed github_repo → warning + literal kept: confirmed (B3, B4)
  - Per-process cache: second call doesn't increase runGh call count: confirmed (G1)
  - _resetCache() clears cache so next call re-runs: confirmed (G2)
  - findRoadmapIssue returns lowest-numbered issue: confirmed (E3)
  - addToProject/linkSubIssue accept parsed object args: confirmed (F1-F5)
  - df-tools gh resolve routes to cmdGhResolve: confirmed (H1-H4)
- Gate failures: None

## Deviations from Plan

### Auto-fixed / Minor Deviations

**1. [Rule 2 - Minor enhancement] cmdGhResolve handles --help explicitly**
- **Found during:** Task 2 — TRD verification command `df-tools gh resolve --help 2>&1 | grep -q 'resolve'` would fail because `--help` was passed as objectiveId and the error message said "objective not found: --help" without "resolve" in the text.
- **Fix:** Added explicit `--help`/`-h` detection at the top of `cmdGhResolve` that prints a usage string containing "resolve" to stderr with exit 0.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh.cjs`
- **Committed in:** b91e7e6 (part of GREEN commit)

**2. [Verifier note accepted] G4 test uses _resetCache() rather than delete require.cache dance**
- Per verifier briefing, the `delete require.cache` pattern for testing module-scope cache is fragile with Node's native test runner. Implemented G4 using `_resetCache()` which tests the same invariant (cache is module-scope, not closure-scope) without subprocess or require.cache manipulation.
- This was pre-approved in the `<verifier_briefings>` section of the TRD prompt.

**Total deviations:** 2 minor (both pre-approved or obvious correctness improvements)
**Impact on plan:** None — both deviations improve robustness without changing scope.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/gh.cjs` — Extended with 9 new functions: `_resolveRef`, `_walkParent`, `findRoadmapIssue`, `resolveChain`, `addToProject`, `linkSubIssue`, `cmdGhResolve`, `_resetCache`, `_setRunGh`. Existing functions untouched.
- `plugins/devflow/devflow/bin/df-tools.cjs` — Added `cmdGhResolve` to destructured imports; added `resolve` case to `gh` subcommand switch; updated error text.
- `plugins/devflow/devflow/bin/lib/gh.test.cjs` — 32 tests in Groups A-I (new file).
- `plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs` — Hand-built factories: `buildFrontmatter`, `buildProjectCtx`, `buildMockRunGh`, `buildGhResponse_*` (new file).
- `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/.gitkeep` — Placeholder directory for TRD 01-06 cassettes (new).

## Decisions Made

- `_setRunGh(fn)` test injection added so all new resolver functions are testable without live gh CLI; existing commands untouched (back-compat preserved)
- Cache provenance transform: `walked_from_parent` and `inherited_from_project` become `'cached'` on hit; `frontmatter` and `absent` stay unchanged — re-reading frontmatter is free, only the walked/fetched values are the "cache value"
- Fallback path for `roadmap_issue` when `parent_issue` absent: calls `findRoadmapIssue(github_repo)` as fallback before marking `absent`
- No REFACTOR commit — private helpers `_resolveRef` and `_walkParent` were extracted during GREEN, producing clean code without a separate refactor pass

## Next Objective Readiness

- Wave 3 (TRD 01-03 — auth + error handling) can now extend `lib/gh.cjs` with `requireGhAuth()` wrapping the existing `runGh` + new `_runGh` surface
- The `_setRunGh` injection hook and `_resetCache` are already in place for TRD 01-03's unit tests
- `addToProject` and `linkSubIssue` are ready for TRD 01-04's `syncObjective` to use

## Self-Check

- gh.cjs: FOUND
- gh.test.cjs: FOUND
- gh-fixtures.cjs: FOUND
- gh-cassettes/.gitkeep: FOUND
- df-tools.cjs: FOUND
- Commit 8ac655c (test:): FOUND
- Commit b91e7e6 (feat:): FOUND

## Self-Check: PASSED

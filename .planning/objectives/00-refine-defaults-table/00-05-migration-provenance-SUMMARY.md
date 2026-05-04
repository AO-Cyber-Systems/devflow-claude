---
objective: 00-refine-defaults-table
trd: "0.5"
title: "Migration validation + per-field provenance integration test"
subsystem: intent-resolver
tags: [intent-resolver, provenance, tdd, migration, round-trip, enum-normalization]
one_liner: "Added result.provenance enum-normalized map (table/user_playbook/objective_override/trd_override) alongside preserved result.sources; validated 01-handoff-watcher real-disk migration and full 6×7 matrix round-trip"

# Dependency graph
requires:
  - objective: 00-refine-defaults-table/00-01
    provides: "defaults-table.md with 9 fields per cell"
  - objective: 00-refine-defaults-table/00-02
    provides: "resolve() emitting 5 new fields + per-field provenance (sources)"
  - objective: 00-refine-defaults-table/00-03
    provides: "planner agent consuming resolver fields"
  - objective: 00-refine-defaults-table/00-04
    provides: "PLAYBOOK_HABITS constant, extended deriveOverrides"
provides:
  - "normalizeProvenance() helper: freeform sources strings → locked enum vocabulary"
  - "result.provenance field on every resolve() call — parallel to result.sources, enum-normalized"
  - "OBJECTIVE.md overrides now covers all 6 new structured fields (gap-repair from TRD 0.2)"
  - "TRD frontmatter overrides now cover all 6 new structured fields including outside_in bool-coercion"
  - "18 new integration tests: Groups A-F (intent-cli.test.cjs) + Group C (migrate.test.cjs)"
  - "Real-disk 01-handoff-watcher migration regression test confirmed clean round-trip"
affects:
  - "Downstream consumers of resolve() output (planner, #12 dup-detect, #13) — provenance field now available"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "normalizeProvenance: pure string-mapping function; 'unknown' as defensive floor, never undefined"
    - "Real-disk test fixture (REPO_ROOT anchor) at 5 levels up from lib/; verified against .planning existence"
    - "Test fixture: process.cwd() vs __dirname-relative — used __dirname-relative for portability"

key-files:
  created:
    - "plugins/devflow/devflow/bin/lib/migrate.test.cjs (Group C migration regression added)"
  modified:
    - "plugins/devflow/devflow/bin/lib/intent.cjs"
    - "plugins/devflow/devflow/bin/lib/intent-cli.test.cjs"
    - "plugins/devflow/devflow/bin/lib/migrate.test.cjs"

key-decisions:
  - "normalizeProvenance() checks startsWith('defaults table') not exact match — handles all (kind,work) variants"
  - "provenance built from Object.keys(sources) — only fields that have sources get provenance (not all config fields)"
  - "outside_in provenance omitted for cells where field is not in sources (field absent from table cell = no provenance entry)"
  - "OBJECTIVE.md override loop extended to 6 new fields as gap-repair (Wave-2 omission); documented in deviations"
  - "TRD frontmatter override loop extended similarly; outside_in bool-coerced per verifier briefing #2"
  - "B2 test corrected: (api, foundation) is single_tenant not multi_tenant_required — 4 cells with wrong-tenant, not 5"
  - "A2 test corrected: use (api, prototype) tdd_default:skip for playbook-promotion scenario, not (api, feature) with strict"
  - "REPO_ROOT in migrate.test.cjs: 5 levels up from lib/ (not 6 as TRD error-recovery note suggested)"

patterns-established:
  - "Provenance enum vocabulary locked: table | user_playbook | objective_override | trd_override | unknown"
  - "Real-disk regression tests anchor to __dirname-relative path for portability across machines/CWDs"
  - "Integration TRD (Wave 4) pattern: catches upstream gaps missed by isolated TRD test suites"

requirements-completed: [SC-2, SC-7, SC-9]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 35min
completed: "2026-05-04"
---

# Objective 00 TRD 05: Migration Validation + Provenance Summary

**Added `result.provenance` enum-normalized map alongside `result.sources`; gap-repaired OBJECTIVE.md and TRD override loops for 6 new structured fields; validated 01-handoff-watcher real-disk migration and full 6×7 matrix round-trip with 18 new integration tests**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-04
- **Completed:** 2026-05-04
- **Tasks:** 2 (Task 1 RED + Task 2 GREEN)
- **Files modified:** 3

## Accomplishments

- `normalizeProvenance()` helper added to intent.cjs: maps freeform source strings to `table | user_playbook | objective_override | trd_override | unknown`
- `result.provenance` added to every `resolve()` return — enum-normalized parallel of `result.sources` (back-compat preserved)
- OBJECTIVE.md `overrides` loop extended from 3 fields to all 9 structured fields (gap-repair, see Deviations)
- TRD frontmatter override loop extended from 2 fields to all structured fields with `outside_in` bool-coercion
- 18 new integration tests covering Groups A-F (provenance enum normalization, matrix round-trip, migration regression, override cascade, CLI surface, back-compat)
- 01-handoff-watcher real-disk migration confirmed: `kind=plugin, work=feature`, all 9 config fields populated, 0 unexpected warnings
- 6×7 matrix (42 cells) all resolve cleanly with provenance populated on all 9 scalar fields

## result.provenance Shape (Final)

```json
{
  "kind": "api",
  "work": "feature",
  "config": { "...all 9 fields..." },
  "sources": {
    "tdd": "defaults table (api, feature)",
    "tdd_default": "CLAUDE.md user playbook",
    "security_isolation": "OBJECTIVE.md overrides",
    "outside_in": "TRD frontmatter outside_in"
  },
  "provenance": {
    "tdd": "table",
    "tdd_default": "user_playbook",
    "security_isolation": "objective_override",
    "outside_in": "trd_override"
  }
}
```

## Provenance Enum Vocabulary

| Enum value | Source string pattern |
|---|---|
| `table` | Starts with `'defaults table'` |
| `user_playbook` | Equals `'CLAUDE.md user playbook'` |
| `objective_override` | Starts with `'OBJECTIVE.md'` |
| `trd_override` | Starts with `'TRD frontmatter'` |
| `unknown` | Defensive fallback (should never appear in practice) |

## 01-handoff-watcher Migration Outcome

- **Objective directory:** `.planning/objectives/01-handoff-watcher/` — present on branch
- **Resolved kind:** `plugin` (from PROJECT.md)
- **Resolved work:** `feature` (from PROJECT.md `default_work`)
- **Config populated:** All 9 fields — tdd, depth, model_profile, verification, security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy
- **Unexpected warnings:** None (0)
- **TRD files:** 8 TRD files (01-01 through 01-08) — all resolve cleanly; informal frontmatter (no `---` delimiters) gracefully returns null, resolver uses table defaults
- **Migration verdict:** CLEAN — the 5 new fields are purely additive; no existing OBJECTIVE.md state broken

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 (RED): 18 failing tests | `npm test 2>&1 \| grep "^ℹ (tests\|pass\|fail)"` — 443 tests, 425 pass, 18 fail | 1 | PASS (correct RED) |
| 2 (GREEN): normalizeProvenance + provenance field | `npm test 2>&1 \| grep "^ℹ (tests\|pass\|fail)"` — 443 tests, 443 pass, 0 fail | 0 | PASS |
| V2: 01-handoff-watcher CLI | `df-tools intent resolve --objective 01-handoff-watcher` → kind=plugin work=feature | 0 | PASS |
| V3: test: commit before feat: | `git log ... \| grep test(` → 120bc7d | 0 | PASS |
| V4: 7 api cells × 9 fields provenance | `node -e '...buildMatrixProject({kind:"api"})...'` → all 7 api cells × 9 fields have provenance | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` → 443 tests, 425 pass, 18 fail | 1 | FAIL (correct — 18 new tests failing) |
| GREEN | `npm test` → 443 tests, 443 pass, 0 fail | 0 | PASS (correct) |
| REFACTOR | N/A — GREEN implementation was clean | — | Skipped |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (443/443) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (test corrections for A2 and B2, REPO_ROOT path fix)
- **Must-haves verified:** 6/6 (all TRD frontmatter `truths` confirmed)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/intent.cjs` — `normalizeProvenance()` helper, `result.provenance` in return shape, OBJECTIVE.md override loop extended, TRD frontmatter override loop extended with outside_in bool-coercion; `normalizeProvenance` exported
- `plugins/devflow/devflow/bin/lib/intent-cli.test.cjs` — 15 new test cases (Groups A, B, D, E, F)
- `plugins/devflow/devflow/bin/lib/migrate.test.cjs` — 3 new test cases (Group C migration regression)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wave-2 gap: OBJECTIVE.md overrides loop only covered 3 original fields**
- **Found during:** Task 2 (GREEN) — D1/D2 tests asserted on `provenance.security_isolation === 'objective_override'` and `provenance.fixture_strategy === 'objective_override'` but the override loop didn't write to those fields
- **Issue:** TRD 0.2's OBJECTIVE.md override loop only extended to `tdd`, `depth`, `model_profile` — the original 3 fields. The 5+1 new structured fields were never consumed from `objectiveFm.overrides`.
- **Fix:** Extended the resolver's OBJECTIVE.md override section (Level 2) to include all 6 new fields: `security_isolation`, `back_compat`, `tdd_default`, `test_list_first`, `fixture_strategy`, `outside_in`. Applied bool-coercion to `outside_in` per same pattern as table parser.
- **Files modified:** `plugins/devflow/devflow/bin/lib/intent.cjs`
- **Committed in:** `df9f8fa` (feat: commit)
- **TRD ownership:** Wave-2 omission surfaced by Wave-4 integration tests (expected per TRD 0.5 pattern)

**2. [Rule 3 - Blocking] Wave-2 gap: TRD frontmatter loop only covered type + confidence fields**
- **Found during:** Task 2 (GREEN) — D3 test asserted `outside_in === false` from TRD frontmatter but the loop didn't process `outside_in`
- **Issue:** TRD 0.2's TRD frontmatter override section only applied `type` (→ tdd/standard) and `confidence`. The new structured fields were never applied from TRD frontmatter even though the spec called for it.
- **Fix:** Extended TRD frontmatter override section (Level 1) to apply all 6 new fields. Applied bool-coercion to `outside_in` to handle YAML parser returning string `"false"` (verifier briefing #2).
- **Files modified:** `plugins/devflow/devflow/bin/lib/intent.cjs`
- **Committed in:** `df9f8fa` (feat: commit)

**3. [Rule 1 - Bug] Test A2 used wrong cell (api, feature) for playbook-promotion scenario**
- **Found during:** Task 2 (GREEN) — A2 asserted `provenance.tdd_default === 'user_playbook'` but `(api, feature)` has `tdd_default: strict` at the table level; playbook promotes `skip→auto` (no change from `strict→strict`), so sources stay at `table`
- **Fix:** Changed A2 to use `(api, prototype)` which has `tdd_default: skip` in the table; playbook promotes `skip→auto`, correctly updating `sources.tdd_default` to `'CLAUDE.md user playbook'`
- **Files modified:** `plugins/devflow/devflow/bin/lib/intent-cli.test.cjs`
- **Committed in:** `df9f8fa` (feat: commit)

**4. [Rule 1 - Bug] Test B2 listed wrong cells for wrong-tenant injection**
- **Found during:** Task 2 (GREEN) — B2 expected `(api, foundation)` to have `wrong_tenant_assertion` but the table has `security_isolation: single_tenant` for that cell (not `multi_tenant_required`)
- **Issue:** TRD's test list said "5 cells: feature, port, refactor, foundation, bugfix" — but the actual defaults table has `(api, foundation)` as `single_tenant`. The TRD's count of 5 was incorrect.
- **Fix:** Corrected B2 to use the actual table truth: 4 cells with wrong-tenant (feature, port, refactor, bugfix); foundation, prototype, spike do NOT have it
- **Files modified:** `plugins/devflow/devflow/bin/lib/intent-cli.test.cjs`
- **Committed in:** `df9f8fa` (feat: commit)

**5. [Rule 1 - Bug] REPO_ROOT path counted 6 levels instead of 5**
- **Found during:** Task 2 (GREEN) — C1/C2/C3 tests failed with "01-handoff-watcher directory missing at `/Users/markemerson/Source/.planning/...`" — resolving to `/Users/markemerson/Source` (parent of repo) instead of the repo root
- **Issue:** The TRD error-recovery note said "6 levels up" but the actual count from `lib/` to repo root is 5: lib→bin→devflow→devflow→plugins→repo-root
- **Fix:** Changed `../../../../../../` to `../../../../../` in migrate.test.cjs REPO_ROOT constant
- **Files modified:** `plugins/devflow/devflow/bin/lib/migrate.test.cjs`
- **Committed in:** `df9f8fa` (feat: commit)

---

**Total deviations:** 5 (2 Wave-2 gap-repairs, 3 test corrections)
**Impact on plan:** Gap-repairs complete TRD 0.2's intended behavior; test corrections align tests with actual table data truth. No scope creep.

## Gap-Repair Notes (per verifier briefing #7)

Wave-2 (TRD 0.2) omitted OBJECTIVE.md and TRD frontmatter override handling for the 5+1 new structured fields. TRD 0.5's integration tests surfaced both gaps. Both are fixed in this TRD's `feat(00-05)` commit — this is the expected pattern for a Wave-4 integration TRD. The `feat(00-05)` commit owns these fixes.

## Follow-on Candidates (for `/df:plan-objective 0 --gaps`)

- **`outside_in` provenance gap:** `outside_in` doesn't appear in `result.provenance` for cells where it's absent from the table (the `tableDefaults[field] !== undefined` guard skips it). For cells where it IS in the table but resolves as `false`, the value propagates to `config.outside_in` but with no `sources` entry, so no `provenance` entry either. A future pass could emit `provenance.outside_in = 'table'` even for boolean-false values by ensuring `sources.outside_in` is always populated when the field is defined in the cell.
- **`verification_commands` array provenance:** Array fields don't get per-element provenance. This is documented in the TRD (Group A7 decision) but worth noting as a follow-on for consumers that need to know why specific verification commands were injected.
- **`confidence` provenance:** `sources.confidence = 'TRD frontmatter'` gets mapped to `trd_override` via `normalizeProvenance`. This works correctly but the `confidence` field was added before the locked vocabulary. It's a minor inconsistency — `confidence` is not one of the 9 table-defined scalar fields.

## Task Commits

1. **Task 1 (RED): 18 failing integration tests** — `120bc7d` (`test(00-05):`)
2. **Task 2 (GREEN): normalizeProvenance + gap-repairs + test corrections** — `df9f8fa` (`feat(00-05):`)

## Self-Check (preliminary — pre-state-update)

Checking claimed artifacts:
- `plugins/devflow/devflow/bin/lib/intent.cjs` — contains `normalizeProvenance` and `result.provenance` in return shape
- `plugins/devflow/devflow/bin/lib/intent-cli.test.cjs` — contains `describe('provenance`, `describe('matrix`, `describe('overrides`, `describe('CLI`, `describe('back-compat`
- `plugins/devflow/devflow/bin/lib/migrate.test.cjs` — contains `describe('migration — 01-handoff-watcher regression`

Commits confirmed: `120bc7d` (test:), `df9f8fa` (feat:) both present.

## Objective 0 Final Status

All 10 success criteria satisfied:
1. SC-1: `defaults-table.md` 42×9 cells — DONE (TRD 0.1)
2. SC-2: `intent.cjs` 5 new fields + 3 constraints + provenance — DONE (TRD 0.2 + TRD 0.5)
3. SC-3: Planner reads new fields, emits TRD sections — DONE (TRD 0.3)
4. SC-4: CLAUDE.md absorption 6 habits → 5 structured fields — DONE (TRD 0.4)
5. SC-5: `references/testing-strategy.md` exists — DONE (TRD 0.6)
6. SC-6: Planner consults testing-strategy.md — DONE (TRD 0.3+0.7)
7. SC-7: Migration validated against 01-handoff-watcher — DONE (TRD 0.5 Group C)
8. SC-8: TRD 0.1 and TRD 0.2 in different waves — DONE
9. SC-9: 6×7 matrix round-trip with multi_tenant_required coverage — DONE (TRD 0.5 Group B)
10. SC-10: npm test passes; TDD TRDs ship test: before feat: — DONE

---
*Objective: 00-refine-defaults-table*
*TRD: 0.5*
*Completed: 2026-05-04*

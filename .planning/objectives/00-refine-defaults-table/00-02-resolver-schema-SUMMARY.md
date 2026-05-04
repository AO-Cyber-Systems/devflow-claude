---
objective: 00-refine-defaults-table
trd: "0.2"
title: "Extend intent.cjs resolver — emit 5 new fields + 3 anti-pattern constraints with provenance"
subsystem: intent-resolver
tags: [intent-resolver, tdd, constraints, provenance, multi-tenancy, claude-md-absorption]
one_liner: "Extended intent.cjs resolver to emit 5 new structured fields + 3 anti-pattern constraints with per-field provenance, CLAUDE.md TDD Playbook promotion rules, and hard-enforced multi-tenant verification injection"

requires:
  - objective: 00-refine-defaults-table/00-01
    provides: "defaults-table.md with 9 fields per cell + constraints: block"
provides:
  - "loadConstraints() parses constraints: block from defaults-table.md"
  - "resolve() emits security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy, outside_in with per-field provenance"
  - "result.constraints array with 3 anti-pattern entries; TRD opt-out drops entries"
  - "CLAUDE.md absorption promotions: skip→auto→strict, optional→required, inline→generators, n/a→multi_tenant_required"
  - "Multi-tenant hard-enforcement: wrong_tenant_assertion injected into verification_commands"
  - "buildMatrixProject() fixture builder for 6-kind × 7-work round-trip testing"
affects:
  - "TRD 0.3 (planner agent update) — consumes resolver output shape stabilized here"
  - "TRD 0.4 (CLAUDE.md absorption) — builds on deriveOverrides extension"
  - "TRD 0.5 (migration + provenance) — validates resolver fields"

tech-stack:
  added: []
  patterns:
    - "per-field provenance tracking: sources[field] = 'defaults table (kind, work)' | 'CLAUDE.md user playbook' | 'TRD frontmatter'"
    - "promotion chain: table → CLAUDE.md → OBJECTIVE.md → TRD (highest wins)"
    - "constraint opt-out via TRD frontmatter boolean fields"
    - "structured verification_commands array with id/description/pattern/enforcement"

key-files:
  created:
    - "plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs (buildMatrixProject added)"
  modified:
    - "plugins/devflow/devflow/bin/lib/intent.cjs"
    - "plugins/devflow/devflow/bin/lib/claude-md.cjs"
    - "plugins/devflow/devflow/references/defaults-table.md"
    - "plugins/devflow/devflow/bin/lib/intent.test.cjs"
    - "plugins/devflow/devflow/bin/lib/intent-cli.test.cjs"

key-decisions:
  - "outside_in field added to (api, feature) and (app, feature) cells — boolean coercion in parser (bare true → JS true)"
  - "loadConstraints() does NOT cache — avoids shared-reference mutation anti-pattern"
  - "CLAUDE.md _playbookDetected flag set when any TDD/test sections found; resolver applies promotion rules only when flag is true"
  - "security_isolation n/a → multi_tenant_required promotion scoped to api kind only (per CONTEXT.md §3 habit 6)"
  - "tdd_default promotion uses one-step table: skip→auto, auto→strict, strict→strict (not skip→strict)"
  - "skip_multi_tenant_check TRD opt-out adds warning to result.warnings (visible audit trail)"
  - "wrong_tenant_assertion structured as {id, description, pattern, enforcement} so planner can render consistently"

patterns-established:
  - "Provenance tag: 'defaults table (kind, work)' for table-sourced values"
  - "Provenance tag: 'CLAUDE.md user playbook' for absorbed overrides"
  - "Provenance tag: 'TRD frontmatter type:tdd' etc. for TRD overrides"
  - "Constraint opt-out fields: allow_generated_test_data, use_property_based, use_gherkin"
  - "Multi-tenant gate opt-out: skip_multi_tenant_check (warns, not silences)"

requirements-completed: [SC-2, SC-9, SC-10]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 45min
completed: "2026-05-04"
---

# Objective 00 TRD 02: Resolver Schema Extension Summary

**Extended intent.cjs resolver to emit 5 new structured fields + 3 anti-pattern constraints with per-field provenance, CLAUDE.md TDD Playbook promotion rules, and hard-enforced multi-tenant verification injection**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-04
- **Completed:** 2026-05-04
- **Tasks:** 2 (Task 1 RED + Task 2 GREEN)
- **Files modified:** 5

## Accomplishments

- `loadConstraints()` added: parses the `constraints:` block from defaults-table.md, returns 3 structured entries (`no_llm_test_data`, `no_property_based_default`, `no_gherkin_layer`)
- `resolve()` extended: emits 9 fields from table + per-field provenance for all of them; applies CLAUDE.md absorption promotion rules; injects `wrong_tenant_assertion` into `verification_commands` when `security_isolation === multi_tenant_required`
- `claude-md.cjs::deriveOverrides()` extended: emits `_playbookDetected` flag + patterns for `test_list_first` and `fixture_strategy`; resolver applies structured promotions based on flag
- `buildMatrixProject()` fixture builder: creates 7-objective project for all work types; used in Group G tests and TRD verification commands
- 27 new tests added (Groups A-G), all passing GREEN; 381 existing tests remain passing (408 total)

## Resolver Output Shape (Final)

```json
{
  "kind": "api",
  "work": "feature",
  "workSource": "OBJECTIVE.md",
  "workInherited": false,
  "config": {
    "tdd": "strict; outside-in (HTTP→handler→service)...",
    "depth": "comprehensive",
    "model_profile": "quality",
    "verification": "full integration + API contract...",
    "security_isolation": "multi_tenant_required",
    "back_compat": "none",
    "tdd_default": "strict",
    "test_list_first": "required",
    "fixture_strategy": "inline",
    "outside_in": true,
    "verification_commands": [
      {
        "id": "wrong_tenant_assertion",
        "description": "Test must include an assertion that requests scoped to one tenant cannot access another tenant's data.",
        "pattern": "wrong-tenant|cross-tenant|tenant-isolation",
        "enforcement": "required"
      }
    ]
  },
  "sources": {
    "tdd": "defaults table (api, feature)",
    "depth": "defaults table (api, feature)",
    "model_profile": "defaults table (api, feature)",
    "verification": "defaults table (api, feature)",
    "security_isolation": "defaults table (api, feature)",
    "back_compat": "defaults table (api, feature)",
    "tdd_default": "defaults table (api, feature)",
    "test_list_first": "defaults table (api, feature)",
    "fixture_strategy": "defaults table (api, feature)",
    "outside_in": "defaults table (api, feature)"
  },
  "constraints": [
    {
      "id": "no_llm_test_data",
      "description": "Test fixtures must be hand-built...",
      "opt_out_field": "frontmatter.allow_generated_test_data"
    },
    {
      "id": "no_property_based_default",
      "description": "Property-based testing (rapid/gopter/Hypothesis) is not suggested by default...",
      "opt_out_field": "frontmatter.use_property_based"
    },
    {
      "id": "no_gherkin_layer",
      "description": "Do not emit .feature files or Cucumber-shaped scaffolds...",
      "opt_out_field": "frontmatter.use_gherkin"
    }
  ],
  "directives": [],
  "warnings": []
}
```

## CLAUDE.md Absorption Promotion Table

| Field | Table Value | Playbook-Promoted Value | Condition |
|---|---|---|---|
| `tdd_default` | `skip` | `auto` | Any TDD playbook section detected |
| `tdd_default` | `auto` | `strict` | Any TDD playbook section detected |
| `tdd_default` | `strict` | `strict` (unchanged) | Ceiling — no further promotion |
| `test_list_first` | `optional` | `required` | "test list first" / "behavior cases checklist" phrase detected |
| `test_list_first` | `required` | `required` (unchanged) | Already at ceiling |
| `fixture_strategy` | `inline` | `generators` | "fixture builders" / "factory functions" / "no llm-generated test data" detected |
| `fixture_strategy` | `cassettes` | `cassettes` (unchanged) | Already at appropriate level |
| `fixture_strategy` | `n/a` | `n/a` (unchanged) | Not applicable cells stay n/a |
| `security_isolation` | `n/a` | `multi_tenant_required` | Playbook detected AND kind === 'api' (habit 6) |
| `security_isolation` | `multi_tenant_required` | `multi_tenant_required` (unchanged) | Already enforced |

## TRD Opt-Out Matrix

| TRD Frontmatter Field | Constraint Dropped |
|---|---|
| `allow_generated_test_data: true` | `no_llm_test_data` |
| `use_property_based: true` | `no_property_based_default` |
| `use_gherkin: true` | `no_gherkin_layer` |
| `skip_multi_tenant_check: true` | Drops `wrong_tenant_assertion` from `verification_commands` + adds warning to `result.warnings` |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 (RED): Failing tests + fixture builder | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` — 408 tests, 389 pass, 19 fail | 0 | PASS (correct RED) |
| 2 (GREEN): Resolver implementation | `npm test 2>&1 \| grep -E "^ℹ (tests\|pass\|fail)"` — 408 tests, 408 pass, 0 fail | 0 | PASS |
| TRD V2: all 5 new fields + constraints | `node -e "...check fields..."` → OK | 0 | PASS |
| TRD V3: test: commit before feat: commit | `git log --oneline ... \| grep test(` → 8847c85 | 0 | PASS |
| TRD V4: multi_tenant_required round-trip | `node -e "...buildMatrixProject...multi_tenant_required..."` → OK | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test` → 408 tests, 389 pass, 19 fail | 1 | FAIL (correct — 19 new tests failing) |
| GREEN | `npm test` → 408 tests, 408 pass, 0 fail | 0 | PASS (correct) |
| REFACTOR | N/A — GREEN implementation was clean | — | Skipped |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (408/408) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (added `outside_in` field to table — omitted from TRD 0.1's cell schema but required for B1 test)
- **Must-haves verified:** 8/8
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/intent.cjs` — `loadConstraints()` added; `parseDefaultsYaml()` extended for bool coercion; `resolve()` extended with new fields, CLAUDE.md absorption, constraints, multi-tenant enforcement; `loadConstraints` exported
- `plugins/devflow/devflow/bin/lib/claude-md.cjs` — `deriveOverrides()` extended with `_playbookDetected` flag, `test_list_first` and `fixture_strategy` pattern detection
- `plugins/devflow/devflow/references/defaults-table.md` — `outside_in: true` added to `(api, feature)` and `(app, feature)` cells; schema docs updated
- `plugins/devflow/devflow/bin/lib/intent.test.cjs` — Groups A-F (24 new test cases)
- `plugins/devflow/devflow/bin/lib/intent-cli.test.cjs` — Group G (3 new test cases)
- `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` — `buildMatrixProject()` added; `trdMd()` extended with opt-out fields

## Decisions Made

- `outside_in` boolean field added to `(api, feature)` and `(app, feature)` in the defaults table. TRD 0.2 test B1 required `outside_in === true` for `(api, feature)`, but TRD 0.1 did not add this field. Added as a Rule 3 fix (blocking test requirement). The parser now coerces bare `true`/`false` YAML to JS booleans only for the `outside_in` field.
- `loadConstraints()` does NOT cache results. Reason: the test suite calls `_resetCache()` between tests, but a separate cache for constraints would create a new invalidation path. Fresh parse per call is safe given the file is small.
- Promotion chain respects the "only promote, never downgrade" rule: the promotion tables are self-maps at the ceiling (`strict: 'strict'`), so a value already at the ceiling stays there.
- The `_playbookDetected` flag is set on `claudeOverrides` (returned from `deriveOverrides`), not on the final `resolve()` output. The resolver deletes it from config before returning via `delete config._playbookDetected` (defensive — the flag never reaches config in the current code but the guard prevents future leakage).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `outside_in` field missing from defaults table**
- **Found during:** Task 2 (GREEN implementation) — test B1 asserted `result.config.outside_in === true` for `(api, feature)` but the table had no `outside_in` field
- **Issue:** TRD 0.1 added 5 new fields but `outside_in` was described in the TRD 0.2 body as part of `NEW_FIELDS`. The table had no boolean `outside_in` field, so the resolver would have emitted `undefined`.
- **Fix:** Added `outside_in: true` to `(api, feature)` and `(app, feature)` cells in defaults-table.md. Extended `parseDefaultsYaml()` to coerce `'true'/'false'` string values to booleans for the `outside_in` field.
- **Files modified:** `plugins/devflow/devflow/references/defaults-table.md`, `plugins/devflow/devflow/bin/lib/intent.cjs`
- **Committed in:** 6cb0cce (feat: commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking table omission)
**Impact on plan:** The `outside_in` field belongs in the 9-field schema per TRD 0.2's own `NEW_FIELDS` list. Adding it to the table completes the schema. No scope creep.

## Task Commits

1. **Task 1 (RED): Failing tests + fixture builder** — `8847c85` (`test(00-02):`)
2. **Task 2 (GREEN): Resolver implementation** — `6cb0cce` (`feat(00-02):`)

## Issues Encountered

None — implementation matched TRD spec. One table omission discovered (outside_in) and auto-fixed inline.

## Next Objective Readiness

- Wave 2 complete. Resolver output shape is now stable for Wave 3 consumers.
- TRD 0.3 (planner agent update) can now read `result.config.tdd_default`, `test_list_first`, `fixture_strategy`, `security_isolation` and emit corresponding TRD sections.
- TRD 0.4 (CLAUDE.md absorption) builds on `deriveOverrides()` extension already landed here.
- The `buildMatrixProject()` fixture is available for TRD 0.5 round-trip tests.

---
*Objective: 00-refine-defaults-table*
*TRD: 0.2*
*Completed: 2026-05-04*

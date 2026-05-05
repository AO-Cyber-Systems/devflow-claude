---
objective: 00-refine-defaults-table
trd: "0.1"
title: "Update defaults-table.md — 27 changed cells + 5 new column headers"
subsystem: intent-resolver
tags: [defaults-table, intent-model, tdd-posture, kind-work, schema]
one_liner: "Rewrote 42-cell defaults table with 9 fields each (4 original + 5 new) plus constraints block; seeded resolver config from full table row"
depends_on: []
provides:
  - "defaults-table.md with 5 new column headers (security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy)"
  - "constraints: block with 3 anti-pattern entries"
  - "resolver config propagates all 9 fields to consumers"
affects:
  - "plugins/devflow/devflow/bin/lib/intent.cjs (config seeding fix)"
  - "All consumers of df-tools intent resolve output"
tech_stack:
  added: []
  patterns: ["42-cell × 9-field YAML lookup table", "contract-list-first parity replacing spec-match"]
key_files:
  created: []
  modified:
    - plugins/devflow/devflow/references/defaults-table.md
    - plugins/devflow/devflow/bin/lib/intent.cjs
    - plugins/devflow/devflow/bin/lib/intent.test.cjs
    - plugins/devflow/devflow/bin/lib/intent-cli.test.cjs
decisions:
  - "Initialized resolver config = { ...tableDefaults } so all 9 table fields propagate without TRD 02 needing to ship first"
  - "Cells with tdd:skip or tdd:none map to tdd_default:skip + test_list_first:optional + fixture_strategy:n/a"
  - "All non-skip, non-none cells default fixture_strategy:inline except (plugin, feature) which uses generators"
  - "(plugin, prototype) keeps tdd_default:strict + test_list_first:required per TRD rule (unique kind-specific prototype note)"
  - "(app, port) carries outside_in:true per research line 256"
  - "Updated test assertions from /spec-match/ to /build first.*verify API contract parity/ to match new port cell text"
metrics:
  duration_minutes: 4
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  completed_date: "2026-05-04"
requirements: [SC-1]
---

# Objective 00 TRD 01: Update defaults-table.md Summary

Rewrote `plugins/devflow/devflow/references/defaults-table.md` to 42 cells × 9 fields, adding `security_isolation`, `back_compat`, `tdd_default`, `test_list_first`, `fixture_strategy` columns and a `constraints:` block with 3 anti-pattern entries. Also fixed `intent.cjs` to seed `config` from the full table row so new fields surface in resolver output immediately.

## What Was Built

The single modified reference file (`defaults-table.md`) now:

- **42 cells × 9 fields** — every `(kind, work)` pair has all 4 original fields plus 5 new structured fields
- **27 body-text changes** — port cells, ui-lib non-skip cells, api cells with explicit security/outside-in tags, app feature/port/refactor/bugfix, library feature/port, cli feature/port, plugin feature/port plus prototype note
- **15 tags-only additions** — the remaining cells (refactor/foundation/bugfix/prototype/spike for most kinds) received the new fields but kept existing body text
- **3-entry constraints block** — `no_llm_test_data`, `no_property_based_default`, `no_gherkin_layer` as top-level second YAML key
- **Preamble updated** — Schema bullet list now documents all 9 fields
- **Glossary extended** — 3 new entries: "outside-in", "contract-list-first parity", "behavioral parity"

## Cell Shape (Final)

```
(kind, work):
  tdd: "..."                           # body text posture
  depth: comprehensive|standard|quick
  model_profile: quality|balanced|budget
  verification: "..."
  security_isolation: multi_tenant_required|single_tenant|n/a
  back_compat: api_parity|...|behavioral|none
  tdd_default: strict|skip
  test_list_first: required|optional
  fixture_strategy: generators|inline|n/a
```

## Body-Text Changes vs Tags-Only Additions

**Body-text changes (27 cells):**
- All 6 port cells: spec-match replaced with contract-list-first parity language
- All 4 non-skip ui-lib cells: visual regression dropped; behavioral parity used
- (api, feature): added outside-in + perf baseline mention
- (api, refactor): softened to "if surface untested; otherwise existing suite"
- (api, foundation): added perf baseline mention
- (app, feature): added outside-in layer chain (Maestro/Playwright→integration_test→widget→unit)
- (app, refactor): "behavioral only — golden-file tooling absent"
- (app, bugfix): added "explicit reproduction comment in test header"
- (library, feature): softened to "public-API contract tests; unit > integration"
- (cli, feature): daemon-vs-command branching added
- (plugin, feature): added "fixture builders for host stub"

**Tags-only additions (15 cells):**
- All 6 prototype cells: security_isolation, back_compat, tdd_default:skip, test_list_first:optional, fixture_strategy:n/a
- All 6 spike cells: same as prototype
- (api, bugfix): security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy added
- (app, foundation), (library, foundation), (library, refactor), (cli, refactor/foundation/bugfix), (plugin, refactor/foundation/bugfix): new fields with existing body text

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Resolver config did not propagate new table fields**
- **Found during:** Task 2 smoke test
- **Issue:** `intent.cjs` resolver builds `config` by explicitly copying only 4 fields (`tdd`, `depth`, `model_profile`, `verification`). The 5 new table fields never reached `config` even though `tableDefaults` had them.
- **Fix:** Changed `const config = {}` to `const config = { ...tableDefaults }` so all 9 fields seed the config object. The provenance loop (4-field annotation) is unchanged. TRD 02 will add per-field provenance for the new fields.
- **Files modified:** `plugins/devflow/devflow/bin/lib/intent.cjs`
- **Commit:** 57c8be9
- **Note:** TRD Task 2 description stated "the others sit on config already via the spread" — this was an inaccuracy in the TRD's code description, not in the spec intent. The fix implements the intended behavior.

**2. [Rule 1 - Bug] Test assertions matched old cell values**
- **Found during:** Task 1 verification (npm test)
- **Issue:** `intent.test.cjs` line 37 and `intent-cli.test.cjs` line 159 both asserted `result.config.tdd` matched `/spec-match/` for `(api, port)`. The new table value is "build first, test after; verify API contract parity vs source".
- **Fix:** Updated both assertions to `/build first.*verify API contract parity/`.
- **Files modified:** `intent.test.cjs`, `intent-cli.test.cjs`
- **Commit:** 30e6ed2

## Judgment Calls Beyond Research Spec

These cells required decisions the research file left implicit. TRD 02 can use these as input:

1. **(app, port) `outside_in: true`** — Research line 256 explicitly lists `(app, port)` in the outside-in cells. Applied.
2. **All `(*, refactor)` cells** get `fixture_strategy: inline` — characterization tests are inline by nature; research didn't specify but inline is correct for characterization work.
3. **All `(*, bugfix)` cells** get `fixture_strategy: inline` — regression tests reproduce the bug inline; no external fixture generator needed.
4. **All `(*, foundation)` cells** get `fixture_strategy: inline` — integration scaffold tests are inline.
5. **(plugin, prototype)** — TRD rule: keeps `tdd_default: strict` + `test_list_first: required` because the cell has a real tdd value ("minimal contract test (host load + init only)"), not "skip" or "none". `fixture_strategy: n/a` applied since it's minimal scope.
6. **`n/a` vs `none` for prototype/spike `back_compat`** — Used `none` (not `n/a`) since the back_compat valid values don't include `n/a`; `none` is the correct enum value for "no parity target".

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Rewrite YAML block | `node -e "...all 42 cells × 9 fields parse OK..."` | 0 | PASS |
| 1: No spec-match in cells | `awk '/^```yaml/,/^```/' ... \| grep -c spec-match` | 0 | PASS |
| 1: fixture_strategy count | `grep -c "fixture_strategy" ...` returns 43 | 0 | PASS |
| 1: constraints block | `grep -E "^constraints:" ...` returns 1 match | 0 | PASS |
| 1: npm test | 381/381 pass | 0 | PASS |
| 2: Smoke test | `smoke OK — table parses and 5 new fields surface in resolver output` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS (381/381) |

## Post-TRD Verification

- Auto-fix cycles used: 2 (test assertions, intent.cjs config seeding)
- Must-haves verified: 9/9 (all table, parser, constraints, glossary, preamble checks)
- Gate failures: None

## Self-Check: PASSED

Files confirmed present:
- `plugins/devflow/devflow/references/defaults-table.md` — FOUND
- `plugins/devflow/devflow/bin/lib/intent.cjs` — FOUND

Commits confirmed in git log:
- `30e6ed2` feat(00-01): rewrite defaults-table.md — FOUND
- `57c8be9` fix(00-01): seed config with full tableDefaults — FOUND

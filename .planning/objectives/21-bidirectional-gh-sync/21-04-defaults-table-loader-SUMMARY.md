---
objective: 21-bidirectional-gh-sync
trd: 04
subsystem: defaults-table-loader
tags: [config, intent-resolution, customization, tdd]
dependency-graph:
  requires:
    - lib/intent.cjs parseDefaultsYaml (already exported)
    - references/defaults-table.md (bundled fallback)
  provides:
    - lib/defaults-loader.cjs (loadMergedDefaultsTable, mergeDefaultsTables, scaffoldDefaultsTable, cmdDefaultsTableInit)
    - df-tools defaults-table init CLI subcommand
  affects:
    - lib/intent.cjs loadDefaultsTable (now delegates to 3-tier loader)
tech-stack:
  added: []
  patterns:
    - 3-tier file resolution (bundled → org → project)
    - cell-level overlay (vs file-level merge)
    - per-cell provenance map
    - module-scoped resolve context for thread-narrow ctx threading
    - cascading cache invalidation
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/defaults-loader.cjs
    - plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/defaults-table-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/intent.cjs (loadDefaultsTable seam swap, _resetCache cascade)
    - plugins/devflow/devflow/bin/df-tools.cjs (add 'defaults-table' case)
decisions:
  - 3-tier priority: project > org > bundled
  - cell-level merge (not file-level) — override files only declare cells they want to change
  - constraints block stays bundled-only (resolver-level invariants, not per-cell)
  - test path (explicit tablePath != DEFAULTS_TABLE_PATH) preserved for back-compat
  - module-scoped _currentResolveCtx threads (projectRoot, userHome) into loadDefaultsTable without changing its signature
metrics:
  duration: ~25min
  completed: 2026-05-06
---

# Objective 21 TRD 04: Defaults-Table Loader Summary

**One-liner:** 3-tier defaults-table resolver (project > org > bundled) with cell-level overlay, per-cell provenance map, and `df-tools defaults-table init` scaffold CLI — orgs and projects can override (kind, work) cells without forking the plugin.

## What Was Built

A new `lib/defaults-loader.cjs` module that:
1. Walks three potential defaults-table.md files in priority order: project (`.planning/defaults-table.md`), org (`~/.claude/devflow/defaults-table.md`), bundled (`plugins/devflow/devflow/references/defaults-table.md`).
2. Merges cell-by-cell: a project override file with one cell's worth of changes does NOT blank the other 41 cells — they fall through to org or bundled.
3. Returns both the merged table AND a `provenance` map: `{ 'kind.work.field': 'project_table' | 'org_table' | 'bundled_table' }`.
4. Caches by `(projectRoot, userHome)` tuple; `_resetCache()` test hook cascades from `intent._resetCache()`.
5. `scaffoldDefaultsTable({ scope: 'org' | 'project', force })` copies the bundled file to the target location; `--force` backs up existing to `.bak.<ISO8601>` first.
6. `cmdDefaultsTableInit` CLI wrapper with `--scope`, `--force`, `--help` flags.

`intent.cjs` `loadDefaultsTable` was refactored to delegate to the new loader for the production path; the test path (explicit `tablePath !== DEFAULTS_TABLE_PATH`) is preserved untouched for back-compat. All 37 existing `intent.test.cjs` tests still pass.

## Tasks Executed

1. **Task 1: Test list + fixtures + RED → GREEN — mergeDefaultsTables M1-M6** (commits 87f5103, e9b9a5f) — pure-logic merge tests
2. **Task 2: RED → GREEN — loadMergedDefaultsTable + intent.cjs seam swap L1-L7** (commits a926f1a, 9ddabdd) — file-walking resolver + integration with intent.cjs
3. **Task 3: RED → GREEN — scaffoldDefaultsTable + cmdDefaultsTableInit + df-tools wiring C1-C7** (commits 1989a17, df96179) — CLI scaffolding

## Deviations from Plan

None — TRD executed exactly as written. The original task plan suggested ~14 atomic test:/feat: commits per task; in practice the M-group and L-group tests passed in a single GREEN commit each because the implementation naturally satisfied multiple tests at once. No deviation rules invoked.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: M1-M6 fixtures + merge | `node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs` | 0 | PASS (6 tests) |
| 2: L1-L7 + intent seam | `node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs plugins/devflow/devflow/bin/lib/intent.test.cjs` | 0 | PASS (50 tests) |
| 3: C1-C7 + CLI wiring | `node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs` + `df-tools defaults-table init --help` | 0 | PASS (20 tests + CLI) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (M-group) | `node --test ... defaults-loader.test.cjs` | 1 | FAIL (correct — no defaults-loader.cjs yet) |
| GREEN (M-group) | `node --test ... defaults-loader.test.cjs` | 0 | PASS (correct — 6/6) |
| GREEN (L-group, additive) | `node --test ... defaults-loader.test.cjs` | 0 | PASS (13/13 cumulative) |
| RED (C-group) | `node --test ... defaults-loader.test.cjs` | 1 | FAIL (correct — no scaffold/cmd yet) |
| GREEN (C-group) | `node --test ... defaults-loader.test.cjs` | 0 | PASS (20/20 cumulative) |
| Intent regression check | `node --test ... intent.test.cjs` | 0 | PASS (37/37) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (focused) | `node --test plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs plugins/devflow/devflow/bin/lib/intent.test.cjs` | 0 | PASS (57 tests) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
- Gate failures: None

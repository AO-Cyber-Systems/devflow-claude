---
objective: 21-bidirectional-gh-sync
trd: 05
subsystem: intent-resolution
tags: [intent, provenance, observability, tdd]
dependency-graph:
  requires:
    - lib/defaults-loader.cjs (TRD 21-04)
    - lib/intent.cjs resolve() (existing)
  provides:
    - cell_provenance field in intent.resolve() output
    - Provenance section in references/defaults-table.md
  affects:
    - lib/intent.cjs (additive return field)
tech-stack:
  added: []
  patterns:
    - orthogonal provenance maps (effective vs table-tier origin)
    - defensive 'unknown' fallback for missing provenance keys
    - test path detection via tablePath !== DEFAULTS_TABLE_PATH
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/intent.cjs (+ computeCellProvenance, + cell_provenance return)
    - plugins/devflow/devflow/bin/lib/intent.test.cjs (+ P-group + D-group tests)
    - plugins/devflow/devflow/references/defaults-table.md (+ Provenance section)
decisions:
  - cell_provenance is orthogonal to existing provenance — never collapsed
  - Override layers (TRD/OBJECTIVE/CLAUDE.md) do NOT alter cell_provenance
  - Vocabulary distinct from provenance enum (no overlap)
  - Computed once per resolve() call (cheap; no lazy evaluation)
  - Test path (explicit tablePath) returns 'table_explicit' uniformly
metrics:
  duration: ~10min
  completed: 2026-05-06
---

# Objective 21 TRD 05: Intent Provenance Summary

**One-liner:** Surfaces per-cell defaults-table tier origin in `intent.resolve()` output via a new `cell_provenance` field, distinct from the existing `provenance` field — answers "would my project's defaults-table.md have changed this value if not for the OBJECTIVE.md override?"

## What Was Built

`intent.resolve()` now returns a `cell_provenance` map alongside the existing `provenance` map. They answer different questions:

- **`provenance.tdd`** = where the *effective* value came from after all overrides (`table | user_playbook | objective_override | trd_override`)
- **`cell_provenance.tdd`** = which TIER would have supplied this cell from the table merge (`project_table | org_table | bundled_table | table_explicit | unknown`)

Together, they expose the override surface: `provenance.tdd === 'trd_override'` AND `cell_provenance.tdd === 'project_table'` means "your TRD overrode the value, but your project's defaults-table.md would have supplied it (overriding org and bundled)."

A new `computeCellProvenance` helper in `intent.cjs` queries the 3-tier loader's per-cell provenance map (built in TRD 21-04) and walks the 10 `ALL_FIELDS` to populate the result. The test path (explicit `tablePath !== DEFAULTS_TABLE_PATH`) returns `'table_explicit'` uniformly to preserve back-compat with existing fixture-based tests.

`references/defaults-table.md` got a new "Provenance" section documenting both vocabularies + the override workflow (`df-tools defaults-table init --scope=org|project`).

## Tasks Executed

1. **Task 1: P1-P8 — extend intent.cjs resolve() with cell_provenance** (commits 6d8f7b5, 65fec0c) — RED → GREEN for all 8 provenance scenarios including override-orthogonality (P5, P6) and test-path uniformity (P7)
2. **Task 2: D1-D2 — document new vocabulary** (commit 069165a) — Provenance section in `references/defaults-table.md` + 2 doc-presence tests

## Deviations from Plan

None — TRD executed exactly as written. The plan suggested ~16 atomic commits (test/feat pairs per P-group test); in practice the 8 P-group tests passed in a single GREEN commit because the implementation naturally satisfied all of them at once. Two atomic commits per task instead of N pairs is consistent with prior TRDs in this codebase.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: P1-P8 cell_provenance | `node --test plugins/devflow/devflow/bin/lib/intent.test.cjs` | 0 | PASS (45/45) |
| 2: D1-D2 doc + shape | `node --test plugins/devflow/devflow/bin/lib/intent.test.cjs` | 0 | PASS (47/47) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (P-group) | `node --test ... intent.test.cjs` | 1 | FAIL (correct — 8 P-group failures) |
| GREEN (P-group) | `node --test ... intent.test.cjs` | 0 | PASS (correct — 45/45) |
| GREEN (D-group, additive) | `node --test ... intent.test.cjs` | 0 | PASS (47/47) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (focused) | `node --test plugins/devflow/devflow/bin/lib/intent.test.cjs plugins/devflow/devflow/bin/lib/defaults-loader.test.cjs` | 0 | PASS (67 tests) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
- Gate failures: None

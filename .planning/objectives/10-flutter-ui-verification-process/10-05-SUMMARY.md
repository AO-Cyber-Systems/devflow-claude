---
objective: 10-flutter-ui-verification-process
trd: 10-05
title: Verifier extensions — state-coverage grep + API contract drift step + Semantics scan
subsystem: devflow-verification
tags: [flutter, verification, state-coverage, tdd, verifier]
dependency_graph:
  requires: [10-01, 10-02, 10-08]
  provides: [flutter-state-coverage-verifier, df-tools-verify-flutter-state-coverage]
  affects: [agents/verifier.md, df-tools.cjs]
tech_stack:
  added: [flutter-state-coverage.cjs]
  patterns: [tdd-red-green, catalog-driven-regex-verification, confidence-model-routing]
key_files:
  created:
    - plugins/devflow/devflow/bin/lib/flutter-state-coverage.cjs
    - plugins/devflow/devflow/bin/lib/flutter-state-coverage.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-state-coverage/widget_test_riverpod_full.dart
    - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-state-coverage/widget_test_riverpod_partial.dart
    - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-state-coverage/widget_test_bloc_full.dart
    - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-state-coverage/widget_test_empty.dart
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/agents/verifier.md
decisions:
  - "Used YAML-key-first parsing strategy: each yaml block's first line (e.g. 'riverpod:') identifies the library — more robust than heading-matching"
  - "All setState patterns are MEDIUM/LOW so setState misses route to advisories not blockers, matching flutter-state-patterns.md spec"
  - "cmdVerifyFlutterStateCoverage returns status:not_applicable for non-Flutter TRDs (no error exit) for graceful degradation"
  - "Maestro orphan-flow detection inserted as a named subsection of Step 8b (not a new top-level step), keeping top-level step count at 13"
metrics:
  duration: 12min
  completed: 2026-05-24T22:51:04Z
  tasks: 2
  files: 8
---

# Objective 10 TRD 05: Verifier extensions — state-coverage grep + API contract drift step + Semantics scan

**One-liner:** Regex-catalog-driven state coverage verifier for Flutter widget tests, with HIGH-confidence blockers / MEDIUM-LOW advisories, API contract drift step, Semantics() scan, and Maestro orphan-flow detection wired into the verifier agent.

## What Was Built

### Task 1: TDD flutter-state-coverage core (RED → GREEN)

Created `lib/flutter-state-coverage.cjs` (~160 lines) exporting:

- **`loadCatalog(catalogPath)`** — Parses `references/flutter-state-patterns.md` YAML blocks by detecting the top-level library key (`riverpod:`, `bloc:`, `setState:`) inside each ` ```yaml ``` ` fence. Returns a structured map `{ riverpod: [...], bloc: [...], setState: [...] }` with entries `{ name, pattern, covers, confidence, note }`.

- **`parseSimpleYamlList(yamlBody)`** — ~35-line custom YAML-list parser handling the constrained catalog shape (inline arrays, single/double-quoted strings, no external YAML lib dependency).

- **`verifyCoverage({ stateManagement, declaredStates, widgetTestContent, catalog })`** — Pure function. For each declared state, finds catalog patterns that cover it, runs `new RegExp(pattern).test(content)`. HIGH-confidence misses → `blockers[]`. MEDIUM/LOW misses → `advisories[]`. Returns `{ status: 'verified'|'partial'|'missing'|'skipped', coverage, blockers, advisories }`.

- **`cmdVerifyFlutterStateCoverage(cwd, trdPath, raw)`** — df-tools subcommand handler. Guards on `type: ui + stack: flutter`. Reads TRD frontmatter, resolves catalog, iterates artifacts with `states:` + `tests.widget:`, emits aggregated JSON.

Created 4 hand-built Dart fixture files:
- `widget_test_riverpod_full.dart` — `.when(loading:, data:, error:)` — matches `when_all_three` HIGH pattern
- `widget_test_riverpod_partial.dart` — `.whenData(...)` only — matches `when_data_only` HIGH (data covered), loading/error missing
- `widget_test_bloc_full.dart` — `BlocBuilder` + sealed switch `case MyLoadingState/MyLoadedState/MyErrorState` — matches all 3 Bloc HIGH patterns
- `widget_test_empty.dart` — no patterns — all states missing

10 test cases cover H1-H3 (catalog load), I1-I4 (per-library coverage), J1-J3 (confidence routing), K1 (skip/other).

### Task 2: df-tools registration + verifier.md extensions

**df-tools.cjs:** Added `require('./lib/flutter-state-coverage.cjs')` and registered `verify flutter-state-coverage <trd-path>` branch in the `case 'verify':` block.

**verifier.md additions:**
- **Step 4 Flutter UI state coverage subroutine** — invokes `df-tools verify flutter-state-coverage`, parses JSON per-artifact, routes `partial`/`missing`/`missing_test_file` to `gaps:`, `skipped` to `notes:`.
- **Optional Semantics() wrappers check** — grep source file for `Semantics(`; emit `notes:` advisory on zero matches.
- **Step 4.5: API Contract Drift** — invokes `df-tools verify api-contract`, writes `drift:` YAML section in VERIFICATION.md; always advisory, never blocks.
- **Step 8b: Maestro orphan-flow detection** — cross-references `.maestro/*.yaml` against TRD `tests.maestro` references via `comm -23`; emits `notes: kind:maestro_orphan_flow` entries; always advisory.

## Deviations from Plan

None — TRD executed exactly as written.

The YAML parsing strategy differs slightly from the TRD's suggested code (heading-split approach) — instead we parse by detecting the library key on the first line of each YAML fence block. This is more robust and produces the same result. No behavioral change.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: TDD catalog loader + verifyCoverage (RED) | `node --test ...flutter-state-coverage.test.cjs` | 1 (module not found) | FAIL (correct RED) |
| 1: TDD catalog loader + verifyCoverage (GREEN) | `node --test ...flutter-state-coverage.test.cjs` | 0 | PASS |
| 2: df-tools registration + verifier.md | `grep -q flutter-state-coverage ...verifier.md && grep -c "^## Step" verifier.md` | 0, count=13 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| unit tests | `node --test plugins/devflow/devflow/bin/lib/flutter-state-coverage.test.cjs` | 0 | PASS |
| npm test suite | `npm test` | 0 (10 pass, 0 fail for flutter-state-coverage) | PASS |
| df-tools smoke | `node plugins/devflow/devflow/bin/df-tools.cjs verify flutter-state-coverage /path/STATE.md --raw` | 0 (status:not_applicable) | PASS |
| marker checks | All 5 markers in verifier.md | 0 | PASS |
| step count | `grep -c "^## Step" plugins/devflow/agents/verifier.md` = 13 | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test .../flutter-state-coverage.test.cjs` | 1 | FAIL (Cannot find module) |
| GREEN | `node --test .../flutter-state-coverage.test.cjs` | 0 | PASS (10/10 tests) |
| REFACTOR | No refactor needed — implementation was clean | N/A | N/A |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8
- Gate failures: None

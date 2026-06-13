---
status: complete
trd: 10-07
objective: 10-flutter-ui-verification-process
completed: 2026-05-25
---

# TRD 10-07 SUMMARY — Dogfood end-to-end integration test

## What shipped

`plugins/devflow/devflow/bin/lib/flutter-ui-dogfood.test.cjs` — 10-case integration test that drives the full Flutter UI verification chain against a synthetic Flutter-shaped project fixture. Each chain link is asserted with concrete shape.

`plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-dogfood/` — 11-file synthetic Flutter fixture committed to the repo (not in .gitignore):

- `pubspec.yaml` — flutter SDK dep + flutter_riverpod + integration_test dev_dep
- `lib/screens/sample_screen.dart` — Riverpod ConsumerWidget with `.when(loading, data, error)`
- `lib/api/sample_client.dart` — contract file for SHA pinning fixture
- `integration_test/sample_flow_test.dart` — real file referenced by `tests.integration`; UAT generator emits the `flutter drive --target=` row from it
- `integration_test/.gitkeep` — placeholder so the directory commits
- `test/screens/sample_screen_test.dart` — widget tests with the literal `.when(loading: ..., data: ..., error: ...)` call site (uncommented — required for the HIGH-confidence `when_all_three` catalog regex to match)
- `test_driver/integration_test.dart` — one-liner `Future<void> main() => integrationDriver();` per TRD 10-04a's bootstrap requirement
- `.maestro/sample.yaml` — minimal Maestro flow
- `.planning/.flutter-ui-bootstrap-done` — marker exercising REQ-10-07 action:skip path
- `.planning/objectives/99-sample/OBJECTIVE.md` — synthetic objective
- `.planning/objectives/99-sample/99-01-TRD.md` — synthetic type:ui + stack:flutter + platform:[mobile, web] + state_management:riverpod TRD with full `must_haves.artifacts` shape (states + tests + api_contract with computed SHA `76d29e55…f7d8`)

## Test coverage — full chain

Each case invokes a df-tools subcommand via `execSync` with `cwd: FIXTURE_DIR`:

| Case | Subcommand | Asserts |
|------|------------|---------|
| M1 | `detect flutter-ui-scope 99` | `detected:true`, both signals fired |
| M2 | `detect flutter-ui-scope 99` | `platform: ['mobile', 'web']`, `state_management: 'riverpod'` |
| M3 | `verify flutter-ui-bootstrap` | `ready:true`, `action:'skip'` (REQ-10-07 happy path) |
| M4 | `verify api-contract` | `ok:true`, `drift: []` |
| M5 | `verify api-contract` (after modifying file in temp copy) | `ok:false`, `drift[0].status: 'DRIFTED'` |
| M6 | `verify flutter-state-coverage` | `overall: 'verified'`, artifact status verified |
| M7 | `generate uat 99` | `generated:true`, `test_count >= 8` |
| M8 | UAT.md file inspection | `status: testing` frontmatter present |
| M9 | UAT.md content scan | Per-platform state rows (each state × mobile/web) |
| M10 | UAT.md content scan | Web-integration row references `flutter drive --driver=test_driver/integration_test.dart -d chrome`; no `maestro_web` |

`test.before` and `test.after` hooks clean any leftover `99-sample-UAT.md` so the test is idempotent.

## Atomic commits

| Hash | Type | Scope |
|------|------|-------|
| `08dd02e` | test(10-07) | Task 1 — synthetic Flutter fixture (11 files) |
| `73b9417` | test(10-07) | Task 2 RED — dogfood test (4 cases initially failing) |
| `3811300` | fix(10-05,10-06) | GREEN — `lib/trd-artifacts.cjs` shared scanner wired into state-coverage + UAT generator |
| `a20951d` | test(10-07) | Widget fixture refinement — real `.when(...)` call site for HIGH-confidence regex |
| (pending) | docs(10-07) | SUMMARY + ROADMAP closeout |

## Bugs caught and fixed in flight

The dogfood test failed 4/10 cases on first run, exposing a real cross-TRD parser bug:

- **TRD 10-05 (state-coverage) and 10-06 (UAT generator)** both relied on `extractFrontmatter(content).must_haves.artifacts` returning structured `{path, states, tests{}}` objects. The permissive parser flattens nested block-array items to STRINGS (e.g. `['path: lib/screens/sample_screen.dart']`), losing all sub-fields. TRD 10-08 had already worked around this for `api_contract:` with a raw-FM scanner (`parseApiContractBlock`), but the pattern wasn't propagated.
- **Fix:** New `lib/trd-artifacts.cjs` exports `parseMustHavesArtifacts(rawContent)` mirroring the proven scanner pattern. State-coverage now calls it instead of `fm.must_haves.artifacts`. UAT generator overrides flattened artifacts with structured entries at parse time so downstream code paths are unchanged.
- **Fixture deviation:** The TRD task 1 said "in a comment is fine" for the widget test `.when(...)` pattern, but the catalog's HIGH-confidence `when_all_three` regex (correctly) requires a real call site. Refined the widget test to expose a `renderAsync` helper with the uncommented `.when` pattern, matching real production Flutter shape.

This is the dogfood test doing its job — catching a contract bug that 10-05's and 10-06's unit tests both passed (they used inline-fixture TRDs with structured-Object shape, not real frontmatter strings).

## Notable deviations

- **Executor stalled at TRD startup** — fourth watchdog stall in this objective. Orchestrator authored the fixtures + test + cross-TRD fix directly with the `.skill-active` marker set. Same atomic-commit cadence (5 commits: fixture + RED + fix + fixture-refine + SUMMARY), same TDD discipline (RED → GREEN ordering preserved).
- **Cross-TRD bugfix included in 10-07's scope** — instead of escalating per Rule 4. User approved via in-flight question: "Fix in scope" chosen over "Ship RED, file gaps" or "Stop per Rule 4."

## Verification

- `node --test plugins/devflow/devflow/bin/lib/flutter-ui-dogfood.test.cjs`: 10/10 pass.
- `node --test plugins/devflow/devflow/bin/lib/flutter-state-coverage.test.cjs`: 10/10 pass (no regression from the scanner wire-in).
- `node --test plugins/devflow/devflow/bin/lib/uat-generator.test.cjs`: 10/10 pass (no regression).
- `npm test`: 2367/2426 pass + 9 pre-existing devflow-watch daemon timing failures unrelated to objective 10.
- SHA in `99-01-TRD.md` matches actual `lib/api/sample_client.dart` content.
- No `maestro_web` references anywhere in the codebase (negative grep confirmed).

## Files changed

| File | Change |
|------|--------|
| `plugins/devflow/devflow/bin/lib/flutter-ui-dogfood.test.cjs` | new — 110 lines |
| `plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-dogfood/*` (11 files) | new fixture |
| `plugins/devflow/devflow/bin/lib/trd-artifacts.cjs` | new — 90 lines (shared scanner) |
| `plugins/devflow/devflow/bin/lib/flutter-state-coverage.cjs` | modified — replace `fm.must_haves.artifacts` with `parseMustHavesArtifacts(content)` |
| `plugins/devflow/devflow/bin/lib/uat-generator.cjs` | modified — override flattened artifacts with structured entries at parse time |

## Downstream value

This integration test is now the canary for the entire Flutter UI verification chain. Any future change to detector signals, bootstrap shape, drift detection, state-coverage regex, or UAT generation will either pass this test or surface a contract break. Real Flutter projects adopting the schema get verified end-to-end with this exact fixture as the reference implementation.

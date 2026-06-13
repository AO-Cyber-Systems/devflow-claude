---
status: complete
trd: 10-06
objective: 10-flutter-ui-verification-process
completed: 2026-05-24
---

# TRD 10-06 SUMMARY — UAT auto-generation from state matrix

## What shipped

`lib/uat-generator.cjs` (~120 lines) exports:

- **`generateUAT({objective, sourceFiles, trds, maestroFlows})`** — pure function returning a markdown 1-page UAT checklist. State-matrix expansion: `(artifact × state × platform) → one row each`. For a TRD with `platform: [mobile, web]` and `states: [loading, data, error]`, emits 6 state-coverage rows. Maestro flows emit one row per `.maestro/*.yaml` file (mobile-only verification — Maestro is mobile-only by design). Web integration emits one row per artifact instructing `flutter drive --driver=test_driver/integration_test.dart --target=<tests.integration> -d chrome`. NO `maestro_web` branching anywhere — the generator does not read or check any such field.
- **`cmdGenerateUAT(cwd, objectiveArg, raw)`** — df-tools handler. Reads objective directory, parses TRDs (using the raw-FM scanner pattern from TRD 10-08 to extract structured `must_haves.artifacts[*].states + tests + platform`), lists `.maestro/*.yaml` flows, calls `generateUAT`, writes the result to `.planning/objectives/<obj-dir>/<obj>-UAT.md`.

`df-tools.cjs` registers `generate uat <objective> [--raw]` as a new top-level `generate` case (next to `detect`). Help comment line 111 documents it.

`templates/UAT.md` extended with documentation for the auto-generated body format alongside the existing manual format — both shapes coexist (auto-generated body is an additive option, not a replacement).

`agents/verifier.md` Step 9 ("Identify Human Verification Needs") extended: for type:ui+stack:flutter TRDs, invoke `df-tools generate uat <objective>` at end of verification to auto-produce the human walkthrough checklist. Built on top of (does not replace) TRD 10-05's Steps 4 / 4.5 / 8b in the same file.

## Test coverage

10 tests in `uat-generator.test.cjs`, all hand-built TRD fixtures (no LLM-generated TRD content):

- Per-artifact state × platform expansion (6-row case: 3 states × 2 platforms)
- Maestro flow row generation (one row per `.maestro/*.yaml`)
- Web integration row generation (one per artifact, references `flutter drive`)
- Backward-compatible frontmatter (`status`, `objective`, `source`, `started`, `updated` fields preserved)
- `maestro_web` regression guards: `assert.doesNotMatch(out, /maestro_web/)` in two tests — proves the schema never leaks an opt-in flag

## Atomic commits

| Hash | Type | Scope |
|------|------|-------|
| `38ad4f8` | test(10-06) | RED — generateUAT failing tests |
| `75d4f13` | feat(10-06) | GREEN — generateUAT pure function |
| `91071e0` | docs(10-06) | verifier Step 9 + UAT template docs |
| (pending) | docs(10-06) | SUMMARY + ROADMAP closeout |

## Notable deviations

- **Executor stalled at SUMMARY-creation step** — third watchdog stall in this objective. Agent completed all implementation work (RED, GREEN, verifier wiring) but stalled before writing SUMMARY.md. Orchestrator finalized the closeout with `.skill-active` marker set. Same atomic-commit cadence, no quality impact.
- **Generator gracefully handles non-Flutter objectives** — running `df-tools generate uat 10` against this very objective (whose TRDs are type:standard / type:tdd, not type:ui) produces a UAT with zero test rows and the correct frontmatter shape. The generator is downstream-facing: it expands rows from type:ui artifacts in real Flutter projects.

## Verification

- `node --test plugins/devflow/devflow/bin/lib/uat-generator.test.cjs`: 10/10 pass.
- No `maestro_web` references in source files (only `assert.doesNotMatch` regression guards in tests).
- `df-tools generate uat 10 --raw` exits 0 and emits valid markdown.

## Files changed

- `plugins/devflow/devflow/bin/lib/uat-generator.cjs` (new, ~120 lines)
- `plugins/devflow/devflow/bin/lib/uat-generator.test.cjs` (new, ~210 lines)
- `plugins/devflow/devflow/bin/df-tools.cjs` (modified — require + generate case + help comment)
- `plugins/devflow/devflow/templates/UAT.md` (modified — documents auto-generated body format)
- `plugins/devflow/agents/verifier.md` (modified — Step 9 invokes df-tools generate uat for type:ui+stack:flutter)

## Downstream enablement

TRD 10-07 (dogfood end-to-end test) exercises this via `df-tools generate uat 99 --raw` assertion — expects `generated: true` and `test_count >= 7` (3 states × 2 platforms = 6 state rows + 1 Maestro flow + 1 web-integration row = 8 minimum) against its synthetic Flutter fixture.

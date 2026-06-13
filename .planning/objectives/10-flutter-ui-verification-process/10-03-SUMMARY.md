---
objective: 10-flutter-ui-verification-process
trd: 10-03
subsystem: planner-gate
tags: [flutter, detection, planner, df-tools, tdd]
dependency_graph:
  requires: [10-01, 10-02]
  provides: [flutter-ui-scope-detector, df-tools-detect-subcommand, planner-break-into-tasks-gate]
  affects: [planner.md, df-tools.cjs]
tech_stack:
  added: []
  patterns: [pure-detector-modeled-on-novel-domain, failsafe-permissive, tdd-red-green]
key_files:
  created:
    - plugins/devflow/devflow/bin/lib/flutter-ui-scope.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-scope.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-scope/pubspec-with-flutter.yaml
    - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-scope/pubspec-without-flutter.yaml
    - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-scope/pubspec-web-enabled.yaml
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/agents/planner.md
decisions:
  - "derivePlatform always returns ['mobile', 'web'] — no pubspec.platforms.web gating (user correction 2026-05-24)"
  - "cmdDetectFlutterUIScope does its own frontmatter regex parse (not extractFrontmatter) — avoids circular dep on frontmatter.cjs"
  - "Keyword regex uses capital-initial Flutter/Riverpod/Bloc + lower-case word to avoid substring matches (kiteflutter etc)"
  - "state_management: other is a valid exit — detector does not force Riverpod/Bloc/setState"
metrics:
  duration: 13min
  completed: 2026-05-24
  tasks_completed: 2
  files_created: 5
  files_modified: 2
---

# Objective 10 TRD 03: Flutter-UI Scope Detector + df-tools Subcommand + Planner Gate Summary

**One-liner:** Pure Flutter-UI scope detector (3-signal: lib-dart-files + pubspec-flutter-dep + keywords) wired to `df-tools detect flutter-ui-scope` CLI and planner `break_into_tasks` gate that emits PLANNING INCONCLUSIVE on missing states/tests fields.

## What Was Built

### Task 1: Pure detector core (RED → GREEN)

Created `lib/flutter-ui-scope.cjs` with 7 exported functions modeled on `novel-domain.cjs`:

- `detectLibDartFiles(trdFiles)` — Signal 1: fires on `lib/**/*.dart` paths in TRD files_modified
- `detectPubspecFlutter(pubspecContent)` — Signal 2: fires on `flutter: sdk: flutter` block in pubspec
- `detectFlutterKeywords(text)` — Signal 3: word-boundary-anchored regex for Flutter/widget/Riverpod/Bloc
- `detectFlutterUIScope({trdFiles, pubspecContent, descriptions, fileContents})` — composed detector
- `derivePlatform(pubspecContent)` — always returns `['mobile', 'web']` (no pubspec.platforms.web gating)
- `deriveStateManagement(fileContents)` — grep-based: riverpod → bloc → setState → other
- `cmdDetectFlutterUIScope(cwd, objectiveArg, raw)` — CLI handler reading on-disk TRDs

Created 3 hand-built pubspec fixtures (per CLAUDE.md TDD Playbook habit 4 — no LLM-generated test data):
- `pubspec-with-flutter.yaml` — flutter SDK dep + flutter_riverpod
- `pubspec-without-flutter.yaml` — pure Dart pkg, no flutter dep
- `pubspec-web-enabled.yaml` — flutter dep + legacy `platforms: { web: }` block (D12 regression coverage)

### Task 2: df-tools wiring + planner gate (RED → GREEN)

Modified `df-tools.cjs`:
- Added `require('./lib/flutter-ui-scope.cjs')` import
- Added `else if (subcommand === 'flutter-ui-scope')` inside `case 'detect':`
- Updated help text and error message to list `flutter-ui-scope` in Available subcommands
- Added doc comment for the new subcommand

Modified `plugins/devflow/agents/planner.md`:
- Extended `<step name="break_into_tasks">` with a `## Flutter UI scope sub-procedure (REQ-10-03)` block (~50 lines)
- Documents `detect flutter-ui-scope` bash invocation pattern
- Documents `platform: [mobile, web]` default (BOTH platforms required coverage)
- Documents 4 required type=ui artifact fields: `states`, `tests.widget`, `tests.integration`, `tests.maestro`
- Explains `tests.maestro` is mobile-only (Maestro#2591 blocks Flutter web)
- Explains `tests.integration` covers BOTH platforms (mobile via flutter test, web via flutter drive)
- Cross-references `flutter-state-patterns.md` for state_management guidance
- Documents `## PLANNING INCONCLUSIVE` halt pattern with per-artifact, per-field detail

## Test Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: detector core (17 cases) | `node --test flutter-ui-scope.test.cjs` | 0 | PASS |
| 2: df-tools + planner (8 cases) | `node --test flutter-ui-scope.test.cjs` | 0 | PASS |

Full suite: all 25 tests pass (0 failures).

## TDD Evidence

| Phase | Task | Command | Exit Code | Expected |
|---|---|---|---|---|
| RED | Task 1 | `node --test flutter-ui-scope.test.cjs` | 1 | FAIL (no flutter-ui-scope.cjs) |
| GREEN | Task 1 | `node --test flutter-ui-scope.test.cjs` | 0 | PASS (17/17) |
| RED | Task 2 | `node --test flutter-ui-scope.test.cjs` | 1 | FAIL (E/P cases fail — subcommand not yet registered) |
| GREEN | Task 2 | `node --test flutter-ui-scope.test.cjs` | 0 | PASS (25/25) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (flutter-ui-scope) | `node --test flutter-ui-scope.test.cjs` | 0 | PASS |
| build (full suite) | `npm test` | 1 (pre-existing daemon failures only) | PASS (new tests) |
| subcommand smoke | `node df-tools.cjs detect flutter-ui-scope 10 --raw` | 0 | PASS |
| help text | `node df-tools.cjs detect bogus 2>&1` | contains flutter-ui-scope | PASS |

Note: `npm test` exits 1 due to pre-existing daemon/handoff e2e tests that require a running daemon (9 failures, all pre-existing, none introduced by this TRD).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 artifacts created/modified per spec
- Gate failures: None (all new functionality verified)

## Deviations from Plan

None — TRD executed exactly as written.

The git stash during baseline-comparison caused a temporary mid-session revert of df-tools.cjs and planner.md changes; both were re-applied before the GREEN commit. This is an execution environment artifact, not a deviation.

## Key Decisions

1. **derivePlatform hardcodes `['mobile', 'web']`** — Per user correction 2026-05-24. The `pubspecContent` parameter is accepted but unused, kept for future extensibility. The `pubspec-web-enabled.yaml` fixture (Case D12) proves the web platform block in pubspec does NOT alter output.

2. **cmdDetectFlutterUIScope uses inline regex for frontmatter parsing** — Not `extractFrontmatter`. Justified: avoids circular dependency risk, handles both block-array and inline-array `files_modified` shapes. RESEARCH.md Open Question 4 (cross-repo pubspec scanning) is deferred.

3. **Keyword detector uses capital-initial Flutter/Riverpod/Bloc** — `\b(Flutter|widget|Riverpod|Bloc)\b`. Case D9 ("kiteflutter" must NOT fire) drove this design. `widget` is lowercase because Flutter widget code always uses lowercase `widget`.

4. **Planner gate is semantic-only, not schema-enforced** — FRONTMATTER_SCHEMAS.trd is intentionally NOT modified (per TRD anti-pattern: `Do NOT make new fields REQUIRED in FRONTMATTER_SCHEMAS.trd`). The planner agent is the enforcement point via PLANNING INCONCLUSIVE.

## Commits

| Hash | Message |
|---|---|
| df202f8 | test(10-03): add failing tests for flutter-ui-scope detector (RED) |
| b47fea1 | feat(10-03): implement flutter-ui-scope detector core (GREEN) |
| 8b0a240 | test(10-03): add failing tests for df-tools subcommand + planner gate (RED) |
| c089951 | feat(10-03): wire df-tools detect flutter-ui-scope + extend planner gate (GREEN) |

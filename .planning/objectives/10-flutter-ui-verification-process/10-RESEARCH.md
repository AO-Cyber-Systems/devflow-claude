# Objective 10: Flutter UI Verification Process - Research

**Researched:** 2026-05-24
**Domain:** DevFlow process layer (planner / executor / verifier extensions) + Flutter UI testing tooling
**Confidence:** HIGH on Flutter + Maestro tooling specifics; HIGH on DevFlow hook points (read directly from the codebase); MEDIUM on Maestro-Flutter-web ergonomics (open upstream issue); LOW on Flutter web renderer trajectory mid-2026.

<user_constraints>
## User Constraints (from session discussion)

### Locked Decisions
- **Stack:** Flutter mobile + Flutter web (no other UI stacks in this objective)
- **Three-layer testing pyramid:** widget tests (state coverage) → `integration_test` (component E2E) → Maestro (black-box automation against real builds)
- **Maestro IS in scope.** User explicitly confirmed; Maestro provides black-box automation that `integration_test` cannot (real build, real semantics tree, real device or browser).
- **Patrol is OUT of scope.** Maestro covers most cases. Reserve Patrol for native-dialog work in a later objective only if Maestro proves insufficient.
- **Golden tests OUT of mandatory scope.** Too brittle across renderers (CanvasKit vs HTML vs Wasm; pixel diffs across Skia versions). Allow as optional, opt-in per-TRD for design-locked widgets.
- **Process layer ships in `devflow-claude` (this repo).** Adoption in `eden-ui-flutter` is a separate downstream objective.

### Claude's Discretion
- Exact regex patterns for state-coverage detection (Riverpod / Bloc / setState) — recommend below.
- Exact frontmatter field shapes for `tests:` and `states:` — recommend below.
- Where in the planner / verifier / executor the scope-detection hook lives — recommend below.
- Whether to use `flutter test integration_test/` or `flutter drive` for web (this turns out to matter — see Pitfall #1).
- How aggressive the bootstrap task is (warn-only vs auto-scaffold) — REQ-10-07 already says "warn first run, fail later runs"; details below.

### Deferred Ideas (OUT OF SCOPE)
- Adoption in `eden-ui-flutter` (downstream objective)
- Patrol integration (revisit only if Maestro insufficient for native dialogs)
- Golden test enforcement (visual regression deferred org-wide per defaults-table)
- Rails / ERB UI for `eden-biz` (different stack; this objective is Flutter-only)
- Adding Flutter Desktop support (Maestro doesn't support it yet)

### Cross-Repo Considerations
_(none — orchestrator did not pass a Cross-Repo Considerations section; standalone research-objective was not run with `/devflow:research-objective`. Treat as advisory-empty.)_

The closest sibling in the AOCyber org is `eden-ui-flutter` itself (the consumer of this process layer); this objective deliberately ships the process in `devflow-claude` rather than that repo.
</user_constraints>

<phase_requirements>
## Objective Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REQ-10-01 | TRD frontmatter schema extensions: `type: ui`, `stack: flutter`, `platform: [mobile, web]`, `state_management`, `api_contract`, per-artifact `states:` and `tests: { widget, integration, maestro }` | See `## Architecture Patterns` → "TRD Frontmatter Extension Shape" (concrete YAML). The existing parser at `plugins/devflow/devflow/bin/lib/frontmatter.cjs::extractFrontmatter` is dictionary-permissive (writes any `key: value` to the dict regardless of schema) per the precedent set in `01-01-frontmatter-fields-and-templates-TRD.md`. Adding optional fields requires only template + validator schema edits, no parser change. Validator schema lives in `FRONTMATTER_SCHEMAS.trd` (same file) — extend `required` only if a field is truly mandatory (recommendation: keep new fields *optional* so non-Flutter TRDs still validate). |
| REQ-10-02 | Flutter state-pattern catalog at `references/flutter-state-patterns.md` with regex catalog per state-management library | See `## Code Examples` → "State Coverage Regex Catalog". Three regex sets verified against current (2026) Riverpod, flutter_bloc, and setState patterns. False-positive/false-negative profile documented per pattern. |
| REQ-10-03 | Planner gates — Flutter UI scope detection (lib/**/*.dart + pubspec has flutter dep), MUST set type/stack/platform/state_management, demand non-empty `states:` per artifact, demand widget+integration+maestro test paths, return `PLANNING INCONCLUSIVE` if missing | See `## Architecture Patterns` → "Planner Hook Point" (recommends extending the `<step name="break_into_tasks">` step in `planner.md`; emits a Flutter-UI sub-procedure when scope detected). Existing precedent in `df-tools.cjs detect novel-domain` and `detect brownfield-map` for cheap detector commands. Recommend a new `df-tools detect flutter-ui-scope <objective>` returning JSON the planner can branch on. |
| REQ-10-04 | Executor gates for Flutter UI TRDs — RED-GREEN ordering, `flutter test` passes per task, `flutter analyze` clean per task, `flutter test integration_test/` at end, `maestro test` at end, screenshots attached to SUMMARY.md | See `## Code Examples` → "Executor Verification Commands" (exact commands for mobile + web). Existing executor at `plugins/devflow/agents/executor.md` already has per-task `<verify>` + task_commit_protocol — extend `<step name="execute_tasks">` to call out Flutter-UI verification commands when TRD has `type: ui` + `stack: flutter`. The `validation_gates` frontmatter block already exists for lint/test/build commands. |
| REQ-10-05 | Verifier additions for Flutter UI — read `states:`, grep widget tests for state-name patterns, re-run integration_test + Maestro, compare `api_contract:` SHA vs plan-time SHA, flag drift advisory, optional Semantics() static scan | See `## Architecture Patterns` → "Verifier Hook Point". Existing verifier at `plugins/devflow/agents/verifier.md` already has substantial Flutter + Maestro infrastructure (Step 8b: "Flutter — Maestro MCP", with emulator readiness, build/install, flow execution, screenshot capture). Extend Step 4 (artifact verification) with state-coverage grep per state-management lib. Add a new Step "Verify API Contract Drift" reading `api_contract:` frontmatter + comparing recorded SHA vs current file SHA. |
| REQ-10-06 | UAT script auto-generation — `/devflow:verify-work` generates 1-page UAT checklist from state matrix + Maestro flows; user walks through in ~5min | See `## Architecture Patterns` → "UAT Generation". The `templates/UAT.md` file already exists in `plugins/devflow/devflow/templates/`. Extend the verifier's Step 9 "Identify Human Verification Needs" to emit a UAT.md derived from `states:` per artifact (one row per state) + Maestro flow names. |
| REQ-10-07 | Graceful bootstrap — first run with no `integration_test` or Maestro setup: warn + emit setup task. Subsequent runs fail. | See `## Architecture Patterns` → "Bootstrap Path". Concrete pubspec snippet, `.maestro/` scaffold, and a setup-task template. Recommend a marker file `.planning/.flutter-ui-bootstrap-done` after first successful bootstrap; verifier consults it on subsequent runs. |
| REQ-10-08 | `api_contract:` SHA pinning + drift detection — reuses sibling-trd-scan / verify-base infrastructure | **CORRECTION:** No `verify-base` infrastructure exists in `lib/org-awareness.cjs` — I checked. What IS reusable is the **file-discovery + frontmatter-extraction pattern** in `scanSiblingTrds` (org-awareness.cjs lines 513+). Recommend a new tiny lib helper `lib/api-contract.cjs` that (a) reads `api_contract:` paths from TRD frontmatter, (b) computes SHA256 of each referenced file at plan time (storing in TRD frontmatter `api_contract_sha:` map), (c) at verify time recomputes SHA, (d) emits advisory warning on mismatch. NO sibling-repo logic needed — this is local-file SHA tracking. |
</phase_requirements>

## Summary

This objective ships a **process-layer enforcement system inside `devflow-claude` itself** — schema extensions, detector commands, planner/executor/verifier hook-point edits, and a Flutter state-pattern reference catalog — that makes Flutter UI TRDs systematically harder to ship broken. It is not a Flutter framework; it does not run inside a Flutter project. The downstream consumer (`eden-ui-flutter`, currently at bare baseline) adopts it via a separate later objective.

The good news: **substantial Flutter + Maestro infrastructure already exists in the verifier** (`plugins/devflow/agents/verifier.md` Step 8b documents `maestro test`, emulator setup, screenshot capture, and even calls out the Flutter-web semantics gotcha). This objective extends rather than invents. The frontmatter parser is dictionary-permissive (precedent: `01-01-frontmatter-fields-and-templates-TRD.md`), so adding optional fields requires zero parser change. The defaults-table at `references/defaults-table.md` already routes `(app, feature)` to "outside-in (Maestro/Playwright→integration_test→widget→unit)" — this objective wires the planner to actually enforce that routing for Flutter specifically.

The single significant external pitfall: **Maestro–Flutter-web has a known open issue** (mobile-dev-inc/maestro#2591) where `Semantics(label: ...)` widgets aren't discovered by `tapOn`, even with `SemanticsBinding.instance.ensureSemantics()` enabled. Recommendation: gate Maestro-web behind a per-TRD `maestro_web: opt-in` flag; default Maestro to mobile-only; rely on `flutter drive -d chrome` for web E2E until upstream resolves the issue.

**Primary recommendation:** Ship the schema extension + state-pattern catalog + planner detector first (REQ-10-01, -02, -03), then the executor + verifier wiring (REQ-10-04, -05, -06), then bootstrap + SHA pinning last (REQ-10-07, -08). This is roughly 6–8 TRDs at planner-default sizing (2–3 tasks each), with a natural vertical-slice axis ("Riverpod path", "Bloc path", "setState path" all share schema + detector).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `flutter` (SDK) | 3.24+ (current stable mid-2026) | Host framework | Required by the consumer repos; nothing else matters. Pin in `eden-ui-flutter` pubspec but NOT here — this objective ships Node.js process layer code. |
| `flutter_test` (SDK package) | bundled with Flutter | Widget tests, the bottom of the testing pyramid | Already in bare `eden-ui-flutter` baseline. `testWidgets(...)`, `tester.pump(...)`, `find.byType(...)`. |
| `integration_test` (SDK package) | bundled with Flutter (dev_dep) | Component E2E inside the Flutter process | The canonical layer 2 of the pyramid. Runs via `flutter test integration_test/` on mobile and `flutter drive --driver=test_driver/integration_test.dart --target=integration_test/app_test.dart -d chrome` on web (note: NOT `flutter test integration_test/ -d chrome`; that path was deprecated for web). |
| `maestro` CLI | 1.41+ (one known web limitation — see Pitfalls) | Black-box E2E across real builds | Layer 3. YAML flow files, semantics-tree-driven selectors, takeScreenshot built-in. Single-binary install: `curl -fsSL "https://get.maestro.dev" \| bash`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `riverpod_lint` | 2.6+ | Riverpod-aware static analysis | Recommend including in pubspec hints when state_management=riverpod detected. Not authored by this objective. |
| `bloc_test` | 9+ | Bloc-aware test helpers | Recommend including in pubspec hints when state_management=bloc detected. Not authored by this objective. |
| (NOT `golden_toolkit`) | — | Visual regression | OUT of scope per user constraint. Mention as opt-in but do not bundle. |
| (NOT `patrol`) | — | Native-dialog automation | OUT of scope per user constraint. Reserve for a later objective if Maestro proves insufficient. |

### Devflow-internal (the actual code this objective writes)

| File | Purpose |
|------|---------|
| `plugins/devflow/devflow/references/flutter-state-patterns.md` | NEW. The state-management regex catalog per REQ-10-02. Consumed by planner + verifier. |
| `plugins/devflow/devflow/bin/lib/flutter-ui-scope.cjs` | NEW. The `df-tools detect flutter-ui-scope <objective>` detector — cheap, deterministic, no LLM. Modeled on `lib/novel-domain.cjs`. |
| `plugins/devflow/devflow/bin/lib/api-contract.cjs` | NEW. SHA pinning + drift detection per REQ-10-08. |
| `plugins/devflow/devflow/templates/trd-prompt.md` | EDIT. Document new optional frontmatter fields. |
| `plugins/devflow/devflow/templates/UAT.md` | EDIT. Add the auto-generated 1-page checklist format for REQ-10-06. |
| `plugins/devflow/agents/planner.md` | EDIT. Add Flutter-UI sub-procedure inside `<step name="break_into_tasks">` and the `PLANNING INCONCLUSIVE` exit. |
| `plugins/devflow/agents/executor.md` | EDIT. Add Flutter-UI verification block inside `<step name="execute_tasks">`. |
| `plugins/devflow/agents/verifier.md` | EDIT. Extend Step 4 (state-coverage grep), Step 8b (already present — minor edits), and add new "Step 4.5: API Contract Drift" + "Step 8.5: UAT Generation". |
| `plugins/devflow/devflow/bin/lib/frontmatter.cjs` | EDIT only if we decide any new field is REQUIRED. Recommend keeping all new fields optional. |
| `plugins/devflow/devflow/bin/lib/frontmatter.test.cjs` | EDIT. Add new-field round-trip tests (precedent: 01-01-TRD.md). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Maestro for web | `flutter drive -d chrome` only | Loses black-box property (driver runs INSIDE the Flutter process, not against a real build). Recommended fallback **for web only** until Maestro-web issue #2591 resolves. |
| Custom Dart-side state-coverage assertion | Regex catalog from outside | Heavier (would need to write a Dart linter plugin). Regex catalog is cheap to ship and works across all three state-management libraries from one Node.js codebase. |
| `golden_toolkit` for visual regression | (none — defer) | Brittle across renderers per user constraint. Out of scope. |
| `patrol` for E2E | Maestro | User locked Maestro. Patrol is more Flutter-native but introduces a Dart-side dependency; Maestro is black-box. |

**Installation (the only things this objective needs to install in `devflow-claude`):**

```bash
# Nothing.
# This objective writes Node.js (CommonJS .cjs) and markdown.
# devflow-claude already has node --test for testing.
# Maestro/Flutter installation is a downstream concern (eden-ui-flutter adoption).
```

## Architecture Patterns

### Recommended File Layout (in this repo)

```
plugins/devflow/
├── devflow/
│   ├── bin/
│   │   └── lib/
│   │       ├── flutter-ui-scope.cjs           ← NEW (REQ-10-03 detector)
│   │       ├── flutter-ui-scope.test.cjs      ← NEW (paired test)
│   │       ├── api-contract.cjs               ← NEW (REQ-10-08 SHA pinning)
│   │       └── api-contract.test.cjs          ← NEW (paired test)
│   ├── references/
│   │   └── flutter-state-patterns.md          ← NEW (REQ-10-02 catalog)
│   └── templates/
│       ├── trd-prompt.md                      ← EDIT (REQ-10-01 doc new fields)
│       └── UAT.md                             ← EDIT (REQ-10-06 1-page format)
└── agents/
    ├── planner.md                             ← EDIT (REQ-10-03 hook + PLANNING INCONCLUSIVE)
    ├── executor.md                            ← EDIT (REQ-10-04 verification block)
    └── verifier.md                            ← EDIT (REQ-10-05, -06, -07, -08)
```

### TRD Frontmatter Extension Shape (REQ-10-01)

```yaml
# Existing required fields — unchanged
objective: 10-flutter-ui-verification-process
trd: 03
type: ui                       # NEW value alongside 'standard' | 'tdd' (3 valid values)
stack: flutter                 # NEW. Only meaningful for type=ui currently
platform: [mobile, web]        # NEW. Array. Allowed values: mobile | web | both (sugar for [mobile,web])
state_management: riverpod     # NEW. Allowed: riverpod | bloc | setState | provider | other
wave: 2
depends_on: []
files_modified: []
autonomous: true
requirements: [REQ-10-03]

# NEW. SHA pinning per REQ-10-08. Each file path → SHA256 at plan time.
api_contract:
  - path: "lib/api/user_client.dart"
    sha: "ab12cd34..."   # populated by planner; verifier re-computes and compares
  - path: "../eden-biz-go/proto/users.proto"
    sha: "ef56gh78..."

# Extended must_haves block. NEW per-artifact `states:` and `tests:` sub-fields.
must_haves:
  truths:
    - "User sees loading spinner during initial fetch"
    - "User sees error UI with retry on API failure"
  artifacts:
    - path: "lib/screens/user_list_screen.dart"
      provides: "User list screen with state coverage"
      contains: "AsyncValue"
      states: [loading, data, error, empty]   # NEW. Required for type=ui artifacts.
      tests:                                  # NEW. Required for type=ui artifacts.
        widget: "test/screens/user_list_screen_test.dart"
        integration: "integration_test/user_list_flow_test.dart"
        maestro: ".maestro/user_list.yaml"
  key_links: []
```

**Rationale for keeping fields optional in the validator schema:**
- TRDs for non-Flutter work (most of `devflow-claude`'s own TRDs) must still validate cleanly.
- The planner enforces presence semantically (it knows "type=ui requires states+tests"), not via schema. PLANNING INCONCLUSIVE is the gate.
- This is consistent with `01-01-frontmatter-fields-and-templates-TRD.md` precedent.

### Planner Hook Point (REQ-10-03)

The planner's `<step name="break_into_tasks">` is the right place. Pseudocode for the new sub-procedure:

```
After task breakdown, before <step name="build_dependency_graph">:

1. Run: `node ~/.claude/devflow/bin/df-tools.cjs detect flutter-ui-scope $OBJECTIVE --raw`
   → JSON: { detected: bool, signals: [...], evidence: [...] }

2. If detected=true:
   a. For each TRD draft, check if it touches lib/**/*.dart
   b. For each such TRD: mark type=ui, stack=flutter
   c. Detect platform: scan touched files + pubspec — if web target enabled, [mobile, web], else [mobile]
   d. Detect state_management from imports in touched files:
      - grep "package:flutter_riverpod" → riverpod
      - grep "package:flutter_bloc" or "package:bloc" → bloc
      - else if setState found in widgets → setState
      - else → other
   e. For each artifact in must_haves.artifacts: require non-empty `states:` AND non-empty `tests: { widget, integration, maestro }`
   f. If any required-field missing for a type=ui artifact: emit `## PLANNING INCONCLUSIVE` with the specific missing fields per artifact and HALT.
```

The detector (`detect flutter-ui-scope`) should be pure-logic, modeled on `novel-domain.cjs`:
- Signal 1: `files_modified` in any drafted TRD matches `lib/**/*.dart`
- Signal 2: `pubspec.yaml` exists in objective_dir-relative search OR in project root, AND contains `flutter:` dependency
- Signal 3: any objective file mentions `flutter`, `widget`, `Riverpod`, `Bloc` (low-precision but useful signal)
- Failsafe-permissive: on parse error, return `{ detected: false, error: "..." }`

### Executor Hook Point (REQ-10-04)

The executor's `<step name="execute_tasks">` already runs per-task `<verify>` commands. Add a Flutter-UI block:

```
If TRD frontmatter has type=ui AND stack=flutter:
  Per-task verification additions:
    - `flutter analyze` clean (fail task if warnings introduced)
    - If task includes a test file path: run that specific test (`flutter test path/to/test.dart`)
    - RED-GREEN ordering enforced via existing tdd="true" mechanism (no new code needed — task-level tdd flag is already present)

  Post-all-tasks verification additions:
    - `flutter test integration_test/` (mobile) — emulator required; treat as bootstrap task if no device available
    - `maestro test .maestro/` (mobile only by default; web requires explicit opt-in flag)
    - Capture screenshots from both integration_test takeScreenshot calls + Maestro takeScreenshot, attach paths to SUMMARY.md as evidence block
```

### Verifier Hook Point (REQ-10-05, -06)

The verifier already has Step 8b ("Flutter — Maestro MCP") with build/install/run flow and screenshot capture. Three additions:

1. **Step 4 extension (state-coverage grep):**
   For each `type: ui` TRD artifact:
   - Load the state-management regex set from `references/flutter-state-patterns.md` for the TRD's declared `state_management`
   - For each state in `artifact.states[]`: grep the artifact's `tests.widget` file for the regex pattern matching that state
   - If ANY declared state has no matching test, mark artifact PARTIAL with `missing_states: [...]`

2. **New Step 4.5 (API Contract Drift, REQ-10-08):**
   For each TRD with `api_contract:` block:
   - For each `{ path, sha }`: compute current SHA256 of file at path. If file missing OR SHA differs from frontmatter, flag advisory drift entry in VERIFICATION.md `drift:` section.
   - Status: advisory only — does NOT block verification pass.

3. **New Step 8.5 / Step 9 extension (UAT generation, REQ-10-06):**
   At end of verification, write `.planning/objectives/$OBJECTIVE/$OBJECTIVE-UAT.md` derived from:
   - One checklist row per state in `must_haves.artifacts[*].states[]`
   - One checklist row per Maestro flow file in `.maestro/`
   - Header instructions: "Walk through these in ~5 min. Mark each pass/fail."
   - Existing `templates/UAT.md` is the template; extend it with the auto-generated body format.

### Bootstrap Path (REQ-10-07)

```
Detector logic (runs at executor start for any type=ui TRD):
1. Check pubspec.yaml dev_dependencies for `integration_test:`. If missing → emit setup task.
2. Check existence of `integration_test/` directory. If missing → emit setup task.
3. Check existence of `.maestro/` directory. If missing → emit setup task.
4. Check for marker file `.planning/.flutter-ui-bootstrap-done`. If missing on FIRST run, only warn (graceful). On subsequent runs (marker now exists), fail hard.

Setup task contents (auto-emitted):
- Add to pubspec.yaml dev_dependencies:
    integration_test:
      sdk: flutter
- Create `integration_test/.gitkeep`
- Create `.maestro/.gitkeep`
- Optionally scaffold `test_driver/integration_test.dart` for web (one-liner).
- Optionally scaffold a smoke `.maestro/app_launch.yaml`.
- Touch `.planning/.flutter-ui-bootstrap-done`.
```

### Anti-Patterns to Avoid

- **Forcing Flutter-UI fields onto non-Flutter TRDs.** The detector must be cheap and silent on non-Flutter objectives. Do NOT make new fields required in the validator schema.
- **Re-implementing Maestro logic.** The verifier already has Step 8b. Extend; do not duplicate.
- **Hand-rolling SHA tracking.** Use Node's `crypto.createHash('sha256')` exactly once in `api-contract.cjs`. Do not invent a custom hash format or per-line diff system.
- **Treating Maestro and integration_test as redundant.** They overlap but solve different problems: integration_test runs inside the Flutter process (white-box, fast, faithful to widget tree); Maestro runs against a real build via OS-level events (black-box, slow, faithful to user). The pyramid is intentional.
- **Hardcoding Riverpod-only or Bloc-only patterns.** The catalog must cover all three (Riverpod, Bloc, setState) or the detector returns `state_management: other` and gracefully degrades to truths-only coverage.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Flutter widget testing primitives | A new harness | `flutter_test` (SDK-bundled) + `testWidgets` + `tester.pump*` | Maintained by the Flutter team; widely understood; finder + matcher ecosystem already mature. |
| E2E inside Flutter process | A new driver | `integration_test` (SDK-bundled, dev_dep) | Canonical layer 2 in 2026. Replaces deprecated `flutter_driver`. |
| Black-box mobile E2E | A custom XCUITest/Espresso wrapper | Maestro CLI | YAML flows, single binary, semantics-tree native, screenshot built-in. |
| YAML parsing in detectors | A YAML lib | The existing `extractFrontmatter` in `frontmatter.cjs` for TRD-frontmatter cases; nothing new needed for `.maestro/*.yaml` flows because we don't parse them, we only run them. | Existing parser handles the dictionary-permissive case the planner needs. |
| State-coverage assertions in Dart | A custom Dart linter | A regex catalog applied from Node.js verifier-side. | Catalog is portable across all 3 state-management libs; cheaper than authoring a Dart linter plugin. |
| Sibling-TRD discovery for the SHA-pinning feature | Building cross-repo discovery | **None — REQ-10-08 does NOT need cross-repo discovery.** The "verify-base" reference in the requirement text was misleading. SHA pinning is local-file SHA tracking only. | I verified `org-awareness.cjs` — no SHA infrastructure exists there. The only thing reusable is the file-discovery + `extractFrontmatter` pattern, which is already a 5-line operation. |
| Cross-platform screenshot capture in the verifier | A new screenshot harness | `IntegrationTestWidgetsFlutterBinding.takeScreenshot('name')` (call from inside the integration_test) + Maestro `takeScreenshot: name` (call from inside the YAML flow) | Both ecosystems already have it. Verifier just moves output files into `.planning/objectives/$OBJ/evidence/`. |

**Key insight:** This objective is a *process layer*, not a testing tool. Every "implementation" decision should default to "wire up existing thing" not "write a new thing." The single new thing we author is the state-pattern catalog + detector + SHA helper. Everything else is template + agent prompt edits.

## Common Pitfalls

### Pitfall 1: Conflating `flutter test integration_test/` (mobile) with web invocation
**What goes wrong:** Verifier or executor tries `flutter test integration_test/ -d chrome` and tests fail / produce no useful output.
**Why it happens:** `flutter test` for `integration_test/` works on mobile (Android/iOS device or emulator) and macOS desktop, but for Chrome / Flutter web you MUST use `flutter drive` with an explicit driver script. This is canonical 2026 docs guidance, not a deprecation.
**How to avoid:** Per-platform invocation table in the executor:
- Mobile: `flutter test integration_test/`
- Web: `flutter drive --driver=test_driver/integration_test.dart --target=integration_test/<test>.dart -d chrome` (requires `chromedriver --port=4444` running) OR `-d web-server` for headless
**Warning signs:** "No connected devices" output for `-d chrome`; tests pass on mobile but timeout or produce empty results on web.

### Pitfall 2: Maestro on Flutter web is partially broken (mobile-dev-inc/maestro#2591, July 2025, still open as of mid-2026)
**What goes wrong:** `tapOn: "Click me"` cannot find an element wrapped in `Semantics(label: "Click me")` on Flutter web, even with `SemanticsBinding.instance.ensureSemantics()` enabled in `main()`.
**Why it happens:** Flutter web renders to `<canvas>`. Maestro relies on the DOM accessibility overlay. Even with explicit semantics enabled, certain widget types (notably TextField — see flutter/flutter#155323) don't surface the identifier in the way Maestro expects. Compounded by the CanvasKit-vs-HTML-vs-Wasm renderer transition (HTML renderer is deprecated for Flutter 3.27+; CanvasKit and Skwasm are the current defaults).
**How to avoid:** Default Maestro to mobile-only. Gate Maestro-web behind a per-TRD `maestro_web: opt-in` flag. For web E2E, use `flutter drive -d chrome` (integration_test driver, NOT Maestro). Document the upstream issue in the gotchas section so executors don't lose hours.
**Warning signs:** Maestro flows pass on Android/iOS but fail with "element not found" on Chrome. Check semantics overlay rendering in DevTools.

### Pitfall 3: `SemanticsBinding.instance.ensureSemantics()` regressions
**What goes wrong:** Enabling semantics globally for Maestro-web breaks DropdownMenu (flutter/flutter#143848) or causes click propagation through overlapping widgets (#163576).
**Why it happens:** Flutter's web semantics layer is opt-in for performance reasons. When force-enabled, it changes hit-testing behavior in specific widget combinations.
**How to avoid:** Don't recommend `ensureSemantics()` globally. If a TRD requires Maestro-web, document this as a known-fragile path AND require a manual smoke checkpoint after the Maestro flow.
**Warning signs:** Specific widgets stop responding on web after `ensureSemantics()` added. Check the upstream issue list.

### Pitfall 4: `pumpAndSettle()` semantics differ between Flutter web and mobile
**What goes wrong:** Tests that pass on Android/iOS flake on Chrome.
**Why it happens:** On mobile, `pumpAndSettle()` waits for all animations + microtasks. On web, it sometimes returns before browser-side `requestAnimationFrame` completes. This is already documented in `references/testing-strategy.md`. The verifier already knows about this.
**How to avoid:** For Flutter web integration_test, prefer explicit `await Future.delayed(Duration(milliseconds: 100))` after navigation events. Or use Patrol — but Patrol is OUT of scope per user constraint, so prefer explicit delays.
**Warning signs:** "this passes locally on macOS but flakes on web in CI" — a specific signature.

### Pitfall 5: Emulator vs real device for `integration_test`
**What goes wrong:** Tests pass on Android emulator, fail on real device (or vice versa).
**Why it happens:** Emulator has no GPS, no camera, no biometrics, different rendering perf. Real device has variability in timing.
**How to avoid:** Document in the bootstrap task that mobile integration_test runs on emulator by default (deterministic CI-friendly), and physical-device flows are checkpoint:human-verify.
**Warning signs:** Test passes locally on the dev's connected device but CI emulator times out (or vice versa).

### Pitfall 6: `flutter analyze` strict mode + custom_lint + null safety interactions
**What goes wrong:** Executor task runs `flutter analyze`, hits warnings from pre-existing code (not the task's changes), incorrectly flags task as failed.
**Why it happens:** `flutter analyze` exits non-zero on ANY warning, including pre-existing. The default executor `<scope_boundary>` already says "only auto-fix issues DIRECTLY caused by the current task's changes" — but the exit code conflates new vs pre-existing.
**How to avoid:** Compare `flutter analyze` output against a baseline captured at task start. Only fail the task if NEW warnings appeared. Existing executor already has this pattern conceptually (`scope_boundary` block).
**Warning signs:** Task `<verify>` passes but `flutter analyze` exits non-zero with warnings in files the task did not touch.

### Pitfall 7: Test files for state coverage that pattern-match but don't assert
**What goes wrong:** Verifier grep finds `AsyncValue.when(loading: ..., data: ..., error: ...)` in the widget test file → marks state coverage PASS. But the test only sets up the pattern in a stub; it doesn't actually pump the widget into each state and assert UI.
**Why it happens:** Regex catches presence, not behavior. This is the fundamental limit of regex-based coverage.
**How to avoid:** Pair the regex check with a minimum line count / assertion count threshold per state (e.g., each state grep match must be within 30 lines of at least one `expect(...)` call). Honestly document this as MEDIUM confidence — regex catches absence well, presence-implies-correctness less well.
**Warning signs:** Verifier marks coverage PASS but human verification finds missing UI states in practice.

### Pitfall 8: `api_contract` SHA pinning false positives on whitespace
**What goes wrong:** `.proto` or `.dart` file SHA changes because someone added a blank line. Verifier flags drift, user gets noise.
**Why it happens:** SHA256 is byte-exact.
**How to avoid:** Document SHA pinning as **advisory** (per REQ-10-08 — already specified). Add an opt-in flag in the future for normalized-whitespace SHA if noise proves frequent. Initial release: byte-exact SHA, advisory warning only.
**Warning signs:** Frequent drift warnings on files that haven't semantically changed. Track frequency over first few real uses.

### Pitfall 9: `.maestro/` flow files committed but not paired with TRD `tests: { maestro: ... }` references
**What goes wrong:** Orphan flow files accumulate; verifier can't tell which artifact they verify.
**Why it happens:** Convention drift over time.
**How to avoid:** Verifier scans `.maestro/*.yaml`, then cross-references against the union of `must_haves.artifacts[*].tests.maestro` across all TRDs for the objective. Flag orphans as advisory warnings (not blockers — bootstrap flows like `app_launch.yaml` are legitimately unattached).
**Warning signs:** `.maestro/` count grows much faster than referenced-from-TRD count.

### Pitfall 10: Bootstrap warning ignored, then masked by passing tests later
**What goes wrong:** First run on a bare project (`eden-ui-flutter`) emits "missing integration_test setup — warning" task. User ignores, never adds it. Subsequent runs fail per REQ-10-07 — but only when the verifier reaches the integration_test phase. By then the executor has already done work.
**Why it happens:** Lazy detection.
**How to avoid:** Run the bootstrap detector at executor start (before any task), not at verifier start. Existing executor `<step name="load_project_state">` is the right hook point. Emit checkpoint immediately if missing.
**Warning signs:** Bootstrap warning emitted at end of execution rather than start — user has done unrelated work in between.

## Code Examples

Verified patterns from official sources:

### Pattern: Flutter integration_test invocation (mobile)
```bash
# Source: https://docs.flutter.dev/testing/integration-tests
flutter test integration_test/app_test.dart
# Or all tests in the directory:
flutter test integration_test/
```

### Pattern: Flutter integration_test invocation (web)
```bash
# Source: https://docs.flutter.dev/testing/integration-tests
# Requires chromedriver running in another terminal
chromedriver --port=4444

flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/app_test.dart \
  -d chrome

# Headless variant:
flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/app_test.dart \
  -d web-server
```

The required `test_driver/integration_test.dart`:
```dart
// Source: https://docs.flutter.dev/testing/integration-tests
import 'package:integration_test/integration_test_driver.dart';
Future<void> main() => integrationDriver();
```

### Pattern: integration_test test file with screenshot
```dart
// Source: https://api.flutter.dev/flutter/package-integration_test_integration_test/IntegrationTestWidgetsFlutterBinding/takeScreenshot.html
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('verify counter increment', (tester) async {
    await tester.pumpWidget(const MyApp());

    // Android requires this before screenshots:
    await binding.convertFlutterSurfaceToImage();
    await tester.pumpAndSettle();

    await binding.takeScreenshot('counter-zero');

    await tester.tap(find.byKey(const ValueKey('increment')));
    await tester.pumpAndSettle();
    expect(find.text('1'), findsOneWidget);

    await binding.takeScreenshot('counter-one');
  });
}
```

### Pattern: Maestro flow YAML for Flutter
```yaml
# Source: https://docs.maestro.dev/get-started/supported-platform/flutter
appId: com.example.myflutterapp
---
- launchApp
- assertVisible: "Welcome"
- tapOn: "Sign In"
- tapOn:
    id: "login_button"     # uses Semantics identifier (Flutter 3.19+ preferred)
- inputText: "user@example.com"
- assertVisible: "Dashboard"
- takeScreenshot: dashboard
```

### Pattern: Maestro semantic identifier in Flutter widget
```dart
// Source: https://docs.maestro.dev/get-started/supported-platform/flutter
// Preferred (Flutter 3.19+): use Semantics identifier for stability across i18n / A/B tests
Semantics(
  identifier: 'login_button',
  child: ElevatedButton(
    onPressed: _login,
    child: Text('Sign In'),
  ),
)

// For icons without text:
FloatingActionButton(
  onPressed: _incrementCounter,
  child: Icon(Icons.add, semanticLabel: 'fabAddIcon'),
)
```

### Pattern: Maestro CLI invocation against a Flutter Android build
```bash
# Source: combined from docs.maestro.dev + verifier.md Step 8b (already in this repo)
# 1) Install Maestro
curl -fsSL "https://get.maestro.dev" | bash

# 2) Build and install the Flutter app
flutter build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk

# 3) Run flows
maestro test .maestro/ \
  --format junit \
  --output .planning/objectives/<obj>/evidence/maestro.xml

# 4) Inspect view tree at a specific point (debugging)
maestro hierarchy
```

### Pattern: Maestro Flutter-web (semantics enable in main())
```dart
// Source: https://docs.maestro.dev/get-started/supported-platform/flutter
// REQUIRED FOR MAESTRO WEB — but see Pitfall #2/#3 first.
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SemanticsBinding.instance.ensureSemantics();
  runApp(const MyApp());
}
```

### Pattern: pubspec.yaml dev_dependencies for the testing pyramid
```yaml
# Source: https://docs.flutter.dev/testing/integration-tests
dev_dependencies:
  flutter_test:
    sdk: flutter
  integration_test:
    sdk: flutter
  # Optional, by state_management:
  riverpod_lint: ^2.6.0      # if state_management=riverpod
  bloc_test: ^9.0.0          # if state_management=bloc
  # NOT included by default per user constraint:
  # golden_toolkit: ^0.15.0  # opt-in only
  # patrol: ^3.0.0           # OUT of scope
```

### State Coverage Regex Catalog (REQ-10-02 reference content)

These regexes are designed for the verifier to grep widget-test files and confirm each declared state has corresponding test coverage. Source: synthesized from pub.dev official docs for each library.

**Riverpod (state_management: riverpod):**

```yaml
# All patterns case-sensitive. Each entry: pattern, expected_states.
# Verifier: for each declared state, at least one matching regex must hit.
riverpod:
  - name: when_all_three
    pattern: '\.when\s*\(\s*loading\s*:\s*[^,]+,\s*data\s*:\s*[^,]+,\s*error\s*:'
    covers: [loading, data, error]
    confidence: HIGH    # canonical AsyncValue.when
  - name: when_skipped_loading
    pattern: '\.when\s*\(\s*data\s*:\s*[^,]+,\s*error\s*:\s*[^,]+,\s*skipLoadingOnReload\s*:\s*true'
    covers: [data, error]
    confidence: HIGH
  - name: maybe_when
    pattern: '\.maybeWhen\s*\('
    covers: []          # ambiguous — requires manual inspection of branches
    confidence: LOW
    note: "Mark artifact PARTIAL; require manual review of which branches are present"
  - name: pattern_match_switch
    pattern: 'switch\s*\([^)]+\)\s*\{[^}]*AsyncValue\s*\([^)]*hasError\s*:\s*true'
    covers: [error]
    confidence: MEDIUM  # Dart 3 sealed-class pattern matching, growing 2026 idiom
  - name: pattern_match_loading
    pattern: 'switch\s*\([^)]+\)\s*\{[^}]*AsyncValue\s*\([^)]*isLoading\s*:\s*true'
    covers: [loading]
    confidence: MEDIUM
  - name: when_data_only
    pattern: '\.whenData\s*\('
    covers: [data]
    confidence: HIGH
  - name: empty_state_pattern
    pattern: '(isEmpty|\.isEmpty\b|length\s*==\s*0)'
    covers: [empty]
    confidence: MEDIUM  # empty is a UX concept, not a library primitive
```

**flutter_bloc (state_management: bloc):**

```yaml
bloc:
  - name: bloc_builder_with_switch
    pattern: 'BlocBuilder<[^>]+>\s*\(\s*builder\s*:[^}]*switch\s*\([^)]+\)'
    covers: []          # need to inspect switch branches
    confidence: MEDIUM
    note: "Verifier should additionally grep for specific State subclass names within the switch"
  - name: bloc_loading_state
    pattern: '(case\s+\w+Loading|is\s+\w+Loading\b|\bLoadingState\b)'
    covers: [loading]
    confidence: HIGH
  - name: bloc_loaded_data_state
    pattern: '(case\s+\w+(Loaded|Success|Data)|is\s+\w+(Loaded|Success|Data)\b)'
    covers: [data]
    confidence: HIGH
  - name: bloc_error_state
    pattern: '(case\s+\w+(Error|Failure)|is\s+\w+(Error|Failure)\b)'
    covers: [error]
    confidence: HIGH
  - name: bloc_initial_state
    pattern: '(case\s+\w+Initial|is\s+\w+Initial\b)'
    covers: [initial]
    confidence: HIGH
  - name: bloc_test_used
    pattern: 'blocTest\s*\(|emitsInOrder\s*\(\[' 
    covers: []          # signal that bloc_test library is in use
    confidence: HIGH
    note: "Verifier: bloc_test usage implies the file follows bloc-testing conventions"
```

**setState (state_management: setState):**

```yaml
setState:
  - name: is_loading_boolean
    pattern: '(bool\s+_?isLoading|_?isLoading\s*=\s*(true|false)|setState\s*\(\s*\(\s*\)\s*=>\s*_?isLoading)'
    covers: [loading]
    confidence: MEDIUM   # depends on naming convention; teams use various names
  - name: ternary_on_loading
    pattern: '_?isLoading\s*\?\s*'
    covers: [loading]
    confidence: MEDIUM
  - name: error_field
    pattern: '(String\?\s+_?error|Object\?\s+_?error|_?error\s*=\s*null|_?error\s*!=\s*null)'
    covers: [error]
    confidence: MEDIUM
  - name: ternary_on_error
    pattern: '_?error\s*!=\s*null\s*\?'
    covers: [error]
    confidence: MEDIUM
  - name: empty_check
    pattern: '(\.isEmpty\s*\?|isEmpty\s*\?|length\s*==\s*0)'
    covers: [empty]
    confidence: LOW   # extremely common pattern in non-state contexts too — high false-positive rate
```

**False-positive/false-negative profile:**

| State Mgmt | False Positives | False Negatives |
|------------|-----------------|-----------------|
| Riverpod | LOW (`AsyncValue.when` is distinctive) | MEDIUM (`.maybeWhen` is ambiguous; manual review needed) |
| Bloc | LOW (sealed-class state names are distinctive) | LOW-MEDIUM (custom state class names like `LoggedIn`/`LoggedOut` won't match `Loading|Loaded` regex — catalog should allow per-TRD state-name overrides) |
| setState | HIGH (`isLoading` and `isEmpty` are generic Dart-ism; appear in non-state code) | LOW (the pattern hits commonly) |

**Recommendation:** Document confidence-per-pattern in `flutter-state-patterns.md`. The verifier emits MEDIUM/LOW results as advisory ("possible coverage gap — manual review recommended"), not blocking. Only HIGH-confidence patterns are blockers.

### Executor Verification Commands (REQ-10-04 concrete commands)

For a TRD with `type: ui, stack: flutter, platform: [mobile, web]`:

```bash
# Per-task (run after each task's main work):
flutter analyze                   # MUST be clean for files touched by this task
flutter test <path/to/test.dart>  # task's own widget test, MUST pass

# Post-all-tasks (run at end of TRD):
# Mobile:
flutter test integration_test/     # Requires emulator booted
maestro test .maestro/             # Requires Maestro CLI + emulator + APK installed

# Web (if platform includes web):
# (chromedriver --port=4444 should be running)
flutter drive \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/app_test.dart \
  -d chrome
# Maestro web ONLY if TRD opts in via `maestro_web: true` frontmatter:
# (otherwise skip with documented note in SUMMARY)
maestro test .maestro/  # against Chrome — see Pitfall #2
```

### `api_contract` SHA Pinning Helper Shape (REQ-10-08)

```javascript
// plugins/devflow/devflow/bin/lib/api-contract.cjs (proposed shape)
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

/**
 * Compute SHA256 of a file. Returns null if file missing.
 * @param {string} filePath - absolute or cwd-relative
 * @returns {string|null}
 */
function sha256File(filePath, cwd = process.cwd()) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Given a TRD's api_contract block (array of { path, sha }),
 * recompute SHAs and report drift.
 * @param {Array<{path: string, sha: string}>} contract
 * @param {string} cwd
 * @returns {{ drift: Array<{path,expected,actual,status}>, ok: boolean }}
 */
function detectDrift(contract, cwd = process.cwd()) {
  const drift = [];
  for (const entry of contract || []) {
    const current = sha256File(entry.path, cwd);
    if (current === null) {
      drift.push({ path: entry.path, expected: entry.sha, actual: null, status: 'MISSING' });
    } else if (current !== entry.sha) {
      drift.push({ path: entry.path, expected: entry.sha, actual: current, status: 'DRIFTED' });
    }
  }
  return { drift, ok: drift.length === 0 };
}

module.exports = { sha256File, detectDrift };
```

Wire into df-tools with a `df-tools verify api-contract <trd-path>` subcommand following the existing `verify` command conventions in `df-tools.cjs`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `flutter_driver` for E2E | `integration_test` package | Officially since 2020, fully matured by 2024 | `flutter_driver` is deprecated for new work. Don't recommend. |
| `flutter test integration_test/ -d chrome` for web | `flutter drive --driver=test_driver/integration_test.dart --target=... -d chrome` | Web support consolidated under `flutter drive` 2022-2023 | The deprecated `-d chrome` for `flutter test` returns no-op or partial output. Must use `flutter drive`. |
| Flutter web HTML renderer | CanvasKit (default) / Skwasm (Wasm) | HTML renderer deprecated for Flutter 3.27+ | Maestro DOM-overlay strategy degrades. CanvasKit needs explicit `SemanticsBinding.ensureSemantics()`. See Pitfall #2. |
| `Semantics(label: ...)` | `Semantics(identifier: ...)` for testable widgets | Flutter 3.19+ | Identifier is permanent across i18n/A-B variants; preferred for Maestro `tapOn: { id: ... }`. Label is still fine for assertions. |
| Custom JSON state-machine for AsyncValue | Sealed-class pattern matching (`switch (asyncVal) {...}`) | Dart 3 (2023), increasingly idiomatic 2025-2026 | State-coverage regex must catch BOTH `.when(...)` AND `switch` patterns. Catalog above covers both. |
| `flutter_driver` web testing | Cypress / Playwright against `flutter run -d chrome` | Hybrid 2024-2025; mature 2026 | NOT what this objective recommends. Stick with `integration_test` + `flutter drive` until Maestro-web stabilizes. |

**Deprecated/outdated (do not introduce in new TRDs):**
- `flutter_driver` (replaced by `integration_test`)
- HTML web renderer (default-deprecated; only `--web-renderer canvaskit` or `--web-renderer skwasm` going forward)
- `Semantics(label:)` for Maestro `tapOn`-targeted widgets (use `identifier:` instead)

## Open Questions

1. **Should Maestro-web be silently skipped or loudly warned?**
   - What we know: Maestro-web has a known open issue (upstream); fallback to `flutter drive -d chrome` works.
   - What's unclear: Whether `eden-ui-flutter` adoption (a later objective) needs Maestro-web at all, or whether `flutter drive` is sufficient.
   - Recommendation: For this objective's scope (process layer in devflow-claude), default Maestro to `platform: mobile` only. Add `maestro_web: opt-in` flag for future. Document the limitation prominently in `flutter-state-patterns.md` and verifier prompt. Re-evaluate when adoption objective lands.

2. **Should the state-coverage catalog support custom state-name aliases per TRD?**
   - What we know: Bloc projects often have domain-specific State subclass names (`LoggedIn`, `Cart_Empty`, etc.) that won't match generic `Loading|Loaded|Error` regex.
   - What's unclear: Whether to expose `state_aliases:` in TRD frontmatter or rely on the planner to insert custom regex into the artifact's `states:` entry.
   - Recommendation: Phase 1 — fixed catalog with the standard regex set. Phase 2 — add `state_aliases:` per-artifact if real-world adoption shows the standard catalog misses too often.

3. **Should the bootstrap setup task auto-commit pubspec changes, or stage and pause for user review?**
   - What we know: REQ-10-07 says "warn + emit setup task." The existing executor pattern is to commit per-task.
   - What's unclear: Whether modifying pubspec is "destructive enough" to warrant the per-task caution attribute (`caution="pause-before-destructive"`).
   - Recommendation: Tag the bootstrap setup task with `caution="pause-before-destructive"` per the existing executor convention. User sees the proposed pubspec diff and confirms.

4. **How does the planner know which `platform:` value to set when the codebase targets both mobile and web?**
   - What we know: pubspec doesn't directly declare platforms; they're inferred from presence of `web/`, `ios/`, `android/`, `macos/`, `linux/`, `windows/` directories in the Flutter project root.
   - What's unclear: Whether to scan the consumer project root from the planner running in devflow-claude (different working directory) or read from a project-side hint file.
   - Recommendation: Detector scans `pubspec.yaml` for explicit `flutter: { platforms: { web: ... } }` block first; falls back to directory existence check in consumer project root if present; defaults to `[mobile]` if ambiguous. Document the heuristic in `flutter-state-patterns.md`.

5. **What's the minimum viable test that proves this objective shipped?**
   - What we know: The objective ships process-layer code, not Flutter UI. Testing happens via Node test runner against the new lib files.
   - What's unclear: Whether to add an end-to-end "dogfood" test that runs the planner against a synthetic Flutter-shaped objective and verifies the schema gates fire.
   - Recommendation: Follow the precedent of `01-06-dogfood-and-integration-TRD.md` from objective 1. Final TRD in this objective is a dogfood TRD that synthesizes a fake Flutter TRD and runs it through detector → planner → executor → verifier, asserting expected gate triggers.

## Sources

### Primary (HIGH confidence — official docs)
- https://docs.flutter.dev/testing/integration-tests — canonical integration_test invocation patterns; mobile vs web invocation; screenshot binding setup
- https://api.flutter.dev/flutter/package-integration_test_integration_test/IntegrationTestWidgetsFlutterBinding/takeScreenshot.html — `takeScreenshot()` API, Android `convertFlutterSurfaceToImage` requirement
- https://docs.maestro.dev/get-started/supported-platform/flutter — Maestro Flutter support; semantics tree handling; identifier vs label; web `SemanticsBinding.ensureSemantics()` requirement
- https://pub.dev/documentation/riverpod/latest/riverpod/AsyncValue-class.html — AsyncValue.when, maybeWhen, whenData, guard signatures; sealed pattern matching examples
- https://bloclibrary.dev/ + https://pub.dev/packages/bloc_test — flutter_bloc + bloc_test patterns; sealed-class state coverage
- https://docs.flutter.dev/platform-integration/web/renderers — CanvasKit / Skwasm / HTML renderer trajectory
- `/Users/markemerson/Source/devflow-claude/plugins/devflow/devflow/references/testing-strategy.md` — already documents Flutter-web pumpAndSettle gotcha and platform routing for outside-in
- `/Users/markemerson/Source/devflow-claude/plugins/devflow/devflow/references/defaults-table.md` — already routes `(app, feature)` to "Maestro/Playwright→integration_test→widget→unit"
- `/Users/markemerson/Source/devflow-claude/plugins/devflow/agents/verifier.md` Step 8b — existing Flutter+Maestro verification infrastructure
- `/Users/markemerson/Source/devflow-claude/plugins/devflow/devflow/bin/lib/frontmatter.cjs` — dictionary-permissive frontmatter parser (confirms no parser change needed for new fields)
- `/Users/markemerson/Source/devflow-claude/.planning/objectives/01-github-coordination-layer/01-01-frontmatter-fields-and-templates-TRD.md` — precedent for adding optional frontmatter fields via template + test only

### Secondary (MEDIUM confidence — verified with at least one official source)
- https://github.com/mobile-dev-inc/maestro/issues/2591 — open Maestro-Flutter-web issue, current status as of July 2025 (still open mid-2026 based on search results)
- https://github.com/flutter/flutter/issues/155323 — `Semantics.identifier` on TextField doesn't work on web
- https://github.com/flutter/flutter/issues/143848 — `ensureSemantics()` breaks DropdownMenu on web 3.19+
- https://github.com/flutter/flutter/issues/163576 — `ensureSemantics()` click propagation through overlapping widgets
- https://medium.com/@umairadil/flutter-ui-automation-using-maestro-248280a69f0b (Feb 2026) — practical Maestro-Flutter walk-through

### Tertiary (LOW confidence — single source / blog posts)
- https://dasroot.net/posts/2026/04/flutter-testing-widget-integration-golden-tests/ — blog summary of 2026 Flutter testing landscape (consistent with primary sources)
- https://oneuptime.com/blog/post/2026-02-02-flutter-bloc-pattern/view — blog summary of flutter_bloc + sealed classes (consistent with bloclibrary.dev)
- Verified that REQ-10-08's reference to "verify-base infrastructure" does not match any existing code in `plugins/devflow/devflow/bin/lib/` — corrected to local-file SHA tracking in the requirement mapping.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Flutter docs + Maestro docs + Riverpod/Bloc docs all confirmed and cross-referenced.
- Architecture (DevFlow hook points): HIGH — read directly from `planner.md`, `executor.md`, `verifier.md`, `df-tools.cjs`, `frontmatter.cjs`. No inference.
- State-coverage regex catalog: MEDIUM-HIGH — Riverpod and Bloc patterns are well-documented and stable; setState patterns rely on convention (higher false-positive rate documented in catalog).
- Pitfalls: HIGH for Maestro-web (verified open upstream issue); HIGH for `flutter drive` vs `flutter test` for web (canonical docs); MEDIUM for `pumpAndSettle()` flake on web (already documented in existing testing-strategy.md).
- REQ-10-08 mapping: HIGH that "verify-base" infrastructure doesn't exist (verified by grep); HIGH that local-file SHA tracking is straightforward to implement.

**Research date:** 2026-05-24
**Valid until:** 2026-07-24 (~60 days). Flutter ecosystem changes annually-ish; Maestro is more active (re-validate Maestro-web upstream issue before any adoption-objective work). DevFlow internals are owned by this repo so the hook-point references are valid as long as the file structure holds.

**What might be missing / next steps if planner needs more depth:**
- A concrete proof-of-concept regex run against `eden-ui-flutter` files (not yet imported as a sibling; the adoption objective will validate the catalog against real code).
- A measurement of how often `api_contract` SHA pinning produces false positives on whitespace changes (recommend tracking after first real adoption).
- A scan of recent Maestro releases (>1.41) for any web fixes that would unblock the per-TRD `maestro_web: opt-in` graduation to default-on.

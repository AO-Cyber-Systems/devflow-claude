# UI Oracle Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a machine oracle inside the executor's UI loop — a Surface Spec that says how a UI must function, look-lock at design time, RENDER→CONFORM per task, and a crawler/explorer for unreachable, dead-end and inert UI — so the Trades React → Eden Biz port runs with fewer cycles than the last four months of UI work.

**Architecture:** One hand-authored artifact per surface (`flutter/ui_spec/<surface>.md`, YAML front matter + prose) from which tests, the ui-eval manifest, the review sheet and the crawl graph are derived. A JS-interop probe bridge compiled into `EDEN_PROBE` release builds gives a zero-dependency CDP driver real widget rects; pure-function checks over a schema'd `ProbeResult` run before any vision model. The work spans four repos and lands in waves; wave 0 fixes the gate we already have and captures a baseline, wave 1 builds the spec/sheet/probe and dogfoods on the surface that hurt most.

**Tech Stack:** DevFlow plugin (Node CJS, `node --test`), Flutter/Dart (`flutter test`, `integration_test`, `go_router`), headless Chrome over CDP (Node ≥ 25 `WebSocket`), eden-ui-flutter `EdenStory` registry, GitHub CLI.

**Spec:** `docs/PROPOSAL-ui-oracle-loop.md` (this repo, branch `docs/ui-oracle-loop-design`). Section numbers below (§n) refer to it.

## Global Constraints

- A check that did not run reports `MISSING`, never `pass` (§2 goal 5, §7.5).
- The Surface Spec front matter is the only hand-authored description of a surface; manifests, capture lists and sheets are generated (§4.1 one-file rule).
- Every tool output carries `engine_version` and `schema_version`; the verifier rejects evidence from a mismatched engine (§12.2).
- The probe bridge exists only under `const bool.fromEnvironment('EDEN_PROBE')`; release bundles must contain no `__edenProbe` (§12.4).
- Release-blocking: any `unreachable` or `dead-end` finding on any route; any `inert` control that is a route `entry` (§10.3).
- Controls declare one `does`+`effect` or a `behaviors[]` whose `when` clauses are mutually exclusive and cover every `visible_in` state (§4.3).
- TDD contract unchanged: RED→GREEN→REFACTOR with exit-code evidence, one test at a time, hand-built fixtures, `test:`→`feat:`→`refactor:` commits (`~/.claude/CLAUDE.md` TDD Playbook).
- Node CJS only in `plugins/devflow/devflow/bin/lib/*.cjs`; no new npm dependencies (package.json has only `node-pty`); Dart work is delegated to `dart`/`flutter` CLIs emitting JSON.
- Commit messages: `{type}({scope}): {description}`.
- Never edit `~/.pub-cache/git/eden-ui-flutter-*` — it is discarded on the next `pub get`.

---

## Part 1 — Program map

This is a multi-repo program. Each wave item is a DevFlow objective in its repo; wave 0 is small enough to execute task-by-task from this document, wave 1 is specified here to TRD granularity with test lists and interfaces (DevFlow's planner turns each into step-level TRDs at `/devflow:build` time), waves 2–4 are objective-level.

| Item | Repo | Depends on | Produces |
|---|---|---|---|
| W0 | devflow-claude, eden-biz, eden-ui-flutter, aodex | — | honest gate, tagged pins, plugin current, metrics baseline |
| W1a | eden-ui-flutter | W0 | pattern library, story harness, `expectUiSane`, probe bridge, generated `DESIGN.md`, reshaped shell API |
| W1b | devflow-claude | W0 | Surface Spec schema, `spec validate\|render`, review sheet, look-lock checkpoint, `frontend-design` step 0 |
| W1c | aodex, eden-biz | W0 | e2e dependency stub (seed registry, identity set, fault injection), bridge line |
| W1★ dogfood | aodex + eden-ui-flutter | W1a, W1b, W1c(aodex) | `projects-rail` spec look-locked and conformed; nav branch merged; tag |
| W2 | devflow-claude | W1★ | `ui catalog\|probe\|sheet\|doctor\|metrics`, checks, planner derivation, executor loop, verifier replay, judge calibration, seam gate |
| W3 | eden-biz (+ Trades read-only) | W2, W1c(eden-biz) | `ui crawl`, `ui-explorer`, donor route table, first Trades port (obj 020 scope) |
| W4 | devflow-claude, aodex | W3 | Maestro adapter, explorer nightly |

**Kick-off convention.** Each W1+ objective is created with `/devflow:build` (ad-hoc, not roadmap-scoped — see memory `ui-visual-eval-layer` build gotchas) and the planner prompt carries the TDD Playbook directives verbatim: *every feature TRD is `type=tdd` unless config-only/styling/generated; test list first; one test at a time; fixture generators not LLM data; outside-in; rendered-UI visual gate for `type=ui`.*

**Runtime model in every brief (binding, from the wave-0 retrospective — spec §21).** Every implementer and reviewer brief carries a `## Runtime model` section stating, for the code under change: where it executes (the `~/.claude/devflow` mirror vs the checkout; `installed_plugins.json` is the registry truth); Bash-tool semantics (cwd persists across calls, shell variables do not, one command per call under the worktree guard — package-relative commands in `( cd "$PACKAGE_DIR" && … )`, evidence paths absolute from a per-call `REPO_ROOT`); Flutter web capture (release build + static serve, never `flutter run`); monorepo `packageDir`; the app's production semantics mode. Reviewers are told to trace under that model. A brief without the section is not dispatched.

**`/code-review` before merge (binding).** After the SDD whole-branch review and its fix wave, run `/code-review <PR> high` and fix its findings; its re-review must *execute* the differential (regenerate, diff, spawn the CLI), not re-read. Wave 0: eight findings after clean SDD reviews.

**Worktrees.** One worktree per objective per repo (`<repo>-<obj>`), branch `df/<obj-slug>`; salvage by SHA, never by branch name (memory `salvage-worktree-by-sha-not-branch`).

---

## Part 2 — Wave 0: fix the gate we have (task granularity)

Wave 0 changes no UI. It makes the existing visual gate honest, pins consumers to a tag, upgrades the installed plugin, and records the baseline every later number is measured against. Order matters only where stated.

### Task W0-1: `engine_version` on every flutter-ui-eval output

**Repo:** devflow-claude (worktree `devflow-claude-w0`, branch `df/w0-honest-gate`)

**Files:**
- Modify: `plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs` (the `scoreRun` return and `cmdVerifyFlutterUIEval` output)
- Modify: `plugins/devflow/devflow/bin/lib/helpers.cjs` (add `pluginVersion()`)
- Test: `plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs`

**Interfaces:**
- Produces: `helpers.pluginVersion(): string` — reads `plugins/devflow/.claude-plugin/plugin.json` `version` relative to the running `df-tools.cjs`, falling back to `~/.claude/devflow/.plugin-version`. `scoreRun(...)` result gains `engine_version: string` and `schema_version: 1`.

- [ ] **Step 1: Write the failing test**

```js
// flutter-ui-eval.test.cjs
test('scoreRun stamps engine_version and schema_version', () => {
  const run = scoreRun([{ state_id: 's1', verdict: 'pass' }], { gate: 'advisory' });
  assert.match(run.engine_version, /^\d+\.\d+\.\d+$/);
  assert.equal(run.schema_version, 1);
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs` → FAIL, `engine_version` undefined.
- [ ] **Step 3: Implement** — in `helpers.cjs`:

```js
function pluginVersion() {
  const candidates = [
    path.join(__dirname, '..', '..', '..', '.claude-plugin', 'plugin.json'),
    path.join(os.homedir(), '.claude', 'devflow', '.plugin-version'),
  ];
  for (const c of candidates) {
    try {
      const txt = fs.readFileSync(c, 'utf8');
      return c.endsWith('.json') ? JSON.parse(txt).version : txt.trim();
    } catch {}
  }
  return '0.0.0';
}
```
  and in `scoreRun` add `engine_version: pluginVersion(), schema_version: 1` to the returned object.
- [ ] **Step 4: Run to verify it passes** — same command → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(ui-eval): stamp engine_version and schema_version on every scoreRun"`

### Task W0-2: `df-tools health` reports plugin-vs-mirror-vs-main lag

**Files:**
- Modify: `plugins/devflow/devflow/bin/lib/validate.cjs:130` (`cmdValidateHealth`)
- Test: `plugins/devflow/devflow/bin/lib/validate.test.cjs`

**Interfaces:**
- Consumes: `helpers.pluginVersion()` (W0-1).
- Produces: health issue codes `E020 mirror-stale` (`~/.claude/devflow/.plugin-version` ≠ plugin version) and `W021 plugin-behind-main` (plugin version < `origin/main` `plugin.json` version, when the devflow-claude checkout is reachable via `git`). Output row: `engine: plugin 2.6.0 · mirror 2.6.0 · main 2.7.1`.

- [ ] **Step 1: Write the failing test** — fixture: a temp home with `.plugin-version` = `2.5.0` while `pluginVersion()` is stubbed to `2.6.0`; assert `E020` present in `cmdValidateHealth(...).issues`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** — compare versions with a 3-tuple compare helper; `W021` only when `git -C <devflow-claude checkout> show origin/main:plugins/devflow/.claude-plugin/plugin.json` succeeds (`execFileSync`, 5 s timeout, otherwise skip silently — never fail health for a missing checkout).
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `feat(health): report mirror-stale and plugin-behind-main`.

### Task W0-3: manifest resolution is objective-scoped only

**Files:**
- Modify: `plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.cjs:163-215` (`tier3Locate`, `lookupManifest`)
- Test: `plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.test.cjs`

**Interfaces:**
- Produces: `resolveUIEvalTarget` never returns `resolved` from Tier 3. When Tier 2 is absent and Tier 3 has candidates, it returns `{ resolution: 'absent', reason: 'unscoped-candidates', candidates: [...] }` and the CLI prints them with the instruction to pass a path or author `<objective_dir>/evidence/ui_eval/manifest.json`.

- [ ] **Step 1: Write the failing test** — fixture objective dir with no evidence manifest + `flutter/ui_eval/manifests/other.manifest.json`; assert `resolution === 'absent'` and `candidates.length === 1`. Keep the existing Tier 1/2 tests green.
- [ ] **Step 2: Run to verify it fails** (today it resolves to the unrelated manifest — this is aodex#485's cousin).
- [ ] **Step 3: Implement** — in `lookupManifest`, replace the `tier3.jsonCandidates.length > 0 → loadCandidate` branch with the `absent` return; keep `tier3` only for `searched[]` and `candidates`.
- [ ] **Step 4: Run all resolve tests** → PASS.
- [ ] **Step 5: Commit** — `fix(ui-eval): never resolve an unscoped repo manifest for an objective`.

### Task W0-4: bootstrap detects a Flutter package under `flutter/`

**Files:**
- Modify: `plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.cjs:128-137` (`checkScaffoldState`)
- Test: `plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs`

**Interfaces:**
- Produces: `checkScaffoldState({ projectDir })` searches `projectDir/pubspec.yaml` then `projectDir/flutter/pubspec.yaml`; the returned object gains `packageDir` (absolute) that all later scaffold paths are relative to.

- [ ] **Step 1: Write the failing test** — temp dir with only `flutter/pubspec.yaml` containing `flutter:`; assert `action !== 'skip'` and `packageDir` ends with `/flutter`.
- [ ] **Step 2: Run to verify it fails** (`reason: 'flutter-not-detected'`).
- [ ] **Step 3: Implement** — loop over `['', 'flutter']` prefixes; first hit wins; thread `packageDir` through the scaffold writer.
- [ ] **Step 4: Run bootstrap tests** → PASS.
- [ ] **Step 5: Commit** — `fix(ui-eval): bootstrap finds a monorepo flutter/ package`.

### Task W0-5: reference docs tell the truth

**Files:**
- Modify: `plugins/devflow/devflow/references/testing-strategy.md` (matrix row "Visual / golden" only — no React column; Trades React is a donor being retired)
- Modify: `plugins/devflow/devflow/workflows/ui-eval.md` and `plugins/devflow/agents/ui-evaluator.md` (capture step: replace `flutter run -d chrome` with `flutter build web --release` + static server + `?enable-semantics` note; cite memory `flutter-web-browser-proof-use-release-build`)
- Modify: `CHANGELOG.md` `[Unreleased]`

- [ ] **Step 1:** Edit the matrix: Flutter visual cell → "`df-tools verify flutter-ui-eval` (two-layer: golden + VLM) — shipped 2.4.0"; leave the "Out of scope" note pointing at this proposal for the probe/conform layer. Do not add a React column.
- [ ] **Step 2:** Edit the two capture-step passages; keep the `browser_wait_for` guidance.
- [ ] **Step 3:** `node --test plugins/devflow/devflow/bin/` still green (docs only); commit `docs(ui-eval): testing matrix and capture recipe match what ships`.

### Task W0-6: `ui-metrics.cjs baseline`

**Files:**
- Create: `plugins/devflow/devflow/bin/lib/ui-metrics.cjs`
- Create: `plugins/devflow/devflow/bin/lib/ui-metrics.test.cjs`
- Modify: `plugins/devflow/devflow/bin/df-tools.cjs` (dispatch `ui metrics baseline [--since YYYY-MM-DD] [--paths p1,p2] [--out file]`)

**Interfaces:**
- Produces: `computeBaseline({ cwd, since, paths }) → { since, paths, commits: { feat, fix, test, refactor, other }, fix_per_feat: number, quick_fixes: number }` using `git log --format=%s --since=<since> -- <paths>`; CLI writes `.planning/ui-metrics-baseline.json` with `engine_version`.

- [ ] **Step 1: Write the failing test** — fixture: a throwaway git repo (the changelog-on-tag tests already build these; reuse that helper) with 3 `feat(x):`, 2 `fix(y):`, 1 `fix(quick-3):` commits touching `flutter/lib/a.dart`; assert `fix_per_feat === 1` (3 fix / 3 feat) and `quick_fixes === 1`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** — classify by `^(\w+)(\(|:)` on the subject; `quick_fixes` = subjects matching `quick-\d+`.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `feat(ui-metrics): baseline of fix/feat ratio for UI paths`.

### Task W0-7: eden-biz — one source for ui-eval manifests (closes #705)

**Repo:** eden-biz (worktree `eden-biz-w0`, branch `fix/705-ui-eval-one-source`)

**Files:**
- Create: `flutter/tool/gen_ui_eval_manifests.dart`
- Create: `flutter/test/ui_eval/manifest_freshness_test.dart`
- Modify: `flutter/pubspec.yaml` (`dev_dependencies: yaml: ^3.1.2` if not already transitive-declared)
- Delete: hand-authored `flutter/ui_eval/manifests/*.manifest.json` that have a `*_states.yaml` twin (regenerated); keep `labels.json`
- Modify: `flutter/ui_eval/README.md`

**Interfaces:**
- Produces: for every `flutter/ui_eval/<name>_states.yaml`, `flutter/ui_eval/manifests/<name>.manifest.json` with `{objective, surface, driver, defaults, states:[{state_id, route, data_state, expected, capture_path}]}` — **`state_id`, not `id`** (the engine's `validateManifest` at `flutter-ui-eval.cjs:88` requires `state_id`). Deterministic key order so regeneration is byte-stable.

- [ ] **Step 1: Write the failing test**

```dart
test('every *_states.yaml has a byte-fresh generated manifest', () {
  for (final yaml in Directory('ui_eval').listSync().whereType<File>()
      .where((f) => f.path.endsWith('_states.yaml'))) {
    final expected = generateManifest(yaml);           // from tool/gen_ui_eval_manifests.dart
    final out = File('ui_eval/manifests/${baseName(yaml)}.manifest.json');
    expect(out.existsSync(), isTrue, reason: '${out.path} missing — run tool/gen_ui_eval_manifests.dart');
    expect(out.readAsStringSync(), expected, reason: '${out.path} stale');
  }
});
test('no manifest exists without a yaml source', () { /* the reverse set difference is empty */ });
```

- [ ] **Step 2: Run** `flutter test test/ui_eval/manifest_freshness_test.dart` → FAIL (7 captured-never-scored have no manifest; 7 scored-never-captured have no yaml).
- [ ] **Step 3: Implement the generator** — parse YAML with `package:yaml`; emit `state_id` from the yaml `id`; `capture_path` = `../captures/<state_id>.capture.json`; `JsonEncoder.withIndent('  ')`.
- [ ] **Step 4: Triage the 7 json-only manifests** — for each (`authoring_ux_v2 billing_activity mobile pos users_permissions web website_block_builder`): if a capture test exists under `integration_test/`, author the missing `_states.yaml` from the manifest (mechanical inverse); otherwise delete the manifest and note it in the commit body. `mobile`/`pos` are Maestro surfaces — keep as yaml with `driver: maestro`.
- [ ] **Step 5: Run generator; run the freshness test** → PASS; run `flutter test test/features/companion/archetype_experience_visual_gate_test.dart` → still PASS.
- [ ] **Step 6: Commit** in two commits: `test(ui-eval): manifest freshness gate (#705)` then `feat(ui-eval): generate manifests from the yaml state matrices (#705)`.

### Task W0-8: tag eden-ui-flutter and move both pins to a tag (#585, #753, #569)

**Repo:** eden-ui-flutter (main), eden-biz (worktree from W0-7), aodex (worktree `aodex-w0`, branch `fix/585-pin-agrees-with-comment`)

- [ ] **Step 1: Confirm the fix is on main** — `git -C eden-ui-flutter log origin/main --oneline -- lib/src/widgets/eden_button.dart | head -1` → `c11a925`; `git branch -r --merged origin/main | grep eden-button-inherits-family` → present. Run `flutter test` on `origin/main` → PASS.
- [ ] **Step 2: Tag** — `git -C eden-ui-flutter tag -a v2.1.0 origin/main -m "EdenButton inherits family; autofill shim; runtime brand tokens"`; push the tag. (CHANGELOG entry per the repo's convention if it has one; otherwise the tag message is the record.)
- [ ] **Step 3: eden-biz pin** — both `eden_ui_flutter` entries in `flutter/pubspec.yaml` (lines 38–41 and 147–150) → `ref: v2.1.0`; `flutter pub get`; `flutter analyze`; `flutter test`; regenerate objective 696-10's captures as #753 asks; commit `chore(deps): pin eden_ui_flutter to v2.1.0 (#753)`.
- [ ] **Step 4: aodex pin comment** — aodex stays on the nav branch tip until W1★ merges it; fix #585 by making the comment name the SHA in `ref:` and re-running the ancestor proof for that SHA: `git -C eden-ui-flutter merge-base --is-ancestor 0539e6da 91d89a2c; echo $?` → 0. Commit `docs(deps): pin comment names the ref actually built (#585)`.
- [ ] **Step 5:** Open PRs; `gh issue comment` on #585 and #753 with the commits; do not close until merged (memory `dont-close-issues-until-merged-and-verified`).

### Task W0-9: upgrade the installed plugin (user action)

- [ ] **Step 1:** In Claude Code: `/plugin marketplace update aocyber` then `/plugin install devflow@aocyber` (or update) so the cache shows `2.7.1` (or the version W0-1..6 release as — release those first: bump `package.json`, `plugin.json`, `marketplace.json` to `2.8.0`, `changelog update --version v2.8.0`, tag).
- [ ] **Step 2:** New session; `node ~/.claude/devflow/bin/df-tools.cjs validate health` → no `E020`, no `W021`.
- [ ] **Step 3:** Record in `.planning/STATE.md` of devflow-claude: "engine 2.8.0 installed 2026-09-xx".

### Task W0-10: capture and commit the baseline

- [ ] **Step 1:** In aodex and eden-biz main checkouts: `node ~/.claude/devflow/bin/df-tools.cjs ui metrics baseline --since 2026-06-01 --paths flutter/lib --out .planning/ui-metrics-baseline.json`.
- [ ] **Step 2:** Add to each file by hand: `human_verify_rows_last_3_ui_objectives` (count the `human_verification` entries in the last three `*-VERIFICATION.md` / SUMMARY files) and `open_ui_issues_by_class` (from the §1 table classes, via `gh issue list --label ui` where labelled, else by title search).
- [ ] **Step 3:** Commit `chore(metrics): UI loop baseline 2026-09` in each repo. Nothing in wave 1 starts before this lands.

**Wave 0 exit:** `validate health` clean; `verify flutter-ui-eval <objective>` returns `absent` rather than an unrelated manifest; eden-biz manifest freshness test green; eden-biz on `v2.1.0`; aodex #585 comment correct; baselines committed.

---

## Part 3 — Wave 1 (TRD granularity)

Each subsection is one DevFlow objective. For each TRD: files, the behaviour test list (RED cases the executor writes one at a time), interfaces, and the gate. DevFlow's planner expands these into step-level TRDs; the test lists here are the reviewable artifact the playbook requires.

### W1a — eden-ui-flutter: `df/ui-oracle-library`

**Objective goal:** the library can describe, render, assert and probe its own widgets: patterns, stories per state with three assertions, `expectUiSane`, the probe bridge, a generated `DESIGN.md`, and a shell API that consumers compose instead of flag.

**Kick-off:** `/devflow:build` in `eden-ui-flutter`, kind `ui-lib`, work `foundation`. Planner prompt includes the TDD Playbook directives (Part 1) and: *"stories are fixtures — hand-written, one per state, never generated from a list of names"*.

| TRD | Deliverable | Files | Test list (RED cases) | Gate |
|---|---|---|---|---|
| 1a-01 fixtures | `test_support/ui_oracle/` — `wrap()` with theme/width/theme-mode knobs; `SemanticsGeometry` helper that walks `SemanticsNode.rect` through `transform` **from the node itself** (memory `flutter-web-semantics-node-is-the-click-target`) | `test_support/ui_oracle/wrap.dart`, `semantics_geometry.dart`, `_fixtures/` | (1) `globalRect` of a 40×40 child inside a 360-wide row is 40 wide, not 360; (2) two sibling controls report disjoint rects; (3) a nested `Semantics` without `container:true` reports the parent's rect (the bug, pinned) | `flutter test test/ui_oracle/` |
| 1a-02 `expectUiSane` | `lib/testing/eden_ui_test.dart` exported as `package:eden_ui_flutter/testing.dart` | `lib/testing/expect_ui_sane.dart`, `test/testing/expect_ui_sane_test.dart` | (1) passes on a clean story; (2) fails naming the widget on a 215 px RenderFlex overflow (fixture: long text in an unbounded `Row` slot); (3) fails on two identified controls with overlapping rects; (4) fails when an identified control declares two tap actions (`ExcludeSemantics` outside + `Semantics(onTap:)`); (5) fails on `androidTapTargetGuideline`; (6) fails on `textContrastGuideline` (dark-on-dark fixture) | each case proven RED by stashing the fixture fix |
| 1a-03 story harness | `tool/story_test.dart` generator: for each registered story emit a test with golden (light+dark) + `expectUiSane`; goldens generated in CI (Linux) with platform tag `ci`, compared locally with tolerance `0` on `ci`, skipped on macOS unless `--update-goldens` | `tool/gen_story_tests.dart`, `test/stories/_generated/`, `.github/workflows/ci.yml` (golden job, artifacts upload) | (1) generator output is byte-stable; (2) a story registered but with no generated test fails the freshness test; (3) golden mismatch names the story id | CI job `stories` green; `flutter test test/stories/` |
| 1a-04 story coverage ratchet | `tool/story_coverage.dart` + `test/stories/coverage_test.dart` reading `.story-coverage.json` (`{exported_widgets, with_story}`) | as named | (1) coverage below the committed floor fails; (2) raising the floor requires updating the file (a `chore:` commit) | `flutter test test/stories/coverage_test.dart` |
| 1a-05 nav stories | co-located `eden_desktop_layout.stories.dart`, `eden_mobile_layout.stories.dart`, `eden_nav_item.stories.dart`: default, selected, expandable-collapsed, expandable-expanded, caption, divider, long-label, badge, narrow, dark | `lib/src/widgets/eden_layout/*.stories.dart` | each story passes 1a-03 harness; `long-label` pins the ellipsis; `expanded` pins the containment rule (nav commit `b9e82bf`) | harness |
| 1a-06 shell API reshaping | `EdenDesktopLayout.itemBuilder` / `sectionBuilder` slots (`typedef EdenNavItemBuilder = Widget Function(BuildContext, EdenNavItem, EdenNavItemState)`); flags kept: `expandable`, `caption`, `isDivider` render through the default builder | `layout_data.dart`, `eden_desktop_layout.dart`, `eden_mobile_layout.dart`, tests | (1) the five existing layout tests pass unmodified; (2) a consumer-supplied builder replaces the tile for one item and not others; (3) a builder cannot bypass the semantics identifier (`eden-nav-<id>` still emitted); (4) mobile bar never renders captions/dividers (nav commit `9e64517` pinned) | full `flutter test` + 1a-05 stories re-render byte-identical for default builder |
| 1a-07 probe bridge | `lib/src/probe/probe_bridge.dart` (conditional import: `probe_bridge_web.dart` under `dart:js_interop`, `probe_bridge_stub.dart` elsewhere), gated by `const bool kEdenProbe = bool.fromEnvironment('EDEN_PROBE')`; `EdenProbe.install()` no-ops unless `kEdenProbe`; `window.__edenProbe = { find(q), tree(), settled(), state() }` | as named, `test/probe/probe_bridge_test.dart`, `example/probe_smoke/` | (1) `find({key})` returns the render box's global rect for a keyed widget (widget test through the same Dart entry the JS calls); (2) `find({text})` matches `RichText`/`Text` data; (3) `tree()` lists identified semantics nodes with rects and declared actions; (4) `settled()` is false while a `Ticker` is active and true after; (5) `EdenProbe.install()` is a no-op when the define is absent; (6) **bundle guard**: `flutter build web --release` without the define → `grep -c __edenProbe build/web/main.dart.js` = 0 (a `tool/probe_guard.sh` run in CI) | `flutter test test/probe/`; CI `probe-guard` job |
| 1a-08 probe settle knobs | under `kEdenProbe`: `timeDilation` irrelevant on web — instead `EdenProbe.disableAnimations()` sets `WidgetsBinding` `disableAnimations` semantics flag and `MediaQuery` `disableAnimations: true` at the app root via `EdenProbeScope`; fonts: assert bundled fonts only (no `google_fonts` runtime fetch) when probing | `lib/src/probe/eden_probe_scope.dart`, tests | (1) a `Scaffold` FAB removal completes within one frame under the scope (memory `scaffold-fab-exit-animation-widget-test` inverted); (2) scope is inert without the define | `flutter test` |
| 1a-09 patterns | `design/patterns/navigation-disclosure-group.md`, `navigation-section-caption.md`, `navigation-shell.md`, `list-detail.md`, `state-empty-error-outage-loading.md`, `form-validation.md`, `bulk-action-bar.md`, `dialog-confirm-destructive.md`, `density-breakpoints.md`, `studio-three-pane.md` — each with intent, widgets, states, interaction rules in the `must_not` vocabulary, breakpoints, content, a11y, do/don't story ids | as named + `design/patterns/README.md` index | `test/design/patterns_test.dart`: (1) every pattern file has the seven required headings; (2) every story id it cites is registered; (3) every `must_not` term is in `design/must_not_vocabulary.json` | `flutter test test/design/` |
| 1a-10 generated DESIGN.md | `tool/gen_design_md.dart` reads `lib/src/tokens/*.dart` (colour, type scale, spacing, radii) and writes the token block of `DESIGN.md` between markers; prose sections hand-written | `tool/gen_design_md.dart`, `DESIGN.md`, `test/design/design_md_fresh_test.dart` | (1) stale token block fails; (2) a token added in Dart with no DESIGN.md regen fails | `flutter test test/design/` |
| 1a-11 lint | `custom_lint` rules: `no_raw_color`, `text_style_needs_family` (outside `lib/src/tokens/`), `no_magic_spacing` | `lints/` package, `analysis_options.yaml` | each rule: one fixture that fires, one that doesn't | `dart run custom_lint` in CI |
| 1a-12 release | CHANGELOG, tag `v2.2.0`, additive-only contract documented in `README.md` | — | `flutter test` + CI green on the tag | tag |

**Interfaces W1a produces (consumed by W1b/W2/W1★):**
- `package:eden_ui_flutter/testing.dart` → `Future<void> expectUiSane(WidgetTester tester, {Set<String> allowOverlap = const {}})`.
- `package:eden_ui_flutter/probe.dart` → `EdenProbe.install()`, `EdenProbeScope(child:)`, `kEdenProbe`.
- JS: `window.__edenProbe.find({key?:string,text?:string,type?:string,identifier?:string}) → [{id,rect:{x,y,w,h},identifier?,actions:string[]}]`; `tree() → {route,nodes:[...]}`; `settled() → boolean`; `state() → {route,theme,viewport:{w,h},semantics:boolean}`.
- `design/must_not_vocabulary.json` → `["navigate on close","fire twice per activation","cover sibling hit rects","change route","lose selection","steal focus","select the project", ...]` (W1b's schema imports it).

### W1b — devflow-claude: `df/ui-oracle-spec`

**Objective goal:** DevFlow can validate a Surface Spec, render a review sheet from it, run look-lock as a checkpoint, and refuse to compose UI without a spec.

| TRD | Deliverable | Files | Test list (RED cases) | Gate |
|---|---|---|---|---|
| 1b-01 schema | `devflow/schemas/surface-spec.schema.json` (v1, §4.2) + `devflow/schemas/must_not_vocabulary.json` (mirrors W1a) + `bin/lib/ui-spec.cjs` `parseSurfaceSpec(md) → {frontMatter, body}` (front-matter YAML parsed by a **minimal in-repo YAML subset parser** `bin/lib/yaml-lite.cjs` — block maps/lists, inline maps/lists, strings/numbers/bools; no anchors — since no npm deps are allowed) | as named, `*.test.cjs`, `__fixtures__/ui-spec/` | yaml-lite: (1) block map; (2) inline `{a: 1, b: [x, y]}`; (3) quoted strings with `:`; (4) rejects anchors with a clear error. parse: (5) front matter + body split; (6) missing front matter → error | `node --test` |
| 1b-02 validate | `validateSurfaceSpec(spec, {patterns}) → {ok, errors:[{code,path,msg}]}` implementing §4.5 invariants I1–I8 + `behaviors[]` exclusivity/coverage (§4.3) + `outage ≠ empty` (§4.4) | `bin/lib/ui-spec-validate.cjs` + tests + one **known-broken fixture per invariant** (§17) | one RED case per invariant: route without `back`; entry control unknown; two `does`; `behaviors` with overlapping `when`; `behaviors` not covering `narrow`; state without `seed`; `outage.must_show ∩ empty.must_show ≠ ∅`; unknown pattern; overlapping `hit_rect` without `disjoint_from`; flow ending mid-route; guard without denied state | `df-tools ui spec validate <file>` exit 1 with codes |
| 1b-03 render | `renderSurfaceSpec(spec) → {manifest, navGraphMermaid, controlTableMd, captureList}`; `df-tools ui spec render <file> --manifest|--graph|--table` | `bin/lib/ui-spec-render.cjs` + tests | (1) manifest states carry `state_id`, `seed`, `as`, `fault`, `references[]`; (2) mermaid has one edge per `entry` and one dashed edge per `back`; (3) control table sentence for a `behaviors[]` control lists each `when` on its own line | snapshot fixtures |
| 1b-04 sheet | `df-tools ui sheet <spec> --renders <dir> --refs <dir> --out sheet.html` — static HTML: states × theme × width grid with reference beside, nav graph, control table, content contracts; `sheet_hash` = sha256 of the canonical JSON that produced it (not the HTML) | `bin/lib/ui-sheet.cjs`, `templates/ui-sheet.html`, tests | (1) hash is stable across HTML template changes; (2) missing render for a declared state renders a `MISSING` cell, never omits the row; (3) sheet lists `design_read` and `mode` | `node --test`; one fixture sheet committed and eyeballed once |
| 1b-05 look-lock checkpoint | `df-tools ui lock <spec> --sheet-hash <h> --by <email>` writes `acceptance` block; `ui spec validate` reports `lock: cleared` when `routes/controls/states` changed since the lock (compare a stored `locked_shape_hash`); executor `checkpoint:human-verify` variant `look-lock` (references/checkpoints.md) whose approval runs `ui lock` | `bin/lib/ui-spec-lock.cjs`, `references/checkpoints.md`, `agents/executor.md` | (1) lock writes hash/by/at; (2) editing a control clears the lock; (3) editing prose does not | `node --test` |
| 1b-06 frontend-design step 0 | `plugins/eden-ui-flutter/skills/frontend-design/SKILL.md` build mode step 0: locate `flutter/ui_spec/<surface>.md`; if absent, draft from patterns + router table + `design-craft` read, validate, stop for look-lock; refuse to compose against a spec with a cleared lock | SKILL.md, `references/design-stack-flutter.md` (new "Composition and semantics" + "Surface Spec" sections) | prose; dogfooded in W1★ | review |
| 1b-07 executor shell harness | `bin/lib/agent-shell-harness.cjs`: extracts every fenced `bash` block from a named agent/workflow section (`executor.md` Flutter UI section first), runs each line as its own `execFileSync('bash', ['-c', line])` in a scratch repo with a persisted `cwd` between calls and NO shared environment (the harness model), and asserts where files land and what cwd each call ended in | `bin/lib/agent-shell-harness.cjs`, `__fixtures__/agent-shell/` (a monorepo scratch repo with `flutter/pubspec.yaml`), `agents/executor.md` (blocks annotated with `# harness: expect <path>` comments) | (1) a bare `cd X && cmd` line leaves the next call in X — the harness FAILS the section; (2) `( cd X && cmd )` leaves cwd unchanged — passes; (3) a `$VAR` referenced in a later call without re-derivation fails with `unset variable`; (4) evidence `mv` lands under `<scratch>/.planning/objectives/<obj>/evidence/` from any starting cwd; (5) the current `executor.md` Flutter section passes end-to-end | `node --test bin/lib/agent-shell-harness.test.cjs`; CI job runs it against `executor.md` on every PR that touches an agent file |
| 1b-08 release | CHANGELOG, `2.9.0` | — | — | tag |

**Interfaces W1b produces:** `ui-spec.cjs` `{ parseSurfaceSpec, validateSurfaceSpec, renderSurfaceSpec }`; manifest shape consumed by the existing engine; `sheet_hash`; checkpoint type `look-lock`.

### W1c — aodex and eden-biz: `df/e2e-dependency-stub` (one objective each)

**Objective goal:** the e2e stack can put any surface into any declared state: named seeds, named identities, named faults; the probe bridge line is in `main_e2e.dart`.

| TRD | Deliverable | Test list | Gate |
|---|---|---|---|
| 1c-01 seed registry | `e2e/seeds/registry.json` (`{profile: {description, script}}`); `db-reset.sh --profile <p>` (eden-biz) / fixture loader `--profile` (aodex) | (1) unknown profile exits 2 with the list; (2) each profile applies idempotently twice | script tests |
| 1c-02 identity set | `e2e/identities.json` (`primary`, `workspace-member`, `non-member`, `platform-admin`, `support-agent`) provisioned by the seed; token-injection helper takes `--as` (memory `flutter-web-e2e-token-injection`) | (1) `non-member` gets 403/denied state on a guarded route; (2) `primary` gets 200 | Playwright spec per identity |
| 1c-03 fault injection | e2e entrypoint routes named upstreams through `internal/e2estub` (Go) honouring `EDEN_E2E_FAULT=<service>-503|timeout`; services: knowledge, billing, aoid (aodex) / aocore, aoid, payments (eden-biz) | (1) with `knowledge-503` the list endpoint returns 503 within 100 ms; (2) without it, passthrough is byte-identical (differential control) | Go tests + one HTTP integration test at the real seam |
| 1c-04 bridge line | `flutter/lib/main_e2e.dart` calls `EdenProbe.install()` and wraps the app in `EdenProbeScope`; `tool/build_probe_web.sh` = `flutter build web --release --dart-define=EDEN_PROBE=true` + static serve on a port derived from the worktree path (`crc32(pwd) % 1000 + 9000`) + `config.js` copy | (1) served `main.dart.js` contains `__edenProbe`; (2) production build does not (reuse W1a guard) | script + CI job |
| 1c-05 outage state proof | one manual probe: `EDEN_E2E_FAULT=knowledge-503` + open the projects rail → screenshot shows the outage copy, not the empty copy (aodex#602 as the fixture) | differential: with and without the fault | evidence in SUMMARY |

### W1★ — dogfood: `projects-rail`

**Objective goal:** the surface that took ten cycles goes through Phase A and a hand-driven Phase B with the new pieces, the nav branch merges, and both consumers pin a tag.

- [ ] **A1.** In aodex, write `flutter/ui_spec/projects-rail.md` from §4.2 (routes, `behaviors[]` for the header, chevron, states incl. `outage` and `guard-denied` with `as: non-member`, flows, scope rules). `df-tools ui spec validate` → ok.
- [ ] **A2.** Render stories for each state via 1a-05 (add any state the spec names that has no story). `df-tools ui sheet` → publish the sheet as an Artifact → Mark approves → `ui lock`.
- [ ] **B1.** Rebase the nav branch (`eden-ui-rail`, tip `91d89a2c`) onto the 1a-06 API: the disclosure becomes the default builder's behaviour; run `flutter test` + story harness → green.
- [ ] **B2.** Hand-driven CONFORM (W2's `ui probe` does not exist yet): build aodex with `tool/build_probe_web.sh` against the library worktree via `pubspec_overrides.yaml`; drive with the CDP recipe (memory `aodex-browser-e2e-recipe`); for each control in the spec record `elementFromPoint` at the rect centre, the effect diff for one click, and the negation of each `must_not`; for each route record entry and both backs. Write the results as `evidence/ui_eval/projects-rail.conform.json` in the shape §7.5 names — **this file is W2's first real fixture**.
- [ ] **B3.** Every ✗ is a fix on the branch with its own test (the nav memory's three defects are expected to appear if not already fixed: double-fire, row-sized chevron node, invisible sidebar — aodex#529 must be diagnosed here, not deferred).
- [ ] **B4.** Merge the nav branch to `eden-ui-flutter` main; tag `v2.3.0`; aodex pin → `v2.3.0` (closes #585 as a class); eden-biz pin → `v2.3.0` and re-run its stories.
- [ ] **Exit:** sheet re-rendered with a spec-vs-actual column filled by hand from `conform.json`; zero ✗; `MISSING` only for checks W2 will automate (focus-order, scope-reset).

---

## Part 4 — Waves 2–4 (objective granularity)

### W2 — devflow-claude: `df/ui-oracle-loop` (two objectives: tooling, then agents)

**Tooling objective** — `bin/lib/ui-probe.cjs` (CDP driver: navigate, wait `settled()`, click at rect, type, tab, screenshot, DOM semantics dump with `elementFromPoint`, console/network capture, bundle hash vs `build/web/main.dart.js`), `ui-probe-checks.cjs` (§7.5 table, one pure function per check, fixture-driven, **the W1★ `conform.json` and one synthetic known-broken fixture per check**), `ui-catalog.cjs` (reads `tool/catalog_dump.dart` JSON), `ui-doctor.cjs`, `ui-metrics.cjs` (extends W0-6 with `MISSING` rows, human-verify rows, unspecified-route counts), `ui-sheet.cjs` spec-vs-actual column, `flutter-ui-eval.cjs` `references[]` + anchor-less rejection + `calibration` subcommand over eden-biz `ui_eval/regression` (precision/recall printed; `binding` refused below a committed floor). Acceptance: `df-tools ui probe <url> --spec projects-rail.md --state populated` reproduces W1★'s hand-driven verdicts.

**Agents objective** — planner: derive TRD test list/manifest from the spec (§9.1), refuse behaviour outside the spec; executor: RENDER→CONFORM per task (§9.2) with budgets and the "read an image only on failure" rule; verifier: Step 8c replay (§9.4), `engine_version` rejection, human-verify = `MISSING` + `review`; Step 8d split conformance/critique; seam: `pubspec_overrides.yaml` writer at objective start, tag-pin gate as the last TRD; migration table §18 applied (regex catalogue deleted, `tests.maestro` relaxed, bootstrap extended). Acceptance: a throwaway `type: ui` objective on aodex's `projects-rail` runs end-to-end unattended and its SUMMARY shows the state × {golden, probe, checks, judge} table.

### W3 — eden-biz: `df/ui-crawl-and-explorer` and `df/trades-port-workflow-designer`

**Crawl/explorer objective** — `ui-crawl.cjs` (router table from `go_router` sources via `tool/dump_routes.dart`; union of specs; findings per §10.1; fingerprint dedupe against `gh issue list`; release-blocking exit code for `unreachable`/`dead-end`/`inert` entry), `ui-explorer` agent (§10.2, budgeted, e2e-only guard, destructive-through-confirm-only), gh-sync labels `ux-explorer`. Acceptance: on eden-biz e2e, the crawl reports the known open issues (#189 deep link, #188 narrow shell) as findings before they are fixed.

**Port objective** — `df-tools ui donor-routes` on `AOCyber-Trades/trades/client/src/App.tsx` → `ui_spec/refs/trades/donor-routes.json` (47 routes, status `unmapped`); pattern-mapping page + donor captures for the workflow designer; Surface Spec for it (extends `must_not` vocabulary with canvas terms: `drop outside a port`, `connect to itself`, `orphan a node`); obj 020's seven TRDs re-planned from the spec and executed through A–C. Acceptance: donor route `workflow` = `conformed`; `ui metrics` shows the port coverage row.

### W4 — devflow-claude, aodex: `df/probe-adapters`

Maestro `hierarchy` → `ProbeResult` adapter (mobile), `frontend-design` visual mode emits `ProbeResult`; explorer nightly on aodex with a budget; `testing-strategy.md` rows updated. Acceptance: the §7.5 checks run unchanged over both adapters' fixtures. (No React adapter — Trades React retires when the port coverage metric reaches 100%.)

---

## Part 5 — Checkpoints, evidence, and what "done" means

- **Human checkpoints:** W0-9 (plugin upgrade — user action), W1★ A2 look-lock, W1★ B4 merge/tag (per `ask-before-merge`), W2 acceptance run review, W3 release-blocking policy first enforcement.
- **Evidence rule (every wave):** SUMMARY tables with exit codes; a state or check with no evidence is `MISSING`; no "verified" without the command and its output (memory `prove-it-dont-announce`).
- **Merge runbook:** Stage A/B/C from `~/.claude/CLAUDE.md` on every PR; the W1★ library merge touches both consumers' shell — Stage B ownership-transfer check applies (who renders the rail now).
- **Done for this plan:** W2's acceptance run — an unattended `type: ui` objective on `projects-rail` producing the state × {golden, probe, checks, judge} table with zero `MISSING` except mobile — and `ui metrics` showing fix/feat on that objective below the W0 baseline.

## Self-review

- **Spec coverage:** §4 → 1b-01..05, W1★ A1; §5 → 1a-09..11, 1b-06; §6 → 1a-02..06; §7 → 1a-07/08, 1c-03/04, W2 tooling; §8 → 1b-04..06, W1★ A2; §9 → W2 agents; §10 → W3; §11 → W1★ B4, W2 agents (seam); §12 → W0-1/2, 1b-01, W2 tooling (`doctor`, `metrics`); §13 → W0; §14 → Part 1; §15 → W0-6, W0-10, W2; §17 → known-broken fixtures in 1b-02, W2 tooling; §18 → W2 agents; §19 → W3 port objective. No section without a task.
- **Placeholders:** none of the banned phrases; wave 1 tables name files, RED cases and gates; step-level code for wave 1 is DevFlow's planner output by design (Part 1), which this document states rather than fakes.
- **Type consistency:** `state_id` (engine) used throughout, never `id`; `ProbeResult`, `expectUiSane`, `EdenProbe.install()`, `kEdenProbe`, `sheet_hash`, `engine_version` named identically in W0, W1, W2; `must_not_vocabulary.json` shared by 1a-09 and 1b-01.

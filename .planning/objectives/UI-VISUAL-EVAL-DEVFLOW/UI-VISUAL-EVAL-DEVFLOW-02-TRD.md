---
objective: UI-VISUAL-EVAL-DEVFLOW
trd: 02
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
requirements: [P4]
autonomous: true
allow_generated_test_data: false
use_property_based: false
use_gherkin: false

must_haves:
  truths:
    - "Running the bootstrap against a clean stack:flutter repo scaffolds a ui_eval manifest skeleton (Shape-A states matrix)."
    - "The bootstrap scaffolds a capture adapter stub (web Playwright adapter)."
    - "The bootstrap scaffolds the baseline directories (web __screenshots__ + widget goldens)."
    - "The bootstrap adds a `ui_eval` Playwright project entry (or its config stub) to the repo."
    - "A second run on the same repo is idempotent — no duplicate scaffolds, exits no-op."
    - "The bootstrap skips a non-flutter repo (no pubspec flutter dep) gracefully without scaffolding."
    - "A `flutter-ui bootstrap` df-tools subcommand invokes the scaffolder."
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.cjs
      provides: "Pure scaffold-planner (checkScaffoldState/scaffoldUIEval) + CLI wrapper, sibling to flutter-ui-bootstrap.cjs"
    - path: plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs
      provides: "node --test suite covering the 6-case test list (hand-built fixtures, no LLM data)"
    - path: plugins/devflow/devflow/bin/df-tools.cjs
      provides: "`flutter-ui bootstrap` subcommand dispatch arm"
  key_links:
    - from: df-tools.cjs case 'flutter-ui'
      to: flutter-ui-eval-bootstrap.cjs cmd wrapper
      via: "require('./lib/flutter-ui-eval-bootstrap.cjs') + `else if (subcommand === 'bootstrap')` arm"
    - from: flutter-ui-eval-bootstrap.cjs
      to: flutter-ui-scope.cjs detectPubspecFlutter
      via: "require + reuse the existing Flutter detection (no reinvented pubspec parse)"
---

<objective>
P4 — Bootstrap scaffolding: a sibling to `flutter-ui-bootstrap.cjs` that scaffolds the UI-visual-eval
wiring (manifest skeleton, capture adapter stub, baseline dirs, `ui_eval` Playwright project) into ANY
`stack:flutter` repo. Turns the hand-built eden-biz wiring into the *generated* default. Reuses the
Flutter detection in `flutter-ui-scope.cjs`. Wired to a `flutter-ui bootstrap` df-tools subcommand.

Purpose: every Flutter repo inherits the visual-eval scaffolding instead of hand-authoring it.
Output: flutter-ui-eval-bootstrap.cjs (+ test), and a `flutter-ui bootstrap` df-tools arm.
</objective>

<context>
**TDD applies (per OBJECTIVE.md + global CLAUDE.md TDD playbook).** This TRD is `type: tdd`:
test-list-first, RED→GREEN atomic commits (`test:` → `feat:`), hand-built fixture generators
(habit 4 — NO LLM-generated test data; `allow_generated_test_data: false` honored), one test at a
time (habit 3). Zero new npm deps — `node --test` + `node:assert` only.

**Mirror `flutter-ui-bootstrap.cjs` exactly (read it first).** That module exposes a PURE function
`checkBootstrapState({ projectDir })` + a thin CLI wrapper `cmdVerifyFlutterUIBootstrap(cwd, dir, raw)`
and uses `output()` from `./helpers.cjs`. Use the same split: a pure planner (decides what's missing /
what to scaffold) + an impure wrapper that writes files and calls `output()`. The fixture/temp-dir
test pattern is in `flutter-ui-bootstrap.test.cjs` (`fs.mkdtempSync` + hand-built pubspec strings) —
reuse that helper shape.

**Reuse detection — do NOT reinvent:** `flutter-ui-scope.cjs` exports `detectPubspecFlutter(content)`
(returns `{ fired }` for the `flutter:\n  sdk: flutter` block). Require and use it to gate "is this a
flutter repo?" — this is the locked reuse from OBJECTIVE.md P4.

**Idempotency contract:** scaffolding must be a no-op on re-run. Decide presence by checking the
target paths exist (manifest file, adapter file, baseline dirs, the `ui_eval` project entry in
playwright.config). If all present → action `skip`/`no-op`. Mirror the marker/skip semantics of
`flutter-ui-bootstrap.cjs` (it uses `.planning/.flutter-ui-bootstrap-done`; use a parallel
`.planning/.flutter-ui-eval-bootstrap-done` marker, set LAST, after all scaffolds succeed).

**df-tools wiring:** add a `bootstrap` arm to the EXISTING `case 'flutter-ui':` block in df-tools.cjs
(~L423; it currently has `setup` and `eval`). Add the `require('./lib/flutter-ui-eval-bootstrap.cjs')`
import near the existing flutter-ui requires (~L185-191) and update the "Available:" error string.

**CO-MODIFICATION NOTE (planner→executor):** df-tools.cjs is touched ONLY by this TRD across the whole
objective (TRD-01 confirms model-profiles.json but does not edit df-tools.cjs; TRD-03 edits planner.md
only). No sequencing needed — all three TRDs are wave 1, independent files.

**KNOWN ENV QUIRK (executor):** Edit/Write may be sandboxed to a foreign worktree. Write via Bash
heredoc to absolute paths under `/Users/markemerson/Source/devflow-claude-ui-eval`; verify with
`git status`; avoid `git checkout` probes on tracked files; commit from repo root via
`df-tools commit --files` (raw `git commit` hook-blocked).
</context>

## Test list

(Author this checklist into the test file as `test.describe` blocks BEFORE any implementation —
test-list-first, one test at a time. All fixtures hand-built; no LLM-generated data.)

Pure planner `checkScaffoldState({ projectDir })` (RED first):
- B1 — clean flutter repo, nothing scaffolded → `action: 'scaffold'`, `missing` includes
  `manifest`, `adapter`, `baseline_dirs`, `playwright_project`.
- B2 — non-flutter repo (pubspec lacks `flutter:\n  sdk: flutter`, or no pubspec) → `action: 'skip'`,
  reason flutter-not-detected; `missing: []`; nothing to scaffold.
- B3 — all scaffolds present + marker present → `action: 'skip'` (idempotent no-op), `missing: []`.
- B4 — manifest present but adapter missing → `action: 'scaffold'`, `missing` includes `adapter`
  only (partial top-up, not full re-scaffold).

Impure `scaffoldUIEval({ projectDir })` (after planner GREEN):
- B5 — scaffold on a clean flutter repo CREATES: a manifest skeleton file (parses as the Shape-A
  states matrix — object with a `states` array), a capture-adapter stub file, the baseline dirs,
  a `ui_eval` playwright project entry, and the `.flutter-ui-eval-bootstrap-done` marker LAST.
- B6 — scaffold run twice is idempotent: second run makes no new files / no duplicate `ui_eval`
  project entry, and reports no-op.

(Edge already covered by B2: skips non-flutter. Outside-in ordering: system-ish scaffold output
behavior (B5/B6) is validated through the pure planner (B1-B4) first — pure core before I/O.)

<file_tree>
plugins/devflow/devflow/bin/
├── lib/
│   ├── flutter-ui-eval-bootstrap.cjs        ← CREATE (sibling to flutter-ui-bootstrap.cjs)
│   └── flutter-ui-eval-bootstrap.test.cjs   ← CREATE (node --test, hand-built fixtures)
└── df-tools.cjs                             ← MODIFY (require + `flutter-ui bootstrap` arm)
</file_tree>

<embedded_context>

<codebase_examples>
<!-- Module shape to mirror — flutter-ui-bootstrap.cjs: -->
const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');
function checkBootstrapState({ projectDir }) { /* pure: returns {ready, missing, action, setup_task?} */ }
function cmdVerifyFlutterUIBootstrap(cwd, projectDir, raw) {
  const target = projectDir ? (path.isAbsolute(projectDir) ? projectDir : path.join(cwd, projectDir)) : cwd;
  const result = checkBootstrapState({ projectDir: target });
  output(result, raw);
}
module.exports = { checkBootstrapState, cmdVerifyFlutterUIBootstrap };

<!-- Detection reuse — flutter-ui-scope.cjs export: -->
const { detectPubspecFlutter } = require('./flutter-ui-scope.cjs'); // detectPubspecFlutter(content) -> { fired }

<!-- Test fixture pattern — flutter-ui-bootstrap.test.cjs: -->
const test = require('node:test'); const assert = require('node:assert');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
function makeProject(opts) { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-eval-bootstrap-')); /* hand-write pubspec etc. */ return tmp; }

<!-- df-tools dispatch to extend — case 'flutter-ui' (df-tools.cjs ~L423): -->
case 'flutter-ui': {
  const subcommand = args[1];
  if (subcommand === 'setup') { cmdFlutterUISetup(cwd, args.slice(2), raw); }
  else if (subcommand === 'eval') { cmdVerifyFlutterUIEval(cwd, args.slice(2), raw); }
  // ADD: else if (subcommand === 'bootstrap') { cmdFlutterUIEvalBootstrap(cwd, args[2], raw); }
  else { error('Unknown flutter-ui subcommand. Available: setup, eval'); } // UPDATE to add bootstrap
  break;
}

<!-- Shape-A manifest skeleton to scaffold (the engine consumes JSON manifests — see
     bin/lib/__fixtures__/flutter-ui-eval/manifest.json). Scaffold a minimal valid one:
     { "objective": "<TODO>", "samples": 3, "flakeBudget": 1, "states": [] } plus a commented
     example state. Authored/generated, never LLM-authored prose. -->
</codebase_examples>

<anti_patterns>
- Do NOT add a YAML dependency. The engine's manifests are consumed as JSON (loadManifest does
  JSON.parse). Scaffold a `.json` manifest skeleton (matching the existing fixture shape), OR if a
  `.yaml` skeleton is scaffolded for human authoring, keep it dependency-free string content — but the
  engine-consumed manifest must be JSON-parseable. Prefer JSON to match the shipped loadManifest.
- Do NOT re-parse pubspec by hand — reuse `detectPubspecFlutter` from flutter-ui-scope.cjs.
- Do NOT make scaffolding destructive on re-run. Check existence first; the marker is the LAST write.
- Do NOT introduce a new top-level df-tools `case` — extend the EXISTING `case 'flutter-ui':`.
- Do NOT generate test data with the model — hand-build every fixture (habit 4 / `allow_generated_test_data: false`).
</anti_patterns>

<error_recovery>
- If a temp-dir test leaks files, each test must `fs.mkdtempSync` a fresh dir (never share). Cleanup is
  optional (OS tmp) but don't assert across dirs.
- If the df-tools `--help`/no-arg path is needed, mirror cmdVerifyFlutterUIEval's `--help` guard
  (emit a usage object via `output()`), so `flutter-ui bootstrap --help` exits cleanly.
- If sandboxed Edit on df-tools.cjs fails, re-apply the require + dispatch arm via heredoc and confirm
  `node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui bootstrap --help` exits 0.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>RED+GREEN: pure scaffold planner checkScaffoldState (cases B1-B4)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.cjs</files>
  <action>
RED first: create `flutter-ui-eval-bootstrap.test.cjs` with the test-list cases B1-B4 against an
imported `checkScaffoldState` that does not yet exist. Use the `makeProject({...})` temp-dir helper
shape from `flutter-ui-bootstrap.test.cjs` — hand-write pubspec content (flutter vs non-flutter),
pre-create/omit the manifest/adapter/baseline/playwright-project paths and the marker.
Run `node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs` → MUST fail (import error).
Commit: `test(UI-VISUAL-EVAL-DEVFLOW-02): add failing tests for checkScaffoldState (B1-B4)`.

GREEN: create `flutter-ui-eval-bootstrap.cjs`. Implement the PURE `checkScaffoldState({ projectDir })`:
  - read pubspec.yaml (if any) → `detectPubspecFlutter(content).fired`; if not fired → `{ action:'skip',
    reason:'flutter-not-detected', missing:[] }` (B2).
  - else compute `missing` from path existence: manifest file (e.g. `ui_eval/manifests/web.manifest.json`),
    adapter file (e.g. `web_e2e/lib/uiEval/captureWeb.js` — match OBJECTIVE.md path or a repo-relative
    default), baseline dirs (`web_e2e/tests/ui_eval/__screenshots__/`, `test/ui_eval/goldens/`), and the
    `ui_eval` playwright project (grep `playwright.config.js` for a `ui_eval` project token).
  - marker = `.planning/.flutter-ui-eval-bootstrap-done`.
  - `action`: `'skip'` if missing empty (B3); else `'scaffold'` with the missing list (B1 full, B4 partial).
Run the suite → B1-B4 pass.
Commit: `feat(UI-VISUAL-EVAL-DEVFLOW-02): implement pure checkScaffoldState planner`.

# PATTERN: copy flutter-ui-bootstrap.cjs's require header + output() usage verbatim.
# CRITICAL: pure fn only — no fs writes in checkScaffoldState; existence-reads are fine.
# GOTCHA: write files via heredoc to absolute paths (sandbox quirk); verify with git status.
  </action>
  <verify>
RED proof in history: `git log --oneline | grep -q 'test(UI-VISUAL-EVAL-DEVFLOW-02): add failing'`.
GREEN: `node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs` exits 0 with B1-B4 passing.
`node -e "const {checkScaffoldState}=require('./plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.cjs'); console.log(typeof checkScaffoldState)"` prints `function`.
  </verify>
  <done>checkScaffoldState is a pure function returning skip on non-flutter (B2), scaffold+full-missing on clean flutter (B1), skip on all-present (B3), scaffold+partial-missing on partial (B4). Two atomic commits (test:→feat:).</done>
  <recovery>If a case is ambiguous, re-read flutter-ui-bootstrap.cjs's missing/action semantics and mirror them. If import still fails after GREEN, the module.exports is missing checkScaffoldState — add it.</recovery>
</task>

<task type="auto" tdd="true">
  <name>RED+GREEN: impure scaffoldUIEval writer (cases B5-B6, idempotency)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.cjs</files>
  <action>
RED: append B5-B6 to the test file against a not-yet-existing `scaffoldUIEval({ projectDir })`.
  - B5: on a clean flutter temp repo, after scaffold: assert the manifest file exists AND
    `JSON.parse(fs.readFileSync(manifestPath))` has an Array `states`; assert the adapter stub file
    exists; assert the baseline dirs exist; assert `playwright.config.js` (created or appended) contains
    a `ui_eval` project token; assert the `.flutter-ui-eval-bootstrap-done` marker exists.
  - B6: call `scaffoldUIEval` twice; assert the second run is a no-op — file count unchanged, exactly
    ONE `ui_eval` occurrence in playwright.config, and the function reports no-op (e.g. returns
    `{ action:'skip' }` on the 2nd call because checkScaffoldState now reports nothing missing).
Run → MUST fail. Commit: `test(UI-VISUAL-EVAL-DEVFLOW-02): add failing tests for scaffoldUIEval (B5-B6)`.

GREEN: implement `scaffoldUIEval({ projectDir })`:
  - call `checkScaffoldState`; if `action !== 'scaffold'` → return it unchanged (no-op; gives B3/B6 skip).
  - for each missing item, write the scaffold (mkdir -p baseline dirs; write manifest JSON skeleton
    `{ objective:'<TODO>', samples:3, flakeBudget:1, states:[] }`; write adapter stub with a header
    comment + a TODO body; create-or-append the `ui_eval` project to playwright.config.js — append ONLY
    if the token is absent, to keep B6 idempotent).
  - write the `.flutter-ui-eval-bootstrap-done` marker LAST.
  - return `{ action:'scaffolded', created:[...] }`.
Run → B1-B6 all pass. Commit: `feat(UI-VISUAL-EVAL-DEVFLOW-02): implement scaffoldUIEval writer + idempotency`.

# CRITICAL: marker is the LAST write — if any earlier write throws, marker is absent so re-run retries.
# GOTCHA: append-only-if-absent for the playwright project keeps B6 a true no-op.
  </action>
  <verify>
`node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs` exits 0 with B1-B6 passing.
RED proof: `git log --oneline | grep -q 'add failing tests for scaffoldUIEval'`.
  </verify>
  <done>scaffoldUIEval creates manifest skeleton (valid JSON w/ states[]), adapter stub, baseline dirs, ui_eval playwright project, marker-last; second run is a verified no-op. Two atomic commits.</done>
  <recovery>If B6 fails with a duplicate ui_eval entry, the append guard is missing — grep the config before appending. If the marker is created on a failed scaffold, move the marker write to the very end after a try/catch.</recovery>
</task>

<task type="auto">
  <name>Wire `flutter-ui bootstrap` df-tools subcommand + final regression</name>
  <files>plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.cjs</files>
  <action>
Add the CLI wrapper + df-tools dispatch (glue — no new test cycle; covered by the engine's own --help
and the lib tests).

1. In `flutter-ui-eval-bootstrap.cjs`, add `cmdFlutterUIEvalBootstrap(cwd, projectDir, raw)` mirroring
   `cmdVerifyFlutterUIBootstrap`: resolve target dir; if `--help`/no-arg, `output()` a usage object;
   else call `scaffoldUIEval({ projectDir: target })` and `output(result, raw)`. Export it.

2. In `df-tools.cjs`:
   - Add `const { cmdFlutterUIEvalBootstrap } = require('./lib/flutter-ui-eval-bootstrap.cjs');`
     beside the other flutter-ui requires (~L185-191).
   - In `case 'flutter-ui':` add `else if (subcommand === 'bootstrap') { cmdFlutterUIEvalBootstrap(cwd, args[2], raw); }`
     before the `else { error(...) }`. Update the error string to `Available: setup, eval, bootstrap`.

3. Commit the glue:
   `node ~/.claude/devflow/bin/df-tools.cjs commit "feat(UI-VISUAL-EVAL-DEVFLOW-02): wire flutter-ui bootstrap df-tools subcommand" --files plugins/devflow/devflow/bin/df-tools.cjs plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.cjs`

# GOTCHA: df-tools commit stages the WHOLE index — ensure only these two files are staged (`git status --short`).
# CRITICAL: extend the EXISTING case 'flutter-ui' — do not add a new top-level case.
  </action>
  <verify>
`node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui bootstrap --help` exits 0 and prints a usage object.
`grep -q "subcommand === 'bootstrap'" plugins/devflow/devflow/bin/df-tools.cjs && grep -q 'Available: setup, eval, bootstrap' plugins/devflow/devflow/bin/df-tools.cjs`.
Full regression: `npm test` exits 0 (no new failures vs baseline; known ~1 pre-existing awareness flake — add none).
  </verify>
  <done>`flutter-ui bootstrap` subcommand dispatches to the scaffolder; `--help` exits cleanly; full `npm test` green; glue committed.</done>
  <recovery>If --help throws, the cmd wrapper lacks the no-arg/--help guard — add it mirroring cmdVerifyFlutterUIEval. If the dispatch arm is unreachable, confirm it's inside `case 'flutter-ui'` not a sibling case.</recovery>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs` → exit 0, B1-B6 pass.
- `node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui bootstrap --help` → exit 0, usage object.
- `npm test` → no regression vs baseline (no new failures; ~1 known pre-existing awareness flake only).
- RED→GREEN evidence: `test:` commits precede their `feat:` commits in `git log`.
</verification>

<validation_gates>
```bash
node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.test.cjs
node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui bootstrap --help
npm test
```
</validation_gates>

<success_criteria>
- [ ] Test list authored as describe blocks BEFORE implementation (test-list-first)
- [ ] checkScaffoldState pure (B1-B4); scaffoldUIEval impure + idempotent (B5-B6)
- [ ] Reuses detectPubspecFlutter from flutter-ui-scope.cjs (no reinvented pubspec parse)
- [ ] Skips non-flutter repos; idempotent re-run; marker written LAST
- [ ] `flutter-ui bootstrap` df-tools arm dispatches; --help exits 0
- [ ] Hand-built fixtures only (no LLM-generated test data); zero new npm deps
- [ ] RED→GREEN atomic commits (test:→feat:) per task; npm test green
</success_criteria>

<output>
Append to SUMMARY.md: the bootstrap module API (checkScaffoldState/scaffoldUIEval/cmd wrapper), the
6-case test list result, and confirmation df-tools.cjs `flutter-ui bootstrap` is the only df-tools edit
in this objective.
</output>

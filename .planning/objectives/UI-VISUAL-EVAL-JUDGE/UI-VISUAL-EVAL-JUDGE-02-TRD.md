---
objective: UI-VISUAL-EVAL-JUDGE
trd: "02"
type: tdd
wave: 2
depends_on: ["01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/references/model-profiles.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/manifest.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/good-dashboard.capture.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/broken-overflow.capture.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/good-dashboard.png
  - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/broken-overflow.png
  - plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/labels.json
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs
autonomous: true
fixture_strategy: generators
must_haves:
  truths:
    - "`node plugins/devflow/devflow/bin/df-tools.cjs verify flutter-ui-eval --help` exits cleanly and prints usage."
    - "`node plugins/devflow/devflow/bin/df-tools.cjs verify flutter-ui-eval <captureResults|manifest> --raw` runs a dry-run over the checked-in dogfood fixtures using the FAKE/offline judge and emits a scoreRun rollup JSON. NO real API call."
    - "`flutter-ui eval` subcommand is reachable under `case 'flutter-ui':` beside `setup`."
    - "model-profiles.json has a `df-ui-evaluator` agent row (quality/balanced/budget tiers) and resolve-model returns it."
    - "The dogfood harness scores checked-in known-good → is_broken:false and known-broken → is_broken:true via a fake judge keyed off the capture's expected/label, exercising the real scoring pipeline (scoreState/scoreRun) end-to-end."
    - "The default (real) callVisionJudge impl resolves the vision model id + builds the image-input message from the AUTHORITATIVE current source (not hardcoded from memory); it is NEVER invoked in tests/verification."
  artifacts:
    - path: plugins/devflow/devflow/bin/df-tools.cjs
      provides: "`verify flutter-ui-eval [--raw]` arm + `flutter-ui eval` arm + require of cmdVerifyFlutterUIEval"
    - path: plugins/devflow/devflow/references/model-profiles.json
      provides: "df-ui-evaluator agent row pointing at the vision-capable model tier"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/
      provides: "manifest.json + known-good/known-broken CaptureResult JSON + placeholder PNGs + labels.json (expected is_broken)"
    - path: plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs
      provides: "node --test dogfood harness scoring the checked-in fixtures with a fake judge, asserting the rollup"
  wiring:
    - "df-tools.cjs `case 'verify':` → cmdVerifyFlutterUIEval(cwd, args.slice(2), raw), added beside the flutter-state-coverage arm; its name appended to the 'Unknown verify subcommand' available-list."
    - "df-tools.cjs `case 'flutter-ui':` → routes `eval` to the same handler (or a thin eval wrapper) beside `setup`; available-list updated."
    - "cmdVerifyFlutterUIEval handler lives in flutter-ui-eval.cjs and uses helpers.cjs output() for JSON/--raw, mirroring cmdVerifyFlutterStateCoverage."
    - "callVisionJudge default judge resolves the model via the same MODEL_PROFILES/resolve-model path used elsewhere (df-ui-evaluator row)."
  key_links:
    - "df-tools CLI arm → cmdVerifyFlutterUIEval → loadManifest/callVisionJudge(injected fake for dogfood)/scoreState/scoreRun → output() rollup. The seam that makes the engine runnable standalone via node."
    - "model-profiles.json df-ui-evaluator → resolve-model → callVisionJudge default real impl (network path, unused in tests)."
---

# TRD-02: df-tools wiring + model-profile row + default vision judge + dogfood rollup

<objective>
Make the TRD-01 engine runnable standalone via `node` and wire it into the DevFlow CLI surface,
without ever calling the real vision API in tests/verification. Adds: the df-tools `verify
flutter-ui-eval [--raw]` arm + `flutter-ui eval` arm (beside the flutter-state-coverage and
flutter-ui setup arms, matching conventions); a `df-ui-evaluator` row in model-profiles.json;
the DEFAULT (real) callVisionJudge implementation (resolves the current vision model id +
image-input format from the authoritative source — NOT hardcoded from memory); and a checked-in
dogfood fixture set (synthetic known-good + known-broken CaptureResult JSON + placeholder PNGs +
expected is_broken labels) exercised by a fake judge through the real scoring pipeline, emitting
a scoreRun rollup.

Resolved intent: kind=plugin, work=feature, tdd=strict, fixture_strategy=generators.
Constraints honored: no_llm_test_data, no_property_based_default, no_gherkin_layer.
</objective>

<context>
- Depends on TRD-01 (the engine + fixtures + callVisionJudge boundary must exist).
- The CLI handler is the impure df-tools seam; its dogfood/verification path injects a FAKE judge
  (or a "label-echo" judge that reads the capture's expected label) so NO network call occurs.
  The DEFAULT real judge is wired but only reachable on a genuine (non-dogfood, non-test) run.
- TDD strict: the df-tools handler's pure routing/rollup logic is unit-tested via the dogfood
  harness; the prompt-construction / API-call glue inside the real callVisionJudge is NOT
  unit-TDD'd (it is the impure boundary) — mark it with a `<!-- TDD-EXCEPTION: impure vision-API
  boundary, validated via the deferred GO/NO-GO gate -->` comment in the source.
</context>

<embedded_context>
<codebase_examples>
df-tools.cjs wiring sites (verified line numbers):
- `case 'verify':` at L388. The flutter-state-coverage arm at L410-412:
    `} else if (subcommand === 'flutter-state-coverage') {`
    `  cmdVerifyFlutterStateCoverage(cwd, args[2], raw);`
  Add an analogous `else if (subcommand === 'flutter-ui-eval')` arm calling
  `cmdVerifyFlutterUIEval(cwd, args.slice(2), raw)`, and APPEND 'flutter-ui-eval' to the
  'Unknown verify subcommand. Available: ...' list at L414.
- `case 'flutter-ui':` at L419. Currently only `setup` (L424). Add `else if (subcommand === 'eval')`
  routing to the same handler (or a thin eval wrapper), and update the 'Available: setup' message.
- Top-of-file require, beside L187 `const { cmdVerifyFlutterStateCoverage } = require('./lib/flutter-state-coverage.cjs');`
  → add `cmdVerifyFlutterUIEval` to that same require (export it from flutter-ui-eval.cjs).

The handler cmdVerifyFlutterUIEval — mirror cmdVerifyFlutterStateCoverage (flutter-state-coverage.cjs
L221-295): validate args, resolve absolute paths, use `output(result, raw)` from helpers.cjs, and on
the dogfood/dry-run path inject a fake/offline judge so scoreRun runs with zero network.

model-profiles.json (references/model-profiles.json) — agents are `df-`-prefixed; each row is
`{ "quality": "<tier>", "balanced": "<tier>", "budget": "<tier>" }` where tier ∈ models map keys
(opus/sonnet/haiku). Add:
    "df-ui-evaluator": { "quality": "opus", "balanced": "sonnet", "budget": "sonnet" }
(use the vision-capable tier — confirm which `models` entry is the current vision model when wiring
the real judge; see <vision_model> below). resolve-model is invoked as
`node df-tools.cjs resolve-model df-ui-evaluator`.

Dogfood test harness — mirror `flutter-ui-dogfood.test.cjs` (the precedent): drive df-tools via
`execSync('node ' + DF_TOOLS + ' verify flutter-ui-eval ... --raw')`, JSON.parse the output, and
assert the rollup. Fixtures live under `__fixtures__/flutter-ui-eval/` (matches the existing
`__fixtures__/flutter-ui-dogfood` / `__fixtures__/flutter-state-coverage` convention).
</codebase_examples>

<vision_model>
DO NOT hardcode the vision model id or image-input message format from memory (knowledge cutoff
predates current ids). The OBJECTIVE.md and design plan reference a "claude-api skill reference"
for the current id + image format — that skill was NOT found on this system during planning. So:

1. Resolve the model id via the repo's own MODEL_PROFILES path: read
   `plugins/devflow/devflow/references/model-profiles.json` → the `models` map gives the concrete
   id for the tier the `df-ui-evaluator` row points at. Use that, do not invent an id.
2. For the image-input message format, locate the AUTHORITATIVE current source at execution time
   (in order): (a) search `~/.claude` for a claude-api / anthropic-messages skill
   (`find ~/.claude -ipath '*claude-api*'` / grep for `"type": "image"` + `media_type` in SKILL.md
   files) in case one is installed by then; (b) otherwise the Anthropic Messages API image content
   block (`{ type:'image', source:{ type:'base64', media_type:'image/png', data:<b64> } }`).
   Cite whichever source you used in a code comment so the next reader knows the provenance.
3. The real network call stays INSIDE the default callVisionJudge impl ONLY and is NEVER exercised
   by tests/verification — the injectable boundary from TRD-01 guarantees this.
</vision_model>

<anti_patterns>
- NO real API/network call in any test or verification command. Dogfood uses a fake/offline judge.
- NO new npm dependency.
- NO hardcoded vision model id from memory — resolve via model-profiles.json + cite the format source.
- NO LLM-generated fixtures — the dogfood CaptureResults + labels are hand-built (generators or
  hand-written JSON); PNGs are tiny placeholders (the fake judge keys off the label/expected, not pixels).
- Do NOT modify the eden-biz worktree or the installed ~/.claude plugin mirror — only this source worktree.
- Do NOT break existing df-tools verify/flutter-ui subcommands or their 'Available:' help strings.
</anti_patterns>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── flutter-ui-eval.cjs                          ← MODIFY (add cmdVerifyFlutterUIEval + default callVisionJudge)
├── flutter-ui-eval.test.cjs                     ← MODIFY (default-judge-not-called assertion)
├── flutter-ui-eval-dogfood.test.cjs             ← CREATE (CLI dogfood harness)
└── __fixtures__/flutter-ui-eval/                ← CREATE
    ├── manifest.json
    ├── good-dashboard.capture.json
    ├── broken-overflow.capture.json
    ├── good-dashboard.png                        (tiny placeholder)
    ├── broken-overflow.png                       (tiny placeholder)
    └── labels.json                               (expected is_broken per state)
plugins/devflow/devflow/bin/
└── df-tools.cjs                                 ← MODIFY (verify + flutter-ui arms + require)
plugins/devflow/devflow/references/
└── model-profiles.json                          ← MODIFY (df-ui-evaluator row)
</file_tree>
</embedded_context>

## Test list (write BEFORE implementation — test_list_first=required)

- **model-profiles row**:
  - P1 `resolve-model df-ui-evaluator --raw` returns a concrete model (opus→'inherit' or a real id), not unknown_agent.
- **df-tools verify arm**:
  - D1 `verify flutter-ui-eval --help` exits 0 and prints usage (no crash, no network).
  - D2 `verify flutter-ui-eval <manifest> --raw` over the dogfood fixtures emits a scoreRun rollup JSON.
- **flutter-ui eval arm**:
  - F1 `flutter-ui eval` is a known subcommand (reachable, not "Unknown ... Available: setup").
- **dogfood scoring (real pipeline, fake judge)**:
  - DF1 known-good capture → JudgeResult is_broken:false → state verdict pass.
  - DF2 known-broken (overflow) capture → JudgeResult is_broken:true with defect.type overflow/high → state verdict fail.
  - DF3 scoreRun over the fixture set → rollup verdict reflects the one fail (verdict 'fail', the broken state listed).
- **no-network guarantee**:
  - N1 the default real callVisionJudge is NOT invoked during the dogfood/verify path (assert via the injected fake; grep no network import is reachable from the dogfood path).

## Environment quirks (read before editing — same as TRD-01)

- Executor Edit/Write may be sandboxed to a foreign worktree → write via `Bash` heredoc to ABSOLUTE
  paths under `/Users/markemerson/Source/devflow-claude-ui-eval/...`; verify with `git status`.
- Commit from repo root via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` (raw git commit hook-blocked).
- Keep tasks < 15 min; commit at small increments. PNG placeholders: write a 1x1 PNG via a tiny
  base64 heredoc (no image tooling needed) — the fake judge keys off labels/expected, not pixels.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 — model-profiles df-ui-evaluator row + dogfood fixtures</name>
  <files>plugins/devflow/devflow/references/model-profiles.json, plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/manifest.json, plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/good-dashboard.capture.json, plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/broken-overflow.capture.json, plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/good-dashboard.png, plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/broken-overflow.png, plugins/devflow/devflow/bin/lib/__fixtures__/flutter-ui-eval/labels.json</files>
  <action>
1. Add the `df-ui-evaluator` agent row to references/model-profiles.json under `agents`, matching
   the existing row shape, e.g. `"df-ui-evaluator": { "quality": "opus", "balanced": "sonnet", "budget": "sonnet" }`.
   Keep the file valid JSON (re-parse to confirm).
2. Create the dogfood fixture dir `__fixtures__/flutter-ui-eval/`:
   - `manifest.json` — JSON (NOT yaml) listing the two states (good-dashboard, broken-overflow) with
     route/data_state/viewport/expected prose + screenshot_path pointing at the PNGs.
   - `good-dashboard.capture.json` — Shape-B CaptureResult, metadata.expected describing a correct
     populated dashboard.
   - `broken-overflow.capture.json` — Shape-B CaptureResult, metadata.expected same anchor but the
     state is intended-broken (overflow).
   - `good-dashboard.png` / `broken-overflow.png` — tiny 1x1 placeholder PNGs (base64 heredoc).
   - `labels.json` — `{ "good-dashboard": { "is_broken": false }, "broken-overflow": { "is_broken": true, "type": "overflow", "severity": "high" } }`.
   All hand-built — no LLM data.

# CRITICAL: model-profiles.json must remain valid JSON. df- prefix on the agent key.
# GOTCHA: PNGs are placeholders only — the dogfood fake judge keys off labels.json/expected, not pixels.
  </action>
  <verify>node -e "JSON.parse(require('fs').readFileSync('/Users/markemerson/Source/devflow-claude-ui-eval/plugins/devflow/devflow/references/model-profiles.json'))" exits 0; node /Users/markemerson/Source/devflow-claude-ui-eval/plugins/devflow/devflow/bin/df-tools.cjs resolve-model df-ui-evaluator --raw prints a model (not 'sonnet' unknown-fallback); all 7 fixture files exist (ls)</verify>
  <done>Row + fixtures committed: `feat(ui-eval): add df-ui-evaluator model profile + dogfood fixtures`.</done>
  <recovery>If resolve-model returns unknown_agent fallback, the key is misspelled or not under `agents`. If JSON.parse throws, a trailing comma was introduced.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2 — RED dogfood + CLI tests, GREEN cmdVerifyFlutterUIEval handler</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs</files>
  <action>
RED: write `flutter-ui-eval-dogfood.test.cjs` (mirror flutter-ui-dogfood.test.cjs) covering D1, D2,
DF1-3, N1. Drive df-tools via execSync. The dogfood path must use a FAKE/offline judge — implement
the handler so that when no real run is requested (dry-run / dogfood / --raw over fixtures) it scores
using a label-echo judge that reads labels.json (or the capture's expected) and returns a Shape-C
accordingly, then runs scoreState/scoreRun. This exercises the REAL scoring pipeline with NO network.

GREEN: implement `cmdVerifyFlutterUIEval(cwd, args, raw)` in flutter-ui-eval.cjs (export it):
- `--help` → print usage via output(), exit clean (D1).
- given a manifest/captureResults path → loadManifest, build the offline judge, callVisionJudge per
  state with the injected fake, validateJudgeResult, scoreState per state, scoreRun rollup → output(rollup, raw) (D2/DF1-3).
- Add `df-ui-evaluator`-based model resolution into the DEFAULT (real) callVisionJudge only.
- Use helpers.cjs output() exactly like cmdVerifyFlutterStateCoverage.

Confirm RED first (handler missing → tests fail), then GREEN one case at a time.

# PATTERN: mirror cmdVerifyFlutterStateCoverage arg-handling + output() usage.
# CRITICAL: the dogfood/verify path NEVER reaches the network — assert N1 with the injected fake.
  </action>
  <verify>node --test /Users/markemerson/Source/devflow-claude-ui-eval/plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs → exit 0, D1/D2/DF1-3/N1 green</verify>
  <done>Handler + dogfood suite green. Two commits: `test(ui-eval): RED dogfood + CLI handler cases` then `feat(ui-eval): cmdVerifyFlutterUIEval offline scoring handler`.</done>
  <recovery>If the handler hits the network on the dogfood path, the offline/label-echo judge isn't being injected — route the default real judge only when an explicit live flag is set, never on the fixture path.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3 — Wire df-tools arms + default real callVisionJudge (TDD-EXCEPTION boundary)</name>
  <files>plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs</files>
  <action>
1. df-tools.cjs require: add `cmdVerifyFlutterUIEval` to the require of flutter-ui-eval.cjs (beside
   the flutter-state-coverage require near L187).
2. `case 'verify':` (L388): add `else if (subcommand === 'flutter-ui-eval') { cmdVerifyFlutterUIEval(cwd, args.slice(2), raw); }`
   beside the flutter-state-coverage arm (L410-412); APPEND 'flutter-ui-eval' to the 'Unknown verify
   subcommand. Available: ...' list (L414).
3. `case 'flutter-ui':` (L419): add `else if (subcommand === 'eval') { cmdVerifyFlutterUIEval(cwd, args.slice(2), raw); }`
   beside `setup`; update the 'Available: setup' help to 'Available: setup, eval'.
4. Implement the DEFAULT real callVisionJudge impl (the impure boundary): resolve the model id via
   model-profiles.json (df-ui-evaluator row) and build the image-input message from the authoritative
   format source (see <vision_model> — search ~/.claude for a claude-api skill first; else Anthropic
   Messages API image content block). Mark the network glue with
   `<!-- TDD-EXCEPTION: impure vision-API boundary; validated by the deferred GO/NO-GO gate -->`.
   Add a test (in flutter-ui-eval.test.cjs) asserting that when NO judge is injected the default exists
   but is NOT auto-invoked by the dogfood/verify path (e.g. spy/flag), keeping verification offline.

# CRITICAL: do not break existing verify/flutter-ui subcommand help strings or routing.
# GOTCHA: args.slice(2) (not args[2]) so --help and the path+flags all reach the handler.
  </action>
  <verify>node /Users/markemerson/Source/devflow-claude-ui-eval/plugins/devflow/devflow/bin/df-tools.cjs verify flutter-ui-eval --help → exits 0 with usage; node ... df-tools.cjs verify flutter-ui-eval <fixtures/manifest.json> --raw → emits scoreRun rollup JSON; node ... df-tools.cjs flutter-ui eval ... → reachable; node --test plugins/devflow/devflow/bin/lib/*.test.cjs → all green (no regression)</verify>
  <done>CLI arms live, default judge wired but offline-safe. Commits: `test(ui-eval): RED default-judge-not-invoked guard` then `feat(ui-eval): wire df-tools verify/flutter-ui-eval + eval arms + default vision judge`.</done>
  <recovery>If an existing verify subcommand breaks, you edited the wrong else-if chain position — the new arm goes before the trailing `else { error(...) }`. Re-run the full suite to catch regressions.</recovery>
</task>

</tasks>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs verify flutter-ui-eval --help` → exit 0, usage printed.
- `node plugins/devflow/devflow/bin/df-tools.cjs verify flutter-ui-eval <__fixtures__/flutter-ui-eval/manifest.json> --raw` → scoreRun rollup JSON (verdict 'fail', broken-overflow listed), NO network.
- `node plugins/devflow/devflow/bin/df-tools.cjs flutter-ui eval ...` → reachable (not "Unknown flutter-ui subcommand").
- `node plugins/devflow/devflow/bin/df-tools.cjs resolve-model df-ui-evaluator --raw` → concrete model.
- `node --test plugins/devflow/devflow/bin/lib/*.test.cjs` (or `npm test`) → all green, no regression.
- No new npm dependency; eden-biz worktree + ~/.claude mirror untouched.
</verification>

<success_criteria>
- df-tools exposes `verify flutter-ui-eval [--raw]` + `flutter-ui eval`, matching existing arm conventions and help strings.
- model-profiles.json carries df-ui-evaluator; resolve-model returns it.
- The dogfood harness scores checked-in known-good/known-broken fixtures through the real
  scoreState/scoreRun pipeline with a fake judge and emits a correct rollup — zero network.
- The default real callVisionJudge is wired (model resolved, format sourced + cited) but never
  invoked in tests/verification.
- Atomic test:→feat: commit pairs per task.
</success_criteria>

<output>
The Phase-2 standalone engine is now node-runnable and CLI-wired with an offline dogfood rollup.
DEFERRED (not a gap): the real-screenshot GO/NO-GO gate — running the judge against ACTUAL eden-biz
baselines at acceptable precision/recall — is blocked until Phase-1 baselines exist (the
local-integration demo currently squats :8091 with a different JWT seed). That gate decides whether
Track B (DevFlow generalization: ui-evaluator agent, /devflow:ui-eval skill, verifier Step 8c,
bootstrap scaffolder, planner defaults) proceeds. Document only; do not block on it now.
</output>

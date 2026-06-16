---
objective: UI-VISUAL-EVAL-JUDGE
trd: "01"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-fixtures.cjs
autonomous: true
fixture_strategy: generators
must_haves:
  truths:
    - "`node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs` exits 0 with all enumerated cases green, using a FAKE injected vision judge (no network)."
    - "validateJudgeResult accepts a valid Shape-C object and rejects: missing required field, out-of-enum defect.type, out-of-enum severity, non-boolean is_broken."
    - "aggregateVotes returns a majority verdict over N samples: unanimous-broken, unanimous-ok, split→review, even tie→review."
    - "scoreState gates on HIGH severity only: majority is_broken AND >=1 high → fail; medium/low only → pass with advisories; single dissent → review."
    - "scoreRun rolls up per-state verdicts into a run verdict honoring the flake budget: all pass→pass; reviews within budget→pass-with-reviews; persistent fail→fail."
    - "loadManifest parses valid JSON; throws on invalid JSON; throws on a structurally-bad manifest."
    - "callVisionJudge invokes its injected judge fn, parses the returned Shape-C, and validates it — a fake returning canned valid JSON yields a parsed JudgeResult; a fake returning malformed output is rejected by validateJudgeResult."
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
      provides: "loadManifest, validateJudgeResult, aggregateVotes, scoreState, scoreRun, callVisionJudge (impure/injectable), DEFECT_TYPES, SEVERITIES"
    - path: plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs
      provides: "node --test suite covering the full test-list (validateJudgeResult x5, aggregateVotes x4, scoreState x4, scoreRun x3, loadManifest x3, callVisionJudge-with-fake x2)"
    - path: plugins/devflow/devflow/bin/lib/flutter-ui-eval-fixtures.cjs
      provides: "makeCaptureResult, makeJudgeResult, makeFakeVisionJudge hand-built factory generators"
  wiring:
    - "flutter-ui-eval.test.cjs requires flutter-ui-eval.cjs and flutter-ui-eval-fixtures.cjs (RED until the engine exists)."
    - "callVisionJudge accepts an injected judge fn (default impl is the real Claude vision call, wired in TRD-02); tests pass makeFakeVisionJudge() so zero network calls occur."
  key_links:
    - "callVisionJudge → validateJudgeResult: every judge output (real or fake) flows through the Shape-C schema guard before scoreState consumes it."
    - "aggregateVotes → scoreState → scoreRun: the deterministic gating pipeline that turns N raw samples into a run verdict."
---

# TRD-01: Pure VLM-judge scoring engine + node --test suite (flutter-ui-eval.cjs)

<objective>
Build Layer-2 of the UI visual-eval contract: a pure, zero-dependency, unit-testable
scoring engine at `plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs`, modeled on the
existing `flutter-state-coverage.cjs` (same module shape, export style, and HIGH-severity-only
gating confidence model). The engine consumes CaptureResult records (Shape B) and, via an
INJECTABLE vision-judge boundary, produces validated JudgeResults (Shape C) and a gating
scoreRun rollup. Everything except `callVisionJudge` is pure and offline-testable. This TRD
ships the engine + its node --test suite + hand-built fixture generators. The real Claude
vision API default implementation and df-tools CLI wiring are TRD-02.

Resolved intent: kind=plugin, work=feature (inherited), tdd=strict (OBJECTIVE.md override),
depth=comprehensive, fixture_strategy=generators. Constraints honored: no_llm_test_data
(hand-built generators only), no_property_based_default (descriptive named cases), no_gherkin_layer.
</objective>

<context>
- TDD is STRICT (Iron Law): no production fn body without a failing test first. Per the user's
  global CLAUDE.md TDD Playbook: test-list-first (below), one test at a time RED→GREEN→REFACTOR,
  hand-built fixture GENERATORS (never LLM-generated test data), fixture-builder task ahead of
  the first behavior test. Outside-in ordering within the test list (the public scoring pipeline
  scoreRun/scoreState first as the outermost observable layer, then the helpers it composes).
- Repo conventions (CLAUDE.md): CommonJS `.cjs`; synchronous `fs`; test files adjacent to source
  with `.test.cjs`; `node --test` runner; commit type `{type}({scope}): {desc}`.
- The engine is the standalone Phase-2 deliverable — exercised via `node` only. NO DevFlow
  agent/skill/planner dependency, NO real API call in tests/verification.
</context>

<embedded_context>
<codebase_examples>
Model `flutter-ui-eval.cjs` on `plugins/devflow/devflow/bin/lib/flutter-state-coverage.cjs`. Mirror:

1. Header doc-block listing Exports + an "Anti-patterns avoided" list.
2. `'use strict';` + `const { output } = require('./helpers.cjs');` (output is only used by the
   df-tools handler in TRD-02 — TRD-01's pure fns return values, they do NOT call output()).
3. Pure functions return structured objects; the HIGH-severity-only gating model mirrors
   verifyCoverage: HIGH miss/defect → blocker (fail); MEDIUM/LOW → advisory (pass/review).
4. `module.exports = { ... }` named export object at the bottom.

Confidence model to mirror (from flutter-state-coverage.cjs verifyCoverage, lines ~140-207):
- Aggregate status derives from blocker count: all-blockers → worst status; some → middle; none → best.
- For scoreState: high-severity defect with majority is_broken → 'fail'; only medium/low → 'pass'
  (defects recorded as advisories); a single dissenting sample → 'review'.

Test file shape — mirror `flutter-state-coverage.test.cjs` (lines 1-40):
- `const test = require('node:test'); const assert = require('node:assert');`
- `const { loadManifest, validateJudgeResult, aggregateVotes, scoreState, scoreRun, callVisionJudge } = require('./flutter-ui-eval.cjs');`
- `const { makeCaptureResult, makeJudgeResult, makeFakeVisionJudge } = require('./flutter-ui-eval-fixtures.cjs');`
- `test.describe('<fn> (...)', () => { test('Case X1 — ...', () => { ... assert.strictEqual(...) }); });`

Fixture-generator module shape — mirror the existing `__fixtures__/`-adjacent `*-fixtures.cjs`
modules (e.g. `intent-fixtures.cjs`): a `.cjs` exporting hand-built factory functions with
sensible defaults + an overrides param, e.g. `makeJudgeResult(overrides = {})`.
</codebase_examples>

<contract_shapes>
CaptureResult (Shape B) JSON — engine INPUT, do not modify (Phase-1 shipped):
  { state_id, surface, screenshot_path, viewport, captured_at,
    metadata: { console_errors, flutter_view_bbox, fonts_ready, expected } }
  `metadata.expected` (prose) is the judge ANCHOR.

JudgeResult (Shape C) — engine OUTPUT:
  { state_id, is_broken, defects: [ { type, severity, region, rationale } ],
    matches_expected, confidence, samples, votes }

DEFECT_TYPES enum: overflow | blank_empty | misalignment | contrast_legibility |
                   broken_layout | overlap_zindex | loading_stuck
SEVERITIES enum:   low | medium | high

Manifest: JSON (NOT YAML — no YAML dep). loadManifest reads + JSON.parses + shape-guards.
</contract_shapes>

<anti_patterns>
- Do NOT add any npm dependency (no YAML lib, no test lib) — node:test + node:assert only.
- Do NOT make any real network/API call in TRD-01. callVisionJudge takes an INJECTED judge fn;
  the default real impl lands in TRD-02. Tests inject makeFakeVisionJudge().
- Do NOT use LLM-generated sample data. Use the hand-built generators in flutter-ui-eval-fixtures.cjs.
- Do NOT block on MEDIUM/LOW severity — only HIGH gates (mirror flutter-state-coverage confidence model).
- Do NOT modify the eden-biz worktree or the installed ~/.claude plugin mirror — only this source worktree.
- Do NOT write the engine before the failing test exists (Iron Law).
</anti_patterns>
</embedded_context>

## Test list (write BEFORE any engine code — required by intent test_list_first=required)

Outermost-observable → innermost ordering. Each is a descriptive named case (no Gherkin,
no property-based). Fixtures from generators only.

- **scoreRun** (run-level rollup — outermost):
  - R1 all states pass → run verdict `pass`.
  - R2 reviews within flake budget → `pass-with-reviews`.
  - R3 a persistent `fail` state → run verdict `fail`.
- **scoreState** (per-state gate):
  - S1 majority is_broken AND >=1 high-severity defect → `fail`.
  - S2 defects present but only medium/low severity → `pass` (defects as advisories).
  - S3 single dissenting sample (split vote) → `review`.
  - S4 unanimous not-broken / matches_expected → `pass`, no advisories.
- **aggregateVotes** (N-sample majority):
  - V1 unanimous is_broken:true → broken verdict.
  - V2 unanimous is_broken:false → ok verdict.
  - V3 split (e.g. 2 broken / 1 ok over N=3) → carries the majority but flags review-worthy.
  - V4 even tie → `review` (no false-confident majority).
- **loadManifest**:
  - L1 valid JSON manifest → parsed object.
  - L2 invalid JSON (syntax error) → throws.
  - L3 structurally-bad manifest (wrong shape) → throws.
- **validateJudgeResult** (Shape-C guard):
  - G1 fully valid Shape-C object → ok/true.
  - G2 missing required field (e.g. no `is_broken`) → rejected.
  - G3 defect.type outside the taxonomy enum → rejected.
  - G4 severity outside {low,medium,high} → rejected.
  - G5 non-boolean is_broken → rejected.
- **callVisionJudge** (impure boundary, fake-injected):
  - C1 injected fake returns canned valid Shape-C → engine parses + validateJudgeResult passes → JudgeResult returned.
  - C2 injected fake returns malformed output → validateJudgeResult rejects (engine surfaces the rejection, no crash).

## Environment quirks (read before editing — known executor footguns)

- The DevFlow executor's Edit/Write may be sandboxed to a FOREIGN agent worktree. Write files
  via `Bash` heredoc to ABSOLUTE target paths under
  `/Users/markemerson/Source/devflow-claude-ui-eval/...` and confirm with `git status` after each write.
- Commit from the repo root via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
  Raw `git commit` is hook-blocked. Ensure the index is clean / pass explicit --files so commits don't bleed.
- Keep each task < 15 min wall-clock (subagent ceiling). Commit at small increments.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 — Fixture generators (makeCaptureResult / makeJudgeResult / makeFakeVisionJudge)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-eval-fixtures.cjs</files>
  <action>
Create the hand-built fixture-generator module FIRST (fixture work precedes the first behavior
test, per the TDD playbook). NO LLM-generated data — these are factory functions with defaults
+ an overrides param, mirroring the existing `*-fixtures.cjs` modules in `__fixtures__/`'s siblings.

Export three builders:
- `makeCaptureResult(overrides = {})` → a valid Shape-B object. Defaults: state_id 'dashboard.populated',
  surface 'web', screenshot_path './fixtures/x.png', viewport {width:1280,height:800}, captured_at
  a fixed ISO string, metadata:{ console_errors:[], flutter_view_bbox:{...}, fonts_ready:true,
  expected:'Dashboard shows a populated revenue chart and a non-empty table.' }. Deep-merge overrides.
- `makeJudgeResult(overrides = {})` → a valid Shape-C object. Defaults: is_broken:false, defects:[],
  matches_expected:true, confidence:0.9, samples:3, votes:{broken:0,ok:3}. Deep-merge overrides so
  tests can flip is_broken / inject defects / set severity / break a field for the negative cases.
- `makeFakeVisionJudge(scriptedReturn)` → returns a fn matching the injected-judge interface that,
  when called by callVisionJudge, returns `scriptedReturn` (a canned Shape-C object for C1, or a
  malformed value like `{ garbage: true }` / a non-object for C2). It must NOT touch the network.

Keep it CommonJS, `'use strict';`, `module.exports = { makeCaptureResult, makeJudgeResult, makeFakeVisionJudge };`.

# PATTERN: see intent-fixtures.cjs export style and flutter-state-coverage __fixtures__ siblings.
# CRITICAL: no network, no LLM data — deterministic hand-built objects only.
  </action>
  <verify>node -e "const f=require('/Users/markemerson/Source/devflow-claude-ui-eval/plugins/devflow/devflow/bin/lib/flutter-ui-eval-fixtures.cjs'); console.log(typeof f.makeCaptureResult, typeof f.makeJudgeResult, typeof f.makeFakeVisionJudge)" → prints "function function function"</verify>
  <done>flutter-ui-eval-fixtures.cjs exists, requires cleanly, exports the three builders. Committed: `test(ui-eval): add flutter-ui-eval fixture generators`.</done>
  <recovery>If require fails, check for a syntax error / wrong module.exports shape; the file is standalone with no deps so failures are local.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2 — RED: full test-list suite (failing import) then GREEN: scoring engine pure fns</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs</files>
  <action>
RED first: write `flutter-ui-eval.test.cjs` covering the ENTIRE Test list above (R1-3, S1-4,
V1-4, L1-3, G1-5 — callVisionJudge C1/C2 are Task 3). Import from `./flutter-ui-eval.cjs` (which
does not yet exist → RED) and `./flutter-ui-eval-fixtures.cjs`. Use node:test describe/test +
node:assert. One logical group per fn. Confirm RED: `node --test flutter-ui-eval.test.cjs` fails
on the missing module.

GREEN: create `flutter-ui-eval.cjs`, modeled on flutter-state-coverage.cjs, implementing the
PURE fns (callVisionJudge stub-only this task — a thrown 'not implemented in TRD-01' or accept-and-
delegate body fleshed out in Task 3). Implement:
- `const DEFECT_TYPES = ['overflow','blank_empty','misalignment','contrast_legibility','broken_layout','overlap_zindex','loading_stuck'];`
- `const SEVERITIES = ['low','medium','high'];`
- `loadManifest(p)` — fs.readFileSync + JSON.parse (throws on invalid JSON naturally); then shape-guard
  (must be an object with the expected manifest keys) → throw on bad shape.
- `validateJudgeResult(obj)` — guard required fields (state_id, is_broken bool, defects array,
  matches_expected, confidence, samples, votes); each defect.type ∈ DEFECT_TYPES, severity ∈ SEVERITIES;
  is_broken strictly boolean. Return a structured {valid, errors[]} (or boolean — match what the tests assert).
- `aggregateVotes(samples)` — majority over N; even tie → review-flag; return {is_broken, votes:{broken,ok}, split:boolean}.
- `scoreState({judgeResult|samples, thresholds})` → 'pass'|'fail'|'review' with advisories[] for
  medium/low defects. fail ONLY on majority is_broken AND >=1 high; single dissent/split → review.
- `scoreRun(results)` → { verdict:'pass'|'pass-with-reviews'|'fail', counts, reviews[], fails[] } honoring
  a flake budget (N reviews tolerated; any persistent fail → fail).
- `module.exports = { loadManifest, validateJudgeResult, aggregateVotes, scoreState, scoreRun, callVisionJudge, DEFECT_TYPES, SEVERITIES };`

Iterate one test at a time to GREEN. Do NOT batch implementation ahead of tests.

# GOTCHA: JSON.parse already throws on invalid JSON — L2 just asserts it throws; L3 needs an explicit shape guard.
# PATTERN: HIGH-only gating mirrors verifyCoverage in flutter-state-coverage.cjs.
# CRITICAL: callVisionJudge real impl is TRD-02; here it stays a thin injectable boundary (no network).
  </action>
  <verify>node --test /Users/markemerson/Source/devflow-claude-ui-eval/plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs → exit 0, all non-callVisionJudge cases (R/S/V/L/G) pass</verify>
  <done>Pure-fn suite green. Two atomic commits: `test(ui-eval): RED scoring-engine test list` then `feat(ui-eval): pure scoring engine (loadManifest/validate/aggregate/scoreState/scoreRun)`.</done>
  <recovery>If a case is hard to green, re-read the corresponding flutter-state-coverage gating logic; keep the fn pure (no I/O beyond loadManifest's readFileSync). If RED never appears, the module already exists — stop and inspect.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3 — callVisionJudge injectable boundary (fake-judge tests C1/C2)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs</files>
  <action>
RED: add cases C1 + C2 to the test file using makeFakeVisionJudge(). The signature is the
INJECTABLE boundary: `callVisionJudge({ capture, expected, judge })` (or equivalent) where `judge`
is the injected fn (default = the real Claude vision call, wired in TRD-02; here always injected).

GREEN: implement callVisionJudge so it:
1. Builds the judge inputs from the CaptureResult + its metadata.expected anchor + the taxonomy
   (the prompt-construction detail is fleshed out in TRD-02's real impl; in TRD-01 it just passes
   the assembled request to the injected `judge` fn).
2. Calls the injected `judge` fn (NO network — the fake returns canned output).
3. Passes the returned value through `validateJudgeResult`.
4. C1: fake returns canned valid Shape-C → returns the parsed/validated JudgeResult.
5. C2: fake returns malformed output → validateJudgeResult rejects; surface the rejection
   (throw or return {valid:false,...} — match the test assertion), no crash.

# CRITICAL: keep the network call OUT of TRD-01 entirely — the injected judge is the only path.
# PATTERN: this is the single impure boundary, isolated so the rest is offline-TDD-able.
  </action>
  <verify>node --test /Users/markemerson/Source/devflow-claude-ui-eval/plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs → exit 0, ALL cases including C1/C2 green; grep confirms no http/fetch/anthropic import in flutter-ui-eval.cjs</verify>
  <done>Full suite green with zero network. Two atomic commits: `test(ui-eval): RED callVisionJudge fake-judge cases` then `feat(ui-eval): injectable callVisionJudge boundary`.</done>
  <recovery>If a test accidentally hits the network, the injected fake isn't being used — confirm callVisionJudge calls the passed `judge` and has no default real impl yet (that's TRD-02).</recovery>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs` → exit 0, every test-list case green, fake judge only.
- `node --test plugins/devflow/devflow/bin/lib/*.test.cjs` (or `npm test`) still green (no regression to flutter-state-coverage / dogfood suites).
- `grep -nE "require\('https?'\)|fetch\(|anthropic|api\.anthropic" plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs` → no matches (no network in TRD-01).
- No new entries in package.json dependencies.
</verification>

<success_criteria>
- flutter-ui-eval.cjs exports the six engine fns + DEFECT_TYPES + SEVERITIES, modeled on flutter-state-coverage.cjs.
- The node --test suite covers the full enumerated test list and exits 0 with a fake injected judge.
- Fixture generators (no LLM data) supply all test inputs.
- Zero network calls anywhere in TRD-01; callVisionJudge is a thin injectable boundary.
- Atomic test:→feat: commit pairs per task.
</success_criteria>

<output>
Engine + suite + generators committed on feat/ui-visual-eval. TRD-02 wires the real default
vision-judge impl, the df-tools CLI arms, the model-profile row, and the dogfood fixtures/rollup.
</output>

---
objective: UI-VISUAL-EVAL-DEVFLOW
trd: 03
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/agents/planner.md
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs
requirements: [P5]
autonomous: true
allow_generated_test_data: false
use_property_based: false
use_gherkin: false

must_haves:
  truths:
    - "When flutter-ui scope is detected for an objective (type:ui + stack:flutter), the planner auto-emits a ui-eval state-matrix manifest stub + the verifier visual gate — parallel to how flutter-state-coverage (REQ-10-05) is auto-required."
    - "A synthetic type:ui / stack:flutter objective yields a plan that CARRIES the ui-eval manifest stub + the visual gate marker."
    - "A non-ui objective does NOT get the ui-eval manifest stub or the visual gate."
    - "planner.md documents the ui-eval auto-emit inside the existing Flutter UI scope sub-procedure (the same block that already invokes detect flutter-ui-scope)."
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.cjs
      provides: "Pure decision fn: given flutter-ui-scope detection result, decide whether to emit the ui-eval manifest stub + visual gate, and produce the stub content"
    - path: plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs
      provides: "node --test suite: ui objective → emit; non-ui objective → no-emit (hand-built fixtures)"
    - path: plugins/devflow/agents/planner.md
      provides: "Auto-emit step appended to the Flutter UI scope sub-procedure"
  key_links:
    - from: flutter-ui-eval-planner-default.cjs
      to: flutter-ui-scope.cjs detectFlutterUIScope result shape
      via: "consumes { detected, platform, state_management } — the same object the planner already gets at planner.md:967"
    - from: planner.md Flutter UI scope sub-procedure
      to: ui-eval manifest stub + visual gate
      via: "new numbered step '6. Auto-emit ui-eval visual gate' inside the DETECTED==true branch"
---

<objective>
P5 — Planner / build defaults: new `type:ui` / `stack:flutter` objectives get visual eval BY DEFAULT.
Extend the planner so it auto-emits a ui-eval state-matrix manifest stub + the verifier visual gate
for every detected Flutter UI objective, exactly parallel to how `flutter-state-coverage` (REQ-10-05)
is already auto-required in the Flutter UI scope sub-procedure. A non-ui objective gets neither.

Purpose: visual eval is opt-out, not opt-in — the gate is born with the plan.
Output: a pure decision module (TDD'd) + a prose edit to planner.md's existing scope sub-procedure.
</objective>

<context>
**TDD applies (per OBJECTIVE.md + global CLAUDE.md TDD playbook).** `type: tdd`: test-list-first,
RED→GREEN atomic commits, hand-built fixtures (habit 4 — no LLM-generated data), one test at a time.
Zero new npm deps — `node --test` + `node:assert`.

**The decision is unit-testable; the planner prose is not.** The planner.md edit is prose (a new step
in an existing sub-procedure). To make P5 TDD-able per OBJECTIVE.md ("planner-output contains the gate
for a synthetic UI objective"), extract the DECISION into a pure module
`flutter-ui-eval-planner-default.cjs` that the test drives directly: feed it a flutter-ui-scope
detection result, assert it emits (or withholds) the manifest stub + visual-gate marker. The planner.md
prose then references this same decision in its sub-procedure.

**Reuse the existing detection + insertion point.** planner.md ALREADY invokes
`detect flutter-ui-scope "$OBJECTIVE" --raw` at line 967 inside the "Flutter UI scope sub-procedure
(REQ-10-03)" `<step name="break_into_tasks">`, and on `DETECTED==true` sets `type:ui` / `stack:flutter`
/ `platform:[mobile,web]` and requires the state-coverage semantic fields. The P5 auto-emit is a NEW
numbered item appended to that SAME `DETECTED==true` branch — do NOT create a parallel detection path.
The detection result shape is `{ detected, signals, platform?, state_management? }` (flutter-ui-scope.cjs).

**What "emit" means concretely** (mirror state-coverage's parallel):
- a ui-eval manifest STUB referenced from the objective (Shape-A states matrix skeleton: `states[]`,
  per-state `id`/`route`/`data_state`/`expected`) — the same shape the engine + the TRD-02 bootstrap
  scaffold produce. The planner emits a stub path + reminder, not a full hand-authored matrix.
- the verifier VISUAL GATE marker — i.e. the plan declares that verifier Step 8c (TRD-01) will run
  `df-tools verify flutter-ui-eval` on this objective. In practice: a `ui_eval` block / note in the
  type:ui TRD frontmatter or must_haves that the verifier keys on, parallel to how state-coverage
  fields are declared.

**KNOWN ENV QUIRK (executor):** Edit/Write may be sandboxed to a foreign worktree. Write via Bash
heredoc to absolute paths under `/Users/markemerson/Source/devflow-claude-ui-eval`; verify with
`git status`; avoid `git checkout` probes; commit from repo root via `df-tools commit --files`
(raw `git commit` hook-blocked).

**CO-MODIFICATION NOTE:** This TRD edits planner.md + two new lib files only. It does NOT touch
df-tools.cjs (TRD-02 owns that) — reuses the EXISTING `detect flutter-ui-scope` arm. No sequencing
needed; wave 1 parallel with TRD-01 and TRD-02.
</context>

## Test list

(Author as `test.describe` blocks BEFORE implementation. Hand-built fixtures only.)

Pure `decideUIEvalDefault({ scope, objective })` (RED first):
- P1 — scope `{ detected:true, platform:['mobile','web'], state_management:'riverpod' }` → returns
  `{ emit:true, manifest_stub:{...}, visual_gate:true }`; `manifest_stub` parses as a Shape-A matrix
  (object with a `states` array).
- P2 — scope `{ detected:false }` (non-ui objective) → returns `{ emit:false }`; NO manifest_stub,
  `visual_gate:false`.
- P3 — scope `{ detected:false, error:'no inputs' }` (failsafe) → `{ emit:false }`, never throws.
- P4 — emitted `manifest_stub.states` carry the required Shape-A per-state keys (`id`, `route`,
  `data_state`, `expected`) on the example/seed state (the planner authors real states later; the stub
  proves the shape).
- P5 — emitted result includes a `visual_gate` truthy marker the verifier keys on (the
  `df-tools verify flutter-ui-eval` declaration), present iff `emit:true`.

(Outside-in: the observable behavior — "ui objective gets the gate, non-ui doesn't" (P1/P2) — is the
outermost case; P3-P5 drill into failsafe + shape. Pure core, no I/O, no network.)

<file_tree>
plugins/devflow/
├── agents/
│   └── planner.md                                       ← MODIFY (append auto-emit to scope sub-procedure)
└── devflow/bin/lib/
    ├── flutter-ui-eval-planner-default.cjs              ← CREATE (pure decision fn)
    └── flutter-ui-eval-planner-default.test.cjs         ← CREATE (node --test, hand-built fixtures)
</file_tree>

<embedded_context>

<codebase_examples>
<!-- Detection result shape consumed (flutter-ui-scope.cjs detectFlutterUIScope): -->
// { detected: boolean, signals: {...}, platform?: string[], state_management?: string, error?: string }

<!-- Shape-A manifest state keys (from the engine fixture manifest.json): -->
// states[i]: { state_id|id, route, data_state, viewport, expected, capture_path?, screenshot_path? }

<!-- The planner insertion point — planner.md "Flutter UI scope sub-procedure (REQ-10-03)" inside
     <step name="break_into_tasks"> (~L962-1016). The DETECTED==true branch currently:
       1. sets type:ui + stack:flutter + platform:[mobile,web]
       2. requires states/tests.widget/tests.integration/tests.maestro semantic fields
       3. PLANNING INCONCLUSIVE on missing fields
     P5 adds a NEW item to this same branch (e.g. after item 2, before INCONCLUSIVE):
       "N. Auto-emit ui-eval visual gate: when detected, emit a ui-eval manifest stub (Shape-A states
        matrix) + declare the verifier visual gate (Step 8c will run `df-tools verify flutter-ui-eval`),
        parallel to the state-coverage auto-require. See flutter-ui-eval-planner-default.cjs." -->

<!-- Test fixture shape — mirror flutter-ui-scope.test.cjs (node:test + node:assert, hand-built objects). -->
</codebase_examples>

<anti_patterns>
- Do NOT add a second/parallel `detect flutter-ui-scope` invocation in planner.md — extend the EXISTING
  DETECTED==true branch (line ~967 onward).
- Do NOT make the emit unconditional — it MUST be gated on `scope.detected === true` (P2/P3 prove non-ui
  gets nothing).
- Do NOT hand-author a full state matrix in the stub — emit a Shape-A SKELETON with one example state;
  the planner fills real states from the objective. The stub proves the shape, not the content.
- Do NOT generate test fixtures with the model — hand-build (habit 4 / `allow_generated_test_data:false`).
- Do NOT edit df-tools.cjs — reuse the existing detect arm (TRD-02 owns df-tools.cjs).
- Do NOT throw on a failsafe `{ detected:false, error }` — return `{ emit:false }` (P3).
</anti_patterns>

<error_recovery>
- If the planner.md edit lands outside the Flutter UI scope sub-procedure, `git restore` and re-anchor
  on the literal "## Flutter UI scope sub-procedure (REQ-10-03)" heading / the `If DETECTED == "true":`
  list inside `<step name="break_into_tasks">`.
- If P2/P3 fail (emit on non-ui), the gate condition is wrong — assert `scope.detected === true` only.
- Sandbox quirk: re-apply planner.md edit via heredoc; confirm with `git diff plugins/devflow/agents/planner.md`.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>RED+GREEN: pure decideUIEvalDefault decision module (cases P1-P5)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.cjs</files>
  <action>
RED: create `flutter-ui-eval-planner-default.test.cjs` with cases P1-P5 against an imported
`decideUIEvalDefault` that does not yet exist. Hand-build the scope fixtures inline (ui-detected,
non-detected, failsafe-error). Assert emit/no-emit, manifest_stub shape (parses, `states` array,
example state has id/route/data_state/expected), and the visual_gate marker presence iff emit.
Run `node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs` → MUST fail.
Commit: `test(UI-VISUAL-EVAL-DEVFLOW-03): add failing tests for decideUIEvalDefault (P1-P5)`.

GREEN: create `flutter-ui-eval-planner-default.cjs`. Implement pure
`decideUIEvalDefault({ scope, objective })`:
  - if `!scope || scope.detected !== true` → return `{ emit:false, visual_gate:false }` (P2/P3, no throw).
  - else return `{ emit:true, visual_gate:true, manifest_stub: { objective: (objective||'<TODO>'),
    samples:3, flakeBudget:1, states:[ { id:'<state-id>', route:'/<route>', data_state:'populated',
    expected:'<describe correct appearance>' } ] } }`.
  - export `decideUIEvalDefault` (+ any helper). No fs, no network — pure.
Run the suite → P1-P5 pass.
Commit: `feat(UI-VISUAL-EVAL-DEVFLOW-03): implement decideUIEvalDefault planner-default decision`.

# PATTERN: mirror flutter-ui-scope.cjs module/test style (node:test, hand-built fixtures).
# CRITICAL: pure fn, gated on scope.detected===true; failsafe returns emit:false (never throws).
# GOTCHA: write via heredoc to absolute paths (sandbox quirk); verify git status.
  </action>
  <verify>
RED proof: `git log --oneline | grep -q 'test(UI-VISUAL-EVAL-DEVFLOW-03): add failing'`.
GREEN: `node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs` exits 0 (P1-P5 pass).
`node -e "const {decideUIEvalDefault}=require('./plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.cjs'); const r=decideUIEvalDefault({scope:{detected:true}}); if(!r.emit||!Array.isArray(r.manifest_stub.states)) process.exit(1); const n=decideUIEvalDefault({scope:{detected:false}}); if(n.emit) process.exit(1); console.log('OK')"` prints OK.
  </verify>
  <done>decideUIEvalDefault emits manifest_stub (Shape-A) + visual_gate iff scope.detected===true; non-ui/failsafe returns emit:false without throwing. Two atomic commits (test:→feat:).</done>
  <recovery>If P2/P3 fail, tighten the gate to `scope.detected === true`. If the stub fails the shape assertion, ensure states[0] carries id/route/data_state/expected.</recovery>
</task>

<task type="auto">
  <name>Append ui-eval auto-emit to planner.md Flutter UI scope sub-procedure + commit</name>
  <files>plugins/devflow/agents/planner.md</files>
  <action>
Edit `agents/planner.md` — add ONE new numbered item to the EXISTING "Flutter UI scope sub-procedure
(REQ-10-03)" inside `<step name="break_into_tasks">` (~L962-1016), inside the `If DETECTED == "true":`
branch, after the state-coverage semantic-field requirement (item 2) and before the PLANNING
INCONCLUSIVE item (item 3). Renumber the subsequent items in THAT list only.

New item content (prose, parallel to the state-coverage auto-require):
  "N. **Auto-emit the ui-eval visual gate (P5).** When flutter-ui scope is detected, auto-emit a
   ui-eval state-matrix manifest stub (Shape-A: a `states` array with per-state `id`/`route`/
   `data_state`/`expected`) referenced from the objective, AND declare the verifier visual gate —
   i.e. record that verifier Step 8c will run `df-tools verify flutter-ui-eval \"$OBJECTIVE\" --raw`
   on this objective. This is exactly parallel to how the state-coverage semantic fields are
   auto-required above; visual eval becomes opt-out, not opt-in. The emit decision is the pure
   `decideUIEvalDefault` in `bin/lib/flutter-ui-eval-planner-default.cjs` (emit iff detected). A
   non-ui objective gets neither stub nor gate."

Commit (prose edit — no test cycle; the decision is tested in Task 1):
  `node ~/.claude/devflow/bin/df-tools.cjs commit "feat(UI-VISUAL-EVAL-DEVFLOW-03): planner auto-emits ui-eval manifest stub + visual gate for type:ui objectives" --files plugins/devflow/agents/planner.md`

# CRITICAL: edit only inside the Flutter UI scope sub-procedure block; do NOT touch other planner steps.
# GOTCHA: keep the INCONCLUSIVE item and item 4/5 (detected=false / failsafe) intact — only insert + renumber within the list.
  </action>
  <verify>
planner.md references the auto-emit + the engine arm:
`grep -q 'Auto-emit the ui-eval visual gate' plugins/devflow/agents/planner.md && grep -q 'verify flutter-ui-eval' plugins/devflow/agents/planner.md && grep -q 'decideUIEvalDefault' plugins/devflow/agents/planner.md`.
Edit stayed in the sub-procedure (the auto-emit line sits between the REQ-10-03 heading and the build_dependency_graph step):
`awk '/Flutter UI scope sub-procedure/{a=NR} /Auto-emit the ui-eval visual gate/{b=NR} /<step name="build_dependency_graph">/{c=NR} END{exit !(b>a && b<c)}' plugins/devflow/agents/planner.md`.
File parses: `head -1 plugins/devflow/agents/planner.md | grep -q '^---'`.
  </verify>
  <done>planner.md's Flutter UI scope sub-procedure auto-emits the ui-eval manifest stub + visual gate (referencing decideUIEvalDefault + `df-tools verify flutter-ui-eval`) for detected objectives, parallel to state-coverage; non-ui objectives unchanged. Committed.</done>
  <recovery>If the edit lands outside the sub-procedure, `git restore plugins/devflow/agents/planner.md` and re-anchor on "## Flutter UI scope sub-procedure (REQ-10-03)". If sandboxed, re-apply via heredoc; confirm with git diff.</recovery>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs` → exit 0, P1-P5 pass.
- planner.md documents the auto-emit inside the existing scope sub-procedure, references decideUIEvalDefault + `df-tools verify flutter-ui-eval`.
- `npm test` → no regression vs baseline.
- RED→GREEN evidence: `test:` commit precedes `feat:` commit in `git log`.
</verification>

<validation_gates>
```bash
node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs
grep -q 'Auto-emit the ui-eval visual gate' plugins/devflow/agents/planner.md
npm test
```
</validation_gates>

<success_criteria>
- [ ] Test list authored as describe blocks BEFORE implementation (test-list-first)
- [ ] decideUIEvalDefault pure; emits iff scope.detected===true (P1); non-ui/failsafe no-emit (P2/P3)
- [ ] Emitted manifest_stub is a valid Shape-A matrix with required per-state keys (P4); visual_gate marker present iff emit (P5)
- [ ] planner.md auto-emit appended to the EXISTING Flutter UI scope sub-procedure (no parallel detection path)
- [ ] References decideUIEvalDefault + `df-tools verify flutter-ui-eval`; parallel to state-coverage auto-require
- [ ] Hand-built fixtures only; zero new npm deps
- [ ] RED→GREEN atomic commits; npm test green; df-tools.cjs NOT touched (TRD-02 owns it)
</success_criteria>

<output>
Append to SUMMARY.md: the decideUIEvalDefault API + emit/no-emit contract, the planner.md insertion
point, and confirmation no df-tools.cjs edit was made (reused existing detect arm).
</output>

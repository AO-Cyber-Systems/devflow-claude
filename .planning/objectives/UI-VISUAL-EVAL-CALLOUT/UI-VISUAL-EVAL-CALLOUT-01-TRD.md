---
objective: UI-VISUAL-EVAL-CALLOUT
trd: "01"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.cjs
  - plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs
  - plugins/devflow/agents/planner.md
  - plugins/devflow/devflow/workflows/plan-objective.md
  - plugins/devflow/devflow/workflows/build.md
autonomous: true
must_haves:
  truths:
    - "decideUIEvalDefault, when emit:true, ALSO returns a non-empty `callout` string (human-readable, names the visual-eval gate + that it's auto-required for the detected type:ui/stack:flutter objective) and a `tasks` array of {subject,description} descriptors (at least: author the ui_eval state-matrix manifest; run the /devflow:ui-eval visual gate). When emit:false → no callout, no tasks (or empty)."
    - "node --test flutter-ui-eval-planner-default.test.cjs exits 0 with the new callout/tasks cases green (and the existing P1-P5 cases still green)."
    - "planner.md instructs: when decideUIEvalDefault.emit, write a VISIBLE `## Visual-Eval Gate (auto-required)` call-out section into the plan output (so it is a reviewable artifact, not silent)."
    - "plan-objective.md AND build.md instruct: when the planner reported a visual-eval gate, (a) surface the callout line in the Next Up / completion block, and (b) create session tasks via TaskCreate for the visual-eval steps."
  artifacts:
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs
---

# TRD 01 — Make the auto-emitted visual-eval gate an EXPLICIT call-out + session tasks

<objective>
P5 auto-injects the ui-eval gate for type:ui/stack:flutter objectives, but SILENTLY. Make it
visible: decideUIEvalDefault produces a human-readable callout + task descriptors; the planner
writes a reviewable "Visual-Eval Gate" section into the plan; the plan-objective/build skills
surface the callout in Next Up and create tracked session tasks. Pure-logic change is TDD'd; the
planner/workflow edits are prose (DevFlow exception).
</objective>

<context>
Current decideUIEvalDefault (bin/lib/flutter-ui-eval-planner-default.cjs) returns
{emit, visual_gate, manifest_stub} on detect, {emit:false, visual_gate:false} otherwise. Extend
the emit branch ADDITIVELY — do not change existing keys (P5 tests + planner.md depend on them).
planner.md auto-emit lives at the "## Flutter UI scope sub-procedure" item 3 (~L995). The plan
output / offer_next Next-Up block + COMPLETE banner live in the SOURCE workflows
plugins/devflow/devflow/workflows/{plan-objective,build}.md (NOT the ~/.claude mirror). The skills
run in the MAIN session, so they (not the planner subagent) can call TaskCreate.
</context>

<anti_patterns>
- Do NOT change/remove existing decideUIEvalDefault keys (emit/visual_gate/manifest_stub) — additive only.
- Do NOT edit the ~/.claude/devflow mirror — edit the plugins/devflow SOURCE; the sync hook mirrors it.
- Do NOT add npm deps. No LLM-generated test data — hand-built fixtures.
- Keep the callout terse + factual (it ships in user-facing plan output) — no emoji spam (one 👁 marker max, matching ui-brand status-symbol restraint).
</anti_patterns>

## Test list (decideUIEvalDefault — RED→GREEN, additive)
1. emit case → `callout` is a non-empty string containing "visual" + "/devflow:ui-eval" (or "ui_eval") and naming the objective.
2. emit case → `tasks` is an array with >=2 {subject,description} items: one to author/fill the ui_eval state-matrix manifest, one to run the /devflow:ui-eval visual gate.
3. non-emit case (scope.detected!==true) → no `callout` and no `tasks` (undefined or empty) — and still {emit:false}.
4. existing P1-P5 cases unchanged (emit/visual_gate/manifest_stub still correct).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 — RED→GREEN: decideUIEvalDefault emits callout + tasks (additive)</name>
  <files>plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs, plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.cjs</files>
  <action>
RED: add the 4 test-list cases to the existing test file (hand-built scope/objective fixtures).
GREEN: in the emit branch of decideUIEvalDefault, ADD:
- `callout`: a terse string, e.g. `"👁 Visual-eval gate auto-required for ${objective} (type:ui/stack:flutter detected): a ui_eval state-matrix manifest + the verifier visual step (df-tools verify flutter-ui-eval). Run /devflow:ui-eval after build to judge the rendered UI."`
- `tasks`: `[ { subject: "Author ui_eval state-matrix manifest for ${objective}", description: "Fill flutter/ui_eval/manifests/*.manifest.json states (route × data_state) with expected prose — the visual-eval anchor." }, { subject: "Run /devflow:ui-eval visual gate for ${objective}", description: "Capture + golden-diff + VLM-judge the rendered UI; fail/review surfaces as gaps/notes." } ]`
Keep emit/visual_gate/manifest_stub unchanged. Iterate to green.
  </action>
  <verify>cd /Users/markemerson/Source/devflow-claude-ui-eval && node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs 2>&1 | tail -6</verify>
  <done>All cases green (new callout/tasks + existing P1-P5). Commits: test: then feat(ui-eval): decideUIEvalDefault callout + session-task descriptors.</done>
</task>

<task type="auto">
  <name>Task 2 — planner.md: write a visible "Visual-Eval Gate" call-out into the plan</name>
  <files>plugins/devflow/agents/planner.md</files>
  <action>
At the auto-emit step (~L995, "Auto-emit the ui-eval visual gate (P5)"), append an instruction:
when decideUIEvalDefault returns emit:true, ALSO write a VISIBLE `## Visual-Eval Gate (auto-required)`
section into the plan output (the objective's PLAN/SUMMARY artifact or a clearly-marked block in the
generated TRD) containing the returned `callout` and listing the `tasks` as a checklist — so a human
reviewing the plan sees the gate explicitly, not just the injected manifest stub.
  </action>
  <verify>grep -q "Visual-Eval Gate (auto-required)" plugins/devflow/agents/planner.md && echo OK</verify>
  <done>planner.md emits the explicit call-out section. Commit: docs(ui-eval): planner writes explicit Visual-Eval Gate call-out into plans.</done>
</task>

<task type="auto">
  <name>Task 3 — plan-objective.md + build.md: surface callout in Next Up + create session tasks</name>
  <files>plugins/devflow/devflow/workflows/plan-objective.md, plugins/devflow/devflow/workflows/build.md</files>
  <action>
In BOTH source workflows, at the completion / offer_next (Next Up) step, add: "If the planner
reported a visual-eval gate (decideUIEvalDefault.emit / a `## Visual-Eval Gate` section in the plan),
surface its `callout` as a line in the Next Up / COMPLETE block, AND create tracked session tasks via
TaskCreate for each entry in the gate's `tasks` (e.g. 'Author ui_eval manifest …', 'Run /devflow:ui-eval
gate …') so the visual-eval step is on the session task list and not forgotten." Keep it conditional —
non-UI objectives get neither the line nor the tasks.
  </action>
  <verify>grep -q "Visual-Eval\|visual-eval gate" plugins/devflow/devflow/workflows/plan-objective.md && grep -q "Visual-Eval\|visual-eval gate" plugins/devflow/devflow/workflows/build.md && echo OK</verify>
  <done>Both workflows surface the callout + create session tasks when the gate is on. Commit: docs(ui-eval): plan-objective + build surface visual-eval call-out + session tasks.</done>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/flutter-ui-eval-planner-default.test.cjs` → exit 0, callout/tasks + P1-P5 cases green.
- planner.md contains "Visual-Eval Gate (auto-required)".
- plan-objective.md + build.md both reference the visual-eval call-out + TaskCreate session tasks.
- No npm deps; no edits to the ~/.claude mirror or the eden-biz worktree.
</verification>

---
objective: 10-autonomous-mode-overhaul
trd: 08
type: standard
confidence: high
wave: 4
depends_on: ["10-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/config.cjs
  - plugins/devflow/devflow/bin/lib/config.test.cjs
  - plugins/devflow/devflow/templates/config.json
  - plugins/devflow/devflow/references/auto-behaviors.md
  - plugins/devflow/devflow/workflows/new-project.md
  - plugins/devflow/devflow/workflows/transition.md
  - plugins/devflow/devflow/workflows/complete-milestone.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "require_verification and require_tests no longer exist anywhere in the plugin: not in loadConfig, not in templates/config.json, not in new-project.md, not in auto-behaviors.md (confirmed dead — written but never read)"
    - "loadConfig ignores the dead keys gracefully when present in an existing user config.json (no crash, no warning)"
    - "new-project's interactive config questions are batched: adjacent sequential AskUserQuestion calls collapsed into single calls of up to 4 questions"
    - "transition.md and complete-milestone.md auto-continue branches fire for mode autonomous as well as yolo (pure-stamp confirmations dropped in autonomous mode)"
    - "Scope-adjustment stops, destructive-action confirmations (safety.always_confirm_destructive), and discuss-objective design loops are untouched"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/config.cjs"
      provides: "loadConfig without require_verification/require_tests"
    - path: "plugins/devflow/devflow/bin/lib/config.test.cjs"
      provides: "regression tests: dead keys absent from return, legacy configs with dead keys load fine"
    - path: "plugins/devflow/devflow/workflows/new-project.md"
      provides: "batched question flow + gates block without dead keys"
    - path: "plugins/devflow/devflow/workflows/transition.md"
      provides: "autonomous auto-continue parity with yolo"
    - path: "plugins/devflow/devflow/workflows/complete-milestone.md"
      provides: "autonomous auto-continue parity with yolo"
  key_links:
    - from: "transition.md <if mode=\"yolo\"> branches (3 sites)"
      to: "autonomous mode"
      via: "condition extended to yolo OR autonomous"
      pattern: "autonomous"
    - from: "complete-milestone.md yolo branch"
      to: "autonomous mode"
      via: "condition extended to yolo OR autonomous"
      pattern: "autonomous"
---

<objective>
Config integrity + de-stamping (locked work item 5). `require_verification`/`require_tests` are written by new-project but read by zero agents, workflows, or hooks (research confirmed; the planning_context binding says "confirmed dead — remove from template and loadConfig()"). Remove them everywhere. Batch new-project's sequential AskUserQuestion calls (≤4 questions per call). Extend yolo's auto-continue stamp-skipping to autonomous mode in transition and complete-milestone, keeping every human-required stop intact.

Purpose: Dead config gates mislead users (research Pitfall 6: setting `require_tests: false` does nothing — TDD posture is governed by the (kind, work) defaults table). Pure-stamp confirmations are exactly the "waiting on mechanics" autonomous mode eliminates.

Output: Wired-or-removed resolved as REMOVED; batched onboarding; autonomous de-stamping.
</objective>

## Test list

(config.cjs portion only — workflow files are markdown, verified by grep)

1. loadConfig return object has NO `require_verification` and NO `require_tests` keys (assert `'require_verification' in cfg === false`)
2. Legacy config.json containing `"gates": {"require_verification": true, "require_tests": true}` → loads without crash; dead keys absent from return; all live keys correct
3. Legacy flat-form config with top-level `require_tests: false` → ignored silently
4. Defaults path (missing config) → no dead keys in the defaults shape either

<file_tree>
plugins/devflow/devflow/bin/lib/
├── config.cjs                                  ← MODIFY (remove 2 dead keys from defaults + return)
└── config.test.cjs                             ← MODIFY (extend with dead-key regression group)
plugins/devflow/devflow/templates/
└── config.json                                 ← MODIFY (drop gates.require_verification/require_tests)
plugins/devflow/devflow/references/
└── auto-behaviors.md                           ← MODIFY (remove dead-gate documentation)
plugins/devflow/devflow/workflows/
├── new-project.md                              ← MODIFY (batch questions; drop gates lines from config block)
├── transition.md                               ← MODIFY (3 yolo branches → yolo OR autonomous)
└── complete-milestone.md                       ← MODIFY (yolo branch → yolo OR autonomous)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
@~/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Dead keys in config.cjs (lines 14-15 defaults, 51-52 return) — delete these four lines:**

```javascript
    require_verification: true,
    require_tests: true,
...
      require_verification: get('require_verification', { section: 'workflow', field: 'require_verification' }) ?? defaults.require_verification,
      require_tests: get('require_tests', { section: 'workflow', field: 'require_tests' }) ?? defaults.require_tests,
```

The `get()` helper already ignores unknown keys in parsed JSON — legacy configs need no migration.

**templates/config.json gates block (lines 23-34):** remove ONLY `"require_verification": true,` and `"require_tests": true,` — the remaining confirm_* gate keys stay (they ARE read by workflow `<if>` conditions).

**new-project.md config block (~line 453-457):** remove the `"gates": { "require_verification": true, "require_tests": true }` object from the JSON the workflow writes. Also remove the "Verification: Required..." and "TDD: Enforced..." bullets from the smart-defaults summary (~lines 390-391) ONLY if they reference these config keys — TDD enforcement is real (defaults table), so reword rather than delete: "TDD: governed by project kind/work defaults".

**Yolo branch pattern to extend (transition.md:410, 456, 66; complete-milestone.md:99):**

```markdown
<if mode="yolo">          →    <if mode="yolo" OR="autonomous">
```

Match the file's existing `<if>` attribute style — transition.md:424 uses `<if mode="interactive" OR="custom with gates.confirm_transition true">`, so `OR=` attribute syntax is the established convention.

**AskUserQuestion batching precedent:** new-project.md Step 2a already batches 3 questions in ONE call — that is the model. Sites to audit: lines ~70, ~94, ~129 (early flow), ~402 (Step 5 — already one call with 3 questions), ~483 (Step 6 research question — single-question call immediately following Step 5). Minimum required change: fold the Step 6 research question into the Step 5 batch as question 4 when the interactive path runs (4 questions = the locked cap), and collapse any remaining adjacent single-question calls in the early flow where they are unconditionally sequential. Content-dependent question loops (per-category requirement probing ~line 823) stay sequential — their later questions depend on earlier answers.
</codebase_examples>

<anti_patterns>
- Do NOT remove confirm_* gate keys or `safety.always_confirm_destructive` — only the two dead keys die.
- Do NOT batch questions whose content depends on a prior answer (the follow-up probing loops) — the locked constraint is "batch up to 4 per call", not "batch everything".
- Do NOT auto-continue scope-adjustment or destructive paths in autonomous mode — de-stamp ONLY pure confirmations ("yes/proceed" stamps where no information is exchanged).
- Do NOT touch the workflow.verifier_checkpoints/decision_queue keys added by 10-01 in templates/config.json.
- No port 8080 anywhere.
</anti_patterns>

<error_recovery>
- If grep reveals additional readers of require_verification/require_tests that research missed (e.g., a skill added since June audit), STOP removal for that key and wire it instead — the locked decision is "wire them in or remove them"; removal is conditional on dead-ness. Re-verify with: `grep -rn "require_verification\|require_tests" plugins/ --include="*.md" --include="*.js" --include="*.cjs" --include="*.json"` before deleting.
</error_recovery>

</embedded_context>

<gotchas>
- transition.md has THREE `<if mode="yolo">` sites (lines 66, 410, 456) — all three are pure-stamp auto-continues; extend all three.
- complete-milestone.md line 99 yolo branch auto-approves "Milestone scope verification" — that one shows a breakdown summary, no information exchanged → de-stamp. The "Proceed anyway / Run audit / Abort" gap decision earlier in the file (~line 85) involves real judgment → leave interactive in all modes (or park via decision queue in a future objective — out of scope here).
- new-project in autonomous mode: Step 5 is already skipped in auto mode ("If auto mode: Skip — config was collected in Step 2a") — the batching work targets the interactive/--interactive path.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Remove dead config gates everywhere</name>
  <files>plugins/devflow/devflow/bin/lib/config.test.cjs, plugins/devflow/devflow/bin/lib/config.cjs, plugins/devflow/devflow/templates/config.json, plugins/devflow/devflow/references/auto-behaviors.md, plugins/devflow/devflow/workflows/new-project.md</files>
  <action>
First run the error_recovery grep to confirm dead-ness still holds (expected readers: config.cjs itself, template, new-project.md, auto-behaviors.md — all writers/docs, zero readers).

RED: extend config.test.cjs with the 4-case Test list group ('dead gates removed'). Cases 1 and 4 fail while keys exist. Commit `test(10-08): assert dead config gates removed from loadConfig`.

GREEN: delete the four config.cjs lines; remove the two keys from templates/config.json gates block; remove the dead-gate rows/sentences from auto-behaviors.md; remove the gates object from new-project.md's written config block and reword the smart-defaults bullets per codebase_examples. Commit `feat(10-08): remove dead require_verification/require_tests gates`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/config.test.cjs → green; grep -rn "require_verification\|require_tests" plugins/ → zero matches; node -e JSON.parse on templates/config.json → ok; npm test → no regressions</verify>
  <done>Both dead keys gone from all four files; legacy configs still load</done>
</task>

<task type="auto">
  <name>Batch new-project AskUserQuestion calls</name>
  <files>plugins/devflow/devflow/workflows/new-project.md</files>
  <action>
Audit every AskUserQuestion site (lines ~70, 94, 129, 219-265, 402, 483, 823, 841, 1011). Collapse adjacent unconditionally-sequential single-question calls into batched calls of ≤4 questions with the Step 2a array syntax: minimally, merge Step 6's research question into Step 5's 3-question call (interactive path) as question 4, and merge any early-flow adjacent calls that don't depend on each other's answers. Leave content-dependent loops (probing follow-ups ~219-265, per-category ~823) sequential, with a one-line comment noting why. Note `multiSelect` stays per-question as appropriate. Commit `feat(10-08): batch new-project config questions (≤4 per AskUserQuestion call)`.
  </action>
  <verify>Step 5 interactive block contains one AskUserQuestion call with 4 questions; no two adjacent independent single-question calls remain in the main config flow; grep -c 8080 = 0</verify>
  <done>Interactive onboarding asks batched questions; dependent loops untouched</done>
</task>

<task type="auto">
  <name>Autonomous de-stamping in transition + complete-milestone</name>
  <files>plugins/devflow/devflow/workflows/transition.md, plugins/devflow/devflow/workflows/complete-milestone.md</files>
  <action>
transition.md: change all three `<if mode="yolo">` to `<if mode="yolo" OR="autonomous">` (lines ~66, ~410, ~456) and update their banner text from "⚡ Auto-continuing" to mode-aware wording (keep ⚡). complete-milestone.md: same change at the ~line 99 scope-verification stamp. Confirm by reading surrounding context that each extended site is a pure stamp (no scope adjustment, no destructive action) — the ~line 85 gap decision and any "adjust scope" paths stay interactive. Commit `feat(10-08): autonomous mode skips pure-stamp confirmations`.
  </action>
  <verify>grep -n 'OR="autonomous"' plugins/devflow/devflow/workflows/transition.md returns 3; grep -n 'OR="autonomous"' plugins/devflow/devflow/workflows/complete-milestone.md returns ≥1; grep -n 'always_confirm_destructive' unchanged in both files (if present); npm test no regressions</verify>
  <done>Autonomous runs chain through objective/milestone transitions without stamp prompts; judgment stops preserved</done>
</task>

</tasks>

<verification>
- `grep -rn "require_verification\|require_tests" plugins/` → zero matches
- `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` → green including 10-01's groups
- `npm test` → no regressions
- `grep -rn "8080" <all touched files>` → zero
</verification>

<success_criteria>
- [ ] Dead gates removed (wired-or-removed resolved as removed, dead-ness re-verified first)
- [ ] Questions batched ≤4/call; dependent loops untouched
- [ ] Autonomous = yolo for pure stamps; human judgment stops intact
- [ ] 4 atomic commits
</success_criteria>

<output>
SUMMARY.md in .planning/objectives/10-autonomous-mode-overhaul/ named 10-08-SUMMARY.md
</output>

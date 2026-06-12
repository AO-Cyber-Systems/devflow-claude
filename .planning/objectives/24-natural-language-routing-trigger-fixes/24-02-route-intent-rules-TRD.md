---
objective: 24-natural-language-routing-trigger-fixes
trd: 02
type: standard
wave: 2
depends_on: ["24-01"]
files_modified:
  - plugins/devflow/hooks/route-intent.js
  - plugins/devflow/hooks/route-intent.test.js
  - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
autonomous: true
requirements: [CTX24-D1, CTX24-D2, CTX24-D3, CTX24-D4, CTX24-D5, CTX24-D7, CTX24-D8]
must_haves:
  truths:
    - "matchIntent fires: 'build objective 3'/'build this'/'implement this'/\"let's build\"/'start building' → /devflow:build; 'execute objective 3'/'run objective 3' → /devflow:execute-objective"
    - "matchIntent('add a todo to refactor the parser') returns exactly ['/devflow:todo add']; matchIntent('make a quick pass over the error handling') returns exactly ['/devflow:quick']; matchIntent('Add an objective for caching') returns exactly ['/devflow:objective add'] — BUILD suppressed in all three"
    - "matchIntent returns [] when the prompt contains any OVERRIDE_PHRASE ('just edit the config loader to add a retry', 'skip devflow and fix the bug in the auth flow')"
    - "matchIntent returns [] when .planning/.skill-active exists (no directive injected mid-skill)"
    - "route-intent main() writes .planning/.edit-override when the prompt contains an override phrase, proven end-to-end: route-intent run then gate-edits run (realistic PreToolUse payload) in the same tmp project → gate allows"
    - "All 11 previously-passing fire fixtures and the Q&A/slash-command skip rules still pass unchanged"
  artifacts:
    - "plugins/devflow/hooks/route-intent.js — EXECUTE/TODO/QUICK rules, extended BUILD rule, build-suppression post-filter, override + skill-active suppression, marker write in main()"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs — new FIRE/NO_FIRE fixtures for all locked phrases"
    - "plugins/devflow/hooks/route-intent.test.js — updated skill-set assertion, exclusivity tests, realistic UserPromptSubmit e2e + cross-hook marker e2e"
  key_links:
    - "route-intent.js requires OVERRIDE_PHRASES/hasOverridePhrase/writeEditOverrideMarker from ./lib/edit-override.js (created by TRD 24-01) — no duplicated phrase list"
    - "route-intent.test.js cross-hook e2e spawns ../hooks/gate-edits.js against the marker written by route-intent.js, closing the decision-1 loop"
    - "route-intent.test.js INTENT_MAP skill-set test (line 58) updated to include /devflow:execute-objective, /devflow:todo add, /devflow:quick"
---

<objective>
Fix CONTEXT.md locked decisions 2, 3, 4, 5, 7 (INTENT_MAP part) and the route side of decision 1: the flagship phrases every skill advertises must actually fire the routing directive, BUILD must stop stealing todo/quick/objective-add prompts, override phrases and an active skill must suppress the directive, and route-intent must write the `.edit-override` marker that gate-edits (TRD 24-01) consumes.

Purpose: empirical testing (24-RESEARCH.md finding 2) shows ALL seven flagship phrases return [] today, and BUILD mis-routes todo/quick/objective-add prompts. This is the core routing-correctness fix.
Output: route-intent.js with complete rule set + suppression, updated fixtures and tests, cross-hook e2e proof of the marker path.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
INTENT_MAP entry shape (route-intent.js:40-44) — every new rule follows this exactly:

```js
{
  rx: /\b(?:fix|correct|update|change|rename)\s+(?:the|this|that|a|an)\s+(?:typo|...)\b/i,
  skill: '/devflow:micro',
  label: 'micro',
},
```

Current matchIntent (route-intent.js:111-117) — extend, do not restructure:

```js
function matchIntent(prompt) {
  if (!prompt) return [];
  if (/^\s*\/(devflow:|df:)/i.test(prompt)) return [];
  if (/^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b/i.test(prompt)) return [];
  const matches = INTENT_MAP.filter(e => e.rx.test(prompt));
  return [...new Set(matches.map(m => m.skill))];
}
```

Exports (route-intent.js:161): `{ INTENT_MAP, matchIntent, renderDirective, findPlanningDir }` — preserve all, add nothing required, removal forbidden.

Fixture shape (intent-fixtures.cjs:222+): `{ prompt, expected_skill, label, why_fires }` for FIRE; `{ prompt, label, why_no_fire }` for NO_FIRE. Hand-built entries only.
</codebase_examples>

<anti_patterns>
- Do NOT switch matchIntent to first-match-wins — the directive renderer supports multi-intent output ("Use X or Y") and existing fixtures rely on filter semantics. Use the post-filter suppression (option c from 24-RESEARCH.md, planner's locked choice here: smallest diff).
- Do NOT make matchIntent do fs I/O — keep it pure. skillActive arrives as an optional second-arg option computed in main(), mirroring how gate-edits keeps shouldGate pure.
- Do NOT duplicate OVERRIDE_PHRASES — require from ./lib/edit-override.js (exists after TRD 24-01).
- Do NOT loosen the Q&A interrogative skip-list or the slash-command skip — 6 no-fire/skip tests guard them.
- Watch the existing micro/quick boundary: 'Tackle this small change in the auth flow' is currently a NO_FIRE fixture only because quick had no rule; with the QUICK rule it correctly becomes a FIRE fixture for /devflow:quick — move it, don't contort the regex to keep it silent.
</anti_patterns>

<error_recovery>
- If the byte-budget test fails (renderDirective <=400 bytes), a long multi-skill list is the cause — directive content is NOT in scope; do not modify renderDirective.
- If 'add a todo' fixtures fail with both build and todo matched, the suppression post-filter is not running after the Set dedupe — apply suppression on the matched-entries list (labels) BEFORE mapping to skills.
- If the cross-hook e2e is flaky on marker deletion, assert via fs.existsSync after the gate-edits subprocess exits (spawnSync is synchronous — no race).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/24-natural-language-routing-trigger-fixes/24-CONTEXT.md
@.planning/objectives/24-natural-language-routing-trigger-fixes/24-RESEARCH.md
@plugins/devflow/hooks/route-intent.js
@plugins/devflow/hooks/route-intent.test.js
@plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
@plugins/devflow/hooks/lib/edit-override.js
</context>

<research_context>
Empirical failures (24-RESEARCH.md finding 2, actual code execution): all of "build objective 3", "execute objective 3", "run objective 3", "build this", "implement this", "let's build", "start building" return []. Root cause: BUILD rx `/(?:build|implement|ship|make|create|add)\s+(?:the|a|an|this|that|some)\s+\w+/i` requires article THEN trailing word; no EXECUTE rule exists.

Over-matches (finding 3): "add a todo …" → build (wrong), "make a quick pass …" → build (wrong), "add an objective …" → build + objective-add double-fire.

UserPromptSubmit payload DOES include `prompt` (route-intent.js:142 already parses it) — realistic e2e payloads for this hook may include session_id/transcript_path/cwd/permission_mode/hook_event_name:'UserPromptSubmit' alongside prompt.

route-intent.test.js:58 asserts the exact INTENT_MAP skill set — MUST be updated when EXECUTE/TODO/QUICK land.
</research_context>

<gotchas>
- "make a quick pass" and "add a todo" both also match the BUILD rx (verb + article + word) — that is exactly why the suppression post-filter exists. Suppress '/devflow:build' whenever any of labels {objective-add, todo-add, quick} matched.
- "build this" at end-of-prompt has no trailing \w+ — the new BUILD alternative must accept this/that at a word boundary, not require a following noun.
- Marker write must happen in main() BEFORE the `skills.length === 0` early return — override prompts return [] by design (decision 4) yet MUST still write the marker (decision 1).
- matchIntent(prompt) single-arg calls must keep working — existing tests and the FIRE/NO_FIRE loops call it with one argument.
</gotchas>

## Test list

Behavior cases (write before implementation; outermost first):

Cross-hook (outermost):
1. e2e: route-intent run with prompt "just edit the config loader to add a retry" in ambient tmp project → empty stdout AND `.planning/.edit-override` exists; THEN gate-edits run in same project with realistic PreToolUse Edit payload (no user_message/prompt keys) → empty stdout (allow) AND marker deleted

route-intent subprocess e2e:
2. realistic UserPromptSubmit payload, prompt "execute objective 3" → directive contains /devflow:execute-objective and OBLIGATORY
3. `.planning/.skill-active` present + prompt "Fix the login bug" → empty stdout
4. override prompt "skip devflow and fix the bug in the auth flow" → empty stdout + marker written

matchIntent pure (FIRE — add to intent-fixtures.cjs):
5. "build objective 3" → /devflow:build; "build this" → /devflow:build; "implement this" → /devflow:build; "let's build" → /devflow:build; "start building" → /devflow:build
6. "execute objective 3" → /devflow:execute-objective; "run objective 3" → /devflow:execute-objective
7. "add a todo to refactor the parser" → /devflow:todo add; "make a quick pass over the error handling" → /devflow:quick; "small change: bump the timeout" → /devflow:quick
8. MOVE "Tackle this small change in the auth flow" from NO_FIRE to FIRE expecting /devflow:quick

matchIntent exclusivity (exact-array assertions in route-intent.test.js):
9. matchIntent('Add an objective for caching') deep-equals ['/devflow:objective add']
10. matchIntent('add a todo to refactor the parser') deep-equals ['/devflow:todo add']
11. matchIntent('make a quick pass over the error handling') deep-equals ['/devflow:quick']

matchIntent suppression:
12. NO_FIRE: "just edit the config loader to add a retry", "skip devflow and fix the bug in the auth flow" → []
13. matchIntent('Fix the login bug', { skillActive: true }) → []; matchIntent('Fix the login bug') still fires (back-compat)

Shape:
14. INTENT_MAP skill-set test updated: required set now also includes /devflow:execute-objective, /devflow:todo add, /devflow:quick
15. All pre-existing FIRE/NO_FIRE fixtures, Q&A skips, slash-command skips, renderDirective tests unchanged and green

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: INTENT_MAP rules (EXECUTE/TODO/QUICK + BUILD extension), suppression post-filter, override-phrase suppression</name>
  <files>plugins/devflow/hooks/route-intent.js, plugins/devflow/hooks/route-intent.test.js, plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs</files>
  <action>
RED first: add fixtures and tests for test-list cases 5-12 and 14, run `node --test plugins/devflow/hooks/route-intent.test.js`, confirm new cases fail. Commit failing tests. Then implement in route-intent.js.

Fixture edits (intent-fixtures.cjs — hand-built entries with why_fires/why_no_fire rationale):
- FIRE additions: the 10 prompts from test-list cases 5-7 with their expected skills.
- MOVE 'Tackle this small change in the auth flow' from NO_FIRE_FIXTURES to FIRE_FIXTURES with expected_skill '/devflow:quick' (rationale: quick now has a rule; the old why_no_fire only documented micro's whitelist).
- NO_FIRE additions: 'just edit the config loader to add a retry', 'skip devflow and fix the bug in the auth flow' (override suppression, decision 4).

route-intent.test.js edits:
- Update the skill-set test (line 58): add '/devflow:execute-objective', '/devflow:todo add', '/devflow:quick' to `required` (and to the test name).
- Add exclusivity describe-block with the three deep-equal assertions (cases 9-11) proving BUILD is suppressed, not merely outvoted.

route-intent.js implementation:
- `const { hasOverridePhrase } = require('./lib/edit-override.js');` at top (lib exists — TRD 24-01, wave 1).
- BUILD rule rx: extend with alternatives so all of these fire (exact regex construction is executor discretion; the fixtures are the contract):
  verb+article+noun (existing) | (?:build|implement)\s+objective\b | (?:build|implement)\s+(?:this|that)\b (no trailing noun required) | let'?s\s+(?:build|implement)\b | \bstart\s+building\b
- New EXECUTE rule: rx ~ /\b(?:execute|run)\s+(?:the\s+)?(?:planned\s+)?objective\b/i, skill '/devflow:execute-objective', label 'execute'.
- New TODO rule: rx ~ /\b(?:add|create)\s+(?:a\s+)?todo\b|\bremember\s+to\b/i, skill '/devflow:todo add', label 'todo-add'.
- New QUICK rule: rx ~ /\b(?:make|take|do)\s+a\s+quick\s+pass\b|\bsmall\s+change\b/i, skill '/devflow:quick', label 'quick'.
- Suppression post-filter in matchIntent (option c — smallest diff): filter matches as today, then `if (matched labels include any of ['objective-add','todo-add','quick']) drop entries with label 'build'` BEFORE the Set/map. Keeps multi-intent semantics for everything else.
- Override suppression in matchIntent: after the existing skip rules, `if (hasOverridePhrase(prompt)) return [];`
# CRITICAL: "execute objective" must NOT also fire VERIFY ("check the objective" style) — EXECUTE's verbs are execute|run only
# GOTCHA: "run objective 3" — digit follows 'objective'; the rx must end at \b after 'objective', not require 'the'
# PATTERN: keep rules in INTENT_MAP order grouped with a comment header like existing entries
  </action>
  <verify>node --test plugins/devflow/hooks/route-intent.test.js → all pass including every pre-existing fixture; npm test → green</verify>
  <done>All 10 new FIRE prompts route correctly; the 3 exclusivity assertions pass with exact single-skill arrays; override prompts return []; old fixtures untouched and green; commits: test(24-02) then feat(24-02)</done>
  <recovery>If an old fixture regresses (e.g., 'Build the dashboard feature'), the BUILD extension broke the original alternative — keep the original rx as alternative 1 verbatim. If micro fixtures break, you touched the micro rule — revert it; micro is out of this TRD's blast radius.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: main() wiring — marker write, skill-active suppression, realistic e2e + cross-hook proof</name>
  <files>plugins/devflow/hooks/route-intent.js, plugins/devflow/hooks/route-intent.test.js</files>
  <action>
RED first: add subprocess e2e tests for test-list cases 1-4 and 13, confirm failures, commit, then implement.

route-intent.test.js:
- Helper `realUserPromptSubmitPayload(prompt, cwd)` → `{ session_id: 'test-session', transcript_path: '/tmp/transcript.jsonl', cwd, permission_mode: 'default', hook_event_name: 'UserPromptSubmit', prompt }` (UserPromptSubmit legitimately carries prompt — decision 8 realism).
- Case 2: ambient tmp project, "execute objective 3" → stdout JSON additionalContext includes '/devflow:execute-objective'.
- Case 3: create `.planning/.skill-active` in tmp project, prompt 'Fix the login bug' → empty stdout.
- Case 4: prompt 'skip devflow and fix the bug in the auth flow' → empty stdout AND fs.existsSync(.planning/.edit-override) true.
- Case 1 (cross-hook, decision-1 end-to-end proof): in ONE tmp project, spawnSync route-intent with override prompt; assert marker exists; then spawnSync `path.join(__dirname, 'gate-edits.js')` with a realistic PreToolUse Edit payload (only session_id/transcript_path/cwd/permission_mode/hook_event_name/tool_name/tool_input keys) → empty stdout AND marker deleted afterward.
- Case 13 (pure): matchIntent('Fix the login bug', { skillActive: true }) → []; single-arg call still fires.

route-intent.js:
- matchIntent signature → `matchIntent(prompt, opts = {})`; first line additions: after the existing null/skip checks, `if (opts.skillActive) return [];` (decision 5; pure — no fs in matchIntent).
- Import additions from './lib/edit-override.js': `writeEditOverrideMarker` (and hasOverridePhrase from Task 1).
- main() flow:
  1. parse input; prompt empty → return
  2. planningDir = findPlanningDir(cwd); none → return
  3. `if (hasOverridePhrase(prompt)) writeEditOverrideMarker(planningDir);`  # CRITICAL: before any matchIntent early-return — override prompts produce no directive but MUST arm the gate bypass (decisions 1+4)
  4. skillActive = fs.existsSync(path.join(planningDir, '.skill-active'))
  5. skills = matchIntent(prompt, { skillActive }); empty → return
  6. emit directive (unchanged renderDirective)
- Update the file header docblock to mention marker writing and the two suppression rules.
- module.exports: keep `{ INTENT_MAP, matchIntent, renderDirective, findPlanningDir }` (adding nothing is fine; removing forbidden).
  </action>
  <verify>node --test plugins/devflow/hooks/route-intent.test.js → green including cross-hook case; npm test → fully green</verify>
  <done>Override prompt writes marker + suppresses directive; skill-active suppresses directive; gate-edits consumes the route-intent-written marker in the same tmp project (allow + deleted); commits: test(24-02) then feat(24-02)</done>
  <recovery>If the cross-hook test denies, check write/consume path agreement — both must derive from the same planningDir/.edit-override name via the shared lib (never hand-build the path in the hooks). If existing e2e ('Fix the login bug' fires) breaks, the skill-active check leaked into the no-marker tmp project — ensure each e2e uses a fresh mkdtemp.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `npm test` fully green.
- Spot-check in node REPL: `require('./plugins/devflow/hooks/route-intent.js').matchIntent('build objective 3')` → ['/devflow:build']; `matchIntent('execute objective 3')` → ['/devflow:execute-objective']; `matchIntent('add a todo to refactor the parser')` → ['/devflow:todo add']; `matchIntent('just edit the config')` → [].
- Cross-hook e2e test passes, proving the decision-1 marker path end-to-end.
</verification>

<success_criteria>
Locked decisions 2, 3, 4, 5 fully implemented; decision 7's INTENT_MAP coverage (quick + todo rules) landed; decision 1's route side (marker write) proven against TRD 24-01's gate side; decision 8 realism applied to route-intent e2e. No regression across the pre-existing 16 fixtures and skip rules.
</success_criteria>

<output>
After completion, create `.planning/objectives/24-natural-language-routing-trigger-fixes/24-02-SUMMARY.md`
</output>

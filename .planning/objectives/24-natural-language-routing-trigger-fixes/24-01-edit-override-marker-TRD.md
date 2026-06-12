---
objective: 24-natural-language-routing-trigger-fixes
trd: 01
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/lib/edit-override.js
  - plugins/devflow/hooks/lib/edit-override.test.js
  - plugins/devflow/hooks/gate-edits.js
  - plugins/devflow/hooks/gate-edits.test.js
autonomous: true
requirements: [CTX24-D1, CTX24-D8]
must_haves:
  truths:
    - "gate-edits no longer reads input.user_message or input.prompt anywhere — overrideActive comes exclusively from consuming the .planning/.edit-override marker"
    - "A fresh .edit-override marker causes gate-edits to ALLOW an ambient edit, and the marker file is deleted after the run (consume-on-read)"
    - "A stale .edit-override marker (mtime older than TTL) causes gate-edits to still DENY, and the stale marker is deleted"
    - "Every gate-edits subprocess e2e test feeds the REAL PreToolUse payload shape: session_id, transcript_path, cwd, permission_mode, hook_event_name, tool_name, tool_input — no user_message/prompt keys"
    - "OVERRIDE_PHRASES has exactly one definition (shared lib); gate-edits re-exports it so existing imports keep working"
  artifacts:
    - "plugins/devflow/hooks/lib/edit-override.js — shared OVERRIDE_PHRASES + hasOverridePhrase + marker write/consume helpers with TTL"
    - "plugins/devflow/hooks/lib/edit-override.test.js — unit tests for phrase detection and marker lifecycle"
    - "plugins/devflow/hooks/gate-edits.js — marker-consuming main(), unchanged shouldGate signature"
    - "plugins/devflow/hooks/gate-edits.test.js — realistic-payload e2e suite"
  key_links:
    - "gate-edits.js main() calls consumeEditOverrideMarker(planningDir) from lib/edit-override.js to compute overrideActive"
    - "gate-edits.js module.exports.OVERRIDE_PHRASES and .hasOverridePhrase re-export the shared lib values (back-compat for route-intent TRD 24-02 and existing tests)"
---

<objective>
Fix CONTEXT.md locked decision 1 (gate side): the gate-edits override phrases are dead at runtime because PreToolUse payloads carry no user prompt field. Create the shared override/marker library and rewire gate-edits to consume a single-turn `.planning/.edit-override` marker (written by route-intent in TRD 24-02). Rewrite gate-edits e2e tests to use the real PreToolUse payload shape.

Purpose: "just edit" / "skip devflow" currently NEVER bypass the gate even though the deny message advertises them. This TRD makes the gate side of the marker handshake real and makes the tests stop encoding the wrong payload contract.
Output: shared lib + rewired gate-edits + realistic test suite, all green under `npm test`.
</objective>

<file_tree>
plugins/devflow/hooks/
├── lib/
│   ├── edit-override.js        ← CREATE (shared phrases + marker helpers)
│   └── edit-override.test.js   ← CREATE
├── gate-edits.js               ← MODIFY (consume marker, drop user_message read)
└── gate-edits.test.js          ← MODIFY (realistic payloads, marker e2e)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Current gate-edits.js exports (gate-edits.js:182-188) — MUST keep all keys after refactor:

```js
module.exports = {
  OVERRIDE_PHRASES,
  hasSkillActiveMarker,
  hasOverridePhrase,
  shouldGate,
  findPlanningDir,
};
```

Current broken prompt read in main() (gate-edits.js:155) — to be REMOVED:

```js
const userMessage = input.user_message || input.prompt || '';
```

shouldGate is pure and takes `overrideActive` as a boolean (gate-edits.js:101) — its signature does NOT change. Only the main()-level computation of `overrideActive` changes (mirrors how `skillActive` is already computed at main() level).

Hook test conventions (gate-edits.test.js): node:test + node:assert/strict, spawnSync subprocess e2e with tmpdir fixtures via fs.mkdtempSync, hand-built payload objects. Follow exactly.
</codebase_examples>

<anti_patterns>
- Do NOT duplicate the OVERRIDE_PHRASES literal list in two files — locked decision 1 requires a single shared source.
- Do NOT keep the `user_message`/`prompt` fallback read "just in case" — it is dead code that misled the previous test suite into encoding a payload shape that does not exist (24-RESEARCH.md finding 1).
- Do NOT change shouldGate's signature or decision matrix — 11 pure-function tests depend on it and they are correct.
- Do NOT let marker helpers throw — hooks must never crash the harness. Wrap fs ops in try/catch and fail closed (return false → gate denies).
- No LLM-generated test data: payload objects and marker contents are hand-built inline (fixture_strategy: inline).
</anti_patterns>

<error_recovery>
- If consumeEditOverrideMarker cannot delete the marker (EACCES/race), still return the freshness verdict but never throw; a leftover marker is bounded by the TTL.
- If tests fail because `node --test` does not pick up `hooks/lib/*.test.js`: package.json test glob is `'plugins/devflow/**/*.test.js'` which DOES cover the new lib dir — run `npm test 2>&1 | grep edit-override` to confirm pickup before debugging the tests themselves.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/24-natural-language-routing-trigger-fixes/24-CONTEXT.md
@.planning/objectives/24-natural-language-routing-trigger-fixes/24-RESEARCH.md
@plugins/devflow/hooks/gate-edits.js
@plugins/devflow/hooks/gate-edits.test.js
</context>

<research_context>
From 24-RESEARCH.md finding 1 (empirically verified):
- Real PreToolUse payload contains ONLY: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `tool_name`, `tool_input`. Neither `user_message` nor `prompt` exists.
- The existing e2e tests pass only because they feed synthetic `user_message` payloads (gate-edits.test.js:245-302) — wrong contract.
- Marker architecture locked: route-intent (UserPromptSubmit, which DOES receive `prompt`) writes `.planning/.edit-override`; gate-edits consumes it (check + delete). TTL guard against stale markers.
- Both hooks already implement identical findPlanningDir walkers — the marker path derives from the same planningDir.
- hooks run from `${CLAUDE_PLUGIN_ROOT}/hooks/` so `require('./lib/edit-override.js')` resolves at runtime; the sync-runtime mirror is irrelevant to hooks (it mirrors `devflow/`, not `hooks/`).
</research_context>

<gotchas>
- Timing makes single-turn scope work: UserPromptSubmit fires before any tool call in the same turn, so the marker written by route-intent is present when PreToolUse fires moments later. The TTL exists for the case where the user typed an override phrase but no edit happened that turn.
- The deny message text in shouldGate ('include "skip devflow" or "just edit" in your prompt') stays accurate under the marker mechanism — do not reword it (pure tests assert /ambient mode/i only, but the advertised UX is unchanged).
- `consumeEditOverrideMarker` must delete the marker in BOTH fresh and stale cases (consume-on-read + stale cleanup), per locked decision 1.
</gotchas>

## Test list

Behavior cases (write these BEFORE implementation; outermost first within each task):

edit-override lib:
1. hasOverridePhrase detects each of the 4 phrases case-insensitively; false for null/undefined/empty/non-matching ("skip this check", "edit this file for me")
2. writeEditOverrideMarker(planningDir) creates `<planningDir>/.edit-override`; returns false and does not throw for null planningDir
3. consumeEditOverrideMarker: fresh marker → true AND file deleted
4. consumeEditOverrideMarker: stale marker (mtime backdated past TTL via fs.utimesSync) → false AND file deleted
5. consumeEditOverrideMarker: missing marker → false; null planningDir → false
6. OVERRIDE_PHRASES is exactly ['skip devflow','just edit','bypass devflow','force edit']

gate-edits (realistic payloads):
7. e2e DENY: ambient project, realistic Edit payload (no user_message/prompt keys), no marker → permissionDecision deny
8. e2e ALLOW: ambient project + fresh .edit-override marker → empty stdout AND marker file no longer exists
9. e2e DENY: ambient project + stale marker (10 min old, TTL 5 min) → deny output AND marker file deleted
10. e2e regression: skill-active marker, .md path, .planning path, Read tool, no-.planning project, DEVFLOW_SKIP_EDIT_GATE=1 — all still behave as before, now with realistic payloads
11. unit: gate-edits still exports OVERRIDE_PHRASES (length 4) and hasOverridePhrase (identical behavior) via re-export

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create shared edit-override lib (phrases + marker lifecycle with TTL)</name>
  <files>plugins/devflow/hooks/lib/edit-override.js, plugins/devflow/hooks/lib/edit-override.test.js</files>
  <action>
RED first: write plugins/devflow/hooks/lib/edit-override.test.js covering test-list cases 1-6, run `node --test plugins/devflow/hooks/lib/edit-override.test.js`, confirm failure (module missing). Commit failing tests. Then implement.

Create plugins/devflow/hooks/lib/edit-override.js (CommonJS, 'use strict', no dependencies beyond fs/path) exporting:

- `OVERRIDE_PHRASES` — exactly `['skip devflow', 'just edit', 'bypass devflow', 'force edit']` (moved verbatim from gate-edits.js:40-45; single source of truth per locked decision 1).
- `hasOverridePhrase(text)` — moved verbatim from gate-edits.js:84-88 (lowercase includes scan, null-safe).
- `EDIT_OVERRIDE_TTL_MS` — `5 * 60 * 1000` (5 minutes; planner-locked TTL within CONTEXT discretion "a few minutes").
- `editOverrideMarkerPath(planningDir)` — `path.join(planningDir, '.edit-override')`.
- `writeEditOverrideMarker(planningDir)` — returns false for falsy planningDir; writes JSON `{ created_at: new Date().toISOString() }` to the marker path; returns true on success, false on any fs error (try/catch — never throw).

Approach for `consumeEditOverrideMarker(planningDir, nowMs = Date.now())`:
1. falsy planningDir → return false
2. statSync the marker; ENOENT → return false
3. capture mtimeMs, then unlinkSync the marker (try/catch — best-effort delete in BOTH branches; consume-on-read)
4. return `nowMs - mtimeMs <= EDIT_OVERRIDE_TTL_MS`
# CRITICAL: delete happens whether fresh or stale — a stale marker must not linger to silently disable the gate later (locked decision 1)
# CRITICAL: every fs op wrapped — a hook crash would break the user's harness
# PATTERN: mirror the defensive style of findPlanningDir/hasSkillActiveMarker in gate-edits.js

Tests use hand-built tmpdirs (fs.mkdtempSync) and `fs.utimesSync(markerPath, t, t)` with t = (Date.now() - 10*60*1000)/1000 to backdate the stale case. Pass an explicit `nowMs` where determinism helps.
  </action>
  <verify>node --test plugins/devflow/hooks/lib/edit-override.test.js → all pass; npm test → new file picked up by the glob, zero failures</verify>
  <done>Lib exports all six symbols; fresh marker consumes true+deleted; stale marker consumes false+deleted; missing/null cases false; commits: test(24-01) failing tests, then feat(24-01) implementation</done>
  <recovery>If the glob misses hooks/lib tests, run them directly via node --test path; do NOT move the lib out of hooks/lib (relative require from both hooks depends on it). If consume-on-read races in CI, assert deletion with fs.existsSync after the call rather than inside it.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Rewire gate-edits to consume the marker; rewrite e2e tests with real PreToolUse payloads</name>
  <files>plugins/devflow/hooks/gate-edits.js, plugins/devflow/hooks/gate-edits.test.js</files>
  <action>
RED first: update gate-edits.test.js per test-list cases 7-11, run, confirm the marker-based e2e cases fail against current gate-edits.js. Then modify gate-edits.js to green.

gate-edits.test.js changes:
- Add a hand-built helper `realPreToolUsePayload({ tool_name, file_path, cwd })` returning ONLY `{ session_id: 'test-session', transcript_path: '/tmp/transcript.jsonl', cwd, permission_mode: 'default', hook_event_name: 'PreToolUse', tool_name, tool_input: { file_path } }`. Add one assertion that the helper's output has no `user_message` and no `prompt` keys (guards against regression to the wrong contract).
- Convert ALL existing subprocess e2e payloads (tests 17-24, lines 237-400) to use this helper — delete every `user_message:`/`prompt:` field from payloads.
- DELETE the two override-phrase e2e tests that pass `user_message`/`prompt` (lines 276-307) — they encode a payload shape that does not exist. Replace with marker-based e2e:
  (a) fresh marker: write `.planning/.edit-override` in the tmp project, run hook with realistic Edit payload → empty stdout AND `fs.existsSync(marker) === false` after the run.
  (b) stale marker: write marker, backdate mtime 10 minutes with fs.utimesSync, run hook → stdout contains permissionDecision 'deny' AND marker deleted.
- Keep ALL shouldGate pure-function tests and hasSkillActiveMarker tests unchanged. Keep the hasOverridePhrase suite and the OVERRIDE_PHRASES export-shape test (they now exercise the re-exports).

gate-edits.js changes:
- `const { OVERRIDE_PHRASES, hasOverridePhrase, consumeEditOverrideMarker } = require('./lib/edit-override.js');` — delete the local OVERRIDE_PHRASES array (lines 40-45) and local hasOverridePhrase (lines 77-88).
- main(): delete the `const userMessage = input.user_message || input.prompt || '';` line (155) and replace `hasOverridePhrase(userMessage)` with `consumeEditOverrideMarker(planningDir)` for `overrideActive`. shouldGate call and signature unchanged.
- module.exports unchanged in shape: still exports OVERRIDE_PHRASES, hasSkillActiveMarker, hasOverridePhrase, shouldGate, findPlanningDir (first three now re-exports/pass-throughs).
- Update the header docstring escape-hatch #2 (lines 11-12) to describe the real mechanism: "Override phrase in user prompt — detected by route-intent.js (UserPromptSubmit) which writes .planning/.edit-override; this hook consumes the marker (single-turn, TTL-bounded)."
# GOTCHA: consumeEditOverrideMarker must be called only AFTER planningDir is resolved and only matters in the deny path — calling it unconditionally in main() is fine (consume semantics are idempotent for missing files) but call it once, not per-branch
  </action>
  <verify>node --test plugins/devflow/hooks/gate-edits.test.js → all pass; grep -n "user_message" plugins/devflow/hooks/gate-edits.js plugins/devflow/hooks/gate-edits.test.js → zero hits; npm test → green</verify>
  <done>gate-edits never reads user_message/prompt; fresh marker → allow + consumed; stale marker → deny + deleted; all e2e payloads realistic; exports back-compatible; commits: test(24-01) then feat(24-01)</done>
  <recovery>If pure shouldGate tests break, you changed its signature — revert; only main()-level wiring changes. If route-intent.test.js or other suites fail after the export move, the re-export is missing a key — diff module.exports against the pre-change list.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `npm test` fully green (df-tools suite + all hook suites).
- `node --test plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/lib/edit-override.test.js` green.
- `grep -rn "user_message" plugins/devflow/hooks/gate-edits.js plugins/devflow/hooks/gate-edits.test.js` returns nothing.
- Manual smoke: in a tmp dir with `.planning/`, `touch .planning/.edit-override` then `echo '{"session_id":"s","transcript_path":"/tmp/t.jsonl","cwd":".","permission_mode":"default","hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"src/a.ts"}}' | node plugins/devflow/hooks/gate-edits.js` → empty output, marker gone.
</verification>

<success_criteria>
Locked decision 1 gate-side complete: marker consumed with TTL, single OVERRIDE_PHRASES source, realistic payload tests (decision 8), zero behavioral change to the skill-active / .md / .planning / env-var escape hatches.
</success_criteria>

<output>
After completion, create `.planning/objectives/24-natural-language-routing-trigger-fixes/24-01-SUMMARY.md`
</output>

---
objective: 25-fleet-audit-fixes
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/gate-edits.js
  - plugins/devflow/hooks/gate-edits.test.js
  - plugins/devflow/devflow/templates/config.json
autonomous: true
requirements: []   # ad-hoc audit objective — roadmap Objective 25 SC-4 is the contract

must_haves:
  truths:
    - "With no .planning/config.json, no gates key, malformed JSON, or an unrecognized value, gate-edits behaves byte-identically to today: strict DENY in ambient mode (default unchanged — LOCKED)"
    - "gates.editGate:'warn' converts the ambient deny into permissionDecision 'ask' (visible but non-blocking), same reason text"
    - "gates.editGate:'off' makes the hook emit nothing for that project (no-op, like DEVFLOW_SKIP_EDIT_GATE=1)"
    - "skill-active marker, .edit-override marker, .md allow, .planning allow, and env-var escape all behave exactly as before in every mode"
    - "npm test passes; all pre-existing gate-edits tests unchanged and green"
  artifacts:
    - "plugins/devflow/hooks/gate-edits.js — readEditGateMode() + VALID_EDIT_GATE_MODES exported; main() wires mode at emission time"
    - "plugins/devflow/hooks/gate-edits.test.js — new describe('gates.editGate config — warn/strict/off') block, unit + subprocess e2e"
    - "plugins/devflow/devflow/templates/config.json — gates block documents editGate: strict"
  key_links:
    - "main() reads mode via readEditGateMode(planningDir) right after findPlanningDir(); shouldGate() stays pure and untouched so the existing decision-matrix tests keep passing"
    - "'warn' revives the header-documented prior mechanism: permissionDecision 'ask' (gate-edits.js header comment line 27) — no invented hook-output behavior"
---

<objective>
Add a per-repo edit-gate severity knob: `.planning/config.json` → `gates.editGate: "warn" | "strict" | "off"`, default `"strict"`. Audit item 7 (mechanism): eden-press logged 52 gate denials vs 3 skill uses; forensics show the denials are false positives against legitimate wave-executor work inside git worktrees (worktree-local `.planning/` never receives the `.skill-active` marker), so repos need a way to soften the gate without rewriting default behavior (LOCKED: strict stays the default; worktree-marker propagation is explicitly out of scope, a future objective).

Purpose: roadmap SC-4 — "gate-edits.js supports .planning/config.json gates.editGate (warn|strict|off), default strict".
Output: knob implemented + tested in devflow-claude; template documents it. (Applying `"warn"` to eden-press's config is TRD 25-06 Task 3, Wave 2.)
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
The established hooks config-read pattern to mirror (verify-commits.js `isAutonomousMode` — hooks cannot require df-tools, so they hand-roll a defensive read):

```js
function isAutonomousMode(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.mode === 'autonomous';
  } catch {
    return false;
  }
}
```

Exact helper to add to gate-edits.js (from 25-RESEARCH.md — enum-validated so a typo can never silently soften the gate):

```js
const VALID_EDIT_GATE_MODES = new Set(['strict', 'warn', 'off']);

function readEditGateMode(planningDir) {
  try {
    if (!planningDir) return 'strict';
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return 'strict';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const mode = config.gates && config.gates.editGate;
    return VALID_EDIT_GATE_MODES.has(mode) ? mode : 'strict';
  } catch {
    return 'strict';
  }
}
```

main() wiring (mode applied at emission time; shouldGate untouched):

```js
const planningDir = findPlanningDir(process.cwd());
const editGateMode = readEditGateMode(planningDir);
if (editGateMode === 'off') return;               // project opted out entirely
// ... existing skillActive / overrideActive / shouldGate flow unchanged ...
const out = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: editGateMode === 'warn' ? 'ask' : 'deny',
    permissionDecisionReason: result.reason,
  },
};
```

Existing subprocess e2e test pattern in gate-edits.test.js (13 describe blocks; e2e blocks build a tmpdir with .planning/, spawnSync the hook with a realistic JSON payload on stdin + cwd inside the tmpdir, and assert stdout):
- `describe('subprocess e2e — DENY in ambient + no marker + realistic payload', ...)` etc.
</codebase_examples>

<anti_patterns>
- Do NOT put the mode check inside shouldGate() — it would break the pure decision-matrix tests and mix I/O into the pure layer. Mode is an emission-time concern in main().
- Do NOT default to anything but 'strict' on ANY read failure (missing file/key, malformed JSON, unknown value like "lenient"). Silently mis-parsing to something permissive is a correctness bug (research finding).
- Do NOT change the deny reason text, OVERRIDE_PHRASES, marker lifecycle, or the DEVFLOW_SKIP_EDIT_GATE env var — LOCKED: "Rewriting gate-edits default behavior" is out of scope; strict stays default.
- Do NOT use 'ask' for anything except editGateMode === 'warn' — no other hook emits 'ask' today; this is reviving the documented prior behavior only.
</anti_patterns>

<error_recovery>
- If the 'off' early-return accidentally skips consuming the .edit-override marker and a stale-marker test fails: that is acceptable and intended ('off' means the hook does nothing for that project); if an existing test asserts marker consumption in a default-config tmpdir, the tmpdir simply has no config.json → mode 'strict' → unchanged path.
- If spawnSync e2e tests hang, check you passed `input:` (stdin payload) and `cwd:` inside the tmpdir — copy an existing e2e block verbatim as scaffold.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/25-fleet-audit-fixes/25-CONTEXT.md
@.planning/objectives/25-fleet-audit-fixes/25-RESEARCH.md
@plugins/devflow/hooks/gate-edits.js
@plugins/devflow/hooks/gate-edits.test.js
@plugins/devflow/hooks/verify-commits.js
</context>

<research_context>
- gate-edits.js reads NO config file today (verified) — this helper is net-new code, not an extension of existing config reads.
- gate-edits.js's own header comment (line 27) documents that the PRIOR implementation used `permissionDecision: 'ask'` for warn-only mode before the strict-by-default rewrite — 'warn' resurrects that exact mechanism.
- Three sibling hooks (verify-commits.js, verify-completion.js, statusline.js) each hand-roll the same defensive config read; there is deliberately no shared loader (hooks can't require df-tools).
- eden-press evidence supporting 'warn' (applied in TRD 25-06): 92 deny occurrences across 36/51 subagent transcripts, 82% on .go source files inside `.claude/worktrees/agent-*/`, all from devflow:executor agents doing legitimate TDD work; zero evidence of careless ambient editing. 'off' would over-suppress; 'strict' actively blocks correct execution.
</research_context>

<gotchas>
- HARD CONSTRAINT: port 8080 forbidden everywhere (no server needed for this TRD; if one ever were, use 8091). No version bump, tag, release, or deploy — the knob goes live in fleet repos at the NEXT release; that's expected and fine.
- templates/config.json already has a `gates` block (confirm_project, confirm_objectives, ...) — add `"editGate": "strict"` inside that existing block; do not create a second gates key.
- Hook code runs from `${CLAUDE_PLUGIN_ROOT}` in live sessions — repo tests exercise the working-tree copy directly; no `~/.claude/devflow/` mirror refresh needed for hook-only changes.
</gotchas>

## Test list

Unit (readEditGateMode — pure fs, use tmpdirs):
1. `readEditGateMode(null)` → 'strict'
2. planningDir with no config.json → 'strict'
3. config.json with malformed JSON → 'strict'
4. config.json without `gates` key → 'strict'
5. `gates.editGate: "banana"` (unknown enum) → 'strict'
6. `gates.editGate: "warn"` → 'warn'; `"off"` → 'off'; `"strict"` → 'strict'

Subprocess e2e (ambient tmpdir, no markers, realistic Edit payload on a `.cjs` path):
7. config `editGate: "warn"` → stdout JSON has `permissionDecision: 'ask'` with the standard reason text
8. config `editGate: "off"` → empty stdout (no output at all)
9. config `editGate: "strict"` → `permissionDecision: 'deny'` (parity with no-config default)
10. config `editGate: "warn"` + `.skill-active` marker present → empty stdout (allow precedence unaffected by mode)
11. No config.json at all → 'deny' (already covered by pre-existing e2e; must stay green untouched)

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: readEditGateMode + warn/off wiring in gate-edits.js</name>
  <files>plugins/devflow/hooks/gate-edits.js, plugins/devflow/hooks/gate-edits.test.js</files>
  <action>
RED first: add `describe('gates.editGate config — warn/strict/off', ...)` to gate-edits.test.js implementing Test list cases 1-10. Unit cases require `{ readEditGateMode, VALID_EDIT_GATE_MODES }` from './gate-edits.js' (will fail — not exported yet). E2e cases clone an existing subprocess block: mkdtemp → write `.planning/config.json` with the mode under test → spawnSync the hook with cwd in the tmpdir + realistic payload `{"tool_name":"Edit","tool_input":{"file_path":"<tmpdir>/src/x.cjs"}}` → assert stdout. Run — RED. Commit `test(25-02): ...`.

GREEN: implement in gate-edits.js exactly per the embedded code examples: (a) `VALID_EDIT_GATE_MODES` + `readEditGateMode(planningDir)` in the pure-helpers section; (b) in main(), compute `editGateMode` right after `findPlanningDir`, early-return when 'off', and make the deny-output's permissionDecision conditional (`'ask'` when 'warn', else `'deny'`); (c) export both new symbols from module.exports (append — do not remove existing exports). shouldGate() untouched. Run — green, including ALL pre-existing describe blocks. Commit `feat(25-02): ...`.
  </action>
  <verify>node --test plugins/devflow/hooks/gate-edits.test.js → all pass (new block + 13 pre-existing blocks); npm test → no regressions</verify>
  <done>editGate knob works: warn→'ask', off→no output, strict/absent/invalid→'deny'; default behavior byte-identical without config</done>
  <recovery>If pre-existing e2e blocks fail after wiring, you changed the default path — diff main() against the original: the ONLY changes allowed are the two-line mode read, the 'off' early-return, and the conditional permissionDecision</recovery>
</task>

<task type="auto">
  <name>Task 2: Document the knob in templates/config.json + gate-edits.js header</name>
  <files>plugins/devflow/devflow/templates/config.json, plugins/devflow/hooks/gate-edits.js</files>
  <action>
Add `"editGate": "strict"` to the EXISTING `gates` block in plugins/devflow/devflow/templates/config.json (so new projects see the default and the key name). Update the gate-edits.js header comment: after the three escape hatches, add a fourth bullet documenting `.planning/config.json → gates.editGate: "warn" | "strict" | "off"` (default strict; warn emits permissionDecision 'ask'; off disables the gate for that project). Keep the historical "Prior behavior" note intact. Commit `docs(25-02): ...` (or fold into the GREEN commit if executor prefers a single feat commit for template+header — either is acceptable; keep test/impl commits separate regardless).
  </action>
  <verify>node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/devflow/templates/config.json','utf8'))" exits 0; grep -n "editGate" plugins/devflow/devflow/templates/config.json plugins/devflow/hooks/gate-edits.js shows both locations</verify>
  <done>Template config.json parses and documents gates.editGate:"strict"; hook header describes all three modes</done>
  <recovery>If template JSON breaks parsing, restore from git and re-apply the single-key addition</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `npm test` — full suite green, zero new failures vs baseline.
2. Manual e2e (scratch dir, NOT this repo): create a tmpdir with `.planning/config.json` containing `{"gates":{"editGate":"warn"}}`, then `printf '{"tool_name":"Edit","tool_input":{"file_path":"/tmp-x/src/a.cjs"}}' | (cd <tmpdir> && node <repo>/plugins/devflow/hooks/gate-edits.js)` → stdout contains `"permissionDecision":"ask"`. Repeat with `"off"` → empty stdout. (No servers, no port 8080.)
3. `git diff` shows shouldGate() body unchanged.
</verification>

<success_criteria>
- Roadmap SC-4: gate-edits.js supports `.planning/config.json` gates.editGate (warn|strict|off), default strict.
- Quality gate: config read follows the verify-commits.js defensive pattern; warn uses permissionDecision 'ask'; strict remains default on every failure path.
</success_criteria>

<output>
After completion, create `.planning/objectives/25-fleet-audit-fixes/25-02-SUMMARY.md`
</output>

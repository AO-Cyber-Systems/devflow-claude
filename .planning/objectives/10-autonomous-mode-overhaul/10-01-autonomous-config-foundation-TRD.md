---
objective: 10-autonomous-mode-overhaul
trd: 01
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/config.cjs
  - plugins/devflow/devflow/bin/lib/config.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/autonomous-fixtures.cjs
  - plugins/devflow/devflow/templates/config.json
  - .gitignore
autonomous: true
requirements: []

must_haves:
  truths:
    - "loadConfig(cwd) returns `autonomous: true` when .planning/config.json has mode: 'autonomous', and `autonomous: false` for yolo/interactive/missing config"
    - "mode: 'autonomous' is a recognized preset distinct from yolo — yolo semantics are unchanged"
    - "loadConfig returns workflow flags `verifier_checkpoints` and `decision_queue` (default true when mode is autonomous, false otherwise unless explicitly set)"
    - "templates/config.json documents the autonomous preset without changing the default mode (stays yolo)"
    - ".gitignore covers the autonomous runtime marker files (.planning/.autonomous-resume-* and .planning/.autonomous-retry-*)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/config.test.cjs"
      provides: "first-ever test file for config.cjs — covers autonomous preset resolution, defaults, back-compat"
      contains: "describe('loadConfig"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/autonomous-fixtures.cjs"
      provides: "buildPlanningDirWithConfig(tmpdir, configObj) hand-built fixture factory"
      exports: ["buildPlanningDirWithConfig"]
    - path: "plugins/devflow/devflow/bin/lib/config.cjs"
      provides: "autonomous boolean + verifier_checkpoints + decision_queue in loadConfig return"
  key_links:
    - from: "loadConfig return object"
      to: "mode field"
      via: "autonomous: mode === 'autonomous' derivation"
      pattern: "autonomous:"
    - from: "templates/config.json"
      to: "autonomous preset documentation"
      via: "workflow.verifier_checkpoints + workflow.decision_queue keys"
      pattern: "decision_queue"
---

<objective>
Land the `mode: "autonomous"` config preset that every other TRD in this objective branches on. Autonomous is distinct from yolo: yolo = blind auto-approve everything (unchanged, back-compat); autonomous = machine-verify checkpoints, queue design decisions, never wait on mechanics.

Purpose: All six work items in objective 10 gate on autonomous-mode detection. This TRD is the single Wave-1 foundation — config schema first, consumers later (research binding: Wave 1 = config schema + preset).

Output: `loadConfig()` exposes `autonomous` boolean + `verifier_checkpoints` + `decision_queue` workflow flags; template documents the preset; gitignore covers the runtime marker files later TRDs will write.
</objective>

## Test list

Behavior cases for `loadConfig` (happy + edge + failure), ordered outermost-in:

1. config.json with `mode: "autonomous"` → `{ mode: 'autonomous', autonomous: true, verifier_checkpoints: true, decision_queue: true }`
2. config.json with `mode: "yolo"` → `{ mode: 'yolo', autonomous: false, verifier_checkpoints: false, decision_queue: false }`
3. config.json with `mode: "interactive"` → `autonomous: false`
4. Missing config.json → defaults (`mode: 'yolo'`, `autonomous: false`) — existing catch-all path preserved
5. Nested form `{ workflow: { mode: "autonomous" } }` → `autonomous: true` (existing nested `get()` fallback honored)
6. Explicit override: `mode: "autonomous"` + `workflow: { verifier_checkpoints: false }` → `verifier_checkpoints: false` (explicit beats preset-derived default)
7. Explicit opt-in outside autonomous: `mode: "yolo"` + `workflow: { decision_queue: true }` → `decision_queue: true`
8. Malformed JSON config → defaults returned, no throw
9. Back-compat: every pre-existing loadConfig key (auto_advance, model_profile, commit_docs, parallelization, ...) still present and unchanged for a yolo config

<file_tree>
plugins/devflow/devflow/bin/lib/
├── config.cjs                                  ← MODIFY (autonomous derivation + 2 workflow flags)
├── config.test.cjs                             ← CREATE (first-ever test file for config.cjs)
└── __fixtures__/
    └── autonomous-fixtures.cjs                 ← CREATE (hand-built fixture builders)
plugins/devflow/devflow/templates/
└── config.json                                 ← MODIFY (document autonomous preset keys)
.gitignore                                      ← MODIFY (autonomous marker patterns)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
@~/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Current loadConfig pattern (plugins/devflow/devflow/bin/lib/config.cjs:46-62)** — every key resolves via `get(key, {section, field})` with flat-key precedence over nested, then `?? defaults.X`:

```javascript
return {
  mode: get('mode', { section: 'workflow', field: 'mode' }) ?? defaults.mode,
  auto_advance: get('auto_advance', { section: 'workflow', field: 'auto_advance' }) ?? defaults.auto_advance,
  // ...
};
```

Follow this exact pattern. The autonomous derivation:

```javascript
const mode = get('mode', { section: 'workflow', field: 'mode' }) ?? defaults.mode;
const autonomous = mode === 'autonomous';
return {
  mode,
  autonomous,
  verifier_checkpoints: get('verifier_checkpoints', { section: 'workflow', field: 'verifier_checkpoints' }) ?? autonomous,
  decision_queue: get('decision_queue', { section: 'workflow', field: 'decision_queue' }) ?? autonomous,
  // ... existing keys unchanged
};
```

The catch branch (`return defaults`) must also carry `autonomous: false`, `verifier_checkpoints: false`, `decision_queue: false` in the defaults object so the shape is stable.

**Fixture builder pattern (from lib/__fixtures__/awareness-fixtures.cjs convention)** — hand-built factory functions with locked signatures, no LLM-generated sample data:

```javascript
'use strict';
const fs = require('fs');
const path = require('path');

function buildPlanningDirWithConfig(tmpdir, configObj) {
  const planning = path.join(tmpdir, '.planning');
  fs.mkdirSync(planning, { recursive: true });
  if (configObj !== null) {
    fs.writeFileSync(path.join(planning, 'config.json'),
      typeof configObj === 'string' ? configObj : JSON.stringify(configObj, null, 2));
  }
  return tmpdir;
}

module.exports = { buildPlanningDirWithConfig };
```

(`configObj === null` → no config file; string → write raw, enables malformed-JSON case.)

**Test style** — node native runner, `describe`/`test` from `node:test`, `assert` from `node:assert/strict`, temp dirs via `fs.mkdtempSync(path.join(os.tmpdir(), 'df-config-'))`, cleanup in `afterEach`.
</codebase_examples>

<anti_patterns>
- Do NOT change the default mode in templates/config.json — it stays `"yolo"`. Autonomous is opt-in.
- Do NOT alter yolo semantics anywhere in this TRD. Back-compat test (case 9) guards this.
- Do NOT use LLM-generated test data — fixtures are hand-built factories (resolver constraint `no_llm_test_data`).
- Do NOT add property-based testing libraries (`no_property_based_default`) or .feature files (`no_gherkin_layer`).
- Do NOT reference port 8080 anywhere — not even in test data or comments. Use 8091 if a port is ever needed.
</anti_patterns>

<error_recovery>
- If existing callers of loadConfig break (grep `loadConfig(` across bin/), the new keys are additive — only the defaults object changed shape. Verify no caller destructures with strict shape assertions.
- `npm test` runs the full suite; if unrelated tests fail, confirm they fail on main too before investigating (2 known pre-existing failures exist per STATE.md).
</error_recovery>

</embedded_context>

<gotchas>
- `cmdConfigGet` errors on missing keys with `Key not found` — hooks/workflows reading `config-get mode` on projects without a `mode` key must use the `|| echo "yolo"` shell fallback (already the established pattern in execute-objective.md:384).
- The `gates` block in templates/config.json contains `require_verification`/`require_tests` — those are DEAD and removed by TRD 10-08, NOT this TRD. Do not touch the gates block here (file-ownership: this TRD only adds workflow keys + docs comment).
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Fixture builder + autonomous preset resolution in loadConfig</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/autonomous-fixtures.cjs, plugins/devflow/devflow/bin/lib/config.test.cjs, plugins/devflow/devflow/bin/lib/config.cjs</files>
  <action>
First create `__fixtures__/autonomous-fixtures.cjs` with `buildPlanningDirWithConfig(tmpdir, configObj)` (hand-built factory, signature above — null = no file, string = raw write for malformed-JSON case).

Then RED: create `config.test.cjs` implementing the 9-case Test list above against `loadConfig` (require './config.cjs'). Run `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` — autonomous cases MUST fail (loadConfig has no autonomous key yet). Commit `test(10-01): add failing tests for autonomous config preset`.

Then GREEN: modify `loadConfig` in config.cjs per the codebase_examples pattern — derive `mode` once, add `autonomous` boolean, add `verifier_checkpoints` + `decision_queue` (explicit value wins, else preset-derived default = `autonomous`). Extend the `defaults` object with `autonomous: false, verifier_checkpoints: false, decision_queue: false`. Keep ALL existing keys byte-identical in behavior. Commit `feat(10-01): add autonomous mode preset to loadConfig`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/config.test.cjs → all 9+ cases pass; npm test → no new failures</verify>
  <done>loadConfig exposes autonomous/verifier_checkpoints/decision_queue with correct precedence; yolo back-compat case green</done>
</task>

<task type="auto">
  <name>Template documentation + gitignore marker patterns</name>
  <files>plugins/devflow/devflow/templates/config.json, .gitignore</files>
  <action>
In `templates/config.json`: add `"verifier_checkpoints": false` and `"decision_queue": false` to the existing `workflow` block (defaults OFF — the keys exist so `/devflow:settings` and users can discover them; setting `"mode": "autonomous"` flips their effective default to true via loadConfig). Do NOT change `"mode": "yolo"`. Do NOT touch the `gates` block (owned by TRD 10-08).

In `.gitignore`: under the existing "Internal planning documents" section (near the `.planning/.dup-detect-log.jsonl` entries), add with a one-line comment "Autonomous-mode runtime markers (objective 10) — session-local, not planning state":

```
.planning/.autonomous-resume-*
.planning/.autonomous-retry-*
```

Commit `chore(10-01): document autonomous preset in template + gitignore markers`.
  </action>
  <verify>grep -n "decision_queue" plugins/devflow/devflow/templates/config.json; grep -n "autonomous-resume" .gitignore; node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/devflow/templates/config.json','utf8'))" exits 0</verify>
  <done>Template parses as valid JSON with both new workflow keys; gitignore covers both marker patterns; mode default unchanged</done>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` — all cases green
- `npm test` — no regressions vs main baseline
- `grep -rn "8080" plugins/devflow/devflow/bin/lib/config.cjs plugins/devflow/devflow/bin/lib/config.test.cjs plugins/devflow/devflow/bin/lib/__fixtures__/autonomous-fixtures.cjs plugins/devflow/devflow/templates/config.json` → zero matches
- `node -e "const{loadConfig}=require('./plugins/devflow/devflow/bin/lib/config.cjs'); console.log(JSON.stringify(loadConfig('/nonexistent')))"` → includes `"autonomous":false`
</verification>

<success_criteria>
- [ ] mode "autonomous" resolves to autonomous:true with derived workflow flags
- [ ] yolo/interactive/missing-config all resolve autonomous:false; yolo behavior unchanged
- [ ] Fixture builder is hand-built (no generated data)
- [ ] Template valid JSON, default mode still yolo
- [ ] Marker file patterns gitignored
- [ ] 2 atomic commits (test + feat) + 1 chore commit
</success_criteria>

<output>
SUMMARY.md in .planning/objectives/10-autonomous-mode-overhaul/ named 10-01-SUMMARY.md
</output>

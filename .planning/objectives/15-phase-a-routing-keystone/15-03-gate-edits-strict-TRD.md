---
objective: 15-phase-a-routing-keystone
trd: "03"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/gate-edits.js
  - plugins/devflow/hooks/gate-edits.test.js
autonomous: true
requirements:
  - A3
must_haves:
  truths:
    - "gate-edits.js DENIES Edit/Write/MultiEdit by default in ambient mode (planning dir exists, no skill marker, no override)"
    - "gate-edits.js ALLOWS Edit/Write/MultiEdit when .planning/.skill-active marker file exists"
    - "gate-edits.js ALLOWS Edit/Write/MultiEdit when user prompt contains override phrase ('skip devflow', 'just edit', 'bypass devflow', 'force edit')"
    - "gate-edits.js permits .planning/** paths unchanged (planning artifacts always allowed)"
    - "gate-edits.js permits *.md paths unchanged (docs always allowed)"
    - "gate-edits.js never gates Read, Grep, Glob (only Edit, Write, MultiEdit)"
    - "gate-edits.js no-ops in non-DevFlow projects (no .planning dir)"
    - "gate-edits.js DEVFLOW_SKIP_EDIT_GATE=1 env var disables the gate"
    - "Override-phrase detection is case-insensitive"
    - "Override-phrase scope is single-turn (does not persist across calls)"
  artifacts:
    - path: "plugins/devflow/hooks/gate-edits.js"
      provides: "Strict DENY logic + skill-active marker check + override-phrase parsing + exported pure helpers"
      min_lines: 130
      exports: ["hasSkillActiveMarker", "hasOverridePhrase", "shouldGate", "OVERRIDE_PHRASES"]
    - path: "plugins/devflow/hooks/gate-edits.test.js"
      provides: "DENY/ALLOW matrix tests covering 8 scenarios (skill-active present/absent × override present/absent × .planning path × .md path) + subprocess e2e"
      min_lines: 180
  key_links:
    - from: "plugins/devflow/hooks/gate-edits.js"
      to: "filesystem at .planning/.skill-active"
      via: "fs.existsSync"
      pattern: "skill-active"
    - from: "plugins/devflow/hooks/gate-edits.js"
      to: "OVERRIDE_PHRASES list"
      via: "case-insensitive substring match against user_message"
      pattern: "OVERRIDE_PHRASES"
---

<objective>
Convert `gate-edits.js` from warn-only (`permissionDecision: 'ask'`) to strict-by-default DENY in ambient mode. Three escape hatches:

1. `.planning/.skill-active` marker file present (skill is currently running — written by `df-tools skill-active --start`, removed by `--end`)
2. User's prompt contains an override phrase: `skip devflow`, `just edit`, `bypass devflow`, `force edit` (case-insensitive)
3. `DEVFLOW_SKIP_EDIT_GATE=1` env var (debugging escape hatch)

Existing behavior preserved:
- `.planning/**` paths always allowed (planning artifacts get edited directly)
- `*.md` paths always allowed (documentation)
- Non-modifying tools (Read, Grep, Glob) never gated — gate only fires for Edit, Write, MultiEdit
- Non-DevFlow projects (no `.planning/`) — hook no-ops

Purpose: A3 from issue #26. The hard gate is the primary lever if route-intent.js + classify-session.js injection don't achieve ≥30% obedience over the 7-day pilot. Pure-logic helpers (`shouldGate`, `hasSkillActiveMarker`, `hasOverridePhrase`) so unit tests don't need tmpdirs for every assertion.

Output: Modified `gate-edits.js` with new DENY logic + exported helpers + new `gate-edits.test.js` covering the DENY/ALLOW matrix.
</objective>

<file_tree>
plugins/devflow/hooks/
├── gate-edits.js         ← MODIFY (strict DENY logic + override + skill-active check + exports)
└── gate-edits.test.js    ← CREATE
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: PreToolUse hook with permissionDecision (mirror current gate-edits.js)

The existing hook structure is preserved; only the decision logic changes.

```js
// plugins/devflow/hooks/gate-edits.js (after refactor)
'use strict';

const fs = require('fs');
const path = require('path');

const OVERRIDE_PHRASES = [
  'skip devflow',
  'just edit',
  'bypass devflow',
  'force edit',
];

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

// Pure: does the marker file exist?
function hasSkillActiveMarker(planningDir) {
  if (!planningDir) return false;
  return fs.existsSync(path.join(planningDir, '.skill-active'));
}

// Pure: does the user's prompt contain an override phrase?
function hasOverridePhrase(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false;
  const lower = userMessage.toLowerCase();
  return OVERRIDE_PHRASES.some(p => lower.includes(p));
}

// Pure: should the gate DENY this call?
// Inputs:
//   - tool: 'Edit' | 'Write' | 'MultiEdit' | other
//   - filePath: target path
//   - planningDir: ancestor .planning dir (or null)
//   - skillActive: boolean from hasSkillActiveMarker
//   - overrideActive: boolean from hasOverridePhrase
// Returns: { decision: 'deny' | 'allow' | 'noop', reason?: string }
function shouldGate({ tool, filePath, planningDir, skillActive, overrideActive }) {
  // Only gate Edit/Write/MultiEdit
  if (!/^(Edit|Write|MultiEdit)$/.test(tool)) return { decision: 'noop' };

  if (!filePath) return { decision: 'noop' };

  // Always allow planning artifacts and markdown docs
  if (/\/\.planning\//.test(filePath)) return { decision: 'allow', reason: 'planning artifact' };
  if (/\.md$/i.test(filePath)) return { decision: 'allow', reason: 'markdown doc' };

  // Non-DevFlow project — gate doesn't apply
  if (!planningDir) return { decision: 'noop' };

  // Active skill marker — allow
  if (skillActive) return { decision: 'allow', reason: 'skill-active marker present' };

  // Override phrase — allow
  if (overrideActive) return { decision: 'allow', reason: 'user override phrase detected' };

  // Default: DENY in ambient mode
  return {
    decision: 'deny',
    reason: [
      'DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.',
      'Route through a /devflow: skill so atomic commits + state tracking + verification fire correctly.',
      'For a tiny ad-hoc fix, prefer /devflow:quick.',
      'To bypass this gate explicitly, include "skip devflow" or "just edit" in your prompt.',
      'Skills mark themselves active via df-tools skill-active --start <name> / --end.',
    ].join(' '),
  };
}

function main() {
  if (process.env.DEVFLOW_SKIP_EDIT_GATE === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }

  const tool = input.tool_name;
  const filePath = (input.tool_input && input.tool_input.file_path) || '';
  const userMessage = input.user_message || input.prompt || '';

  const planningDir = findPlanningDir(process.cwd());
  const skillActive = hasSkillActiveMarker(planningDir);
  const overrideActive = hasOverridePhrase(userMessage);

  const result = shouldGate({ tool, filePath, planningDir, skillActive, overrideActive });

  if (result.decision === 'noop' || result.decision === 'allow') return;

  // DENY
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: result.reason,
    },
  };
  process.stdout.write(JSON.stringify(out));
}

if (require.main === module) main();

module.exports = {
  OVERRIDE_PHRASES,
  hasSkillActiveMarker,
  hasOverridePhrase,
  shouldGate,
  findPlanningDir,
};
```

### Pattern: DENY/ALLOW matrix test (mirror gate-interactive.test.js style)

```js
// gate-edits.test.js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gate-edits.js');
const { shouldGate, hasSkillActiveMarker, hasOverridePhrase, OVERRIDE_PHRASES } = require('./gate-edits.js');

describe('shouldGate decision matrix', () => {
  // Default args helper
  const base = {
    tool: 'Edit',
    filePath: '/proj/src/foo.ts',
    planningDir: '/proj/.planning',
    skillActive: false,
    overrideActive: false,
  };

  test('DENY: ambient + Edit + no marker + no override', () => {
    assert.equal(shouldGate(base).decision, 'deny');
  });

  test('ALLOW: ambient + Edit + skill-active marker', () => {
    assert.equal(shouldGate({ ...base, skillActive: true }).decision, 'allow');
  });

  test('ALLOW: ambient + Edit + override phrase', () => {
    assert.equal(shouldGate({ ...base, overrideActive: true }).decision, 'allow');
  });

  test('ALLOW: .planning path always allowed', () => {
    assert.equal(shouldGate({ ...base, filePath: '/proj/.planning/STATE.md' }).decision, 'allow');
  });

  test('ALLOW: .md path always allowed', () => {
    assert.equal(shouldGate({ ...base, filePath: '/proj/README.md' }).decision, 'allow');
  });

  test('NOOP: non-DevFlow project (no planningDir)', () => {
    assert.equal(shouldGate({ ...base, planningDir: null }).decision, 'noop');
  });

  test('NOOP: non-modifying tool (Read)', () => {
    assert.equal(shouldGate({ ...base, tool: 'Read' }).decision, 'noop');
  });

  test('NOOP: empty filePath', () => {
    assert.equal(shouldGate({ ...base, filePath: '' }).decision, 'noop');
  });
});

describe('hasOverridePhrase', () => {
  for (const phrase of ['skip devflow', 'just edit', 'bypass devflow', 'force edit']) {
    test(`detects "${phrase}" (case-insensitive)`, () => {
      assert.equal(hasOverridePhrase(`Please ${phrase} the bug`), true);
      assert.equal(hasOverridePhrase(`Please ${phrase.toUpperCase()} the bug`), true);
    });
  }

  test('returns false for prompts without override phrase', () => {
    assert.equal(hasOverridePhrase('Fix the login bug'), false);
    assert.equal(hasOverridePhrase(''), false);
    assert.equal(hasOverridePhrase(null), false);
    assert.equal(hasOverridePhrase(undefined), false);
  });
});

describe('hasSkillActiveMarker — fs interaction', () => {
  test('returns true when .skill-active file exists', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-marker-'));
    try {
      fs.mkdirSync(path.join(tmp, '.planning'));
      fs.writeFileSync(path.join(tmp, '.planning', '.skill-active'), '{}');
      assert.equal(hasSkillActiveMarker(path.join(tmp, '.planning')), true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('returns false when marker absent', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-no-marker-'));
    try {
      fs.mkdirSync(path.join(tmp, '.planning'));
      assert.equal(hasSkillActiveMarker(path.join(tmp, '.planning')), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('returns false when planningDir is null', () => {
    assert.equal(hasSkillActiveMarker(null), false);
  });
});

describe('subprocess e2e — DENY in ambient + no marker + no override', () => {
  // Uses spawnSync to verify the JSON-stdin → JSON-stdout contract
  test('emits permissionDecision: deny', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-e2e-deny-'));
    try {
      fs.mkdirSync(path.join(tmp, '.planning'));
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        user_message: 'Edit foo.ts please',
      };
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_SKIP_EDIT_GATE: undefined },
      });
      const out = JSON.parse(result.stdout);
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /ambient mode/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('subprocess e2e — ALLOW with marker', () => {
  test('no stdout when skill-active marker present', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-e2e-allow-'));
    try {
      fs.mkdirSync(path.join(tmp, '.planning'));
      fs.writeFileSync(path.join(tmp, '.planning', '.skill-active'), '{"skill":"build","started_at":"x","pid":1}');
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        user_message: 'Edit foo.ts please',
      };
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: JSON.stringify(payload),
        encoding: 'utf8',
      });
      assert.equal(result.stdout, '');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('env var escape', () => {
  test('DEVFLOW_SKIP_EDIT_GATE=1 disables gate even in ambient mode', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-edits-skip-'));
    try {
      fs.mkdirSync(path.join(tmp, '.planning'));
      const payload = {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp, 'src/foo.ts') },
        user_message: 'Edit foo.ts please',
      };
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        cwd: tmp,
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: { ...process.env, DEVFLOW_SKIP_EDIT_GATE: '1' },
      });
      assert.equal(result.stdout, '');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
```

</codebase_examples>

<anti_patterns>

- **Do NOT remove the `.planning/**` and `*.md` allow-paths.** They're load-bearing for editing planning docs and READMEs.
- **Do NOT gate non-modifying tools.** The PreToolUse matcher in hooks.json is `Edit|Write|MultiEdit` — this hook is only invoked for those. Defensive `if (!/^(Edit|Write|MultiEdit)$/.test(tool)) return { decision: 'noop' }` guards against future matcher changes.
- **Do NOT make the override phrase persistent.** Each Edit call must have its turn's prompt re-checked. This is automatic since PreToolUse fires per-tool-call with the current turn's `user_message` field.
- **Do NOT use `permissionDecision: 'ask'` anymore.** The new behavior is binary: DENY (default in ambient) or implicit allow (no stdout output). The 'ask' decision is the OLD warn-only mode being replaced.
- **Do NOT remove the `DEVFLOW_STRICT_EDITS` env var path silently.** It's a behavior change. Migration: replace `DEVFLOW_STRICT_EDITS=1` semantic with the new default-deny; replace the prior `DEVFLOW_STRICT_EDITS` documentation/references with `DEVFLOW_SKIP_EDIT_GATE=1` (the inverse). Search for `DEVFLOW_STRICT_EDITS` across the codebase: `grep -r "DEVFLOW_STRICT_EDITS"` — update any docs/CLAUDE.md references.
- **Do NOT match override phrases in arbitrary substrings.** `force edit` should match `please force edit foo.ts` but NOT `the force edit war` (different meaning). Pragmatic: substring match is acceptable for the override (false positives are a "user said the magic words" scenario). If the user is so adversarial they're trying to type around the gate, they're asking for it.

</anti_patterns>

<error_recovery>

- **`input.user_message` field doesn't exist** in the Claude Code PreToolUse payload: the schema may be `input.prompt` or `input.last_user_message` or undefined. The hook reads from `input.user_message || input.prompt || ''` defensively. If neither field is available, override phrases simply never match (worst case: user must use `DEVFLOW_SKIP_EDIT_GATE=1` to bypass). Test against an actual session log to confirm field name; if found different, update the read sites in both `main()` and the test fixtures.
- **`shouldGate` decision tree gives the wrong answer:** add a `console.error(JSON.stringify({tool, filePath, planningDir, skillActive, overrideActive, decision: result.decision, reason: result.reason}))` at the END of `main()` (stderr is non-blocking) for debugging. Remove before committing.
- **Pre-existing test for gate-edits.js exists somewhere:** none in the current tree (`ls plugins/devflow/hooks/gate-edits*` shows only the .js, no .test.*). If a hidden test exists, integrate with it; otherwise this is greenfield.
- **`DEVFLOW_STRICT_EDITS=1` referenced elsewhere in codebase:** check via `grep -r "DEVFLOW_STRICT_EDITS"` and update docs/CLAUDE.md to reference the new `DEVFLOW_SKIP_EDIT_GATE=1` inverse semantic. The behavior is now strict-by-default (the old `DEVFLOW_STRICT_EDITS=1` is now the default).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/15-phase-a-routing-keystone/15-CONTEXT.md
@.planning/objectives/15-phase-a-routing-keystone/15-RESEARCH.md

@plugins/devflow/hooks/gate-edits.js
@plugins/devflow/hooks/gate-interactive.js
@plugins/devflow/hooks/gate-interactive.test.js
@plugins/devflow/hooks/inject-org-context.test.js
</context>

<research_context>

## Override phrases (locked from 15-RESEARCH.md "Override-phrase parsing")

- `skip devflow`
- `just edit`
- `bypass devflow`
- `force edit`

Match: case-insensitive substring against the user's most recent prompt. Single-turn scope (PreToolUse fires per-call with the turn's prompt re-checked).

## Hook payload field for the user prompt

Empirical default order: `input.user_message || input.prompt || ''`. If neither is provided in the actual Claude Code payload, the override never fires and users must use `DEVFLOW_SKIP_EDIT_GATE=1` to bypass. Document this caveat in the SUMMARY for the v1.2 retro.

## Skill-active marker file format (from 15-RESEARCH.md)

Path: `<planningDir>/.skill-active` (i.e. `<project>/.planning/.skill-active`)

Content (written by `df-tools skill-active --start <name>` — see TRD 15-04):
```json
{
  "skill": "build",
  "started_at": "2026-05-04T14:23:11.412Z",
  "pid": 12345
}
```

`gate-edits.js` only checks **existence** — does NOT parse the JSON.

</research_context>

<gotchas>

- **Hook name and matcher already registered.** `hooks.json` has `Edit|Write|MultiEdit` → `gate-edits.js` already. No hooks.json edit needed for this TRD. Only the JS file changes.
- **`DEVFLOW_STRICT_EDITS` env var is the OLD inverse.** It used to mean "make the gate strict". The new world is strict-by-default. The new env var `DEVFLOW_SKIP_EDIT_GATE=1` disables the gate entirely. Migrate any references in CLAUDE.md or docs (search and replace).
- **Override phrase scoping.** PreToolUse hooks receive the current turn's prompt — each tool call gets re-checked. There's no need for marker files or TTLs; the schema gives us per-turn freshness automatically. If `user_message` is absent in payload, override never fires (graceful degradation).
- **Tests that mkdir tmp + .planning may race** if cleanup uses `force: true`. Always wrap in try/finally with explicit `fs.rmSync(tmp, { recursive: true, force: true })`.
- **subprocess test stdin must NOT be piped from terminal.** `spawnSync(node, [HOOK_PATH], { input: JSON.stringify(payload) })` is the correct pattern.
- **subprocess test must clear `DEVFLOW_SKIP_EDIT_GATE`.** When pre-existing env has it set (e.g. dev shell), tests will incorrectly pass. Pass `env: { ...process.env, DEVFLOW_SKIP_EDIT_GATE: undefined }` (or filter the env explicitly) on every test that exercises the gate.

</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD strict gate-edits.js with skill-active + override + DENY decision matrix</name>
  <files>
    plugins/devflow/hooks/gate-edits.js,
    plugins/devflow/hooks/gate-edits.test.js
  </files>
  <action>
RED → GREEN → REFACTOR for the strict gate.

**Habit 2 — test list FIRST. Decision matrix tests:**

`shouldGate(...)` truth table (write these test names BEFORE any implementation):
1. DENY: ambient + Edit + no marker + no override + non-planning + non-md path
2. ALLOW: ambient + skill-active marker (regardless of override)
3. ALLOW: ambient + override phrase (regardless of marker)
4. ALLOW: any path matching `/.planning/` (planning artifact override)
5. ALLOW: any path matching `\.md$` (docs override)
6. NOOP: planningDir null (non-DevFlow project)
7. NOOP: tool is `Read` / `Grep` / `Glob` / `Bash` (non-modifying)
8. NOOP: filePath is empty string

`hasOverridePhrase`:
9. Detects `skip devflow` case-insensitive
10. Detects `just edit` case-insensitive
11. Detects `bypass devflow` case-insensitive
12. Detects `force edit` case-insensitive
13. Returns false for null / undefined / empty / non-matching strings

`hasSkillActiveMarker` (fs interaction):
14. Returns true when `<planningDir>/.skill-active` exists (tmpdir + writeFileSync)
15. Returns false when marker absent (tmpdir without writeFileSync)
16. Returns false when planningDir is null

Subprocess e2e tests:
17. Ambient + Edit + no marker + no override → stdout has `permissionDecision: 'deny'` JSON
18. Ambient + Edit + skill-active marker → empty stdout (allow via no-op)
19. Ambient + Edit + override in user_message → empty stdout (allow via no-op)
20. Non-ambient (no .planning) + Edit → empty stdout (no-op)
21. Ambient + Read tool → empty stdout (gate doesn't apply)
22. Ambient + .md path → empty stdout (allowed)
23. Ambient + .planning path → empty stdout (allowed)
24. `DEVFLOW_SKIP_EDIT_GATE=1` env var → empty stdout regardless of other inputs

**Habit 3 — one test at a time:**

Phase RED: Write all 24 tests in `gate-edits.test.js`. They all fail (current gate-edits.js has no exports). Commit:
- `test(15-03): add failing tests for strict gate-edits decision matrix`

Phase GREEN: Refactor `gate-edits.js`:
- Extract `shouldGate(...)` pure function
- Extract `hasSkillActiveMarker(...)` (fs.existsSync wrapper)
- Extract `hasOverridePhrase(...)` (case-insensitive substring match)
- Wire `main()` to call all three + emit DENY JSON or no-op
- Add `module.exports = { shouldGate, hasSkillActiveMarker, hasOverridePhrase, OVERRIDE_PHRASES, findPlanningDir }`
- Wrap `main()` call in `if (require.main === module) main();`
- Replace prior `DEVFLOW_STRICT_EDITS` env var path with `DEVFLOW_SKIP_EDIT_GATE` inverse

Commit:
- `feat(15-03): convert gate-edits to strict-by-default with skill-active + override`

Phase REFACTOR (optional): If tests pass and there's a clean extraction (e.g. allow-path matcher), pull it out:
- `refactor(15-03): extract path-allowlist matcher`

**Habit 6 — verify isolation guard:**

This codebase is NOT multi-tenant — skip the multitenancy assertion. (Per global TDD playbook: "when applicable" — DevFlow is single-user.)

**Documentation update:**

After GREEN passes, update CLAUDE.md (root) and `plugins/devflow/devflow/references/auto-behaviors.md` if they reference the old `DEVFLOW_STRICT_EDITS` env var. Search:
```bash
grep -rn "DEVFLOW_STRICT_EDITS" --include="*.md"
```
Replace with mention of new strict-by-default behavior + `DEVFLOW_SKIP_EDIT_GATE=1` inverse.

# CRITICAL: Single-turn override scoping. Do NOT add marker-file persistence for the override phrase.
# GOTCHA: input.user_message vs input.prompt — try both; gracefully degrade to false if neither.
# PATTERN: gate-interactive.js for hook structure + permissionDecision JSON shape (existing exemplar).
  </action>
  <verify>
node --test plugins/devflow/hooks/gate-edits.test.js
# Must pass all 24+ tests.

# Verify exports + sanity-check decisions
node -e "
  const { shouldGate, hasOverridePhrase, OVERRIDE_PHRASES } = require('./plugins/devflow/hooks/gate-edits.js');
  console.log('OVERRIDE_PHRASES:', OVERRIDE_PHRASES);
  console.log('DENY (ambient + no marker + no override):',
    shouldGate({ tool: 'Edit', filePath: '/p/src/x.ts', planningDir: '/p/.planning', skillActive: false, overrideActive: false }).decision);
  console.log('ALLOW (skill-active):',
    shouldGate({ tool: 'Edit', filePath: '/p/src/x.ts', planningDir: '/p/.planning', skillActive: true, overrideActive: false }).decision);
  console.log('ALLOW (override):',
    shouldGate({ tool: 'Edit', filePath: '/p/src/x.ts', planningDir: '/p/.planning', skillActive: false, overrideActive: true }).decision);
  console.log('NOOP (non-modifying tool):',
    shouldGate({ tool: 'Read', filePath: '/p/src/x.ts', planningDir: '/p/.planning', skillActive: false, overrideActive: false }).decision);
  console.log('hasOverridePhrase(skip devflow please):', hasOverridePhrase('skip devflow please'));
  console.log('hasOverridePhrase(SKIP DEVFLOW please):', hasOverridePhrase('SKIP DEVFLOW please'));
  console.log('hasOverridePhrase(empty):', hasOverridePhrase(''));
"
# Expected:
#   OVERRIDE_PHRASES: [ 'skip devflow', 'just edit', 'bypass devflow', 'force edit' ]
#   DENY: deny
#   ALLOW (skill-active): allow
#   ALLOW (override): allow
#   NOOP: noop
#   hasOverridePhrase(skip devflow please): true
#   hasOverridePhrase(SKIP DEVFLOW please): true
#   hasOverridePhrase(empty): false

# Subprocess smoke test (DENY in ambient + Edit + no marker)
echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/x.ts"},"user_message":"edit it"}' | \
  cd /Users/markemerson/Source/devflow-claude-v1.1 && \
  node plugins/devflow/hooks/gate-edits.js
# Expected: JSON with permissionDecision: "deny" (because devflow-claude-v1.1 has .planning/)
  </verify>
  <done>
- 2 files modified (gate-edits.js, gate-edits.test.js)
- 24+ tests pass
- gate-edits.js exports `shouldGate`, `hasSkillActiveMarker`, `hasOverridePhrase`, `OVERRIDE_PHRASES`, `findPlanningDir`
- DENY/ALLOW matrix correct for all 8 scenarios
- 4 override phrases all detect (case-insensitive)
- skill-active marker check correct (tmpdir tests)
- DEVFLOW_SKIP_EDIT_GATE=1 disables the gate
- Old `DEVFLOW_STRICT_EDITS` references in docs updated to new inverse semantic
- 2-3 atomic commits per RED-GREEN-REFACTOR
  </done>
  <recovery>
If subprocess test passes but the smoke test against the actual repo's `gate-edits.js` doesn't DENY (returns empty stdout): check the env var. The dev shell may have `DEVFLOW_SKIP_EDIT_GATE=1` set globally. Run `unset DEVFLOW_SKIP_EDIT_GATE && echo $? then re-test`.

If `input.user_message` doesn't exist in real Claude Code payloads: tests still pass (they construct payloads explicitly). The runtime degradation is "override phrase never fires; user must use env var". Document this in SUMMARY.md as a known gap; future work can investigate the actual payload schema in a session log capture.

If the existing `DEVFLOW_STRICT_EDITS` env var is referenced by automated tests elsewhere: `grep -r "DEVFLOW_STRICT_EDITS" --include="*.test.*" --include="*.cjs" --include="*.js"`. If any test uses it, update the test to use the new semantic. If only docs reference it, update docs.

If REFACTOR breaks tests: skip the refactor commit (`git reset HEAD~1`). REFACTOR is optional in TDD playbook.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test>node --test plugins/devflow/hooks/gate-edits.test.js</test>
<lint>node -e "
  const { shouldGate } = require('./plugins/devflow/hooks/gate-edits.js');
  if (shouldGate({ tool: 'Edit', filePath: '/p/x.ts', planningDir: '/p/.planning', skillActive: false, overrideActive: false }).decision !== 'deny') process.exit(1);
"</lint>
</validation_gates>

<verification>
Acceptance criteria from #26 (this TRD covers A3):
- [ ] `gate-edits.js` denies direct Edit in ambient mode without skill marker — Task 1 test 1, 17
- [ ] `gate-edits.js` allows Edit when `.planning/.skill-active` exists — Task 1 test 2, 18
- [ ] `gate-edits.js` allows Edit on user override phrase — Task 1 test 3, 19
- [ ] Pre-existing 1551 tests still pass

Truth coverage:
- Truth #1 (DENY default): tests 1, 17
- Truth #2 (ALLOW with marker): tests 2, 18
- Truth #3 (ALLOW with override): tests 3, 19
- Truth #4 (.planning path allowed): tests 4, 23
- Truth #5 (.md path allowed): tests 5, 22
- Truth #6 (Read/Grep/Glob not gated): tests 7, 21
- Truth #7 (non-DevFlow no-op): tests 6, 20
- Truth #8 (env var escape): test 24
- Truth #9 (case-insensitive override): tests 9-12
- Truth #10 (single-turn override scope): structural — PreToolUse fires per-call with current prompt; no marker persistence in implementation
</verification>

<success_criteria>
- 2 files modified, all in `files_modified` frontmatter list
- 24+ new tests pass
- `npm test` full suite: 1551 + ~24 = ~1575 total
- 2-3 atomic commits per RED-GREEN-REFACTOR
- DEVFLOW_STRICT_EDITS references in docs migrated to new inverse semantic
- SUMMARY.md captures: test counts, commit hashes, before/after of decision logic, sample DENY reason text, note on `input.user_message` schema verification (if confirmed at execution)
</success_criteria>

<output>
After completion, create `.planning/objectives/15-phase-a-routing-keystone/15-03-SUMMARY.md`
</output>

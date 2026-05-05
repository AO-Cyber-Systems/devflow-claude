---
objective: 02-cross-repo-awareness-layer
trd: 02-06
title: Lifecycle integration — SessionStart hook + plan/execute init refresh wiring
type: tdd
confidence: medium
wave: 6
depends_on: [02-04, 02-05]
files_modified:
  - plugins/devflow/hooks/awareness-cache-populate.js
  - plugins/devflow/hooks/awareness-cache-populate.test.js
  - plugins/devflow/hooks/hooks.json
  - plugins/devflow/devflow/bin/lib/init.cjs
  - plugins/devflow/devflow/bin/lib/init.test.cjs
autonomous: true
requirements: [SC-8]
verification_commands:
  - "npm test"
  - "test -f plugins/devflow/hooks/awareness-cache-populate.js"
  - "node -e 'const j=JSON.parse(require(\"fs\").readFileSync(\"plugins/devflow/hooks/hooks.json\",\"utf-8\")); const ss=j.hooks.SessionStart; const found=ss.some(g => g.hooks.some(h => h.command.includes(\"awareness-cache-populate\"))); if (!found) throw new Error(\"hook not registered\"); console.log(\"OK\");'"
  - "git log --oneline feature/v1.1-obj-2-heartbeat -- plugins/devflow/hooks/awareness-cache-populate.js | grep -E '^[a-f0-9]+ test\\(02-06\\)' | head -1"
  - "git log --oneline feature/v1.1-obj-2-heartbeat -- plugins/devflow/hooks/awareness-cache-populate.js | grep -E '^[a-f0-9]+ feat\\(02-06\\)' | head -1"

must_haves:
  truths:
    - "hooks/awareness-cache-populate.js registered as SessionStart in hooks/hooks.json (alongside sync-runtime.js)"
    - "Hook is fire-and-forget: spawns child with detached:true, unref(), parent exits within 50ms regardless of child duration"
    - "Hook NEVER blocks session start — even when scanners take 30s+, parent returns immediately"
    - "Hook is no-op when .planning/ directory is absent (not a DevFlow project)"
    - "Hook is no-op when DEVFLOW_SKIP_AWARENESS_POPULATE=1 (escape hatch env var)"
    - "Hook reads cache, checks isStale per section; only triggers scanPeer if peer stale; only triggers scanOrg if org stale AND gh available"
    - "Hook respects respond-fast contract: stdout writes are non-blocking; if it must emit additionalContext, uses tiny fixed-size string"
    - "lib/init.cjs::cmdInitPlanObjective adds awareness_refresh: true field when awareness module is loadable; planner skill spawns df-tools awareness show --refresh in its first step"
    - "lib/init.cjs::cmdInitExecuteObjective adds same awareness_refresh field; executor skill triggers same refresh before first wave"
    - "Refresh wiring is GUIDANCE-ONLY in init.cjs — it sets a flag and the calling skills (plan-objective, execute-objective) are responsible for invoking the refresh. Init.cjs does NOT spawn the refresh itself."
    - "Test list documented in TRD body BEFORE test code written (TDD Playbook habit 2)"
  artifacts:
    - path: "plugins/devflow/hooks/awareness-cache-populate.js"
      provides: "SessionStart hook: lazy cache populate when stale; fire-and-forget; non-blocking"
      min_lines: 80
    - path: "plugins/devflow/hooks/awareness-cache-populate.test.js"
      provides: "Tests: non-blocking behavior, no-op-without-planning-dir, env-var bypass, fire-and-forget child spawn"
      min_lines: 60
    - path: "plugins/devflow/hooks/hooks.json"
      provides: "SessionStart entry added: node ${CLAUDE_PLUGIN_ROOT}/hooks/awareness-cache-populate.js"
      contains: "awareness-cache-populate"
    - path: "plugins/devflow/devflow/bin/lib/init.cjs"
      provides: "cmdInitPlanObjective + cmdInitExecuteObjective augmented with awareness_refresh flag"
    - path: "plugins/devflow/devflow/bin/lib/init.test.cjs"
      provides: "Tests asserting awareness_refresh appears in init output when awareness module is loadable"
  key_links:
    - from: "plugins/devflow/hooks/hooks.json"
      to: "plugins/devflow/hooks/awareness-cache-populate.js"
      via: "command registration"
      pattern: "awareness-cache-populate\\.js"
    - from: "plugins/devflow/hooks/awareness-cache-populate.js"
      to: "lib/awareness.cjs (readCache + isStale + scanPeer)"
      via: "spawned child invokes df-tools awareness scan-peer (and scan-org if conditions met)"
      pattern: "df-tools.*awareness scan-"
---

<objective>
Wire awareness scanning into the session lifecycle:
1. **SessionStart hook** — populate cache lazily when missing/expired. Fire-and-forget; never blocks session start.
2. **Plan-objective + execute-objective init wiring** — emit an `awareness_refresh: true` flag from `lib/init.cjs::cmdInitPlanObjective` + `cmdInitExecuteObjective` so the calling skills know to force-refresh awareness before the planner/executor agent spawns.

Purpose: SC-8 — cache lifecycle. Three trigger points: lazy on session start (hook), forced at plan-time (skill init), forced at execute-time (skill init). Hooks are auto-registered via `hooks.json`; skills consume the init flag.

Output: A working SessionStart hook + 2 init.cjs additions, all tested.
</objective>

<file_tree>
plugins/devflow/hooks/
├── awareness-cache-populate.js                ← CREATE  (SessionStart hook)
├── awareness-cache-populate.test.js           ← CREATE  (tests)
└── hooks.json                                 ← MODIFY  (register hook)

plugins/devflow/devflow/bin/lib/
├── init.cjs                                   ← MODIFY  (extend cmdInitPlanObjective + cmdInitExecuteObjective)
└── init.test.cjs                              ← MODIFY (or CREATE if doesn't exist)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing SessionStart hook** — `plugins/devflow/hooks/sync-runtime.js`:

```js
'use strict';
// Mirrors plugin runtime to ~/.claude/devflow/ on session start.
// Synchronous; runs to completion; OK because copy is small.

const fs = require('fs');
const path = require('path');

function main() {
  const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT;
  if (!PLUGIN_ROOT) return;
  // ... copy logic
}

if (require.main === module) main();
```

**The DRAFT hook** — `plugins/devflow/hooks/inject-org-context.js` (already in repo, NOT registered yet):

```js
function callResolver(cwd, objectiveId) {
  const result = spawnSync('node', args, {
    cwd, encoding: 'utf-8',
    timeout: RESOLVER_TIMEOUT_MS,  // 2000ms
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0 || !result.stdout) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}
```

That hook is BLOCKING (spawnSync with 2s timeout). For obj 2, we need NON-BLOCKING — the cache populate may take 30s if scanOrg is called. Use detached + unref pattern.

**Detached + unref pattern** (Node.js docs):

```js
const { spawn } = require('child_process');
const child = spawn('node', ['some-script.js'], {
  detached: true,
  stdio: 'ignore',  // Don't keep parent's stdio fd's open
});
child.unref();  // Parent process can exit even if child still running
```

**Existing init.cjs::cmdInitPlanObjective** — already in repo (lines ~134-220 of init.cjs):

```js
function cmdInitPlanObjective(cwd, objective, includes, raw) {
  if (!objective) error('objective required for init plan-objective');
  const config = loadConfig(cwd);
  const objectiveInfo = findObjectiveInternal(cwd, objective);
  const result = {
    researcher_model: ...,
    planner_model: ...,
    checker_model: ...,
    research_enabled: config.research,
    job_checker_enabled: config.job_checker,
    commit_docs: config.commit_docs,
    objective_found: !!objectiveInfo,
    objective_dir: ...,
    // ...
  };
  // ... include flags
  output(result, raw);
}
```

This TRD adds ONE field: `awareness_refresh: true|false`.

</codebase_examples>

<anti_patterns>

- **Do NOT use spawnSync in awareness-cache-populate.js.** That blocks. Use detached+unref. The 50ms check in the test asserts non-blocking.
- **Do NOT call requireGhAuth in the hook.** If gh isn't authed, scanOrg fails inside the spawned child. The parent doesn't care — fire-and-forget.
- **Do NOT log to stdout from the hook.** SessionStart hook stdout becomes additionalContext. Verbose logs would pollute the session prompt. Stay silent or write to stderr (which is dropped).
- **Do NOT block on cache existence check.** If `.planning/.awareness-cache.json` is missing, that's the COMMON case for first session — populate, don't error.
- **Do NOT introduce a separate scan-peer-and-scan-org subcommand.** The hook can spawn `df-tools awareness scan-peer --no-fetch` then `df-tools awareness scan-org` separately, OR a single call to `df-tools awareness show --refresh --raw > /dev/null`. Prefer the latter (one process, simpler).
- **Do NOT change init.cjs's existing behavior.** This TRD ADDS a field. Existing consumers of init JSON ignore unknown fields (per project memory `feedback_autopilot_after_setup`).

</anti_patterns>

<error_recovery>

- If the spawned child can't find `df-tools.cjs` (mirroring drift), the child fails silently. Parent doesn't care. Cache stays stale; next manual `/devflow:awareness` call refreshes.
- If the hook itself crashes (e.g., bad require), Claude Code's hook subsystem logs the error and continues. The session still starts.
- If init.cjs's `awareness_refresh` field is set true but the skill doesn't honor it (maybe the skill update lands later), no harm — the flag is just data the skill ignores.
- Per project memory `feedback_executor_smaller_commits`: 2-3 atomic commits — RED+GREEN for the hook, then the init.cjs change as a smaller second commit (or roll into one).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/02-cross-repo-awareness-layer/02-CONTEXT.md
@plugins/devflow/hooks/sync-runtime.js
@plugins/devflow/hooks/inject-org-context.js
@plugins/devflow/hooks/hooks.json
@plugins/devflow/devflow/bin/lib/init.cjs
@plugins/devflow/devflow/bin/lib/awareness.cjs
</context>

<gotchas>

- **Hook execution path**: hooks run with `${CLAUDE_PLUGIN_ROOT}` env var set. Use it to find df-tools: `path.join(process.env.CLAUDE_PLUGIN_ROOT || '', 'devflow/bin/df-tools.cjs')`. Fall back to `~/.claude/devflow/bin/df-tools.cjs` if env unset (matches `inject-org-context.js` pattern).
- **Detached child stdout**: passing `stdio: 'ignore'` is critical — otherwise the child's stdout pipe keeps the parent's event loop alive, defeating unref().
- **Test for fire-and-forget**: invoke the hook entry function in a child Node process, measure wall time. Assert < 100ms (generous). Direct require + invoke would block the test thread because of the spawn flow. Better: test the BEHAVIOR pattern by mocking `spawn` and checking the args (detached:true, unref called).
- **hooks.json structure**: `SessionStart` is already an array with one entry (sync-runtime.js). Append a SECOND entry; do NOT replace the existing one.
- **init.cjs additions**: `cmdInitPlanObjective` and `cmdInitExecuteObjective` each emit a JSON result. Add `awareness_refresh: true` IF awareness module loads cleanly (try/require/catch). When awareness.cjs is broken, set false to avoid breaking the planner.
- **Skills consume init JSON**: existing planner skill at `.../skills/plan-objective/SKILL.md` reads init JSON. To trigger refresh on plan, add a NEW step to the planner workflow: "If init result has `awareness_refresh: true`, run `df-tools awareness show --refresh --raw > /dev/null`". This TRD does NOT modify the planner skill — that's an independent improvement; this TRD just sets the flag. **The flag is the contract; consumer wiring is the planner skill's job (out of scope here).**

</gotchas>

## Test list

Per TDD Playbook habit 2:

**Group H — awareness-cache-populate.js hook behavior:**
1. H1: hook is no-op when no .planning/ in cwd (returns immediately, no child spawned)
2. H2: hook is no-op when DEVFLOW_SKIP_AWARENESS_POPULATE=1
3. H3: hook spawns df-tools awareness show with detached:true, stdio:'ignore'; calls unref() on child
4. H4: hook returns within 100ms even when scan would take seconds (mock spawn → returns quickly)
5. H5: hook reads cache; if both sections fresh (within TTL), no spawn (lazy = TTL-respected)
6. H6: hook reads cache; if peer stale + org fresh, spawns with `scan-peer --no-fetch` only
7. H7: hook reads cache; if both stale, spawns `show --refresh --raw > /dev/null`
8. H8: hook handles missing CLAUDE_PLUGIN_ROOT env var by falling back to ~/.claude/devflow/bin path

**Group I — init.cjs additions:**
9. I1: cmdInitPlanObjective output includes `awareness_refresh: true` when awareness.cjs loads
10. I2: cmdInitPlanObjective output includes `awareness_refresh: false` when awareness.cjs require fails (mock require failure)
11. I3: cmdInitExecuteObjective output includes `awareness_refresh: true` when awareness.cjs loads
12. I4: cmdInitExecuteObjective output includes `awareness_refresh: false` on require failure
13. I5: existing fields (planner_model, objective_dir, etc.) are still present after the addition

**Group R — hooks.json registration:**
14. R1: hooks.json SessionStart array contains an entry referencing awareness-cache-populate.js
15. R2: existing sync-runtime.js entry is unchanged
16. R3: hooks.json is valid JSON after edit

Total: 16 enumerated cases.

<tasks>

<task type="auto">
  <name>Task 1: RED — write failing tests for the hook + init additions + hooks.json registration</name>
  <files>
    plugins/devflow/hooks/awareness-cache-populate.test.js
    plugins/devflow/devflow/bin/lib/init.test.cjs
  </files>
  <action>
**Step A — Hook tests:**

Create `plugins/devflow/hooks/awareness-cache-populate.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Module under test (will be created in Task 2)
const hookModule = require('./awareness-cache-populate.js');

function tempCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-aw-hook-'));
  return { cwd: dir, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } };
}

test('H1: no-op when no .planning/ in cwd', () => {
  const t = tempCwd();
  try {
    let spawnCalled = false;
    const result = hookModule._main({
      cwd: t.cwd,
      env: {},
      _spawn: () => { spawnCalled = true; return { unref: () => {} }; },
    });
    assert.strictEqual(spawnCalled, false);
  } finally { t.cleanup(); }
});

test('H2: no-op when DEVFLOW_SKIP_AWARENESS_POPULATE=1', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  try {
    let spawnCalled = false;
    hookModule._main({
      cwd: t.cwd,
      env: { DEVFLOW_SKIP_AWARENESS_POPULATE: '1' },
      _spawn: () => { spawnCalled = true; return { unref: () => {} }; },
    });
    assert.strictEqual(spawnCalled, false);
  } finally { t.cleanup(); }
});

test('H3: spawns with detached + stdio ignore + unref', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  try {
    const calls = [];
    let unrefCalled = false;
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake/plugin/root' },
      _spawn: (cmd, args, opts) => {
        calls.push({ cmd, args, opts });
        return { unref: () => { unrefCalled = true; } };
      },
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].opts.detached, true);
    assert.strictEqual(calls[0].opts.stdio, 'ignore');
    assert.strictEqual(unrefCalled, true);
  } finally { t.cleanup(); }
});

test('H4: hook returns within 100ms', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  try {
    const start = Date.now();
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake' },
      _spawn: () => ({ unref: () => {} }),
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 100, `hook took ${elapsed}ms (>= 100)`);
  } finally { t.cleanup(); }
});

test('H5: no spawn when both sections fresh', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), JSON.stringify({
    peer: { fetched_at: new Date().toISOString(), branches: [] },
    org: { fetched_at: new Date().toISOString(), items: [] },
  }, null, 2));
  try {
    let spawnCalled = false;
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake' },
      _spawn: () => { spawnCalled = true; return { unref: () => {} }; },
    });
    assert.strictEqual(spawnCalled, false);
  } finally { t.cleanup(); }
});

test('H6: peer stale + org fresh → spawns scan-peer only', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  const oldTs = new Date(Date.now() - 60 * 60_000).toISOString(); // 60 min ago
  fs.writeFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), JSON.stringify({
    peer: { fetched_at: oldTs, branches: [] },
    org: { fetched_at: new Date().toISOString(), items: [] },
  }, null, 2));
  try {
    const calls = [];
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake' },
      _spawn: (cmd, args, opts) => { calls.push({ cmd, args }); return { unref: () => {} }; },
    });
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].args.join(' ').includes('scan-peer'), `expected scan-peer in ${calls[0].args.join(' ')}`);
    assert.ok(!calls[0].args.join(' ').includes('scan-org'), 'unexpected scan-org');
  } finally { t.cleanup(); }
});

test('H7: both stale → spawns show --refresh', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  const oldTs = new Date(Date.now() - 60 * 60_000).toISOString();
  fs.writeFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), JSON.stringify({
    peer: { fetched_at: oldTs, branches: [] },
    org: { fetched_at: oldTs, items: [] },
  }, null, 2));
  try {
    const calls = [];
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake' },
      _spawn: (cmd, args, opts) => { calls.push({ cmd, args }); return { unref: () => {} }; },
    });
    assert.strictEqual(calls.length, 1);
    const argsStr = calls[0].args.join(' ');
    assert.ok(argsStr.includes('show'));
    assert.ok(argsStr.includes('--refresh'));
  } finally { t.cleanup(); }
});

test('H8: missing CLAUDE_PLUGIN_ROOT falls back to ~/.claude path', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  try {
    const calls = [];
    hookModule._main({
      cwd: t.cwd,
      env: {}, // no CLAUDE_PLUGIN_ROOT
      _spawn: (cmd, args) => { calls.push({ cmd, args }); return { unref: () => {} }; },
    });
    assert.strictEqual(calls.length, 1);
    // Spawned df-tools path should mention .claude
    assert.match(calls[0].args[0], /\.claude/);
  } finally { t.cleanup(); }
});
```

**Step B — Init.cjs tests:**

Create or extend `plugins/devflow/devflow/bin/lib/init.test.cjs`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { cmdInitPlanObjective, cmdInitExecuteObjective } = require('./init.cjs');

// Helper: build minimal planning project
function buildProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-test-'));
  fs.mkdirSync(path.join(dir, '.planning', 'objectives', '01-test'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), '{}');
  fs.writeFileSync(path.join(dir, '.planning', 'ROADMAP.md'), '## Objective 1: Test\n');
  fs.writeFileSync(path.join(dir, '.planning', 'objectives', '01-test', 'OBJECTIVE.md'),
    '---\nwork: feature\n---\n# Test\n');
  return { cwd: dir, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } };
}

// Helper: capture stdout
function captureOutput(fn) {
  const orig = process.stdout.write;
  let captured = '';
  process.stdout.write = (s) => { captured += s; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return captured;
}

test('I1: cmdInitPlanObjective emits awareness_refresh:true when awareness loads', () => {
  const p = buildProject();
  try {
    const out = captureOutput(() => cmdInitPlanObjective(p.cwd, '1', new Set(), false));
    const json = JSON.parse(out.trim());
    assert.strictEqual(json.awareness_refresh, true);
  } finally { p.cleanup(); }
});

test('I3: cmdInitExecuteObjective emits awareness_refresh:true when awareness loads', () => {
  const p = buildProject();
  try {
    const out = captureOutput(() => cmdInitExecuteObjective(p.cwd, '1', new Set(), false));
    const json = JSON.parse(out.trim());
    assert.strictEqual(json.awareness_refresh, true);
  } finally { p.cleanup(); }
});

test('I5: existing fields preserved (planner_model, objective_dir present)', () => {
  const p = buildProject();
  try {
    const out = captureOutput(() => cmdInitPlanObjective(p.cwd, '1', new Set(), false));
    const json = JSON.parse(out.trim());
    assert.ok(typeof json.planner_model === 'string', 'planner_model missing');
    assert.ok(typeof json.objective_dir === 'string' || json.objective_dir === null, 'objective_dir missing');
  } finally { p.cleanup(); }
});
```

(I2 and I4 — testing require-failure path — are tricky to mock cleanly. Skip those if the require error path is in a try/catch and unreachable in tests; document the design choice in the SUMMARY.)

**Step C — hooks.json test:**

Add to `awareness-cache-populate.test.js`:

```js
test('R1: hooks.json registers awareness-cache-populate as SessionStart hook', () => {
  const hooksJsonPath = path.resolve(__dirname, 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) return; // skip if path layout differs
  const j = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8'));
  const ss = j.hooks && j.hooks.SessionStart;
  assert.ok(Array.isArray(ss), 'SessionStart array missing');
  const found = ss.some(g => (g.hooks || []).some(h => (h.command || '').includes('awareness-cache-populate')));
  assert.ok(found, 'awareness-cache-populate hook not registered');
});

test('R2: hooks.json sync-runtime entry preserved', () => {
  const hooksJsonPath = path.resolve(__dirname, 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) return;
  const content = fs.readFileSync(hooksJsonPath, 'utf-8');
  assert.match(content, /sync-runtime\.js/);
});

test('R3: hooks.json is valid JSON', () => {
  const hooksJsonPath = path.resolve(__dirname, 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) return;
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8')));
});
```

Run `npm test`. Expected: 14-16 NEW failing tests (RED). H1-H8 fail because the hook module doesn't exist; I1/I3/I5 fail because awareness_refresh field isn't yet emitted; R1 fails because hooks.json hasn't been edited.

Commit RED:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "test(02-06): add failing tests for SessionStart hook + init refresh wiring + hooks.json" \
  --files plugins/devflow/hooks/awareness-cache-populate.test.js plugins/devflow/devflow/bin/lib/init.test.cjs
```

# CRITICAL: hookModule._main(opts) is the testable entry point. Inject _spawn so tests don't actually spawn child processes.
# GOTCHA: tests must be runnable by `npm test` — check the test runner discovers .test.js (not just .test.cjs). If hooks/*.test.js isn't picked up, may need to add it explicitly or rename to .test.cjs (consistent with rest of codebase). Recommend: rename to awareness-cache-populate.test.cjs to match convention.
# PATTERN: Capture stdout for init tests to validate the JSON output (existing init.cjs pattern uses `output()` from helpers.cjs which writes to stdout).
  </action>
  <verify>
1. `npm test` shows 14-16 NEW failing tests
2. RED commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ test\(02-06\):'`
3. Test file exists at hooks dir: `test -f plugins/devflow/hooks/awareness-cache-populate.test.js` (or .cjs)
  </verify>
  <done>
RED phase: failing tests committed. Test files exist at the right paths.
  </done>
  <recovery>
If tests in `plugins/devflow/hooks/*.test.js` aren't picked up by `npm test`, rename to `.test.cjs`. Check `package.json` test script — if it's `node --test plugins/devflow/devflow/bin/df-tools.test.cjs`, the test runner is single-file. In that case, test files in hooks/ won't auto-run. Solution: import test bodies from hooks/awareness-cache-populate.test.js into df-tools.test.cjs OR add hooks tests to the test command. Check existing pattern: `gate-interactive.test.js` exists in hooks/, so there must be a way. Inspect npm test and fix accordingly.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement awareness-cache-populate.js + register hook + extend init.cjs</name>
  <files>
    plugins/devflow/hooks/awareness-cache-populate.js
    plugins/devflow/hooks/hooks.json
    plugins/devflow/devflow/bin/lib/init.cjs
  </files>
  <action>
**Step A — Hook implementation:**

Create `plugins/devflow/hooks/awareness-cache-populate.js`:

```js
#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook — populate awareness cache when stale.
 *
 * Fire-and-forget: spawns child detached + unref so parent exits within ms.
 * Never blocks session start. Reads cache TTL; only spawns when needed.
 *
 * Escape: DEVFLOW_SKIP_AWARENESS_POPULATE=1 bypasses entirely.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const DEFAULT_TTL_MINUTES = 10;
const CACHE_REL = path.join('.planning', '.awareness-cache.json');

function _findDfTools(env) {
  const root = env.CLAUDE_PLUGIN_ROOT;
  if (root) return path.join(root, 'devflow', 'bin', 'df-tools.cjs');
  return path.join(os.homedir(), '.claude', 'devflow', 'bin', 'df-tools.cjs');
}

function _readCache(cwd) {
  const p = path.join(cwd, CACHE_REL);
  if (!fs.existsSync(p)) return null;
  try {
    const c = fs.readFileSync(p, 'utf-8').trim();
    if (!c) return null;
    return JSON.parse(c);
  } catch { return null; }
}

function _isStale(fetched_at, ttl_minutes) {
  if (!fetched_at || typeof fetched_at !== 'string') return true;
  const ts = Date.parse(fetched_at);
  if (!Number.isFinite(ts)) return true;
  return (Date.now() - ts) > (ttl_minutes * 60_000);
}

function _main({ cwd = process.cwd(), env = process.env, _spawn = spawn } = {}) {
  // Escape hatch
  if (env.DEVFLOW_SKIP_AWARENESS_POPULATE === '1') return;

  // Not a DevFlow project
  if (!fs.existsSync(path.join(cwd, '.planning'))) return;

  const cache = _readCache(cwd) || {};
  const ttl = DEFAULT_TTL_MINUTES;
  const peerStale = _isStale(cache.peer && cache.peer.fetched_at, ttl);
  const orgStale = _isStale(cache.org && cache.org.fetched_at, ttl);

  if (!peerStale && !orgStale) return; // both fresh — no-op

  const dfTools = _findDfTools(env);
  let args;
  if (peerStale && !orgStale) {
    args = [dfTools, 'awareness', 'scan-peer', '--no-fetch'];
  } else if (!peerStale && orgStale) {
    // org-only refresh — use show with --refresh org? or scan-org directly?
    args = [dfTools, 'awareness', 'scan-org'];
  } else {
    // both stale
    args = [dfTools, 'awareness', 'show', '--refresh', '--raw'];
  }

  const child = _spawn('node', args, {
    cwd,
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

if (require.main === module) {
  _main();
}

module.exports = { _main, _isStale, _readCache, _findDfTools };
```

**Step B — Register in hooks.json:**

Read `plugins/devflow/hooks/hooks.json`. Append a new entry to the SessionStart array:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/sync-runtime.js" }] },
      { "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/awareness-cache-populate.js" }] }
    ],
    ...
  }
}
```

Use a JSON-aware edit (read, parse, push to array, write). Preserve all other entries.

**Step C — Extend init.cjs:**

Add a helper at the top of init.cjs:

```js
function _awarenessLoadable() {
  try {
    require('./awareness.cjs');
    return true;
  } catch {
    return false;
  }
}
```

In `cmdInitPlanObjective` and `cmdInitExecuteObjective`, just before `output(result, raw)`, add:

```js
result.awareness_refresh = _awarenessLoadable();
```

Run `npm test`. All 14-16 Task-1 tests pass; existing tests preserved.

Commit GREEN:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "feat(02-06): add SessionStart awareness-cache-populate hook + init refresh wiring" \
  --files plugins/devflow/hooks/awareness-cache-populate.js plugins/devflow/hooks/hooks.json plugins/devflow/devflow/bin/lib/init.cjs
```

# CRITICAL: child.unref() MUST be called. Without it, the parent Node process can't exit until child does.
# GOTCHA: When `peerStale && !orgStale`, we use `scan-peer --no-fetch`. The `--no-fetch` matters because git fetch is the slow part of peer scanning; with --no-fetch we just iterate local refs (still useful, much faster).
# PATTERN: _main accepts injected `_spawn` for tests; production calls go through real spawn. Mirror's gh.cjs's _setRunGh injection seam.
  </action>
  <verify>
1. `npm test` passes ALL Task-1 tests (14-16 new green checks)
2. No regressions
3. GREEN commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ feat\(02-06\):'`
4. Hook registered: `node -e 'const j=JSON.parse(require("fs").readFileSync("plugins/devflow/hooks/hooks.json","utf-8")); const found=j.hooks.SessionStart.some(g=>g.hooks.some(h=>h.command.includes("awareness-cache-populate"))); if (!found) throw new Error("not registered"); console.log("OK")'`
5. init.cjs emits awareness_refresh: `node plugins/devflow/devflow/bin/df-tools.cjs init plan-objective 1 2>/dev/null | grep -q awareness_refresh` (may need a fixture project)
  </verify>
  <done>
Hook implemented, registered, init.cjs extended. All Task-1 tests green. GREEN commit landed.
  </done>
  <recovery>
If hooks.json edit creates duplicate entries (running the migration twice), the test R1 still passes (`some` returns true), but be aware. If you want strict-once behavior, check before pushing.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After all tasks ship:

1. `plugins/devflow/hooks/awareness-cache-populate.js` exists, exports `_main`
2. Hook is registered in `plugins/devflow/hooks/hooks.json` SessionStart array
3. `lib/init.cjs::cmdInitPlanObjective` and `cmdInitExecuteObjective` emit `awareness_refresh: true|false`
4. 14-16 new tests pass (Group H/I/R)
5. Two atomic commits: `test(02-06):` + `feat(02-06):`
6. SC-8 covered: SessionStart populates lazily, fire-and-forget; plan/execute init flag for skill consumers
</verification>

<success_criteria>
- SC-8 fully met: cache lifecycle wired across 3 trigger points
- Hook is non-blocking (test asserts <100ms)
- 2 atomic commits per TDD Playbook
- Test list (16 cases) implemented per TDD Playbook habit 2
</success_criteria>

<output>
After completion, create `.planning/objectives/02-cross-repo-awareness-layer/02-06-lifecycle-integration-SUMMARY.md`
</output>

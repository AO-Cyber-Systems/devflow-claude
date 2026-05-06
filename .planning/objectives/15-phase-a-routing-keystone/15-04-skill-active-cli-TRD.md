---
objective: 15-phase-a-routing-keystone
trd: "04"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/skill-active.cjs
  - plugins/devflow/devflow/bin/lib/skill-active.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - A3
must_haves:
  truths:
    - "df-tools skill-active --start <name> writes .planning/.skill-active with {skill, started_at, pid} JSON"
    - "df-tools skill-active --end removes .planning/.skill-active"
    - "df-tools skill-active --status returns the marker JSON if present, or {active: false} if not"
    - "--start with no name argument returns error JSON via output() helper"
    - "--end is idempotent (no error if marker doesn't exist)"
    - "--start overwrites an existing marker (last-write-wins, no locking)"
    - "df-tools.cjs dispatcher routes 'skill-active' subcommand to lib/skill-active.cjs"
    - "All commands honor --raw flag for JSON-only output (no human framing)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/skill-active.cjs"
      provides: "cmdSkillActive entry + startSkill / endSkill / statusSkill pure helpers"
      min_lines: 90
      exports: ["cmdSkillActive", "startSkill", "endSkill", "statusSkill"]
    - path: "plugins/devflow/devflow/bin/lib/skill-active.test.cjs"
      provides: "Unit tests for start/end/status flows + idempotency + bad input"
      min_lines: 130
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "Dispatcher case for 'skill-active' subcommand"
      min_lines: 1
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/skill-active.cjs"
      via: "require + dispatcher case"
      pattern: "skill-active"
    - from: "lib/skill-active.cjs"
      to: ".planning/.skill-active marker file"
      via: "fs.writeFileSync / fs.unlinkSync"
      pattern: "\\.skill-active"
---

<objective>
Add `df-tools skill-active --start <name>` / `--end` / `--status` CLI subcommand. The marker file (`<project>/.planning/.skill-active`) signals to `gate-edits.js` (TRD 15-03) that a DevFlow skill is currently running and direct Edit/Write/MultiEdit should be allowed.

Skills opt into the marker pattern by calling:
- `df-tools skill-active --start <skill-name>` at workflow entry
- `df-tools skill-active --end` at workflow exit (and on error paths)

Bulk migration of existing 28 skills to use the marker is OUT OF SCOPE for this objective (follow-up). This TRD ships the CLI surface only. Phase B's `/devflow:micro` skill (obj 7) will be the canonical first consumer.

Purpose: A3 (supporting infrastructure) from issue #26. Without this CLI, the gate-edits.js DENY behavior would have no escape hatch for legitimate skill-driven edits.

Output: New `lib/skill-active.cjs` module + tests + dispatcher entry in `df-tools.cjs`.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                              ← MODIFY (add 'skill-active' dispatcher case)
└── lib/
    ├── skill-active.cjs                      ← CREATE
    └── skill-active.test.cjs                 ← CREATE
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: lib/<feature>.cjs CLI module (mirror brownfield-detector.cjs)

```js
// plugins/devflow/devflow/bin/lib/skill-active.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');

// ─── fs injection (for testability) ──────────────────────────────────────────

const realFs = {
  existsSync: fs.existsSync,
  mkdirSync: (...a) => fs.mkdirSync(...a),
  writeFileSync: (...a) => fs.writeFileSync(...a),
  unlinkSync: (...a) => fs.unlinkSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
};
let _runFs = realFs;

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// ─── Pure functions (testable without filesystem injection) ──────────────────

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (_runFs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

function markerPath(planningDir) {
  return path.join(planningDir, '.skill-active');
}

// ─── Operations ──────────────────────────────────────────────────────────────

function startSkill({ planningDir, skillName, pid, now }) {
  if (!planningDir) {
    return { ok: false, reason: 'no-planning-dir', message: 'No .planning/ directory found in cwd or ancestors' };
  }
  if (!skillName || typeof skillName !== 'string' || !skillName.trim()) {
    return { ok: false, reason: 'missing-skill-name', message: 'skill-active --start requires <skill-name> argument' };
  }

  const payload = {
    skill: skillName.trim(),
    started_at: now,
    pid,
  };
  _runFs.writeFileSync(markerPath(planningDir), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { ok: true, marker: payload, path: markerPath(planningDir) };
}

function endSkill({ planningDir }) {
  if (!planningDir) {
    return { ok: false, reason: 'no-planning-dir', message: 'No .planning/ directory found in cwd or ancestors' };
  }
  const p = markerPath(planningDir);
  if (!_runFs.existsSync(p)) {
    return { ok: true, removed: false, message: 'Marker did not exist (idempotent no-op)' };
  }
  _runFs.unlinkSync(p);
  return { ok: true, removed: true };
}

function statusSkill({ planningDir }) {
  if (!planningDir) {
    return { active: false, reason: 'no-planning-dir' };
  }
  const p = markerPath(planningDir);
  if (!_runFs.existsSync(p)) {
    return { active: false };
  }
  try {
    const raw = _runFs.readFileSync(p, 'utf8');
    return { active: true, marker: JSON.parse(raw), path: p };
  } catch (e) {
    return { active: true, marker: null, path: p, parse_error: e.message };
  }
}

// ─── CLI entry ───────────────────────────────────────────────────────────────

function cmdSkillActive(cwd, args, raw) {
  const planningDir = findPlanningDir(cwd);

  // Parse: skill-active <op> [name]
  // Supported: --start <name>, --end, --status, start <name>, end, status
  const op = (args[0] || '').replace(/^--/, '');
  const skillName = args[1];

  if (op === 'start') {
    const result = startSkill({
      planningDir,
      skillName,
      pid: process.pid,
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      error(result.message || 'skill-active --start failed', result);
      return;
    }
    output(result, raw, `Started skill: ${result.marker.skill} (marker at ${result.path})`);
    return;
  }

  if (op === 'end') {
    const result = endSkill({ planningDir });
    if (!result.ok) {
      error(result.message || 'skill-active --end failed', result);
      return;
    }
    output(result, raw, result.removed ? 'Ended skill (marker removed)' : 'No active skill (idempotent)');
    return;
  }

  if (op === 'status') {
    const result = statusSkill({ planningDir });
    output(result, raw, result.active ? `Active: ${result.marker?.skill || 'unknown'}` : 'No active skill');
    return;
  }

  error('Unknown skill-active subcommand. Available: --start <name>, --end, --status');
}

module.exports = {
  cmdSkillActive,
  startSkill,
  endSkill,
  statusSkill,
  findPlanningDir,
  markerPath,
  _setRunFs,
  _resetMocks,
};
```

### Pattern: dispatcher case in df-tools.cjs (mirror existing 'detect' case)

```js
// In df-tools.cjs, add near the existing 'detect' case:
const { cmdSkillActive } = require('./lib/skill-active.cjs');

// ... in the switch:
case 'skill-active': {
  // df-tools skill-active --start <name>
  // df-tools skill-active --end
  // df-tools skill-active --status
  cmdSkillActive(cwd, args.slice(1), raw);
  break;
}
```

Also update the top-of-file CLI documentation comment (the `* Atomic Commands:` block) with:

```
 *   skill-active --start <name>        Mark skill as active (writes .planning/.skill-active)
 *   skill-active --end                 Mark skill as ended (removes .planning/.skill-active)
 *   skill-active --status              Show active skill marker (or {active:false})
```

### Pattern: pure-fn test (mirror brownfield-detector.test.cjs / skill-route.test.cjs)

```js
// plugins/devflow/devflow/bin/lib/skill-active.test.cjs
'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cmdSkillActive, startSkill, endSkill, statusSkill, markerPath, _resetMocks } = require('./skill-active.cjs');

function mkAmbient() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-active-'));
  fs.mkdirSync(path.join(root, '.planning'));
  return { root, planningDir: path.join(root, '.planning') };
}

describe('startSkill', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => { fs.rmSync(env.root, { recursive: true, force: true }); _resetMocks(); });

  test('writes marker JSON with {skill, started_at, pid}', () => {
    const result = startSkill({ planningDir: env.planningDir, skillName: 'build', pid: 1234, now: '2026-05-04T00:00:00Z' });
    assert.equal(result.ok, true);
    const raw = fs.readFileSync(markerPath(env.planningDir), 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.skill, 'build');
    assert.equal(parsed.started_at, '2026-05-04T00:00:00Z');
    assert.equal(parsed.pid, 1234);
  });

  test('returns ok:false when planningDir is null', () => {
    const result = startSkill({ planningDir: null, skillName: 'build', pid: 1, now: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-planning-dir');
  });

  test('returns ok:false when skillName is missing/empty', () => {
    for (const name of [undefined, null, '', '   ']) {
      const result = startSkill({ planningDir: env.planningDir, skillName: name, pid: 1, now: 'x' });
      assert.equal(result.ok, false, `expected fail for skillName=${JSON.stringify(name)}`);
      assert.equal(result.reason, 'missing-skill-name');
    }
  });

  test('overwrites existing marker (last-write-wins)', () => {
    startSkill({ planningDir: env.planningDir, skillName: 'first', pid: 1, now: 'a' });
    startSkill({ planningDir: env.planningDir, skillName: 'second', pid: 2, now: 'b' });
    const raw = fs.readFileSync(markerPath(env.planningDir), 'utf8');
    assert.equal(JSON.parse(raw).skill, 'second');
  });
});

describe('endSkill', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => { fs.rmSync(env.root, { recursive: true, force: true }); _resetMocks(); });

  test('removes marker when present', () => {
    startSkill({ planningDir: env.planningDir, skillName: 'build', pid: 1, now: 'x' });
    assert.equal(fs.existsSync(markerPath(env.planningDir)), true);
    const result = endSkill({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(result.removed, true);
    assert.equal(fs.existsSync(markerPath(env.planningDir)), false);
  });

  test('idempotent: no error when marker absent', () => {
    const result = endSkill({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(result.removed, false);
  });

  test('returns ok:false when planningDir is null', () => {
    const result = endSkill({ planningDir: null });
    assert.equal(result.ok, false);
  });
});

describe('statusSkill', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => { fs.rmSync(env.root, { recursive: true, force: true }); _resetMocks(); });

  test('returns active:false when no marker', () => {
    assert.deepEqual(statusSkill({ planningDir: env.planningDir }), { active: false });
  });

  test('returns active:true + marker JSON when present', () => {
    startSkill({ planningDir: env.planningDir, skillName: 'build', pid: 99, now: '2026-01-01' });
    const result = statusSkill({ planningDir: env.planningDir });
    assert.equal(result.active, true);
    assert.equal(result.marker.skill, 'build');
    assert.equal(result.marker.pid, 99);
  });

  test('returns active:false with reason no-planning-dir when planningDir null', () => {
    const result = statusSkill({ planningDir: null });
    assert.equal(result.active, false);
    assert.equal(result.reason, 'no-planning-dir');
  });
});

describe('cmdSkillActive — dispatcher integration', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => { fs.rmSync(env.root, { recursive: true, force: true }); _resetMocks(); });

  test('--start <name> writes marker (full CLI path)', () => {
    cmdSkillActive(env.root, ['--start', 'build'], true);
    assert.equal(fs.existsSync(markerPath(env.planningDir)), true);
  });

  test('--end removes marker', () => {
    cmdSkillActive(env.root, ['--start', 'build'], true);
    cmdSkillActive(env.root, ['--end'], true);
    assert.equal(fs.existsSync(markerPath(env.planningDir)), false);
  });

  test('start <name> (no -- prefix) also works', () => {
    cmdSkillActive(env.root, ['start', 'build'], true);
    assert.equal(fs.existsSync(markerPath(env.planningDir)), true);
  });
});
```

</codebase_examples>

<anti_patterns>

- **Do NOT add file locking.** Concurrent skills aren't supported; last-write-wins is correct semantically.
- **Do NOT clean up stale markers automatically.** If `started_at >24h ago` or `pid` is dead, leave it (skill must call `--end` itself; if it crashed, follow-up cleanup tooling can address it).
- **Do NOT shell out to `git rev-parse`** to find the project root. Use `findPlanningDir(process.cwd())` walk up — same pattern as every other DevFlow tool.
- **Do NOT couple to `df-tools state` or any other state machinery.** This is a pure file-marker, deliberately simple. Other tools can read/write the marker directly without going through df-tools.
- **Do NOT validate the skill name against a list of known skills.** Caller-supplied; opaque to this tool. The caller is the skill itself.
- **Do NOT make `--end` print an error when the marker was already absent.** `--end` is idempotent — it's the natural cleanup call on every error path. Erroring on absence makes skills fragile.

</anti_patterns>

<error_recovery>

- **Marker write fails (EACCES, ENOSPC):** `fs.writeFileSync` throws. Wrap in try/catch and return `{ ok: false, reason: 'write-failed', message: e.message }`. Caller (the skill) decides whether to abort or proceed without the marker.
- **JSON parse fails on `--status` (corrupted marker):** `statusSkill` returns `{ active: true, marker: null, parse_error: '...' }`. The gate (15-03) treats existence as truthy regardless, so the gate still allows. Callers wanting valid marker can re-write via `--start`.
- **`output()` / `error()` helper signatures don't match expectations:** read `lib/helpers.cjs` to confirm the API. Likely: `output(obj, raw, humanText)` writes JSON if raw=true else humanText; `error(msg, [data])` writes to stderr and exits non-zero. Mirror existing usage in skill-route.cjs / brownfield-detector.cjs.
- **df-tools.cjs dispatcher case ordering:** insert the `case 'skill-active'` block after a similar atomic command (e.g. after `case 'detect'` or near the existing CLI commands block). Ordering doesn't affect behavior; alphabetical or grouped-by-domain is fine.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/15-phase-a-routing-keystone/15-CONTEXT.md
@.planning/objectives/15-phase-a-routing-keystone/15-RESEARCH.md

@plugins/devflow/devflow/bin/df-tools.cjs
@plugins/devflow/devflow/bin/lib/brownfield-detector.cjs
@plugins/devflow/devflow/bin/lib/brownfield-detector.test.cjs
@plugins/devflow/devflow/bin/lib/skill-route.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
</context>

<research_context>

## Marker file format (locked from 15-RESEARCH.md)

Path: `<project>/.planning/.skill-active`

Content:
```json
{
  "skill": "build",
  "started_at": "2026-05-04T14:23:11.412Z",
  "pid": 12345
}
```

`gate-edits.js` (TRD 15-03) only checks **existence** — does NOT parse the JSON. The fields are diagnostic for `df-tools skill-active --status` and post-mortem debugging.

## CLI surface (locked)

```bash
df-tools skill-active --start <skill-name>   # writes marker
df-tools skill-active --end                  # removes marker (idempotent)
df-tools skill-active --status               # show marker JSON or {active:false}
```

Also accept `start`/`end`/`status` without `--` prefix for ergonomics.

## No bulk skill migration in this objective

Phase B (`/devflow:micro`, obj 7) is the canonical first consumer. Existing 28 skills do NOT need to call `--start/--end` for this objective to ship. They opt in incrementally — the gate denies them all when the marker is absent, but the user can use the override phrase as a workaround during the migration window.

## Helpers available

`lib/helpers.cjs` exports `output(obj, raw, humanText)` and `error(msg, [data])` — used by all df-tools subcommands. Mirror the call sites in `skill-route.cjs` and `brownfield-detector.cjs`.

</research_context>

<gotchas>

- **`args` parameter to `cmdSkillActive`** is the slice AFTER the `skill-active` keyword — e.g. for invocation `df-tools skill-active --start build`, the dispatcher passes `args = ['--start', 'build']`. Verify by looking at how `detect` / `frontmatter` cases pass args in df-tools.cjs.
- **`process.pid`** is the df-tools subprocess PID, not the skill's PID. Skills don't have a stable PID — they're ephemeral Claude tool calls. Recording the df-tools call's PID is acceptable diagnostic; document this in the SUMMARY.
- **`now: new Date().toISOString()`** is computed at the CLI entry, NOT inside `startSkill` (so `startSkill` is pure-testable with deterministic timestamps).
- **`fs.writeFileSync` truncates by default.** No need for explicit truncation flag. Last-write-wins is automatic.
- **`fs.unlinkSync` throws ENOENT if file absent.** Always guard with `existsSync` first (see `endSkill` impl).
- **Test isolation:** every test uses `mkdtempSync` and cleans up via `try/finally`. The tests do NOT mock fs (`_setRunFs` is exposed but optional) — real tmpdir + real fs is more reliable for this domain.

</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD lib/skill-active.cjs CLI module + df-tools.cjs dispatcher</name>
  <files>
    plugins/devflow/devflow/bin/lib/skill-active.cjs,
    plugins/devflow/devflow/bin/lib/skill-active.test.cjs,
    plugins/devflow/devflow/bin/df-tools.cjs
  </files>
  <action>
RED → GREEN → REFACTOR for the skill-active CLI.

**Habit 2 — test list FIRST:**

`startSkill` (pure):
1. Writes marker JSON with {skill, started_at, pid} to `<planningDir>/.skill-active`
2. Returns `{ok: false, reason: 'no-planning-dir'}` when planningDir is null
3. Returns `{ok: false, reason: 'missing-skill-name'}` when skillName is null/undefined/empty/whitespace
4. Overwrites existing marker (last-write-wins)
5. Marker file is valid JSON (round-trip parse)
6. Marker file content matches `{skill, started_at, pid}` shape exactly

`endSkill` (pure):
7. Removes marker when present
8. Idempotent: returns `{ok: true, removed: false}` when marker absent (no error)
9. Returns `{ok: false}` when planningDir is null

`statusSkill` (pure):
10. Returns `{active: false}` when marker absent
11. Returns `{active: true, marker: <obj>}` when marker present
12. Returns `{active: false, reason: 'no-planning-dir'}` when planningDir null
13. Returns `{active: true, marker: null, parse_error: ...}` when marker file is corrupt JSON

`cmdSkillActive` (dispatcher integration):
14. `--start <name>` writes marker (full path: `cmdSkillActive(cwd, ['--start', 'build'], true)`)
15. `--end` removes marker
16. `--status` reports correctly
17. `start <name>` (no `--` prefix) works equivalently
18. `end` (no `--` prefix) works equivalently
19. `--start` with no name argument calls `error()` (test via mocking process.exit / capturing stderr — or just assert via a try/catch around the call expecting non-zero exit; mirror skill-route.test.cjs error-path tests)
20. Unknown subcommand calls `error()`

**Habit 4 — fixtures:**

The fixture pattern here is just `mkAmbient()` helper — mkdtemp + mkdir `.planning`. No need for a separate `__fixtures__/skill-active-fixtures.cjs` (the helper is small enough to inline in the test file). If extracted, place it in `__fixtures__/` per convention.

**Habit 3 — one test at a time:**

RED commit: write all 20 tests in `skill-active.test.cjs`. They all fail (module doesn't exist).
- `test(15-04): add failing tests for skill-active CLI`

GREEN commit: implement `lib/skill-active.cjs` per the codebase_examples block + add `case 'skill-active'` dispatcher to `df-tools.cjs` + update the top-of-file CLI documentation comment block.
- `feat(15-04): add df-tools skill-active CLI for skill-active marker`

REFACTOR (optional): extract `findPlanningDir` to a shared helper if not already (already exists in helpers; check before duplicating).
- `refactor(15-04): use shared findPlanningDir helper`

**Phase A integration verification:**

After GREEN passes, smoke-test the CLI:
```bash
cd /tmp && mkdir -p test-skill && cd test-skill && mkdir .planning
node /Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/df-tools.cjs skill-active --start build --raw
cat .planning/.skill-active   # should print JSON
node /Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/df-tools.cjs skill-active --status --raw
node /Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/df-tools.cjs skill-active --end --raw
ls -la .planning/.skill-active   # should be ENOENT
```

If smoke test passes, commit + clean up.

# CRITICAL: Marker file is at <planningDir>/.skill-active (inside .planning/), NOT at project root.
# GOTCHA: process.pid is the df-tools subprocess PID, not the calling skill's. Document in SUMMARY.
# PATTERN: brownfield-detector.cjs for two-tier API + helpers.cjs output()/error() integration.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/skill-active.test.cjs
# Must pass all 20+ tests.

# Smoke test the CLI
TMP=$(mktemp -d) && mkdir "$TMP/.planning" && cd "$TMP" && \
  node /Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/df-tools.cjs skill-active --start build --raw && \
  test -f .planning/.skill-active && \
  node /Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/df-tools.cjs skill-active --status --raw | grep -q '"active":true' && \
  node /Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/df-tools.cjs skill-active --end --raw && \
  test ! -f .planning/.skill-active && \
  echo "smoke test passed" && rm -rf "$TMP"
# Expected: "smoke test passed"

# Verify dispatcher registration
node -e "
  const { cmdSkillActive } = require('./plugins/devflow/devflow/bin/lib/skill-active.cjs');
  console.log('cmdSkillActive:', typeof cmdSkillActive);
"
# Expected: cmdSkillActive: function
  </verify>
  <done>
- 3 files modified (skill-active.cjs, skill-active.test.cjs, df-tools.cjs)
- 20+ tests pass
- skill-active.cjs exports cmdSkillActive, startSkill, endSkill, statusSkill, markerPath
- df-tools.cjs has dispatcher case for 'skill-active' with proper args.slice(1) call
- df-tools.cjs top-of-file CLI doc comment lists skill-active commands
- CLI smoke test passes (start writes, status reads, end removes, idempotent)
- 2-3 atomic commits per RED-GREEN-REFACTOR
  </done>
  <recovery>
If `output()` / `error()` from `helpers.cjs` have a different signature than expected: re-read helpers.cjs. The pattern in skill-route.cjs / brownfield-detector.cjs is canonical — match exactly.

If the dispatcher case insertion produces a syntax error in df-tools.cjs: revert (`git checkout plugins/devflow/devflow/bin/df-tools.cjs`) and re-edit with care to commas/braces. The file is large; an Edit tool insertion at the right anchor (e.g. after the `case 'detect'` block) is cleanest.

If a test asserts a specific error code from `error()` and the helper exits the process: tests can spawn subprocess (`spawnSync(node, ['df-tools.cjs', 'skill-active'], ...)`) and assert non-zero exit. Or extract the error path into a function that throws (testable) and have main() catch + call error(). Mirror skill-route.test.cjs for this pattern.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test>node --test plugins/devflow/devflow/bin/lib/skill-active.test.cjs</test>
<lint>node /Users/markemerson/Source/devflow-claude-v1.1/plugins/devflow/devflow/bin/df-tools.cjs --help 2>&1 | grep -q "skill-active" || exit 1</lint>
</validation_gates>

<verification>
Acceptance criterion from #26 (this TRD covers A3 supporting infrastructure):
- [ ] `gate-edits.js` allows Edit when `.planning/.skill-active` exists — depends on this TRD's marker writer (Task 1 tests 1, 14)
- [ ] Pre-existing 1551 tests still pass

Truth coverage:
- Truth #1 (--start writes marker JSON): tests 1, 5, 6, 14
- Truth #2 (--end removes marker): tests 7, 15
- Truth #3 (--status returns marker JSON or active:false): tests 10-13, 16
- Truth #4 (--start without name errors): test 19, 3
- Truth #5 (--end idempotent): test 8
- Truth #6 (--start overwrites): test 4
- Truth #7 (df-tools dispatcher routing): tests 14-18
- Truth #8 (--raw flag): smoke test verifies via grep '"active":true'
</verification>

<success_criteria>
- 3 files modified, all in `files_modified` frontmatter list
- 20+ new tests pass
- `npm test` full suite: 1551 + ~20 = ~1571 total
- 2-3 atomic commits per RED-GREEN-REFACTOR
- CLI smoke test passes
- df-tools.cjs --help (or top-of-file doc block) includes skill-active commands
- SUMMARY.md captures: test counts, commit hashes, sample marker JSON output, smoke-test transcript
</success_criteria>

<output>
After completion, create `.planning/objectives/15-phase-a-routing-keystone/15-04-SUMMARY.md`
</output>

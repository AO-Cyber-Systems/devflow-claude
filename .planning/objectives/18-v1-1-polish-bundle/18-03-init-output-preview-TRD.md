---
objective: 18-v1-1-polish-bundle
trd: 18-03
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/init.cjs
  - plugins/devflow/devflow/bin/lib/init.test.cjs
autonomous: true
requirements:
  - POLISH-CHECK-TODOS-PREVIEW
  - POLISH-AWARENESS-PREVIEW

must_haves:
  truths:
    - "cmdInitPlanObjective emits result.check_todos_preview as a one-line string when .planning/.check-todos-cache.json has ≥1 entry in the `now` lane"
    - "cmdInitPlanObjective emits result.awareness_preview as a one-line string when .planning/.awareness-cache.json reports ≥1 peer branch (excluding the current branch)"
    - "cmdInitExecuteObjective emits the same two fields with identical logic (DRY across both init commands)"
    - "Both fields are null (or absent) when the underlying cache has no relevant entries"
    - "Both fields are null when the cache file is missing or malformed; a warning is pushed to result.advisories_warnings"
    - "Cache reads are pure JSON file lookups — no subprocess spawn, no fresh-fetch trigger, no TTL respect"
    - "Backwards-compat: existing init JSON consumers continue to parse cleanly (new fields are additive)"
    - "All 1832 pre-existing tests still pass; new tests count ≥10 across I1-I10 in test list"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/init.cjs"
      provides: "_buildCheckTodosPreview + _buildAwarenessPreview helpers + integration into cmdInitPlanObjective + cmdInitExecuteObjective"
      contains: "check_todos_preview"
    - path: "plugins/devflow/devflow/bin/lib/init.test.cjs"
      provides: "Tests for the two new preview helpers (≥10 cases)"
      contains: "check_todos_preview"
  key_links:
    - from: "cmdInitPlanObjective"
      to: "_buildCheckTodosPreview(cwd)"
      via: "function call setting result.check_todos_preview"
      pattern: "_buildCheckTodosPreview"
    - from: "cmdInitPlanObjective"
      to: "_buildAwarenessPreview(cwd)"
      via: "function call setting result.awareness_preview"
      pattern: "_buildAwarenessPreview"
    - from: "cmdInitExecuteObjective"
      to: "_buildCheckTodosPreview(cwd) + _buildAwarenessPreview(cwd)"
      via: "same function calls — identical wiring"
      pattern: "_buildCheckTodosPreview"
    - from: "_buildCheckTodosPreview"
      to: ".planning/.check-todos-cache.json"
      via: "fs.readFileSync + JSON.parse, count `now` lane entries"
      pattern: "check-todos-cache.json"
    - from: "_buildAwarenessPreview"
      to: ".planning/.awareness-cache.json"
      via: "fs.readFileSync + JSON.parse, count peer.branches[]"
      pattern: "awareness-cache.json"
---

<objective>
Surface two cached signals in `init plan-objective` and `init execute-objective` JSON output so the user sees them at the start of every planning/execution session without running a separate skill.

1. **check-todos preview** — a one-line advisory `"📋 N todos in Now lane (run /devflow:check-todos)"` when the local cache reports ≥1 entry in the `now` lane.
2. **awareness preview** — a one-line advisory `"⚠ N other branches active (run df-tools awareness show)"` when the local cache reports ≥1 peer branch (excluding the current one).

Purpose: closes shelf-ware gap from v1.1 obj 6 + obj 2. Both tools require manual invocation today. After this TRD, init flows surface relevant signal counts as a single line in their JSON output. The skill UIs render them; user gets ambient awareness without losing flow.

Output: 2 internal helpers + 2 added fields on each of the two existing init commands. ≥10 new test cases. Single TDD TRD because the helper logic is small but covers cache-presence × cache-shape × edge cases (current-branch filtering, malformed JSON), which is the kind of surface that benefits from a written test list.
</objective>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>
**Existing pattern in init.cjs (lines 26-33, 156, 263) for the awareness_refresh field — mirror this shape:**

```js
function _awarenessLoadable() {
  try {
    require('./awareness.cjs');
    return true;
  } catch {
    return false;
  }
}

// In cmdInitPlanObjective (line 263):
result.awareness_refresh = _awarenessLoadable();

// In cmdInitExecuteObjective (line 156):
result.awareness_refresh = _awarenessLoadable();
```

**New helper shape — `_buildCheckTodosPreview(cwd)` and `_buildAwarenessPreview(cwd)`:**

```js
const path = require('path');
const fs = require('fs');

/**
 * Read .planning/.check-todos-cache.json (cache-only; never spawn fresh fetch).
 * Returns:
 *   { line: '📋 N todos in Now lane (run /devflow:check-todos)', warning: null }
 *   when cache exists and the `now` lane has ≥1 entry.
 *   { line: null, warning: null } when cache absent or `now` empty.
 *   { line: null, warning: '<msg>' } on read/parse error.
 *
 * @param {string} cwd - working directory
 * @returns {{ line: string|null, warning: string|null }}
 */
function _buildCheckTodosPreview(cwd) {
  const cachePath = path.join(cwd, '.planning', '.check-todos-cache.json');
  if (!fs.existsSync(cachePath)) return { line: null, warning: null };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (e) {
    return { line: null, warning: `check-todos-cache parse error: ${e.message}` };
  }
  // The cache stores per-source data (e.g., parsed.local_todos.data, parsed.gh_issues.data).
  // For the preview we cannot easily replay lane-assignment without the full check-todos pipeline,
  // so we read the simpler shape: if the cache has a top-level `now` array (post-aggregate), use it;
  // otherwise count entries across known sources tagged with their lane after assignment.
  // SAFE FALLBACK: the cache CONTENTS depend on whether ct.aggregate ran fully.
  // For predictability we adopt: if `parsed.now` is an array, use parsed.now.length;
  // otherwise return null line (don't crash, don't speculate).
  const nowEntries = Array.isArray(parsed.now) ? parsed.now : null;
  if (!nowEntries || nowEntries.length === 0) return { line: null, warning: null };
  return {
    line: `📋 ${nowEntries.length} todos in Now lane (run /devflow:check-todos)`,
    warning: null,
  };
}

/**
 * Read .planning/.awareness-cache.json (cache-only). Filter out the current branch.
 *
 * @param {string} cwd - working directory
 * @returns {{ line: string|null, warning: string|null }}
 */
function _buildAwarenessPreview(cwd) {
  const cachePath = path.join(cwd, '.planning', '.awareness-cache.json');
  if (!fs.existsSync(cachePath)) return { line: null, warning: null };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (e) {
    return { line: null, warning: `awareness-cache parse error: ${e.message}` };
  }
  const branches = parsed && parsed.peer && Array.isArray(parsed.peer.branches)
    ? parsed.peer.branches
    : null;
  if (!branches) return { line: null, warning: null };

  // Filter: exclude the current branch
  const currentBranch = parsed.peer.current_branch || null;
  const otherBranches = branches.filter(b => {
    const name = typeof b === 'string' ? b : (b && b.branch);
    return name && name !== currentBranch;
  });
  if (otherBranches.length === 0) return { line: null, warning: null };
  return {
    line: `⚠ ${otherBranches.length} other branches active (run df-tools awareness show)`,
    warning: null,
  };
}
```

**Wire into both commands — `cmdInitPlanObjective` (around line 263) AND `cmdInitExecuteObjective` (around line 156):**

```js
// Add after the existing awareness_refresh line:
const ctPreview = _buildCheckTodosPreview(cwd);
const awPreview = _buildAwarenessPreview(cwd);
result.check_todos_preview = ctPreview.line;
result.awareness_preview = awPreview.line;
result.advisories_warnings = [];
if (ctPreview.warning) result.advisories_warnings.push(ctPreview.warning);
if (awPreview.warning) result.advisories_warnings.push(awPreview.warning);
```

(`advisories_warnings: []` is always emitted — empty array when no warnings — to keep the field shape stable for downstream consumers.)

**Existing test pattern (from init test surface):**

The repo's existing init tests use `spawnSync` against `df-tools.cjs` to exercise the CLI in-process. For TRD 18-03 we test the helpers directly (unit-style) AND test the integration via spawnSync (integration-style):

```js
// Unit-style — direct helper invocation
const { _buildCheckTodosPreview, _buildAwarenessPreview } = require('./init.cjs');

test('I1 — check_todos_preview: cache with 2 now entries → returns formatted line', () => {
  const repo = makeFixture({ checkTodosCache: { now: [{...}, {...}], blocked: [], soon: [], ideas: [] } });
  try {
    const r = _buildCheckTodosPreview(repo);
    assert.strictEqual(r.line, '📋 2 todos in Now lane (run /devflow:check-todos)');
    assert.strictEqual(r.warning, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// Integration-style — full spawnSync against df-tools init plan-objective
test('I8 — cmdInitExecuteObjective emits check_todos_preview field', () => {
  const repo = makeFixture({ checkTodosCache: { now: [{...}], blocked: [], soon: [], ideas: [] } });
  try {
    const r = spawnSync('node', [DF_TOOLS, 'init', 'execute-objective', '01-foo'], {
      cwd: repo, encoding: 'utf-8',
    });
    const json = JSON.parse(r.stdout);
    assert.match(json.check_todos_preview || '', /1 todos in Now lane/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
```

**Test fixture helper `makeFixture`:**

Build a tmp dir with `.planning/` containing the relevant cache files. Mirror `makeRepo` from project-bootstrap.test.cjs:

```js
function makeFixture({ checkTodosCache, awarenessCache }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'init-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (checkTodosCache) {
    fs.writeFileSync(
      path.join(root, '.planning', '.check-todos-cache.json'),
      JSON.stringify(checkTodosCache),
    );
  }
  if (awarenessCache) {
    fs.writeFileSync(
      path.join(root, '.planning', '.awareness-cache.json'),
      JSON.stringify(awarenessCache),
    );
  }
  return root;
}
```

(Per CLAUDE.md TDD Playbook habit 4: hand-built factory function. No LLM-generated test data; the test author writes the literal cache shape.)
</codebase_examples>

<anti_patterns>
- **Calling `ct.aggregate({ refresh: true })` inside init.cjs.** That triggers a full fetch on cache miss — slow + spawns subprocesses. The preview helper MUST be cache-only: `fs.readFileSync` + `JSON.parse` only.
- **Respecting cache TTL in the preview.** A stale cache is fine for the preview — the user can run the full skill if they want fresh data. We display whatever's there.
- **Using `result.check_todos_preview` to STORE the parsed data.** It's a string ONLY — humans read it. If consumers want the data, they call `df-tools check-todos --raw` directly.
- **Letting a malformed cache crash init.** Wrap in try/catch; return `{ line: null, warning: <msg> }`; init continues.
- **Spawning a subprocess inside init.cjs to read the cache.** init must stay sub-200ms. Pure file I/O.
- **Modifying any pre-existing init test that asserts on the result JSON shape.** Add new fields; never rename or delete existing ones.
- **Sharing a result.advisories_warnings array between sources non-deterministically.** Always initialize as `[]`, push in fixed order (check_todos first, awareness second), emit even when empty.
</anti_patterns>

<error_recovery>
- **Cache file exists but contains invalid JSON:** try/catch surrounds JSON.parse; helper returns `{ line: null, warning: '<reason>' }`. Init continues; result.advisories_warnings collects the warning.
- **Cache file exists with unexpected shape (e.g., `now` is not an array):** Fall back to `{ line: null, warning: null }` — defensive; don't push noise into warnings for benign shape mismatches.
- **`fs.readFileSync` throws (permission, race, etc.):** caught by try/catch; return `{ line: null, warning: <message> }`.
- **`parsed.peer` exists but `parsed.peer.branches` is missing:** treated as empty branches list → no preview line emitted. Defensive null-safe access.
- **All branches filter out (only the current branch is in cache):** no preview line emitted. Test I7 covers.
- **Two cache files both present and both report data:** both lines emitted independently. Tests I1+I5 (run together) cover.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@plugins/devflow/devflow/bin/lib/init.cjs
@plugins/devflow/devflow/bin/lib/check-todos.cjs
@plugins/devflow/devflow/bin/lib/awareness.cjs

@.planning/objectives/18-v1-1-polish-bundle/18-CONTEXT.md
@.planning/objectives/18-v1-1-polish-bundle/18-RESEARCH.md
</context>

<gotchas>
- **The actual cache shape produced by `ct.aggregate()` is per-source.** It writes `local_todos`, `gh_issues`, `peer_sessions`, `initiative_questions`, `dup_detect_log` keys (each with `data + fetched_at`). It does NOT write a top-level `now` lane in the file. Lane assignment happens at read time inside `aggregate()`. THIS IS A KEY DESIGN POINT: for the preview we don't have the full lane-assignment context (current user, current repo) without the full pipeline. **Decision (locked):** the preview reads a SIMPLER cache shape — if `parsed.now` is a top-level array, use it; otherwise emit no preview line. This means the preview becomes useful AFTER the user runs `/devflow:check-todos` once and the post-aggregate result gets cached. As a follow-on, future TRDs can extend `ct.aggregate()` to also write the post-aggregate lanes back to the cache. For NOW, accept the conservative behavior.

  ALTERNATIVE (consider during execution): the helper can run a lightweight in-process call to `ct.aggregate({ refresh: false })` — it reuses the cache for source data and only does pure lane-assignment locally. If this turns out to be ~10ms (no subprocess, just filesystem reads), it's the better behavior. The TRD permits this implementation IFF the helper still respects the "no subprocess spawn, no fresh fetch" constraint. Use `require('./check-todos.cjs').aggregate({ projectRoot: cwd, refresh: false })` and read `result.now.length` — but ONLY if a quick perf check (run aggregate 100×, measure time) shows <50ms median.

  **Default (fail-safe):** use the simpler `parsed.now` array check. Only switch to the in-process aggregate call if perf is verified.
- **awareness cache `peer.branches[]` shape.** Each branch entry is `{ branch, objective, trd, github_issue, last_commit, ... }` per `scanPeer` (awareness.cjs lines 394-400). The current_branch is in `peer.current_branch`. Filter is on the `branch` field of each entry.
- **Test fixture should NOT use real git or real gh.** All cache files are written as static JSON; `_buildCheckTodosPreview` and `_buildAwarenessPreview` are pure file I/O. No environmental coupling.
- **`makeFixture` cleanup pattern.** Always wrap in try/finally + `fs.rmSync(repo, { recursive: true, force: true })`. Mirrors project-bootstrap.test.cjs.
- **Must NOT break existing tests for init.** Existing test patterns use spawnSync(df-tools, init, ...). Any new field in the result JSON is additive; existing assertions on specific fields continue to pass.
- **Cross-test pollution.** Each test creates its own fixture. No shared state.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Test list + RED — write failing tests I1-I10 in init.test.cjs</name>
  <files>plugins/devflow/devflow/bin/lib/init.test.cjs</files>
  <action>
Per CLAUDE.md TDD Playbook habit 2 (test list first) — create `plugins/devflow/devflow/bin/lib/init.test.cjs` if it doesn't exist, OR append a new "Group I" test block to the existing init test file (search: `find plugins/devflow/devflow/bin/lib -name 'init.test*'`).

If creating new: top-of-file boilerplate:
```js
'use strict';
const test = require('node:test');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const { _buildCheckTodosPreview, _buildAwarenessPreview } = require('./init.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

function makeFixture({ checkTodosCache, awarenessCache }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'init-test-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (checkTodosCache) fs.writeFileSync(path.join(root, '.planning', '.check-todos-cache.json'), JSON.stringify(checkTodosCache));
  if (awarenessCache) fs.writeFileSync(path.join(root, '.planning', '.awareness-cache.json'), JSON.stringify(awarenessCache));
  return root;
}
```

Add test list comment block:
```js
// TEST LIST — Group I — check-todos + awareness init previews (TRD 18-03)
//
// I1 — _buildCheckTodosPreview: cache with parsed.now=[a,b] → line='📋 2 todos in Now lane (run /devflow:check-todos)', warning=null
// I2 — _buildCheckTodosPreview: missing cache file → { line: null, warning: null }
// I3 — _buildCheckTodosPreview: cache with parsed.now=[] → { line: null, warning: null }
// I4 — _buildCheckTodosPreview: malformed JSON → { line: null, warning: <non-empty> }
// I5 — _buildAwarenessPreview: cache with peer.branches=[{branch:'b1'},{branch:'b2'},{branch:'b3'}], current_branch='b1' → line='⚠ 2 other branches active (run df-tools awareness show)'
// I6 — _buildAwarenessPreview: missing cache file → { line: null, warning: null }
// I7 — _buildAwarenessPreview: branches=[{branch:'main'}], current_branch='main' → { line: null, warning: null } (filtered to zero)
// I8 — Integration: cmdInitExecuteObjective JSON contains check_todos_preview + awareness_preview + advisories_warnings keys
// I9 — Integration: cmdInitPlanObjective JSON contains the same three keys (DRY)
// I10 — Integration: when cache files absent, all three keys present with null/[] values (back-compat)
```

Then implement each test. Skeletons:

```js
test('I1 — _buildCheckTodosPreview: 2 now entries returns formatted line', () => {
  const repo = makeFixture({ checkTodosCache: { now: [{id:1},{id:2}], blocked:[], soon:[], ideas:[] } });
  try {
    const r = _buildCheckTodosPreview(repo);
    assert.strictEqual(r.line, '📋 2 todos in Now lane (run /devflow:check-todos)');
    assert.strictEqual(r.warning, null);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ... I2 through I10 similarly

test('I8 — cmdInitExecuteObjective emits the three new keys', () => {
  const repo = makeFixture({});
  // Need a minimal .planning/PROJECT.md and an objective dir for the init command to succeed
  fs.writeFileSync(path.join(repo, '.planning', 'PROJECT.md'), '---\nkind: plugin\n---\n# Foo\n');
  fs.mkdirSync(path.join(repo, '.planning', 'objectives', '01-test'), { recursive: true });
  // ... add minimal ROADMAP.md so find-objective resolves
  fs.writeFileSync(path.join(repo, '.planning', 'ROADMAP.md'), '## Milestone v1.0\n\n### Objective 1: test\n');

  const r = spawnSync('node', [DF_TOOLS, 'init', 'execute-objective', '1', '--raw'], {
    cwd: repo,
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  const json = JSON.parse(r.stdout);
  assert.ok('check_todos_preview' in json, 'check_todos_preview key must be present');
  assert.ok('awareness_preview' in json, 'awareness_preview key must be present');
  assert.ok('advisories_warnings' in json, 'advisories_warnings key must be present');
  assert.deepStrictEqual(json.advisories_warnings, []);
  fs.rmSync(repo, { recursive: true, force: true });
});
```

Run `npm test 2>&1 | grep -E "Group I|fail" | head -20` — expect I1-I10 to FAIL because the helpers don't exist.

# CRITICAL: This is RED. The require must include the new helpers — they don't exist yet, so the require itself may throw on load.
# GOTCHA: For integration tests (I8/I9/I10), the existing find-objective logic requires both ROADMAP.md and an objective dir. Set up both in the fixture.
# GOTCHA: Use `--raw` flag in spawnSync to get clean JSON output (init commands respect this flag for output formatting).
# PATTERN: Match existing integration test style (cwd-passing + JSON.parse) from check-todos-cli.test.cjs.
  </action>
  <verify>
`npm test 2>&1 | tee /tmp/red-i.log` → at least 10 new test failures referencing `_buildCheckTodosPreview` or `_buildAwarenessPreview` being undefined OR returning unexpected shapes. Existing tests still pass. Commit with message `test(18-03): add failing tests for check-todos + awareness init previews (RED)`.
  </verify>
  <done>
RED phase complete: init.test.cjs (or extension) has Group I test list + 10 cases. `npm test` reports ≥10 new failures specifically about the missing helpers OR missing JSON keys. No regression in existing tests.
  </done>
  <recovery>
If the require statement at top of init.test.cjs throws ("Cannot find module" or destructure error): node native test runner won't even load the file. Fix the require to use defensive destructure: `const { _buildCheckTodosPreview = null, _buildAwarenessPreview = null } = require('./init.cjs')` AND structure tests to assert against `null` undefined-ness (this preserves the RED signal).
If existing init tests fail after Group I additions: the new tests aren't isolating fixtures correctly. Each test's `makeFixture` returns a unique tmpdir; cleanup in finally. No shared state.
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — implement _buildCheckTodosPreview + _buildAwarenessPreview, wire into both init commands</name>
  <files>plugins/devflow/devflow/bin/lib/init.cjs</files>
  <action>
Add the two helpers + wiring per the codebase_examples block.

Implementation steps:

1. **Add helpers near the top of init.cjs**, after `_awarenessLoadable` (around line 33):
   ```js
   function _buildCheckTodosPreview(cwd) {
     const cachePath = path.join(cwd, '.planning', '.check-todos-cache.json');
     if (!fs.existsSync(cachePath)) return { line: null, warning: null };
     let parsed;
     try {
       parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
     } catch (e) {
       return { line: null, warning: `check-todos-cache parse error: ${e.message}` };
     }
     const nowEntries = Array.isArray(parsed.now) ? parsed.now : null;
     if (!nowEntries || nowEntries.length === 0) return { line: null, warning: null };
     return { line: `📋 ${nowEntries.length} todos in Now lane (run /devflow:check-todos)`, warning: null };
   }

   function _buildAwarenessPreview(cwd) {
     const cachePath = path.join(cwd, '.planning', '.awareness-cache.json');
     if (!fs.existsSync(cachePath)) return { line: null, warning: null };
     let parsed;
     try {
       parsed = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
     } catch (e) {
       return { line: null, warning: `awareness-cache parse error: ${e.message}` };
     }
     const branches = parsed && parsed.peer && Array.isArray(parsed.peer.branches) ? parsed.peer.branches : null;
     if (!branches) return { line: null, warning: null };
     const currentBranch = parsed.peer.current_branch || null;
     const otherBranches = branches.filter(b => {
       const name = typeof b === 'string' ? b : (b && b.branch);
       return name && name !== currentBranch;
     });
     if (otherBranches.length === 0) return { line: null, warning: null };
     return { line: `⚠ ${otherBranches.length} other branches active (run df-tools awareness show)`, warning: null };
   }
   ```

2. **Wire into `cmdInitPlanObjective`** (line 263 area):
   Replace the existing `result.awareness_refresh = _awarenessLoadable();` line + the bootstrap block with:
   ```js
   result.awareness_refresh = _awarenessLoadable();

   // TRD 18-03: emit one-line previews from cached data
   const ctPreview = _buildCheckTodosPreview(cwd);
   const awPreview = _buildAwarenessPreview(cwd);
   result.check_todos_preview = ctPreview.line;
   result.awareness_preview = awPreview.line;
   result.advisories_warnings = [];
   if (ctPreview.warning) result.advisories_warnings.push(ctPreview.warning);
   if (awPreview.warning) result.advisories_warnings.push(awPreview.warning);

   result.bootstrap = bootstrapProjectMd(cwd);
   ```

3. **Wire into `cmdInitExecuteObjective`** (line 156 area): same insertion, immediately after the existing awareness_refresh + before result.bootstrap.

4. **Update module.exports** to expose the helpers for testing:
   ```js
   module.exports = {
     resolveModelInternal,
     cmdResolveModel,
     cmdInitExecuteObjective,
     cmdInitPlanObjective,
     // ... existing exports ...
     _buildCheckTodosPreview,    // NEW (test-only)
     _buildAwarenessPreview,     // NEW (test-only)
   };
   ```

Run `npm test 2>&1 | grep -E "Group I|fail|pass" | head -20` — expect all 10 Group I tests to PASS, all existing tests still pass.

# CRITICAL: Wire into BOTH cmdInitPlanObjective AND cmdInitExecuteObjective. Tests I8 + I9 verify both. DRY violation in this case is intentional — these are two distinct entry points, not a shared library.
# CRITICAL: result.advisories_warnings is ALWAYS initialized to `[]` (never undefined). Existing init JSON consumers can `.length` the array safely.
# GOTCHA: Don't accidentally remove the existing `result.bootstrap = bootstrapProjectMd(cwd);` line. It must remain. Insert the new code BEFORE it.
# GOTCHA: The `path` and `fs` requires are already at the top of init.cjs (lines 3-4). No new imports needed.
# PATTERN: Mirror the comment style of `_awarenessLoadable` for the new helpers' JSDoc — explain the contract, return shape, and "guidance-only" nature.
  </action>
  <verify>
`npm test 2>&1 | grep -E "Group I|fail|pass" | head -30` → all 10 Group I tests PASS. Pre-existing test count preserved (no regression). Commit with message `feat(18-03): emit check-todos + awareness previews from init plan/execute (GREEN)`.
  </verify>
  <done>
GREEN phase complete: 2 new helpers exported from init.cjs; both `cmdInitPlanObjective` and `cmdInitExecuteObjective` emit `check_todos_preview`, `awareness_preview`, `advisories_warnings`; all 10 Group I tests pass; no regressions; single `feat(18-03):` commit logged.
  </done>
  <recovery>
If a test fails because the JSON shape is wrong: read the test's assertion message, look at the integration test's `JSON.parse(r.stdout)` output. The most common failure is the helper not being called in one of the two commands — confirm the patch landed in BOTH cmdInitPlanObjective AND cmdInitExecuteObjective.
If the awareness cache test (I5) fails because the filter doesn't exclude current branch: check the `currentBranch` extraction — must be `parsed.peer.current_branch`, not `parsed.current_branch`.
If module.exports doesn't expose the helpers and tests' require fails: add the two underscore-prefixed names to the exports block. They're test-only but exporting underscore-prefixed names is a known pattern in this codebase (see _setRunGit, _resetGitMock in awareness.cjs).
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Sanity check — run init plan-objective against this repo, confirm new fields appear</name>
  <files>plugins/devflow/devflow/bin/lib/init.cjs</files>
  <action>
Verification-only task — no file edits. Sanity-check the wiring by invoking the real `df-tools init plan-objective` against this repo and inspecting the JSON output.

```bash
node ~/.claude/devflow/bin/df-tools.cjs init plan-objective "18-v1-1-polish-bundle" 2>&1 | jq 'keys' | head -40
```

Expected output (alphabetized): contains `check_todos_preview`, `awareness_preview`, `advisories_warnings` alongside existing keys.

```bash
node ~/.claude/devflow/bin/df-tools.cjs init plan-objective "18-v1-1-polish-bundle" 2>&1 | jq '{check_todos_preview, awareness_preview, advisories_warnings, awareness_refresh}'
```

Expected (depending on cache state):
- `check_todos_preview`: null (no cache OR no Now-lane entries) OR string starting with `📋`
- `awareness_preview`: null (no cache OR only current branch) OR string starting with `⚠`
- `advisories_warnings`: `[]` (empty array) OR list of warning strings
- `awareness_refresh`: `true` (sanity check that the existing field still works)

```bash
node ~/.claude/devflow/bin/df-tools.cjs init execute-objective "0" 2>&1 | jq '{check_todos_preview, awareness_preview, advisories_warnings}'
```

Same expected shape — both init commands emit the new fields.

If any new field is `undefined` (missing from JSON keys list): the wiring didn't land in that command. Re-check init.cjs around the relevant `cmdInit*` function.

# CRITICAL: This task is non-mutating. No commit needed.
# GOTCHA: If `df-tools init plan-objective "18-v1-1-polish-bundle"` returns objective_found:false, the directory wasn't found — but the new fields should still appear in the result JSON because they're set unconditionally. (They're not conditional on objective_found.)
# PATTERN: This sanity check belongs in the SUMMARY.md verification section, mirroring TRD 18-02's smoke-test approach.
  </action>
  <verify>
1. `init plan-objective` JSON contains `check_todos_preview`, `awareness_preview`, `advisories_warnings` keys (jq confirms).
2. `init execute-objective` JSON contains the same three keys.
3. The values are well-formed (string or null for previews; array for warnings).
4. `npm test` → all tests still pass.
  </verify>
  <done>
Both `init plan-objective` and `init execute-objective` JSON output include the three new fields. Field values are correctly populated based on cache state. No regressions in test suite.
  </done>
  <recovery>
If a new field is missing from the JSON output: the patch didn't land in that command. `grep -n "check_todos_preview" plugins/devflow/devflow/bin/lib/init.cjs` should return ≥3 matches (1 in helper, 2 in command wirings).
If the value is malformed (e.g., `[object Object]` instead of a string): the helper returned the full object instead of `.line`. Fix the wiring: `result.check_todos_preview = ctPreview.line;` (not the whole object).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<lint>(no lint command in this repo per CLAUDE.md)</lint>
<build>(no build step)</build>
</validation_gates>

<verification>
- [ ] Group I tests (10 cases) all pass after task 2
- [ ] All existing init tests (and all 1832 pre-existing tests) still pass
- [ ] `_buildCheckTodosPreview` and `_buildAwarenessPreview` exported from init.cjs
- [ ] `cmdInitPlanObjective` JSON output contains `check_todos_preview`, `awareness_preview`, `advisories_warnings`
- [ ] `cmdInitExecuteObjective` JSON output contains the same three fields
- [ ] Sanity check (Task 3) confirms field presence + null-safe values
- [ ] 2 atomic commits: `test(18-03):` (RED) + `feat(18-03):` (GREEN)
- [ ] No subprocess spawns introduced into init.cjs (verify: no new `execSync` or `spawnSync` calls)
- [ ] No fresh-fetch trigger (verify: no `require('./check-todos.cjs').aggregate` call in init.cjs)
</verification>

<success_criteria>
- POLISH-CHECK-TODOS-PREVIEW requirement met: init plan-objective + init execute-objective emit a one-line preview when ≥1 todo in Now lane is present in cache
- POLISH-AWARENESS-PREVIEW requirement met: same commands emit a one-line preview when ≥1 peer branch (excluding current) is present in cache
- New tests count: ≥10 (covering I1-I10 from test list)
- Zero regressions in existing tests
- Helpers stay sub-200ms per invocation (pure file I/O, no subprocess spawns)
- Backwards-compat preserved (existing init JSON consumers continue to parse cleanly)
</success_criteria>

<output>
After completion, create `.planning/objectives/18-v1-1-polish-bundle/18-03-init-output-preview-SUMMARY.md` per `@/Users/markemerson/.claude/devflow/templates/summary.md`. Include:
- Helpers added (`_buildCheckTodosPreview`, `_buildAwarenessPreview`)
- Test count delta (+10 or more)
- Sample JSON output showing the three new fields populated
- Self-Check verdict: PASSED if all verification checks above pass
</output>

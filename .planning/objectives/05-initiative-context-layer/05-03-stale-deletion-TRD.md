---
objective: 05-initiative-context-layer
trd: 05-03
type: tdd
confidence: high
wave: 3
depends_on:
  - 05-02
files_modified:
  - plugins/devflow/devflow/bin/lib/initiatives.cjs
  - plugins/devflow/devflow/bin/lib/initiatives.test.cjs
  - plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
  - plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
autonomous: true
requirements:
  - SC-7
must_haves:
  truths:
    - "syncInitiatives detects initiative files whose source GitHub issue is closed AND not in fresh walkProject items"
    - "Without --force, sync prompts for confirmation per stale file via TTY readline"
    - "With --force, sync deletes stale files unconditionally and logs each deletion"
    - "Non-TTY environments skip stale deletion with warning (not crash)"
    - "Single-initiative mode (--initiative <slug>) skips stale-deletion entirely"
    - "Stale-deletion is in addition to the normal write path; same syncInitiatives call"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/initiatives.cjs"
      provides: "Stale-deletion region: _detectStaleInitiatives + _deleteStaleFile + _confirmDeleteStale + --force wiring"
      contains: "_detectStaleInitiatives"
    - path: "plugins/devflow/devflow/bin/lib/initiatives.test.cjs"
      provides: "Stale-deletion test suite (Groups DS/DD/CF/SF)"
      contains: "_detectStaleInitiatives"
  key_links:
    - from: "lib/initiatives.cjs::_detectStaleInitiatives"
      to: "lib/gh.cjs (issue state via _runGh)"
      via: "gh issue view <ref> --json state"
      pattern: "\\['issue', 'view'"
    - from: "lib/initiatives.cjs::_confirmDeleteStale"
      to: "process.stdin (TTY readline)"
      via: "readline question"
      pattern: "createInterface"
    - from: "lib/initiatives-cli.cjs::cmdInitiativesSync"
      to: "lib/initiatives.cjs::syncInitiatives({ force })"
      via: "--force flag"
      pattern: "force:"
---

<objective>
Add stale-file deletion to `syncInitiatives`. When an initiative file in `home/` references a GitHub issue that is now CLOSED AND that issue does not appear in the fresh `walkProject.items[]` (i.e., the Epic is both closed + removed from the Project), the file is stale. Without `--force`, sync prompts the user per stale file via TTY readline (`Delete <slug>.md? [y/N] `). On non-TTY environments (no `process.stdin.isTTY`), stale deletion is SKIPPED with a warning (not a crash). With `--force`, sync deletes stale files unconditionally and logs each deletion to `result.deleted`.

Single-initiative mode (`--initiative <slug>`) skips stale-deletion entirely (CONTEXT.md decision #4 step 6).

Purpose: SC-7 (stale deletion + --force + confirmation prompt + non-interactive skip).
Output: Stale-deletion region in initiatives.cjs; --force flag wired through cmdInitiativesSync.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── initiatives.cjs                            ← MODIFY (add stale-deletion region)
├── initiatives.test.cjs                       ← MODIFY (add DS/DD/CF/SF groups)
├── initiatives-cli.cjs                        ← MODIFY (--force flag wiring)
└── initiatives-cli.test.cjs                   ← MODIFY (--force tests)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Per-issue gh state check pattern (from `lib/gh.cjs` syncObjective TRD 01-04):**

```js
const r = _runGh(['issue', 'view', issueRef, '--json', 'state,closed']);
if (!r.ok) {
  warnings.push(`gh issue view failed for ${issueRef}: ${r.stderr}`);
  return null;
}
let parsed;
try { parsed = JSON.parse(r.stdout); } catch {
  warnings.push(`gh issue view returned non-JSON for ${issueRef}`);
  return null;
}
return parsed; // { state: 'OPEN' | 'CLOSED', closed: bool }
```

For `_detectStaleInitiatives`: same shape. Issue ref format: `owner/repo#NN` (e.g., `AO-Cyber-Systems/devflow#30`). gh accepts the full ref directly.

**Readline-based confirmation pattern (Node.js standard):**

```js
const readline = require('node:readline');

function _confirmDeleteStale(slug) {
  if (!process.stdin.isTTY) return false; // non-TTY: skip + caller logs warning
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Delete ${slug}.md? [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test((answer || '').trim()));
    });
  });
}
```

Returns Promise<bool>. Caller awaits via `for-of` loop with await. **Test injection** required: `_setRunReadline(fn)` swap for deterministic test runs.

**TTY detection bypass for testing:**

Tests cannot easily fake `process.stdin.isTTY`, so the prompt is gated behind an injected fn:

```js
let _runReadline = _confirmDeleteStale; // default = real readline
function _setRunReadline(fn) { _runReadline = (fn != null) ? fn : _confirmDeleteStale; }
```

Tests inject a synchronous fn returning bool (or a Promise) that simulates user input.

**Force flag pattern (from obj 4 TRD 04-02 applyResolution mode dispatch):**

```js
function applyResolution({ resolution, ..., force = false }) {
  if (force) {
    // bypass confirmation
  } else {
    const ok = _runReadline(slug);
    if (!ok) return { skipped: true };
  }
}
```

Apply same pattern: `--force` bypasses `_runReadline`, deletes unconditionally.
</codebase_examples>

<anti_patterns>
- **DO NOT** prompt the user when single-initiative mode is active. CONTEXT.md decision #4 step 6: stale deletion does NOT run in single-initiative mode. The `--initiative <slug>` flag skips both the detection and the prompt.
- **DO NOT** prompt the user on non-TTY. Test the gate: `if (!process.stdin.isTTY) return false`. Caller logs warning, skips deletion.
- **DO NOT** delete a file whose `github_issue` field is missing or unparseable. That's metadata-corruption — surface in `warnings` and skip.
- **DO NOT** call `gh` for an issue ref that's just been seen in the fresh `walkProject.items[]`. The "stale" criterion REQUIRES both closed-state AND absence-from-project. Don't burn API quota re-checking issues we just walked.
- **DO NOT** use any console.log or printf inside `_detectStaleInitiatives` / `_deleteStaleFile`. Surface results via the return value; let `cmdInitiativesSync` print.
- **DO NOT** add a `unlinkSync` to `realFs` — TRD 05-02 already added it. Just use `_runFs.unlinkSync`.
- **DO NOT** lock the export surface. That's TRD 05-05.
</anti_patterns>

<error_recovery>
- **`gh issue view` fails (transient network):** add to `warnings`, treat as "not stale" (skip deletion). Better to leave a stale file than delete based on bad data.
- **`gh issue view` returns malformed JSON:** same as above — warn, skip.
- **`fs.unlinkSync` fails (file already gone, permission):** add to `warnings` with the slug + reason; do NOT crash.
- **Readline timeout / EOF:** treated as "no" — skip deletion. User can re-run with `--force` or manually delete.
- **User Ctrl+C during prompt:** Node default handles SIGINT; `cmdInitiativesSync` exits 130. Acceptable.
- **`_runReadline` injected fn throws:** caught by `_runStaleDeletionLoop`, added to warnings, skip that file, continue with next.
- **Concurrent sync runs (rare):** TRD 05-02 atomic-write makes file content safe; TRD 05-03 deletion is also atomic (`unlinkSync` is single syscall). No special handling needed.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@.planning/objectives/05-initiative-context-layer/05-CONTEXT.md
@.planning/objectives/05-initiative-context-layer/05-01-SUMMARY.md
@.planning/objectives/05-initiative-context-layer/05-02-SUMMARY.md

# Reference patterns
@plugins/devflow/devflow/bin/lib/gh.cjs
</context>

<gotchas>
- **Async readline + sync sync function:** `syncInitiatives` is currently sync (per 05-02). Adding readline turns parts of the codepath async. Approach: keep `_runReadline` returning a Promise<bool>; make `_runStaleDeletionLoop` async; `syncInitiatives` becomes `async function` ONLY when stale-deletion runs. Adjust `cmdInitiativesSync` to `await`.
- **Test injection for non-Promise pattern:** for tests, `_setRunReadline` accepts a sync fn returning bool. The loop uses `await Promise.resolve(_runReadline(slug))` so both sync and async injected fns work.
- **`process.stdin.isTTY` in tests:** when tests inject `_runReadline`, the TTY check is bypassed (the injection IS the TTY substitute). The TTY guard is INSIDE the default `_confirmDeleteStale` only.
- **Stale detection caching:** if multiple stale files reference the same closed issue, `gh issue view` is called per slug (not deduplicated). Acceptable for v1.1 — stale files per sync are rare. If perf matters in v1.2, dedupe by issue ref.
- **`--force` semantics:** bypasses prompt only. Does NOT bypass `gh issue view` check (we still need to confirm the issue is CLOSED before deleting). Otherwise `--force` could delete files the user wants to keep just because the project was empty that day.
- **Order of operations in `syncInitiatives`:** writer loop FIRST (write all qualifying items), THEN stale-detection loop (compares disk against fresh walkProject items). This ordering means: a file rewritten by the writer is NEVER detected as stale (its issue WAS in the fresh walk).
</gotchas>

</embedded_context>

## Test list

### Group DS — _detectStaleInitiatives (pure logic, mocked gh)

- **DS1**: Empty home dir returns `[]` (nothing to detect).
- **DS2**: Home with files but ALL of them are in fresh_items → returns `[]` (no stale).
- **DS3**: Home with file referencing OPEN issue not in fresh_items → NOT stale (returns `[]`); we only delete CLOSED ones.
- **DS4**: Home with file referencing CLOSED issue not in fresh_items → returns the slug as stale.
- **DS5**: Home with file referencing CLOSED issue that IS in fresh_items → NOT stale (project still claims it; data inconsistency, surface as warning but don't delete).
- **DS6**: File with malformed frontmatter → skipped silently.
- **DS7**: File with no `github_issue` → skipped + warning (`no_issue_ref`).
- **DS8**: `gh issue view` fails (mocked failure) → warning, treat as not-stale.
- **DS9**: Returns array of `{ slug, github_issue, reason }` for each stale entry.

### Group CF — _confirmDeleteStale (TTY readline, mocked)

- **CF1**: TTY environment, user types "y" → returns true.
- **CF2**: TTY environment, user types "yes" → returns true.
- **CF3**: TTY environment, user types "n" → returns false.
- **CF4**: TTY environment, user types "" (Enter) → returns false (default no).
- **CF5**: Non-TTY environment → returns false WITHOUT prompting.
- **CF6**: Case-insensitive y/Y/yes/YES all return true.

### Group DD — _deleteStaleFile (filesystem)

- **DD1**: Calls `_runFs.unlinkSync(<home>/<slug>.md)` on disk.
- **DD2**: Returns `{ deleted: true, slug, reason: 'closed_and_removed' }` on success.
- **DD3**: unlinkSync fails (mocked) → returns `{ deleted: false, slug, reason: <error msg> }`.

### Group SF — syncInitiatives stale-deletion integration

- **SF1**: With `--force` flag: stale files deleted unconditionally; result.deleted populated.
- **SF2**: Without `--force` flag, TTY-mock confirms y → stale files deleted.
- **SF3**: Without `--force` flag, TTY-mock confirms n → stale files NOT deleted; result.deleted empty.
- **SF4**: Non-TTY (no _runReadline injection AND `process.stdin.isTTY === undefined`) → stale-deletion skipped with warning; result.deleted empty.
- **SF5**: `--initiative <slug>` mode skips stale-deletion entirely (no detection, no prompt, result.deleted always empty).
- **SF6**: Mixed: 2 stale files; user confirms y for one, n for other → result.deleted has 1 entry.
- **SF7**: Stale-detection runs AFTER writer loop. Verify by mock: writer wrote a file matching the fresh walkProject; that file is never in result.deleted.

### Group CLI3 — cmdInitiativesSync --force flag

- **CLI3-1**: `df-tools initiatives sync --force` (subprocess) passes `force: true` through to syncInitiatives.
- **CLI3-2**: `df-tools initiatives sync` (no --force) defaults `force: false`.
- **CLI3-3**: --force JSON output includes `deleted: [...]` array.

<tasks>

<task type="auto">
  <name>Task 1: Add stale-deletion test suite (RED)</name>
  <files>
plugins/devflow/devflow/bin/lib/initiatives.test.cjs
plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
  </files>
  <action>
Append test groups DS/CF/DD/SF/CLI3 to the existing test files. Use `_setRunReadline` for confirmation tests and `_setRunGh` for gh issue view mocking.

Test scaffold:

```js
// ─── Group DS — _detectStaleInitiatives ──────────────────────────────────────

test('DS1: empty home returns []', () => {
  const home = mkTmp();
  const result = init._detectStaleInitiatives({ home, fresh_items: [] });
  assert.deepStrictEqual(result, []);
  fs.rmSync(home, { recursive: true, force: true });
});

test('DS4: home file referencing CLOSED issue not in fresh returns stale', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic', github_issue: 'AO-Cyber-Systems/devflow#999' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'issue' && args[1] === 'view' && args[2] === 'AO-Cyber-Systems/devflow#999') {
      return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = init._detectStaleInitiatives({ home, fresh_items: [] });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].slug, 'old-epic');
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('DS5: closed issue still in fresh items is NOT stale (warning instead)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'recurring', github_issue: 'AO-Cyber-Systems/devflow#100' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      return { ok: true, stdout: JSON.stringify({ state: 'CLOSED' }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const fresh_items = [fixtures.buildOrgItem({ issue_ref: 'AO-Cyber-Systems/devflow#100' })];
  const result = init._detectStaleInitiatives({ home, fresh_items });
  assert.deepStrictEqual(result, []); // not deleted
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

// ─── Group CF — _confirmDeleteStale (with _setRunReadline injection) ─────────

test('CF1: y returns true', async () => {
  init._setRunReadline(async (slug) => true);
  const r = await init._confirmDeleteStale('foo');
  assert.strictEqual(r, true);
  init._resetMocks();
});

test('CF5: non-TTY default returns false', async () => {
  // Use the real _confirmDeleteStale; rely on test runner's stdin not being TTY
  // (npm test runs with !isTTY in CI/local). Verify default behavior.
  init._resetMocks();
  // Save original isTTY, force false
  const origTTY = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  try {
    const r = await init._confirmDeleteStale('foo');
    assert.strictEqual(r, false);
  } finally {
    if (origTTY !== undefined) {
      Object.defineProperty(process.stdin, 'isTTY', { value: origTTY, configurable: true });
    }
  }
});

// ─── Group SF — syncInitiatives stale-deletion ─────────────────────────────

test('SF1: --force deletes stale files unconditionally', async () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic', github_issue: 'AO-Cyber-Systems/devflow#999' }],
  });
  init._setRunGh(fixtures.buildMockRunGhForInitiatives({
    walkProjectItems: [], // empty fresh items
    authOk: true,
  }));
  // Override gh issue view path inside the mock
  const baseRunGh = init._setRunGh;
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { ok: true, stdout: JSON.stringify({ state: 'CLOSED' }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = await init.syncInitiatives({ home, project_id: 'PVT_test', force: true });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.deleted.length, 1);
  assert.strictEqual(result.deleted[0].slug, 'old-epic');
  // Confirm file removed
  assert.strictEqual(fs.existsSync(path.join(home, 'old-epic.md')), false);
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('SF5: --initiative <slug> mode skips stale-deletion entirely', async () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic', github_issue: 'AO-Cyber-Systems/devflow#999' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, stdout: "Token scopes: 'project', 'repo'", stderr: '' };
    if (args[0] === 'api') return { ok: true, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = await init.syncInitiatives({ home, project_id: 'PVT_test', initiative: 'some-other-slug', force: true });
  assert.deepStrictEqual(result.deleted, []);
  // file untouched
  assert.strictEqual(fs.existsSync(path.join(home, 'old-epic.md')), true);
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});
```

# CRITICAL: tests are async; use `async () =>` arrow + `await` for syncInitiatives calls.
# GOTCHA: TRD 05-02 made syncInitiatives sync. TRD 05-03 turns it async (because confirmation prompt is async). Update existing TRD 05-02 tests to `await` if they break — flagged in this task as "regression sweep".
# PATTERN: `init._resetMocks()` after every mock-using test; otherwise leakage.
  </action>
  <verify>
cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test -- --test-name-pattern="initiatives" 2>&1 | tail -30
# Expected: new DS/CF/DD/SF/CLI3 tests fail (RED). Existing 05-01/05-02 tests still pass.
# IF some 05-02 sync tests fail with "promise not awaited": add await to those tests as part of this commit.
  </verify>
  <done>
- New test groups DS (9) + CF (6) + DD (3) + SF (7) + CLI3 (3) = 28 new tests written
- Tests are RED: `_detectStaleInitiatives`, `_deleteStaleFile`, `_confirmDeleteStale`, `_setRunReadline` not yet defined
- Existing 05-01 + 05-02 tests still pass (with await fix-ups if needed)
- Test commit landed: `test(05-03): add failing stale-deletion + confirmation prompt tests`
  </done>
  <recovery>
If existing 05-02 sync tests start hanging: they need `await` because syncInitiatives is now async. Add `async` + `await` to those tests in the same commit. If `process.stdin.isTTY` mutation crashes node: use `Object.defineProperty` with `configurable: true` (pattern shown in CF5).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Implement stale-deletion region (GREEN)</name>
  <files>
plugins/devflow/devflow/bin/lib/initiatives.cjs
plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
  </files>
  <action>
Add the stale-deletion region to `initiatives.cjs` (after writer region, before module.exports). Update `cmdInitiativesSync` in `initiatives-cli.cjs` to wire `--force` flag and `await` the now-async `syncInitiatives`.

For `initiatives.cjs`, add stale-deletion region:

```js
// ─── TRD 05-03: Stale-deletion region ────────────────────────────────────────

const readline = require('node:readline');

/**
 * Default real-readline confirmation prompt.
 * On non-TTY, returns false (skip).
 */
function _defaultConfirmDeleteStale(slug) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Delete ${slug}.md? [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test((answer || '').trim()));
    });
  });
}

let _runReadline = _defaultConfirmDeleteStale;
function _setRunReadline(fn) { _runReadline = (fn != null) ? fn : _defaultConfirmDeleteStale; }
function _confirmDeleteStale(slug) { return _runReadline(slug); }

/**
 * Detect initiative files whose source GitHub issue is closed AND not present in fresh_items.
 *
 * @param {object} opts
 * @param {string} opts.home - initiatives home dir
 * @param {object[]} opts.fresh_items - walkProject items from current sync
 * @returns {{ stale: Array<{slug, github_issue, reason}>, warnings: string[] }}
 */
function _detectStaleInitiatives({ home, fresh_items }) {
  const stale = [];
  const warnings = [];
  if (!_runFs.existsSync(home)) return { stale, warnings };
  const freshRefs = new Set();
  for (const it of (fresh_items || [])) {
    if (it.issue_ref) freshRefs.add(it.issue_ref);
  }
  let entries;
  try { entries = _runFs.readdirSync(home); } catch { return { stale, warnings }; }
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(home, entry);
    let content;
    try { content = _runFs.readFileSync(filePath, 'utf-8'); } catch { continue; }
    const parsed = _parseInitiativeFile(content);
    if (!parsed) continue; // skip malformed silently
    if (!parsed.github_issue) {
      warnings.push(`${parsed.slug || entry}: no github_issue field`);
      continue;
    }
    // If still in fresh project items, NOT stale (regardless of state).
    if (freshRefs.has(parsed.github_issue)) continue;
    // Verify issue is CLOSED via gh issue view
    const r = gh._setRunGh ? null : null; // (kept for clarity; we use the module's _runGh transitively)
    // Use gh's _runGh through a read accessor
    const viewR = (function _ghIssueView(ref) {
      // Direct call into gh.runGh equivalent via the underlying _runGh.
      // gh.cjs exposes runGh, but tests mock it via _setRunGh. We replicate via the gh module:
      // Use whichever underlying call gh internally uses. The cleanest path: gh module exposes _runGhRaw or we add a thin helper.
      // For TRD 05-03: use spawnSync directly (mirrors gh.runGh impl) BUT route through the same hook.
      // Simpler: re-export gh's _runGh access via a helper if needed. For now, use a small inline call.
      return _ghReadIssueState(ref);
    })(parsed.github_issue);
    if (!viewR.ok) {
      warnings.push(`${parsed.slug}: gh issue view failed: ${viewR.stderr}`);
      continue; // treat as not-stale (safer than deleting)
    }
    let state = null;
    try { state = JSON.parse(viewR.stdout).state; } catch {
      warnings.push(`${parsed.slug}: gh issue view returned non-JSON`);
      continue;
    }
    if (state !== 'CLOSED') continue;
    stale.push({ slug: parsed.slug, github_issue: parsed.github_issue, reason: 'closed_and_removed' });
  }
  return { stale, warnings };
}

/**
 * Read issue state via gh CLI. Routes through gh.cjs's _runGh injection so
 * tests can mock with _setRunGh.
 */
function _ghReadIssueState(issueRef) {
  // gh.cjs's runGh is module-internal but _setRunGh accepts a global mock.
  // Cleanest: require gh and call its public runGh-equivalent. gh.cjs doesn't
  // expose runGh directly — but _setRunGh swaps the internal _runGh. The mock
  // injected by tests covers ['issue', 'view', ref, '--json', 'state,closed'] args.
  // We invoke through a tiny helper that constructs args and uses spawnSync but
  // checks if a mock has been set.
  //
  // Pragmatic approach: import the runGh function via a sibling helper in gh.cjs.
  // If none exists, use spawnSync directly here AND have tests override at the
  // gh-module level (their _setRunGh injection mocks the central runGh used by walkProject etc.,
  // not necessarily this call). We need a SEPARATE injection point.
  //
  // PATTERN: introduce _ghRead function-pointer pattern here, mirroring _runReadline:
  if (typeof _ghReadIssueState._mock === 'function') {
    return _ghReadIssueState._mock(issueRef);
  }
  // Default: route via gh.cjs's exported _setRunGh-instrumented runGh.
  // We piggyback on the module's existing test-injected _runGh by issuing the
  // call through a simple proxy in gh.cjs. For TRD 05-03, add a thin
  // `gh.readIssueState(ref)` exported function:
  if (typeof gh.readIssueState === 'function') {
    return gh.readIssueState(issueRef);
  }
  // Fallback: direct spawnSync
  const { spawnSync } = require('child_process');
  const r = spawnSync('gh', ['issue', 'view', issueRef, '--json', 'state,closed'], {
    encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000,
  });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: (r.stderr || '').trim() };
}
// Test override hook (used by initiatives.cjs tests)
function _setGhReadIssueState(fn) { _ghReadIssueState._mock = fn; }

// CONTEXT.md NOTE: For test simplicity, alternative approach: tests use the
// existing _setRunGh from gh.cjs which the buildMockRunGhForInitiatives helper
// already covers (the helper handles 'issue view' args alongside 'auth status'
// and 'api graphql'). Recommend: enhance buildMockRunGhForInitiatives in 05-02
// fixtures to also handle 'issue view' args. Then _ghReadIssueState calls into
// gh.cjs::readIssueState which uses gh's _runGh (already mocked by the existing
// helper). NO new injection hook needed.
//
// REVISION (executor discretion): pick whichever of these cleanly maps to the
// existing test infrastructure. Recommended: add a small `readIssueState` exported
// helper to lib/gh.cjs that wraps `_runGh(['issue', 'view', ref, '--json', 'state,closed'])`.
// Then _detectStaleInitiatives calls gh.readIssueState(ref) — fully testable through
// existing _setRunGh mock.
```

**Executor-confirmed approach:** add `readIssueState(issueRef)` to `lib/gh.cjs` exports — simple wrapper around `_runGh(['issue', 'view', ref, '--json', 'state,closed'])`. This keeps test injection unified at the gh.cjs `_setRunGh` layer. Update `buildMockRunGhForInitiatives` in fixtures to handle `issue view` args:

```js
// In awareness-fixtures.cjs buildMockRunGhForInitiatives, add a handler:
if (args && args[0] === 'issue' && args[1] === 'view') {
  // ref is args[2]
  const issueState = (opts.issueStates || {})[args[2]] || 'OPEN';
  return { ok: true, status: 0, stdout: JSON.stringify({ state: issueState, closed: issueState === 'CLOSED' }), stderr: '' };
}
```

Then update `_detectStaleInitiatives` to call `gh.readIssueState(parsed.github_issue)` cleanly — no separate `_ghReadIssueState` indirection needed. Tests pass `issueStates` map to `buildMockRunGhForInitiatives`.

**Simplified `_detectStaleInitiatives`:**

```js
function _detectStaleInitiatives({ home, fresh_items }) {
  const stale = [];
  const warnings = [];
  if (!_runFs.existsSync(home)) return { stale, warnings };
  const freshRefs = new Set();
  for (const it of (fresh_items || [])) if (it.issue_ref) freshRefs.add(it.issue_ref);
  let entries;
  try { entries = _runFs.readdirSync(home); } catch { return { stale, warnings }; }
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = path.join(home, entry);
    let content;
    try { content = _runFs.readFileSync(filePath, 'utf-8'); } catch { continue; }
    const parsed = _parseInitiativeFile(content);
    if (!parsed) continue;
    if (!parsed.github_issue) {
      warnings.push(`${parsed.slug || entry}: no github_issue field`);
      continue;
    }
    if (freshRefs.has(parsed.github_issue)) continue;
    const viewR = gh.readIssueState(parsed.github_issue);
    if (!viewR.ok) {
      warnings.push(`${parsed.slug}: gh issue view failed: ${viewR.stderr}`);
      continue;
    }
    let state;
    try { state = JSON.parse(viewR.stdout).state; } catch {
      warnings.push(`${parsed.slug}: gh issue view returned non-JSON`);
      continue;
    }
    if (state !== 'CLOSED') continue;
    stale.push({ slug: parsed.slug, github_issue: parsed.github_issue, reason: 'closed_and_removed' });
  }
  return { stale, warnings };
}
```

Add `readIssueState` to gh.cjs exports (small additive change — surface lock for gh.cjs is already 23-entry; adding 1 makes 24; check obj 1 export-lock test isn't broken).

**`_deleteStaleFile` and `_runStaleDeletionLoop`:**

```js
function _deleteStaleFile(home, slug) {
  const filePath = path.join(home, `${slug}.md`);
  try {
    _runFs.unlinkSync(filePath);
    return { deleted: true, slug, reason: 'closed_and_removed' };
  } catch (e) {
    return { deleted: false, slug, reason: `unlink_failed: ${e.message}` };
  }
}

async function _runStaleDeletionLoop({ home, stale_entries, force }) {
  const deleted = [];
  const warnings = [];
  for (const entry of stale_entries) {
    let proceed = false;
    if (force) {
      proceed = true;
    } else {
      try {
        proceed = await _runReadline(entry.slug);
      } catch (e) {
        warnings.push(`${entry.slug}: confirmation prompt failed: ${e.message}`);
        continue;
      }
    }
    if (!proceed) continue;
    const r = _deleteStaleFile(home, entry.slug);
    if (r.deleted) deleted.push(r);
    else warnings.push(`${entry.slug}: ${r.reason}`);
  }
  return { deleted, warnings };
}
```

**Update `syncInitiatives` to integrate stale-deletion (now async):**

```js
async function syncInitiatives(opts = {}) {
  // 1. Hard-fail auth
  gh.requireGhAuth(['project', 'read:project', 'repo']);
  const home = opts.home || defaultInitiativesHome();
  const projectId = opts.project_id || (gh.PRODUCT_ROADMAP_FIELDS && gh.PRODUCT_ROADMAP_FIELDS._project_id) || null;
  const written = []; const deleted = []; const skipped = []; const warnings = [];

  if (!projectId) {
    return { ok: false, written, deleted, skipped, warnings: ['no project_id available'] };
  }

  let walk;
  try { walk = gh.walkProject(projectId); }
  catch (e) { return { ok: false, written, deleted, skipped, warnings: [`walkProject failed: ${e.message}`] }; }
  warnings.push(...(walk.warnings || []));

  // 2. Writer loop (TRD 05-02 — unchanged)
  const updatedAt = new Date().toISOString();
  for (const item of (walk.items || [])) {
    if (!_qualifiesAsInitiative(item)) {
      skipped.push({ title: item.title || '(untitled)', reason: 'does_not_qualify' });
      continue;
    }
    const slug = _slugifyInitiativeTitle(item.title);
    if (!slug) { skipped.push({ title: item.title, reason: 'no_slug' }); continue; }
    if (opts.initiative && opts.initiative !== slug) continue;
    const data = { slug, github_issue: item.issue_ref, parent_project: projectId,
                   key_repos: _deriveKeyRepos(item), updated_at: updatedAt,
                   title: item.title.replace(/^\[[^\]]+\]\s*/, ''),
                   why: _extractWhyFromBody(item.body), open_questions: _extractQuestionsFromBody(item.body),
                   sub_issues: item.sub_issues || [],
                   status: item.item_type === 'draft' ? 'DRAFT' : 'OPEN',
                   project_status: item.status, quarter: item.quarter };
    try { written.push(_writeInitiativeFile(home, data)); }
    catch (e) { skipped.push({ title: item.title, reason: `write_failed: ${e.message}` }); }
  }

  // 3. Stale-deletion loop (TRD 05-03 — NEW)
  // Skipped entirely in single-initiative mode per CONTEXT.md decision #4 step 6.
  if (!opts.initiative) {
    const { stale, warnings: detectWarn } = _detectStaleInitiatives({ home, fresh_items: walk.items });
    warnings.push(...detectWarn);
    // Non-TTY skip when force=false: detect that the prompt would short-circuit
    if (stale.length > 0) {
      // If force=false AND non-TTY: skip entire loop with single warning
      if (!opts.force && !process.stdin.isTTY && _runReadline === _defaultConfirmDeleteStale) {
        warnings.push(`stale deletion skipped (non-interactive); ${stale.length} files would be deleted with --force`);
      } else {
        const loop = await _runStaleDeletionLoop({ home, stale_entries: stale, force: opts.force });
        deleted.push(...loop.deleted);
        warnings.push(...loop.warnings);
      }
    }
  }

  return { ok: true, written, deleted, skipped, warnings };
}
```

For `initiatives-cli.cjs`: update `cmdInitiativesSync` to await + pass `force`:

```js
async function cmdInitiativesSync(cwd, args) {
  const { flags } = _parseFlags(args);
  try {
    const result = await init.syncInitiatives({
      home: flags.home,
      project_id: flags['project-id'],
      initiative: flags.initiative,
      force: flags.force === true,
    });
    if (!result.ok) {
      process.stderr.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(1);
      return;
    }
    output(result, flags.raw, JSON.stringify(result, null, 2));
  } catch (e) {
    if (e.name === 'GhAuthError') {
      process.stderr.write(JSON.stringify({
        error: e.message, remediation: e.remediation, scopes_missing: e.scopes_missing,
      }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    process.stderr.write(JSON.stringify({ error: e.message }, null, 2) + '\n');
    process.exit(1);
  }
}
```

Update `cmdInitiativesRoute` dispatch — `case 'sync'` now must handle the Promise (fire-and-forget; node will await before exit because of the `await` inside the fn).

Update partial module.exports to include 05-03 additions:

```js
module.exports = {
  // Reader (TRD 05-01):
  loadInitiatives, matchByRepo, formatInitiativeForPlanner, _parseInitiativeFile, _truncateWhy,
  // Writer (TRD 05-02):
  syncInitiatives, _writeInitiativeFile, _qualifiesAsInitiative, _slugifyInitiativeTitle, _renderInitiativeMarkdown,
  // Stale-deletion (TRD 05-03):
  _detectStaleInitiatives, _deleteStaleFile, _confirmDeleteStale, _setRunReadline,
  // Test hooks:
  _setRunFs, _setRunGh, _resetMocks,
  // Constants:
  INITIATIVES_HOME_REL, MAX_WHY_CHARS, MAX_QUESTIONS_BULLETS, MAX_SUBISSUES_LINES,
  MAX_FORMATTED_PLANNER_CHARS, defaultInitiativesHome,
};
```

Update `_resetMocks` to also reset `_runReadline`:

```js
function _resetMocks() {
  _runFs = realFs;
  gh._setRunGh(null);
  _runReadline = _defaultConfirmDeleteStale;
}
```

Add `gh.readIssueState` to `lib/gh.cjs` — small additive function:

```js
function readIssueState(issueRef) {
  return _runGh(['issue', 'view', issueRef, '--json', 'state,closed']);
}
// Add to module.exports
```

Run tests; commit: `feat(05-03): implement stale-deletion + --force + readline confirmation`

# CRITICAL: gh.readIssueState is a NEW exported function in gh.cjs. If gh.cjs has an export-lock test (it does — TRD 01-06 likely), update that test in the same commit. Check: `grep "Object.keys.*gh.cjs.*deepStrictEqual" plugins/devflow/devflow/bin/lib/gh.test.cjs`.
# GOTCHA: process.stdin.isTTY is the BEST signal for "interactive context". Do NOT rely on environment variables.
# PATTERN: stale-deletion loop is async because of readline prompt; syncInitiatives now async; cmdInitiativesSync now awaits.
  </action>
  <verify>
cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test 2>&1 | tail -20
# Expected: all tests pass. Watch for:
#   - existing 05-02 sync tests passing with await fix-ups
#   - new 28 stale-deletion tests passing
#   - gh.cjs export-lock test updated for readIssueState entry
node -e "const i = require('./plugins/devflow/devflow/bin/lib/initiatives.cjs'); console.log(typeof i._detectStaleInitiatives, typeof i._setRunReadline);"
# Expected: "function function"
  </verify>
  <done>
- Stale-deletion region implemented (_detectStaleInitiatives, _deleteStaleFile, _confirmDeleteStale, _runStaleDeletionLoop, _setRunReadline)
- syncInitiatives is async and integrates stale-deletion AFTER writer loop
- --force flag wired through cmdInitiativesSync
- gh.readIssueState added + exported (export-lock test for gh.cjs updated atomically)
- All 28 new tests pass + all existing tests pass
- 2 atomic commits land: `test(05-03): ...` then `feat(05-03): ...`
- SC-7 closed (stale deletion + --force + confirmation + non-TTY skip)
  </done>
  <recovery>
If gh.cjs export-lock test fails for readIssueState: update the expected exports array in `gh.test.cjs` to include `readIssueState`. Surface lock IS the contract; bumping it from N to N+1 is allowed when documented + atomic.

If async-await breaks 05-02 tests: those tests need `async () =>` and `await init.syncInitiatives(...)`. Fix in same commit.

If `_runReadline` references hang: ensure tests `await` the call AND `_resetMocks()` after. The test runner's stdin is non-TTY by default in CI; CF5 should pass without manual TTY mutation.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test</test>
</validation_gates>

<verification>
1. **Stale detection** — `_detectStaleInitiatives` finds files whose `github_issue` is CLOSED AND not in `fresh_items`. CLOSED issues still in fresh_items are NOT stale (DS5).
2. **--force flag** — bypasses confirmation prompt; deletes unconditionally. Tests SF1, CLI3-1.
3. **Confirmation prompt** — TTY readline returns true on y/yes; false on n/empty/EOF. Tests CF1-CF6.
4. **Non-TTY skip** — when stdin is not a TTY AND --force is absent, stale deletion logs warning + skips. Test SF4.
5. **Single-initiative mode** — completely skips stale-deletion. Test SF5.
6. **Order of operations** — writer loop runs FIRST; stale detection runs AFTER. Test SF7 verifies a freshly-written file is never marked stale.
7. **Surface lock unchanged** — TRD 05-03 adds `_detectStaleInitiatives`, `_deleteStaleFile`, `_confirmDeleteStale`, `_setRunReadline` to partial exports. Final lock at TRD 05-05.
</verification>

<success_criteria>
- [ ] Stale-deletion region implemented in initiatives.cjs
- [ ] gh.readIssueState added + exported (gh.cjs export-lock test updated)
- [ ] syncInitiatives is now async and integrates stale-deletion after writer
- [ ] --force flag wired through cmdInitiativesSync
- [ ] _setRunReadline injection hook for test-deterministic confirmation
- [ ] 28 new tests pass (DS 9 + CF 6 + DD 3 + SF 7 + CLI3 3)
- [ ] No regressions; existing 05-01 + 05-02 tests still pass
- [ ] 2 atomic commits land: `test(05-03): ...` then `feat(05-03): ...`
- [ ] SC-7 closed
</success_criteria>

<output>
After completion, create `.planning/objectives/05-initiative-context-layer/05-03-SUMMARY.md` documenting:
- Stale-deletion logic + state-and-removal criterion
- TTY-gated confirmation; non-TTY skip behavior
- gh.readIssueState added (mention export-lock bump for gh.cjs)
- syncInitiatives async transition impact
- Where 05-04 picks up (skill + plan integration; no further changes to initiatives.cjs)
</output>

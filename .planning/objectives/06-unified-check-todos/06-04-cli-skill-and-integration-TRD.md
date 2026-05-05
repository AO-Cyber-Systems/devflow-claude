---
objective: 06-unified-check-todos
trd: 06-04
type: tdd
confidence: high
wave: 4
depends_on:
  - 06-03
files_modified:
  - plugins/devflow/devflow/bin/lib/check-todos.cjs
  - plugins/devflow/devflow/bin/lib/check-todos.test.cjs
  - plugins/devflow/devflow/bin/lib/check-todos-cli.cjs
  - plugins/devflow/devflow/bin/lib/check-todos-cli.test.cjs
  - plugins/devflow/skills/check-todos/SKILL.md
autonomous: true
requirements:
  - SC-6
  - SC-7
  - SC-8
  - SC-9
  - SC-10
must_haves:
  truths:
    - "df-tools check-todos (default) emits formatted Markdown via formatCheckTodosMarkdown — not raw JSON"
    - "df-tools check-todos --all bypasses lane truncation"
    - "df-tools check-todos --refresh forces all-source re-fetch"
    - "df-tools check-todos --lane <name> filters to one lane (lane name validated against LANE_NAMES)"
    - "df-tools check-todos --raw emits JSON aggregate (full result object)"
    - "/devflow:check-todos skill invokes df-tools check-todos $ARGUMENTS (REWRITES the legacy local-todos-only skill)"
    - "lib/check-todos.cjs module.exports is locked at 19-entry surface with 'LOCKED by TRD 06-04' banner comment"
    - "EX1 export-lock test: Object.keys(check-todos).sort() deepStrictEqual to expected 19-entry list"
    - "GH_INTEGRATION=1 round-trip test: live aggregate against this repo + user's actual GH state"
    - "Self-test: df-tools check-todos --raw against this repo returns valid JSON with all 5 sources surfacing data"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/check-todos.cjs"
      provides: "Final locked module.exports + banner comment"
      contains: "LOCKED by TRD 06-04"
    - path: "plugins/devflow/devflow/bin/lib/check-todos-cli.cjs"
      provides: "Full CLI flag handling: --all, --refresh, --lane, --raw"
      contains: "formatCheckTodosMarkdown"
    - path: "plugins/devflow/skills/check-todos/SKILL.md"
      provides: "Unified standup skill (REWRITTEN from legacy local-only browser)"
      contains: "df-tools check-todos"
  key_links:
    - from: "plugins/devflow/skills/check-todos/SKILL.md"
      to: "df-tools check-todos"
      via: "$ARGUMENTS passthrough"
      pattern: "df-tools check-todos \\$ARGUMENTS"
    - from: "lib/check-todos-cli.cjs::cmdCheckTodosRoute"
      to: "lib/check-todos.cjs::aggregate + formatCheckTodosMarkdown"
      via: "library invocation per flag mode"
      pattern: "aggregate\\(|formatCheckTodosMarkdown\\("
    - from: "EX1 export-lock test"
      to: "module.exports key list"
      via: "deepStrictEqual"
      pattern: "deepStrictEqual"
    - from: "Self-test (E2E1)"
      to: "this repo's actual planning state"
      via: "df-tools check-todos --raw against process.cwd()"
      pattern: "process\\.cwd\\(\\)"
---

<objective>
Final TRD for objective 6. Three concerns wrapped per planning directives:

1. **CLI flag wiring (standard task):** Replace TRD 06-01's stub-only `cmdCheckTodosRoute` with full flag handling: `--all`, `--refresh`, `--lane <name>`, `--raw`. Default mode renders Markdown via `formatCheckTodosMarkdown`; `--raw` emits JSON.
2. **Skill REWRITE (standard task):** `/devflow:check-todos` SKILL.md is REWRITTEN from the legacy local-todos-only browser to a thin orchestrator invoking `df-tools check-todos $ARGUMENTS`. The legacy `workflows/check-todos.md` file remains untouched (still callable via `df-tools list-todos` for users who want the old flow).
3. **Export-surface lock + e2e integration (TDD):** `module.exports` finalized with banner comment + EX1 deepStrictEqual test. Round-trip integration test gated on `GH_INTEGRATION=1`. Self-test against this repo's actual state asserts all 5 sources can be surfaced.

Purpose: SC-6 (CLI flags), SC-7 (skill), SC-8 (export-lock + module surface), SC-9 (GH_INTEGRATION round-trip), SC-10 (self-test against this repo).
Output: full CLI module + REWRITTEN skill + locked module.exports + EX/E2E test groups.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── check-todos.cjs                ← MODIFY (final module.exports + banner)
├── check-todos.test.cjs           ← MODIFY (add EX/E2E groups)
├── check-todos-cli.cjs            ← MODIFY (replace stub with full flag wiring)
└── check-todos-cli.test.cjs       ← MODIFY (replace 06-01 scaffold tests with full CLI tests)

plugins/devflow/skills/
└── check-todos/
    └── SKILL.md                   ← REWRITE (legacy local-only → unified standup)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Full CLI flag wiring (replace 06-01 stub):**

```js
// lib/check-todos-cli.cjs (full TRD 06-04 implementation)
'use strict';

const ct = require('./check-todos.cjs');
const { output, error } = require('./helpers.cjs');

function _parseFlags(args) {
  const flags = {};
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--all' || a === '--refresh' || a === '--raw') {
      flags[a.slice(2)] = true;
      i++;
    } else if (a === '--lane') {
      flags['lane'] = args[i + 1] || null;
      i += 2;
    } else if (a.startsWith('--')) {
      // Unknown flag — record for diagnostics but don't error (forward-compat with future flags)
      flags[a.slice(2)] = true;
      i++;
    } else {
      i++; // positional silently ignored
    }
  }
  return flags;
}

function cmdCheckTodosRoute(cwd, args, raw) {
  const flags = _parseFlags(args);

  if (flags['lane'] && !ct.LANE_NAMES.includes(flags['lane'])) {
    error(`Unknown lane: ${flags['lane']}. Valid: ${ct.LANE_NAMES.join(', ')}`);
  }

  // raw flag from main() arg-strip OR --raw flag from local parse
  const isRaw = !!raw || !!flags['raw'];

  const aggregateResult = ct.aggregate({
    projectRoot: cwd,
    refresh: !!flags['refresh'],
  });

  if (isRaw) {
    output(aggregateResult, true, JSON.stringify(aggregateResult, null, 2));
    return;
  }

  // Markdown render path
  const markdown = ct.formatCheckTodosMarkdown(aggregateResult, {
    all: !!flags['all'],
    lane: flags['lane'] || null,
  });

  output({
    rendered: markdown.length,
    cached: aggregateResult.cached,
    warnings_count: (aggregateResult.warnings || []).length,
  }, false, markdown);
}

module.exports = { cmdCheckTodosRoute, _parseFlags };
```

# CRITICAL: `output()` from helpers.cjs handles BOTH the JSON path (`raw=true`) and the human-readable path (`raw=false` → second arg is the string to emit). The CLI's job is to choose the right `display` string + structured JSON.
# CRITICAL: `df-tools.cjs main()` strips `--raw` from args before dispatch. The CLI flag parser also handles `--raw` for safety (in case it survives stripping in some edge case). Both should converge to the same `isRaw` decision.
# GOTCHA: `error()` from helpers.cjs calls `process.exit(1)` — used for `--lane invalid-name` failure. Tests capture this via `execSync` exit code.
# PATTERN: Mirror obj 5 TRD 05-04 cmdInitiativesFormatForPlanner CLI structure — read aggregate, branch on `isRaw`, format, output.

**REWRITTEN skill SKILL.md (replaces legacy local-only browser):**

```markdown
---
name: check-todos
description: |
  Morning-standup view across local todos + GitHub issues + active peer sessions + initiative open questions + dup-detect log. Aggregates 5 sources into 4 urgency lanes (🔥 Blocked-on-you / ⚡ Now / 📋 Soon / 💡 Ideas) and renders a single terminal-friendly Markdown view.
  Use when the user wants the "what should I work on right now?" answer, a morning standup view, a cross-source overview of pending work, or to confirm whether they've missed any GH-issue assignments / mentions / review requests.
  Triggers on: "what should I work on?", "what's on my todo list?", "morning standup", "check todos", "what's pending?", "what should I do today?", "any review requests?", "what's blocking me?", "show pending todos", "what's in flight for me?", "any GitHub mentions?".
argument-hint: "[--all] [--refresh] [--lane blocked|now|soon|ideas] [--raw]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Render a single morning-standup Markdown view across 5 sources, grouped by urgency lane:

| Emoji | Lane | Sources |
|---|---|---|
| 🔥 | Blocked-on-you | Active peer sessions blocked on this user + dup-detect coordinate/blocking-execute resolutions (last 7 days) |
| ⚡ | Now | GH issues assigned to `@me` with priority labels + active peer sessions on this repo |
| 📋 | Soon | GH issues mentioning `@me` (not assigned) + review-requested issues + initiative open questions |
| 💡 | Ideas | Local todos + GH issues assigned without priority |

Cache lives at `.planning/.check-todos-cache.json` (gitignored), 10-min TTL per source. `--refresh` forces re-fetch. `--all` removes per-lane truncation (default top 5). `--lane <name>` filters to one lane. `--raw` emits the full aggregate JSON instead of Markdown.

Limitations (locked in v1.1):
- **Single-org scope** — only walks the org configured in PROJECT.md `github_repo`. Cross-org aggregation is v1.2+.
- **Read-only** — no mutation operations. Click into the right tool (gh CLI, editor) to act on entries.
- **gh-auth degrades gracefully** — missing/expired auth surfaces a warning + skips the gh source; other 4 sources still render.
- **Deterministic lane assignment** — no AI/LLM scoring; lane rules are lexical-only.

The legacy local-only browser is preserved as `df-tools list-todos` for users who want the old workflow.
</objective>

<execution_context>
@.planning/STATE.md
@.planning/.check-todos-cache.json
</execution_context>

<process>
**Run the check-todos CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs check-todos $ARGUMENTS
```

The CLI:

1. Parses flags: `--all`, `--refresh`, `--lane <name>`, `--raw`.
2. Calls `aggregate({ projectRoot, refresh })` from `lib/check-todos.cjs`.
3. For each of 5 sources: cache hit (within TTL) serves cached data; cache miss / refresh fetches fresh.
4. `_assignLane` routes each entry into one of 4 lanes deterministically.
5. For default render: `formatCheckTodosMarkdown` produces emoji-prefixed Markdown with per-entry source attribution.
6. For `--raw`: emits the full aggregate JSON.

**After the command runs, present the output to the user verbatim** — show the Markdown so urgency emoji renders. Don't summarize.

If gh auth is missing, the gh source is skipped with a warning footer; the other 4 sources still surface. If the user wants gh issues, run `gh auth refresh -h github.com -s repo` first.
</process>

<context>
The cache file `.planning/.check-todos-cache.json` is gitignored (TRD 06-02). It's safe to ignore accidentally — the gitignore prevents commit.

Subcommand options:
- `df-tools check-todos` — default; Markdown render, top 5 per lane, cached when fresh.
- `df-tools check-todos --all` — show all entries (no truncation).
- `df-tools check-todos --refresh` — force re-fetch all 5 sources.
- `df-tools check-todos --lane <name>` — filter to one lane (`blocked` | `now` | `soon` | `ideas`).
- `df-tools check-todos --raw` — emit full aggregate JSON.

**Read-only contract:** the skill never mutates any source. To act on an entry, the user navigates to the right tool (gh CLI for issues, editor for local todos, coordinate-with-teammate for peer/dup-detect entries).
</context>
```

# CRITICAL: REWRITES the existing `/devflow:check-todos/SKILL.md`. The legacy file delegated to `workflows/check-todos.md` (a local-only TodoWrite browser). The new skill delegates to the unified `df-tools check-todos` CLI. The legacy workflow file is preserved untouched.
# GOTCHA: `description` field has a multiline `|` block — preserve YAML block-scalar syntax exactly. Triggers list MUST include the new "morning standup" / "what's pending?" / "any review requests?" phrases — they're the user-facing lexical hints.
# PATTERN: Mirror obj 5 `/devflow:initiatives` SKILL.md (subprocess invocation + verbatim presentation).

**Export-lock banner pattern (mirror obj 5 TRD 05-05):**

```js
// ─── module.exports — LOCKED by TRD 06-04 (19-entry surface; SC-8) ──────────
//
// This block is the AUTHORITATIVE export surface for lib/check-todos.cjs.
// Asserted by EX1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the EX1 test + 06-CONTEXT.md §"Module surface".

module.exports = {
  // Public API (TRD 06-01, 06-02, 06-03):
  aggregate,
  formatCheckTodosMarkdown,

  // Source fetchers (TRD 06-01):
  _fetchLocalTodos,
  _fetchGhIssues,
  _fetchPeerSessions,
  _fetchInitiativeQuestions,
  _fetchDupDetectLog,

  // Lane assignment (TRD 06-01):
  _assignLane,

  // Cache helpers (TRD 06-02):
  readCheckTodosCache,
  writeCheckTodosCache,
  isCheckTodosCacheStale,

  // Test hooks (TRD 06-01):
  _setRunGh,
  _setRunFs,
  _setRunPeer,
  _resetMocks,

  // Constants (TRD 06-01):
  CHECK_TODOS_CACHE_REL,
  CHECK_TODOS_TTL_MINUTES,
  MAX_CHECK_TODOS_OUTPUT_CHARS,
  DEFAULT_LANE_TRUNCATE,
  LANE_NAMES,
};
```

**EX1 export-lock test pattern:**

```js
test('EX1: module.exports surface is locked (deepStrictEqual on Object.keys)', () => {
  const expected = [
    'CHECK_TODOS_CACHE_REL',
    'CHECK_TODOS_TTL_MINUTES',
    'DEFAULT_LANE_TRUNCATE',
    'LANE_NAMES',
    'MAX_CHECK_TODOS_OUTPUT_CHARS',
    '_assignLane',
    '_fetchDupDetectLog',
    '_fetchGhIssues',
    '_fetchInitiativeQuestions',
    '_fetchLocalTodos',
    '_fetchPeerSessions',
    '_resetMocks',
    '_setRunFs',
    '_setRunGh',
    '_setRunPeer',
    'aggregate',
    'formatCheckTodosMarkdown',
    'isCheckTodosCacheStale',
    'readCheckTodosCache',
    'writeCheckTodosCache',
  ];
  // Note: alphabetical sort puts _ prefixed AFTER constants but BEFORE lowercase letters
  // (UPPERCASE < _ < lowercase per ASCII). Verify expected list matches sort order.
  const ct = require('./check-todos.cjs');
  assert.deepStrictEqual(Object.keys(ct).sort(), expected.sort());
});

test('EX2: module.exports has banner comment', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require.resolve('./check-todos.cjs'), 'utf-8');
  assert.match(src, /─── module\.exports — LOCKED by TRD 06-04/);
});

test('EX3: module.exports lists 19 entries (count check)', () => {
  const ct = require('./check-todos.cjs');
  assert.strictEqual(Object.keys(ct).length, 20);  // 19 listed + count check helper
  // NOTE: Original ROADMAP says 19 entries; recount: 2 public + 5 fetchers + 1 lane + 3 cache + 4 hooks + 5 constants = 20.
  // Actually re-count above: aggregate, formatCheckTodosMarkdown (2) + 5 fetchers (5) + _assignLane (1) + 3 cache (3) + 4 hooks (4) + 5 constants (5) = 20.
  // Update CONTEXT.md surface count if needed (or accept 20 as the locked surface).
});
```

# CRITICAL: Recount the surface — CONTEXT.md said "19 entries" but recount gives 20 (2 public + 5 fetchers + 1 lane + 3 cache + 4 hooks + 5 constants = 20). The locked count is whichever number the implementation actually exposes; update either the EX3 assertion OR the CONTEXT.md/banner string to match. RECOMMENDED: lock at 20 entries (the actual count); update banner comment + EX3 to "20-entry surface". Document the deviation in SUMMARY.
# CRITICAL: `Object.keys().sort()` in JS sorts UPPERCASE before _ before lowercase per ASCII (per the comment in the test). Verify the `expected` list is in proper sort order before deepStrictEqual.
# PATTERN: Mirror obj 4 TRD 04-06 EX1 + EX2 + EX3 trio. Banner is the true RED gate (EX2); EX1 may already pass at RED if 06-01/02/03 happened to leave correct surface.

**E2E1 self-test against THIS repo's state (mirror obj 5 TRD 05-05 IT5 + obj 9 TRD 09-03 E2E1):**

```js
test('E2E1: SELF-TEST — df-tools check-todos --raw against this repo emits valid JSON with 6-key shape', { timeout: 30000 }, () => {
  const { execSync } = require('child_process');
  const path = require('path');
  const repoRoot = process.cwd();
  const dfTools = path.join(repoRoot, 'plugins', 'devflow', 'devflow', 'bin', 'df-tools.cjs');

  let stdout;
  try {
    stdout = execSync(`node ${dfTools} check-todos --raw`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 25000,
    });
  } catch (err) {
    // execSync throws on non-zero exit; check-todos may exit 1 if gh auth missing.
    // We tolerate that — the JSON should still be on stdout.
    stdout = err.stdout || '';
  }

  // Parse stdout as JSON
  let result;
  try {
    result = JSON.parse(stdout);
  } catch (parseErr) {
    assert.fail(`Could not parse stdout as JSON. Raw output (first 500 chars): ${stdout.slice(0, 500)}`);
  }

  // Verify 6-key aggregate shape
  for (const key of ['blocked', 'now', 'soon', 'ideas', 'warnings', 'cached']) {
    assert.ok(key in result, `Expected key '${key}' in aggregate result`);
  }
  assert.ok(Array.isArray(result.blocked));
  assert.ok(Array.isArray(result.now));
  assert.ok(Array.isArray(result.soon));
  assert.ok(Array.isArray(result.ideas));
  assert.ok(Array.isArray(result.warnings));
  assert.strictEqual(typeof result.cached, 'boolean');

  // Verify at least one source surfaced data — this repo has obj 4 dup-detect log,
  // obj 5 initiatives, obj 2 STATE.md, etc., so SOME entries should appear (or warnings).
  const totalEntries = result.blocked.length + result.now.length + result.soon.length + result.ideas.length;
  const totalWarnings = result.warnings.length;
  assert.ok(totalEntries + totalWarnings > 0,
    'Expected at least one entry or warning surfaced from this repo state');
});
```

# CRITICAL: E2E1 is the SC-10 acceptance gate. It MUST run on every test execution (no env gate). It tolerates `gh auth` failures because the goal is to confirm the aggregate runs end-to-end against THIS repo, not to require live gh.
# GOTCHA: `process.cwd()` at test time is repo root because `npm test` runs from there. Resolve `df-tools.cjs` from `process.cwd()` to handle both root-cwd and lib-cwd execution.

**E2E2 GH_INTEGRATION round-trip (mirror obj 5 TRD 05-05 IT1):**

```js
test('E2E2: GH_INTEGRATION round-trip — live aggregate against current GH state', { skip: !process.env.GH_INTEGRATION, timeout: 60000 }, () => {
  const { execSync } = require('child_process');
  const path = require('path');
  const repoRoot = process.cwd();
  const dfTools = path.join(repoRoot, 'plugins', 'devflow', 'devflow', 'bin', 'df-tools.cjs');

  // Force-refresh to bypass any cache from previous test runs
  const stdout = execSync(`node ${dfTools} check-todos --raw --refresh`, {
    cwd: repoRoot,
    encoding: 'utf-8',
    timeout: 55000,
  });

  const result = JSON.parse(stdout);

  // With GH_INTEGRATION, expect EITHER gh entries OR a gh_auth_failure warning (never both empty if env is set correctly)
  const hasGhEntries = (result.blocked.concat(result.now, result.soon, result.ideas))
    .some(e => e && e.source === 'gh');
  const hasGhAuthFailure = (result.warnings || []).some(w => w.kind === 'gh_auth_failure');

  if (!hasGhEntries && !hasGhAuthFailure) {
    // User has gh auth but zero matching issues — also valid (e.g., issues all closed).
    // Just verify gh source was attempted (no fetch_error warning for gh).
    const ghFetchError = (result.warnings || []).some(w => w.source === 'gh' && w.kind === 'fetch_error');
    assert.ok(!ghFetchError, 'gh source should not have fetch_error in GH_INTEGRATION mode');
  }

  assert.strictEqual(result.cached, false, 'Expected cached=false under --refresh');
});
```

# CRITICAL: This test is gated on `GH_INTEGRATION=1`; skipped cleanly without env. SC-9 acceptance.
# GOTCHA: `cached: false` after `--refresh` is the only hard assertion under GH_INTEGRATION. Issue-count assertions are too brittle (depends on user's actual GH state).
</codebase_examples>

<anti_patterns>
- **Don't preserve the legacy local-only behavior in the skill.** TRD 06-04 REWRITES the skill — the new skill delegates to `df-tools check-todos`, not `workflows/check-todos.md`. The legacy file remains in the repo for users who want the old browser via `df-tools list-todos`.
- **Don't add interactive prompting to the CLI.** No "did you mean?" guesses; just validate flags and exit on unknown lanes.
- **Don't add additional flags beyond `--all`, `--refresh`, `--lane`, `--raw`.** Out of scope. Future flags (e.g., `--quarter`, `--repo`) are v1.2+.
- **Don't add output that depends on Date.now() OR process.env beyond the date stamp.** The formatter is deterministic for fixed input.
- **Don't make E2E1 (self-test) gated on env.** It MUST run on every `npm test`. Tolerates gh auth failure (graceful degradation is the contract).
- **Don't inline-test the locked module surface.** Express it as `expected` array literal in EX1; deepStrictEqual to actual `Object.keys().sort()`. This is the surface-lock pattern from obj 4 TRD 04-06 + obj 5 TRD 05-05.
- **Don't bump the CONTEXT.md "19-entry" claim to "20-entry" without verifying.** Recount the actual surface from the implementation; lock at whichever count is real. Update banner + CONTEXT.md + EX3 (if used) atomically. Document the recount in SUMMARY.
</anti_patterns>

<error_recovery>
- **Skill discovery requires session restart:** Skills are auto-loaded by the `sync-runtime` SessionStart hook. After REWRITING SKILL.md, the next session-start hook fires the mirror to `~/.claude/devflow/skills/check-todos/SKILL.md`. Document in SUMMARY: "skill takes effect on next session restart". Manual mirror trigger: `node plugins/devflow/hooks/sync-runtime.js`.
- **df-tools.cjs case-arm collision:** Already exists from TRD 06-01 (`case 'check-todos'`). This TRD does NOT modify df-tools.cjs.
- **CLI subprocess test working directory:** `execSync('node df-tools.cjs ...', { cwd: tmpRoot })` — always pass `cwd` explicitly so the CLI resolves PROJECT.md / cache file at the right path.
- **EX1 fails because actual surface ≠ expected list:** The expected list MUST exactly match `Object.keys(module.exports).sort()`. If they differ, fix EXPECTED to match ACTUAL — the implementation defines the surface, the test asserts it. Don't add/remove from the implementation just to match a stale test expectation; instead update the test to mirror the locked design.
- **E2E1 fails on first run:** Most likely cause is the `df-tools` invocation crashes (e.g., a fetch helper throws unhandled). Run `node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw` manually from repo root and read the stderr.
- **GH_INTEGRATION=1 test fails because gh CLI not installed:** Skipping rule should be `process.env.GH_INTEGRATION && _isGhAvailable()`. Add a `_isGhAvailable` helper if needed (just `try { execSync('gh --version'); return true; } catch { return false; }`). Tests skip cleanly.
- **Skill REWRITE merge conflict:** If another change has touched `plugins/devflow/skills/check-todos/SKILL.md` between TRD 06-01 and 06-04, the rewrite simply overwrites — the new content is canonical. Document the previous content's filepath in SUMMARY for audit.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/06-unified-check-todos/06-CONTEXT.md
@.planning/objectives/06-unified-check-todos/06-01-aggregator-and-fixtures-SUMMARY.md
@.planning/objectives/06-unified-check-todos/06-02-cache-layer-SUMMARY.md
@.planning/objectives/06-unified-check-todos/06-03-formatter-SUMMARY.md
@plugins/devflow/devflow/bin/lib/check-todos.cjs
@plugins/devflow/devflow/bin/lib/check-todos-cli.cjs
@plugins/devflow/skills/initiatives/SKILL.md
@plugins/devflow/skills/awareness/SKILL.md
</context>

<gotchas>
- **Test list propagation:** Append the EX/E2E test list to existing top-of-file comment block in `check-todos.test.cjs` (preserve TRD 06-01/02/03 lists; add 06-04 section).
- **CLI test isolation:** Each CLI test that exercises argv parsing must reset `_runFs`, `_runPeer`, `gh._setRunGh(null)` in `afterEach` to prevent test pollution.
- **`output()` helper exits process:** `helpers.cjs::output` calls `process.exit(0)` on success. CLI tests for the rewritten cmdCheckTodosRoute MUST use `execSync('node df-tools.cjs check-todos ...')` subprocess pattern — NOT in-process invocation.
- **Skill discovery:** Skills are auto-loaded from `plugins/devflow/skills/<name>/SKILL.md`. The `sync-runtime` hook mirrors them to `~/.claude/devflow/skills/<name>/SKILL.md` on session start. After REWRITING SKILL.md, user must restart Claude Code OR the next session-start hook fires the mirror. Document in SUMMARY: "skill takes effect on next session restart."
- **Surface count recount required:** Recount the actual `module.exports` surface BEFORE locking. CONTEXT.md said 19 but mechanical recount gives 20 (2 public + 5 fetchers + 1 lane + 3 cache + 4 hooks + 5 constants = 20). LOCK AT 20. Update banner string + CONTEXT.md surface count + EX3 (if used) atomically. Document in SUMMARY.
- **Self-test (E2E1) tolerates gh auth failure:** This repo's actual gh state may not have any matching issues; gh auth may be missing in CI. The assertion is: aggregate produces valid 6-key shape AND total entries+warnings > 0 (something surfaced from the 5 sources — at minimum a `gh_auth_failure` warning OR a dup-detect log entry from this repo's history).
- **Replacing 06-01 CLI scaffold tests:** The CLI tests in `check-todos-cli.test.cjs` (CLI1-CLI4 from TRD 06-01) assumed raw-JSON-only output. TRD 06-04 changes default to Markdown. Update CLI tests accordingly — CLI1 from "raw JSON" to "Markdown with `## 🔥 Blocked`-on-you` heading"; new CLI tests for `--raw` (JSON), `--all` (no truncation), `--lane <name>` (single lane). Mirror obj 3 TRD 03-02 deviation pattern (TRD 03-01 wrote stub-style CLI5 test; 03-02 rewrote it).
</gotchas>

## Test list

Hand-built test cases. EX/E2E groups added in this TRD; existing CLI scaffold tests UPDATED to assert real behavior.

### Group EX — Export-surface lock

- **EX1**: `Object.keys(check-todos).sort()` deepStrictEqual to expected (20-entry list — recount; alphabetical-sort order with UPPER < _ < lower per ASCII).
- **EX2**: `module.exports` block has banner comment `─── module.exports — LOCKED by TRD 06-04`.
- **EX3**: `Object.keys(check-todos).length === 20` (count guard).

### Group CLI2 — Updated CLI flag tests (replaces 06-01 scaffold tests)

- **CLI2-1**: `df-tools check-todos` (default, no flags, against fixture project) → exit 0, stdout starts with `# 📋 DevFlow Standup —`.
- **CLI2-2**: `df-tools check-todos --raw` → exit 0, stdout is valid JSON with 6-key aggregate shape.
- **CLI2-3**: `df-tools check-todos --all` (against fixture with 10+ entries in one lane) → no truncation footer.
- **CLI2-4**: `df-tools check-todos --lane now` → only `## ⚡ Now` section in output.
- **CLI2-5**: `df-tools check-todos --lane invalid` → exit 1, error mentions valid lanes.
- **CLI2-6**: `df-tools check-todos --refresh` → cache file rewritten (timestamp updated).
- **CLI2-7**: `df-tools check-todos --raw --lane blocked` → JSON `result.blocked` populated; markdown NOT emitted (--raw wins).
- **CLI2-8**: Flag parser: `_parseFlags(['--all', '--refresh', '--lane', 'now', '--raw'])` → `{ all: true, refresh: true, lane: 'now', raw: true }`.

### Group E2E — Self-test + GH_INTEGRATION round-trip

- **E2E1**: SELF-TEST — `df-tools check-todos --raw` against `process.cwd()` (this repo) → exit 0 (or 1 with valid JSON in stdout), JSON has 6-key shape, total entries+warnings > 0. Tolerates gh auth failure. (SC-10)
- **E2E2**: GH_INTEGRATION — `df-tools check-todos --raw --refresh` (gated on env) → JSON has gh entries OR gh_auth_failure warning, `cached: false`. (SC-9)
- **E2E3**: Skill exists check — `plugins/devflow/skills/check-todos/SKILL.md` exists with `name: check-todos` frontmatter + `df-tools check-todos` invocation in body.

Total: ~14 new tests (3 EX + 8 CLI2 + 3 E2E). The 06-01 CLI tests CLI1-CLI4 are REPLACED (not added) — net delta ~10 new test files.

<tasks>

<task type="auto">
  <name>Task 1: Standard — full CLI flag wiring + skill REWRITE (single feat: commit)</name>
  <files>
    plugins/devflow/devflow/bin/lib/check-todos-cli.cjs
    plugins/devflow/devflow/bin/lib/check-todos-cli.test.cjs
    plugins/devflow/skills/check-todos/SKILL.md
  </files>
  <action>
Standard task per TDD playbook directives: CLI + skill = single feat commit. Three concrete edits:

**Step 1: Replace `lib/check-todos-cli.cjs::cmdCheckTodosRoute` with full flag handling** per the embedded skeleton:

- Keep `_parseFlags` unchanged from TRD 06-01 (already handles all flags).
- Replace the body of `cmdCheckTodosRoute` to branch on `isRaw` (raw OR --raw flag), call `aggregate`, then either emit JSON (raw path) or render via `formatCheckTodosMarkdown` (markdown path).
- Validate `--lane` value against `ct.LANE_NAMES`; error out on unknown.

**Step 2: Update CLI tests in `lib/check-todos-cli.test.cjs`** — REPLACE CLI1-CLI4 from TRD 06-01 with CLI2-1 through CLI2-8 per the test list. Mirror obj 3 TRD 03-02 deviation pattern (CLI5 was rewritten when stub became real).

- Keep CLI4 (`_parseFlags` unit test from 06-01) renamed to CLI2-8 — it still applies.
- Other tests change shape: 06-01 asserted raw-JSON-only; 06-04 asserts Markdown by default + JSON via --raw.

**Step 3: REWRITE `plugins/devflow/skills/check-todos/SKILL.md`** per the embedded skeleton:

- Use the Write tool (overwriting the existing file).
- Frontmatter: `name: check-todos`, `description: |` block, `argument-hint`, `allowed-tools: [Bash, Read]`.
- Body: `<objective>` + `<execution_context>` + `<process>` + `<context>` per skeleton.
- The body explicitly notes: "The legacy local-only browser is preserved as `df-tools list-todos`."

# CRITICAL: TRD 06-04 REWRITES the skill — it's an overwrite, not a modification. Capture the previous content's filepath/git-blame in SUMMARY for audit.
# CRITICAL: SKILL.md frontmatter MUST include `name: check-todos`, `description: |`, `argument-hint`, `allowed-tools` per existing skill conventions. Validation: `head -10 plugins/devflow/skills/check-todos/SKILL.md` should show frontmatter.
# GOTCHA: When CLI tests use `execSync(... , { cwd: tmpProjectRoot })`, the tmp project must have a `.planning/PROJECT.md` (with `github_repo` frontmatter) for `_detectCurrentRepo` to succeed. `buildCheckTodosFixtures` already writes a minimal PROJECT.md per TRD 06-01 — verify the fixture is wired.
# PATTERN: See obj 5 TRD 05-04 SUMMARY for skill thin-orchestrator pattern + obj 9 TRD 09-03 for sync-roadmap CLI/skill structure.

Commit: `feat(06-04): wire full check-todos CLI flags + rewrite skill from local-only to unified standup`.
  </action>
  <verify>
1. `npm test` — CLI2 group GREEN (8 new/updated tests). 06-01 CLI tests CLI1-CLI4 are replaced — net change is +6 tests in this file (CLI2-1 through CLI2-8 minus the 4 retired CLI1-CLI4, but CLI4 → CLI2-8 is rename).
2. `node plugins/devflow/devflow/bin/df-tools.cjs check-todos` (run from repo root) succeeds and prints Markdown starting with `# 📋 DevFlow Standup —`.
3. `node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw` prints valid JSON with 6-key shape.
4. `head -10 plugins/devflow/skills/check-todos/SKILL.md` shows YAML frontmatter with `name: check-todos`.
5. `grep "df-tools check-todos" plugins/devflow/skills/check-todos/SKILL.md` matches.
  </verify>
  <done>
CLI flag handling replaces 06-01 stubs; tests CLI2-1 through CLI2-8 GREEN; SKILL.md REWRITTEN. Single commit `feat(06-04): wire full check-todos CLI flags + rewrite skill from local-only to unified standup`. Manual smoke test of `df-tools check-todos` against repo root prints expected Markdown.
  </done>
  <recovery>
If CLI subprocess tests are flaky due to working directory mismatch, set `cwd: tmpProjectRoot` explicitly. Verify the fixture's PROJECT.md exists.

If skill MIRROR doesn't pick up the new SKILL.md (because session-start hook didn't run during test), manually run `node plugins/devflow/hooks/sync-runtime.js` to trigger the mirror. Document in SUMMARY.

If `_isRaw` resolution is ambiguous (df-tools.cjs main() strips `--raw` but the local parser also handles it), prefer the main() flag — `output(..., raw, ...)` already receives the canonical raw boolean from main(). The local --raw parsing is defensive only.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: TDD RED — export-lock + integration test list (test: commit)</name>
  <files>plugins/devflow/devflow/bin/lib/check-todos.test.cjs</files>
  <action>
RED phase: append the EX/E2E groups per the test list. EX2 (banner-present) is the true RED gate; EX1 may already pass if 06-01/02/03 left exactly the 20-entry surface.

**Step 1: Append `## Test list — TRD 06-04` block to top-of-file comments** describing Groups EX/E2E.

**Step 2: Add Group EX tests (EX1, EX2, EX3)** per the embedded patterns:

- EX1: build the expected list per the locked surface in CONTEXT.md (recounted to 20 entries — confirm with mechanical recount). `deepStrictEqual` against `Object.keys(check-todos).sort()`.
- EX2: read source file via `fs.readFileSync(require.resolve('./check-todos.cjs'))`, regex-match the banner.
- EX3: `Object.keys(check-todos).length === 20`.

**Step 3: Add Group E2E tests (E2E1, E2E2, E2E3)** per embedded patterns:

- E2E1: subprocess `execSync('node df-tools.cjs check-todos --raw', { cwd: process.cwd() })`. Tolerates non-zero exit (gh auth missing). Asserts 6-key shape + total entries+warnings > 0.
- E2E2: gated on `process.env.GH_INTEGRATION`. Subprocess with `--raw --refresh`. Asserts `cached: false`; tolerates gh-auth-failure warning OR gh entries.
- E2E3: file existence + content check on `plugins/devflow/skills/check-todos/SKILL.md`.

# CRITICAL: At RED time, EX2 (banner) is the gate — it WILL FAIL until Task 3 adds the banner. EX1 may pass already (depending on what 06-01/02/03 ended with). E2E1 may pass already if the CLI works post-Task-1; E2E2 skips cleanly without env. E2E3 may pass after Task 1 lands the SKILL.md REWRITE.
# GOTCHA: For EX1, the expected list must be in PROPER alphabetical sort order matching `Object.keys().sort()` JS behavior. Test your expected list manually before committing — `console.log(['_a', 'A', 'a'].sort())` yields `[ 'A', '_a', 'a' ]` (UPPERCASE < _ < lowercase). The constants are SCREAMING_SNAKE_CASE and come first; lowercase functions come last; underscore-prefixed (private but exported) come in the middle.

Commit: `test(06-04): add export-lock + e2e integration tests for check-todos`.
  </action>
  <verify>
1. `npm test 2>&1 | grep -cE "fail|FAIL"` — at least 1 failure from EX2 (banner missing). Other failures depend on whether Task 1 is committed.
2. `grep "Test list — TRD 06-04" plugins/devflow/devflow/bin/lib/check-todos.test.cjs` — comment block present.
  </verify>
  <done>
~6 new tests added; at minimum EX2 FAILING as expected. Single `test:` commit.
  </done>
  <recovery>
If EX1 fails because the expected list doesn't match Object.keys().sort(), recount the implementation's actual exports + update expected. The implementation defines the surface; the test asserts it. (If the implementation's surface seems wrong — e.g., missing a fetcher — that's a 06-01/02/03 implementation bug; debug there, not in EX1.)

If E2E1 fails on first run because the CLI errors out completely (not just gh auth), run `df-tools check-todos --raw` manually from repo root and read stderr. Possible causes: missing initiatives home dir (returns empty silently — should NOT error), missing dup-detect log (returns [] silently — should NOT error), aggregate caught an unhandled exception (debug + fix in `aggregate`).
  </recovery>
</task>

<task type="auto">
  <name>Task 3: GREEN — lock module.exports + verify all green (feat: commit)</name>
  <files>plugins/devflow/devflow/bin/lib/check-todos.cjs</files>
  <action>
Final GREEN pass. Two concrete edits:

**Step 1: Lock module.exports with banner** per the embedded skeleton:

- Replace the partial `module.exports = {...}` block (which TRD 06-01/02/03 each extended) with the FINAL locked surface.
- Add the banner comment block immediately above:
  ```
  // ─── module.exports — LOCKED by TRD 06-04 (20-entry surface; SC-8) ──────────
  //
  // This block is the AUTHORITATIVE export surface for lib/check-todos.cjs.
  // Asserted by EX1 test: Object.keys(module.exports).sort() deepStrictEqual.
  // DO NOT add or remove entries without updating the EX1 test + 06-CONTEXT.md §"Module surface".
  ```

- The list of 20 entries is in the embedded skeleton.

**Step 2: Run full test suite**:

```bash
npm test 2>&1 | tail -10
```

Expected: ALL tests GREEN, including EX1, EX2, EX3, E2E1, E2E2 (skipped without env), E2E3.

**Step 3: Manual smoke tests** (capture for SUMMARY):

```bash
# Default render
node plugins/devflow/devflow/bin/df-tools.cjs check-todos | head -20

# Raw JSON
node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw | head -50

# Single-lane filter
node plugins/devflow/devflow/bin/df-tools.cjs check-todos --lane now

# Refresh
node plugins/devflow/devflow/bin/df-tools.cjs check-todos --refresh --raw | jq .cached  # → false
node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw | jq .cached            # → true (if within TTL)
```

# CRITICAL: After Task 3, ALL ~14 new TRD 06-04 tests must be GREEN. Total objective 6 test count = 06-01 (~57) + 06-02 (~24) + 06-03 (~28) + 06-04 (~14) = ~123 new tests across the objective.
# GOTCHA: If EX1 fails because Object.keys order doesn't match, the test uses `.sort()` so order shouldn't matter — both expected and actual are sorted. Common cause: typo in expected list OR mismatched count (added/removed an export without updating the test).
# GOTCHA: If E2E1 fails AT GREEN TIME (after Task 1 + Task 2), there's a real CLI regression. Bisect: which subprocess call returns non-JSON output? Run `node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw 2>&1` directly + read.

Commit: `feat(06-04): lock check-todos export surface and finalize integration`.
  </action>
  <verify>
1. `npm test` — ALL tests GREEN, including EX1, EX2, EX3, E2E1, E2E3. (E2E2 skips without env; verify it runs+passes when GH_INTEGRATION=1.)
2. `grep "LOCKED by TRD 06-04" plugins/devflow/devflow/bin/lib/check-todos.cjs` matches the banner comment.
3. `node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw | jq -r 'keys | sort | join(",")'` returns `blocked,cached,ideas,now,soon,warnings` (the 6-key shape).
4. Total test count for obj 6 = ~123 new (cumulative across 06-01/02/03/04).
  </verify>
  <done>
Banner comment present, `module.exports` locked at 20 entries, EX1+EX2+EX3 GREEN, E2E1+E2E3 GREEN, E2E2 ready (skips without env, passes with). Final commit `feat(06-04): lock check-todos export surface and finalize integration`. Manual smoke tests captured in SUMMARY.
  </done>
  <recovery>
If E2E1 fails AT GREEN TIME with valid 6-key JSON but `total === 0` (zero entries + zero warnings), this repo's actual planning state has nothing to surface. Highly unlikely (obj 4/5 populated this repo with dup-detect log + initiatives), but if it happens: investigate which source returned empty + why. Possibly `loadInitiatives` returns [] because `~/.claude/devflow/initiatives/` doesn't exist on this machine (initiatives home is global, not per-repo).

If EX2 (banner) test passes but EX1 (export-lock) still fails after the lock block, there's likely a stale alternate `module.exports` line elsewhere in the file. Search: `grep -n "module.exports" plugins/devflow/devflow/bin/lib/check-todos.cjs` should return ONE line.

If GH_INTEGRATION=1 still fails E2E2 even with valid auth, debug by running the CLI directly with the env: `GH_INTEGRATION=1 node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw --refresh`. Possible: rate limit, or scopes mismatch.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `lib/check-todos-cli.cjs::cmdCheckTodosRoute` has full flag handling: `--all`, `--refresh`, `--lane`, `--raw`. Default emits Markdown via `formatCheckTodosMarkdown`.
2. `plugins/devflow/skills/check-todos/SKILL.md` REWRITTEN — frontmatter `name: check-todos`, body invokes `df-tools check-todos $ARGUMENTS`. Legacy local-only behavior preserved as `df-tools list-todos`.
3. `lib/check-todos.cjs` `module.exports` block has banner comment `LOCKED by TRD 06-04 (20-entry surface; SC-8)`.
4. EX1 (export-lock 20 entries) + EX2 (banner-present) + EX3 (count check) GREEN.
5. E2E1 (self-test against this repo) GREEN — 6-key shape + total entries+warnings > 0.
6. E2E2 (GH_INTEGRATION round-trip) ready — skips cleanly without env; passes with.
7. E2E3 (skill exists) GREEN — file present with correct frontmatter.
8. Total new commits this TRD: 3 (`feat:` for CLI/skill + `test:` for RED + `feat:` for GREEN).
9. Total new tests this TRD: ~14. Total objective 6 tests cumulative: ~123 new.
10. No regression in baseline (1097+ tests still pass plus 06-01/02/03 additions).
</verification>

<success_criteria>
- [ ] SC-6 satisfied: `df-tools check-todos [--all] [--refresh] [--lane <name>] [--raw]` works as documented.
- [ ] SC-7 satisfied: `/devflow:check-todos` skill REWRITTEN to invoke the unified CLI.
- [ ] SC-8 satisfied: `lib/check-todos.cjs` exports stable 20-entry surface; banner comment present; EX1 deepStrictEqual GREEN.
- [ ] SC-9 satisfied: GH_INTEGRATION=1 round-trip test (E2E2) is correctly env-gated and passes when env set.
- [ ] SC-10 satisfied: E2E1 self-test against this repo passes — valid JSON shape + ≥1 entry/warning surfaced.
- [ ] All tests GREEN; no regression in the 1097+ baseline + 06-01/02/03 additions.
- [ ] Test list at top of test file enumerates all groups (A/F/L/P/I/D/AS + C/I/AC + FF/FE/FT + EX/CLI2/E2E).
- [ ] Manual smoke: `df-tools check-todos` prints expected Markdown; `--raw` prints expected JSON; `--lane <name>` filters; `--refresh` toggles `cached`.
</success_criteria>

<output>
After completion, create `.planning/objectives/06-unified-check-todos/06-04-cli-skill-and-integration-SUMMARY.md` and `.planning/objectives/06-unified-check-todos/06-VERIFICATION.md`. Record:

**SUMMARY:**
- Test count delta (start of obj 6 → end of obj 6).
- All commits in this TRD with hashes.
- Any deviations from locked design (especially: surface count recount 19 → 20, skill-rewrite previous-content reference, GH_INTEGRATION env behavior on the dev machine).
- Manual smoke-test results: `df-tools check-todos` (default Markdown), `--raw`, `--lane now`, `--refresh` followed by no-flag (cached=true) — capture each.

**VERIFICATION:**
- Per-SC checklist (SC-1 through SC-10) with the test/commit/file evidence for each.
- E2E1 self-test result against this repo: total entries + warnings count.
- E2E2 GH_INTEGRATION result: skipped vs ran (and pass/fail if ran).
- Skill mirror status: pending session restart vs already mirrored.
- Module surface count (locked at 20).
</output>

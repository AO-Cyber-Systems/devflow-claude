---
objective: 02-cross-repo-awareness-layer
trd: 02-02
title: Peer scanner — git-branch walker + scanPeer + _setRunGit injection
type: tdd
confidence: high
wave: 3
depends_on: [02-01, 02-04]
files_modified:
  - plugins/devflow/devflow/bin/lib/awareness.cjs
  - plugins/devflow/devflow/bin/lib/awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
autonomous: true
requirements: [SC-1, SC-2]
verification_commands:
  - "npm test -- --grep awareness"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/awareness.cjs\"); if(typeof a.scanPeer!==\"function\") throw new Error(\"scanPeer not exported\"); if(typeof a._setRunGit!==\"function\") throw new Error(\"_setRunGit not exported\"); if(typeof a._resetGitMock!==\"function\") throw new Error(\"_resetGitMock not exported\"); console.log(\"OK\");'"
  - "git log --oneline feature/v1.1-obj-2-heartbeat -- plugins/devflow/devflow/bin/lib/awareness.cjs | grep -E '^[a-f0-9]+ test\\(02-02\\)' | head -1"
  - "git log --oneline feature/v1.1-obj-2-heartbeat -- plugins/devflow/devflow/bin/lib/awareness.cjs | grep -E '^[a-f0-9]+ feat\\(02-02\\)' | head -1"

must_haves:
  truths:
    - "scanPeer({ cwd, no_fetch, branch_patterns, peer_stale_days }) returns { branches, fetched_at, warnings, current_branch }"
    - "scanPeer runs `git fetch --all --prune` by default; skips when no_fetch=true"
    - "scanPeer iterates `git for-each-ref refs/remotes/origin/*` to enumerate remote branches"
    - "Each branch entry contains: { branch, objective, trd, github_issue, last_commit: { sha, timestamp, subject }, developer }"
    - "Branches without `.planning/STATE.md` are SILENTLY skipped (no warning per SC-2)"
    - "Branches with malformed STATE.md log a warning AND continue (per SC-2)"
    - "Branches > peer_stale_days (default 30) since last commit are filtered out"
    - "Branches main / master / HEAD are filtered out unconditionally"
    - "Branch-pattern filter applies (default: feature/*, df/*, fix/*, proposal/*); pattern globs match against branch name"
    - "_setRunGit(fn) injects mock; _resetGitMock() restores production runGit; mirrors lib/gh.cjs::_setRunGh pattern exactly"
    - "All git invocations go through _runGit (production) or the injected mock; no direct spawnSync calls in scanPeer"
    - "scanPeer is FAULT-TOLERANT — when git fetch fails, returns degraded result with warning + still scans local refs"
    - "developer field comes from `git config user.name` for the LOCAL repo (not from the branch's STATE.md)"
    - "Test list documented in TRD body BEFORE test code written (TDD Playbook habit 2)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      provides: "scanPeer + _setRunGit + _resetGitMock + _runGit. Module.exports extended to include these three."
      exports: ["scanPeer", "_setRunGit", "_resetGitMock", "parseStateMd", "aggregateOrgByProductQuarter", "DEFAULT_TTL_MINUTES", "DEFAULT_STALE_DAYS", "DEFAULT_BRANCH_PATTERNS", "AWARENESS_CACHE_REL", "readCache", "writeCache", "isStale"]
    - path: "plugins/devflow/devflow/bin/lib/awareness.test.cjs"
      provides: "Test groups added: scanPeer happy paths, fault tolerance, stale filtering, pattern filtering, _setRunGit injection mechanics."
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      provides: "Extended: buildMockRunGit factory (mirror buildMockRunGh from gh-fixtures); buildGitForEachRefOutput, buildGitLogOutput canned-response helpers."
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      to: "parseStateMd (same module, TRD 02-01)"
      via: "internal call from scanPeer"
      pattern: "parseStateMd\\("
    - from: "plugins/devflow/devflow/bin/lib/awareness.test.cjs"
      to: "buildMockRunGit (awareness-fixtures.cjs)"
      via: "require + _setRunGit injection"
      pattern: "_setRunGit\\(buildMockRunGit"
---

<objective>
Implement the peer scanner: walks `origin/*` refs, extracts each branch's `.planning/STATE.md` via `git show`, parses with TRD 02-01's `parseStateMd`, returns structured per-branch state. This is the git-as-storage half of the awareness layer.

Purpose: Locked decision #1 — git is the storage for peer awareness. No new shared store. The scanner is pure read-side aggregation: `git fetch` + `git for-each-ref` + `git show` + parseStateMd. Mirrors obj 1's `_setRunGh` pattern with `_setRunGit` so unit tests run with mocks (no live git invocations in default test suite).

Output: `scanPeer(opts)` function exported from `lib/awareness.cjs`, fully tested with fixtures + the `_setRunGit` injection hook ready for downstream consumers (TRD 02-05's CLI surface, TRD 02-06's lifecycle hook, TRD 02-07's integration test).
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── awareness.cjs                          ← MODIFY  (add scanPeer + _setRunGit; extend module.exports)
├── awareness.test.cjs                     ← MODIFY  (add Group S tests)
└── __fixtures__/
    └── awareness-fixtures.cjs             ← MODIFY  (add buildMockRunGit + canned response helpers)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**`_setRunGh` pattern from `lib/gh.cjs`** (the model to mirror):

```js
function runGh(args, opts = {}) {
  const r = spawnSync('gh', args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    ...opts,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

// Test injection hook — production code always calls _runGh; tests inject a mock.
let _runGh = runGh;
function _setRunGh(fn) { _runGh = (fn != null) ? fn : runGh; }
```

Pattern locked across this codebase: production functions (`runGh`/`runGit`) use spawnSync; module-level `_runGh`/`_runGit` is a mutable reference; `_setRunGh`/`_setRunGit` swaps the reference; pass `null` to restore default.

**`buildMockRunGh` from `gh-fixtures.cjs`**:

```js
function buildMockRunGh(responses = new Map()) {
  let callCount = 0;
  const calls = [];
  function mockRunGh(args, opts) {
    callCount++;
    const key = args.join(' ');
    calls.push({ args, opts, key });
    if (responses.has(key)) return responses.get(key);
    // Prefix match...
    return { ok: false, status: 1, stdout: '', stderr: `[mock] no match for: ${key}` };
  }
  mockRunGh.callCount = () => callCount;
  mockRunGh.calls = () => [...calls];
  return mockRunGh;
}
```

**Real `git for-each-ref` output format** (what scanPeer parses):

```
refs/remotes/origin/feature/v1.1
refs/remotes/origin/feature/v1.1-obj-2-heartbeat
refs/remotes/origin/main
refs/remotes/origin/HEAD
```

Run with `git for-each-ref refs/remotes/origin/* --format='%(refname:short)'` to get short form: `origin/feature/v1.1`. Strip `origin/` prefix. Filter out `HEAD`, `main`, `master`.

**Real `git log -1` format**:

```
git log -1 --format='%H%x00%cI%x00%s' origin/feature/v1.1
abc123def...^@2026-05-04T08:31:00-07:00^@feat: implement scanner
```

`%H` = full SHA; `%cI` = committer ISO timestamp; `%s` = subject. NUL-separated for safe parsing.

**Real `git show <branch>:<path>` format** — outputs file content directly to stdout, exits 128 if file doesn't exist on that branch.

</codebase_examples>

<anti_patterns>

- **Do NOT call spawnSync directly in scanPeer.** Always go through `_runGit`. This is the test-injection seam.
- **Do NOT throw on git failures.** scanPeer returns a degraded result with `warnings: [...]`. Locked behavior per SC-2.
- **Do NOT log warnings for missing STATE.md.** Per SC-2, branches without STATE.md are SILENTLY skipped — no warning. Only MALFORMED STATE.md gets a warning.
- **Do NOT shell out to `git fetch` if `no_fetch: true` was passed.** Honor offline mode.
- **Do NOT trust git output verbatim.** Branches like `origin/foo bar` (with spaces) shouldn't crash the scanner. Use NUL-separated formats (`-z` or `%x00`) where possible.
- **Do NOT special-case branch patterns beyond glob matching.** `feature/*` matches anything starting with `feature/`. `df/*` matches anything starting with `df/`. Keep it simple — minimatch-style glob is sufficient (or hand-rolled prefix match for our 4 default patterns).

</anti_patterns>

<error_recovery>

- If `git fetch --all --prune` fails (network down, auth needed, bad remote), capture stderr in `warnings` and continue with whatever local refs exist.
- If `git for-each-ref` returns an empty list (no remote branches), return `{ branches: [], fetched_at, warnings: [], current_branch }` without warnings.
- If `git show <branch>:.planning/STATE.md` exits non-zero (file not on branch), treat as "no STATE.md" → silent skip.
- If `parseStateMd(content)` returns null on a non-empty file → warning: "malformed STATE.md on branch <name>".
- If `git config user.name` fails (no git user), `developer` field is null on every branch entry.
- Per project memory `feedback_executor_smaller_commits`: keep RED commit and GREEN commit as 2 separate atomic commits.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/02-cross-repo-awareness-layer/02-CONTEXT.md
@.planning/objectives/02-cross-repo-awareness-layer/02-RESEARCH.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
</context>

<research_context>

From `.planning/research/cross-session-coordination.md` §"Active-session heartbeat":

> Switching branches mid-session updates the heartbeat — no special handling needed; `git branch --show-current` at heartbeat time is the source of truth.

In v1.1's read-side simplification, the heartbeat record is a synthesized view. `scanPeer` builds it by:
1. Enumerating `origin/*` refs (already-pushed branches)
2. For each branch, `git show <branch>:.planning/STATE.md` to read the file at THAT branch's tip
3. parseStateMd → structured fields (objective, trd, github_issue)
4. `git log -1 --format='%H%x00%cI%x00%s' <branch>` to get last_commit metadata
5. `git config user.name` for the local developer name (caller of scanPeer)

The original heartbeat schema fields and where they come from now:

| Original field | scanPeer source |
|---|---|
| `session_id` | NOT applicable in read-side model — branches don't have session IDs |
| `developer` | `git config user.name` (local repo, not branch-specific) |
| `project` | (caller-supplied — derive from cwd's package.json or PROJECT.md if needed) |
| `worktree_path` | `process.cwd()` |
| `branch` | branch ref short name (e.g., `feature/v1.1`) |
| `github_issue` | parseStateMd result.github_issue |
| `objective` | parseStateMd result.objective |
| `job` (now `trd`) | parseStateMd result.trd |
| `started_at` | NOT applicable — no daemon |
| `last_heartbeat` (now `last_commit.timestamp`) | `git log -1` committer ISO |
| `state` | NOT applicable — no daemon, only "active" inferred from recency |
| `blocked_on_user` | EXPLICITLY OUT OF SCOPE per locked decision #8 (obj 7 territory) |

The accepted limitation per locked decision #9: stale = invisible. Default `peer_stale_days = 30`.

</research_context>

<gotchas>

- **`git for-each-ref refs/remotes/origin/*` returns ALL remote branches including `HEAD`** which points to the default branch. Filter out `origin/HEAD` explicitly.
- **`git show <branch>:.planning/STATE.md`** uses `<rev>:<path>` syntax — NOT `<rev>:./path`. The path must NOT have a leading `./`.
- **Branch names with slashes** (`feature/v1.1-obj-2-heartbeat`) are normal — handle them. The full ref is `refs/remotes/origin/feature/v1.1-obj-2-heartbeat`; short form via `%(refname:short)` is `origin/feature/v1.1-obj-2-heartbeat`. Strip `origin/` to get `feature/v1.1-obj-2-heartbeat`.
- **`git fetch --all --prune` can be slow** (10-30s on a big monorepo, 1-3s for devflow-claude). Cache layer (TRD 02-04) gates whether scanPeer runs at all; if cache is fresh, scanner is bypassed entirely.
- **Glob matching**: a simple prefix match works for the default 4 patterns (`feature/*`, `df/*`, `fix/*`, `proposal/*`). For `*` to be a real glob, use a tiny helper. Keep it minimal — don't pull in minimatch.
- **Stale filtering by commit timestamp**: parse the ISO timestamp from `git log -1 --format=%cI`. Compare to `Date.now() - peer_stale_days * 86400000`. Skip branches with `last_commit.timestamp < threshold`.
- **Per project memory `feedback_planner_proto_conflict`**: this TRD touches `lib/awareness.cjs` which is also touched by 02-04 (Wave 2, before this TRD's Wave 3). Wave sequencing prevents merge conflicts. Don't break TRD 02-04's cache region — append below it.

</gotchas>

## Test list

Per TDD Playbook habit 2. All cases enumerated BEFORE test code:

**Group S — scanPeer happy paths (all use buildMockRunGit; no live git):**
1. S1: 1 branch with valid STATE.md → returns 1 entry with all fields populated
2. S2: 3 branches each with valid STATE.md → 3 entries; current_branch field set
3. S3: branch with `.planning/STATE.md` containing only `**Objective in flight:**` → entry has objective set, trd null
4. S4: developer field populated from `git config user.name` mock
5. S5: last_commit.sha + timestamp + subject populated from `git log` mock per branch
6. S6: returns `fetched_at` ISO timestamp on the result (not per-branch)

**Group SF — scanPeer fault tolerance (per SC-2):**
7. SF1: branch without `.planning/STATE.md` (git show exit 128) → entry SILENTLY skipped, NO warning
8. SF2: branch WITH `.planning/STATE.md` but content is malformed (parseStateMd returns null) → entry skipped + warning logged
9. SF3: `git fetch --all --prune` returns ok:false → result.warnings includes the stderr; scan continues with local refs
10. SF4: `no_fetch: true` → `git fetch` is NEVER called (mock asserts callCount for fetch === 0); scan still proceeds
11. SF5: `git for-each-ref` returns empty stdout → result.branches === []; no warnings
12. SF6: malformed `git log` output (no NULs, just garbage) → branch skipped + warning

**Group SS — scanPeer stale filtering:**
13. SS1: branch with last_commit timestamp 31 days ago + default peer_stale_days=30 → branch filtered out
14. SS2: branch with last_commit timestamp 29 days ago + default peer_stale_days=30 → branch INCLUDED
15. SS3: peer_stale_days=0 + branch from 1 hour ago → still included (zero means "no stale filter" — locked: 0 means disable, NOT same-day)
16. SS4: peer_stale_days=7 + branch from 8 days ago → filtered out

**Group SP — scanPeer pattern filtering:**
17. SP1: branch_patterns default ['feature/*', 'df/*', 'fix/*', 'proposal/*']; branch `feature/v1.1` → included
18. SP2: branch `main` → filtered out (special-case main/master/HEAD)
19. SP3: branch `random-branch` (no pattern match) → filtered out
20. SP4: custom branch_patterns=['*'] → all branches except main/master/HEAD included
21. SP5: branch `HEAD` → filtered out

**Group SI — _setRunGit injection mechanics:**
22. SI1: scanPeer with default _runGit + GIT_INTEGRATION unset → test SKIPS (don't call live git in unit suite)
23. SI2: _setRunGit(mockFn) → scanPeer uses mockFn; calls captured via mockFn.calls()
24. SI3: _resetGitMock() → restores default; subsequent calls go to real spawnSync (test asserts internal _runGit reference is back to runGit)
25. SI4: mockFn args spec — verify scanPeer calls `git fetch --all --prune` first when no_fetch is false (mockFn.calls()[0].args === ['fetch', '--all', '--prune'])

**Group SU — buildMockRunGit fixture builder contract:**
26. SU1: `buildMockRunGit(new Map([['for-each-ref refs/remotes/origin/*', { ok: true, stdout: 'origin/feature/v1.1\n', stderr: '' }]]))` returns a function
27. SU2: that function called with args `['for-each-ref', 'refs/remotes/origin/*']` returns the canned response

**Group SR — Live-git smoke (gated on GIT_INTEGRATION=1):**
28. SR1 (skipped without env): scanPeer against `buildGitFixtureRepo` with 2 branches → 2 entries; cleanup removes tmp dir
29. SR2 (skipped without env): scanPeer with no_fetch=true on the same fixture → still scans (but fetch wasn't invoked)

Total: 29 test cases. Iterate RED → GREEN one at a time per TDD Playbook habit 3.

<tasks>

<task type="auto">
  <name>Task 1: Extend awareness-fixtures.cjs — buildMockRunGit + canned response helpers</name>
  <files>
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  </files>
  <action>
Add these factories below the existing TRD 02-01 factories (don't move or rewrite existing ones):

```js
// ─── TRD 02-02: peer scanner mocks ──────────────────────────────────────────

/**
 * Mirror of buildMockRunGh from gh-fixtures.cjs — for git invocations.
 * `responses` is a Map<string, { ok, stdout, stderr }> keyed by joined args.
 * Exact match first, then prefix match (longest prefix wins).
 */
function buildMockRunGit(responses = new Map()) {
  let callCount = 0;
  const calls = [];

  function mockRunGit(args, opts) {
    callCount++;
    const key = args.join(' ');
    calls.push({ args, opts, key });
    if (responses.has(key)) return responses.get(key);
    let bestKey = null, bestLen = -1;
    for (const [k] of responses.entries()) {
      if (key.startsWith(k) && k.length > bestLen) { bestKey = k; bestLen = k.length; }
    }
    if (bestKey !== null) return responses.get(bestKey);
    return { ok: false, status: 1, stdout: '', stderr: `[mock] no match for: ${key}` };
  }

  mockRunGit.callCount = () => callCount;
  mockRunGit.calls = () => [...calls];
  return mockRunGit;
}

/**
 * Canned response for `git for-each-ref refs/remotes/origin/* --format='%(refname:short)'`.
 * `branches` is an array of short ref names (e.g., 'origin/feature/v1.1').
 */
function buildGitForEachRefOutput({ branches = [] } = {}) {
  return {
    ok: true, status: 0,
    stdout: branches.map(b => b.startsWith('origin/') ? b : `origin/${b}`).join('\n'),
    stderr: '',
  };
}

/**
 * Canned response for `git log -1 --format='%H%x00%cI%x00%s' <branch>`.
 * Returns NUL-separated SHA, ISO timestamp, subject.
 */
function buildGitLogOutput({ sha = 'abc123def4567890', timestamp = '2026-05-04T08:31:00Z', subject = 'feat: test commit' } = {}) {
  return {
    ok: true, status: 0,
    stdout: `${sha}\x00${timestamp}\x00${subject}`,
    stderr: '',
  };
}

/**
 * Canned response for `git show <branch>:.planning/STATE.md`.
 * Pass either `state_md` (full content) or { objective, trd, ... } and
 * fixture builder calls buildStateMd internally.
 */
function buildGitShowStateMd({ state_md, objective, trd, branch, github_issue, objective_complete } = {}) {
  const content = state_md != null
    ? state_md
    : buildStateMd({ objective, trd, branch, github_issue, objective_complete });
  return { ok: true, status: 0, stdout: content, stderr: '' };
}

/**
 * Canned ENOENT response — STATE.md missing on branch.
 */
function buildGitShowMissingFile() {
  return { ok: false, status: 128, stdout: '', stderr: 'fatal: path does not exist in branch' };
}

/**
 * Canned response for `git fetch --all --prune`.
 */
function buildGitFetchSuccess() {
  return { ok: true, status: 0, stdout: '', stderr: '' };
}

function buildGitFetchFailure({ stderr = 'fatal: unable to access remote' } = {}) {
  return { ok: false, status: 128, stdout: '', stderr };
}

/**
 * Canned response for `git config user.name`.
 */
function buildGitConfigUserName({ name = 'mark' } = {}) {
  return { ok: true, status: 0, stdout: name, stderr: '' };
}
```

Update the module.exports at the bottom of the file:
```js
module.exports = {
  // TRD 02-01:
  buildStateMd, buildOrgItem, buildSubIssue, buildOrgScanResult, buildGitFixtureRepo,
  // TRD 02-02:
  buildMockRunGit,
  buildGitForEachRefOutput,
  buildGitLogOutput,
  buildGitShowStateMd,
  buildGitShowMissingFile,
  buildGitFetchSuccess,
  buildGitFetchFailure,
  buildGitConfigUserName,
};
```

# CRITICAL: Reuse buildStateMd from TRD 02-01 inside buildGitShowStateMd. Do NOT duplicate state-md construction logic.
# GOTCHA: NUL byte (`\x00`) in buildGitLogOutput stdout is intentional — git `%x00` separator. Tests must not strip/normalize.
# PATTERN: All canned responses match the shape `{ ok, status, stdout, stderr }` from spawnSync wrapper return.
  </action>
  <verify>
1. Module loads: `node -e 'require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); console.log("OK")'`
2. All 8 new factories exported: `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); for (const k of ["buildMockRunGit","buildGitForEachRefOutput","buildGitLogOutput","buildGitShowStateMd","buildGitShowMissingFile","buildGitFetchSuccess","buildGitFetchFailure","buildGitConfigUserName"]) if (typeof f[k] !== "function") throw new Error(k); console.log("OK")'`
3. `buildMockRunGit(new Map([["test", {ok:true, stdout:"X"}]]))(["test"]).stdout === "X"`
  </verify>
  <done>
8 new factory functions appended to fixtures module, exported alongside TRD 02-01 factories. No existing factory broken (smoke-test by re-running TRD 02-01 tests).
  </done>
  <recovery>
If reusing `buildStateMd` from inside `buildGitShowStateMd` causes a circular reference, just inline the call (`const content = state_md ?? buildStateMd({...})`). The inner reference is to the SAME module so it's safe — but if there's any subtle issue, accept the duplication and add a TODO to dedupe.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: RED phase — write failing tests for scanPeer + _setRunGit (Group S/SF/SS/SP/SI/SU/SR)</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness.test.cjs
  </files>
  <action>
Append a new section to the test file with section divider:

```js
// ─── TRD 02-02: peer scanner ───────────────────────────────────────────────
const {
  scanPeer, _setRunGit, _resetGitMock,
} = require('./awareness.cjs'); // Will fail at top-level require until Task 3 lands these

const {
  buildMockRunGit, buildGitForEachRefOutput, buildGitLogOutput, buildGitShowStateMd,
  buildGitShowMissingFile, buildGitFetchSuccess, buildGitFetchFailure, buildGitConfigUserName,
} = require('./__fixtures__/awareness-fixtures.cjs');
```

Implement the 29 test cases enumerated in the TRD's `## Test list` section. Use this scaffolding:

```js
function buildScanResponses({
  branches = ['origin/feature/v1.1'],
  state_md_per_branch = { 'feature/v1.1': { objective: '2 — Test', trd: '02-02' } },
  fetch_ok = true,
  user_name = 'mark',
  per_branch_log = {},
} = {}) {
  const responses = new Map();
  responses.set('fetch --all --prune', fetch_ok ? buildGitFetchSuccess() : buildGitFetchFailure());
  responses.set('config user.name', buildGitConfigUserName({ name: user_name }));
  responses.set('for-each-ref refs/remotes/origin/* --format=%(refname:short)',
    buildGitForEachRefOutput({ branches }));
  for (const [branch, fields] of Object.entries(state_md_per_branch)) {
    if (fields === null) {
      responses.set(`show origin/${branch}:.planning/STATE.md`, buildGitShowMissingFile());
    } else if (fields === 'malformed') {
      responses.set(`show origin/${branch}:.planning/STATE.md`,
        { ok: true, status: 0, stdout: 'this is not a state.md', stderr: '' });
    } else {
      responses.set(`show origin/${branch}:.planning/STATE.md`, buildGitShowStateMd(fields));
    }
  }
  for (const [branch, log_opts] of Object.entries(per_branch_log)) {
    responses.set(`log -1 --format=%H%x00%cI%x00%s origin/${branch}`, buildGitLogOutput(log_opts));
  }
  // Default last_commit for any branch not in per_branch_log (recent timestamp)
  for (const branch of branches.map(b => b.replace(/^origin\//, ''))) {
    const key = `log -1 --format=%H%x00%cI%x00%s origin/${branch}`;
    if (!responses.has(key)) responses.set(key, buildGitLogOutput({ timestamp: new Date().toISOString() }));
  }
  return responses;
}
```

Implement Group S (S1-S6), Group SF (SF1-SF6), Group SS (SS1-SS4), Group SP (SP1-SP5), Group SI (SI1-SI4), Group SU (SU1-SU2), Group SR (SR1-SR2).

Test naming: `test('S1: scanPeer with 1 valid branch returns 1 entry', () => {...})`.

For Group SR (live-git smoke): wrap entire body in:
```js
test('SR1: scanPeer against live fixture repo', { skip: process.env.GIT_INTEGRATION !== '1' }, () => {
  const fixture = buildGitFixtureRepo({ branches: [...] });
  try {
    _resetGitMock();
    const result = scanPeer({ cwd: fixture.root, no_fetch: true });
    assert.strictEqual(result.branches.length, 2);
  } finally {
    fixture.cleanup();
  }
});
```

After all tests written, run `npm test`. Expected: 27-29 new failing tests (top-level require fails or scanPeer is undefined).

Commit RED phase:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "test(02-02): add failing tests for scanPeer + _setRunGit injection" \
  --files plugins/devflow/devflow/bin/lib/awareness.test.cjs plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
```

# CRITICAL: Top-level require for scanPeer/_setRunGit/_resetGitMock will fail until Task 3. The whole file errors out at load. To make RED useful per-test, make the top-level destructure tolerant:
#   const aw = require('./awareness.cjs');
#   const scanPeer = aw.scanPeer;  // undefined in RED phase
# Then each test body checks `if (typeof scanPeer !== 'function') return assert.fail("scanPeer not exported")`.
# GOTCHA: SI1 must NEVER call real git — it asserts the SKIP behavior. Use `t.skip()` directly.
# PATTERN: Use `_resetGitMock()` in beforeEach (or at top of each test body) to ensure isolated state.
  </action>
  <verify>
1. `npm test` shows 27-29 NEW failing tests (RED phase)
2. RED commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ test\(02-02\):'`
3. Test groups identifiable: `grep -c "^test(.S[0-9]" plugins/devflow/devflow/bin/lib/awareness.test.cjs` > 5
  </verify>
  <done>
Test file contains all 29 enumerated cases. RED-phase commit landed via df-tools commit. `npm test` failures match expected count.
  </done>
  <recovery>
If RED breaks the WHOLE test runner (top-level require throws), wrap the import in a try/catch + a guard `const scanPeer = aw.scanPeer ?? (() => { throw new Error('not implemented'); });` so individual tests fail (not the whole runner).
  </recovery>
</task>

<task type="auto">
  <name>Task 3: GREEN phase — implement scanPeer + _setRunGit + _runGit + _resetGitMock in awareness.cjs</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness.cjs
  </files>
  <action>
Append (DO NOT replace) below TRD 02-04's cache region (which lands in Wave 2 before this TRD's Wave 3). Section divider:

```js
// ─── TRD 02-02: peer scanner ───────────────────────────────────────────────
```

Implementation:

```js
const { spawnSync } = require('child_process');

function runGit(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    ...opts,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout || '',  // do NOT trim — git show output preserves leading/trailing whitespace
    stderr: (r.stderr || '').trim(),
  };
}

let _runGit = runGit;
function _setRunGit(fn) { _runGit = (fn != null) ? fn : runGit; }
function _resetGitMock() { _runGit = runGit; }

function _matchesPattern(branch, patterns) {
  for (const p of patterns) {
    if (p === '*') return true;
    if (p.endsWith('/*')) {
      const prefix = p.slice(0, -1); // 'feature/*' → 'feature/'
      if (branch.startsWith(prefix)) return true;
    } else if (branch === p) {
      return true;
    }
  }
  return false;
}

function scanPeer({
  cwd = process.cwd(),
  no_fetch = false,
  branch_patterns = DEFAULT_BRANCH_PATTERNS,
  peer_stale_days = DEFAULT_STALE_DAYS,
} = {}) {
  const result = { branches: [], fetched_at: new Date().toISOString(), warnings: [], current_branch: null };

  // 1. Fetch (unless disabled)
  if (!no_fetch) {
    const fetchR = _runGit(['fetch', '--all', '--prune'], { cwd });
    if (!fetchR.ok) {
      result.warnings.push(`git fetch failed: ${fetchR.stderr || 'unknown error'}`);
      // Continue with local refs anyway
    }
  }

  // 2. Current branch (caller-side context)
  const currentR = _runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  if (currentR.ok) result.current_branch = currentR.stdout.trim();

  // 3. Developer name (local)
  const devR = _runGit(['config', 'user.name'], { cwd });
  const developer = devR.ok ? devR.stdout.trim() : null;

  // 4. Enumerate remote branches
  const refsR = _runGit(
    ['for-each-ref', 'refs/remotes/origin/*', '--format=%(refname:short)'],
    { cwd }
  );
  if (!refsR.ok) {
    result.warnings.push(`git for-each-ref failed: ${refsR.stderr || 'unknown error'}`);
    return result;
  }

  const refLines = refsR.stdout.split('\n').map(s => s.trim()).filter(Boolean);
  const staleThreshold = peer_stale_days > 0 ? Date.now() - (peer_stale_days * 86400000) : -Infinity;

  for (const ref of refLines) {
    if (!ref.startsWith('origin/')) continue;
    const branchName = ref.slice('origin/'.length);

    // Filter: main, master, HEAD
    if (['main', 'master', 'HEAD'].includes(branchName)) continue;

    // Filter: pattern match
    if (!_matchesPattern(branchName, branch_patterns)) continue;

    // git show <ref>:.planning/STATE.md
    const showR = _runGit(['show', `${ref}:.planning/STATE.md`], { cwd });
    if (!showR.ok) continue; // SC-2: silently skip branches without STATE.md

    const parsed = parseStateMd(showR.stdout);
    if (parsed === null) {
      result.warnings.push(`Malformed STATE.md on branch ${branchName}`);
      continue;
    }

    // git log -1 for last commit
    const logR = _runGit(['log', '-1', '--format=%H%x00%cI%x00%s', ref], { cwd });
    let last_commit = null;
    if (logR.ok && logR.stdout) {
      const parts = logR.stdout.split('\x00');
      if (parts.length >= 3 && parts[1] && /\d{4}-\d{2}-\d{2}T/.test(parts[1])) {
        last_commit = { sha: parts[0], timestamp: parts[1], subject: parts[2].replace(/\n.*$/s, '') };
      } else {
        result.warnings.push(`Malformed git log output for ${branchName}`);
        continue;
      }
    } else {
      continue; // can't get last commit — skip
    }

    // Stale filter
    if (peer_stale_days > 0) {
      const ts = Date.parse(last_commit.timestamp);
      if (Number.isFinite(ts) && ts < staleThreshold) continue;
    }

    result.branches.push({
      branch: branchName,
      objective: parsed.objective,
      trd: parsed.trd,
      github_issue: parsed.github_issue,
      last_commit,
      developer,
    });
  }

  return result;
}
```

Update `module.exports` block (preserve existing entries; add new ones):

```js
module.exports = {
  parseStateMd,
  aggregateOrgByProductQuarter,
  // TRD 02-04 cache layer:
  readCache, writeCache, isStale,
  // TRD 02-02 peer scanner:
  scanPeer, _setRunGit, _resetGitMock,
  // Constants:
  DEFAULT_TTL_MINUTES, DEFAULT_STALE_DAYS, DEFAULT_BRANCH_PATTERNS, AWARENESS_CACHE_REL,
};
```

Run `npm test`. All 27-29 Task-2 tests must pass. Iterate on regex/parser logic if any test fails. Common iteration points:
- SF6 (malformed git log): NUL-split + check parts.length AND timestamp shape
- SS3 (peer_stale_days=0): treat 0 as "disabled" (use `-Infinity` threshold) — locked behavior
- SP4 (custom patterns ['*']): `_matchesPattern` returns true for `*`

Commit GREEN:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "feat(02-02): implement scanPeer with _setRunGit injection" \
  --files plugins/devflow/devflow/bin/lib/awareness.cjs
```

# CRITICAL: Do NOT replace TRD 02-04's cache region (already in awareness.cjs by Wave 2). Append below it. The module.exports block is the only line where you ADD entries — preserve everything from prior waves.
# GOTCHA: `git show` stdout is NOT trimmed (preserves leading whitespace which can matter for STATE.md). Other git commands ARE trimmed via runGit's stderr trim. Test: `runGit` trims stderr but NOT stdout — locked.
# PATTERN: Match obj 1's _setRunGh exactly: `let _runGit = runGit; function _setRunGit(fn) { _runGit = (fn != null) ? fn : runGit; }`.
  </action>
  <verify>
1. `npm test` passes ALL Task-2 tests (27-29 new green checks)
2. No existing tests broken (TRD 02-01 tests still pass, TRD 02-04 cache tests still pass)
3. GREEN commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ feat\(02-02\):'`
4. Module surface verified: `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/awareness.cjs"); for (const k of ["scanPeer","_setRunGit","_resetGitMock","parseStateMd","readCache","writeCache","isStale"]) if (typeof a[k] !== "function") throw new Error(k); console.log("OK")'`
  </verify>
  <done>
scanPeer implemented and all enumerated test cases pass. Module surface includes new exports without breaking TRD 02-01 / TRD 02-04 entries. GREEN commit landed via df-tools commit.
  </done>
  <recovery>
If a test refuses to pass after 3 iterations, capture the failing input/output pair, double-check the test list interpretation, and if the test IS correct, implement the simpler split-based parsing (don't add regex complexity). For SR1/SR2 (live git fixture tests), if they fail with `GIT_INTEGRATION=1`, run `npm test` once with `GIT_INTEGRATION=1` to see the actual failure and iterate.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After all tasks ship:

1. `lib/awareness.cjs` exports: parseStateMd, aggregateOrgByProductQuarter, readCache, writeCache, isStale, scanPeer, _setRunGit, _resetGitMock + 4 constants
2. `lib/awareness.test.cjs` includes 27-29 new tests (Group S/SF/SS/SP/SI/SU/SR), all passing
3. `lib/__fixtures__/awareness-fixtures.cjs` exports buildMockRunGit + 7 canned-response helpers
4. Two atomic commits: `test(02-02):` then `feat(02-02):`
5. SC-1 covered: scanPeer walks origin/*, fetches first (unless --no-fetch), filters by patterns + stale, returns structured per-branch state
6. SC-2 covered: branches without STATE.md silently skipped; malformed STATE.md logs warning + continues; offline mode works with no_fetch=true
7. `_setRunGit` mirrors obj 1's `_setRunGh` pattern exactly — externally observable via test
</verification>

<success_criteria>
- SC-1 fully met: peer scanner walks origin/* refs, returns structured JSON per-branch
- SC-2 fully met: fault-tolerant — silent skip / warning / offline / malformed handling per spec
- Mocked unit suite (no live git in default `npm test`) — locked decision (SI1 + SR1/SR2 gating)
- 2 atomic commits per TDD Playbook (test: → feat:)
- Test list (29 cases) implemented per TDD Playbook habit 2
</success_criteria>

<output>
After completion, create `.planning/objectives/02-cross-repo-awareness-layer/02-02-peer-scanner-SUMMARY.md`
</output>

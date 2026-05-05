---
objective: 06-unified-check-todos
trd: 06-02
type: tdd
confidence: high
wave: 2
depends_on:
  - 06-01
files_modified:
  - plugins/devflow/devflow/bin/lib/check-todos.cjs
  - plugins/devflow/devflow/bin/lib/check-todos.test.cjs
  - .gitignore
autonomous: true
requirements:
  - SC-4
must_haves:
  truths:
    - "readCheckTodosCache(cwd) returns null on missing/empty/malformed cache file; never throws"
    - "writeCheckTodosCache(cwd, sections) merges sections at namespace level (writing one preserves others)"
    - "isCheckTodosCacheStale(fetched_at, ttl_minutes) returns true on null/invalid/expired; false on fresh and future-timestamp"
    - "aggregate({ projectRoot }) on cache-hit serves cached data + sets cached: true; per-source TTL granularity"
    - "aggregate({ projectRoot, refresh: true }) bypasses cache, refetches all 5 sources, persists fresh data"
    - ".planning/.check-todos-cache.json is gitignored"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/check-todos.cjs"
      provides: "Cache region — readCheckTodosCache + writeCheckTodosCache + isCheckTodosCacheStale + aggregate cache-or-fetch wiring"
      contains: "readCheckTodosCache"
    - path: ".gitignore"
      provides: ".planning/.check-todos-cache.json gitignore entry"
      contains: ".planning/.check-todos-cache.json"
  key_links:
    - from: "lib/check-todos.cjs::aggregate"
      to: "readCheckTodosCache + isCheckTodosCacheStale + writeCheckTodosCache"
      via: "cache-or-fetch wiring inside aggregate body"
      pattern: "readCheckTodosCache|writeCheckTodosCache"
    - from: "writeCheckTodosCache"
      to: "fs.writeFileSync via _runFs.writeFileSync"
      via: "atomic-ish write (single writeFileSync call; no tmp+rename per locked decision)"
      pattern: "writeFileSync"
---

<objective>
Add the cache layer to `lib/check-todos.cjs`: `readCheckTodosCache(cwd)`, `writeCheckTodosCache(cwd, sections)`, `isCheckTodosCacheStale(fetched_at, ttl_minutes)`. Wire cache-or-fetch logic into `aggregate({ projectRoot, refresh })` so cached data serves on hit, fresh data writes on miss/refresh, and per-source TTL granularity decides which sources to re-fetch.

Purpose: SC-4 — cache file at `.planning/.check-todos-cache.json` (gitignored), 10-min TTL, namespaced sources, `--refresh` forces all-source re-fetch.

Mirror obj 2 TRD 02-04 cache primitives EXACTLY (same staleness rules, same merge semantics, same fault-tolerance). The DIFFERENCE: this cache has 5 namespaces (`local_todos`, `gh_issues`, `peer_sessions`, `initiative_questions`, `dup_detect_log`) instead of 2; per-source `fetched_at` is checked independently per CONTEXT.md decision #4.

Output: cache region in `check-todos.cjs`, ~12 new tests, `.gitignore` updated.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── check-todos.cjs              ← MODIFY (add cache region)
└── check-todos.test.cjs         ← MODIFY (add Group C tests)

.gitignore                       ← MODIFY (add .planning/.check-todos-cache.json line)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Reference cache primitives from `lib/awareness.cjs` (obj 2 TRD 02-04):**

```js
// ─── TRD 02-04: cache layer ───────────────────────────────────────────────────

function readCache(cwd) {
  const p = path.join(cwd, AWARENESS_CACHE_REL);
  if (!fs.existsSync(p)) return null;
  try {
    const content = fs.readFileSync(p, 'utf-8');
    if (!content.trim()) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeCache(cwd, sections) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
  const existing = readCache(cwd) || {};
  const merged = Object.assign({}, existing, sections || {});
  fs.writeFileSync(
    path.join(cwd, AWARENESS_CACHE_REL),
    JSON.stringify(merged, null, 2) + '\n'
  );
}

function isStale(fetched_at, ttl_minutes) {
  if (fetched_at == null) return true;
  if (typeof fetched_at !== 'string') return true;
  const ts = Date.parse(fetched_at);
  if (!Number.isFinite(ts)) return true;
  const ttl = (ttl_minutes != null) ? ttl_minutes : DEFAULT_TTL_MINUTES;
  if (ttl <= 0) return true;
  const age_ms = Date.now() - ts;
  if (age_ms < 0) return false; // future timestamp → fresh (clock-skew tolerance)
  return age_ms > (ttl * 60_000);
}
```

# CRITICAL: Mirror these EXACTLY. Same null/invalid handling, same Object.assign merge, same future-timestamp tolerance, same zero-TTL = always stale rule. Only the file path constant changes (`AWARENESS_CACHE_REL` → `CHECK_TODOS_CACHE_REL`) and TTL default (`DEFAULT_TTL_MINUTES = 10` → `CHECK_TODOS_TTL_MINUTES = 10`, same value but separate constant for clarity).
# PATTERN: Production cache I/O routes through `_runFs` (NOT bare `fs`). The obj 2 reference uses bare `fs` — that's a pre-injection-hook era. Obj 6 uses the established `_runFs` pattern from obj 4/5.

**Obj 6's cache primitives (target shape):**

```js
// ─── TRD 06-02: cache layer ───────────────────────────────────────────────────

/**
 * Read the check-todos cache file.
 * Returns null on missing file, empty file, or malformed JSON.
 * Never throws.
 */
function readCheckTodosCache(cwd) {
  const p = path.join(cwd, CHECK_TODOS_CACHE_REL);
  if (!_runFs.existsSync(p)) return null;
  try {
    const content = _runFs.readFileSync(p, 'utf-8');
    if (!content.trim()) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write check-todos cache with MERGE semantics.
 * Writing { gh_issues: { data, fetched_at } } preserves other 4 sections.
 */
function writeCheckTodosCache(cwd, sections) {
  const planningDir = path.join(cwd, '.planning');
  if (!_runFs.existsSync(planningDir)) _runFs.mkdirSync(planningDir, { recursive: true });
  const existing = readCheckTodosCache(cwd) || {};
  const merged = Object.assign({}, existing, sections || {});
  _runFs.writeFileSync(
    path.join(cwd, CHECK_TODOS_CACHE_REL),
    JSON.stringify(merged, null, 2) + '\n',
    'utf-8'
  );
}

/**
 * Returns true when fetched_at is stale relative to ttl_minutes.
 * Same rules as obj 2 isStale: null/invalid → true, zero TTL → true,
 * future timestamp → false (clock skew tolerance).
 */
function isCheckTodosCacheStale(fetched_at, ttl_minutes) {
  if (fetched_at == null) return true;
  if (typeof fetched_at !== 'string') return true;
  const ts = Date.parse(fetched_at);
  if (!Number.isFinite(ts)) return true;
  const ttl = (ttl_minutes != null) ? ttl_minutes : CHECK_TODOS_TTL_MINUTES;
  if (ttl <= 0) return true;
  const age_ms = Date.now() - ts;
  if (age_ms < 0) return false;
  return age_ms > (ttl * 60_000);
}
```

# CRITICAL: `realFs` from TRD 06-01 needs to be EXTENDED to include `writeFileSync` + `mkdirSync` (TRD 06-01 only included read methods — same pattern as obj 4 TRD 04-01 which extended realFs in 04-02). Add the methods in-place to the same `realFs` object literal so `_runFs` references pick them up automatically (mirror obj 4 TRD 04-02 deviation pattern).

**Aggregate cache-or-fetch wiring (target shape):**

```js
// Inside aggregate({ projectRoot, refresh }):

function aggregate({ projectRoot, refresh } = {}) {
  const result = {
    blocked: [], now: [], soon: [], ideas: [],
    warnings: [],
    cached: false,
  };

  const currentUser = _detectCurrentUser({ cwd: projectRoot });
  const currentRepo = _detectCurrentRepo({ cwd: projectRoot });

  // ── Cache check ────────────────────────────────────────────────────────────
  // Per-source granularity: each section has its own fetched_at.
  // refresh=true bypasses cache entirely.

  const cache = refresh ? null : readCheckTodosCache(projectRoot);
  const sectionsToWrite = {};
  let allFromCache = (cache !== null);

  // ── 1. Local todos ─────────────────────────────────────────────────────────
  let localEntries = [];
  if (cache && cache.local_todos && !isCheckTodosCacheStale(cache.local_todos.fetched_at)) {
    localEntries = cache.local_todos.data || [];
  } else {
    allFromCache = false;
    try {
      localEntries = _fetchLocalTodos(projectRoot, {});
      sectionsToWrite.local_todos = { data: localEntries, fetched_at: new Date().toISOString() };
    } catch (err) {
      result.warnings.push({ source: 'local', kind: 'fetch_error', message: err.message });
    }
  }

  // ── 2. GH issues ───────────────────────────────────────────────────────────
  let ghEntries = [];
  if (cache && cache.gh_issues && !isCheckTodosCacheStale(cache.gh_issues.fetched_at)) {
    ghEntries = cache.gh_issues.data || [];
  } else {
    allFromCache = false;
    try {
      ghEntries = _fetchGhIssues({ org: currentRepo ? currentRepo.split('/')[0] : null });
      sectionsToWrite.gh_issues = { data: ghEntries, fetched_at: new Date().toISOString() };
    } catch (err) {
      if (err && err.name === 'GhAuthError') {
        result.warnings.push({
          source: 'gh',
          kind: 'gh_auth_failure',
          remediation: err.remediation || 'gh auth refresh -h github.com -s repo',
        });
      } else {
        result.warnings.push({ source: 'gh', kind: 'fetch_error', message: err.message });
      }
    }
  }

  // (similar pattern for peer, initiative, dup-detect)

  // Persist any newly-fetched sections (atomic per-section)
  if (Object.keys(sectionsToWrite).length > 0) {
    try {
      writeCheckTodosCache(projectRoot, sectionsToWrite);
    } catch (err) {
      result.warnings.push({ kind: 'cache_write_error', message: err.message });
    }
  }

  result.cached = allFromCache;

  // ── Lane assignment (unchanged from 06-01) ────────────────────────────────
  const allEntries = [...localEntries, ...ghEntries, ...peerEntries, ...initEntries, ...dupEntries];
  for (const entry of allEntries) {
    const lane = _assignLane(entry, currentUser, currentRepo);
    if (lane && result[lane]) result[lane].push(entry);
  }

  return result;
}
```

# CRITICAL: `cached: true` ONLY when ALL 5 sources came from cache (no fresh fetches). If even one source was re-fetched, `cached: false`. This is the user-facing signal: "you're seeing stale data" vs "this is fresh".
# CRITICAL: When `refresh: true`, set `cache = null` upfront — that ensures every source falls through to the fetcher. The CLI test for `--refresh` asserts `cached: false` post-call.
# GOTCHA: Cache-write failures are non-fatal. The aggregator continues with the in-memory data; just emits a `cache_write_error` warning. This protects against e.g. read-only filesystem.

**`.gitignore` update (mirror obj 2 + obj 4):**

```diff
+ # Check-todos cache (TRD 06-02 — generated by df-tools check-todos)
+ .planning/.check-todos-cache.json
```

Add at the bottom of `.gitignore` near the existing `.dup-detect-log.jsonl` and `.awareness-cache.json` lines.
</codebase_examples>

<anti_patterns>
- **Don't introduce a new `realFs`-style alias.** Extend the existing `realFs` from TRD 06-01 in-place by adding `writeFileSync`, `mkdirSync` methods. Mirror obj 4 TRD 04-02 pattern exactly.
- **Don't use atomic tmp+rename.** Single `writeFileSync` is fine — cache is non-load-bearing and re-fetch on next run is cheap. Mirror obj 2 TRD 02-04 simplicity.
- **Don't add per-source `--refresh <name>` semantics.** Out of scope per CONTEXT.md decision #4. Single bulk-refresh flag only.
- **Don't change the aggregate() shape.** Output is still `{ blocked, now, soon, ideas, warnings, cached }` — no new fields.
- **Don't add `--refresh` flag handling to the CLI in this TRD.** That's TRD 06-04. Just plumb the boolean through `aggregate({ refresh })`. The `cmdCheckTodosRoute` already passes `refresh: !!flags['refresh']` per TRD 06-01.
</anti_patterns>

<error_recovery>
- **`writeFileSync` permission denied:** Cache-write failures emit `cache_write_error` warning + continue. Test the path explicitly with a mock that throws.
- **Existing cache file with old schema (e.g., from a 06-01 hand-test):** `readCheckTodosCache` returns whatever it finds; `aggregate` walks each section independently. Old/missing sections trigger re-fetch for that source. No migration needed.
- **Object.assign merge shadowing:** When tests verify "writing one section preserves others", use a setup that pre-writes `{ peer_sessions: {...}, gh_issues: {...} }` and then writes `{ gh_issues: NEW }`. Verify the post-state has both `peer_sessions` (preserved) and `gh_issues` (replaced).
- **Future timestamp tolerance (clock skew):** Test with `fetched_at` set to `now + 1 hour`. `isCheckTodosCacheStale` returns false. Document explicitly in test comment.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/06-unified-check-todos/06-CONTEXT.md
@.planning/objectives/06-unified-check-todos/06-01-aggregator-and-fixtures-SUMMARY.md
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/check-todos.cjs
</context>

<gotchas>
- **`realFs` extension in-place:** Add `writeFileSync` + `mkdirSync` to the existing `realFs` object literal (don't redeclare). Mirror obj 4 TRD 04-02 deviation note.
- **`_runFs.writeFileSync` signature:** `_runFs.writeFileSync(path, content, encoding)` — pass `'utf-8'` explicitly (Node 22+ defaults differ).
- **`isCheckTodosCacheStale` parameter type-checking:** Mirror obj 2's defensive guard. Test with non-string fetched_at (number, object, undefined) — all return true.
- **`refresh: true` semantics:** Test with cache PRESENT (so the cache-bypass path is exercised). Assert: `cached: false` AND cache file rewritten with fresh fetched_at timestamps.
- **`cached: true` semantics:** Test with cache ALL fresh, no `refresh`. Assert: `cached: true` AND cache file UNCHANGED (no fresh data was fetched, so no write).
- **Test isolation:** Each cache test uses a fresh tmp project root (via `buildCheckTodosFixtures`). `afterEach` calls `_resetMocks()` AND `cleanup()`.
</gotchas>

## Test list

Hand-built test cases written FIRST (test:add commit), then implementation (feat: commit). Test groups:

### Group C — Cache primitives

- **C1**: `readCheckTodosCache(cwd)` returns `null` when cache file is missing.
- **C2**: `readCheckTodosCache(cwd)` returns `null` when cache file is empty.
- **C3**: `readCheckTodosCache(cwd)` returns `null` when cache file contains malformed JSON.
- **C4**: `readCheckTodosCache(cwd)` returns parsed object when cache file is valid JSON.
- **C5**: `writeCheckTodosCache(cwd, { gh_issues: X })` creates cache file with provided section.
- **C6**: `writeCheckTodosCache(cwd, { gh_issues: NEW })` when cache has `{ peer_sessions: OLD }` → result has both (merge semantics).
- **C7**: `writeCheckTodosCache(cwd, ...)` lazy-creates `.planning/` directory if missing.
- **C8**: `writeCheckTodosCache` writes pretty-printed JSON (2-space indent + trailing newline) — match obj 2 TRD 02-04 format.

### Group I — isCheckTodosCacheStale (mirror obj 2 isStale)

- **I1**: `null`/`undefined` fetched_at → `true`.
- **I2**: Non-string fetched_at (number, object) → `true`.
- **I3**: Invalid date string → `true`.
- **I4**: `ttl_minutes === 0` → `true` (always stale).
- **I5**: Fresh timestamp (now - 1 minute, ttl 10) → `false`.
- **I6**: Expired timestamp (now - 11 minutes, ttl 10) → `true`.
- **I7**: Future timestamp (now + 1 hour) → `false` (clock-skew tolerance).
- **I8**: Default ttl_minutes uses `CHECK_TODOS_TTL_MINUTES` (10) when omitted.

### Group AC — Aggregate cache integration

- **AC1**: `aggregate({ projectRoot })` with no cache file → all 5 sources fetched fresh, `cached: false`, cache file written.
- **AC2**: `aggregate({ projectRoot })` with all-fresh cache → all 5 sources served from cache, `cached: true`, cache file UNCHANGED.
- **AC3**: `aggregate({ projectRoot })` with stale `gh_issues` only → 4 from cache + 1 fresh fetch, `cached: false`, cache file rewritten with new `gh_issues.fetched_at`.
- **AC4**: `aggregate({ projectRoot, refresh: true })` with all-fresh cache → all 5 re-fetched, `cached: false`, cache file rewritten.
- **AC5**: `aggregate({ projectRoot })` with cache where 1 source has missing data (e.g., `gh_issues: null`) → that source re-fetched.
- **AC6**: `aggregate({ projectRoot })` with corrupt cache file (malformed JSON) → readCheckTodosCache returns null → all 5 sources re-fetched (no error to user).
- **AC7**: `aggregate({ projectRoot })` with cache write failure (mocked `_runFs.writeFileSync` throws) → emits `cache_write_error` warning + continues with fetched data.
- **AC8**: `aggregate({ projectRoot })` GhAuthError path: gh source still triggers re-fetch attempt (auth fails → no cache write for gh_issues namespace; other 4 sources still cached/written normally).

Total: ~24 new tests.

<tasks>

<task type="auto">
  <name>Task 1: RED — append cache test list (test: commit)</name>
  <files>
    plugins/devflow/devflow/bin/lib/check-todos.test.cjs
    .gitignore
  </files>
  <action>
RED phase: write Group C / I / AC tests + update .gitignore. The cache primitives don't exist yet, so all 24 tests should fail.

**Step 1: Append `## Test list — TRD 06-02` block to top-of-file comments in `check-todos.test.cjs`** describing Groups C/I/AC.

**Step 2: Add Group C tests (C1-C8)** per the Test list above. Use `buildCheckTodosFixtures` for tmp project root setup; assert via `_runFs.existsSync` + `JSON.parse`. Tests must use the cache helpers via `require('./check-todos.cjs').readCheckTodosCache` etc.

**Step 3: Add Group I tests (I1-I8)** for `isCheckTodosCacheStale`. Pure unit tests — no fixtures needed. Mirror obj 2 TRD 02-04 isStale tests exactly.

**Step 4: Add Group AC tests (AC1-AC8)** for aggregate cache integration. Use `buildCheckTodosFixtures` with mocked sources via `_setRunGh`/`_setRunPeer`/`_setRunFs`. Verify `cached` flag + cache file state after each invocation.

**Step 5: Update `.gitignore`** by appending:

```
# Check-todos cache (TRD 06-02 — generated by df-tools check-todos)
.planning/.check-todos-cache.json
```

near the existing `.awareness-cache.json` and `.dup-detect-log.jsonl` lines.

# CRITICAL: At RED time, all 24 tests will fail because the cache primitives don't exist yet (require errors) OR pass-through fail because aggregate doesn't have cache wiring. Document in commit which tests fail at which layer.
# GOTCHA: For AC8 (GhAuthError path), build the fixture's mockGh to throw GhAuthError on `gh auth status` call: `gh._setRunGh(args => { if (args[0] === 'auth') return { ok: false, status: 1, stderr: 'auth required' }; ... })`. The `requireGhAuth` will throw because parseScopes returns no scopes.

Commit: `test(06-02): add failing tests for check-todos cache primitives + aggregate cache integration`.
  </action>
  <verify>
1. `npm test 2>&1 | grep -E "fail|FAIL" | head -20` — shows 24 new failures from Group C/I/AC.
2. `cat .gitignore | grep check-todos-cache` matches.
  </verify>
  <done>
~24 new tests added in RED state. .gitignore updated. Single `test:` commit.
  </done>
  <recovery>
If existing tests start failing because of .gitignore changes, that's an isolated symptom — re-run `git status` and confirm no untracked file leaked into the test fixture path. The .gitignore line is purely defensive (the cache file is created at runtime).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement cache primitives + wire into aggregate (feat: commit)</name>
  <files>
    plugins/devflow/devflow/bin/lib/check-todos.cjs
  </files>
  <action>
GREEN phase: implement `readCheckTodosCache`, `writeCheckTodosCache`, `isCheckTodosCacheStale` per embedded patterns. Wire cache-or-fetch logic into `aggregate`.

**Step 1: Extend `realFs` in-place** (top of check-todos.cjs, in the existing `realFs` object literal — mirror obj 4 TRD 04-02 pattern):

```js
const realFs = {
  // (TRD 06-01 read methods)
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  // TRD 06-02: write methods for cache layer
  writeFileSync: (p, data, opts) => fs.writeFileSync(p, data, opts),
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
};
```

**Step 2: Add cache region** after the 5 fetchers but before `aggregate`:

- `readCheckTodosCache(cwd)` per embedded skeleton (uses `_runFs`).
- `writeCheckTodosCache(cwd, sections)` per embedded skeleton (merge semantics).
- `isCheckTodosCacheStale(fetched_at, ttl_minutes)` per embedded skeleton.

Add region banner: `// ─── TRD 06-02: cache layer ───────────────────────`.

**Step 3: Rewrite `aggregate` body** with cache-or-fetch wiring per embedded example:

- Read cache at top (skip if `refresh: true`).
- For each of the 5 sources: serve from cache if fresh, else fetch + accumulate to `sectionsToWrite`.
- Write `sectionsToWrite` if non-empty (catch write errors → warnings).
- Set `result.cached = allFromCache` (true ONLY when zero sources required re-fetch).
- Lane assignment block UNCHANGED from 06-01.

**Step 4: Extend partial `module.exports`** to include the 3 new cache functions:

```js
module.exports = {
  // TRD 06-01:
  aggregate, _fetchLocalTodos, _fetchGhIssues, _fetchPeerSessions, _fetchInitiativeQuestions, _fetchDupDetectLog, _assignLane,
  _setRunFs, _setRunGh, _setRunPeer, _resetMocks,
  CHECK_TODOS_CACHE_REL, CHECK_TODOS_TTL_MINUTES, MAX_CHECK_TODOS_OUTPUT_CHARS, DEFAULT_LANE_TRUNCATE, LANE_NAMES,

  // TRD 06-02:
  readCheckTodosCache, writeCheckTodosCache, isCheckTodosCacheStale,
};
```

**Step 5: Run tests**:

```bash
npm test 2>&1 | tail -10
```

Expected: all ~24 new tests GREEN. Total test count up by 24 from 06-01's GREEN state. No regression.

# CRITICAL: After Task 2, `cached` flag must be true ONLY when zero sources re-fetched. Test AC2 + AC3 enforce this. AC3 in particular: stale gh_issues triggers ONE re-fetch → cached MUST be false (not "mostly cached").
# GOTCHA: For AC7 (cache write failure), the mock must throw during `_runFs.writeFileSync` only AFTER the in-memory aggregate has populated. The aggregator must continue and produce a valid `result` with the warning attached.

Commit: `feat(06-02): add cache layer + per-source TTL granularity to check-todos aggregate`.
  </action>
  <verify>
1. `npm test 2>&1 | tail -5` — all GREEN; total pass count up by ~24.
2. `node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw > /tmp/run1.json && node plugins/devflow/devflow/bin/df-tools.cjs check-todos --raw > /tmp/run2.json && diff <(jq .cached /tmp/run1.json) <(jq .cached /tmp/run2.json)` — second invocation returns `cached: true` (assuming TTL didn't expire between runs).
3. `ls .planning/.check-todos-cache.json` exists after first invocation.
4. `git status` — `.planning/.check-todos-cache.json` is gitignored (NOT untracked).
  </verify>
  <done>
24 new tests GREEN. Cache file persists between invocations; `cached: true` on second call. Single `feat:` commit.
  </done>
  <recovery>
If `cached: false` on the second call (when expected `true`), debug the per-source staleness check — likely the new fetched_at timestamp is not being persisted into the cache file. Print the cache content after invocation 1.

If a cache write failure test fails because the mock throws but no warning is emitted, verify the `try/catch` around `writeCheckTodosCache(...)` in `aggregate` is correctly catching `TypeError` from the mock (not just `Error`). Mocks should throw `Error` instances (not strings) for safe catch behavior.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `lib/check-todos.cjs` has 3 new cache functions: `readCheckTodosCache`, `writeCheckTodosCache`, `isCheckTodosCacheStale`.
2. `realFs` extended in-place with `writeFileSync` + `mkdirSync`.
3. `aggregate` wires cache-or-fetch logic; `cached: true` ONLY when all 5 from cache.
4. `.planning/.check-todos-cache.json` is gitignored.
5. ~24 new tests GREEN (Groups C/I/AC).
6. No regression in baseline + 06-01 tests.
7. Manual smoke: second invocation of `df-tools check-todos --raw` returns `cached: true`.
8. Total commits this TRD: 2 (`test:` RED + `feat:` GREEN).
</verification>

<success_criteria>
- [ ] SC-4 satisfied: `.planning/.check-todos-cache.json` gitignored; namespaced sections; 10-min TTL; `--refresh` forces re-fetch (CLI passthrough already wired in 06-01; behavior tested in AC4).
- [ ] All cache primitives mirror obj 2 TRD 02-04 contracts (null on missing/malformed, merge semantics, future-timestamp tolerance, zero-TTL = always stale).
- [ ] `cached` flag truthful: true ONLY when zero sources re-fetched.
- [ ] No regression in baseline tests.
</success_criteria>

<output>
After completion, create `.planning/objectives/06-unified-check-todos/06-02-cache-layer-SUMMARY.md`. Record:

- Test count delta (before/after this TRD).
- Both commit hashes (`test:` RED + `feat:` GREEN).
- Any deviations from locked design (especially: cache write atomic-ness, treatment of cache file mid-rewrite if process killed, behavior when .planning/ is read-only).
- Manual smoke test: two consecutive `df-tools check-todos --raw` invocations — capture `cached` flag of each.
</output>

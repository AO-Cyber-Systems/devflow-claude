---
objective: 02-cross-repo-awareness-layer
trd: 02-07
title: Library export lock + integration tests + cassette capture
type: tdd
confidence: medium
wave: 7
depends_on: [02-01, 02-02, 02-03, 02-04, 02-05, 02-06]
files_modified:
  - plugins/devflow/devflow/bin/lib/awareness.cjs
  - plugins/devflow/devflow/bin/lib/awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json
autonomous: true
requirements: [SC-9, SC-10]
verification_commands:
  - "npm test"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/awareness.cjs\"); const expected=[\"parseStateMd\",\"aggregateOrgByProductQuarter\",\"scanPeer\",\"scanOrg\",\"parseTaskListFallback\",\"readCache\",\"writeCache\",\"isStale\",\"_setRunGit\",\"_resetGitMock\",\"DEFAULT_TTL_MINUTES\",\"DEFAULT_STALE_DAYS\",\"DEFAULT_BRANCH_PATTERNS\",\"AWARENESS_CACHE_REL\"]; for (const k of expected) if (a[k] === undefined) throw new Error(\"missing export: \"+k); console.log(\"OK — all 14 exports present\");'"
  - "test -f plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json"
  - "GH_INTEGRATION=1 GIT_INTEGRATION=1 npm test 2>&1 | grep -qE 'pass [0-9]'"

must_haves:
  truths:
    - "lib/awareness.cjs module.exports contains EXACTLY these 14 entries (test asserts with deepStrictEqual on Object.keys): parseStateMd, aggregateOrgByProductQuarter, scanPeer, scanOrg, parseTaskListFallback, readCache, writeCache, isStale, _setRunGit, _resetGitMock, DEFAULT_TTL_MINUTES, DEFAULT_STALE_DAYS, DEFAULT_BRANCH_PATTERNS, AWARENESS_CACHE_REL"
    - "Integration test peer-side (GIT_INTEGRATION=1): builds 2-branch fixture repo via buildGitFixtureRepo, scans, asserts 2 entries with correct objective/trd/branch fields"
    - "Integration test org-side (GH_INTEGRATION=1): scanOrg against live AO-Cyber-Systems Product Roadmap project, captures response → product-roadmap-walk.json cassette, asserts items.length > 0"
    - "Integration test cache round-trip: scanPeer → writeCache → readCache → assert deep equality of branches array"
    - "Cassette product-roadmap-walk.json committed with at least 1 page of real responses (captured under GH_INTEGRATION=1; empty placeholder when env unset)"
    - "When GH_INTEGRATION unset, integration tests SKIP (don't fail); replay tests against committed cassette PASS in default test run"
    - "Drift-detection test: when GH_INTEGRATION=1, capture fresh response and diff against committed cassette; warn on diff (not fail) — captures real evolution of org Project state"
    - "All previous test counts preserved: total `npm test` count is sum of TRDs 02-01..02-06 + this TRD's additions; no regressions"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      provides: "Final module.exports block with exactly 14 entries (asserted via Object.keys equality)"
      exports: ["parseStateMd", "aggregateOrgByProductQuarter", "scanPeer", "scanOrg", "parseTaskListFallback", "readCache", "writeCache", "isStale", "_setRunGit", "_resetGitMock", "DEFAULT_TTL_MINUTES", "DEFAULT_STALE_DAYS", "DEFAULT_BRANCH_PATTERNS", "AWARENESS_CACHE_REL"]
    - path: "plugins/devflow/devflow/bin/lib/awareness.test.cjs"
      provides: "Test groups: export surface lock, cache round-trip, peer integration, org integration, cassette replay"
      min_lines: 100
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json"
      provides: "Captured GraphQL response for walking the Product Roadmap project. Used in unit tests as canned data."
      contains: "data"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/awareness.test.cjs (cassette replay test)"
      to: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json"
      via: "fs.readFileSync + JSON.parse + inject as runGh response"
      pattern: "product-roadmap-walk\\.json"
---

<objective>
Lock the `lib/awareness.cjs` module's export surface (assert exact set of 14 entries via test); add round-trip integration tests for peer + org + cache; capture a live cassette of the org Product Roadmap project walk for replay-based testing.

Purpose: SC-9 — stable library surface. SC-10 — round-trip integration tests gated on GIT_INTEGRATION + GH_INTEGRATION env vars. The export-lock test prevents accidental surface drift in future work (obj 4 / obj 5 / obj 6 will reuse this surface; we don't want them to find unexpected exports added by mistake). The cassette capture provides canned data for offline replay tests, mirroring obj 1's pattern (`devflow-claude-9-walk.json` + `product-roadmap-fields.json` already shipped).

Output: Locked module.exports; 5 integration test groups; product-roadmap-walk.json cassette committed.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── awareness.cjs                                     ← MODIFY  (final exports lock)
├── awareness.test.cjs                                ← MODIFY  (add Group L/IT/CT)
└── __fixtures__/
    └── gh-cassettes/
        └── product-roadmap-walk.json                 ← CREATE (cassette)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing cassette pattern** — `__fixtures__/gh-cassettes/product-roadmap-fields.json` (committed by obj 1):

```json
{
  "fields": [
    {
      "id": "PVTSSF_lADODwqLrc4BRsOPzg_cgIo",
      "name": "Status",
      "options": [
        { "id": "f75ad846", "name": "Todo" },
        { "id": "47fc9ee4", "name": "In Progress" },
        { "id": "98236657", "name": "Done" }
      ]
    },
    ...
  ]
}
```

**Existing replay test pattern** — from obj 1's `01-06-dogfood-and-integration-TRD` SUMMARY (key paragraphs):

> Cassette-based replay testing pattern (TRD 01-06) — Committed JSON cassettes in __fixtures__/gh-cassettes/; tests load via fs.readFileSync; NOT regenerated on test runs. Live re-capture only with GH_INTEGRATION=1 in E4/L2 drift-detection tests.

The pattern: tests `fs.readFileSync` the cassette as canned data, wrap in `{ ok: true, stdout: cassetteText, stderr: '' }`, inject via `_setRunGh`, run scanner, assert. Drift detection: when env=1, capture fresh response, diff against committed cassette, WARN (not fail) on diff.

**Existing module.exports lock pattern** — from `lib/intent.cjs::resolve` (referenced indirectly via test): no explicit "lock" test in obj 0, but obj 1's TRD 01-02 test asserts the gh.cjs module.exports surface. Mirror that style:

```js
test('Library surface lock — module.exports contains EXACTLY 14 expected entries', () => {
  const aw = require('./awareness.cjs');
  const exported = Object.keys(aw).sort();
  const expected = [
    'AWARENESS_CACHE_REL', 'DEFAULT_BRANCH_PATTERNS', 'DEFAULT_STALE_DAYS', 'DEFAULT_TTL_MINUTES',
    '_resetGitMock', '_setRunGit',
    'aggregateOrgByProductQuarter', 'isStale', 'parseStateMd', 'parseTaskListFallback',
    'readCache', 'scanOrg', 'scanPeer', 'writeCache',
  ].sort();
  assert.deepStrictEqual(exported, expected);
});
```

</codebase_examples>

<anti_patterns>

- **Do NOT add NEW functionality in this TRD.** Strictly: (a) lock the export surface, (b) add integration tests, (c) capture cassette. No new feature code.
- **Do NOT make integration tests gate the default `npm test`.** Always wrap in `{ skip: process.env.GH_INTEGRATION !== '1' }` or equivalent. Default test run STAYS at the size set by Wave 1-6.
- **Do NOT delete or modify obj 1's existing cassettes.** They're in the same dir but unrelated. Preserve verbatim.
- **Do NOT commit cassette captured under partial auth** (e.g., when `read:project` is missing some items). Verify the captured cassette has expected number of items (≥ 9 real `[Roadmap]` items per spike findings) before committing.
- **Do NOT commit a cassette with PII or org-internal data**. The Product Roadmap is a public-org-internal project but should review captured content before commit (no internal employee names beyond what's already public in issue assignees).
- **Do NOT make the cassette-replay test compare strict-equality against captured response.** GitHub mutates server-side timestamps + IDs constantly; just verify the SHAPE (data.node.items.nodes is array, length > 0).

</anti_patterns>

<error_recovery>

- If the cassette capture fails (missing scopes — even after obj 1's `requireGhAuth` resolution), the test logs the failure and SKIPS (doesn't fail). User runs `gh auth refresh -h github.com -s project,read:project,repo` and re-runs.
- If the integration test for peer-side fails because `git` isn't installed on CI, the test SKIPS via `t.skip()`.
- If the export-lock test fails (e.g., another wave accidentally added an export), the diff in the test output tells you exactly what changed. Either remove the unintended export OR update the expected list (and document why in this TRD's SUMMARY).
- Per project memory: this is the LAST wave. Do NOT introduce changes that could affect prior waves' tests. Strictly additive (lock + integration + cassette).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/02-cross-repo-awareness-layer/02-CONTEXT.md
@.planning/objectives/01-github-coordination-layer/01-CONTEXT.md
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json
</context>

<gotchas>

- **The export-lock list MUST match what TRDs 02-01..02-06 actually ship.** Sanity-check at the start of this TRD: `node -e 'console.log(Object.keys(require("./plugins/devflow/devflow/bin/lib/awareness.cjs")).sort())'`. If the count is 13 or 15 instead of 14, the lock test catches a real issue — investigate.
- **GraphQL response shape for walkProject**: `data.node.items.{pageInfo,nodes}`. Tests verify shape, not strict content. Don't assume specific item titles or counts.
- **Cassette file format**: pretty-printed JSON with newline-at-end (matches obj 1's existing cassettes). Use `JSON.stringify(obj, null, 2) + '\n'`.
- **Cassette capture command** (manual, runs once per cassette regeneration):
  ```bash
  GH_INTEGRATION=1 npm test -- --grep "L1.*capture"
  ```
  Or write a tiny capture script in this TRD that runs `walkProject('PVT_kwDODwqLrc4BRsOP')` with REAL `_runGh` (no mock), serializes the responses, writes to the cassette path. Recommended: add a single test like `test('L1: capture fresh cassette', { skip: !GH_INTEGRATION }, () => { ... })` that does the writing.
- **Integration test isolation**: each test cleans up its tmp git repo. `buildGitFixtureRepo` already provides `cleanup()`.
- **Wave 7 means dogfood-friendly**: this TRD ships LAST, so it can dogfood by running the full skill against this very repo's state. Optional bonus: add a smoke test like `test('SR3: scan-peer against this repo finds at least 1 branch', { skip: !GIT_INTEGRATION }, ...)`.

</gotchas>

## Test list

Per TDD Playbook habit 2:

**Group L — Library surface lock:**
1. L1: Object.keys(require('awareness.cjs')).sort() === expected 14-entry list (deep equality)
2. L2: each expected export is `typeof === 'function'` for the 10 functions, and `typeof === 'string'` or `'number'` for the 4 constants

**Group CT — Cache round-trip integration:**
3. CT1: scanPeer with mocked git → writeCache → readCache → assert peer section deep-equals scan result
4. CT2: writeCache org section → readCache → manipulate org section → writeCache → readCache → BOTH sections present (peer preserved through org rewrite)
5. CT3: cache file is valid JSON after round-trip (no broken state)

**Group IT — Peer integration (GIT_INTEGRATION=1 only):**
6. IT1: buildGitFixtureRepo with 2 branches each carrying STATE.md → scanPeer with no_fetch=true → result has 2 entries with correct objective/branch fields
7. IT2: cleanup() removes tmp dir
8. IT3 (bonus dogfood): scanPeer({ cwd: process.cwd(), no_fetch: true }) — scan THIS repo's local refs — assert result.branches is array (count not asserted; depends on local clone state)

**Group OT — Org integration + cassette capture (GH_INTEGRATION=1 only):**
9. OT1 (capture-mode): with GH_INTEGRATION=1, walkProject(PVT_kwDODwqLrc4BRsOP) returns items.length > 0; capture stdout responses to product-roadmap-walk.json cassette file
10. OT2 (replay-mode, runs in DEFAULT test run): cassette exists at expected path → load → wrap in mock → walkProject returns items.length > 0 (asserts replay works)
11. OT3 (drift detection, GH_INTEGRATION=1): capture fresh + load committed → diff items.length; WARN if drift (don't fail) — captures evolution of project state over time

**Group CR — Cassette replay (default test run, no env required):**
12. CR1: cassette file exists at __fixtures__/gh-cassettes/product-roadmap-walk.json → JSON.parse succeeds → has `data.node.items.nodes` array shape
13. CR2: replaying cassette via _setRunGh + walkProject → returns items array with shape {item_type, issue_ref|null, title, body, ...}
14. CR3: scanOrg with cassette replay → returns items with sub_issues populated (mix of trackedIssues and task_list per real Product Roadmap state)

Total: 14 enumerated cases.

<tasks>

<task type="auto">
  <name>Task 1: RED — write failing tests for export lock + cache round-trip + integration + cassette replay</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness.test.cjs
  </files>
  <action>
Append to test file:

```js
// ─── TRD 02-07: library surface lock + integration tests ──────────────────
const cassetteRel = path.join(__dirname, '__fixtures__', 'gh-cassettes', 'product-roadmap-walk.json');

// Group L
test('L1: awareness.cjs exports exactly 14 expected entries', () => {
  const aw = require('./awareness.cjs');
  const exported = Object.keys(aw).sort();
  const expected = [
    'AWARENESS_CACHE_REL', 'DEFAULT_BRANCH_PATTERNS', 'DEFAULT_STALE_DAYS', 'DEFAULT_TTL_MINUTES',
    '_resetGitMock', '_setRunGit',
    'aggregateOrgByProductQuarter', 'isStale', 'parseStateMd', 'parseTaskListFallback',
    'readCache', 'scanOrg', 'scanPeer', 'writeCache',
  ].sort();
  assert.deepStrictEqual(exported, expected,
    `Export surface drift detected. Diff:\n  unexpected: ${exported.filter(e => !expected.includes(e))}\n  missing: ${expected.filter(e => !exported.includes(e))}`);
});

test('L2: each export has the expected type', () => {
  const aw = require('./awareness.cjs');
  const fns = ['parseStateMd', 'aggregateOrgByProductQuarter', 'scanPeer', 'scanOrg',
               'parseTaskListFallback', 'readCache', 'writeCache', 'isStale',
               '_setRunGit', '_resetGitMock'];
  for (const k of fns) assert.strictEqual(typeof aw[k], 'function', `${k} should be function`);
  assert.strictEqual(typeof aw.DEFAULT_TTL_MINUTES, 'number');
  assert.strictEqual(typeof aw.DEFAULT_STALE_DAYS, 'number');
  assert.ok(Array.isArray(aw.DEFAULT_BRANCH_PATTERNS));
  assert.strictEqual(typeof aw.AWARENESS_CACHE_REL, 'string');
});

// Group CT — cache round-trip
test('CT1: scanPeer → writeCache → readCache round-trip', () => {
  const t = tempCwd();
  try {
    // Mock scanPeer call: actually use the writeCache directly with synthetic data
    const synthPeer = { branches: [{ branch: 'feature/x', objective: '2', trd: '02-07',
                          last_commit: { sha: 'abc', timestamp: '2026-05-04T12:00:00Z', subject: 'x' },
                          developer: 'mark', github_issue: null }],
                        fetched_at: '2026-05-04T12:01:00Z', warnings: [], current_branch: 'main' };
    writeCache(t.cwd, { peer: synthPeer });
    const cached = readCache(t.cwd);
    assert.deepStrictEqual(cached.peer.branches, synthPeer.branches);
  } finally { t.cleanup(); }
});

test('CT2: writeCache merge — peer preserved through org rewrite', () => {
  const t = tempCwd();
  try {
    writeCache(t.cwd, { peer: { branches: ['p1'] } });
    writeCache(t.cwd, { org: { items: ['o1'] } });
    const cached = readCache(t.cwd);
    assert.deepStrictEqual(cached.peer.branches, ['p1']);
    assert.deepStrictEqual(cached.org.items, ['o1']);
  } finally { t.cleanup(); }
});

test('CT3: cache file remains valid JSON after round-trip', () => {
  const t = tempCwd();
  try {
    writeCache(t.cwd, { peer: { x: 1 }, org: { y: 2 } });
    const content = fs.readFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), 'utf-8');
    assert.doesNotThrow(() => JSON.parse(content));
  } finally { t.cleanup(); }
});

// Group IT — peer integration (gated)
const SKIP_GIT = process.env.GIT_INTEGRATION !== '1';

test('IT1: scanPeer integration against fixture repo', { skip: SKIP_GIT }, () => {
  const fixture = buildGitFixtureRepo({
    branches: [
      { name: 'feature/foo', state_md: buildStateMd({ objective: '2 — Test', trd: '02-07' }) },
      { name: 'feature/bar', state_md: buildStateMd({ objective: '3 — Other', trd: '03-01' }) },
    ],
    dev_name: 'test-dev',
  });
  try {
    _resetGitMock();
    const result = scanPeer({ cwd: fixture.root, no_fetch: true });
    assert.strictEqual(result.branches.length, 2);
    const objectives = result.branches.map(b => b.objective).sort();
    assert.ok(objectives.some(o => o.startsWith('2 — Test')));
    assert.ok(objectives.some(o => o.startsWith('3 — Other')));
  } finally { fixture.cleanup(); }
});

test('IT2: fixture cleanup removes tmp dir', { skip: SKIP_GIT }, () => {
  const fixture = buildGitFixtureRepo({ branches: [], dev_name: 'test' });
  const root = fixture.root;
  fixture.cleanup();
  assert.strictEqual(fs.existsSync(root), false);
});

// Group OT — org integration + cassette capture (gated)
const SKIP_GH = process.env.GH_INTEGRATION !== '1';

test('OT1: capture cassette from live Product Roadmap walk', { skip: SKIP_GH }, () => {
  // Use REAL _runGh (no injection)
  _setRunGh(null); // restore production
  // We need to capture each runGh invocation's response to file. Simplest: call walkProject,
  // assert items.length > 0, and write the entire response chain as one cassette object.
  // Wrap _runGh to record:
  const calls = [];
  const realRunGh = require('./gh.cjs');
  // Use a recording wrapper: actually call but tee the responses
  // Simpler approach: call walkProject directly, capture by side-effect via _setRunGh wrapper.
  let recordedResponse = null;
  _setRunGh((args, opts) => {
    const r = require('child_process').spawnSync('gh', args, { ...opts, encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
    const wrapped = { ok: r.status === 0, status: r.status,
                       stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
    if (args.includes('graphql') && wrapped.ok && wrapped.stdout.includes('"items"')) {
      try {
        recordedResponse = JSON.parse(wrapped.stdout);
      } catch {}
    }
    return wrapped;
  });
  try {
    const { walkProject } = require('./gh.cjs');
    const result = walkProject('PVT_kwDODwqLrc4BRsOP');
    assert.ok(result.items.length > 0, `expected at least 1 item, got ${result.items.length}`);
    // Write cassette
    if (recordedResponse) {
      const cassetteDir = path.dirname(cassetteRel);
      if (!fs.existsSync(cassetteDir)) fs.mkdirSync(cassetteDir, { recursive: true });
      fs.writeFileSync(cassetteRel, JSON.stringify(recordedResponse, null, 2) + '\n');
    }
  } finally { _setRunGh(null); }
});

// Group CR — cassette replay (default test run, no env required)
test('CR1: cassette file exists with expected shape', () => {
  if (!fs.existsSync(cassetteRel)) {
    return; // Skip if cassette not yet captured (first-run before TRD 02-07 lands fully)
  }
  const c = JSON.parse(fs.readFileSync(cassetteRel, 'utf-8'));
  assert.ok(c && c.data && c.data.node, 'cassette missing data.node');
  assert.ok(Array.isArray(c.data.node.items.nodes), 'cassette missing items.nodes array');
});

test('CR2: replaying cassette via _setRunGh returns expected shape', () => {
  if (!fs.existsSync(cassetteRel)) return;
  const cassetteContent = fs.readFileSync(cassetteRel, 'utf-8');
  _setRunGh(() => ({ ok: true, status: 0, stdout: cassetteContent, stderr: '' }));
  try {
    const { walkProject } = require('./gh.cjs');
    const result = walkProject('PVT_kwDODwqLrc4BRsOP');
    assert.ok(Array.isArray(result.items));
    assert.ok(result.items.length > 0);
    assert.ok(['issue', 'draft'].includes(result.items[0].item_type));
  } finally { _setRunGh(null); }
});

test('CR3: scanOrg with cassette replay returns enriched items', () => {
  if (!fs.existsSync(cassetteRel)) return;
  const cassetteContent = fs.readFileSync(cassetteRel, 'utf-8');
  // Mock both auth + walk
  _setRunGh((args) => {
    if (args[0] === 'auth' && args[1] === 'status') {
      return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    }
    return { ok: true, status: 0, stdout: cassetteContent, stderr: '' };
  });
  try {
    const result = scanOrg();
    assert.ok(Array.isArray(result.items));
    assert.ok(result.items.length > 0);
    // Verify sub_issues_source field is set per item
    for (const item of result.items) {
      assert.ok(['tracked_issues', 'task_list', 'none'].includes(item.sub_issues_source));
    }
  } finally { _setRunGh(null); }
});
```

Run `npm test`. Expected: L1/L2 may pass IF prior waves got the export surface right; CT1-CT3 should pass; IT1-IT2 SKIP without env; OT1 SKIPS; CR1-CR3 SKIP IF cassette absent.

If L1 fails due to surface drift, that's a Task-2 fix (update module.exports to match expected list).

Commit RED:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "test(02-07): add library surface lock + integration + cassette replay tests" \
  --files plugins/devflow/devflow/bin/lib/awareness.test.cjs
```

# CRITICAL: OT1's cassette-write logic is the trickiest part. The recording wrapper around _setRunGh captures the response (or first response on multi-page) and writes to disk. Run this only with GH_INTEGRATION=1 + valid auth. The captured cassette becomes the basis for CR1-CR3 in default tests.
# GOTCHA: The expected-export list (L1) MUST match exactly what TRDs 02-01..02-06 added. If L1 fails, FIX the awareness.cjs module.exports in Task 2; don't lower the bar in the test.
# PATTERN: Mirror obj 1's TRD 01-06 cassette pattern: capture-mode test (gated) + replay-mode tests (default).
  </action>
  <verify>
1. `npm test` shows new tests added (some passing, some skipping based on env)
2. RED commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ test\(02-07\):'`
3. Test file references the cassette path: `grep -q product-roadmap-walk.json plugins/devflow/devflow/bin/lib/awareness.test.cjs`
  </verify>
  <done>
Test additions committed. Tests run; gating works (skip without env).
  </done>
  <recovery>
If recording wrapper logic in OT1 is too fragile, replace with a manual capture script: write a small `scripts/capture-product-roadmap.cjs` that calls walkProject with real gh and writes the cassette. Run once manually, commit the result, and OT1 simplifies to a smoke check (`assert.ok(items.length > 0)`).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — finalize awareness.cjs module.exports + capture cassette (if GH_INTEGRATION=1)</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness.cjs
    plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json
  </files>
  <action>
**Step A — Lock the awareness.cjs module.exports:**

Read awareness.cjs. Verify the existing exports — they should already match the expected 14 from TRDs 02-01..02-06. If any are missing or extra, fix the module.exports block at the bottom of awareness.cjs:

```js
module.exports = {
  // Pure logic:
  parseStateMd,
  aggregateOrgByProductQuarter,
  parseTaskListFallback,

  // Scanners:
  scanPeer,
  scanOrg,

  // Cache:
  readCache,
  writeCache,
  isStale,

  // Test hooks:
  _setRunGit,
  _resetGitMock,

  // Constants:
  AWARENESS_CACHE_REL,
  DEFAULT_TTL_MINUTES,
  DEFAULT_STALE_DAYS,
  DEFAULT_BRANCH_PATTERNS,
};
```

Run `npm test`. L1 must pass with the lock. CT1-CT3 should pass. IT/OT/CR groups skip cleanly without env vars.

**Step B — Capture the cassette (manual / one-time step requiring GH auth):**

If you have `GH_INTEGRATION=1` + scopes available locally:

```bash
GH_INTEGRATION=1 npm test 2>&1 | grep -i "OT1\|cassette" || echo "OT1 may have run silently"
ls plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json
```

If the cassette captured, verify content:
```bash
node -e 'const c=JSON.parse(require("fs").readFileSync("plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json","utf-8")); console.log("items:", c.data.node.items.nodes.length)'
```

Expected: items count ≥ 9 (matches spike findings — 9 real [Roadmap] issues; may be more if drafts captured in same page).

**If GH_INTEGRATION env not available** (executor runs without auth):
1. Create a placeholder cassette stub:
```json
{
  "_placeholder": true,
  "_note": "Cassette not yet captured. Run `GH_INTEGRATION=1 npm test` with valid auth to populate. CR1-CR3 tests will skip until then.",
  "data": { "node": { "items": { "pageInfo": { "hasNextPage": false, "endCursor": null }, "nodes": [] } } }
}
```
2. CR1-CR3 tests guard with `if (!fs.existsSync(cassetteRel)) return;` AND `if (cassette._placeholder) return;`. Update the test guard to skip placeholders:

```js
test('CR2: replaying cassette via _setRunGh', () => {
  if (!fs.existsSync(cassetteRel)) return;
  const cassetteContent = fs.readFileSync(cassetteRel, 'utf-8');
  const parsed = JSON.parse(cassetteContent);
  if (parsed._placeholder) return; // skip until real cassette captured
  // ... rest
});
```

Document the placeholder in the SUMMARY: "Cassette is a placeholder — capture by running `GH_INTEGRATION=1 npm test -- --grep OT1` once with valid auth scopes."

Commit GREEN:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "feat(02-07): lock awareness.cjs export surface + capture product-roadmap cassette" \
  --files plugins/devflow/devflow/bin/lib/awareness.cjs plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json
```

If the cassette is a placeholder, commit message:
```
feat(02-07): lock awareness.cjs export surface + add cassette placeholder
```
And add a SESSION_PICKUP.md note: "Run GH_INTEGRATION=1 npm test once to capture real cassette."

# CRITICAL: L1 is the gate test. If it fails after Task 2, the export surface drifted vs the locked list. Fix awareness.cjs module.exports — don't fix the test.
# GOTCHA: Cassette MUST be valid JSON regardless of placeholder status. Tests gate on _placeholder field, not on file absence.
# PATTERN: Match obj 1's cassette format — single GraphQL response object with `data` envelope, pretty-printed JSON.
  </action>
  <verify>
1. `npm test` passes ALL Task-1 tests (L1, L2, CT1-CT3 always; IT/OT/CR depending on env + cassette presence)
2. GREEN commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ feat\(02-07\):'`
3. Cassette file exists: `test -f plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json`
4. Cassette is valid JSON: `node -e 'JSON.parse(require("fs").readFileSync("plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json","utf-8")); console.log("OK")'`
5. Module surface verified: the L1 verification command in this TRD's frontmatter passes
  </verify>
  <done>
Export surface locked at 14 entries. Cassette committed (real OR placeholder). All Task-1 tests pass per their gating semantics.
  </done>
  <recovery>
If GH_INTEGRATION=1 fails for the executor (auth not available in the agent's context), commit the placeholder cassette + add a TODO in SESSION_PICKUP.md asking the user to run capture manually. Don't block this TRD on auth — placeholder is a valid v1.1 ship state per CONTEXT.md `_captured: false` precedent in obj 1's PRODUCT_ROADMAP_FIELDS.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After all tasks ship:

1. `lib/awareness.cjs` module.exports contains EXACTLY 14 entries (asserted via L1)
2. Cache round-trip works (CT1-CT3)
3. Peer integration tests pass with GIT_INTEGRATION=1 (IT1, IT2)
4. Org integration test passes with GH_INTEGRATION=1 (OT1) — cassette captured
5. Default test run: cassette replay works (CR1-CR3) IF cassette is real (not placeholder); skip if placeholder
6. Total `npm test` count rises by ~14 (with skips counted as pass-with-skip)
7. Two atomic commits: `test(02-07):` + `feat(02-07):`
8. SC-9 fully met: stable library surface (14 exports asserted)
9. SC-10 fully met: round-trip integration tests gated on GIT_INTEGRATION + GH_INTEGRATION
</verification>

<success_criteria>
- SC-9 fully met: `lib/awareness.cjs` exports the 14-entry surface (parseStateMd, aggregateOrgByProductQuarter, scanPeer, scanOrg, parseTaskListFallback, readCache, writeCache, isStale, _setRunGit, _resetGitMock, 4 constants)
- SC-10 fully met: peer integration test (GIT_INTEGRATION=1) + org integration test (GH_INTEGRATION=1) + cassette replay (default)
- 2 atomic commits per TDD Playbook
- Test list (14 cases) implemented per TDD Playbook habit 2
- Objective 2 COMPLETE — all 10 SC met across waves 1-7
</success_criteria>

<output>
After completion, create `.planning/objectives/02-cross-repo-awareness-layer/02-07-library-export-and-integration-SUMMARY.md`
</output>

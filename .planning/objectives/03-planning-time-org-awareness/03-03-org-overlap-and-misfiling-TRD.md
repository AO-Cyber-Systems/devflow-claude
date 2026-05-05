---
objective: 03-planning-time-org-awareness
trd: 03-03
title: scanOrgOverlap + misfiling detection (graceful auth degradation)
type: tdd
confidence: high
wave: 3
depends_on: [03-01, 03-02]
files_modified:
  - plugins/devflow/devflow/bin/lib/org-awareness.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
autonomous: true
requirements: [SC-5, SC-6]
verification_commands:
  - "npm test -- --grep 'scanOrgOverlap|misfiling|org-overlap'"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/org-awareness.cjs\"); if(typeof a.scanOrgOverlap!==\"function\") throw new Error(\"scanOrgOverlap not exported\"); console.log(\"OK\");'"
  - "node ./plugins/devflow/devflow/bin/df-tools.cjs org-awareness scan-org-overlap 03 --raw 2>&1 | head -1"

must_haves:
  truths:
    - "scanOrgOverlap(opts) calls awareness.scanOrg() inside try/catch — on GhAuthError returns `{ items: [], warnings: [...], skipped: true, misfiling: null }` (does NOT throw)"
    - "scanOrgOverlap re-throws non-auth errors (so true bugs surface; only auth failure is gracefully degraded per locked decision #8)"
    - "Top-N selection: items scored by (a) chain-match boost +10 if any sub-issue ref's repo matches a sibling repo, (b) +1 per shared keyword between item title/body tokens and current objective tokens"
    - "Result `items` array has shape `{ issue_ref, title, score, matched_keywords: [], chain_match: bool }`, top TOP_N (3), sorted by score desc"
    - "misfiling detection: when gh.resolveChain's resolved roadmap_issue is in a different repo than current PROJECT.md github_repo, returns `misfiling: { current_repo, resolved_repo, message }`; else `misfiling: null`"
    - "misfiling detection skipped silently when current PROJECT.md lacks github_repo (no false-positive warnings)"
    - "misfiling detection is ADVISORY ONLY — no AskUserQuestion, no hard fail, no checkpoint"
    - "scanOrgOverlap reuses obj 2's `awareness.scanOrg` (does NOT call walkProject directly) and obj 1's `gh.resolveChain` + `gh.requireGhAuth` indirectly"
    - "Tests use obj 1's `gh._setRunGh()` injection to mock GraphQL responses (no live network)"
    - "Tests verify graceful auth degradation: mock requireGhAuth throws GhAuthError → scanOrgOverlap returns skipped:true with non-empty warnings"
    - "df-tools org-awareness scan-org-overlap CLI replaces 03-01 stub; emits structured JSON with skipped flag visible to caller"
    - "All new tests follow RED → GREEN: test commit precedes feat commit per TDD Playbook habit 3"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      provides: "scanOrgOverlap + helpers (`_scoreOrgItem`, `_detectMisfiling`). Extends partial module.exports."
      exports: ["scanOrgOverlap"]
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.test.cjs"
      provides: "Test groups OO (scanOrgOverlap end-to-end), MF (misfiling detection), AD (auth degradation)."
      contains: "scanOrgOverlap"
    - path: "plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs"
      provides: "cmdOrgAwarenessScanOrgOverlap implementation replacing the 03-01 placeholder stub."
      contains: "oa.scanOrgOverlap"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      provides: "Extended buildOrgScanResult helper (or new buildOrgOverlapFixture) producing canned scanOrg output for testing."
      contains: "buildOrgOverlapFixture"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/org-awareness.cjs::scanOrgOverlap"
      to: "plugins/devflow/devflow/bin/lib/awareness.cjs::scanOrg"
      via: "Reuse obj 2's org scanner"
      pattern: "aw\\.scanOrg|awareness\\.scanOrg"
    - from: "plugins/devflow/devflow/bin/lib/org-awareness.cjs::scanOrgOverlap"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::resolveChain"
      via: "Misfiling detection chain walk"
      pattern: "gh\\.resolveChain"
    - from: "plugins/devflow/devflow/bin/lib/org-awareness.cjs::scanOrgOverlap"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::GhAuthError"
      via: "try/catch e.name === 'GhAuthError'"
      pattern: "GhAuthError"
---

<objective>
Add the org-Project overlap scanner + misfiling detection to `lib/org-awareness.cjs`. This is the third signal source for `## Cross-Repo Considerations`. Reuses obj 2's `scanOrg` (which composes obj 1's `walkProject` + `requireGhAuth`) — no new GraphQL primitives.

**Critical inversion of the obj 1/obj 2 hard-fail-on-auth pattern:** `scanOrgOverlap` MUST gracefully degrade on `GhAuthError` (return `skipped: true` with helpful warning), NOT propagate the error. Plan-time consultation is advisory; missing gh auth means missing one of three signal sources, not a planning failure (CONTEXT.md locked decision #8).

Misfiling detection compares the resolved `roadmap_issue` repo (via `gh.resolveChain`) against the current PROJECT.md `github_repo`. Mismatch → one-line advisory in the rendered section. **Advisory only** — no AskUserQuestion, no hard fail (CONTEXT.md locked decision #7).

Output:
1. `scanOrgOverlap(opts)` function in `lib/org-awareness.cjs` (region: scanOrgOverlap)
2. Helpers `_scoreOrgItem` and `_detectMisfiling`
3. Test cases per Test list (Groups OO + MF + AD)
4. CLI wiring replaces 03-01 stub
5. Fixture builder for canned scanOrg results (extends awareness-fixtures.cjs)
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── org-awareness.cjs                  ← MODIFY  (add scanOrgOverlap region)
├── org-awareness.test.cjs             ← MODIFY  (add Groups OO + MF + AD)
├── org-awareness-cli.cjs              ← MODIFY  (replace scan-org-overlap stub)
└── __fixtures__/
    └── awareness-fixtures.cjs         ← MODIFY  (add buildOrgOverlapFixture if needed)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Graceful auth degradation pattern** — `lib/awareness-cli.cjs::cmdAwarenessShow` (obj 2 ship):

```js
try {
  sections.org = aw.scanOrg();
  aw.writeCache(cwd, { org: sections.org });
} catch (e) {
  if (e && e.name === 'GhAuthError') {
    if (flags.org_only || !sections.peer) {
      // Hard-fail when org-only requested
      process.stderr.write(JSON.stringify({ ... }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    // Soft-fail: render with warning
    sections.org = {
      items: [],
      warnings: [`org section unavailable: ${e.message}. Run: ${e.remediation}`],
    };
  } else {
    throw e;
  }
}
```

**For obj 3, the HARD-FAIL path is REMOVED.** Always soft-fail at scanOrgOverlap level — let the caller (skill) decide what to do. The skill's behavior per locked decision #8: render the section with a `_(skipped: gh auth not available — run gh auth refresh ...)_` line.

**resolveChain return shape** — from obj 1:

```js
{
  objective: '03-planning-time-org-awareness',
  github_issue: 'AO-Cyber-Systems/devflow-claude#12',
  parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
  roadmap_issue: 'AO-Cyber-Systems/devflow-claude#9',  // walked-from-parent
  org_initiative: null,
  org_project: 'PVT_kwDODwqLrc4BRsOP',
  milestone: { ... },
  provenance: { ... },
  warnings: [],
}
```

For misfiling: parse `roadmap_issue` ref (`AO-Cyber-Systems/devflow-claude#9`) → extract repo (`AO-Cyber-Systems/devflow-claude`) → compare against `projectCtx.github_repo`.

**scanOrg return shape** — from obj 2:

```js
{
  items: [
    {
      item_type: 'issue',
      issue_ref: 'AO-Cyber-Systems/aodex#33',
      title: '[Roadmap] Go Backend Migration',
      body: '... prose deliverables ...',
      product: 'AODex',
      quarter: 'Q2 2026',
      status: 'In Progress',
      sub_issues: [{ ref, title, state }, ...],
      sub_issues_source: 'tracked_issues' | 'task_list' | 'none',
    },
    // ...
  ],
  fetched_at: '...',
  project_id: 'PVT_kwDODwqLrc4BRsOP',
  warnings: [],
}
```

obj 3's scoring loops over these items, computing chain-match boost + keyword overlap.

**Fixture builders to reuse from obj 2** — `awareness-fixtures.cjs::buildOrgScanResult` (already exists). It returns the scanOrg shape. obj 3 may extend with a more focused `buildOrgOverlapFixture` for tests, OR reuse `buildOrgScanResult` directly via fixture composition.

</codebase_examples>

<anti_patterns>

- **DO NOT call `gh.requireGhAuth` directly.** Let `aw.scanOrg` call it (it already does). Catch `GhAuthError` from the `aw.scanOrg` call.
- **DO NOT call `gh.walkProject` directly.** That's obj 2's territory; obj 3 composes `aw.scanOrg`.
- **DO NOT throw on a missing `projectCtx.github_repo`.** Misfiling check is silently skipped per CONTEXT.md locked decision #7.
- **DO NOT use AskUserQuestion or any blocking prompt.** Misfiling is rendered advisory text in CONTEXT.md, not a checkpoint.
- **DO NOT mutate the result of `scanOrg`.** Treat as read-only; build new objects when scoring.
- **DO NOT re-implement `resolveChain`.** Call it via `gh.resolveChain(frontmatter, projectCtx)`.

</anti_patterns>

<error_recovery>

- **`aw.scanOrg` throws `GhAuthError`** → catch, return `{ items: [], warnings: [`org-overlap unavailable: ${e.message}. Run: ${e.remediation}`], skipped: true, misfiling: null }`.
- **`aw.scanOrg` throws other Error** → re-throw (don't swallow real bugs).
- **`gh.resolveChain` returns warnings array but no error** → record warnings in scanOrgOverlap's warnings; continue.
- **`gh.resolveChain` itself throws** (e.g., GhAuthError during chain walk) → catch + record warning; misfiling check skipped (set `misfiling: null`); continue with whatever items scanOrg returned.
- **Empty items array from scanOrg** (project has 0 items the user can see) → return empty `items` with `skipped: false` (the scan ran, it just found nothing relevant to score).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/03-planning-time-org-awareness/03-CONTEXT.md
@.planning/objectives/03-planning-time-org-awareness/03-RESEARCH.md
@.planning/objectives/01-github-coordination-layer/01-CONTEXT.md
@.planning/objectives/02-cross-repo-awareness-layer/02-CONTEXT.md

# Modules to extend / consume:
@plugins/devflow/devflow/bin/lib/org-awareness.cjs
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/gh.cjs
</context>

<research_context>

From parent research (`.planning/research/github-coordination-layer.md` §"Misfiling reconciliation"):

> devflow-claude objectives that should move:
> | # | Objective | Real home | Action |
> | 01 | aodex-agent-control-plane | aodex | Move ... |
> | 02 | port-acp-to-go | aodex | Duplicate ... |

These are the kinds of misfilings the detector catches. Spike found 6 misfiled objectives in this repo. Detector compares chain-resolved repo vs filesystem repo.

From obj 1 §"Hard-fail on missing/expired auth": `gh resolve` and `gh sync` HARD FAIL on missing scopes. **Obj 3 inverts this** for plan-time advisory consumption — locked decision #8.

</research_context>

<gotchas>

- **Repo extraction from issue ref** — `AO-Cyber-Systems/devflow-claude#9` → `AO-Cyber-Systems/devflow-claude`. Split on `#`, take the first part. Strip leading `https://github.com/` if present (paranoid handling).
- **Shorthand refs in resolveChain output** — should not appear (resolveChain expands shorthand internally). But if a `#9`-only ref appears, treat as same-repo and skip misfiling check (no mismatch is possible).
- **Project memory `feedback_planner_proto_conflict`** — file-level co-modification of `lib/org-awareness.cjs`. THIS TRD is solo in Wave 3 — no parallel TRDs touch the same file. The CONTEXT.md wave structure handles this.
- **`gh._setRunGh` mock pattern** — to test the GhAuthError path, inject a mock that throws when GraphQL is called:
```js
gh._setRunGh(() => { const e = new Error('Auth failed'); e.name = 'GhAuthError'; e.remediation = 'gh auth refresh -h github.com -s project'; e.scopes_missing = ['project']; throw e; });
```
Or, since `aw.scanOrg` calls `requireGhAuth` BEFORE walkProject, we can mock `gh.requireGhAuth` to throw. Use whichever is simpler.

- **Test ordering — set _setRunGh before scanOrgOverlap call, reset after** in `t.afterEach` or finally block. Mirror obj 2's test pattern.

</gotchas>

## Test list

Per CLAUDE.md TDD Playbook habit 2.

### Group SOI (scoreOrgItem helper — pure logic)
- SOI1: chain-match (sub-issue ref repo == sibling repo) → +10 base score
- SOI2: keyword-only overlap (no chain match, 3 shared tokens) → score 3
- SOI3: both chain-match + keyword overlap → score 10 + tokens
- SOI4: empty sub_issues → no chain match contribution
- SOI5: no shared keywords AND no chain match → score 0

### Group MF (misfiling detection — `_detectMisfiling`)
- MF1: resolved roadmap_issue repo matches current github_repo → returns null
- MF2: resolved roadmap_issue repo differs from current github_repo → returns `{ current_repo, resolved_repo, message }`
- MF3: current github_repo absent (null/empty) → returns null (no false positive)
- MF4: roadmap_issue absent in resolveChain output → returns null
- MF5: roadmap_issue is shorthand `#9` (theoretically — should not occur per resolveChain contract) → treat as same-repo, return null

### Group OO (scanOrgOverlap end-to-end)
- OO1: happy path — scanOrg returns 5 items, current objective tokens overlap with 2, sibling repos array contains 1 chain match → returns top-3 with that chain-match item ranked first
- OO2: GhAuthError from scanOrg → returns `{ items: [], warnings: [...], skipped: true, misfiling: null }`
- OO3: non-auth Error from scanOrg → re-thrown (test asserts assert.throws)
- OO4: empty items from scanOrg (e.g., user can't see any project items) → returns empty items, skipped: false
- OO5: chain match boost — score-1 keyword item beats score-3 keyword item if score-1 has chain match (+10 vs +3 keywords)
- OO6: top-N truncation — 7 scoring items → returns 3
- OO7: scanOrgOverlap composes both scoring and misfiling — output has both `items` and `misfiling` keys
- OO8: when misfiling check itself errors (resolveChain throws GhAuthError mid-walk), scanOrgOverlap still returns items and sets misfiling: null + warning

### Group AD (auth degradation specific)
- AD1: mock gh.requireGhAuth to throw GhAuthError → aw.scanOrg propagates → scanOrgOverlap catches → returns skipped:true
- AD2: warning text in skipped result includes the remediation command
- AD3: skipped result still has `misfiling` key (null) for shape consistency

### Group CLI3 (CLI wiring)
- CLI3-1: `df-tools org-awareness scan-org-overlap 03 --raw` returns parseable JSON
- CLI3-2: under mocked auth failure, CLI returns exit 0 (not 1) — graceful degradation surfaces in JSON, not exit code

<tasks>

<task type="auto">
  <name>Task 1: RED — failing tests for scanOrgOverlap, _detectMisfiling, _scoreOrgItem, AD path</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  </files>
  <action>
**RED PHASE.**

**Part 1: Optionally extend awareness-fixtures.cjs** with buildOrgOverlapFixture if reuse of buildOrgScanResult needs more configurability. Otherwise reuse buildOrgScanResult directly.

Recommended extension (keep small):

```js
function buildOrgOverlapFixture({
  items_count = 3,
  sibling_repos = ['AO-Cyber-Systems/aodex'],
  matching_keywords_per_item = [],  // e.g. [['parse','state'], [], ['auth']]
  chain_matches = [],  // e.g. [0, 2] — indices of items whose sub_issues contain sibling refs
} = {}) {
  // Build a minimal scanOrg-shaped result with controllable scoring inputs
  const items = [];
  for (let i = 0; i < items_count; i++) {
    const subs = [];
    if (chain_matches.includes(i)) {
      subs.push({ ref: `${sibling_repos[0]}#${100+i}`, title: 'sub', state: 'OPEN' });
    }
    const kws = matching_keywords_per_item[i] || [];
    items.push({
      item_type: 'issue',
      issue_ref: `AO-Cyber-Systems/devflow-claude#${50+i}`,
      title: ['[Roadmap]', ...kws].join(' ') || `[Roadmap] item ${i}`,
      body: kws.join(' '),
      product: 'DevFlow',
      quarter: 'Q2 2026',
      status: 'In Progress',
      sub_issues: subs,
      sub_issues_source: subs.length ? 'tracked_issues' : 'none',
    });
  }
  return { items, fetched_at: new Date().toISOString(), project_id: 'PVT_test', warnings: [] };
}
```

Add to module.exports.

**Part 2: Append test groups SOI, MF, OO, AD, CLI3 to org-awareness.test.cjs.**

Critical patterns:

```js
// Mock awareness.scanOrg to return a fixture
const aw = require('./awareness.cjs');
const gh = require('./gh.cjs');

// Save originals for restoration
const origScanOrg = aw.scanOrg;

// Group OO
test('OO1 — chain-match item ranked first', () => {
  const fixture = fix.buildOrgOverlapFixture({
    items_count: 3,
    sibling_repos: ['AO-Cyber-Systems/aodex'],
    matching_keywords_per_item: [['unrelated'], ['parse', 'state'], ['parse']],
    chain_matches: [0],  // item 0 has sub-issue in aodex
  });
  // Monkey-patch: temporarily replace aw.scanOrg
  aw.scanOrg = () => fixture;
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      sibling_repos: ['AO-Cyber-Systems/aodex'],
      current_tokens: new Set(['parse', 'state']),
      frontmatter: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
      projectCtx: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    assert.strictEqual(r.skipped, false);
    assert.strictEqual(r.items.length, 3);
    // Item 0 (chain match) should be first despite weaker keyword overlap
    assert.strictEqual(r.items[0].issue_ref, fixture.items[0].issue_ref);
    assert.strictEqual(r.items[0].chain_match, true);
  } finally {
    aw.scanOrg = origScanOrg;
  }
});

test('OO2 — GhAuthError → skipped:true with warning', () => {
  aw.scanOrg = () => {
    const e = new Error('Authentication failed: missing scope project');
    e.name = 'GhAuthError';
    e.remediation = 'gh auth refresh -h github.com -s project,read:project,repo';
    e.scopes_missing = ['project'];
    throw e;
  };
  try {
    const r = oa.scanOrgOverlap({
      objective_id: '03',
      frontmatter: {},
      projectCtx: {},
    });
    assert.strictEqual(r.skipped, true);
    assert.deepStrictEqual(r.items, []);
    assert.ok(r.warnings.some(w => /gh auth refresh/.test(w)));
    assert.strictEqual(r.misfiling, null);
  } finally {
    aw.scanOrg = origScanOrg;
  }
});

test('OO3 — non-auth Error re-thrown', () => {
  aw.scanOrg = () => { throw new Error('disk full'); };
  try {
    assert.throws(() => oa.scanOrgOverlap({ objective_id: '03', frontmatter: {}, projectCtx: {} }), /disk full/);
  } finally {
    aw.scanOrg = origScanOrg;
  }
});

// Group MF
test('MF1 — same repo, no misfiling', () => {
  const r = oa._detectMisfiling(
    { roadmap_issue: 'AO-Cyber-Systems/devflow-claude#9' },
    { github_repo: 'AO-Cyber-Systems/devflow-claude' }
  );
  assert.strictEqual(r, null);
});

test('MF2 — different repo, misfiling reported', () => {
  const r = oa._detectMisfiling(
    { roadmap_issue: 'AO-Cyber-Systems/aodex#33' },
    { github_repo: 'AO-Cyber-Systems/devflow-claude' }
  );
  assert.ok(r);
  assert.strictEqual(r.current_repo, 'AO-Cyber-Systems/devflow-claude');
  assert.strictEqual(r.resolved_repo, 'AO-Cyber-Systems/aodex');
});

test('MF3 — current github_repo absent → null (no false positive)', () => {
  const r = oa._detectMisfiling(
    { roadmap_issue: 'AO-Cyber-Systems/aodex#33' },
    { github_repo: null }
  );
  assert.strictEqual(r, null);
});

// ... MF4, MF5

// Group SOI
test('SOI1 — chain match adds +10', () => {
  const item = {
    title: 'unrelated',
    body: '',
    sub_issues: [{ ref: 'AO-Cyber-Systems/aodex#100', title: '', state: 'OPEN' }],
  };
  const score = oa._scoreOrgItem(item, new Set(), ['AO-Cyber-Systems/aodex']);
  assert.strictEqual(score.total, 10);
  assert.strictEqual(score.chain_match, true);
});

test('SOI2 — keyword overlap', () => {
  const item = {
    title: 'parse state markdown',
    body: '',
    sub_issues: [],
  };
  const score = oa._scoreOrgItem(item, new Set(['parse', 'state', 'markdown']), []);
  assert.strictEqual(score.total, 3);
  assert.strictEqual(score.chain_match, false);
});
// ... SOI3-SOI5
```

# CRITICAL: After tests, do NOT reset aw.scanOrg as a module reference if it's read-only — but in CommonJS modules export object IS the module surface; reassigning `aw.scanOrg = newFn` mutates the cached module. Test patterns must restore in finally blocks.

**Commit RED:**
```bash
git add plugins/devflow/devflow/bin/lib/org-awareness.test.cjs plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
git commit -m "test(03-03): add failing tests for scanOrgOverlap + misfiling + auth degradation

RED phase: scanOrgOverlap / _detectMisfiling / _scoreOrgItem not yet implemented.
Tests cover happy path, GhAuthError graceful degradation, non-auth re-throw,
misfiling detection (matching/mismatching/missing-repo), and chain-match scoring.

buildOrgOverlapFixture helper added per TDD Playbook habit 4."
```
  </action>
  <verify>
- `npm test 2>&1 | grep -E 'OO\\d|MF\\d|SOI\\d|AD\\d|CLI3-' | head -30` — new tests fail with TypeError or undefined-function errors.
- buildOrgOverlapFixture loadable from awareness-fixtures.cjs without error.
  </verify>
  <done>
test commit lands. RED tests fail expectedly. Fixture sanity passes.
  </done>
  <recovery>
If monkey-patching `aw.scanOrg` doesn't take effect: ensure both production and test code import the SAME `awareness.cjs` module path. Node caches modules by resolved path; `require('./awareness.cjs')` from `org-awareness.cjs` returns the same object as `require('./awareness.cjs')` from the test.
If the test mock leaks across tests: use `t.afterEach(() => { aw.scanOrg = origScanOrg; })`.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement scanOrgOverlap + helpers + CLI wiring</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.cjs
    plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
  </files>
  <action>
**GREEN PHASE.**

**Part 1: Add scanOrgOverlap region to lib/org-awareness.cjs** (insert AFTER scanLibs region, BEFORE module.exports).

```js
// ─── TRD 03-03: scanOrgOverlap + misfiling detection ──────────────────────────

const aw = require('./awareness.cjs');
const gh = require('./gh.cjs');

function _extractRepoFromRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const cleaned = ref.replace(/^https:\/\/github\.com\//, '');
  const idx = cleaned.indexOf('#');
  if (idx <= 0) return null;
  return cleaned.slice(0, idx);
}

function _detectMisfiling(chain, projectCtx) {
  if (!projectCtx || !projectCtx.github_repo) return null;
  if (!chain || !chain.roadmap_issue) return null;
  const resolvedRepo = _extractRepoFromRef(chain.roadmap_issue);
  if (!resolvedRepo) return null;
  if (resolvedRepo === projectCtx.github_repo) return null;
  return {
    current_repo: projectCtx.github_repo,
    resolved_repo: resolvedRepo,
    message: `this objective's resolved [Roadmap] is in '${resolvedRepo}' but current repo is '${projectCtx.github_repo}'. Possible misfile — consider whether this objective belongs in '${resolvedRepo}' instead.`,
  };
}

function _scoreOrgItem(item, currentTokens, siblingRepos) {
  const out = { total: 0, chain_match: false, matched_keywords: [] };
  const subs = Array.isArray(item.sub_issues) ? item.sub_issues : [];
  for (const s of subs) {
    const repo = _extractRepoFromRef(s.ref);
    if (repo && siblingRepos.includes(repo)) {
      out.chain_match = true;
      out.total += 10;
      break;
    }
  }
  // Keyword overlap on title + body
  if (currentTokens && currentTokens.size > 0) {
    const itemTokens = _tokenize([item.title || '', item.body || ''].join(' '));
    for (const t of currentTokens) {
      if (itemTokens.has(t)) {
        out.total += 1;
        out.matched_keywords.push(t);
      }
    }
  }
  return out;
}

function scanOrgOverlap({
  objective_id,
  current_tokens = new Set(),
  sibling_repos = [],
  frontmatter = {},
  projectCtx = {},
} = {}) {
  const out = {
    items: [],
    warnings: [],
    skipped: false,
    misfiling: null,
  };

  // 1. Run org scan with auth-degradation guard
  let scanResult = null;
  try {
    scanResult = aw.scanOrg();
  } catch (e) {
    if (e && e.name === 'GhAuthError') {
      out.skipped = true;
      out.warnings.push(`org-overlap unavailable: ${e.message}. Run: ${e.remediation || 'gh auth refresh -h github.com -s project,read:project,repo'}`);
      return out;  // misfiling stays null
    }
    throw e;
  }

  // 2. Score items
  out.warnings.push(...(scanResult.warnings || []));
  const scored = (scanResult.items || []).map(item => {
    const score = _scoreOrgItem(item, current_tokens, sibling_repos);
    return {
      issue_ref: item.issue_ref || null,
      title: item.title || '',
      score: score.total,
      matched_keywords: score.matched_keywords,
      chain_match: score.chain_match,
    };
  });
  scored.sort((a, b) => (b.score - a.score) || ((a.title || '').localeCompare(b.title || '')));
  out.items = scored.slice(0, TOP_N);

  // 3. Misfiling check (with its own try/catch since resolveChain may throw)
  try {
    const chain = gh.resolveChain(frontmatter, projectCtx);
    out.misfiling = _detectMisfiling(chain, projectCtx);
  } catch (e) {
    out.warnings.push(`misfiling check skipped: ${e.message}`);
    out.misfiling = null;
  }

  return out;
}
```

Update module.exports:
```js
module.exports = {
  scanSiblings,
  scanLibs,
  scanOrgOverlap,        // NEW (TRD 03-03)
  _detectMisfiling,      // NEW
  _scoreOrgItem,         // NEW
  _extractRepoFromRef,   // NEW
  _setRunFs,
  _resetFsMock,
  _tokenize,
  _score,
  _camelSplit,
  _parseExports,
  _resolveEdenLibsPath,
  TOP_N,
  SUMMARY_RECENCY_DAYS,
  DEFAULT_SIBLING_GLOB,
  DEFAULT_EDEN_LIBS_PATH,
};
```

**Part 2: Replace stub in lib/org-awareness-cli.cjs:**

```js
function cmdOrgAwarenessScanOrgOverlap(cwd, args, raw) {
  const objective_id = args[0];
  if (!objective_id) {
    process.stderr.write('Usage: df-tools org-awareness scan-org-overlap <objective_id> [--raw]\n');
    process.exit(1);
    return;
  }
  // Read PROJECT.md frontmatter to populate projectCtx (best-effort)
  const fs = require('fs');
  const path = require('path');
  let projectCtx = {};
  let frontmatter = { github_issue: `#${objective_id}` };  // best-effort placeholder
  try {
    const projectMd = fs.readFileSync(path.join(cwd, '.planning', 'PROJECT.md'), 'utf-8');
    const { extractFrontmatter } = require('./frontmatter.cjs');
    const fm = extractFrontmatter(projectMd).frontmatter || {};
    projectCtx = { github_repo: fm.github_repo || null, org_project: fm.org_project || null };
  } catch { /* PROJECT.md missing — projectCtx stays empty; misfiling check returns null */ }
  const current_tokens = oa._tokenize(objective_id);
  const result = oa.scanOrgOverlap({
    objective_id,
    current_tokens,
    sibling_repos: [],  // CLI invocation provides empty sibling_repos; compose-with-scanSiblings happens at the considerations level (TRD 03-04)
    frontmatter,
    projectCtx,
  });
  // Even when skipped, exit 0 — graceful degradation surfaces in the JSON, not the exit code
  output(result, raw);
}
```

**Run tests:**
```bash
npm test 2>&1 | grep -E 'OO|MF|SOI|AD|CLI3' | tail -30
```

**Commit GREEN:**
```bash
git add plugins/devflow/devflow/bin/lib/org-awareness.cjs plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
git commit -m "feat(03-03): implement scanOrgOverlap + misfiling detection + graceful auth degradation

GREEN phase: lib/org-awareness.cjs gains scanOrgOverlap (composes obj 2's
scanOrg + obj 1's resolveChain) plus _scoreOrgItem (chain-match boost +
keyword overlap) and _detectMisfiling (advisory only; null when current
github_repo absent).

CRITICAL inversion of obj 1/obj 2 hard-fail-on-auth pattern: GhAuthError is
caught and surfaced as skipped:true with remediation in warnings. Plan-time
consultation must never block the planning workflow on missing gh auth
(CONTEXT.md locked decision #8).

CLI scan-org-overlap subcommand replaces 03-01 stub. Closes SC-5 + SC-6."
```
  </action>
  <verify>
- `npm test 2>&1 | tail -20` — full suite passes
- `node plugins/devflow/devflow/bin/df-tools.cjs org-awareness scan-org-overlap 03 --raw 2>&1 | head -20` — outputs JSON with `items`, `warnings`, `skipped`, `misfiling` keys (likely skipped:true unless gh auth is configured for the executing process)
- AD1+AD2 tests pass: GhAuthError mock → skipped:true with remediation in warnings
- OO1 test passes: chain-match item ranks first
- MF1+MF2+MF3 tests pass: misfiling detection respects shape contract
- Module exports include scanOrgOverlap, _detectMisfiling, _scoreOrgItem, _extractRepoFromRef
  </verify>
  <done>
feat commit lands. RED tests are GREEN. Module exports the new symbols. CLI subcommand returns valid JSON whether auth succeeds or fails. Misfiling detection accurate in same-repo / different-repo / missing-repo cases.
  </done>
  <recovery>
If `aw.scanOrg` cannot be monkey-patched in tests because of frozen module: in test setup, `Object.defineProperty(aw, 'scanOrg', { writable: true, configurable: true, value: mockFn });` then restore.
If the misfiling regex parses URLs incorrectly: tests MF1+MF2 will catch — add `/^https:\/\/github\.com\//` to the strip step.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none)</build>
</validation_gates>

<verification>
1. `npm test` passes (full suite + new tests).
2. `lib/org-awareness.cjs` exports `scanOrgOverlap`, `_detectMisfiling`, `_scoreOrgItem`, `_extractRepoFromRef` plus all earlier symbols.
3. `df-tools org-awareness scan-org-overlap 03 --raw` exits 0 with valid JSON whether or not gh auth is configured.
4. Mocked `GhAuthError` → result has `skipped: true`, non-empty warnings with remediation; exit code from CLI is 0.
5. Misfiling detection: same-repo → null; different-repo → object; missing-repo → null.
6. Chain-match scoring boost: +10 per locked decision; keyword overlap: +1 per shared token.
7. Top-N truncation honored (3 items max in result).
</verification>

<success_criteria>
- [ ] `lib/org-awareness.cjs` extended with scanOrgOverlap + helpers
- [ ] All Test list groups (SOI, MF, OO, AD, CLI3) implemented and passing
- [ ] `lib/org-awareness-cli.cjs` scan-org-overlap handler replaces 03-01 stub; exit 0 on graceful skip
- [ ] `awareness-fixtures.cjs` extended with buildOrgOverlapFixture (or equivalent)
- [ ] RED commit precedes GREEN commit
- [ ] SC-5 (top-3 org items + chain-match) verifiable via OO1+OO5
- [ ] SC-6 (misfiling detection one-liner) verifiable via MF1+MF2+MF3
</success_criteria>

<output>
After completion, create `.planning/objectives/03-planning-time-org-awareness/03-03-org-overlap-and-misfiling-SUMMARY.md`.
</output>

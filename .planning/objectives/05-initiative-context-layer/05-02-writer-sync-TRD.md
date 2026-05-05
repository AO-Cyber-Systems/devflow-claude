---
objective: 05-initiative-context-layer
trd: 05-02
type: tdd
confidence: high
wave: 2
depends_on:
  - 05-01
files_modified:
  - plugins/devflow/devflow/bin/lib/initiatives.cjs
  - plugins/devflow/devflow/bin/lib/initiatives.test.cjs
  - plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
  - plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
autonomous: true
requirements:
  - SC-1
  - SC-2
  - SC-3
must_haves:
  truths:
    - "df-tools initiatives sync walks org Product Roadmap and writes <slug>.md per qualifying item"
    - "Initiative files have locked YAML frontmatter (slug, github_issue, parent_project, key_repos, updated_at)"
    - "Initiative files have body sections in locked order: Why / Open Questions / Linked Sub-issues / Status"
    - "Re-running sync produces identical disk content modulo updated_at line"
    - "Atomic write: tmp file written + rename to dest; tmp is in same directory as dest"
    - "_qualifiesAsInitiative returns true for items with sub_issues OR title-prefix [Epic] OR draft+In Progress"
    - "syncInitiatives hard-fails on missing gh auth via requireGhAuth"
    - "--initiative <slug> mode syncs only the matching item; skips stale-deletion (not in this TRD anyway)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/initiatives.cjs"
      provides: "Writer region: syncInitiatives + _writeInitiativeFile + qualification + slug + render"
      contains: "syncInitiatives"
    - path: "plugins/devflow/devflow/bin/lib/initiatives.test.cjs"
      provides: "Writer test suite (Groups S/W/Q/SL/R/IM)"
      contains: "syncInitiatives"
    - path: "plugins/devflow/devflow/bin/lib/initiatives-cli.cjs"
      provides: "Real cmdInitiativesSync (replaces 05-01 stub)"
      contains: "syncInitiatives"
  key_links:
    - from: "lib/initiatives.cjs::syncInitiatives"
      to: "lib/gh.cjs::requireGhAuth"
      via: "first action: hard-fail auth"
      pattern: "requireGhAuth\\(\\["
    - from: "lib/initiatives.cjs::syncInitiatives"
      to: "lib/gh.cjs::walkProject"
      via: "primary GraphQL walk"
      pattern: "walkProject\\("
    - from: "lib/initiatives.cjs::_writeInitiativeFile"
      to: "fs.renameSync"
      via: "atomic tmp + rename"
      pattern: "renameSync"
---

<objective>
Implement the writer side of `lib/initiatives.cjs`: `syncInitiatives` orchestrator (composes obj 1's `requireGhAuth` + `walkProject` + obj 1's `PRODUCT_ROADMAP_FIELDS._project_id`), `_writeInitiativeFile` (atomic tmp + rename), `_qualifiesAsInitiative` (sub_issues OR `[Epic]` title prefix OR draft+In Progress), `_slugifyInitiativeTitle`, `_renderInitiativeMarkdown` (frontmatter + body sections in locked order), and `cmdInitiativesSync` (replacing the 05-01 stub).

Purpose: SC-1 (sync writer + qualification), SC-2 (locked schema), SC-3 (idempotency + atomic write). Stale deletion is OUT OF SCOPE for this TRD — handled by 05-03.
Output: Writer region in initiatives.cjs; real cmdInitiativesSync; new test groups.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── initiatives.cjs                            ← MODIFY (add writer region)
├── initiatives.test.cjs                       ← MODIFY (add S/W/Q/SL/R/IM groups)
├── initiatives-cli.cjs                        ← MODIFY (replace sync stub)
├── initiatives-cli.test.cjs                   ← MODIFY (flip CLI6 + add new sync tests)
└── __fixtures__/
    └── awareness-fixtures.cjs                 ← MODIFY (add buildWalkProjectMock helper)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**`syncObjective` orchestration pattern (from `lib/gh.cjs` TRD 01-04):**

```js
function syncObjective(objectiveId, projectRoot) {
  // 1. Hard-fail auth check
  requireGhAuth(['project', 'read:project', 'repo']);

  // 2. Read disk state
  const objPath = path.join(projectRoot, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    return { ok: false, error: `objective not found: ${objectiveId}`, warnings: [] };
  }
  // ... walk + write ...

  return { ok: true, ... };
}
```

Mirror this exact shape for `syncInitiatives`: requireGhAuth first, then orchestrate, then return structured result.

**`scanOrg` orchestration with walkProject (from `lib/awareness.cjs` TRD 02-03):**

```js
function scanOrg({ project_id } = {}) {
  // 1. Hard-fail auth
  gh.requireGhAuth(['project', 'read:project', 'repo']);
  // 2. Resolve default project_id
  const resolvedId = project_id || (gh.PRODUCT_ROADMAP_FIELDS && gh.PRODUCT_ROADMAP_FIELDS._project_id) || null;
  if (!resolvedId) {
    return { items: [], fetched_at: new Date().toISOString(), project_id: null, warnings: [...] };
  }
  // 3. Walk project items
  const walk = gh.walkProject(resolvedId);
  // 4. Per-item enrichment
  // ...
  return { items: enriched, fetched_at, project_id: resolvedId, warnings };
}
```

`syncInitiatives` follows the same shape (auth → resolve project_id → walkProject → enrich/qualify → write each → return structured result).

**Atomic write pattern (Node.js best practice):**

```js
const tmpPath = path.join(home, `.${slug}.md.tmp.${process.pid}`);
fs.writeFileSync(tmpPath, content, 'utf-8');
fs.renameSync(tmpPath, path.join(home, `${slug}.md`));
```

Tmp file MUST be in the same directory as dest (cross-filesystem rename is not atomic). The `.` prefix hides it during the brief in-flight window. Including `process.pid` prevents collision between concurrent syncs (rare but possible).

**Mock injection pattern (from obj 4 dup-detect tests):**

```js
init._setRunGh((args) => {
  // Mock the underlying gh CLI calls
  if (args[0] === 'auth' && args[1] === 'status') {
    return { ok: true, status: 0, stdout: "Token scopes: 'project', 'repo'", stderr: '' };
  }
  if (args[0] === 'api' && args[1] === 'graphql') {
    return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { ... } } } }), stderr: '' };
  }
  return { ok: false, status: 1, stdout: '', stderr: 'unmocked gh call' };
});
```

For `syncInitiatives` tests: mock `walkProject` indirectly by mocking `gh.runGh` via `_setRunGh`. Build cassette-style mock returns using `buildOrgScanResult`-style fixtures.

**Cassette pattern (from obj 1/2):** Live captures live in `__fixtures__/gh-cassettes/*.json`. For TRD 05-02 tests, use the existing `product-roadmap-walk.json` cassette as a deterministic walkProject fixture. Tests load it via `fs.readFileSync` and feed parsed JSON to `_setRunGh` mock.
</codebase_examples>

<anti_patterns>
- **DO NOT** implement stale-file deletion in this TRD. `_detectStaleInitiatives`, `_deleteStaleFile`, `_confirmDeleteStale`, `--force` flag, and readline prompt are owned by TRD 05-03.
- **DO NOT** call `gh issue view` or any per-issue `gh` API. Initiative qualification (CONTEXT.md decision #5) uses ONLY data already in `walkProject.items[]`. Per-item label fetching is deferred to v1.2.
- **DO NOT** add `unlinkSync` to `realFs`. That's owned by TRD 05-03.
- **DO NOT** reach into the `~/.claude/devflow/initiatives/` real home dir during tests. ALWAYS use a tmpdir injected via `home` parameter or `_setRunFs` mock.
- **DO NOT** alter the locked frontmatter field order in `_renderInitiativeMarkdown`. Order: slug, github_issue, parent_project, key_repos, updated_at.
- **DO NOT** alter the locked body section order. Order: # Title, ## Why, ## Open Questions, ## Linked Sub-issues, ## Status.
- **DO NOT** rename the constants. Names locked: `MAX_WHY_CHARS`, `MAX_QUESTIONS_BULLETS`, `MAX_SUBISSUES_LINES`, `MAX_FORMATTED_PLANNER_CHARS`.
- **DO NOT** lock the export surface in this TRD. Final export-lock is TRD 05-05.
</anti_patterns>

<error_recovery>
- **`requireGhAuth` throws GhAuthError:** caught by `cmdInitiativesSync`; emit structured JSON to stderr (`{ error, remediation, scopes_missing }`) + exit(1). Mirror `cmdGhSyncObjective` (gh.cjs TRD 01-04) and `cmdOrgAwarenessOrgOverlap` (org-awareness TRD 03-03).
- **`walkProject` returns warnings array (project missing / partial data):** propagate `walk.warnings` into `syncInitiatives` result.warnings. Do NOT abort — partial sync is acceptable as long as some items succeed.
- **`walkProject` throws (non-auth gh failure):** `syncInitiatives` catches, returns `{ ok: false, written: [], deleted: [], skipped: [], warnings: [`walkProject failed: ${e.message}`] }` so callers can surface the issue without a stack trace.
- **`fs.writeFileSync` fails on tmp path (disk full / permission):** `_writeInitiativeFile` re-throws. `syncInitiatives` catches per-item, adds entry to `result.skipped` with reason, continues with remaining items.
- **`fs.renameSync` fails after writeFileSync:** rare (cross-filesystem). Recover: `_writeInitiativeFile` cleans up the tmp file via `fs.unlinkSync` (best-effort; ignore unlink errors), then re-throws. **NOTE:** This is the ONE place TRD 05-02 needs `unlinkSync` access — but ONLY for tmp-cleanup-on-rename-fail. Add `unlinkSync` to `realFs` here. TRD 05-03 will piggyback on this.
- **`PRODUCT_ROADMAP_FIELDS._project_id` is null/missing:** `syncInitiatives` returns `{ ok: false, ..., warnings: ['no project_id available; obj 1 cassette missing?'] }`.
- **Item with no `issue_ref` and no slugifiable title:** `_slugifyInitiativeTitle` returns null; sync skips with warning.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@.planning/objectives/05-initiative-context-layer/05-CONTEXT.md
@.planning/objectives/05-initiative-context-layer/05-01-SUMMARY.md

# Reference patterns
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/awareness.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json
</context>

<research_context>
From `.planning/research/cross-session-coordination.md` §"Initiative context layer":

> A `df:initiatives sync` command pulls Epic body → disk file (one-way to start; same trade-off as the JOB.md → Issue sync from the companion doc).

This locks the one-way sync direction. CONTEXT.md decision #4 makes `df:initiatives sync` the SOLE writer.

From `.planning/research/github-coordination-layer.md` §"Three-tier hierarchy":

> Tier 1: Product Roadmap (org Project)
>   └─ Items grouped by Product × Quarter
>      └─ Real GitHub issues from primary repos
>      └─ Promoted draft issues for milestones
> Tier 2: [Roadmap] parent issues per repo
> Tier 3: Sub-issues = epics / objectives within a repo

Initiative qualification (CONTEXT.md decision #5):
- Items with `sub_issues.length > 0` (Tier 2 [Roadmap] issues that have backfilled sub-issues)
- Items with `[Epic]` title-prefix (Tier 3 cross-repo epics like `devflow-claude#9`)
- Drafts in `Status: In Progress` (Tier 1 promoted milestones in flight)

This excludes routine bug-report issues, completed epics, and inactive drafts.
</research_context>

<gotchas>
- **`output()` calls `process.exit(0)`:** any test that exercises `cmdInitiativesSync` end-to-end MUST be a subprocess test (mirror obj 2 TRD 02-06 + obj 4 TRD 04-04). In-process tests for the pure helpers (`_qualifiesAsInitiative`, `_slugifyInitiativeTitle`, `_renderInitiativeMarkdown`) are fine.
- **`walkProject` mocking:** mock at the `gh.runGh` layer via `_setRunGh`. Returns must include `auth status` + `api graphql` cases. The graphql mock returns the cassette JSON shape (`{ data: { node: { items: { pageInfo, nodes: [...] } } } }`).
- **Idempotency contract:** test asserts byte-equality of file content AFTER stripping the `updated_at:` line. Use a regex like `content.replace(/^updated_at: .*$/m, 'updated_at: <STRIPPED>')` for both runs and compare.
- **Atomic write tmp filename:** Including `process.pid` is fine for single-process testing. Tests can also pass an explicit `_tmpSuffix` opt to `_writeInitiativeFile` for deterministic tmp names. Recommend the latter for test stability.
- **Cassette schema:** the existing `product-roadmap-walk.json` cassette captures live walkProject output. Verify its structure matches the GraphQL query in `gh.cjs::walkProject` before treating it as a stable fixture. If the schema drifted, capture a fresh cassette via `GH_INTEGRATION=1` (gated, manual).
- **Slug uniqueness:** two items with the same title produce the same slug → second `_writeInitiativeFile` overwrites first. Acceptable for v1.1 (rare in practice); document but do not solve. Surface in `result.skipped` with reason `duplicate_slug`.
- **Item.title extraction for slug:** prefer `item.title` directly. Strip leading `[Epic]` / `[Roadmap]` prefixes BEFORE slugifying so `[Epic] DevFlow Coordination Layer` → `devflow-coordination-layer` (not `epic-devflow-coordination-layer`).
</gotchas>

</embedded_context>

## Test list

Hand-built test cases written FIRST (test:add commit), then implementation (feat: commit). Test groups:

### Group Q — _qualifiesAsInitiative (pure logic)

- **Q1**: Returns true when `item.sub_issues.length > 0`.
- **Q2**: Returns true when `item.title` starts with `[Epic]` (case-sensitive — locked per CONTEXT.md decision #5b).
- **Q3**: Returns true when `item.body` contains `**Type:** epic` line (fallback).
- **Q4**: Returns true when `item.item_type === 'draft'` AND `item.status === 'In Progress'`.
- **Q5**: Returns false for closed issues with no sub_issues.
- **Q6**: Returns false for drafts not in `In Progress`.
- **Q7**: Returns false for routine bug reports (no sub_issues, no [Epic] prefix, item_type='issue').
- **Q8**: Short-circuits on first true condition (no need to evaluate all).

### Group SL — _slugifyInitiativeTitle (pure logic)

- **SL1**: `"DevFlow Internal Alpha"` → `"devflow-internal-alpha"`.
- **SL2**: `"[Epic] Eden Biz Launch"` → `"eden-biz-launch"` (strips bracketed prefix).
- **SL3**: `"[Roadmap] Go Migration Q2 2026"` → `"go-migration-q2-2026"`.
- **SL4**: `"AI/ML Platform"` → `"ai-ml-platform"` (slash → hyphen).
- **SL5**: Empty/whitespace title → `null`.
- **SL6**: Non-ASCII title (e.g., `"Résumé feature"`) → `"resume-feature"` (NFKD normalize, strip diacritics).
- **SL7**: Title with multiple spaces → single hyphen between tokens.
- **SL8**: Title with special chars (`!@#$%`) stripped, leaving alphanumeric + hyphens.

### Group R — _renderInitiativeMarkdown (pure logic)

- **R1**: Render with all fields produces output matching `buildInitiativeFile` byte-for-byte (modulo whitespace tolerance).
- **R2**: Frontmatter field order is locked: slug, github_issue, parent_project, key_repos, updated_at.
- **R3**: Body section order is locked: # Title, ## Why, ## Open Questions, ## Linked Sub-issues, ## Status.
- **R4**: `## Why` truncated at MAX_WHY_CHARS via `_truncateWhy`.
- **R5**: `## Open Questions` truncated at MAX_QUESTIONS_BULLETS (default 7).
- **R6**: `## Linked Sub-issues` truncated at MAX_SUBISSUES_LINES (default 15).
- **R7**: Empty open_questions / sub_issues render as empty section (header present, no bullets).

### Group W — _writeInitiativeFile (filesystem)

- **W1**: Writes to `<home>/<slug>.md` with content from `_renderInitiativeMarkdown`.
- **W2**: Atomic: writes to tmp file first (verify via test that asserts `<home>/.<slug>.md.tmp.*` exists transiently — or use `_tmpSuffix` opt for deterministic naming).
- **W3**: Renames tmp to dest after successful write.
- **W4**: Tmp file in same directory as dest (no cross-filesystem move).
- **W5**: Cleans up tmp file when rename fails (mock rename to throw; assert tmp doesn't remain).
- **W6**: Overwrites existing file at dest (re-running sync replaces previous).
- **W7**: Idempotency contract: write twice, content byte-equal modulo `updated_at:` line.
- **W8**: Creates `home` dir if missing (`mkdirSync recursive: true`).

### Group S — syncInitiatives (orchestration)

- **S1**: Calls `requireGhAuth(['project', 'read:project', 'repo'])` first; on success proceeds.
- **S2**: Throws GhAuthError when auth fails (caller dispatches).
- **S3**: Calls `walkProject(opts.project_id || PRODUCT_ROADMAP_FIELDS._project_id)`.
- **S4**: Filters items via `_qualifiesAsInitiative`; non-qualifying items appear in `result.skipped`.
- **S5**: Writes one file per qualifying item under `opts.home || defaultInitiativesHome()`.
- **S6**: Returns structured result `{ ok: true, written: [{slug, path}], deleted: [], skipped: [{title, reason}], warnings: [] }`.
- **S7**: `--initiative <slug>` mode filters to ONE matching item (by slug match against title-derived slug).
- **S8**: `--initiative <slug>` mode skips stale-deletion (handled in 05-03 anyway, but contract holds in 05-02 with empty deleted array).
- **S9**: walkProject warnings propagate to result.warnings.
- **S10**: walkProject throw (non-auth) caught: returns `{ ok: false, ..., warnings: ['walkProject failed: ...'] }`.
- **S11**: Empty walkProject (no items) returns `{ ok: true, written: [], skipped: [], warnings: [] }`.
- **S12**: Items with no slugifiable title appear in `result.skipped` with `reason: 'no_slug'`.

### Group IM — Idempotency (integration)

- **IM1**: Run sync twice with same mock walkProject; assert second run produces byte-equal files modulo updated_at.
- **IM2**: Run sync, manually edit one file, run sync again — second sync overwrites the manual edit (one-way sync contract).

### Group CLI2 — cmdInitiativesSync (replaces 05-01 stub)

- **CLI2-1**: `df-tools initiatives sync` (subprocess) mocks gh via env-var or temp config — assert behavior. (May be hard to subprocess-mock; alternatives: skip subprocess, do in-process test by directly calling cmdInitiativesSync after `_setRunGh` injection.)
- **CLI2-2**: GhAuthError emits structured JSON to stderr + exit 1 (NOT zero).
- **CLI2-3**: Successful sync emits structured JSON to stdout + exit 0.
- **CLI2-4**: `--initiative <slug>` flag passes through to syncInitiatives.
- **CLI2-5**: `--project-id <id>` flag passes through.
- **CLI2-6**: TRD 05-01's CLI6 test (sync stub returns "TRD 05-02") FLIPPED — now sync returns valid output (or auth error JSON).

<tasks>

<task type="auto">
  <name>Task 1: Add walkProject mock helper to fixtures + writer test suite (RED)</name>
  <files>
plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
plugins/devflow/devflow/bin/lib/initiatives.test.cjs
plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs
  </files>
  <action>
Step 1: Extend `awareness-fixtures.cjs` with a walkProject mock helper that pairs with `_setRunGh`:

```js
// ─── TRD 05-02: walkProject mock helper ──────────────────────────────────────

/**
 * Build a mock _runGh function that responds to:
 *   - auth status (returns success with locked scopes)
 *   - api graphql (returns walkProject-shaped JSON)
 *
 * @param {object} opts
 * @param {object[]} opts.walkProjectItems - array of buildOrgItem results to return
 * @param {boolean} opts.authOk - if false, mock auth status returns failure
 * @returns {function} mock _runGh fn for _setRunGh injection
 */
function buildMockRunGhForInitiatives({
  walkProjectItems = [],
  authOk = true,
  authScopes = "'project', 'read:project', 'repo'",
} = {}) {
  return function mockRunGh(args) {
    if (args && args[0] === 'auth' && args[1] === 'status') {
      if (!authOk) {
        return { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' };
      }
      return {
        ok: true,
        status: 0,
        stdout: `github.com\n  ✓ Logged in to github.com\n  - Token scopes: ${authScopes}\n`,
        stderr: '',
      };
    }
    if (args && args[0] === 'api' && args[1] === 'graphql') {
      // Build walkProject-shaped GraphQL response
      const nodes = walkProjectItems.map(item => {
        const isIssue = item.item_type !== 'draft';
        const fieldValues = { nodes: [] };
        if (item.product) fieldValues.nodes.push({ name: item.product, field: { name: 'Product' } });
        if (item.quarter) fieldValues.nodes.push({ name: item.quarter, field: { name: 'Quarter' } });
        if (item.status) fieldValues.nodes.push({ name: item.status, field: { name: 'Status' } });
        const content = isIssue ? {
          __typename: 'Issue',
          number: item.issue_ref ? parseInt(item.issue_ref.split('#')[1], 10) : 0,
          title: item.title,
          body: item.body || '',
          repository: { nameWithOwner: item.issue_ref ? item.issue_ref.split('#')[0] : null },
          trackedIssues: {
            totalCount: (item.sub_issues || []).length,
            nodes: (item.sub_issues || []).map(si => ({
              number: parseInt(si.ref.split('#')[1], 10),
              title: si.title,
              state: si.state,
              repository: { nameWithOwner: si.ref.split('#')[0] },
            })),
          },
        } : {
          __typename: 'DraftIssue',
          title: item.title,
          body: item.body || '',
        };
        return { content, fieldValues };
      });
      return {
        ok: true,
        status: 0,
        stdout: JSON.stringify({
          data: {
            node: {
              items: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes,
              },
            },
          },
        }),
        stderr: '',
      };
    }
    return { ok: false, status: 1, stdout: '', stderr: `unmocked gh call: ${(args || []).join(' ')}` };
  };
}
```

Update module.exports to include `buildMockRunGhForInitiatives`.

Step 2: Append test groups Q/SL/R/W/S/IM to `initiatives.test.cjs`. Each test follows the naming convention `Q1: ...`, `SL2: ...`, etc.

Step 3: Append CLI2 test group to `initiatives-cli.test.cjs`. CLI2-6 MODIFIES the existing CLI6 (was stub-asserting, now flips to assert real behavior). Use a comment to mark the change: `// CLI2-6: replaces TRD 05-01's CLI6 stub assertion`.

Test scaffold for Q group:

```js
test('Q1: qualifies items with sub_issues > 0', () => {
  const item = fixtures.buildOrgItem({
    title: 'Random title',
    sub_issues: [{ ref: 'a/b#1', title: 'sub', state: 'OPEN' }],
  });
  assert.strictEqual(init._qualifiesAsInitiative(item), true);
});

test('Q5: rejects items with no signals', () => {
  const item = fixtures.buildOrgItem({
    title: 'Random title',
    item_type: 'issue',
    status: 'CLOSED',
    sub_issues: [],
    body: '',
  });
  assert.strictEqual(init._qualifiesAsInitiative(item), false);
});
```

Test scaffold for S group (with mock injection):

```js
test('S1: syncInitiatives calls requireGhAuth first; on success proceeds', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-sync-'));
  let authCalled = false;
  init._setRunGh((args) => {
    if (args[0] === 'auth') {
      authCalled = true;
      return { ok: true, status: 0, stdout: "Token scopes: 'project', 'repo'", stderr: '' };
    }
    if (args[0] === 'api') {
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = init.syncInitiatives({ home, project_id: 'PVT_test' });
  assert.strictEqual(authCalled, true);
  assert.strictEqual(result.ok, true);
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});
```

Run tests in RED state; commit: `test(05-02): add failing writer + sync orchestration tests`

# CRITICAL: Tests must use `_setRunGh` mock or `buildMockRunGhForInitiatives` helper — never live gh calls.
# GOTCHA: After each test using mocks, call `init._resetMocks()` to avoid mock leakage between tests.
  </action>
  <verify>
cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test -- --test-name-pattern="initiatives" 2>&1 | tail -40
# Expected: new tests Q*/SL*/R*/W*/S*/IM*/CLI2-* fail (writer not yet implemented). Existing 38 tests from 05-01 still pass.
  </verify>
  <done>
- `buildMockRunGhForInitiatives` builder added to fixtures
- 12+8+7+8+12+2+6 = 55 new test cases written
- Tests fail in expected RED state (writer not implemented yet)
- Existing TRD 05-01 tests still pass (no regression)
- Test commit landed: `test(05-02): add failing writer + sync orchestration tests`
  </done>
  <recovery>
If new tests interfere with existing tests (e.g., mock leakage): ensure every test using `_setRunGh` ends with `init._resetMocks()`. If CLI2-6 conflicts with CLI6: keep CLI6 in 05-01-completed state and add CLI2-6 as a separate test (don't actually delete CLI6 — flip its expectation in-place by noting "as of 05-02, this exits 0 with valid JSON").
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Implement writer region in initiatives.cjs (GREEN)</name>
  <files>
plugins/devflow/devflow/bin/lib/initiatives.cjs
plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
  </files>
  <action>
Add the writer region to `initiatives.cjs` (after the reader region, before partial module.exports). Replace `cmdInitiativesSync` stub in `initiatives-cli.cjs` with the real implementation.

For `initiatives.cjs`, add after reader region:

```js
// ─── TRD 05-02: Extended realFs (write methods) ──────────────────────────────
// Augment realFs in-place. unlinkSync is needed here for tmp-cleanup-on-rename-fail.
// TRD 05-03 will reuse the unlinkSync entry.
realFs.writeFileSync = (p, data, opts) => fs.writeFileSync(p, data, opts);
realFs.mkdirSync = (p, opts) => fs.mkdirSync(p, opts);
realFs.renameSync = (oldP, newP) => fs.renameSync(oldP, newP);
realFs.unlinkSync = (p) => fs.unlinkSync(p);

// ─── TRD 05-02: _slugifyInitiativeTitle ──────────────────────────────────────

function _slugifyInitiativeTitle(title) {
  if (typeof title !== 'string') return null;
  // Strip [Epic] / [Roadmap] / similar bracketed prefix
  let t = title.replace(/^\[[^\]]+\]\s*/, '');
  // NFKD normalize + strip diacritics
  t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // Lowercase + replace non-alphanumeric with hyphen
  t = t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // Collapse multiple hyphens, strip leading/trailing
  t = t.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return t.length > 0 ? t : null;
}

// ─── TRD 05-02: _qualifiesAsInitiative ───────────────────────────────────────

function _qualifiesAsInitiative(item) {
  if (!item || typeof item !== 'object') return false;
  // Path 1: has tracked sub-issues
  if (Array.isArray(item.sub_issues) && item.sub_issues.length > 0) return true;
  // Path 2: title-prefix [Epic] (case-sensitive per CONTEXT.md decision #5b)
  if (typeof item.title === 'string' && /^\[Epic\]/.test(item.title)) return true;
  // Path 3: body marker **Type:** epic
  if (typeof item.body === 'string' && /\*\*Type:\*\*\s+epic/i.test(item.body)) return true;
  // Path 4: draft + In Progress
  if (item.item_type === 'draft' && item.status === 'In Progress') return true;
  return false;
}

// ─── TRD 05-02: _renderInitiativeMarkdown ────────────────────────────────────

function _renderInitiativeMarkdown(data) {
  // data: { slug, github_issue, parent_project, key_repos, updated_at,
  //         title, why, open_questions, sub_issues, status, project_status, quarter }
  const lines = [];
  lines.push('---');
  lines.push(`slug: ${data.slug}`);
  lines.push(`github_issue: ${data.github_issue || ''}`);
  lines.push(`parent_project: ${data.parent_project || ''}`);
  lines.push('key_repos:');
  for (const r of (data.key_repos || [])) lines.push(`  - ${r}`);
  lines.push(`updated_at: ${data.updated_at}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${data.title || data.slug}`);
  lines.push('');
  lines.push('## Why');
  lines.push('');
  lines.push(_truncateWhy(data.why || '', MAX_WHY_CHARS));
  lines.push('');
  lines.push('## Open Questions');
  lines.push('');
  const questions = (data.open_questions || []).slice(0, MAX_QUESTIONS_BULLETS);
  for (const q of questions) lines.push(`- ${q}`);
  if (questions.length === 0) lines.push('');
  lines.push('');
  lines.push('## Linked Sub-issues');
  lines.push('');
  const subs = (data.sub_issues || []).slice(0, MAX_SUBISSUES_LINES);
  for (const si of subs) lines.push(`- ${si.ref} — ${si.title} (${si.state})`);
  if (subs.length === 0) lines.push('');
  lines.push('');
  lines.push('## Status');
  lines.push('');
  lines.push(`- **GitHub:** ${data.status || 'OPEN'}`);
  if (data.project_status) lines.push(`- **Project status:** ${data.project_status}`);
  if (data.quarter) lines.push(`- **Quarter:** ${data.quarter}`);
  lines.push(`- **Updated:** ${data.updated_at}`);
  lines.push('');
  return lines.join('\n');
}

// ─── TRD 05-02: _writeInitiativeFile ─────────────────────────────────────────

function _writeInitiativeFile(home, data, opts = {}) {
  if (!_runFs.existsSync(home)) {
    _runFs.mkdirSync(home, { recursive: true });
  }
  const slug = data.slug;
  const dest = path.join(home, `${slug}.md`);
  const tmpSuffix = opts._tmpSuffix || `tmp.${process.pid}`;
  const tmpPath = path.join(home, `.${slug}.md.${tmpSuffix}`);
  const content = _renderInitiativeMarkdown(data);
  _runFs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    _runFs.renameSync(tmpPath, dest);
  } catch (e) {
    // Cleanup tmp on rename failure
    try { _runFs.unlinkSync(tmpPath); } catch {}
    throw e;
  }
  return { slug, path: dest };
}

// ─── TRD 05-02: syncInitiatives ──────────────────────────────────────────────

/**
 * Sync initiatives from org Product Roadmap to disk.
 *
 * @param {object} opts
 * @param {string} opts.home          - target dir; defaults to defaultInitiativesHome()
 * @param {string} opts.project_id    - project node id; defaults to PRODUCT_ROADMAP_FIELDS._project_id
 * @param {string} opts.initiative    - sync ONLY this slug (skips all others; skips stale-deletion)
 * @returns {{ ok: bool, written: [], deleted: [], skipped: [], warnings: [] }}
 */
function syncInitiatives(opts = {}) {
  // 1. Hard-fail auth (throws GhAuthError)
  gh.requireGhAuth(['project', 'read:project', 'repo']);

  const home = opts.home || defaultInitiativesHome();
  const projectId = opts.project_id || (gh.PRODUCT_ROADMAP_FIELDS && gh.PRODUCT_ROADMAP_FIELDS._project_id) || null;
  const written = [];
  const deleted = [];
  const skipped = [];
  const warnings = [];

  if (!projectId) {
    return {
      ok: false,
      written, deleted, skipped,
      warnings: ['no project_id available; obj 1 cassette missing or PRODUCT_ROADMAP_FIELDS not initialized'],
    };
  }

  // 2. Walk project (catch non-auth errors)
  let walk;
  try {
    walk = gh.walkProject(projectId);
  } catch (e) {
    return { ok: false, written, deleted, skipped, warnings: [`walkProject failed: ${e.message}`] };
  }
  warnings.push(...(walk.warnings || []));

  // 3. Filter + write
  const updatedAt = new Date().toISOString();
  for (const item of (walk.items || [])) {
    if (!_qualifiesAsInitiative(item)) {
      skipped.push({ title: item.title || '(untitled)', reason: 'does_not_qualify' });
      continue;
    }
    const slug = _slugifyInitiativeTitle(item.title);
    if (!slug) {
      skipped.push({ title: item.title || '(untitled)', reason: 'no_slug' });
      continue;
    }
    if (opts.initiative && opts.initiative !== slug) {
      // Single-initiative mode: skip non-matching
      continue;
    }
    // Build initiative data shape
    const data = {
      slug,
      github_issue: item.issue_ref,
      parent_project: projectId,
      key_repos: _deriveKeyRepos(item),
      updated_at: updatedAt,
      title: item.title.replace(/^\[[^\]]+\]\s*/, ''),
      why: _extractWhyFromBody(item.body),
      open_questions: _extractQuestionsFromBody(item.body),
      sub_issues: item.sub_issues || [],
      status: item.item_type === 'draft' ? 'DRAFT' : 'OPEN',
      project_status: item.status,
      quarter: item.quarter,
    };
    try {
      const result = _writeInitiativeFile(home, data);
      written.push(result);
    } catch (e) {
      skipped.push({ title: item.title, reason: `write_failed: ${e.message}` });
    }
  }

  return { ok: true, written, deleted, skipped, warnings };
}

// ─── TRD 05-02: helpers (private; not exported) ──────────────────────────────

function _deriveKeyRepos(item) {
  // Primary: repo of the issue itself
  const repos = new Set();
  if (item.issue_ref) {
    const repo = item.issue_ref.split('#')[0];
    if (repo) repos.add(repo);
  }
  // Plus: every distinct repo referenced in sub_issues
  for (const si of (item.sub_issues || [])) {
    if (si.ref) {
      const repo = si.ref.split('#')[0];
      if (repo) repos.add(repo);
    }
  }
  return Array.from(repos);
}

function _extractWhyFromBody(body) {
  if (!body || typeof body !== 'string') return '';
  // First, try explicit ## Why section
  const why = _extractSection(body, 'Why');
  if (why) return why;
  // Else: first paragraph of body (everything before first ## or first \n\n## )
  const firstHeader = body.search(/^##\s/m);
  const before = (firstHeader >= 0 ? body.slice(0, firstHeader) : body).trim();
  return before;
}

function _extractQuestionsFromBody(body) {
  if (!body || typeof body !== 'string') return [];
  const section = _extractSection(body, 'Open Questions') || _extractSection(body, 'Questions') || '';
  return _parseQuestionsSection(section);
}
```

Update partial module.exports at end of `initiatives.cjs`:

```js
module.exports = {
  // Reader (TRD 05-01):
  loadInitiatives,
  matchByRepo,
  formatInitiativeForPlanner,
  _parseInitiativeFile,
  _truncateWhy,

  // Writer (TRD 05-02):
  syncInitiatives,
  _writeInitiativeFile,
  _qualifiesAsInitiative,
  _slugifyInitiativeTitle,
  _renderInitiativeMarkdown,

  // Test hooks:
  _setRunFs,
  _setRunGh,
  _resetMocks,

  // Constants:
  INITIATIVES_HOME_REL,
  MAX_WHY_CHARS,
  MAX_QUESTIONS_BULLETS,
  MAX_SUBISSUES_LINES,
  MAX_FORMATTED_PLANNER_CHARS,
  defaultInitiativesHome,
};
```

For `initiatives-cli.cjs`: replace `cmdInitiativesSync` stub with real implementation:

```js
const init = require('./initiatives.cjs');

function cmdInitiativesSync(cwd, args) {
  const { flags } = _parseFlags(args);
  try {
    const result = init.syncInitiatives({
      home: flags.home,
      project_id: flags['project-id'],
      initiative: flags.initiative,
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
        error: e.message,
        remediation: e.remediation,
        scopes_missing: e.scopes_missing,
      }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }, null, 2) + '\n');
    process.exit(1);
  }
}
```

Run tests; expect GREEN. Commit: `feat(05-02): implement initiative writer + atomic sync`

# CRITICAL: realFs is augmented IN-PLACE (not redeclared). The reader's `_runFs` already references the same `realFs` object, so adding methods reflects immediately.
# GOTCHA: `_extractSection` and `_parseQuestionsSection` are private helpers from TRD 05-01's reader region. Reuse them (already in scope) — do NOT redefine.
# PATTERN: `_deriveKeyRepos` is the only "smart" inference here. All other transformations are direct copies from walkProject item shape to disk shape.
  </action>
  <verify>
cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test 2>&1 | tail -20
# Expected: all 880+55=935 tests pass (or close — some test counts may shift). No failures.
# Manual smoke test (no live gh):
node -e "const i = require('./plugins/devflow/devflow/bin/lib/initiatives.cjs'); console.log(i._slugifyInitiativeTitle('[Epic] DevFlow Coordination Layer'));"
# Expected: "devflow-coordination-layer"
  </verify>
  <done>
- Writer region present in initiatives.cjs
- syncInitiatives, _writeInitiativeFile, _qualifiesAsInitiative, _slugifyInitiativeTitle, _renderInitiativeMarkdown exported (partial)
- cmdInitiativesSync replaced (no longer stubs out)
- All 55 new tests pass + existing tests pass
- 2 atomic commits: test(05-02): ... + feat(05-02): ...
- SC-1, SC-2, SC-3 met (qualification + schema + idempotency)
  </done>
  <recovery>
If atomic-write tests fail (W2/W4): inspect that tmp filename builder uses `path.join(home, ...)` (same dir). If idempotency test (W7/IM1) fails on byte-equality: ensure `_renderInitiativeMarkdown` produces deterministic output (no Date.now() except via the supplied `updated_at` arg). If `_qualifiesAsInitiative` returns wrong values: compare with the test's exact item shape and CONTEXT.md decision #5 logic.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test</test>
</validation_gates>

<verification>
1. **Auth contract** — `syncInitiatives` calls `requireGhAuth` first; on failure throws GhAuthError caught by `cmdInitiativesSync` → JSON to stderr + exit 1.
2. **Qualification logic** — `_qualifiesAsInitiative` matches all 4 paths (sub_issues / [Epic] / **Type:** epic / draft+In Progress). Tests Q1-Q8 cover the matrix.
3. **Schema lock** — `_renderInitiativeMarkdown` output matches `buildInitiativeFile` byte-for-byte (R1). Frontmatter field order locked (R2). Body section order locked (R3).
4. **Atomic write** — `_writeInitiativeFile` uses tmp + rename; tmp in same dir; cleanup on rename fail. Tests W2-W5.
5. **Idempotency** — running sync twice produces identical files modulo updated_at. Tests W7, IM1.
6. **Sync surface** — returns `{ ok, written, deleted, skipped, warnings }`. Tests S6, S11, S12.
7. **--initiative <slug> mode** — filters to one item; skips non-matching. Tests S7, S8.
</verification>

<success_criteria>
- [ ] Writer region implemented: syncInitiatives, _writeInitiativeFile, _qualifiesAsInitiative, _slugifyInitiativeTitle, _renderInitiativeMarkdown
- [ ] cmdInitiativesSync replaces 05-01 stub; emits structured JSON for both success + auth-failure paths
- [ ] buildMockRunGhForInitiatives helper added to fixtures
- [ ] Test groups Q (8) + SL (8) + R (7) + W (8) + S (12) + IM (2) + CLI2 (6) = 51 new tests pass
- [ ] No regressions: full npm test suite still green
- [ ] 2 atomic commits land: `test(05-02): ...` then `feat(05-02): ...`
- [ ] SC-1 closed (sync writer + qualification)
- [ ] SC-2 closed (locked schema)
- [ ] SC-3 closed (idempotency + atomic write)
</success_criteria>

<output>
After completion, create `.planning/objectives/05-initiative-context-layer/05-02-SUMMARY.md` documenting:
- Files modified
- Test groups + counts
- Key behaviors confirmed (qualification matrix, atomic write, idempotency byte-equality strategy)
- Where 05-03 picks up (stale-deletion + --force; reuses unlinkSync from realFs that 05-02 added)
- Any deviations from TRD plan + reasons
</output>

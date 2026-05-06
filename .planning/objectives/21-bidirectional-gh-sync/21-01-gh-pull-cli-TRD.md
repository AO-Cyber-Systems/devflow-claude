---
objective: 21-bidirectional-gh-sync
trd: 01
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-pull.cjs
  - plugins/devflow/devflow/bin/lib/gh-pull.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-open-no-drift.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-closed-on-gh.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-relabeled-on-gh.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-not-found.json
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/templates/config.json
autonomous: true
requirements:
  - GH-PULL-CLI
  - GH-PULL-APPLY

must_haves:
  truths:
    - "`df-tools gh pull <objective>` reads GH issue state via gh CLI and reports drift"
    - "When GH-side changed and disk unchanged, `--apply` writes new frontmatter values to OBJECTIVE.md"
    - "When no GH issue mapped for objective, exit non-zero with hint to run `gh sync-objectives` first"
    - "All gh CLI calls go through _runGh injection so tests use cassette responses, not network"
    - "`templates/config.json` has a `github.auto_pull_on_init: false` slot scaffolded for v1.3+"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/gh-pull.cjs"
      provides: "cmdGhPull, fetchGhIssue, detectDrift, applyDrift"
      exports: ["cmdGhPull", "fetchGhIssue", "detectDrift", "applyDrift", "_setRunGh"]
    - path: "plugins/devflow/devflow/bin/lib/gh-pull.test.cjs"
      provides: "paired tests covering 4 cassette scenarios"
      contains: "describe('cmdGhPull"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs"
      provides: "buildMockRunGh, buildIssueResponse, loadCassette helpers"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-open-no-drift.json"
      provides: "cassette: GH issue unchanged since last sync"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-closed-on-gh.json"
      provides: "cassette: state changed OPEN → CLOSED on GH"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-relabeled-on-gh.json"
      provides: "cassette: labels added on GH"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-not-found.json"
      provides: "cassette: gh exits 1 with 'not found' stderr"
  key_links:
    - from: "df-tools.cjs case 'gh' subcommand 'pull'"
      to: "lib/gh-pull.cjs cmdGhPull"
      via: "require + dispatch"
      pattern: "cmdGhPull\\(cwd, args"
    - from: "lib/gh-pull.cjs cmdGhPull"
      to: "lib/gh.cjs readMappingV2"
      via: "require — reuse existing mapping reader"
      pattern: "readMappingV2"
    - from: "lib/gh-pull.cjs"
      to: "lib/gh.cjs requireGhAuth"
      via: "require — reuse auth pattern from objective 1"
      pattern: "requireGhAuth\\(\\['repo'\\]\\)"
    - from: "lib/gh-pull.test.cjs"
      to: "__fixtures__/gh-pull-cassettes/*.json"
      via: "loadCassette helper"
      pattern: "loadCassette\\("
---

<objective>
Build the inbound half of bidirectional GH sync: `df-tools gh pull <objective>` reads GitHub issue state for a tracked objective, detects drift versus disk frontmatter, and (with `--apply`) writes the changed fields back to OBJECTIVE.md. Pure-logic detection — no conflict resolution yet (TRD 21-03 layers on top).

Purpose: Close the unidirectional gap. v1.1 ships push-only. v1.2 pull lets users edit GH directly (close issue, relabel) and have planning state catch up. Sets the foundation TRDs 21-02 (sync state) and 21-03 (conflicts) build on.

Output: New `lib/gh-pull.cjs` module with `cmdGhPull` CLI entry, `fetchGhIssue` GH reader, `detectDrift` pure-logic function, `applyDrift` writer. Paired test file with 4 cassette-backed scenarios covering happy path, drift, apply, missing-mapping. New `df-tools gh pull <objective> [--apply]` subcommand wired in `df-tools.cjs`.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                                              ← MODIFY (add gh pull case)
├── lib/
│   ├── gh-pull.cjs                                                           ← CREATE
│   ├── gh-pull.test.cjs                                                      ← CREATE
│   └── __fixtures__/
│       ├── gh-pull-fixtures.cjs                                              ← CREATE
│       └── gh-pull-cassettes/
│           ├── objective-open-no-drift.json                                  ← CREATE
│           ├── objective-closed-on-gh.json                                   ← CREATE
│           ├── objective-relabeled-on-gh.json                                ← CREATE
│           └── objective-not-found.json                                      ← CREATE
└── templates/
    └── config.json                                                           ← MODIFY (add auto_pull_on_init slot)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: `_runGh` test injection seam (from `lib/gh.cjs`)**

```javascript
// Production code paths use _runGh exclusively. Tests inject mock via _setRunGh.
let _runGh = runGh;
function _setRunGh(fn) { _runGh = (fn != null) ? fn : runGh; }

// In production functions:
const r = _runGh(['issue', 'view', String(num), '--repo', repo, '--json', 'state,labels,...']);
if (!r.ok) { /* ... */ }
```

**Pattern: cassette fixture loading (analogous to `lib/__fixtures__/gh-cassettes/`)**

```javascript
// In gh-pull-fixtures.cjs
const path = require('path');
const fs = require('fs');

function loadCassette(name) {
  const p = path.join(__dirname, 'gh-pull-cassettes', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// Cassette format mirrors runGh return shape:
// { args: ["issue", "view", ...],   ← what _runGh was called with (for assert)
//   response: { ok, status, stdout, stderr } }
```

**Pattern: mock _runGh with exact + prefix matching (from `lib/__fixtures__/gh-fixtures.cjs`)**

```javascript
function buildMockRunGh(responses /* Map<string, { ok, stdout, stderr }> */) {
  function mockRunGh(args) {
    const key = args.join(' ');
    if (responses.has(key)) return responses.get(key);
    // prefix match (longest wins)
    let bestKey = null, bestLen = -1;
    for (const [k] of responses.entries()) {
      if (key.startsWith(k) && k.length > bestLen) { bestKey = k; bestLen = k.length; }
    }
    if (bestKey !== null) return responses.get(bestKey);
    return { ok: false, status: 1, stdout: '', stderr: `[mock] no match for: ${key}` };
  }
  return mockRunGh;
}
```

**Pattern: requireGhAuth hard-fail on missing scopes (from `lib/gh.cjs`)**

```javascript
try {
  requireGhAuth(['repo']);  // pull only needs repo scope, not project
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
  throw e;
}
```

**Pattern: df-tools.cjs case-block dispatch (from existing `case 'gh'`)**

```javascript
case 'gh': {
  const subcommand = args[1];
  if (subcommand === 'status') { cmdGhStatus(cwd, raw); }
  else if (subcommand === 'sync-objectives') { cmdGhSyncObjectives(cwd, raw); }
  else if (subcommand === 'pull') {                                  // ← ADD THIS BRANCH
    const { cmdGhPull } = require('./lib/gh-pull.cjs');
    cmdGhPull(cwd, args.slice(2), raw);
  }
  // ...
  break;
}
```

</codebase_examples>

<anti_patterns>

- ❌ **Module-level cassette loading at require time.** `lib/gh.cjs` does this with `PRODUCT_ROADMAP_FIELDS`. New code: cassettes load inside test setup or via lazy helper, not at module load.
- ❌ **Live network calls in tests.** Every `_runGh` call MUST go through the mock. No `process.env.SKIP_NETWORK_CHECKS` exception path. If a test needs a response, build a cassette.
- ❌ **GraphQL queries pulled inline as multiline strings.** Pull only needs `gh issue view` REST-shaped JSON output. Use `--json` flag, not `gh api graphql`.
- ❌ **Generated test data.** All fixture builders are hand-built factory functions. No "generate 100 random issue refs" property-based loops.
- ❌ **Auto-merge on drift.** TRD 21-01 only DETECTS drift. Apply requires explicit `--apply`. Conflict cases delegate to TRD 21-03 — DO NOT implement merge logic here.

</anti_patterns>

<error_recovery>

**Failure: gh CLI not installed**
- `_runGh` returns `{ ok: false, status: null, stderr: 'ENOENT' }`
- `requireGhAuth` throws `GhAuthError` with `remediation: 'Install gh from https://cli.github.com'`
- `cmdGhPull` catches, writes structured JSON error to stderr, exits 1

**Failure: Objective has no GH issue mapping**
- `readMappingV2(cwd).objectives[objectiveId]` returns undefined
- `cmdGhPull` exits 1 with: `{ error: "Objective NN has no GitHub issue", remediation: "Run \`df-tools gh sync-objectives\` to create one before pulling." }`
- Do NOT auto-create the issue from pull path; that's push semantics.

**Failure: gh issue view returns 404**
- `gh issue view 99999 --repo X/Y` exits 1, stderr contains "Could not resolve to an Issue"
- Detect via stderr substring; treat as "issue was deleted on GH" → exit 1 with hint to clean `.gh-mapping.json` manually
- Do NOT auto-clean mapping; user may want to investigate

**Failure: `--apply` invoked but disk has unsaved changes**
- TRD 21-01 scope: `--apply` overwrites OBJECTIVE.md frontmatter without checking disk hash. If both sides changed, that's a CONFLICT — but conflict detection lives in TRD 21-03.
- For 21-01: if we lack last_synced_disk_hash (no sync state yet), refuse `--apply` with hint: "No prior sync state. Run `df-tools gh sync` first to establish baseline."
- If we have last_synced_disk_hash and disk hash matches → safe to apply.
- If disk hash differs → defer to TRD 21-03 (this TRD reports `conflict_suspected: true` and exits 1; TRD 21-03 layers full resolution).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/21-bidirectional-gh-sync/OBJECTIVE.md
@.planning/objectives/21-bidirectional-gh-sync/21-CONTEXT.md
@.planning/objectives/21-bidirectional-gh-sync/21-RESEARCH.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
</context>

<research_context>

**Drift detection algorithm (from 21-RESEARCH.md):**

1. Read disk frontmatter: `extractFrontmatter(OBJECTIVE.md)`
2. Read GH state: `gh issue view N --json state,labels,assignees,milestone,updatedAt --repo OWNER/REPO`
3. Read last sync state: `.planning/.gh-sync-state.json` `objectives[objectiveId]` (may not exist for first pull)
4. Compare:
   - GH `updatedAt` == last_sync.gh_updated_at AND last_sync exists → no drift, exit 0 quietly
   - GH `updatedAt` != last_sync.gh_updated_at → drift detected
   - No last_sync entry → first-time pull, treat as drift (any GH state is "new" relative to nothing)

**Tracked fields (v1.2 scope):**
- `state` — open/closed → maps to disk frontmatter `status: open | done`
- `labels` — string[] → maps to disk `labels: []`
- `assignees` — login[] → maps to disk `assignees: []`
- `milestone` — { title, number } → maps to disk `milestone: title`

Fields NOT tracked by pull (write-from-disk only): `kind`, `work`, `parent_issue`, `org_initiative`, `org_project`, `goal`, `requirements`, `success_criteria`. These are planning-authoritative; GH is consumer.

**ETag vs updated_at decision:** Use `updatedAt` from issue body. Simpler than parsing `--include` headers; equally precise for drift detection. Cassettes record full issue JSON.

</research_context>

<gotchas>

- **Disk frontmatter parser may not preserve key order.** When writing back with `applyDrift`, do NOT round-trip through JSON — modify the frontmatter dict in place and re-serialize via a helper that preserves the original `--- ... ---` block order. Reuse `lib/frontmatter.cjs` writers if they exist; else write a minimal serializer that keeps unchanged keys in original positions.
- **`gh issue view --json state` returns `"OPEN"` or `"CLOSED"` (uppercase).** Disk frontmatter convention is lowercase `status: open | in_progress | done`. Map: `OPEN → status from disk (don't overwrite)`, `CLOSED → status: done`. Document in tests.
- **Labels are objects in `gh` JSON but strings in disk frontmatter.** GH: `[{"name":"devflow:objective","color":"..."}]`. Disk: `labels: [devflow:objective]`. Normalize to string[] before compare.
- **Milestone null on GH = no milestone.** Disk may have `milestone: null` or omit the key entirely. Treat both as equivalent during compare.
- **First-time pull (no sync state) is NOT a no-op.** Even if GH and disk happen to match by coincidence, write a sync state record so subsequent pulls have a baseline. SC-3 conflict detection requires a baseline.
- **`raw` flag must propagate.** When invoked as `df-tools gh pull --raw <obj>`, output is single-line JSON for tooling consumption. Use `lib/helpers.cjs` `output(obj, raw, prettyFallback)`.

</gotchas>

<tasks>

<task type="auto" tdd="strict">
  <name>Task 1: Build cassette fixtures + fixture builders + test list</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-open-no-drift.json, plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-closed-on-gh.json, plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-relabeled-on-gh.json, plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-not-found.json, plugins/devflow/devflow/bin/lib/gh-pull.test.cjs</files>
  <action>
Per TDD playbook habit 4: fixture work is its own task BEFORE behavior tests. No production code yet.

**Test list (write into `gh-pull.test.cjs` as a top-of-file comment first):**

```
// gh-pull.test.cjs — Test list
//
// fetchGhIssue:
//   F1: returns parsed issue JSON when gh succeeds
//   F2: returns null when gh exits 1 with "Could not resolve to an Issue"
//   F3: throws/exits when gh auth is missing (delegates to requireGhAuth)
//
// detectDrift (pure logic, no IO):
//   D1: GH unchanged (updatedAt matches last_sync) → { drift: false, fields: {} }
//   D2: GH state OPEN → CLOSED, disk unchanged → { drift: true, fields: { status } }
//   D3: GH labels added, disk unchanged → { drift: true, fields: { labels } }
//   D4: First-time pull (no last_sync entry) → { drift: true, first_sync: true }
//   D5: GH changed AND disk changed (different last_synced_disk_hash) → { drift: true, conflict_suspected: true }
//
// applyDrift (writes OBJECTIVE.md):
//   A1: writes new status to frontmatter, preserves other keys
//   A2: writes new labels array to frontmatter
//   A3: refuses to apply when conflict_suspected: true (caller must use --resolve, deferred to 21-03)
//   A4: refuses to apply when no last_sync state (first pull on stale repo) — hint to run `gh sync` first
//
// cmdGhPull (CLI orchestrator):
//   C1: no objective → exits 1 with usage message
//   C2: objective has no mapping → exits 1 with hint to run `gh sync-objectives`
//   C3: GH unchanged → exits 0 with no-drift message
//   C4: GH changed, no --apply → prints diff, exits 0 (drift reported, not written)
//   C5: GH changed, --apply, no conflict → writes OBJECTIVE.md, exits 0
//   C6: GH changed, --apply, conflict_suspected → exits 1 with "use --resolve" hint (defers to TRD 21-03)
//   C7: --raw flag emits single-line JSON
```

**Fixture builders (`gh-pull-fixtures.cjs`):**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');

// Build a mock _runGh function. Same pattern as lib/__fixtures__/gh-fixtures.cjs.
function buildMockRunGh(responses /* Map<string, response> */) {
  function mockRunGh(args) {
    const key = args.join(' ');
    if (responses.has(key)) return responses.get(key);
    let bestKey = null, bestLen = -1;
    for (const [k] of responses.entries()) {
      if (key.startsWith(k) && k.length > bestLen) { bestKey = k; bestLen = k.length; }
    }
    if (bestKey !== null) return responses.get(bestKey);
    return { ok: false, status: 1, stdout: '', stderr: `[mock] no match: ${key}` };
  }
  return mockRunGh;
}

// Load a cassette by name (name = filename without .json)
function loadCassette(name) {
  const p = path.join(__dirname, 'gh-pull-cassettes', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// Build a fake disk frontmatter dict (use in detectDrift / applyDrift tests)
function buildDiskFrontmatter({ status = 'in_progress', labels = ['devflow:objective'], assignees = [], milestone = null, ...extra } = {}) {
  return { status, labels, assignees, milestone, ...extra };
}

// Build a fake last-sync-state record (matches sync-state.cjs schema; TRD 21-02 owns full schema)
function buildLastSyncState({ etag = 'W/"abc"', gh_updated_at = '2026-05-01T00:00:00Z', label_set = ['devflow:objective'], last_synced_at = '2026-05-01T00:00:00Z', last_synced_disk_hash = 'sha256:def' } = {}) {
  return { etag, gh_updated_at, label_set, last_synced_at, last_synced_disk_hash };
}

// Build a temp project root with .planning/objectives/<id>/OBJECTIVE.md present
function buildTempProject({ objectiveId = '21-bidirectional-gh-sync', frontmatter = {} } = {}) {
  const os = require('os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-ghpull-'));
  const objDir = path.join(root, '.planning', 'objectives', objectiveId);
  fs.mkdirSync(objDir, { recursive: true });
  const fm = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    if (Array.isArray(v)) fm.push(`${k}: [${v.map(x => JSON.stringify(x)).join(', ')}]`);
    else if (v === null) fm.push(`${k}: null`);
    else fm.push(`${k}: ${v}`);
  }
  fm.push('---', '', '# Test Objective', '');
  fs.writeFileSync(path.join(objDir, 'OBJECTIVE.md'), fm.join('\n'), 'utf-8');
  return { root, objectiveId, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

module.exports = { buildMockRunGh, loadCassette, buildDiskFrontmatter, buildLastSyncState, buildTempProject };
```

**Cassette JSON files** — each captures a single `gh issue view ... --json state,labels,assignees,milestone,updatedAt` call's response. Format:

```json
// objective-open-no-drift.json
{
  "args": ["issue", "view", "10", "--repo", "AO-Cyber-Systems/devflow-claude", "--json", "state,labels,assignees,milestone,updatedAt"],
  "response": {
    "ok": true,
    "status": 0,
    "stdout": "{\"state\":\"OPEN\",\"labels\":[{\"name\":\"devflow:objective\",\"color\":\"0e8a16\"}],\"assignees\":[],\"milestone\":null,\"updatedAt\":\"2026-05-01T00:00:00Z\"}",
    "stderr": ""
  }
}
```

Build all 4 cassettes:
- `objective-open-no-drift.json` — state OPEN, labels [devflow:objective], updatedAt matches last_sync
- `objective-closed-on-gh.json` — state CLOSED, labels [devflow:objective], updatedAt newer than last_sync
- `objective-relabeled-on-gh.json` — state OPEN, labels [devflow:objective, devflow:in-progress], updatedAt newer
- `objective-not-found.json` — `{ ok: false, status: 1, stdout: "", stderr: "Could not resolve to an Issue with the number of 99999\n" }`

# CRITICAL: Cassettes are committed JSON files, NOT generated. Hand-edit them. Document in 21-RESEARCH.md re-capture procedure for when GH API shape drifts.
# GOTCHA: GH `state` is uppercase; cassettes preserve that. Don't lowercase.
# PATTERN: Match objective 1's `lib/__fixtures__/gh-cassettes/` structure.
  </action>
  <verify>
```bash
ls plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/*.json | wc -l   # 4
ls plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs               # exists
node -e "console.log(JSON.parse(require('fs').readFileSync('plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-cassettes/objective-open-no-drift.json', 'utf-8')).response.ok)"   # true
grep -c "// .*: " plugins/devflow/devflow/bin/lib/gh-pull.test.cjs                 # >=15 (test list lines)
```
  </verify>
  <done>4 cassette JSON files committed under `gh-pull-cassettes/`. `gh-pull-fixtures.cjs` exports `buildMockRunGh`, `loadCassette`, `buildDiskFrontmatter`, `buildLastSyncState`, `buildTempProject`. `gh-pull.test.cjs` exists with the test list as top-of-file comments and ZERO production code yet (`require('./gh-pull.cjs')` will fail — that's RED).</done>
  <recovery>If cassette JSON is malformed: `node -e "JSON.parse(require('fs').readFileSync('PATH', 'utf-8'))"` to validate. If `gh issue view` shape doesn't match cassette in real-world later, document re-capture command in CONTEXT.md update.</recovery>
</task>

<task type="auto" tdd="strict">
  <name>Task 2: RED → GREEN — fetchGhIssue + detectDrift (pure logic; F1-F3, D1-D5)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pull.cjs, plugins/devflow/devflow/bin/lib/gh-pull.test.cjs</files>
  <action>
TDD habit 3: one test at a time, RED → GREEN.

**RED phase** — for each test in F1-F3 + D1-D5 (8 tests):
1. Add the test to `gh-pull.test.cjs` (one at a time)
2. Run `node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs` — MUST FAIL (red)
3. Commit: `test(21-01): add failing test for {test_id}`
4. Implement minimum code in `gh-pull.cjs` to pass
5. Run test — MUST PASS (green)
6. Commit: `feat(21-01): implement {function_or_branch} for {test_id}`

**Functions to build:**

```javascript
// gh-pull.cjs

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractFrontmatter } = require('./frontmatter.cjs');
const { output } = require('./helpers.cjs');

// Test-injection seam — same pattern as lib/gh.cjs
function _defaultRunGh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf-8', timeout: 30000 });
  return { ok: r.status === 0, status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}
let _runGh = _defaultRunGh;
function _setRunGh(fn) { _runGh = (fn != null) ? fn : _defaultRunGh; }

// Tracked fields — v1.2 scope only
const TRACKED_FIELDS = ['status', 'labels', 'assignees', 'milestone'];

/**
 * fetchGhIssue(issueRef) — returns parsed issue JSON or null if not found.
 * issueRef shape: 'owner/repo#NN'
 */
function fetchGhIssue(issueRef) {
  const m = issueRef && issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return null;
  const [, owner, repo, num] = m;

  const r = _runGh(['issue', 'view', String(num), '--repo', `${owner}/${repo}`, '--json', 'state,labels,assignees,milestone,updatedAt']);

  if (!r.ok) {
    if (/Could not resolve to an Issue/i.test(r.stderr)) return null;
    return { error: r.stderr || 'gh issue view failed', _ok: false };
  }

  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return { error: 'invalid JSON from gh', _ok: false }; }
  return parsed;
}

/**
 * Normalize gh issue JSON to a flat dict matching disk frontmatter shape.
 * gh: { state: "OPEN", labels: [{name}], assignees: [{login}], milestone: {title}|null, updatedAt }
 * disk-shape: { status, labels: string[], assignees: string[], milestone: string|null, updatedAt }
 */
function normalizeGhIssue(ghIssue) {
  return {
    status: ghIssue.state === 'CLOSED' ? 'done' : 'open',  // OPEN → 'open'; CLOSED → 'done' (TODO: revisit if 'in_progress' is GH-trackable)
    labels: (ghIssue.labels || []).map(l => l.name),
    assignees: (ghIssue.assignees || []).map(a => a.login),
    milestone: ghIssue.milestone ? ghIssue.milestone.title : null,
    updatedAt: ghIssue.updatedAt,
  };
}

/**
 * detectDrift({ disk_fm, gh_state, last_sync_state }) — pure logic, no IO.
 * Returns { drift, fields, first_sync, conflict_suspected }
 *   drift: true if any tracked field differs from last_sync (or first_sync)
 *   fields: { status: { disk, gh }, ... } — only fields that drifted
 *   first_sync: true when last_sync_state is null
 *   conflict_suspected: true when both disk and GH changed since last_sync
 */
function detectDrift({ disk_fm, gh_state, last_sync_state }) {
  const ghNorm = normalizeGhIssue(gh_state);

  // First-time pull: no baseline → treat as drift
  if (!last_sync_state) {
    const fields = {};
    for (const f of TRACKED_FIELDS) {
      const diskVal = disk_fm[f];
      const ghVal = ghNorm[f];
      if (!shallowEqual(diskVal, ghVal)) {
        fields[f] = { disk: diskVal, gh: ghVal };
      }
    }
    return { drift: true, first_sync: true, fields, conflict_suspected: false };
  }

  // GH unchanged → no drift
  if (gh_state.updatedAt === last_sync_state.gh_updated_at) {
    return { drift: false, first_sync: false, fields: {}, conflict_suspected: false };
  }

  // GH changed; check fields against last_sync.label_set / etc.
  const fields = {};
  for (const f of TRACKED_FIELDS) {
    const diskVal = disk_fm[f];
    const ghVal = ghNorm[f];
    // Reconstruct last-known field values from last_sync_state (only labels are explicit; status/milestone/assignees default to disk)
    const lastVal = (f === 'labels') ? last_sync_state.label_set : disk_fm[f]; // pragmatic: TRD 21-02 will store full last-known fields
    if (!shallowEqual(diskVal, ghVal)) {
      fields[f] = { disk: diskVal, gh: ghVal };
    }
  }

  // Conflict suspicion: TRD 21-01 emits a hint flag; TRD 21-03 implements full 3-way diff.
  // For 21-01: any disk hash mismatch implies disk also changed.
  // We don't compute the disk hash here — the caller passes last_synced_disk_hash and we
  // expect them to compare against the current disk hash; if mismatch → conflict_suspected: true.
  return {
    drift: Object.keys(fields).length > 0,
    first_sync: false,
    fields,
    conflict_suspected: false,  // TRD 21-03 layers on. 21-01 always returns false here.
  };
}

// Shallow equality for primitives + arrays-of-primitives. NULL-safe.
function shallowEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort(), sb = [...b].sort();
    return sa.every((x, i) => x === sb[i]);
  }
  return false;
}

module.exports = { fetchGhIssue, detectDrift, normalizeGhIssue, _setRunGh, TRACKED_FIELDS };
```

**Test pattern for D2 (status drift):**

```javascript
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const ghPull = require('./gh-pull.cjs');
const fx = require('./__fixtures__/gh-pull-fixtures.cjs');

beforeEach(() => { ghPull._setRunGh(null); });

describe('detectDrift', () => {
  test('D2: GH state OPEN → CLOSED, disk unchanged → { drift: true, fields: { status } }', () => {
    const ghCassette = fx.loadCassette('objective-closed-on-gh');
    const ghIssue = JSON.parse(ghCassette.response.stdout);
    const disk_fm = fx.buildDiskFrontmatter({ status: 'in_progress', labels: ['devflow:objective'] });
    const last_sync_state = fx.buildLastSyncState({
      gh_updated_at: '2026-05-01T00:00:00Z',  // OLDER than cassette's updatedAt
      label_set: ['devflow:objective'],
    });
    const r = ghPull.detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
    assert.strictEqual(r.drift, true);
    assert.ok(r.fields.status, 'status drift expected');
    assert.strictEqual(r.fields.status.gh, 'done');
  });
});
```

# CRITICAL: F1-F3 use `_setRunGh(fx.buildMockRunGh(...))` to inject cassette responses. NEVER call real gh.
# GOTCHA: D5 (conflict suspected) is stubbed to `false` in 21-01 — the actual logic ships in TRD 21-03. Test D5 asserts the field exists and equals false; TRD 21-03's planning will revise.
# PATTERN: Each test gets its own cassette load — don't share state between tests.
  </action>
  <verify>
```bash
node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs 2>&1 | grep -E "^(ok|not ok)" | wc -l   # 8 (F1-F3 + D1-D5)
node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs 2>&1 | grep -c "^not ok"               # 0
git log --oneline | head -16   # ~16 commits: 8 RED + 8 GREEN, alternating test→feat
```
  </verify>
  <done>All F1-F3 + D1-D5 tests pass. `gh-pull.cjs` exports `fetchGhIssue`, `detectDrift`, `normalizeGhIssue`, `_setRunGh`, `TRACKED_FIELDS`. ~16 atomic commits (test:/feat: pairs).</done>
  <recovery>If a test stays RED after implementation: re-read cassette JSON to check that the response shape matches what the function expects. Common cause: forgetting to JSON-parse `cassette.response.stdout` before passing as `gh_state`.</recovery>
</task>

<task type="auto" tdd="strict">
  <name>Task 3: RED → GREEN — applyDrift + cmdGhPull CLI + df-tools wiring (A1-A4, C1-C7)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pull.cjs, plugins/devflow/devflow/bin/lib/gh-pull.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/templates/config.json</files>
  <action>
TDD habit 3: one test at a time, RED → GREEN.

**Functions to add to `gh-pull.cjs`:**

```javascript
// Re-use existing readers from lib/gh.cjs
const { readMappingV2 } = require('./gh.cjs');
// readSyncState lives in TRD 21-02; for 21-01, accept it as injectable parameter or stub via fs read
// PRAGMATIC: 21-01 reads .planning/.gh-sync-state.json directly via fs; TRD 21-02 will refactor to use sync-state.cjs

function _readSyncStateRaw(cwd) {
  const p = path.join(cwd, '.planning', '.gh-sync-state.json');
  if (!fs.existsSync(p)) return { version: 1, objectives: {} };
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return { version: 1, objectives: {} }; }
}

/**
 * applyDrift({ projectRoot, objectiveId, drift, ghIssue, ...opts })
 * Writes drifted fields into OBJECTIVE.md frontmatter. Refuses if conflict_suspected.
 * Returns { ok, applied: { field: value }, error? }
 */
function applyDrift({ projectRoot, objectiveId, drift, ghIssue, hasLastSync = true }) {
  if (drift.conflict_suspected) {
    return { ok: false, error: 'Conflict suspected — both sides changed. Re-run with --resolve=disk|gh|merge (see TRD 21-03).' };
  }
  if (!hasLastSync && !drift.first_sync) {
    return { ok: false, error: 'No prior sync state. Run `df-tools gh sync <objective>` first to establish baseline.' };
  }

  const objPath = path.join(projectRoot, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) return { ok: false, error: `OBJECTIVE.md not found: ${objPath}` };

  const content = fs.readFileSync(objPath, 'utf-8');
  const ghNorm = normalizeGhIssue(ghIssue);

  // Minimal frontmatter rewriter: parse YAML block, modify in place, preserve rest of file
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) return { ok: false, error: 'OBJECTIVE.md missing frontmatter block' };

  const yamlBlock = fmMatch[1];
  let newYaml = yamlBlock;
  const applied = {};

  for (const field of Object.keys(drift.fields)) {
    const ghVal = ghNorm[field];
    const serialized = serializeYamlValue(ghVal);
    // Match `<field>: ...` line OR insert if absent
    const lineRe = new RegExp(`^${field}:.*$`, 'm');
    if (lineRe.test(newYaml)) {
      newYaml = newYaml.replace(lineRe, `${field}: ${serialized}`);
    } else {
      newYaml = newYaml + `\n${field}: ${serialized}`;
    }
    applied[field] = ghVal;
  }

  const newContent = content.replace(fmMatch[0], `---\n${newYaml}\n---\n`);
  fs.writeFileSync(objPath, newContent, 'utf-8');
  return { ok: true, applied };
}

function serializeYamlValue(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(x => JSON.stringify(x)).join(', ') + ']';
  if (typeof v === 'string') return v;
  return String(v);
}

/**
 * cmdGhPull(cwd, args, raw) — CLI entry point.
 * Usage: df-tools gh pull <objective> [--apply] [--raw]
 */
function cmdGhPull(cwd, args, raw) {
  const objectiveId = args.find(a => !a.startsWith('--'));
  const apply = args.includes('--apply');

  if (!objectiveId) {
    process.stderr.write('Usage: df-tools gh pull <objective> [--apply]\n');
    process.exit(1);
    return;
  }

  // Reuse auth from lib/gh.cjs
  const { requireGhAuth } = require('./gh.cjs');
  try {
    requireGhAuth(['repo']);
  } catch (e) {
    if (e.name === 'GhAuthError') {
      process.stderr.write(JSON.stringify({ error: e.message, remediation: e.remediation, scopes_missing: e.scopes_missing }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    throw e;
  }

  const mapping = readMappingV2(cwd);
  const entry = mapping.objectives[objectiveId];
  if (!entry || !entry.issue_id) {
    output({ ok: false, error: `Objective ${objectiveId} has no GitHub issue. Run \`df-tools gh sync-objectives\` to create one before pulling.` }, raw, '');
    process.exit(1);
    return;
  }

  // Resolve issue ref from mapping + project ctx
  const projectFm = (() => {
    const p = path.join(cwd, '.planning', 'PROJECT.md');
    if (!fs.existsSync(p)) return {};
    return extractFrontmatter(fs.readFileSync(p, 'utf-8')) || {};
  })();
  const issueRef = `${projectFm.github_repo}#${entry.issue_id}`;

  const ghIssue = fetchGhIssue(issueRef);
  if (!ghIssue) {
    output({ ok: false, error: `Issue ${issueRef} not found on GitHub` }, raw, '');
    process.exit(1);
    return;
  }
  if (ghIssue._ok === false) {
    output({ ok: false, error: ghIssue.error }, raw, '');
    process.exit(1);
    return;
  }

  // Read disk frontmatter
  const objPath = path.join(cwd, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  const disk_fm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};

  // Read last sync state
  const syncState = _readSyncStateRaw(cwd);
  const last_sync_state = syncState.objectives[objectiveId] || null;

  const drift = detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });

  if (!drift.drift) {
    output({ ok: true, drift: false, message: 'No drift; planning state matches GitHub.' }, raw, 'No drift; planning state matches GitHub.');
    return;
  }

  if (apply) {
    if (drift.conflict_suspected) {
      output({ ok: false, drift: true, conflict_suspected: true, fields: drift.fields, hint: 'Both sides changed. Re-run with --resolve=disk|gh|merge (TRD 21-03).' }, raw, '');
      process.exit(1);
      return;
    }
    const applyResult = applyDrift({ projectRoot: cwd, objectiveId, drift, ghIssue, hasLastSync: last_sync_state != null });
    if (!applyResult.ok) {
      output({ ok: false, error: applyResult.error }, raw, '');
      process.exit(1);
      return;
    }
    output({ ok: true, drift: true, applied: applyResult.applied }, raw, `Applied ${Object.keys(applyResult.applied).length} field changes to OBJECTIVE.md.`);
    return;
  }

  // Report-only mode
  output({ ok: true, drift: true, fields: drift.fields, first_sync: drift.first_sync, hint: 'Re-run with --apply to write changes.' }, raw, formatDriftPretty(drift));
}

function formatDriftPretty(drift) {
  const lines = [];
  if (drift.first_sync) lines.push('First-time pull (no prior sync state):');
  else lines.push('Drift detected:');
  for (const [field, vals] of Object.entries(drift.fields)) {
    lines.push(`  ${field}:`);
    lines.push(`    disk: ${JSON.stringify(vals.disk)}`);
    lines.push(`    gh:   ${JSON.stringify(vals.gh)}`);
  }
  lines.push('');
  lines.push('Re-run with --apply to write changes to OBJECTIVE.md.');
  return lines.join('\n');
}

module.exports = { fetchGhIssue, detectDrift, applyDrift, cmdGhPull, normalizeGhIssue, _setRunGh, TRACKED_FIELDS };
```

**Wire into `df-tools.cjs`** — find the `case 'gh':` block (line ~784) and add `else if (subcommand === 'pull')` branch BEFORE the `else` (unknown subcommand) catch:

```javascript
} else if (subcommand === 'pull') {
  const { cmdGhPull } = require('./lib/gh-pull.cjs');
  cmdGhPull(cwd, args.slice(2), raw);
}
```

Update the error-message in the trailing `else`: add `pull` to the list.

**Update `templates/config.json`:**

```json
"github": {
  "enabled": false,
  "auto_pull_on_init": false,         // ← ADD (default false; v1.3+ may flip)
  "repo": "",
  ...
}
```

# CRITICAL: cmdGhPull MUST exit non-zero on conflict_suspected, missing-mapping, gh-not-found, auth-failure. CI scripts depend on exit codes.
# GOTCHA: applyDrift writes via fs.writeFileSync — NOT via atomicWrite. TRD 21-02 will refactor to use atomicWrite from sync-state.cjs.
# PATTERN: Match `cmdGhResolve`'s structure in lib/gh.cjs for output handling + auth-error formatting.
  </action>
  <verify>
```bash
# All A1-A4 + C1-C7 tests pass
node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs 2>&1 | grep -c "^ok"   # >=12 (A1-A4 + C1-C7 = 11; total with Task 2's 8 = 19)
node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs 2>&1 | grep -c "^not ok"   # 0

# CLI invocation works
node plugins/devflow/devflow/bin/df-tools.cjs gh pull 2>&1 | grep -E "Usage:"   # exit 1

# Full test suite still passes
npm test 2>&1 | tail -3   # 2053+ tests; +12-15 new

# Config has new slot
grep "auto_pull_on_init" plugins/devflow/devflow/templates/config.json   # exists
```
  </verify>
  <done>All A1-A4 + C1-C7 tests pass (~12 new tests). `df-tools gh pull --help` style usage emitted on missing args. `df-tools gh pull <obj>` works against cassette responses. `templates/config.json` has `github.auto_pull_on_init: false` slot. ~22-24 atomic commits total (test:/feat: pairs across Tasks 2 + 3). 2053 baseline tests still pass.</done>
  <recovery>If df-tools.cjs case-block edit conflicts with parallel TRD 21-04: read both TRDs' `<files>` lists, edit `case 'gh':` block (21-01 territory) and `case 'defaults-table':` block (21-04 territory) sequentially. Two distinct edits; no merge conflict possible if edits target disjoint cases. If template/config.json conflict: 21-01 owns `github.*` keys; 21-04 owns nothing in templates/config.json — no conflict.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<lint>(none — no lint command per CLAUDE.md)</lint>
<build>(none — Node CommonJS, no build step)</build>
</validation_gates>

<verification>
1. **Required files exist:**
   - `plugins/devflow/devflow/bin/lib/gh-pull.cjs` (>=200 lines)
   - `plugins/devflow/devflow/bin/lib/gh-pull.test.cjs` (>=300 lines)
   - `plugins/devflow/devflow/bin/lib/__fixtures__/gh-pull-fixtures.cjs` (>=80 lines)
   - 4 cassette JSON files under `gh-pull-cassettes/`
2. **Tests pass:**
   - `node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs` — all green
   - F1-F3 + D1-D5 + A1-A4 + C1-C7 = 19 named tests
3. **Full suite still passes:** `npm test` shows ≥2053 passing.
4. **CLI wired:** `df-tools gh pull` (no args) exits 1 with usage message.
5. **Config scaffolded:** `templates/config.json` has `github.auto_pull_on_init: false`.
6. **Pattern reuse:** No duplication of `requireGhAuth` (imported from `lib/gh.cjs`); no duplication of `_runGh` shape (mirrored, not imported, since each module owns its own injection seam).
7. **Atomic commits:** ≥18 commits with `test(21-01):` / `feat(21-01):` prefixes.
</verification>

<success_criteria>
- [ ] `df-tools gh pull <objective>` reads GH state, reports drift; exits 0 if no drift, prints diff if drift, exits 1 if conflict-suspected
- [ ] `df-tools gh pull <objective> --apply` writes drifted GH fields into OBJECTIVE.md frontmatter (status, labels, assignees, milestone)
- [ ] No GH issue mapping → exit 1 with hint to run `gh sync-objectives`
- [ ] All gh CLI calls go through `_runGh` injection seam; tests use cassette JSON exclusively
- [ ] `templates/config.json` has `github.auto_pull_on_init: false` scaffolded slot
- [ ] 19 new tests passing (F/D/A/C groups), 2053 baseline tests still passing
- [ ] ≥18 atomic test:/feat: commits, ≥1 fixture-build commit
</success_criteria>

<output>
After completion, create `.planning/objectives/21-bidirectional-gh-sync/21-01-gh-pull-cli-SUMMARY.md` per `@/Users/markemerson/.claude/devflow/templates/summary.md`.
</output>

---
objective: 02-cross-repo-awareness-layer
title: Cross-repo awareness layer (peer + org views)
created: 2026-05-04
status: locked
tracks: AO-Cyber-Systems/devflow-claude#11
parent_issue: AO-Cyber-Systems/devflow-claude#9
---

# Objective 2 — Locked Context

This file captures user decisions that are **LOCKED** for the planner. Do not re-litigate. Do not propose alternatives. Implement exactly.

## Goal

Two-fold awareness so a developer at any worktree sees (a) what teammates are working on right now and (b) how their work fits into the org's larger progress. **No new storage backend** — git is the storage for peer awareness; the org Product Roadmap project (already populated, walkable via obj 1's resolver) is the storage for org progress. A single `df:awareness` skill renders both views.

## What's already built (obj 1 surface in `plugins/devflow/devflow/bin/lib/gh.cjs`)

The v1.1 obj 1 ship lays down the GitHub primitives obj 2 builds on. **DO NOT recreate**:

- `resolveChain(frontmatter, projectCtx)` — walks ONE objective's chain (parent → roadmap → project). Obj 2 reuses this for the per-item walk in `scanOrg`.
- `requireGhAuth(requiredScopes)` — hard-fail auth check. Throws `GhAuthError` with `remediation` + `scopes_missing`. Obj 2's `scanOrg` calls this BEFORE any GraphQL calls.
- `_setRunGh(fn)` — test injection hook (production calls `_runGh`). Obj 2's `scanOrg` and helpers reuse this exact pattern; tests inject mocks via the same hook.
- `runGh(args, opts)` — internal spawnSync wrapper. Obj 2 helpers go through `_runGh` (via `_setRunGh` injection).
- `findRoadmapIssue(repo)` — reusable helper for repo-level [Roadmap] lookup.
- `PRODUCT_ROADMAP_FIELDS` — module-init constant loaded from `__fixtures__/gh-cassettes/product-roadmap-fields.json`. Carries Status/Product/Quarter field IDs and option IDs. Obj 2's `scanOrg` reads `_project_id` (= `'PVT_kwDODwqLrc4BRsOP'`) as the default org project.
- `__fixtures__/gh-fixtures.cjs` — hand-built fixture builders (`buildMockRunGh`, `buildGhResponse_*`). Obj 2 extends this file with awareness-specific builders (`buildGhResponse_projectItemsList`, `buildGhResponse_subIssuesByTrackedIssues`, `buildGhResponse_subIssuesByTaskList`).
- `__fixtures__/gh-cassettes/` — committed JSON cassettes (`devflow-claude-9-walk.json`, `product-roadmap-fields.json`). Obj 2 adds `product-roadmap-walk.json` (TRD 02-07 captures live).

**Obj 2 EXTENDS `lib/gh.cjs` with ONE new helper (`walkProject(projectId)`)** — that's the only co-modification of obj 1's central file. All other obj 2 logic lives in the new `lib/awareness.cjs` module.

Hooks scaffold from obj 1 territory (do NOT recreate, but DO register a new hook):
- `plugins/devflow/hooks/inject-org-context.js` (obj 1 draft) — already wired to spawn a resolver but for ONE objective. Obj 2's awareness hook is a separate, fire-and-forget cache populator (different concern; doesn't replace inject-org-context.js).
- `plugins/devflow/hooks/hooks.json` — `SessionStart` array. Obj 2 appends ONE entry.

## Locked decisions (from ROADMAP §"Objective 2: Cross-repo awareness layer")

### 1. Git is the storage for peer awareness

**No new repo, no new schema.** `.planning/STATE.md` on each remote branch is the source of truth for that branch's session state. `scanPeer` walks `origin/*` refs after `git fetch --all --prune` (unless `--no-fetch`). For each branch, `git show origin/<branch>:.planning/STATE.md` extracts the state markdown; `parseStateMd(content)` parses it.

**Implication:** Peer visibility = pushed branches only. Documented limitation (locked decision #9 below).

### 2. Read-side aggregation, not write-side daemon

Developers don't push more than they already do. Both scanners are pull-only — no heartbeat daemon, no debounced writers, no shared write store. The data SOURCE is already there (git refs + GitHub Project); obj 2 is purely a read-path.

This explicitly drops the heartbeat-daemon approach from `cross-session-coordination.md` §"Active-session heartbeat". The simplification is: heartbeat schema becomes a **read-time aggregation** of git-branch state.

### 3. Org progress reuses obj 1's resolver primitives

`lib/gh.cjs::resolveChain` walks ONE objective. Obj 2 adds **`walkProject(projectId)`** to `lib/gh.cjs` — iterates ALL items in the org Product Roadmap project, then walks each item's sub-issues one hop deep. `walkProject` lives in `lib/gh.cjs` (the GH-API module), `scanOrg` (which composes `walkProject` + per-item enrichment) lives in `lib/awareness.cjs`.

**The GraphQL contract for `walkProject`:**

```graphql
query($projectId: ID!, $cursor: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          content {
            ... on Issue { number title repository { nameWithOwner } body trackedIssues(first: 20) { totalCount nodes { number title repository { nameWithOwner } state } } }
            ... on DraftIssue { title body }
          }
          fieldValues(first: 10) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
              ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }
            }
          }
        }
      }
    }
  }
}
```

`walkProject` paginates via `pageInfo.endCursor` until `hasNextPage=false`. Returns flat array of `{ item_type: 'issue'|'draft', issue_ref?, title, body, product, quarter, status, sub_issues: [...] }`.

Sub-issues come from `trackedIssues` GraphQL field FIRST. When `trackedIssues.totalCount === 0` (which is the common case per spike findings — all 9 [Roadmap] issues have `totalCount: 0` and use prose lists), fall back to **task-list bullet parser** on the issue body: matches `- [ ]` / `- [x]` lines that include an issue ref pattern (`owner/repo#NN` or `#NN`).

### 4. Single skill, two sections

`/devflow:awareness` renders peer (git-branch) view and org (Project-board) view side by side. Default shows both; flags filter:
- `--peer-only` — peer section only
- `--org-only` — org section only
- `--quarter Q2-2026` — filter org section by Quarter custom field (case-insensitive substring match)
- `--product DevFlow` — filter org section by Product custom field (case-insensitive exact match)
- `--refresh` — force re-fetch both sections (bypass TTL)
- `--refresh peer` / `--refresh org` — force re-fetch one section only
- `--no-fetch` — skip `git fetch --all --prune` for the peer scanner (offline mode)
- `--raw` — emit raw JSON to stdout instead of formatted markdown

### 5. Single cache file, namespaced

`.planning/.awareness-cache.json` (gitignored — TRD 02-04 adds the line to `.gitignore`). Shape:

```json
{
  "peer": {
    "fetched_at": "2026-05-04T12:34:56Z",
    "branches": [ { "branch": "feature/foo", "objective": "...", "trd": "...", "last_commit": "...", "github_issue": "...", "developer": "..." } ]
  },
  "org": {
    "fetched_at": "2026-05-04T12:34:56Z",
    "project_id": "PVT_kwDODwqLrc4BRsOP",
    "items": [ { "issue_ref": "...", "title": "...", "product": "...", "quarter": "...", "status": "...", "sub_issues": [...] } ]
  }
}
```

Each section carries its own `fetched_at` timestamp. **TTL = 10 minutes default**, configurable via `awareness.cache_ttl_minutes` in `.planning/config.json` (TRD 02-04 reads this; falls back to 10).

### 6. Local-repo scope for peer awareness

`scanPeer` walks `origin/*` of the CURRENT repo only. **Cross-repo peer awareness is OUT OF SCOPE for v1.1** (obj 5 + obj 6 territory). A teammate working in `aodex` while you're in `devflow-claude` is invisible to your `df:awareness` peer view. Documented in skill help.

### 7. Org-scope = Product Roadmap project + 1 hop sub-issues

`walkProject` iterates project items and walks each item's DIRECT sub-issues (1 hop). Going deeper (sub-sub-issues, TRD-level rollup) is obj 8 (TUI) territory and explicitly OUT OF SCOPE.

### 8. No "blocked_on_user" / handoff state

That's obj 7 (already shipped — handoff watcher PR #19). Awareness here is purely informational. Peer scanner does NOT parse STATE.md for handoff fields; only objective/TRD/last-commit fields.

### 9. Stale = invisible (peer side)

A dev who hasn't pushed in **N days** (default: 30, configurable via `awareness.peer_stale_days`) is invisible. Branches matching the stale window are filtered out by `scanPeer`. **Documented limitation:** push for visibility. Render in skill help.

Stale check uses the most-recent commit timestamp on `origin/<branch>` (`git log -1 --format=%cI origin/<branch>`).

### 10. Hard-fail on org-side gh auth

Reuses obj 1's `requireGhAuth(['project', 'read:project', 'repo'])`. Same remediation surface — `gh auth refresh -h github.com -s project,read:project,repo`. Peer-side has NO gh dep so works offline (only needs `git`).

`scanOrg` calls `requireGhAuth` as its first action. Failure throws `GhAuthError`; the skill surfaces the structured error to the user.

## Module surface (locked, per ROADMAP SC-9)

After all v1.1 obj 2 TRDs land, `lib/awareness.cjs` exports:

```js
module.exports = {
  // Pure logic (TDD'd):
  parseStateMd,                     // (content: string) => { objective, trd, branch_objective, ... } | null
  aggregateOrgByProductQuarter,     // (items: array) => { [Product]: { [Quarter]: items[] } }

  // Scanners:
  scanPeer,                         // (opts) => { branches: [...], warnings, fetched_at }
  scanOrg,                          // (opts) => { items: [...], warnings, fetched_at }

  // Cache:
  readCache,                        // (path) => { peer?, org? } | null
  writeCache,                       // (path, sections) => void
  isStale,                          // (fetched_at: ISO, ttl_minutes: number) => boolean

  // Test hooks:
  _setRunGit,                       // (fn) => void  // mirrors _setRunGh from gh.cjs
  _resetGitMock,                    // () => void

  // Constants:
  AWARENESS_CACHE_REL,              // '.planning/.awareness-cache.json'
  DEFAULT_TTL_MINUTES,              // 10
  DEFAULT_STALE_DAYS,               // 30
  DEFAULT_BRANCH_PATTERNS,          // ['feature/*', 'df/*', 'fix/*', 'proposal/*']
};
```

`lib/gh.cjs` adds ONE export (TRD 02-03):

```js
walkProject,                        // (projectId, opts) => { items: [...], warnings }
```

All scanner/cache functions take **parsed objects, not raw paths** — unit-testable with fixtures, no live calls in unit suite. `scanPeer` uses `_setRunGit` injection; `scanOrg` (and `walkProject`) reuse obj 1's `_setRunGh`.

## CLI surface (locked, per ROADMAP SC-1, SC-3, SC-6)

`df-tools awareness <subcommand>`:

- `df-tools awareness scan-peer [--no-fetch] [--raw]` — runs `scanPeer`, emits structured JSON to stdout
- `df-tools awareness scan-org [--raw]` — runs `scanOrg`, emits structured JSON to stdout
- `df-tools awareness show [--peer-only|--org-only] [--quarter Q] [--product P] [--refresh [peer|org]] [--no-fetch] [--raw]` — full skill backend; reads cache (TTL-honored unless `--refresh`), emits formatted markdown OR raw JSON

The skill (TRD 02-05) `/devflow:awareness` invokes `df-tools awareness show` with arg passthrough.

## STATE.md parsing (locked, per ROADMAP SC-1)

`parseStateMd(content)` extracts the following fields (heuristic-based, fault-tolerant):

| Field | Source pattern | Required? |
|---|---|---|
| `objective` | `**Objective in flight:** N — name` OR `**Objective:** N` (first match) | Optional |
| `objective_complete` | `**Objective complete:** N — name (verified ...)` | Optional (multiple) |
| `trd` | `**Current TRD:** NN-NN` | Optional |
| `branch` | `**Branch:** \`name\`` | Optional |
| `github_issue` | `github_issue: ref` (anywhere in content) | Optional |
| `developer` | git-config `user.name` (NOT from STATE.md) | Set by scanner caller |
| `last_commit` | Set by scanner caller from `git log -1 origin/<branch>` | Set by scanner caller |

**Fault-tolerance:** When STATE.md is malformed (no recognizable fields, or file too short), `parseStateMd` returns `null` — caller (scanner) skips this branch and logs a warning. **Branches without `.planning/STATE.md` silently skipped (no warning).** Locked behavior per SC-2.

## File-region ownership for `lib/awareness.cjs`

`lib/awareness.cjs` is created in TRD 02-01 and EXTENDED across waves. Each TRD owns a documented region; wave sequencing prevents merge conflicts. **No two TRDs touching `lib/awareness.cjs` run in the same wave.**

Region ownership (locked):

| Region | Owner TRD | Wave |
|---|---|---|
| Module skeleton (header, requires, constants) | 02-01 | 1 |
| `parseStateMd` + `aggregateOrgByProductQuarter` | 02-01 | 1 |
| `readCache`, `writeCache`, `isStale`, cache constants | 02-04 | 2 |
| `scanPeer`, `_setRunGit`, `_resetGitMock` | 02-02 | 3 |
| `scanOrg` (composes `walkProject` from gh.cjs) | 02-03 | 4 |
| `module.exports` block (final lock) | 02-07 | 7 |

TRDs 02-01, 02-04, 02-02, 02-03 each end their wave with a partial `module.exports` containing ONLY the symbols they introduced. TRD 02-07 finalizes the export surface (asserts all 13 expected exports present).

## Wave structure (LOCKED)

Per `feedback_planner_proto_conflict` memory: planner under-encodes file-level co-modification. The orchestrator MUST sequence TRDs touching the same file even when `depends_on=[]` would suggest parallelism.

`lib/awareness.cjs` is touched by 5 TRDs (02-01, 02-02, 02-03, 02-04, 02-07). `lib/gh.cjs` is touched by 1 TRD (02-03). **No two of these run in the same wave.**

| Wave | TRD | Files touched | Notes |
|---|---|---|---|
| 1 | 02-01 | awareness.cjs (skeleton + parser), awareness-fixtures.cjs (NEW), awareness.test.cjs (NEW) | Foundation; no other TRD touches awareness.cjs in this wave |
| 2 | 02-04 | awareness.cjs (cache region), awareness.test.cjs, .gitignore | Cache layer; solo |
| 3 | 02-02 | awareness.cjs (peer scanner region), awareness.test.cjs, awareness-fixtures.cjs | Peer scanner; solo |
| 4 | 02-03 | awareness.cjs (org scanner region), gh.cjs (walkProject helper), gh.test.cjs, awareness.test.cjs, gh-fixtures.cjs | Org scanner; co-modifies gh.cjs (the only co-mod) |
| 5 | 02-05 | df-tools.cjs (subcommand routing), skills/awareness/SKILL.md (NEW) | Skill + CLI dispatch; reads awareness surface |
| 6 | 02-06 | hooks/awareness-cache-populate.js (NEW), hooks/hooks.json, lib/init.cjs (plan + execute init refresh wiring) | Lifecycle integration; SessionStart hook + plan/exec entry refresh |
| 7 | 02-07 | awareness.cjs (export lock), awareness.test.cjs (integration + cassette tests), __fixtures__/gh-cassettes/product-roadmap-walk.json (NEW) | Final integration; live cassette capture under GH_INTEGRATION=1 |

**Why 7 waves?** Five TRDs touch `lib/awareness.cjs` and one co-modifies `lib/gh.cjs`. Each wave's TDD cycle gets a stable baseline. Total objective execution time is dominated by the file-conflict serialization, not by individual TRD complexity.

## TRD types (locked, not auto-derived)

Per the user's CLAUDE.md TDD Playbook directives: code-shipping work is TDD by default. Documentation and prompt-only TRDs are standard.

| TRD | Type | Reason |
|---|---|---|
| 02-01 — STATE.md parser + fixtures scaffold | `tdd` | Pure parser logic with structured input/output. Fixture-builder task ahead of first behavior test. |
| 02-02 — Peer scanner | `tdd` | Pure logic; git output mocked via `_setRunGit`. |
| 02-03 — Org scanner + walkProject | `tdd` | Pure logic; gh output mocked via obj 1's `_setRunGh`. Co-modifies gh.cjs (gated by wave 4). |
| 02-04 — Cache layer | `tdd` | Pure logic; fs output mocked via tmp-dir fixtures. TTL math is unit-testable. |
| 02-05 — Skill + CLI subcommand routing | `standard` | SKILL.md is markdown prompt; CLI dispatch is glue. No new feature logic; tested transitively via existing scanner tests. |
| 02-06 — Lifecycle integration (SessionStart hook + plan/execute refresh wiring) | `tdd` | Hook lifecycle (populate-if-missing, fire-and-forget, doesn't block) is testable; init.cjs additions are pure logic. |
| 02-07 — Library export lock + integration tests + cassette capture | `tdd` | Integration tests gated on env vars; cassette regen is a captured fixture. |

## Anti-pattern constraints (honored across all TDD TRDs)

From the resolver's defaults table (and project memory `feedback_005_preserve_all_functionality`):

- `no_llm_test_data` — All test fixtures must be hand-built factory functions (`__fixtures__/awareness-fixtures.cjs`) or recorded cassettes (`__fixtures__/gh-cassettes/product-roadmap-walk.json`). NO AI-generated sample data.
- `no_property_based_default` — Suppress property-based testing recommendations. Tests use enumerated cases.
- `no_gherkin_layer` — No Gherkin/BDD syntax. Use descriptive test names directly.
- **Multitenancy guard NOT applicable** — single-user CLI tool, single-org context (AO-Cyber-Systems). The `wrong-tenant assertion` requirement does NOT apply to obj 2 tests.
- **Outside-in NOT applicable** — pure-logic scanners + cache + lifecycle hook; no UI/portal flows. Tests start at unit level (parser, scanner functions).

## TDD discipline for tdd-typed TRDs (apply to 02-01, 02-02, 02-03, 02-04, 02-06, 02-07)

Per CLAUDE.md TDD Playbook:

- **Test list first**: include a `## Test list` section in TRD body listing behavior cases (happy path + edge + failure mode) BEFORE any test code is written.
- **Fixture builders as their own task** ahead of the first behavior test. Hand-built factory functions in `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` style — no `faker`, no AI-completed sample data. Reuse + extend `gh-fixtures.cjs` for org-side mocks.
- **Recorded gh cassettes for live-API tests** captured once and committed at `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-walk.json`. Live-API tests run only when `GH_INTEGRATION=1` is set; default `npm test` skips them.
- **Recorded git-fixture clones for live-git tests** built in tmp dirs by `buildGitFixtureRepo()` (defined in TRD 02-01's fixtures scaffold). Tests run only when `GIT_INTEGRATION=1` is set; default skips.
- **One test at a time** RED → GREEN → REFACTOR. No batching.
- **Atomic commits per TDD TRD**: 2-3 commits (`test:` → `feat:` → optional `refactor:`).

## Discretion areas (planner / executor decides)

- Sub-task granularity within each TRD (within the 2-3 task budget).
- Specific GraphQL pagination cursor handling in `walkProject` (any approach that exits cleanly when `hasNextPage=false`).
- Test cassette format details (recommend: same shape as obj 1's cassettes — `{ "data": { ... } }` GraphQL response envelope).
- Whether to add `awareness.*` config fields to `.planning/config.json` schema docs in TRD 02-04 or leave them undocumented (recommend the former — minimal docs in `templates/config.json`).
- Test runner organization: append to `awareness.test.cjs` (single test file per module — same as `gh.test.cjs` style).

## Out of scope for v1.1 (planner must NOT include)

- Cross-repo peer awareness (teammate working in another repo) — obj 5/6 territory.
- Real-time / push notifications — v1.2 (needs a daemon).
- Duplicate-work detection — obj 4 consumes this scanner's output but the detector itself is obj 4.
- Initiative-level rollup with planner-readable Why/Open-questions — obj 5.
- Unified todo aggregation — obj 6.
- TUI rendering — obj 8.
- Multi-org visibility (only walks the org configured in `awareness.org_project_id`).
- Persistent cache across df-tools invocations is OK (this differs from obj 1's resolver which is per-process). Awareness cache is a disk file; obj 1's resolver was in-memory.
- `--refresh peer` and `--refresh org` semantics MUST allow refreshing one section without invalidating the other (locked decision #5).

## Goal-backward verification

Every TRD MUST include `must_haves` mapping to the 10 success criteria below (reproduced from ROADMAP §"Objective 2"). Each requirement ID (SC-1 through SC-10) MUST appear in at least one TRD's `requirements` frontmatter field.

1. **SC-1**: `df-tools awareness scan-peer` walks `origin/*` refs (after `git fetch --all --prune` unless `--no-fetch`) and returns structured JSON; per branch with `.planning/STATE.md`, parsed objective-in-flight, current TRD, last commit timestamp, branch name, github_issue ref. Branches matching configurable patterns; ignores branches > 30 days stale; ignores `main`/`master`/`HEAD`.
2. **SC-2**: Scanner is fault-tolerant — branches without `.planning/STATE.md` silently skipped; malformed STATE.md logs warning and continues; works offline with `--no-fetch`.
3. **SC-3**: `df-tools awareness scan-org` walks the org Product Roadmap project and returns hierarchical JSON: project items grouped by Product × Quarter, each item's direct sub-issues with status. Reuses obj 1's GraphQL chain helpers.
4. **SC-4**: Org walker fetches each item's `Status`, `Product`, `Quarter` custom fields. Sub-issues fetched via `trackedIssues` GraphQL field; falls back to parsing task-list bullet items in the issue body when sub-issues aren't used.
5. **SC-5**: Hard-fails (via `requireGhAuth`) on missing scopes; silent on items the auth'd user can't see.
6. **SC-6**: `/devflow:awareness` skill renders both views. Default: peer first (sorted by recency), then org (grouped by Product × Quarter, then sub-issues). Filters: `--peer-only`, `--org-only`, `--quarter Q2-2026`, `--product DevFlow`.
7. **SC-7**: Single cache file `.planning/.awareness-cache.json` with `peer` + `org` namespaced sections, each carrying its own `fetched_at` timestamp. Default 10-min TTL each; `--refresh` flag forces re-fetch of both; `--refresh peer` / `--refresh org` for single-namespace refresh.
8. **SC-8**: Cache lifecycle: SessionStart hook populates cache IF missing/expired (fire-and-forget, non-blocking); `/df:plan-objective` entry force-refreshes; `/df:execute-objective` entry force-refreshes before first wave; manual `/devflow:awareness` reads TTL-based.
9. **SC-9**: `lib/awareness.cjs` exports stable surface: `scanPeer(opts)`, `scanOrg(opts)`, `parseStateMd(content)`, `aggregateOrgByProductQuarter(scans)`, `readCache(path)`, `writeCache(path, sections)`. `scanPeer` uses `_setRunGit` injection; `scanOrg` uses obj 1's `_setRunGh`.
10. **SC-10**: Round-trip integration tests gated on `GIT_INTEGRATION=1` (peer side: 2 fixture branches in tmp clones) AND `GH_INTEGRATION=1` (org side: live walk of Product Roadmap; cassettes captured to `__fixtures__/gh-cassettes/product-roadmap-walk.json`).

## GitHub tracking

- **Issue:** [devflow-claude#11](https://github.com/AO-Cyber-Systems/devflow-claude/issues/11) (sub-issue of #9)
- **Gates:** #13 (duplicate-work detection — consumes peer scanner), #14 (initiative context layer — extends org walker), #15 (unified df:check-todos — aggregates this), #17 (TUI — renders this)
- **Branch:** `feature/v1.1-obj-2-heartbeat` off `feature/v1.1` (don't push to origin until objective complete)

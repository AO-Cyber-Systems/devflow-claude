---
objective: 01-github-coordination-layer
trd: 01-02
title: Resolver chain walk — `df-tools gh resolve <objective>` + lib/gh.cjs chain helpers
type: tdd
confidence: high
wave: 2
depends_on: [01-01]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/.gitkeep
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements: [SC-2, SC-3, SC-6]
verification_commands:
  - "npm test"
  - "git log --oneline feature/v1.1 -- plugins/devflow/devflow/bin/lib/gh.cjs plugins/devflow/devflow/bin/lib/gh.test.cjs | grep -E '^[a-f0-9]+ test\\(' | head -1"
  - "node -e 'const gh=require(\"./plugins/devflow/devflow/bin/lib/gh.cjs\"); if(typeof gh.resolveChain!==\"function\") throw new Error(\"resolveChain not exported\"); if(typeof gh.findRoadmapIssue!==\"function\") throw new Error(\"findRoadmapIssue not exported\"); if(typeof gh.addToProject!==\"function\") throw new Error(\"addToProject not exported\"); if(typeof gh.linkSubIssue!==\"function\") throw new Error(\"linkSubIssue not exported\"); console.log(\"OK\");'"
  - "node plugins/devflow/devflow/bin/df-tools.cjs gh resolve --help 2>&1 | grep -q 'resolve'"

must_haves:
  truths:
    - "resolveChain(frontmatter, projectCtx) returns a structured object with shape: { objective, github_issue, parent_issue, roadmap_issue, org_initiative, org_project, milestone, provenance, warnings }"
    - "Each field in result.provenance is one of: 'frontmatter' | 'inherited_from_project' | 'walked_from_parent' | 'absent' | 'cached'"
    - "Shorthand `#NN` in frontmatter resolves against projectCtx.github_repo to full owner/repo#NN form in the result"
    - "When github_repo is missing AND shorthand is used, the result keeps the literal `#NN` and adds a warning"
    - "Per-process in-memory cache: a second call to resolveChain with same objective key returns immediately without re-walking; cache populated within a single df-tools invocation"
    - "_resetCache() helper clears the cache for tests"
    - "findRoadmapIssue(repo) returns 'owner/repo#NN' when an open issue with title containing '[Roadmap]' exists, null otherwise"
    - "addToProject(issueRef, projectId) and linkSubIssue(parentRef, childRef) take parsed object args and return { ok, ... } shapes; mocked in unit tests, real gh calls only when GH_INTEGRATION=1"
    - "df-tools gh resolve <objectiveId> CLI subcommand emits the resolveChain output as JSON to stdout"
    - "All new tests have test: commits before feat: commits per TDD Playbook"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/gh.cjs"
      provides: "Extended exports: resolveChain, findRoadmapIssue, addToProject, linkSubIssue, cmdGhResolve. Per-process cache with _resetCache."
      exports: ["resolveChain", "findRoadmapIssue", "addToProject", "linkSubIssue", "cmdGhResolve", "_resetCache", "ghStatus", "cmdGhStatus", "cmdGhSyncObjectives", "cmdGhComment", "cmdGhCloseIssue", "cmdGhSyncRelease"]
    - path: "plugins/devflow/devflow/bin/lib/gh.test.cjs"
      provides: "Unit tests for resolveChain, provenance, shorthand resolution, cache, findRoadmapIssue. Mocked runGh for unit suite."
      contains: "resolveChain"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs"
      provides: "Hand-built fixture builders: buildFrontmatter, buildProjectCtx, buildGhResponse (cassette loader)."
      contains: "function buildFrontmatter"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "Routes `gh resolve <objectiveId>` subcommand to cmdGhResolve."
      contains: "cmdGhResolve"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/gh.cjs::resolveChain"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::runGh"
      via: "gh CLI invocations for parent_issue lookup, project membership, milestone fields"
      pattern: "runGh\\("
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::cmdGhResolve"
      via: "Subcommand routing in the gh dispatch switch"
      pattern: "cmdGhResolve|gh resolve"
    - from: "plugins/devflow/devflow/bin/lib/gh.test.cjs"
      to: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs"
      via: "require + use buildFrontmatter / buildProjectCtx in test setup"
      pattern: "require.*gh-fixtures"
---

<objective>
Extend `lib/gh.cjs` with the resolver chain walk: `resolveChain(frontmatter, projectCtx)` walks objective → repo `[Roadmap]` issue → org Product Roadmap project entry, returning a structured object with per-field provenance. Add helper exports `findRoadmapIssue(repo)`, `addToProject(issueRef, projectId)`, `linkSubIssue(parentRef, childRef)` and CLI surface `df-tools gh resolve <objectiveId>`.

Purpose: Closes objective-1 success criteria 2, 3, and partial 6. This is the **soak-period TRD** for the new `lib/gh.cjs` schema — it ships ALONE in Wave 2 so the resolver shape can stabilize before TRDs 01-03, 01-04, 01-05 lock onto it. Mirror `lib/intent.cjs::resolve()`'s style for sources/provenance/cache so the two resolvers feel consistent to consumers (planner agent, etc.).

Output: Extended `lib/gh.cjs` with 5 new exports + per-process cache. New `gh.test.cjs` with mocked `runGh` for unit tests. New `__fixtures__/gh-fixtures.cjs` for hand-built test data. New `__fixtures__/gh-cassettes/` directory (empty for now; populated in TRD 01-06's integration test). New `df-tools gh resolve` subcommand routing.

Why TDD: pure-logic structured-input/output transformation with mockable boundaries (`runGh` is the only external surface). Matches CLAUDE.md TDD Playbook habits 2 (test list first) and 4 (fixture builders).
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── gh.cjs                              ← MODIFY (add resolveChain + 4 helpers + cache + cmdGhResolve)
├── gh.test.cjs                         ← CREATE (RED tests first; mocked runGh)
└── __fixtures__/
    ├── gh-fixtures.cjs                 ← CREATE (hand-built factory functions)
    └── gh-cassettes/
        └── .gitkeep                    ← CREATE (placeholder for TRD 01-06 cassettes)

plugins/devflow/devflow/bin/
└── df-tools.cjs                        ← MODIFY (route `gh resolve` subcommand to cmdGhResolve)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

## Test list

Per CLAUDE.md TDD Playbook habit 2 — write the behavior-cases checklist before any test code. Each bullet is a planned test case in `gh.test.cjs`. Order corresponds to RED-GREEN-REFACTOR sequence below.

**Group A — `resolveChain` happy path with full-ref frontmatter (`describe('resolveChain — full ref')`)**
- A1 happy path: frontmatter `{ github_issue: 'AO-Cyber-Systems/devflow-claude#10', parent_issue: 'AO-Cyber-Systems/devflow-claude#9' }` + projectCtx `{ github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' }` → result has `github_issue === 'AO-Cyber-Systems/devflow-claude#10'`, `parent_issue === 'AO-Cyber-Systems/devflow-claude#9'`, `org_project === 'PVT_kwDODwqLrc4BRsOP'`, `provenance.github_issue === 'frontmatter'`, `provenance.parent_issue === 'frontmatter'`, `provenance.org_project === 'inherited_from_project'`.
- A2 happy path: when frontmatter has no `org_project` but projectCtx does, result has `org_project === projectCtx.org_project` and `provenance.org_project === 'inherited_from_project'`.
- A3 happy path: when frontmatter has its own `org_project`, that value wins and `provenance.org_project === 'frontmatter'`.

**Group B — Shorthand resolution (`describe('resolveChain — shorthand')`)**
- B1 happy: frontmatter `parent_issue: '#9'` + projectCtx `github_repo: 'AO-Cyber-Systems/devflow-claude'` → result `parent_issue === 'AO-Cyber-Systems/devflow-claude#9'`, `provenance.parent_issue === 'frontmatter'` (still frontmatter — provenance describes WHERE the value came from before resolution; shorthand is a normalization step within the frontmatter source).
- B2 happy: frontmatter `github_issue: '#10'` + projectCtx `github_repo: 'AO-Cyber-Systems/devflow-claude'` → result `github_issue === 'AO-Cyber-Systems/devflow-claude#10'`.
- B3 edge: frontmatter `parent_issue: '#9'` + projectCtx with NO `github_repo` → result `parent_issue === '#9'` (literal, unresolved), `result.warnings` contains an entry mentioning the field name and that github_repo is missing.
- B4 edge: frontmatter has both shorthand AND projectCtx has wrong-format `github_repo` (e.g., `github_repo: 'just-some-name'` not `owner/name`) → warnings include malformed github_repo notice; field stays as shorthand literal.

**Group C — Absent fields and provenance vocabulary (`describe('resolveChain — absent fields')`)**
- C1: frontmatter `{}` (empty) + projectCtx `{}` → result has all chain fields populated as either `null` or undefined, `provenance.github_issue === 'absent'`, `provenance.parent_issue === 'absent'`, `provenance.org_project === 'absent'`, `provenance.org_initiative === 'absent'`.
- C2: provenance values are exactly one of: `'frontmatter'`, `'inherited_from_project'`, `'walked_from_parent'`, `'absent'`, `'cached'`. No other strings allowed.
- C3: `result.warnings` is always an array (empty when no warnings).

**Group D — Walk to roadmap_issue + milestone (`describe('resolveChain — walk to parent + milestone')`)** — *uses mocked runGh*
- D1: when frontmatter has `parent_issue: 'owner/repo#9'`, mocked runGh for `gh issue view 9 --repo owner/repo --json title,projectItems` returns title containing `[Roadmap]` → result `roadmap_issue === 'owner/repo#9'`, `provenance.roadmap_issue === 'walked_from_parent'`.
- D2: when parent_issue's gh response shows it's in a Project v2 (mocked GraphQL response), the milestone fields (Product, Quarter, Status, draft_or_issue_ref) populate `result.milestone.{product, quarter, status, draft_or_issue_ref}`, with `provenance.milestone === 'walked_from_parent'`.
- D3: when frontmatter has no parent_issue but `findRoadmapIssue` returns a hit for the repo, result `roadmap_issue === <hit>`, `provenance.roadmap_issue === 'walked_from_parent'`. (Fallback path.)
- D4: when both are absent, result `roadmap_issue === null`, `provenance.roadmap_issue === 'absent'`.

**Group E — `findRoadmapIssue` (`describe('findRoadmapIssue')`)**
- E1 happy: mocked runGh for `gh issue list --repo owner/repo --state open --search "[Roadmap] in:title" --json number,title --limit 5` returns `[{ number: 9, title: '[Roadmap] devflow-claude' }]` → returns `'owner/repo#9'`.
- E2 edge: mocked response empty array `[]` → returns `null`.
- E3 edge: mocked response has multiple hits → returns the lowest-number issue (deterministic) and adds a warning to a future caller (warning surfaced via a sibling helper or just documented; for this test, returns the lowest-number ref).
- E4 failure: mocked runGh returns `ok: false` → returns `null` (and `resolveChain`'s caller decides whether to warn).

**Group F — `addToProject` and `linkSubIssue` (`describe('addToProject / linkSubIssue')`)** — *all mocked, no live calls*
- F1 addToProject happy: mocked GraphQL `addProjectV2ItemById` mutation succeeds → returns `{ ok: true, item_id: 'PVTI_xxx' }`.
- F2 addToProject failure: mocked mutation returns `errors: [{ message: 'not_authorized' }]` → returns `{ ok: false, error: 'not_authorized' }`.
- F3 linkSubIssue happy: mocked GraphQL `addSubIssue` mutation succeeds → returns `{ ok: true }`.
- F4 linkSubIssue failure: mocked returns errors → returns `{ ok: false, error: <message> }`.
- F5: both functions accept parsed object args (objectRef strings, projectId strings) — NOT raw paths, NOT requiring file I/O.

**Group G — Per-process cache (`describe('resolveChain — cache')`)**
- G1: First call to `resolveChain(fm, ctx)` triggers mocked runGh calls (assert call count via mock spy). Second identical call returns same result, mocked runGh call count unchanged. `provenance.github_issue` on second call is `'cached'`.
- G2: After `_resetCache()`, second call triggers mocked runGh again (call count increments).
- G3: Cache key is `${ctx.github_repo}#${frontmatter.github_issue || frontmatter.objectiveId || 'no-id'}`. Two different objectives in same repo produce two cache entries.
- G4: Cache is per-process — a fresh `require('./gh.cjs')` (via `delete require.cache`) starts with empty cache. (This test verifies the cache is in module-scope, not closure-scope.)

**Group H — CLI surface `df-tools gh resolve <objectiveId>` (`describe('cmdGhResolve / df-tools gh resolve')`)**
- H1: `df-tools gh resolve 01-foo` reads `.planning/objectives/01-foo/OBJECTIVE.md` frontmatter + `.planning/PROJECT.md` projectCtx, calls resolveChain, prints JSON to stdout. Run via spawnSync against a temp project root.
- H2: With `--raw` flag, output is one-line JSON (no pretty-print). Without `--raw`, output is pretty-printed JSON.
- H3: When OBJECTIVE.md is absent, the command exits non-zero with "objective not found: 01-foo" on stderr. (Hard error per CONTEXT.md.)
- H4: When OBJECTIVE.md has no GH-link fields, the command still succeeds with all `provenance` values as `'absent'` (resolver doesn't error on missing optional fields).

**Group I — Round-trip on the matrix project fixture (`describe('resolveChain — matrix fixture')`)**
- I1: `buildFrontmatter` and `buildProjectCtx` produce dicts that round-trip through `resolveChain` without throwing for every combination of (full-ref, shorthand, absent) × (with org_project, without org_project).

The 30+ enumerated cases above cover happy paths (A1–A3, B1–B2, D1–D2, E1, F1, F3, G1, H1), edge cases (B3–B4, C1, C3, D3, E2–E3, G3, H2, H4), failure modes (D4, E4, F2, F4, H3), and the cache provenance path (G1–G4, key for SC-3).

## RED → GREEN → REFACTOR plan

Three atomic commits per the user's TDD Playbook habit:

1. `test(01-02): add failing test list for resolveChain + chain helpers + cache + CLI` — Add the test cases above as failing tests. Confirm `npm test` reports them red, then commit. Includes new `gh.test.cjs` and new `__fixtures__/gh-fixtures.cjs`.

2. `feat(01-02): implement resolveChain + findRoadmapIssue + addToProject + linkSubIssue + per-process cache + cmdGhResolve` — Implement until all tests pass. Includes:
   - New `_cachedChains` module-scope Map + `_resetCache()` helper
   - `resolveChain(frontmatter, projectCtx)` walking the chain in order: read fields from frontmatter → fall back to projectCtx → walk parent_issue via gh CLI / GraphQL for milestone+roadmap_issue
   - `findRoadmapIssue(repo)` calling `gh issue list ... --search "[Roadmap] in:title"`
   - `addToProject(issueRef, projectId)` calling `gh api graphql` with `addProjectV2ItemById` mutation
   - `linkSubIssue(parentRef, childRef)` calling `gh api graphql` with `addSubIssue` mutation
   - `cmdGhResolve(cwd, objectiveId, raw)` reading OBJECTIVE.md + PROJECT.md from cwd, calling resolveChain, writing JSON output
   - Subcommand routing in `df-tools.cjs` for `gh resolve <objectiveId>`
   - Module exports updated to include the 5 new functions + `_resetCache`

3. `refactor(01-02): {if needed}` — Only if the GREEN implementation has clear cleanup opportunities (e.g., extracting shorthand-resolution to a private helper, extracting the GraphQL query strings to constants). Skip if not.

<embedded_context>

<codebase_examples>
**Existing `lib/intent.cjs::resolve()` pattern (lines 207-433)** — mirror this style for `resolveChain`:

```javascript
// MIRROR THIS SHAPE — but keep code separate (no shared state):
function resolve({ projectRoot, objectiveId, trdPath, userHome, tablePath } = {}) {
  // ... read sources ...
  const sources = {};
  const config = {};
  // Level 4: defaults
  for (const field of ALL_FIELDS) {
    if (tableDefaults[field] !== undefined) {
      config[field] = tableDefaults[field];
      sources[field] = `defaults table (${kind}, ${work})`;
    }
  }
  // Level 3, 2, 1: overrides...
  // ...
  const provenance = {};
  for (const field of Object.keys(sources)) {
    provenance[field] = normalizeProvenance(sources[field]);
  }
  return { kind, work, config, sources, provenance, constraints, warnings };
}
```

**`gh.cjs` existing patterns to follow** (do NOT re-invent):

`runGh(args, opts)` (lines 49-62) is the gh CLI wrapper. Use it for ALL gh invocations. Returns `{ ok, status, stdout, stderr }`. Tests mock by stubbing `spawnSync` (the export of which is shadowed by replacing `runGh`'s reference, OR by injecting a mock `runGh` via module-scope DI — see below).

`readMapping/writeMapping` (lines 32-47) for `.planning/.gh-mapping.json` access. The new `cmdGhResolve` does NOT need to write to this file (it's read-only); subsequent `cmdGhSyncObjective` (TRD 01-04) writes to it.

`output(result, raw, ...)` from `helpers.cjs` for CLI output — handles `--raw` JSON vs pretty.

**Cache pattern from `intent.cjs` (line 24)** to mirror:

```javascript
let _cachedTable = null;
function loadDefaultsTable(tablePath = DEFAULTS_TABLE_PATH) {
  if (_cachedTable && tablePath === DEFAULTS_TABLE_PATH) return _cachedTable;
  // ... compute ...
  if (tablePath === DEFAULTS_TABLE_PATH) _cachedTable = table;
  return table;
}

// EXTEND TO: per-objective Map cache for resolveChain
let _cachedChains = new Map();
function _resetCache() { _cachedChains = new Map(); }

function resolveChain(frontmatter, projectCtx) {
  const key = `${projectCtx.github_repo || 'no-repo'}#${frontmatter.github_issue || frontmatter._objectiveId || 'no-id'}`;
  if (_cachedChains.has(key)) {
    const cached = _cachedChains.get(key);
    // Mark provenance as 'cached' for fields that were originally non-frontmatter
    return { ...cached, provenance: Object.fromEntries(Object.entries(cached.provenance).map(([k, v]) => [k, v === 'frontmatter' ? 'frontmatter' : 'cached'])) };
  }
  // ... compute ...
  _cachedChains.set(key, result);
  return result;
}
```

**GraphQL query patterns** — gh CLI supports GraphQL via `gh api graphql -f query='...'`:

```javascript
// Pattern for finding a Project v2 item from an issue:
const query = `query($issueNumber: Int!, $repoOwner: String!, $repoName: String!) {
  repository(owner: $repoOwner, name: $repoName) {
    issue(number: $issueNumber) {
      projectItems(first: 5) {
        nodes {
          project { id title }
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
}`;
const r = runGh(['api', 'graphql', '-f', `query=${query}`, '-F', `issueNumber=${num}`, '-F', `repoOwner=${owner}`, '-F', `repoName=${name}`]);
```

For unit tests, mock `runGh` to return canned `{ ok: true, stdout: JSON.stringify(<canned response>) }` — see `gh-fixtures.cjs::buildGhResponse`.

**`df-tools.cjs` subcommand routing** (line 733) — extend the existing switch:

```javascript
// EXISTING (line 733):
// df-tools gh comment <issue|objective> <body|@file:path>
case 'comment': cmdGhComment(cwd, args[1], args[2], raw); break;
case 'close-issue': cmdGhCloseIssue(cwd, args[1], args[2], raw); break;
case 'sync-release': cmdGhSyncRelease(cwd, args[1], raw); break;

// ADD:
case 'resolve': cmdGhResolve(cwd, args[1], raw); break;
```
</codebase_examples>

<anti_patterns>
- **Do NOT couple `resolveChain` to `lib/intent.cjs`.** The two resolvers run independently. No `require('./intent.cjs')` from `gh.cjs`, ever. (Per CONTEXT.md §5.)
- **Do NOT add disk caching.** SC-3 explicitly requires per-process in-memory only. No `.devflow-cache/`, no `~/.devflow/cache/`. The `_cachedChains` Map lives in module scope and dies with the process.
- **Do NOT add a `--refresh` flag.** Invocation boundary IS the freshness boundary. Locked in CONTEXT.md.
- **Do NOT silently degrade on auth failure.** If `runGh` returns `ok: false` with stderr matching auth-error patterns (TRD 01-03 will add a typed helper for this; in this TRD, just propagate `ok: false` outward and let the caller see it). The hard-fail behavior is added in TRD 01-03 — don't pre-implement it here.
- **Do NOT use a YAML library.** The existing `extractFrontmatter` (used by `cmdGhResolve` to read OBJECTIVE.md) is sufficient.
- **Do NOT generate test data with the LLM.** Per CLAUDE.md TDD Playbook habit 4: `gh-fixtures.cjs` extensions must be hand-built factory functions. No `faker`, no AI-completed sample data.
- **Do NOT write tests that hit live gh.** The unit suite uses mocked `runGh`. Live-gh tests are TRD 01-06's job, gated on `GH_INTEGRATION=1`. Cassettes for replay (if any) live in `__fixtures__/gh-cassettes/` — but this TRD ships only the directory, populated later.
- **Do NOT introduce a YAML library or rebuild frontmatter parsing.** The existing `frontmatter.cjs::extractFrontmatter` is the right tool.
- **Do NOT add `pm.backend` config logic.** That's TRD 01-05's seam. This TRD is GitHub-only by hard-code.
</anti_patterns>

<error_recovery>
- If unit tests fail because `runGh` is being called for real instead of being mocked: the mocking strategy needs to be module-level. Use one of these patterns:
  1. Re-export `runGh` from `gh.cjs` and have tests stub it via `gh._setRunGh(mockFn)` (cleanest; requires adding a setter).
  2. Replace `spawnSync` at the top of `gh.cjs` with an injected helper (more invasive).
  Recommend option 1 — add a `_setRunGh(fn)` test hook similar to `intent.cjs::_resetCache`.
- If GraphQL response parsing in tests fails on schema drift: the fixture cassette JSON needs to match the EXACT shape gh returns. Run `gh api graphql -f query='...' --paginate=false` once locally against the real repo to capture the shape, then commit the captured JSON to `__fixtures__/gh-cassettes/`. This is what TRD 01-06's integration test will do for real cassettes; for this unit test, hand-build minimal canned responses in `gh-fixtures.cjs` (only the fields the resolver reads).
- If the cache test fails because the second call shows `provenance.X === 'frontmatter'` instead of `'cached'`: the cache hit logic isn't transforming provenance. Fix is in `resolveChain`'s cache-hit branch — only fields whose original provenance was `'walked_from_parent'` or `'inherited_from_project'` flip to `'cached'`. Frontmatter-source fields STAY as `'frontmatter'` because re-reading frontmatter is free; we cache the walked + inherited values, not the parsed-from-disk values.
- If `df-tools gh resolve 01-foo` says "objective not found" but the objective dir exists: check that `cmdGhResolve` is reading from `.planning/objectives/<id>/OBJECTIVE.md` (canonical path). Don't search; the path is deterministic from the cwd.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/01-github-coordination-layer/01-CONTEXT.md
@.planning/objectives/01-github-coordination-layer/01-RESEARCH.md
@.planning/research/github-coordination-layer.md
@.planning/research/org-context-resolver.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/intent.cjs
@plugins/devflow/devflow/bin/lib/frontmatter.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
@plugins/devflow/devflow/bin/df-tools.cjs

# After TRD 01-01 ships:
@.planning/objectives/01-github-coordination-layer/01-01-frontmatter-fields-and-templates-SUMMARY.md
</context>

<research_context>
**From `github-coordination-layer.md`:**
- **Sub-issues require GraphQL** — `gh api repos/{owner}/{repo}/issues/{number}/sub_issues` is REST but limited; full sub-issue mutation needs GraphQL `addSubIssue` mutation. Use GraphQL throughout for consistency.
- **Required gh scopes**: `repo, gist, project, read:project, read:org`. The `read:project` scope is critical for Project v2 reads. TRD 01-03 codifies the auth-failure remediation.
- **Existing `[Roadmap]` parent issues**: 9 across the org. The `findRoadmapIssue` helper searches by title prefix `[Roadmap]`. Devflow-claude#9 is the dogfood target.
- **Org Product Roadmap project ID**: `PVT_kwDODwqLrc4BRsOP`. Use as the default `org_project` in `projectCtx`.

**From `org-context-resolver.md`:**
- **Resolver output shape (full design)**: 6 facets — `repo`, `objective`, `parent_issue`, `milestone`, `siblings`, `initiative`, `todos`. v1.1 ships only the first 4 (no `siblings`, no `todos` — those depend on heartbeats / initiative-sync from later objectives). Per CONTEXT.md, the v1.1 shape is reduced.
- **Cache TTL** — research proposed 5 min for parent_issue, 15 min for milestone, etc. v1.1 simplifies to per-process in-memory only — no TTL, lifetime = process lifetime. Locked.
- **Performance target**: < 50ms local-only, < 2s with cold cache (one round of GH calls). Not a verification gate but a sanity target.
</research_context>

<gotchas>
- **`gh api graphql -f` vs `-F`**: `-f` for string fields (passed as variables), `-F` for typed fields (numbers, booleans). For variables, use `-F issueNumber=9` (typed Int) and `-f repoOwner=AO-Cyber-Systems` (string). Mixing them up causes "expected Int, got String" GraphQL errors.
- **Project v2 field reads need a custom GraphQL query** — `gh api repos/.../issues/N` REST returns `projectItems: { totalCount: N }` but NOT the field values. You MUST use GraphQL with the schema in the codebase_examples block.
- **Sub-issue API has two flavors**: `addSubIssue` (newer, GA Q4 2024) and the older "task list with linked issue" pattern. Use `addSubIssue` exclusively. The 9 existing `[Roadmap]` issues use the older bullet-list pattern (not native sub-issues yet) — `findRoadmapIssue` searches by title, NOT by sub-issue relationship, because the old-style parents have `trackedIssues.totalCount: 0`.
- **`runGh` timeout is 30 seconds** (gh.cjs line 53). GraphQL queries against Project v2 sometimes take 5-10 seconds for large projects. Don't lower this. If a test times out, the gh response size is the issue, not the wrapper.
- **`extractFrontmatter` returns `{}` for absent files** — `cmdGhResolve` should check `fs.existsSync(path.join(cwd, '.planning/objectives', id, 'OBJECTIVE.md'))` and exit non-zero with "objective not found" BEFORE calling resolveChain. Don't pass empty-dict frontmatter as a valid case; that conflates "objective doesn't exist" with "objective exists but has no GH fields."
- **The matrix fixture from `intent-fixtures.cjs::buildMatrixProject`** creates 7 OBJECTIVE.md files for a kind. It's a useful test scaffold — `gh.test.cjs` can re-use it via `require('./__fixtures__/intent-fixtures.cjs')` (cross-fixture sharing is OK; the fixtures are independent of the resolvers they support).
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Author hand-built fixtures and the failing test list (RED phase)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/.gitkeep, plugins/devflow/devflow/bin/lib/gh.test.cjs</files>
  <action>
**Step 1.1 — Author `__fixtures__/gh-fixtures.cjs`** with hand-built factory functions (no LLM-generated test data; per CLAUDE.md TDD Playbook habit 4):

```javascript
'use strict';
// Hand-built fixture builders for gh resolver tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.

function buildFrontmatter({
  github_issue,
  parent_issue,
  org_initiative,
  org_project,
  _objectiveId,   // private — used as fallback cache key
} = {}) {
  const fm = {};
  if (github_issue !== undefined) fm.github_issue = github_issue;
  if (parent_issue !== undefined) fm.parent_issue = parent_issue;
  if (org_initiative !== undefined) fm.org_initiative = org_initiative;
  if (org_project !== undefined) fm.org_project = org_project;
  if (_objectiveId !== undefined) fm._objectiveId = _objectiveId;
  return fm;
}

function buildProjectCtx({ github_repo, org_project } = {}) {
  const ctx = {};
  if (github_repo !== undefined) ctx.github_repo = github_repo;
  if (org_project !== undefined) ctx.org_project = org_project;
  return ctx;
}

// Mock runGh for unit tests. Returns a function compatible with gh.cjs's runGh signature.
// `responses` is a Map<string, { ok, stdout, stderr }> keyed by the joined args string.
function buildMockRunGh(responses = new Map()) {
  let callCount = 0;
  const calls = [];
  function mockRunGh(args, opts) {
    callCount++;
    const key = args.join(' ');
    calls.push({ args, opts, key });
    if (responses.has(key)) return responses.get(key);
    // Permissive default: prefix-match
    for (const [k, v] of responses.entries()) {
      if (key.startsWith(k)) return v;
    }
    return { ok: false, status: 1, stdout: '', stderr: `[mock] no match for: ${key}` };
  }
  mockRunGh.callCount = () => callCount;
  mockRunGh.calls = () => [...calls];
  return mockRunGh;
}

// Canned GraphQL response for an issue with a Product Roadmap project item.
// Hand-edited from observed `gh api graphql` output against AO-Cyber-Systems/devflow-claude#9.
function buildGhResponse_issueWithProjectItem({
  issueNumber = 9,
  title = '[Roadmap] devflow-claude',
  projectId = 'PVT_kwDODwqLrc4BRsOP',
  projectTitle = 'Product Roadmap',
  product = 'DevFlow',
  quarter = 'Q2 2026',
  status = 'In Progress',
} = {}) {
  return {
    ok: true,
    status: 0,
    stdout: JSON.stringify({
      data: {
        repository: {
          issue: {
            number: issueNumber,
            title,
            projectItems: {
              nodes: [
                {
                  project: { id: projectId, title: projectTitle },
                  fieldValues: {
                    nodes: [
                      { name: status, field: { name: 'Status' } },
                      { name: product, field: { name: 'Product' } },
                      { name: quarter, field: { name: 'Quarter' } },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }),
    stderr: '',
  };
}

// Canned response for `gh issue list ... --search '[Roadmap] in:title'`.
function buildGhResponse_issueListRoadmap({ hits = [] } = {}) {
  return {
    ok: true,
    status: 0,
    stdout: JSON.stringify(hits.map(h => ({ number: h.number, title: h.title || `[Roadmap] ${h.repo || 'test'}` }))),
    stderr: '',
  };
}

module.exports = {
  buildFrontmatter,
  buildProjectCtx,
  buildMockRunGh,
  buildGhResponse_issueWithProjectItem,
  buildGhResponse_issueListRoadmap,
};
```

**Step 1.2 — Create empty `__fixtures__/gh-cassettes/.gitkeep`** so the directory exists in git for TRD 01-06 to populate.

**Step 1.3 — Author `gh.test.cjs`** with all 30+ test cases from the test list above. Use `node:test` + `node:assert` matching `intent.test.cjs`'s pattern. Use `buildMockRunGh` to inject mock responses; expose a `_setRunGh(fn)` test hook in `gh.cjs` (will be added in Task 2's GREEN phase). For now, write the tests as if `_setRunGh` exists.

Test file structure:

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const gh = require('./gh.cjs');
const fx = require('./__fixtures__/gh-fixtures.cjs');

test.beforeEach(() => {
  if (gh._resetCache) gh._resetCache();
});

// Group A: full ref
test('resolveChain — full ref github_issue + parent_issue', () => {
  const fm = fx.buildFrontmatter({
    github_issue: 'AO-Cyber-Systems/devflow-claude#10',
    parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
  });
  const ctx = fx.buildProjectCtx({ github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' });
  // Mock runGh to never be called for this test (no walk needed when fields are explicit + no walk requested)
  const mock = fx.buildMockRunGh();
  gh._setRunGh(mock);
  const r = gh.resolveChain(fm, ctx);
  assert.strictEqual(r.github_issue, 'AO-Cyber-Systems/devflow-claude#10');
  assert.strictEqual(r.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
  assert.strictEqual(r.provenance.github_issue, 'frontmatter');
  assert.strictEqual(r.provenance.parent_issue, 'frontmatter');
  assert.strictEqual(r.provenance.org_project, 'inherited_from_project');
});

// ... all other test cases per the test list above
```

Run `npm test` and confirm: all new tests are RED (because `gh.cjs` doesn't yet export `resolveChain`, `_setRunGh`, `_resetCache`).

# CRITICAL: Write ALL tests in this RED phase. Do NOT write production code. Confirm RED with `npm test 2>&1 | tail -50`.
# CRITICAL: Hand-build ALL fixtures. No `faker`, no AI-generated GraphQL responses — copy real shapes from gh API docs or run `gh api graphql -f query='...'` once to capture (and commit if useful as a cassette).
# PATTERN: Cross-fixture share with `intent-fixtures.cjs` is OK. `gh.test.cjs` can `require('./__fixtures__/intent-fixtures.cjs')` for the matrix project builder. Don't duplicate.
# GOTCHA: Test discovery — Node's native test runner finds `*.test.cjs` automatically. The new `gh.test.cjs` joins the existing test discovery without config changes.
  </action>
  <verify>
- `npm test 2>&1 | grep -c 'gh.test.cjs'` shows the file was discovered.
- `npm test 2>&1 | grep -E 'fail|✗|FAIL'` shows the new tests are RED (failing). Existing tests (intent, frontmatter, etc.) still pass.
- `git diff --stat` shows ADDITIONS only to gh-fixtures.cjs, gh.test.cjs, gh-cassettes/.gitkeep. NO changes to gh.cjs in this task.
- Commit: `git log --oneline -1` shows `test(01-02): add failing test list for ...`
  </verify>
  <done>RED: gh.test.cjs has 30+ tests, ALL failing because gh.cjs lacks resolveChain/etc. exports. gh-fixtures.cjs ships with hand-built factories. Commit completed with `test(01-02):` prefix.</done>
  <recovery>
If `npm test` errors before reaching the new tests (e.g., a syntax error in gh.test.cjs), fix the syntax. Common issue: forgetting `'use strict';` at top, or using ES module syntax (`import`) instead of CommonJS (`require`). The codebase is CommonJS throughout (per CLAUDE.md §Conventions).

If a test passes when it should fail (false positive RED → GREEN): inspect the assertion. The most likely cause is a typo in the assertion path (e.g., `r.parent_issue` returning `undefined` and the assertion checking `assert.notStrictEqual(r.parent_issue, 'wrong-value')` which passes trivially). Tighten with `assert.strictEqual(typeof r.parent_issue, 'string')` first.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Implement resolveChain + chain helpers + per-process cache + cmdGhResolve (GREEN phase)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
**Step 2.1 — Extend `lib/gh.cjs` with the new exports.** All additions go in module scope; existing functions are untouched.

Add at the top of the file (after existing requires, before `MAPPING_REL`):

```javascript
const { extractFrontmatter } = require('./frontmatter.cjs');

// Per-process in-memory cache for resolveChain (SC-3).
// Lives in module scope; dies with process. NEVER persisted to disk.
let _cachedChains = new Map();
function _resetCache() { _cachedChains = new Map(); }

// Test injection hook for runGh — production code uses runGh; tests use _setRunGh(mockFn).
let _runGh = runGh;
function _setRunGh(fn) { _runGh = fn || runGh; }
```

Wait — `runGh` is declared mid-file. Re-order: put `_runGh` shadow + `_setRunGh` AFTER `runGh` is declared (around line 65). Or use a getter. Cleanest: declare `_setRunGh` AFTER `runGh`'s declaration:

```javascript
// Place AFTER existing runGh declaration:
let _runGh = runGh;
function _setRunGh(fn) { _runGh = fn || runGh; }
```

Then ALL new code (resolveChain, findRoadmapIssue, etc.) uses `_runGh(args)` instead of `runGh(args)`. **Existing functions (cmdGhSyncObjectives, cmdGhComment, etc.) keep using `runGh` directly** — don't change them; they have their own behavior contracts. This isolates the test injection to new code, preserving back-compat.

**Add the following functions to `gh.cjs`:**

```javascript
// Helper: resolve a frontmatter field value's provenance for shorthand vs full ref.
// Returns { value, provenance, warning? }.
function _resolveRef(fmValue, projectCtxRepo, fieldName) {
  if (!fmValue) return { value: null, provenance: 'absent' };
  // Full ref: contains a slash before the #
  if (typeof fmValue === 'string' && /^[^/]+\/[^#]+#\d+$/.test(fmValue)) {
    return { value: fmValue, provenance: 'frontmatter' };
  }
  // Shorthand: starts with #
  if (typeof fmValue === 'string' && /^#\d+$/.test(fmValue)) {
    if (projectCtxRepo && /^[^/]+\/[^/]+$/.test(projectCtxRepo)) {
      return { value: `${projectCtxRepo}${fmValue}`, provenance: 'frontmatter' };
    }
    return {
      value: fmValue,
      provenance: 'frontmatter',
      warning: projectCtxRepo
        ? `Cannot resolve shorthand ${fieldName}=${fmValue}: PROJECT.md github_repo "${projectCtxRepo}" is malformed (expected owner/name)`
        : `Cannot resolve shorthand ${fieldName}=${fmValue}: PROJECT.md github_repo is missing`,
    };
  }
  // Unrecognized format — pass through with warning
  return { value: fmValue, provenance: 'frontmatter', warning: `Unrecognized ${fieldName} format: ${fmValue}` };
}

// Walk parent_issue → roadmap_issue + milestone via gh GraphQL.
// Returns { roadmap_issue, milestone, provenance: { roadmap_issue, milestone } }.
function _walkParent(parent_issue) {
  if (!parent_issue || !/^[^/]+\/[^#]+#\d+$/.test(parent_issue)) {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [],
    };
  }
  const m = parent_issue.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  const [, owner, repo, num] = m;
  const query = `query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        title
        projectItems(first: 5) {
          nodes {
            project { id title }
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
  }`;
  const r = _runGh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
  if (!r.ok) {
    return {
      roadmap_issue: null,
      milestone: null,
      provenance: { roadmap_issue: 'absent', milestone: 'absent' },
      warnings: [`Walk to ${parent_issue} failed: ${r.stderr || 'unknown gh error'}`],
    };
  }
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch {
    return { roadmap_issue: null, milestone: null, provenance: { roadmap_issue: 'absent', milestone: 'absent' }, warnings: [`Walk response not JSON: ${r.stdout.slice(0, 100)}`] };
  }
  const issue = parsed?.data?.repository?.issue;
  if (!issue) {
    return { roadmap_issue: null, milestone: null, provenance: { roadmap_issue: 'absent', milestone: 'absent' }, warnings: [`Issue ${parent_issue} not found in walk response`] };
  }
  const isRoadmap = (issue.title || '').includes('[Roadmap]');
  const projectItems = issue.projectItems?.nodes || [];
  // Take the first project item (Product Roadmap is expected to be primary)
  const item = projectItems[0];
  const fields = {};
  if (item) {
    for (const fv of (item.fieldValues?.nodes || [])) {
      const fieldName = fv.field?.name;
      if (!fieldName) continue;
      fields[fieldName] = fv.name || fv.text || null;
    }
  }
  const milestone = item ? {
    draft_or_issue_ref: parent_issue,  // for now; refined when we walk to drafts
    title: item.project?.title || null,
    product: fields.Product || null,
    quarter: fields.Quarter || null,
    status: fields.Status || null,
  } : null;
  return {
    roadmap_issue: isRoadmap ? parent_issue : null,
    milestone,
    provenance: {
      roadmap_issue: isRoadmap ? 'walked_from_parent' : 'absent',
      milestone: milestone ? 'walked_from_parent' : 'absent',
    },
    warnings: [],
  };
}

// Public: find the [Roadmap] parent issue for a repo.
function findRoadmapIssue(repo) {
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) return null;
  const r = _runGh(['issue', 'list', '--repo', repo, '--state', 'open', '--search', '[Roadmap] in:title', '--json', 'number,title', '--limit', '5']);
  if (!r.ok) return null;
  let arr;
  try { arr = JSON.parse(r.stdout); } catch { return null; }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  // Sort by number ascending (deterministic; lowest number wins)
  arr.sort((a, b) => a.number - b.number);
  return `${repo}#${arr[0].number}`;
}

// Public: walk an objective's frontmatter to its full org chain.
function resolveChain(frontmatter = {}, projectCtx = {}) {
  const cacheKey = `${projectCtx.github_repo || 'no-repo'}#${frontmatter.github_issue || frontmatter._objectiveId || 'no-id'}`;
  if (_cachedChains.has(cacheKey)) {
    const cached = _cachedChains.get(cacheKey);
    // Mark non-frontmatter provenance values as 'cached' on subsequent reads
    const cachedProvenance = {};
    for (const [k, v] of Object.entries(cached.provenance)) {
      cachedProvenance[k] = (v === 'walked_from_parent' || v === 'inherited_from_project') ? 'cached' : v;
    }
    return { ...cached, provenance: cachedProvenance };
  }

  const warnings = [];
  const result = {
    objective: frontmatter._objectiveId || null,
    github_issue: null,
    parent_issue: null,
    roadmap_issue: null,
    org_initiative: null,
    org_project: null,
    milestone: null,
    provenance: {},
    warnings,
  };

  // github_issue
  const gi = _resolveRef(frontmatter.github_issue, projectCtx.github_repo, 'github_issue');
  result.github_issue = gi.value;
  result.provenance.github_issue = gi.provenance;
  if (gi.warning) warnings.push(gi.warning);

  // parent_issue
  const pi = _resolveRef(frontmatter.parent_issue, projectCtx.github_repo, 'parent_issue');
  result.parent_issue = pi.value;
  result.provenance.parent_issue = pi.provenance;
  if (pi.warning) warnings.push(pi.warning);

  // org_initiative — frontmatter or absent (NO inherit from project per CONTEXT.md; initiatives are objective-scoped)
  if (frontmatter.org_initiative) {
    result.org_initiative = frontmatter.org_initiative;
    result.provenance.org_initiative = 'frontmatter';
  } else {
    result.provenance.org_initiative = 'absent';
  }

  // org_project — frontmatter wins, else inherit from projectCtx, else absent
  if (frontmatter.org_project) {
    result.org_project = frontmatter.org_project;
    result.provenance.org_project = 'frontmatter';
  } else if (projectCtx.org_project) {
    result.org_project = projectCtx.org_project;
    result.provenance.org_project = 'inherited_from_project';
  } else {
    result.provenance.org_project = 'absent';
  }

  // Walk parent_issue → roadmap_issue + milestone (only if parent_issue is a full ref now)
  if (result.parent_issue && /^[^/]+\/[^#]+#\d+$/.test(result.parent_issue)) {
    const walk = _walkParent(result.parent_issue);
    result.roadmap_issue = walk.roadmap_issue;
    result.milestone = walk.milestone;
    result.provenance.roadmap_issue = walk.provenance.roadmap_issue;
    result.provenance.milestone = walk.provenance.milestone;
    warnings.push(...walk.warnings);
  } else if (projectCtx.github_repo) {
    // Fallback: search for [Roadmap] issue in the repo
    const found = findRoadmapIssue(projectCtx.github_repo);
    if (found) {
      result.roadmap_issue = found;
      result.provenance.roadmap_issue = 'walked_from_parent';
      // Walk that issue for milestone info
      const walk = _walkParent(found);
      result.milestone = walk.milestone;
      result.provenance.milestone = walk.provenance.milestone;
      warnings.push(...walk.warnings);
    } else {
      result.provenance.roadmap_issue = 'absent';
      result.provenance.milestone = 'absent';
    }
  } else {
    result.provenance.roadmap_issue = 'absent';
    result.provenance.milestone = 'absent';
  }

  _cachedChains.set(cacheKey, result);
  return result;
}

// Public: addToProject(issueRef, projectId) — adds an issue to a Project v2.
function addToProject(issueRef, projectId) {
  if (!issueRef || !projectId) return { ok: false, error: 'issueRef and projectId required' };
  const m = issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return { ok: false, error: `malformed issueRef: ${issueRef}` };
  const [, owner, repo, num] = m;
  // First, look up the issue node ID
  const idQuery = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { id } } }`;
  const idR = _runGh(['api', 'graphql', '-f', `query=${idQuery}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
  if (!idR.ok) return { ok: false, error: idR.stderr };
  let issueId;
  try { issueId = JSON.parse(idR.stdout).data.repository.issue.id; } catch { return { ok: false, error: 'failed to parse issue id' }; }
  // Then add to project
  const mutation = `mutation($projectId: ID!, $contentId: ID!) { addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) { item { id } } }`;
  const r = _runGh(['api', 'graphql', '-f', `query=${mutation}`, '-F', `projectId=${projectId}`, '-F', `contentId=${issueId}`]);
  if (!r.ok) return { ok: false, error: r.stderr };
  let item_id;
  try { item_id = JSON.parse(r.stdout).data.addProjectV2ItemById.item.id; } catch { return { ok: false, error: 'failed to parse item id' }; }
  return { ok: true, item_id };
}

// Public: linkSubIssue(parentRef, childRef) — links child as sub-issue of parent.
function linkSubIssue(parentRef, childRef) {
  if (!parentRef || !childRef) return { ok: false, error: 'parentRef and childRef required' };
  // Look up both issue IDs
  const lookup = (ref) => {
    const m = ref.match(/^([^/]+)\/([^#]+)#(\d+)$/);
    if (!m) return null;
    const [, owner, repo, num] = m;
    const q = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { id } } }`;
    const r = _runGh(['api', 'graphql', '-f', `query=${q}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
    if (!r.ok) return null;
    try { return JSON.parse(r.stdout).data.repository.issue.id; } catch { return null; }
  };
  const parentId = lookup(parentRef);
  const childId = lookup(childRef);
  if (!parentId || !childId) return { ok: false, error: `failed to look up issue IDs: parent=${parentRef} child=${childRef}` };
  const mutation = `mutation($issueId: ID!, $subIssueId: ID!) { addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) { issue { id } } }`;
  const r = _runGh(['api', 'graphql', '-f', `query=${mutation}`, '-F', `issueId=${parentId}`, '-F', `subIssueId=${childId}`]);
  if (!r.ok) return { ok: false, error: r.stderr };
  return { ok: true };
}

// Public: cmdGhResolve — CLI subcommand entry point.
function cmdGhResolve(cwd, objectiveId, raw) {
  if (!objectiveId) {
    output({ error: 'Usage: gh resolve <objectiveId>' }, raw, '');
    process.exit(1);
  }
  const objPath = path.join(cwd, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    output({ error: `objective not found: ${objectiveId}`, expected_path: objPath }, raw, '');
    process.exit(1);
  }
  const objContent = fs.readFileSync(objPath, 'utf-8');
  const objFm = extractFrontmatter(objContent) || {};
  objFm._objectiveId = objectiveId;

  const projectPath = path.join(cwd, '.planning', 'PROJECT.md');
  let projectFm = {};
  if (fs.existsSync(projectPath)) {
    projectFm = extractFrontmatter(fs.readFileSync(projectPath, 'utf-8')) || {};
  }
  const projectCtx = {
    github_repo: projectFm.github_repo,
    org_project: projectFm.org_project,
  };

  const result = resolveChain(objFm, projectCtx);
  output(result, raw, JSON.stringify(result, null, 2));
}

module.exports = {
  // EXISTING:
  ghStatus, cmdGhStatus, cmdGhSyncObjectives, cmdGhComment, cmdGhCloseIssue, cmdGhSyncRelease,
  // NEW:
  resolveChain, findRoadmapIssue, addToProject, linkSubIssue, cmdGhResolve,
  _resetCache, _setRunGh,
};
```

**Step 2.2 — Route `gh resolve` in `df-tools.cjs`** (line 733 area):

Find the existing `gh` subcommand switch (around line 720-742) and add a case:

```javascript
case 'resolve':
  // df-tools gh resolve <objectiveId> [--raw]
  cmdGhResolve(cwd, args[1], raw);
  break;
```

The `--help` text printed when `gh` is invoked with no subcommand or `gh --help` (line 742-ish) should be updated to include `resolve`:

```javascript
error('Unknown gh subcommand. Available: status, sync-objectives, resolve, comment, close-issue, sync-release');
```

Run `npm test` and confirm: all RED tests now pass GREEN. No existing tests regressed.

# CRITICAL: Use `_runGh` (not `runGh`) in ALL new functions. This is the test injection point.
# CRITICAL: The cache lookup transforms `walked_from_parent` and `inherited_from_project` to `cached` on hit. `frontmatter` and `absent` stay as-is.
# CRITICAL: Existing functions in gh.cjs (cmdGhSyncObjectives, etc.) MUST remain unchanged. Don't refactor them in this TRD; that's TRD 01-05's job.
# GOTCHA: GraphQL `addSubIssue` mutation requires the parent issue's GitHub-internal `node_id`, not the `owner/repo#NN` ref. The `linkSubIssue` function looks up node_ids first.
# PATTERN: Follow `intent.cjs::resolve` for the source/provenance/warnings shape. Don't invent new conventions.
  </action>
  <verify>
- `npm test` passes (all 30+ new tests GREEN, all existing tests still pass).
- `node plugins/devflow/devflow/bin/df-tools.cjs gh` (no subcommand) lists `resolve` in available subcommands.
- `node plugins/devflow/devflow/bin/df-tools.cjs gh resolve nonexistent-objective 2>&1 | grep -q 'objective not found'` — exits non-zero with the expected error.
- Existing tests: `npm test 2>&1 | grep -E '443|447|450' || echo "$(npm test 2>&1 | grep -c 'pass')"` shows total pass count went up (existing 443 + new 30+ = 470+).
- `git log --oneline -1` shows `feat(01-02): implement resolveChain ...`
  </verify>
  <done>GREEN: All RED tests now pass. lib/gh.cjs exports resolveChain, findRoadmapIssue, addToProject, linkSubIssue, cmdGhResolve, _resetCache, _setRunGh. df-tools.cjs routes `gh resolve`. All existing tests still pass. Commit with `feat(01-02):` prefix.</done>
  <recovery>
If a test fails on cache provenance: re-read the cache transform logic. The transform should be applied to a CLONE of `cached.provenance`, not the original. The `Object.fromEntries(Object.entries(cached.provenance).map(...))` pattern creates a new object — verify you're returning the new one, not mutating the cached one.

If `gh resolve` exits 0 when objective is missing: the `process.exit(1)` after `output(...)` may not be firing because `output` might be flushing async (it shouldn't — it's sync via console.log, but verify). Add an explicit `return` after `process.exit(1)` for safety.

If GraphQL responses parse incorrectly in tests: the canned `buildGhResponse_issueWithProjectItem` schema must match what gh actually returns. If real gh starts returning a different shape, update the fixture (don't change the parser to be permissive — that hides drift).

If `_setRunGh` injection doesn't work in tests: the issue is module-level `let _runGh = runGh` capturing the closure. Ensure `_runGh` is REASSIGNED via `_setRunGh`, not shadowed by inner function declarations. Check by adding `console.log(_runGh.name)` inside `resolveChain` during a test run.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
Before declaring TRD complete:
- [ ] `npm test` passes — RED tests from Task 1 are now GREEN; existing tests unaffected
- [ ] Two atomic commits: `test(01-02): ...` then `feat(01-02): ...`
- [ ] `lib/gh.cjs` exports include all 5 new functions + `_resetCache` + `_setRunGh`
- [ ] `df-tools gh resolve <objectiveId>` works against a fixture project (smoke test)
- [ ] `df-tools gh` lists `resolve` in the help text
- [ ] All 4 verification_commands in this TRD's frontmatter exit 0
</verification>

<success_criteria>
- resolveChain() returns the structured shape from CONTEXT.md §"Resolver output shape" with proper provenance vocabulary
- Shorthand `#NN` resolves against PROJECT.md github_repo (or warns + keeps literal if missing)
- Per-process in-memory cache works; second call within same process returns cached result with `'cached'` provenance for walked/inherited fields
- df-tools gh resolve CLI subcommand emits JSON; exits non-zero on missing objective
- All 5 new exports unit-testable via mocked `_setRunGh`; no live gh calls in unit suite
- SC-2 (resolver structured output), SC-3 (in-memory cache), SC-6 (lib/gh.cjs surface partial) addressed
</success_criteria>

<output>
After completion, create `.planning/objectives/01-github-coordination-layer/01-02-resolver-chain-walk-SUMMARY.md`.
</output>

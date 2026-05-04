---
objective: 02-cross-repo-awareness-layer
trd: 02-03
title: Org scanner — walkProject (in lib/gh.cjs) + scanOrg (in lib/awareness.cjs) with task-list fallback
type: tdd
confidence: medium
wave: 4
depends_on: [02-01, 02-02]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh.test.cjs
  - plugins/devflow/devflow/bin/lib/awareness.cjs
  - plugins/devflow/devflow/bin/lib/awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
autonomous: true
requirements: [SC-3, SC-4, SC-5]
verification_commands:
  - "npm test -- --grep awareness"
  - "npm test -- --grep walkProject"
  - "node -e 'const gh=require(\"./plugins/devflow/devflow/bin/lib/gh.cjs\"); if(typeof gh.walkProject!==\"function\") throw new Error(\"walkProject not exported\"); console.log(\"OK\");'"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/awareness.cjs\"); if(typeof a.scanOrg!==\"function\") throw new Error(\"scanOrg not exported\"); console.log(\"OK\");'"
  - "git log --oneline feature/v1.1-obj-2-heartbeat -- plugins/devflow/devflow/bin/lib/gh.cjs plugins/devflow/devflow/bin/lib/awareness.cjs | grep -E '^[a-f0-9]+ test\\(02-03\\)' | head -1"
  - "git log --oneline feature/v1.1-obj-2-heartbeat -- plugins/devflow/devflow/bin/lib/gh.cjs plugins/devflow/devflow/bin/lib/awareness.cjs | grep -E '^[a-f0-9]+ feat\\(02-03\\)' | head -1"

must_haves:
  truths:
    - "walkProject(projectId, opts) lives in lib/gh.cjs (not awareness.cjs) — it's a GitHub primitive obj 5/6 also reuse"
    - "walkProject paginates via GraphQL pageInfo.endCursor until hasNextPage=false; returns flat array of items"
    - "Each item carries: { item_type: 'issue'|'draft', issue_ref?, title, body, product, quarter, status, sub_issues: [...] }"
    - "Sub-issues come from `trackedIssues` GraphQL field FIRST"
    - "When trackedIssues.totalCount === 0 (current state of all 9 [Roadmap] issues per spike findings), scanOrg falls back to task-list bullet parser on issue body"
    - "Task-list fallback parses lines matching `- [ ]` / `- [x] ` followed by issue ref (`owner/repo#NN` or `#NN`); ignores plain bullets without checkboxes"
    - "scanOrg(opts) lives in lib/awareness.cjs; composes walkProject + per-item enrichment + parseStateMd is NOT called here (org-side has no STATE.md concept)"
    - "scanOrg calls requireGhAuth(['project', 'read:project', 'repo']) BEFORE any walkProject call (hard-fail per locked decision #10)"
    - "Auth failure throws GhAuthError with structured remediation — caller (skill / CLI) renders the error"
    - "Items the auth'd user can't see are silent (per SC-5) — GraphQL omits them from response, scanOrg has no special-case"
    - "scanOrg uses obj 1's _setRunGh injection (NOT _setRunGit); tests inject mock via existing pattern"
    - "Default project_id = PRODUCT_ROADMAP_FIELDS._project_id (PVT_kwDODwqLrc4BRsOP) when opts.project_id not passed"
    - "Result shape: { items: [...], fetched_at: ISO, project_id, warnings: [...] }"
    - "Test list documented in TRD body BEFORE test code written (TDD Playbook habit 2)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/gh.cjs"
      provides: "Single new export: walkProject. Module.exports extended to include it. No other gh.cjs functions modified."
      exports: ["walkProject"]
    - path: "plugins/devflow/devflow/bin/lib/gh.test.cjs"
      provides: "Test group: walkProject pagination + GraphQL response parsing + sub-issue extraction."
      min_lines: 80
    - path: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      provides: "scanOrg + task-list fallback parser. Module.exports extended."
    - path: "plugins/devflow/devflow/bin/lib/awareness.test.cjs"
      provides: "Test group: scanOrg happy paths + task-list fallback + auth failure."
      min_lines: 100
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs"
      provides: "Extended: buildGhResponse_projectItemsList (paginated GraphQL responses), buildGhResponse_subIssuesByTrackedIssues, buildGhResponse_subIssuesByTaskList."
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::walkProject"
      via: "require + function call"
      pattern: "require.*gh\\.cjs.*walkProject"
    - from: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::requireGhAuth"
      via: "require + function call (called BEFORE walkProject)"
      pattern: "requireGhAuth\\(\\["
    - from: "plugins/devflow/devflow/bin/lib/gh.cjs::walkProject"
      to: "_runGh (already in lib/gh.cjs)"
      via: "internal call (preserves test injection)"
      pattern: "_runGh\\("
---

<objective>
Ship the org-side scanner: a `walkProject` GraphQL helper in `lib/gh.cjs` (the GitHub primitive layer), composed with a `scanOrg` orchestrator in `lib/awareness.cjs`. Walks the org Product Roadmap project items + each item's direct sub-issues, with a task-list parser fallback for the (current-reality) case where `trackedIssues` is empty and deliverables are listed as prose bullets.

Purpose: Locked decision #3 — org progress reuses obj 1's resolver primitives. `lib/gh.cjs` already has `resolveChain(frontmatter, projectCtx)` walking ONE objective; this TRD adds `walkProject(projectId)` walking ALL items in a project. Stays in `lib/gh.cjs` because (a) it's a GitHub-API helper obj 5/6 will also reuse, (b) it shares `_runGh` injection with the rest of `gh.cjs`, and (c) it co-locates with `requireGhAuth`. The `scanOrg` orchestrator lives in `awareness.cjs` because it composes `walkProject` with the awareness-specific enrichment (task-list fallback parser, default project_id resolution).

This is the ONLY TRD that co-modifies `lib/gh.cjs`. Wave 4 is solo to preserve obj 1's tests' baseline.

Output: `walkProject` exported from `lib/gh.cjs`; `scanOrg` exported from `lib/awareness.cjs`; both fully tested with mocked `_runGh`; task-list fallback parser unit-tested.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── gh.cjs                                 ← MODIFY  (add walkProject; extend module.exports)
├── gh.test.cjs                            ← MODIFY  (add walkProject tests)
├── awareness.cjs                          ← MODIFY  (add scanOrg + task-list parser; extend module.exports)
├── awareness.test.cjs                     ← MODIFY  (add scanOrg tests)
└── __fixtures__/
    └── gh-fixtures.cjs                    ← MODIFY  (add buildGhResponse_projectItemsList et al)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing GraphQL pattern in `lib/gh.cjs::_walkParent`** (the closest analog):

```js
function _walkParent(parentIssueRef) {
  if (!parentIssueRef || !/^[^/]+\/[^#]+#\d+$/.test(parentIssueRef)) { ... }
  const m = parentIssueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  const [, owner, repo, num] = m;

  const query = `query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        title
        projectItems(first: 5) {
          nodes {
            project { id title }
            fieldValues(first: 10) { nodes { ... } }
          }
        }
      }
    }
  }`;

  const r = _runGh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${repo}`, '-F', `number=${num}`]);
  if (!r.ok) return { roadmap_issue: null, ... };
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return ...; }
  // ... extract data
}
```

**Existing pagination pattern**: not yet established in this codebase. obj 2 introduces it. Pattern to follow:

```js
function walkProject(projectId, opts = {}) {
  const items = [];
  let cursor = null;
  let hasNextPage = true;
  const warnings = [];

  while (hasNextPage) {
    const r = _runGh(['api', 'graphql', '-f', `query=${query}`, '-F', `projectId=${projectId}`,
                      ...(cursor ? ['-F', `cursor=${cursor}`] : [])]);
    if (!r.ok) {
      warnings.push(`walkProject failed: ${r.stderr || 'unknown'}`);
      break;
    }
    let parsed;
    try { parsed = JSON.parse(r.stdout); } catch { warnings.push('parse failed'); break; }
    const data = parsed?.data?.node;
    if (!data?.items?.nodes) { warnings.push('unexpected response shape'); break; }
    for (const node of data.items.nodes) items.push(_normalizeItem(node));
    hasNextPage = data.items.pageInfo?.hasNextPage || false;
    cursor = data.items.pageInfo?.endCursor || null;
  }

  return { items, warnings };
}
```

**Real Product Roadmap response shape** (from `__fixtures__/gh-cassettes/devflow-claude-9-walk.json`):

```json
{
  "data": {
    "repository": {
      "issue": {
        "projectItems": {
          "nodes": [{
            "project": { "id": "PVT_kwDODwqLrc4BRsOP", "title": "Product Roadmap" },
            "fieldValues": {
              "nodes": [
                { "name": "In Progress", "field": { "name": "Status" } },
                { "name": "DevFlow", "field": { "name": "Product" } },
                { "name": "Q2 2026", "field": { "name": "Quarter" } }
              ]
            }
          }]
        }
      }
    }
  }
}
```

For walkProject, the equivalent shape is keyed by `node` (the project) not `repository.issue`:

```json
{
  "data": {
    "node": {
      "items": {
        "pageInfo": { "hasNextPage": false, "endCursor": "..." },
        "nodes": [{
          "content": {
            "__typename": "Issue",
            "number": 33,
            "title": "[Roadmap] Go Backend Migration - April 2026",
            "repository": { "nameWithOwner": "AO-Cyber-Systems/aodex" },
            "body": "## Deliverables\n- Some deliverable\n- AO-Cyber-Systems/aodex#101\n",
            "trackedIssues": { "totalCount": 0, "nodes": [] }
          },
          "fieldValues": {
            "nodes": [
              { "name": "In Progress", "field": { "name": "Status" } },
              { "name": "AODex", "field": { "name": "Product" } },
              { "name": "Q2 2026", "field": { "name": "Quarter" } }
            ]
          }
        }]
      }
    }
  }
}
```

</codebase_examples>

<anti_patterns>

- **Do NOT add walkProject to lib/awareness.cjs.** It's a GitHub primitive — keep it in `lib/gh.cjs` next to `resolveChain`. Obj 5/6 will reuse it.
- **Do NOT call requireGhAuth from walkProject.** Auth checking is the orchestrator's responsibility (`scanOrg` calls it). Keeps `walkProject` reusable for callers that already authed.
- **Do NOT reuse obj 1's `_walkParent` query.** That walks ONE issue's projectItems; `walkProject` walks ONE project's items. Different shapes.
- **Do NOT special-case the Product Roadmap project ID inside walkProject.** Pass `projectId` as an arg. The DEFAULT in `scanOrg` is the Product Roadmap ID, but `walkProject` accepts any.
- **Do NOT throw on a missing `body` field.** The task-list parser must handle `body=null` (return empty sub-issues array).
- **Do NOT silently skip items with neither `trackedIssues` nor parseable task-list.** Return them with `sub_issues: []` and add an info-level note in `warnings` (caller decides whether to display). Locked.
- **Do NOT add a project-walker CLI subcommand.** That's TRD 02-05's job. This TRD is library-only.

</anti_patterns>

<error_recovery>

- If a single GraphQL page fails (rate limit, transient 5xx), record the warning and STOP pagination — return whatever items we got. Do NOT retry within walkProject; let the caller decide.
- If pagination loop iterates >100 times, abort with `warnings.push('walkProject: aborted at 100 pages — likely an infinite loop')`. Defensive guard.
- If `requireGhAuth` throws inside scanOrg, propagate the error (don't catch — the skill / CLI handles it). The CLI surface in TRD 02-05 catches GhAuthError + exits 1 with structured JSON to stderr (mirrors obj 1's cmdGhResolve / cmdGhSyncObjective).
- Per project memory `feedback_planner_proto_conflict`: this TRD adds ONE function to `lib/gh.cjs`; existing `gh.cjs` tests must continue passing. Run full `npm test` (not just `--grep awareness`) to verify obj 1's tests aren't broken.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/02-cross-repo-awareness-layer/02-CONTEXT.md
@.planning/objectives/02-cross-repo-awareness-layer/02-RESEARCH.md
@.planning/objectives/01-github-coordination-layer/01-CONTEXT.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json
</context>

<research_context>

From `.planning/research/github-coordination-layer.md` §"Existing org Project — major discovery":

> The org **already has a master roadmap**: **"Product Roadmap"** (Project #3, 37 items, owned by @justindonnaruma).
>
> **Custom fields:** Status (Todo / In Progress / Done), Product (AODex / AOSentry / Trades / DevFlow / Eden Platform / Eden Biz / Infrastructure / Corporate), Quarter (Q1 2026 → Q4 2027). Standard fields: Title, Assignees, Labels, Repository, Milestone, Linked PRs, Parent Issue, Sub-issues progress.
>
> **Items breakdown:**
> - **28 draft issues** = high-level program milestones not yet promoted to real issues
> - **9 real `[Roadmap]` issues** linked from primary repos: aodex#33, aodex-flutter#2, aosentry#20, trades#244, eden-biz#4, devflow#17, eden-ui#1, eden-ui-flutter#1, aocyber-cloud#1
>
> **None of the 9 `[Roadmap]` issues use sub-issues** — `trackedIssues.totalCount: 0` on all. The pattern is set up but not yet populated.

This is why scanOrg's task-list fallback is essential: the 9 real items have NO sub-issues; deliverables are prose bullets in the body. Without the fallback, scanOrg returns 9 items each with `sub_issues: []` — useless for the awareness view.

From `.planning/research/cross-session-coordination.md` §"Active-session heartbeat" → not directly applicable to org-side; org-side is purely a Project walk.

</research_context>

<gotchas>

- **`trackedIssues` is the GitHub native sub-issue field** (GA Q4 2024). Returns `{ totalCount, nodes[] }` where `nodes[]` is the direct children. Always check `totalCount === 0` before falling back.
- **The Project ID `PVT_kwDODwqLrc4BRsOP`** is the org Product Roadmap. Hard-coded as default in `PRODUCT_ROADMAP_FIELDS._project_id`. scanOrg pulls from there when `opts.project_id` not passed.
- **GraphQL union type for `content`**: project items can be Issues OR DraftIssues. Use `... on Issue { ... } ... on DraftIssue { title body }` to handle both. Drafts have no `repository` or `number` — emit `item_type: 'draft'` with `issue_ref: null`.
- **Cursor-based pagination**: GraphQL returns `pageInfo.endCursor` (string) and `pageInfo.hasNextPage` (bool). Pass `endCursor` as `$cursor` argument on next iteration. First iteration passes `null` (or omits the arg).
- **Cassette capture happens in TRD 02-07**, not here. Until then, all unit tests use hand-built `buildGhResponse_projectItemsList` mocks. The integration test in TRD 02-07 captures real responses and commits them.
- **gh CLI graphql variable types**: `$cursor: String` accepts null and omitting; either form works on first page. Use `'-F', 'cursor=null'` (literal "null" string — gh CLI converts to JSON null) or simply omit the `-F cursor=...` flag on first page.
- **Wave-4 file co-modification**: this TRD touches `lib/gh.cjs`. The CONTEXT.md §"Wave structure" locks 02-03 as solo-in-Wave-4 to preserve test stability for obj 1's existing 563 tests.

</gotchas>

## Test list

Per TDD Playbook habit 2. All cases enumerated BEFORE test code:

**Group W — walkProject happy paths (all use buildMockRunGh, no live gh):**
1. W1: single page (3 items, hasNextPage=false) → returns 3 normalized items
2. W2: two pages (5 items page 1 + 4 items page 2) → returns 9 items; pagination cursor passed correctly
3. W3: empty project (0 items, hasNextPage=false) → returns `{ items: [], warnings: [] }`
4. W4: each item carries normalized fields {item_type, issue_ref, title, body, product, quarter, status, sub_issues}
5. W5: DraftIssue content type → item_type='draft', issue_ref=null, title+body present
6. W6: Issue content type with `trackedIssues.totalCount=2` → sub_issues array has 2 entries with {ref, title, state}
7. W7: Issue content type with `trackedIssues.totalCount=0` → sub_issues=[] AND raw body preserved (so scanOrg can task-list-parse)

**Group WF — walkProject failure modes:**
8. WF1: GraphQL response ok:false → warnings.push the stderr; items=[] (or whatever was collected before failure)
9. WF2: GraphQL response with `data: null` (auth issue) → warnings.push('unexpected response shape'); items=[]
10. WF3: malformed JSON in stdout → warnings.push('parse failed'); items=[]
11. WF4: pagination loop guard — mock returns hasNextPage=true forever → walkProject aborts at 100 pages with warning

**Group T — task-list fallback parser (lives in awareness.cjs):**
12. T1: body with `- [ ] AO-Cyber-Systems/aodex#101` → sub_issues=[{ref:'AO-Cyber-Systems/aodex#101', state:'OPEN', title:''}]
13. T2: body with `- [x] AO-Cyber-Systems/aodex#102 — Some title` → sub_issues=[{ref:'AO-Cyber-Systems/aodex#102', state:'CLOSED', title:'Some title'}]
14. T3: body with shorthand `- [ ] #50` → sub_issues=[{ref:'#50', state:'OPEN', title:''}] (DO NOT expand shorthand here — it's noted as an awareness-time decision; consumer can resolve)
15. T4: body with mixed checkbox + plain bullet `- AO-Cyber-Systems/aodex#100` → ONLY the checkbox-prefixed line counts; plain bullet ignored
16. T5: body with no parseable lines → sub_issues=[]
17. T6: body=null → sub_issues=[]
18. T7: body with markdown headings + checkboxes mixed → only checkbox lines counted

**Group O — scanOrg orchestrator happy paths:**
19. O1: scanOrg with default opts → calls requireGhAuth(['project','read:project','repo']) FIRST (assert via mock counter)
20. O2: scanOrg uses default project_id from PRODUCT_ROADMAP_FIELDS._project_id when opts.project_id undefined
21. O3: 3 items returned by walkProject → result.items.length === 3; each item has filled sub_issues (mix of trackedIssues + task-list)
22. O4: result shape: { items, fetched_at: ISO, project_id, warnings }
23. O5: walkProject returns warnings → scanOrg result.warnings includes them all

**Group OA — scanOrg auth failure path:**
24. OA1: requireGhAuth throws GhAuthError (mocked via gh auth status returning ok:false) → scanOrg propagates the error (does NOT catch); error has structured shape (.remediation, .scopes_missing)
25. OA2: scanOrg never calls walkProject when auth fails (mock counter assertion)

**Group OS — scanOrg silent-on-permissions:**
26. OS1: walkProject returns items where some are missing `repository` field (auth'd user can see project but not certain repo's issues) → scanOrg returns those items unchanged with item_type='issue', issue_ref=null, no warning per SC-5

**Group F — fixture builders:**
27. F1: buildGhResponse_projectItemsList({ items, hasNextPage, endCursor }) returns `{ ok: true, stdout: <JSON envelope>, stderr: '' }`
28. F2: buildGhResponse_subIssuesByTrackedIssues includes nodes array with {number, title, state, repository}
29. F3: buildGhResponse_subIssuesByTaskList builds an Issue body string with `- [ ] owner/repo#NN` lines

**Group GG — gh.test.cjs integration with existing patterns:**
30. GG1: existing 563 obj-1 tests still pass (no regression in lib/gh.cjs from adding walkProject) — verified by `npm test` count rising by ~30 (this TRD's tests) not falling
31. GG2: walkProject is exported from gh.cjs's module.exports block

Total: 31 enumerated cases. RED → GREEN one at a time per TDD Playbook habit 3.

<tasks>

<task type="auto">
  <name>Task 1: Extend gh-fixtures.cjs — buildGhResponse_projectItemsList + sub-issue helpers</name>
  <files>
    plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
  </files>
  <action>
Append to existing gh-fixtures.cjs (do NOT modify existing factories used by obj 1):

```js
// ─── TRD 02-03: walkProject + scanOrg fixtures ──────────────────────────────

/**
 * Canned GraphQL response for `gh api graphql` walking a Project's items.
 * `items` is an array of:
 *   { content_type: 'Issue'|'DraftIssue', issue_ref?, title, body, status, product, quarter,
 *     tracked_total?, tracked_nodes? }
 * `hasNextPage` defaults to false; `endCursor` defaults to null.
 */
function buildGhResponse_projectItemsList({
  items = [],
  hasNextPage = false,
  endCursor = null,
} = {}) {
  const nodes = items.map(item => {
    const content = item.content_type === 'DraftIssue' ? {
      __typename: 'DraftIssue',
      title: item.title || 'Draft',
      body: item.body || '',
    } : (() => {
      const m = (item.issue_ref || '').match(/^([^/]+)\/([^#]+)#(\d+)$/);
      return {
        __typename: 'Issue',
        number: m ? parseInt(m[3], 10) : null,
        title: item.title || 'Issue',
        body: item.body || '',
        repository: m ? { nameWithOwner: `${m[1]}/${m[2]}` } : null,
        trackedIssues: {
          totalCount: item.tracked_total ?? 0,
          nodes: item.tracked_nodes || [],
        },
      };
    })();
    const fieldValues = { nodes: [] };
    if (item.status) fieldValues.nodes.push({ name: item.status, field: { name: 'Status' } });
    if (item.product) fieldValues.nodes.push({ name: item.product, field: { name: 'Product' } });
    if (item.quarter) fieldValues.nodes.push({ name: item.quarter, field: { name: 'Quarter' } });
    return { content, fieldValues };
  });

  return {
    ok: true, status: 0,
    stdout: JSON.stringify({
      data: { node: { items: { pageInfo: { hasNextPage, endCursor }, nodes } } },
    }),
    stderr: '',
  };
}

/**
 * Helper: build a trackedIssues node array for use in items[].tracked_nodes.
 * Each entry shapes as { number, title, state, repository: { nameWithOwner } }.
 */
function buildGhResponse_subIssuesByTrackedIssues({ subIssues = [] } = {}) {
  // subIssues: [{ ref: 'owner/repo#NN', title, state }]
  return subIssues.map(s => {
    const m = s.ref.match(/^([^/]+)\/([^#]+)#(\d+)$/);
    return {
      number: m ? parseInt(m[3], 10) : 0,
      title: s.title || 'Sub-issue',
      state: s.state || 'OPEN',
      repository: m ? { nameWithOwner: `${m[1]}/${m[2]}` } : null,
    };
  });
}

/**
 * Helper: build an Issue body string with task-list bullet items for fallback parsing.
 * `entries`: [{ ref, title?, checked? }]
 *   ref: 'AO-Cyber-Systems/aodex#101' or '#50'
 *   title: optional; rendered as `- [ ] <ref> — <title>`
 *   checked: bool, default false
 */
function buildGhResponse_subIssuesByTaskList({ entries = [], header = '## Deliverables\n\n' } = {}) {
  const lines = [header];
  for (const e of entries) {
    const mark = e.checked ? 'x' : ' ';
    const titlePart = e.title ? ` — ${e.title}` : '';
    lines.push(`- [${mark}] ${e.ref}${titlePart}`);
  }
  return lines.join('\n');
}
```

Update module.exports at the bottom — add the 3 new factories alongside existing ones.

# CRITICAL: Existing factories (buildFrontmatter, buildProjectCtx, buildMockRunGh, ...) MUST stay unchanged. Obj 1's gh.test.cjs depends on them.
# GOTCHA: Use `??` (nullish coalescing) for `tracked_total` so 0 is preserved (vs `||` which treats 0 as falsy).
# PATTERN: Match the response envelope shape `{ data: { node: { items: { pageInfo, nodes } } } }` exactly — `node` (not `repository`) because we're querying by Project node ID.
  </action>
  <verify>
1. Module loads: `node -e 'require("./plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs"); console.log("OK")'`
2. New factories exported: `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs"); for (const k of ["buildGhResponse_projectItemsList","buildGhResponse_subIssuesByTrackedIssues","buildGhResponse_subIssuesByTaskList"]) if (typeof f[k] !== "function") throw new Error(k); console.log("OK")'`
3. obj 1's tests still pass: `npm test 2>&1 | tail -5` shows no regression
  </verify>
  <done>
3 new factories appended; module.exports updated; obj 1's existing factories unchanged; full `npm test` count unchanged.
  </done>
  <recovery>
If `?? 0` syntax not supported by the Node version, fall back to `(item.tracked_total != null ? item.tracked_total : 0)`. Verify with the project's `package.json` engines field; fallback if unsure.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: RED + GREEN — walkProject in lib/gh.cjs (single-task RED→GREEN cycle since walkProject is one cohesive unit)</name>
  <files>
    plugins/devflow/devflow/bin/lib/gh.cjs
    plugins/devflow/devflow/bin/lib/gh.test.cjs
  </files>
  <action>
This task ships RED + GREEN for walkProject in TWO commits.

**Step A — RED: Append failing tests to `lib/gh.test.cjs`:**

Add a section divider:
```js
// ─── TRD 02-03: walkProject ────────────────────────────────────────────────
const {
  buildGhResponse_projectItemsList,
  buildGhResponse_subIssuesByTrackedIssues,
  buildGhResponse_subIssuesByTaskList,  // not used here — used in awareness.test.cjs
} = require('./__fixtures__/gh-fixtures.cjs');
const { walkProject } = require('./gh.cjs');  // undefined until Step B
```

Implement Group W (W1-W7) and Group WF (WF1-WF4) tests — 11 tests total. Each test sets up a `Map<string, response>` for `_setRunGh` to consume, calls `walkProject(projectId)`, asserts shape.

Test scaffold:
```js
test('W1: walkProject single page returns 3 normalized items', () => {
  const responses = new Map();
  responses.set('api graphql -f', buildGhResponse_projectItemsList({
    items: [
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aodex#33',
        title: '[Roadmap] Foo', body: '', status: 'In Progress', product: 'AODex', quarter: 'Q2 2026' },
      { content_type: 'Issue', issue_ref: 'AO-Cyber-Systems/aosentry#20',
        title: '[Roadmap] Bar', body: '', status: 'Todo', product: 'AOSentry', quarter: 'Q2 2026' },
      { content_type: 'DraftIssue', title: 'DevFlow Internal Alpha', body: 'wip', status: 'Todo', product: 'DevFlow', quarter: 'Q2 2026' },
    ],
    hasNextPage: false,
  }));
  const mock = buildMockRunGh(responses);
  _setRunGh(mock);
  try {
    const result = walkProject('PVT_test');
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[0].item_type, 'issue');
    assert.strictEqual(result.items[0].issue_ref, 'AO-Cyber-Systems/aodex#33');
    assert.strictEqual(result.items[2].item_type, 'draft');
    assert.deepStrictEqual(result.warnings, []);
  } finally { _setRunGh(null); }
});
```

After all 11 W/WF tests written, commit RED:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "test(02-03): add failing tests for walkProject pagination + parsing" \
  --files plugins/devflow/devflow/bin/lib/gh.test.cjs plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
```

**Step B — GREEN: Implement walkProject in `lib/gh.cjs`:**

Append below existing `_walkParent` (which is internal) — section divider:

```js
// ─── TRD 02-03: walkProject (org Project walker) ────────────────────────────

/**
 * Walk all items in a Project v2 (e.g., the org Product Roadmap).
 * Paginates via GraphQL pageInfo.endCursor until hasNextPage=false.
 *
 * Returns { items: [...], warnings: [...] }.
 *
 * Each item:
 *   { item_type: 'issue'|'draft',
 *     issue_ref: 'owner/repo#NN' | null,
 *     title, body,
 *     product, quarter, status,    // from Project custom fields
 *     sub_issues: [{ ref, title, state }] }
 *
 * sub_issues comes from the GitHub-native trackedIssues field. When totalCount===0,
 * scanOrg (in awareness.cjs) falls back to parsing the issue body for task-list bullets.
 *
 * Auth: caller is responsible for requireGhAuth before invoking. walkProject does
 * not check auth — it's a primitive obj 5/6 also reuse with their own auth context.
 */
function walkProject(projectId, opts = {}) {
  if (!projectId) {
    return { items: [], warnings: ['walkProject: projectId is required'] };
  }

  const items = [];
  const warnings = [];
  let cursor = null;
  let pageCount = 0;
  const MAX_PAGES = 100;

  const query = `query($projectId: ID!, $cursor: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            content {
              __typename
              ... on Issue {
                number
                title
                body
                repository { nameWithOwner }
                trackedIssues(first: 20) {
                  totalCount
                  nodes { number title state repository { nameWithOwner } }
                }
              }
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
  }`;

  while (true) {
    if (++pageCount > MAX_PAGES) {
      warnings.push(`walkProject: aborted at ${MAX_PAGES} pages — likely an infinite loop`);
      break;
    }

    const args = ['api', 'graphql', '-f', `query=${query}`, '-F', `projectId=${projectId}`];
    if (cursor) args.push('-F', `cursor=${cursor}`);

    const r = _runGh(args);
    if (!r.ok) {
      warnings.push(`walkProject failed: ${r.stderr || 'unknown gh error'}`);
      break;
    }

    let parsed;
    try { parsed = JSON.parse(r.stdout); } catch {
      warnings.push('walkProject: response JSON parse failed');
      break;
    }

    const node = parsed && parsed.data && parsed.data.node;
    if (!node || !node.items || !Array.isArray(node.items.nodes)) {
      warnings.push('walkProject: unexpected response shape');
      break;
    }

    for (const itemNode of node.items.nodes) {
      const c = itemNode && itemNode.content;
      if (!c) continue;

      const fieldsByName = {};
      for (const fv of (itemNode.fieldValues && itemNode.fieldValues.nodes) || []) {
        const fName = fv.field && fv.field.name;
        if (!fName) continue;
        fieldsByName[fName] = fv.name || fv.text || null;
      }

      if (c.__typename === 'DraftIssue') {
        items.push({
          item_type: 'draft',
          issue_ref: null,
          title: c.title || '',
          body: c.body || '',
          product: fieldsByName.Product || null,
          quarter: fieldsByName.Quarter || null,
          status: fieldsByName.Status || null,
          sub_issues: [],
        });
      } else if (c.__typename === 'Issue') {
        const repo = c.repository && c.repository.nameWithOwner;
        const issue_ref = (repo && c.number) ? `${repo}#${c.number}` : null;
        const sub_issues = ((c.trackedIssues && c.trackedIssues.nodes) || []).map(s => ({
          ref: s.repository && s.number ? `${s.repository.nameWithOwner}#${s.number}` : null,
          title: s.title || '',
          state: s.state || 'OPEN',
        }));
        items.push({
          item_type: 'issue',
          issue_ref,
          title: c.title || '',
          body: c.body || '',
          product: fieldsByName.Product || null,
          quarter: fieldsByName.Quarter || null,
          status: fieldsByName.Status || null,
          sub_issues,
        });
      }
    }

    if (!node.items.pageInfo || !node.items.pageInfo.hasNextPage) break;
    cursor = node.items.pageInfo.endCursor || null;
    if (!cursor) break;
  }

  return { items, warnings };
}
```

Append `walkProject` to the existing module.exports block (preserve every other entry):

```js
module.exports = {
  // ...everything that was already there...
  walkProject,
};
```

Run `npm test`. All 11 W/WF tests pass; existing 563 obj-1 tests still pass.

Commit GREEN:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "feat(02-03): add walkProject GraphQL helper for Project v2 walking" \
  --files plugins/devflow/devflow/bin/lib/gh.cjs
```

# CRITICAL: Do NOT touch any other function in lib/gh.cjs. Strictly additive. The 'pageCount > MAX_PAGES' guard prevents infinite loops.
# GOTCHA: gh CLI passes `-F cursor=null` literal "null" string. Some shells convert this. Use string `cursor=` value carefully — to be safe, OMIT the `-F cursor=...` arg on the first iteration (cursor=null) and ONLY include it on subsequent iterations.
# PATTERN: Mirror _walkParent's structure: query → spawn → JSON.parse → null-check chain → extract.
  </action>
  <verify>
1. RED commit visible: `git log --oneline -2 | grep -E '^[a-f0-9]+ test\(02-03\):'`
2. GREEN commit visible: `git log --oneline -1 | grep -E '^[a-f0-9]+ feat\(02-03\):'`
3. `npm test` total count rises by 11 (W/WF) WITHOUT decreasing (no regression)
4. walkProject exported: `node -e 'const gh=require("./plugins/devflow/devflow/bin/lib/gh.cjs"); if (typeof gh.walkProject !== "function") throw new Error("not exported"); console.log("OK")'`
  </verify>
  <done>
walkProject lives in lib/gh.cjs; exported; tested via 11 enumerated cases. Two atomic commits (test → feat). No regression in existing tests.
  </done>
  <recovery>
If a graphql query syntax error trips the test (gh CLI won't parse the variable types), simplify the query — e.g., remove `... on ProjectV2 {}` cast (project IDs are unambiguously ProjectV2). Verify against a real `gh api graphql` invocation manually first if you have GH_INTEGRATION=1 + auth scopes.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: RED + GREEN — scanOrg + task-list parser in lib/awareness.cjs</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness.cjs
    plugins/devflow/devflow/bin/lib/awareness.test.cjs
  </files>
  <action>
**Step A — RED: Append failing tests to `lib/awareness.test.cjs`:**

Section divider:
```js
// ─── TRD 02-03: scanOrg + task-list fallback ──────────────────────────────
const {
  scanOrg, parseTaskListFallback,  // both undefined until Step B
} = require('./awareness.cjs');
const {
  walkProject, _setRunGh, requireGhAuth, GhAuthError,
} = require('./gh.cjs');
const {
  buildGhResponse_projectItemsList,
  buildGhResponse_subIssuesByTrackedIssues,
  buildGhResponse_subIssuesByTaskList,
} = require('./__fixtures__/gh-fixtures.cjs');
```

Implement Group T (T1-T7), Group O (O1-O5), Group OA (OA1-OA2), Group OS (OS1) — 15 tests.

For Group OA (auth failure mock): mock `gh auth status` to return ok:false:
```js
test('OA1: scanOrg propagates GhAuthError on missing scopes', () => {
  const responses = new Map();
  responses.set('auth status', { ok: false, status: 1, stdout: '', stderr: 'not logged in' });
  _setRunGh(buildMockRunGh(responses));
  try {
    assert.throws(() => scanOrg(), (e) => e.name === 'GhAuthError');
  } finally { _setRunGh(null); }
});
```

Commit RED:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "test(02-03): add failing tests for scanOrg orchestrator + task-list fallback" \
  --files plugins/devflow/devflow/bin/lib/awareness.test.cjs
```

**Step B — GREEN: Implement scanOrg + parseTaskListFallback in `lib/awareness.cjs`:**

Append below existing TRD 02-02 region (peer scanner). Section divider:

```js
// ─── TRD 02-03: scanOrg orchestrator + task-list fallback ──────────────────
const gh = require('./gh.cjs');

/**
 * Parse task-list bullet items from issue body for sub-issue fallback.
 * Matches lines like:
 *   - [ ] AO-Cyber-Systems/aodex#101 — Some title
 *   - [x] #50 — Other title
 * Plain bullets without checkboxes are IGNORED.
 *
 * Returns array of { ref, title, state } where state is 'OPEN'|'CLOSED'.
 */
function parseTaskListFallback(body) {
  if (!body || typeof body !== 'string') return [];
  const out = [];
  const lines = body.split('\n');
  // - [ ] or - [x] followed by issue ref (full or shorthand)
  const re = /^\s*[-*]\s+\[([ xX])\]\s+(\S+#\d+)(?:\s*[—\-:]\s*(.+))?/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const checked = m[1].toLowerCase() === 'x';
    const ref = m[2];
    const title = (m[3] || '').trim();
    out.push({ ref, title, state: checked ? 'CLOSED' : 'OPEN' });
  }
  return out;
}

/**
 * Scan the org Product Roadmap project (or another project by ID) and return
 * structured items + their sub-issues.
 *
 * Composes:
 *   - requireGhAuth(['project', 'read:project', 'repo'])  (hard-fail per locked decision #10)
 *   - walkProject(projectId) from gh.cjs
 *   - parseTaskListFallback for items with trackedIssues.totalCount === 0
 *
 * Returns { items, fetched_at, project_id, warnings }.
 *
 * Throws GhAuthError on auth failure — caller (skill / CLI) renders the structured error.
 */
function scanOrg({
  project_id,
} = {}) {
  // 1. Hard-fail auth (locked decision #10)
  gh.requireGhAuth(['project', 'read:project', 'repo']);

  // 2. Resolve default project_id (org Product Roadmap from cassette)
  const resolvedId = project_id || (gh.PRODUCT_ROADMAP_FIELDS && gh.PRODUCT_ROADMAP_FIELDS._project_id) || null;
  if (!resolvedId) {
    return {
      items: [],
      fetched_at: new Date().toISOString(),
      project_id: null,
      warnings: ['scanOrg: no project_id supplied and no default available (cassette missing?)'],
    };
  }

  // 3. Walk project items
  const walk = gh.walkProject(resolvedId);

  // 4. For each item with empty trackedIssues, fall back to task-list parsing
  const enriched = walk.items.map(item => {
    if (item.item_type === 'issue' && item.sub_issues.length === 0 && item.body) {
      const fallback = parseTaskListFallback(item.body);
      if (fallback.length > 0) {
        return Object.assign({}, item, { sub_issues: fallback, sub_issues_source: 'task_list' });
      }
    }
    if (item.sub_issues.length > 0) {
      return Object.assign({}, item, { sub_issues_source: 'tracked_issues' });
    }
    return Object.assign({}, item, { sub_issues_source: 'none' });
  });

  return {
    items: enriched,
    fetched_at: new Date().toISOString(),
    project_id: resolvedId,
    warnings: [...(walk.warnings || [])],
  };
}
```

Append to module.exports (preserve all prior entries):

```js
module.exports = {
  // ...all prior...
  scanOrg, parseTaskListFallback,
};
```

Run `npm test`. All 15 T/O/OA/OS tests pass; all prior tests still pass.

Commit GREEN:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "feat(02-03): implement scanOrg + task-list fallback parser" \
  --files plugins/devflow/devflow/bin/lib/awareness.cjs
```

# CRITICAL: scanOrg's first action is requireGhAuth. Tests OA1/OA2 assert this ordering. Don't refactor to lazy-auth.
# GOTCHA: parseTaskListFallback regex tolerates `*` bullet marker AND `-`. The `—` em-dash separator AND `-` ASCII dash both work for title delimiter.
# PATTERN: scanOrg adds an extra field `sub_issues_source: 'tracked_issues'|'task_list'|'none'` per item — useful for the skill renderer to show provenance ("via task list" tag).
  </action>
  <verify>
1. RED commit visible: `git log --oneline -2 | grep -E '^[a-f0-9]+ test\(02-03\)' | wc -l` (should be at least 1; this task adds another test commit)
2. GREEN commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ feat\(02-03\):'`
3. `npm test` total count rises by 15 more (T/O/OA/OS) WITHOUT decreasing
4. Both new exports present: `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/awareness.cjs"); for (const k of ["scanOrg","parseTaskListFallback"]) if (typeof a[k] !== "function") throw new Error(k); console.log("OK")'`
5. Auth-first ordering verified manually: `node -e 'const a=require("./plugins/devflow/devflow/bin/lib/awareness.cjs"); const gh=require("./plugins/devflow/devflow/bin/lib/gh.cjs"); gh._setRunGh(()=>({ok:false,stderr:"not logged in"})); try { a.scanOrg(); throw new Error("did not throw"); } catch(e) { if (e.name !== "GhAuthError") throw e; console.log("OK"); }'`
  </verify>
  <done>
scanOrg + parseTaskListFallback implemented in awareness.cjs; module.exports extended; auth-first ordering verified; 15 enumerated cases pass. RED + GREEN commits landed.
  </done>
  <recovery>
If parseTaskListFallback regex misses real-world examples (e.g., `[Roadmap] aodex#33` body bullets), iterate by capturing the actual body content and adjusting the regex. The regex MUST handle: (1) `- [ ]` or `- [x]` checkbox markers, (2) full ref `owner/repo#NN` or shorthand `#NN`, (3) optional separator + title.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After all tasks ship:

1. `lib/gh.cjs` exports walkProject (added to module.exports without breaking existing 563 tests)
2. `lib/awareness.cjs` exports scanOrg + parseTaskListFallback (added without breaking TRD 02-01/02-02/02-04 tests)
3. `lib/__fixtures__/gh-fixtures.cjs` exports 3 new factories
4. Total test count rises by ~26 (11 walkProject + 15 scanOrg)
5. Atomic commits: 4 total — test(02-03) walkProject → feat(02-03) walkProject → test(02-03) scanOrg → feat(02-03) scanOrg
6. SC-3 covered: scanOrg walks Product Roadmap project, returns hierarchical JSON
7. SC-4 covered: walker fetches Status/Product/Quarter; sub-issues via trackedIssues with task-list fallback
8. SC-5 covered: hard-fail on missing scopes via requireGhAuth; silent on items the user can't see
</verification>

<success_criteria>
- SC-3 fully met: scan-org walks org Product Roadmap project
- SC-4 fully met: custom fields read; trackedIssues with task-list fallback
- SC-5 fully met: requireGhAuth hard-fail integration verified by test OA1/OA2
- Reuse of obj 1 primitives (locked decision #3): walkProject lives in lib/gh.cjs alongside resolveChain; both share _setRunGh; scanOrg orchestrator lives in awareness.cjs
- 4 atomic commits per TDD Playbook (2 test:→feat: cycles, one for walkProject and one for scanOrg)
- Test list (31 cases) implemented per TDD Playbook habit 2
</success_criteria>

<output>
After completion, create `.planning/objectives/02-cross-repo-awareness-layer/02-03-org-scanner-SUMMARY.md`
</output>

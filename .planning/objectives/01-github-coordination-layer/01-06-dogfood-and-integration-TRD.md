---
objective: 01-github-coordination-layer
trd: 01-06
title: Dogfood + integration test — backfill obj 0 frontmatter, capture Project field IDs, round-trip live gh
type: tdd
confidence: medium
wave: 6
depends_on: [01-05]
files_modified:
  - .planning/objectives/00-refine-defaults-table/OBJECTIVE.md
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json
autonomous: true
requirements: [SC-9, SC-10]
verification_commands:
  - "npm test"
  - "git log --oneline feature/v1.1 -- plugins/devflow/devflow/bin/lib/gh.test.cjs | grep -E '^[a-f0-9]+ test\\(01-06\\)' | head -1"
  - "test -f .planning/objectives/00-refine-defaults-table/OBJECTIVE.md && grep -q 'github_issue' .planning/objectives/00-refine-defaults-table/OBJECTIVE.md && grep -q 'parent_issue' .planning/objectives/00-refine-defaults-table/OBJECTIVE.md"
  - "test -f plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json"
  - "test -f plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json"
  - "if [ \"${GH_INTEGRATION:-0}\" = \"1\" ]; then node plugins/devflow/devflow/bin/df-tools.cjs gh resolve 00-refine-defaults-table 2>&1 | grep -q 'devflow-claude#9'; else echo 'GH_INTEGRATION skipped (set GH_INTEGRATION=1 to run live)'; fi"

must_haves:
  truths:
    - ".planning/objectives/00-refine-defaults-table/OBJECTIVE.md exists with frontmatter declaring `github_issue: AO-Cyber-Systems/devflow-claude#20` and `parent_issue: AO-Cyber-Systems/devflow-claude#9`"
    - "Recorded cassette gh-cassettes/devflow-claude-9-walk.json contains the GraphQL response for walking devflow-claude#9 — used by replay tests when GH_INTEGRATION=0"
    - "Recorded cassette gh-cassettes/product-roadmap-fields.json contains gh project field-list output for Product Roadmap (#3) — populates PRODUCT_ROADMAP_FIELDS constant"
    - "PRODUCT_ROADMAP_FIELDS constant in gh.cjs is now populated (._captured: true) with real field IDs + option IDs from the cassette"
    - "Replay-mode integration test (default; no env var) loads cassettes and round-trips resolveChain against obj 0's frontmatter, asserting chain walks to AO-Cyber-Systems/devflow-claude#9 and milestone fields populate"
    - "Live-mode integration test (gated on GH_INTEGRATION=1) hits real gh CLI, asserts identical chain shape, and re-captures the cassettes if gh response shape drifted (test fails with diff if drift detected)"
    - "df-tools gh resolve 00-refine-defaults-table (in this repo, against live gh) returns chain leading to devflow-claude#20 → #9 → org Product Roadmap when GH_INTEGRATION=1"
    - "df-tools gh sync 00-refine-defaults-table (live) updates obj 0's GH issue body + sticky comment + Project Status field; running twice produces no diff in the second sync"
    - "All new tests have test: commits before feat: commits per TDD Playbook"
  artifacts:
    - path: ".planning/objectives/00-refine-defaults-table/OBJECTIVE.md"
      provides: "Backfilled frontmatter with github_issue + parent_issue for the dogfood test target"
      contains: "github_issue"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json"
      provides: "Recorded GraphQL response for walking AO-Cyber-Systems/devflow-claude#9 to its Product Roadmap entry"
      contains: "PVT_kwDODwqLrc4BRsOP"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json"
      provides: "Recorded gh project field-list output — field IDs + option IDs for Status, Product, Quarter"
      contains: "Status"
    - path: "plugins/devflow/devflow/bin/lib/gh.cjs"
      provides: "PRODUCT_ROADMAP_FIELDS constant populated from cassette; updateProjectFields fully wired"
      contains: "PRODUCT_ROADMAP_FIELDS"
    - path: "plugins/devflow/devflow/bin/lib/gh.test.cjs"
      provides: "Adds describe('integration — devflow-claude#9 chain') with replay-mode + live-mode (env-gated) tests"
      contains: "GH_INTEGRATION"
  key_links:
    - from: ".planning/objectives/00-refine-defaults-table/OBJECTIVE.md"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::resolveChain"
      via: "df-tools gh resolve 00-refine-defaults-table reads OBJECTIVE.md frontmatter"
      pattern: "github_issue|parent_issue"
    - from: "plugins/devflow/devflow/bin/lib/gh.test.cjs"
      to: "plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json"
      via: "Replay-mode integration test loads the cassette via fs.readFileSync"
      pattern: "gh-cassettes/devflow-claude-9-walk"
---

<objective>
Backfill `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md` with `github_issue: AO-Cyber-Systems/devflow-claude#20` and `parent_issue: AO-Cyber-Systems/devflow-claude#9` frontmatter so the resolver/sync flow has real data to walk against. Capture two recorded gh cassettes (devflow-claude#9 GraphQL walk + Product Roadmap field-list). Populate `PRODUCT_ROADMAP_FIELDS` constant in gh.cjs from the cassette. Add integration tests with two modes: **replay** (default; reads cassettes; runs in `npm test`) and **live** (gated on `GH_INTEGRATION=1`; hits real gh; re-validates cassettes are current).

Purpose: Closes objective-1 success criteria 9 (round-trip integration test) and 10 (resolver+sync validated against THIS repo's own state). This is the dogfood TRD — proves the whole pipeline works end-to-end against live data, then captures that data as a stable replay artifact for CI/local-dev without gh auth.

Output: Backfilled OBJECTIVE.md frontmatter for obj 0 (one file). Two cassette JSON files (~5–20KB each). `PRODUCT_ROADMAP_FIELDS` in gh.cjs populated and `_captured: true`. `updateProjectFields` upgraded from stub to fully-wired (uses captured field IDs). New integration tests in `gh.test.cjs` covering both replay and live modes.

Why TDD: integration tests are the testable surface; `updateProjectFields` upgrade is a small pure-logic addition (mutation building) but most of this TRD is "capture real data and validate the system handles it." The RED→GREEN cycle is: (a) write integration tests assuming cassettes exist → RED, (b) capture cassettes via live gh + populate constant → GREEN.

Why confidence: medium. The backfill + cassette capture depends on a working gh auth environment AT EXECUTION TIME and access to AO-Cyber-Systems org. If executor runs without scoped auth, the cassette-capture step blocks. Recovery: pause execution, prompt user for `gh auth refresh -s project,read:project`, resume. (No checkpoint pre-planned per autopilot mode; the cmdGhResolve/cmdGhSyncObjective functions already throw with remediation per TRD 01-03 — executor catches the GhAuthError and surfaces it.)
</objective>

<file_tree>
.planning/objectives/00-refine-defaults-table/
└── OBJECTIVE.md                              ← CREATE (currently absent — see TRD 0.x doesn't ship one; CONTEXT.md is what exists)

plugins/devflow/devflow/bin/lib/
├── gh.cjs                                    ← MODIFY (populate PRODUCT_ROADMAP_FIELDS; finalize updateProjectFields)
├── gh.test.cjs                               ← MODIFY (append describe('integration — devflow-claude#9 chain'))
└── __fixtures__/gh-cassettes/
    ├── devflow-claude-9-walk.json            ← CREATE (captured live; GraphQL response for walk)
    └── product-roadmap-fields.json           ← CREATE (captured live; gh project field-list output)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

## Test list

Per CLAUDE.md TDD Playbook habit 2 — write the behavior-cases checklist before any test code.

**Group A — Frontmatter backfill (`describe('OBJECTIVE.md backfill — obj 0')`)**
- A1: After backfill, `extractFrontmatter(.planning/objectives/00-refine-defaults-table/OBJECTIVE.md)` returns object with `github_issue === 'AO-Cyber-Systems/devflow-claude#20'`.
- A2: Same: `parent_issue === 'AO-Cyber-Systems/devflow-claude#9'`.
- A3: Existing fields (if any in pre-existing OBJECTIVE.md) are preserved. NOTE: obj 0 currently has NO OBJECTIVE.md (verified via `ls .planning/objectives/00-refine-defaults-table/` returns no OBJECTIVE.md). This task CREATES the file.

**Group B — Cassette format (`describe('cassettes — shape')`)**
- B1: `devflow-claude-9-walk.json` parses as valid JSON.
- B2: It contains the path `data.repository.issue.title` matching `/^\[Roadmap\]/`.
- B3: It contains `data.repository.issue.projectItems.nodes[0].project.id === 'PVT_kwDODwqLrc4BRsOP'`.
- B4: `product-roadmap-fields.json` parses as valid JSON.
- B5: It contains entries for fields named `Status`, `Product`, `Quarter` with `id` (field ID) and `options[]` (option IDs).

**Group C — Replay-mode integration test (`describe('integration — replay mode')`)** *(runs in default `npm test`; no env vars)*
- C1: With `_setRunGh` injected to return cassette responses keyed by GraphQL query pattern, `resolveChain({ github_issue: 'AO-Cyber-Systems/devflow-claude#20', parent_issue: 'AO-Cyber-Systems/devflow-claude#9' }, { github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' })` returns `result.roadmap_issue === 'AO-Cyber-Systems/devflow-claude#9'`, `result.milestone.product === 'DevFlow'`, `result.milestone.title === 'Product Roadmap'`.
- C2: `result.provenance.roadmap_issue === 'walked_from_parent'` (proven via the cassette walk).
- C3: Same call from a fresh process gives same result (cassette is deterministic).
- C4: When OBJECTIVE.md is read via `cmdGhResolve` against a tmp project containing `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md` (with the backfilled frontmatter) AND `.planning/PROJECT.md` (with `github_repo`), the JSON output matches the resolveChain result from C1.

**Group D — `updateProjectFields` populated (`describe('updateProjectFields — populated constant')`)**
- D1: `PRODUCT_ROADMAP_FIELDS._captured === true`.
- D2: `PRODUCT_ROADMAP_FIELDS.Status.field_id` is a non-empty string starting with `PVTSSF_` (Project v2 Single Select Field ID prefix).
- D3: `PRODUCT_ROADMAP_FIELDS.Status.options['In Progress']` is a non-empty string (option ID).
- D4: `updateProjectFields(issueRef, projectId, { Status: 'In Progress' })` (mocked _runGh) sends a `gh api graphql` mutation with the captured field+option IDs in the variables. Asserted via mock-call inspection.
- D5: Unknown field name (`{ NotAField: 'x' }`) is skipped with a warning, not throws.
- D6: Unknown option name (`{ Status: 'NotAnOption' }`) is skipped with a warning, not throws.

**Group E — Live-mode integration test (`describe('integration — live mode (GH_INTEGRATION=1)')`)** *(only runs when GH_INTEGRATION=1 in env)*
- E1: When env unset, all E tests are SKIPPED via `t.skip(...)`.
- E2: When env=1, `gh.requireGhAuth(['project', 'read:project', 'repo'])` returns silently against real gh (or fails with remediation if scopes missing — pause-able).
- E3: When env=1, `gh.resolveChain({ github_issue: 'AO-Cyber-Systems/devflow-claude#20', parent_issue: 'AO-Cyber-Systems/devflow-claude#9' }, { github_repo: 'AO-Cyber-Systems/devflow-claude', org_project: 'PVT_kwDODwqLrc4BRsOP' })` returns the SAME shape as the replay-mode test (C1), confirming cassette is current.
- E4 cassette drift: E3 captures the live response and DIFFS it against the saved cassette. If drift detected, the test FAILS with a clear message: "cassette drift detected — re-record `devflow-claude-9-walk.json` from current gh response shape." Don't auto-overwrite; surface the drift to the developer.
- E5: Sync round-trip: `gh.syncObjective('00-refine-defaults-table', projectRoot)` against live gh. Returns `result.ok === true`. Inspect the GH issue (manually or via subsequent `gh api` read in test) — body has been rewritten, sticky comment is present.
- E6: Idempotency on live: run `syncObjective` TWICE in same test. Assert `result.comment_action === 'created'` first run, `result.comment_action === 'edited'` second run. NO duplicate sticky comments left on the issue.

The 24 enumerated cases above cover the dogfood smoke (A1–A3), cassette structure (B1–B5), replay-mode integration (C1–C4) — the bulk of CI value, the constant population (D1–D6), and live-mode validation (E1–E6) — gated to avoid CI auth requirements.

## RED → GREEN → REFACTOR plan

Two atomic commits (refactor unlikely):

1. `test(01-06): add failing integration tests + cassette schema assertions` — Append Groups A–E test cases to `gh.test.cjs`. Tests are RED because (a) OBJECTIVE.md doesn't exist yet, (b) cassettes don't exist yet, (c) PRODUCT_ROADMAP_FIELDS isn't captured yet.

2. `feat(01-06): backfill obj 0 OBJECTIVE.md, capture cassettes, populate PRODUCT_ROADMAP_FIELDS, finalize updateProjectFields` — Capture live data + create files + populate constants. Includes:
   - Create `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md` with backfilled frontmatter
   - Run live `gh api graphql` for the walk → save response to `__fixtures__/gh-cassettes/devflow-claude-9-walk.json`
   - Run live `gh project field-list 3 --owner AO-Cyber-Systems --format json` → save to `__fixtures__/gh-cassettes/product-roadmap-fields.json`
   - Update `PRODUCT_ROADMAP_FIELDS` constant in gh.cjs from the field-list cassette
   - Finalize `updateProjectFields` with mutation logic using captured IDs
   - All 24 RED tests now GREEN

<embedded_context>

<codebase_examples>
**Cassette capture commands** (run live during execution):

```bash
# Capture devflow-claude#9 walk
gh api graphql -f query='
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        title
        projectItems(first: 5) {
          nodes {
            project { id title }
            fieldValues(first: 10) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2SingleSelectField { id name } }
                }
                ... on ProjectV2ItemFieldTextValue {
                  text
                  field { ... on ProjectV2Field { id name } }
                }
              }
            }
          }
        }
      }
    }
  }
' -F owner=AO-Cyber-Systems -F name=devflow-claude -F number=9 \
  > plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json

# Capture Product Roadmap fields
gh project field-list 3 --owner AO-Cyber-Systems --format json \
  > plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json
```

**Cassette JSON structure (expected)**:

`devflow-claude-9-walk.json`:
```json
{
  "data": {
    "repository": {
      "issue": {
        "title": "[Roadmap] DevFlow Claude — Coordination Layer",
        "projectItems": {
          "nodes": [
            {
              "project": { "id": "PVT_kwDODwqLrc4BRsOP", "title": "Product Roadmap" },
              "fieldValues": {
                "nodes": [
                  { "name": "In Progress", "field": { "id": "PVTSSF_xxx", "name": "Status" } },
                  { "name": "DevFlow", "field": { "id": "PVTSSF_yyy", "name": "Product" } },
                  { "name": "Q2 2026", "field": { "id": "PVTSSF_zzz", "name": "Quarter" } }
                ]
              }
            }
          ]
        }
      }
    }
  }
}
```

`product-roadmap-fields.json`:
```json
{
  "fields": [
    { "id": "PVTSSF_xxx", "name": "Status", "type": "ProjectV2SingleSelectField",
      "options": [
        { "id": "abc123", "name": "Todo" },
        { "id": "def456", "name": "In Progress" },
        { "id": "ghi789", "name": "Done" }
      ]
    },
    { "id": "PVTSSF_yyy", "name": "Product", "type": "ProjectV2SingleSelectField",
      "options": [...]
    },
    { "id": "PVTSSF_zzz", "name": "Quarter", "type": "ProjectV2SingleSelectField",
      "options": [...]
    }
  ]
}
```

**Constant population pattern** (from cassette):

```javascript
// In gh.cjs, replace the stub PRODUCT_ROADMAP_FIELDS:
const fieldListCassette = JSON.parse(fs.readFileSync(
  path.join(__dirname, '__fixtures__/gh-cassettes/product-roadmap-fields.json'), 'utf-8'
));
const PRODUCT_ROADMAP_FIELDS = (() => {
  const out = { _captured: true, _project_id: 'PVT_kwDODwqLrc4BRsOP' };
  for (const f of fieldListCassette.fields) {
    if (!['Status', 'Product', 'Quarter'].includes(f.name)) continue;
    const options = {};
    for (const o of (f.options || [])) {
      options[o.name] = o.id;
    }
    out[f.name] = { field_id: f.id, options };
  }
  return out;
})();
```

This loads the cassette at module-load time (sync, once). The constant is then a flat lookup.

**`updateProjectFields` finalized**:

```javascript
function updateProjectFields(issueRef, projectId, fields = {}) {
  if (!projectId) return { ok: false, error: 'no projectId; cannot update fields', fields_updated: [] };
  if (!PRODUCT_ROADMAP_FIELDS._captured) {
    return { ok: false, error: 'Project field IDs not captured', fields_updated: [], warnings: [] };
  }
  // First ensure issue is in project (idempotent — adds if not member, errors if already)
  const addR = addToProject(issueRef, projectId);
  if (!addR.ok && !/already_exists|item_already_exists/i.test(addR.error || '')) {
    return { ok: false, error: `addToProject failed: ${addR.error}`, fields_updated: [] };
  }
  const itemId = addR.item_id;  // present even on "already exists" responses with proper handling

  const updated = [];
  const warnings = [];
  const errors = [];
  for (const [fieldName, fieldValue] of Object.entries(fields)) {
    const fieldDef = PRODUCT_ROADMAP_FIELDS[fieldName];
    if (!fieldDef) {
      warnings.push(`unknown field: ${fieldName}`);
      continue;
    }
    const optionId = fieldDef.options[fieldValue];
    if (!optionId) {
      warnings.push(`unknown option for ${fieldName}: ${fieldValue}`);
      continue;
    }
    const mutation = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) { projectV2Item { id } }
    }`;
    const r = _runGh(['api', 'graphql', '-f', `query=${mutation}`,
      '-F', `projectId=${projectId}`, '-F', `itemId=${itemId}`,
      '-F', `fieldId=${fieldDef.field_id}`, '-F', `optionId=${optionId}`,
    ]);
    if (r.ok) updated.push(fieldName);
    else errors.push({ field: fieldName, error: r.stderr });
  }
  return { ok: errors.length === 0, fields_updated: updated, errors, warnings };
}
```
</codebase_examples>

<anti_patterns>
- **Do NOT regenerate cassettes on each test run.** Cassettes are committed artifacts; tests load them via `fs.readFileSync`. Live re-capture only when `GH_INTEGRATION=1` is set AND the test explicitly compares against the cassette (E4 drift detection).
- **Do NOT generate cassettes from imagined gh responses.** Per `no_llm_test_data` constraint. Cassettes MUST be captured from real gh CLI output. The capture command in codebase_examples runs once during execution and pipes real output to disk.
- **Do NOT skip cassette capture if gh auth is missing.** Hard-fail per SC-8: if executor doesn't have `project, read:project, repo` scopes, the live capture step fails with remediation. The TRD pauses until user fixes auth, then resumes.
- **Do NOT auto-overwrite a cassette in live mode.** E4 detects drift and FAILS with a message. Re-capture is a manual decision — committed cassettes are stable artifacts; drift means the gh API shape changed and the parser may need updating.
- **Do NOT add `OBJECTIVE.md` content beyond the locked frontmatter shape.** The body of obj 0's OBJECTIVE.md should be minimal (1-2 sentences pointing to CONTEXT.md). Don't duplicate context.
- **Do NOT commit captured tokens or PII in cassettes.** GraphQL responses include data like commenter usernames. The Product Roadmap is org-internal but already shared — usernames in field values (e.g., assignees) should be reviewed before commit. The walk for #9 doesn't return assignee data; safe by default.
- **Do NOT couple the live-mode test to a specific gh CLI version.** Use the gh CLI invocations from codebase_examples — they're stable across recent versions. Print `gh --version` if a test fails, to capture environment info.
- **Do NOT skip the dogfood test (SC-10).** The whole point of obj 1 is to ship a working coordination layer — the proof is that THIS repo's own state walks cleanly through the resolver. If the live test can't run (auth issue), pause; don't mark the TRD complete.
</anti_patterns>

<error_recovery>
- If `gh api graphql` returns errors at capture time: most common is "Resource not accessible by integration" → token lacks `read:project` scope. Run `gh auth refresh -h github.com -s project,read:project` and retry.
- If the captured cassette has surprising shape (e.g., `projectItems.nodes` is `null` or missing): the issue might not be in any project. Check via `gh issue view 9 --repo AO-Cyber-Systems/devflow-claude --json projectItems`. If empty, the dogfood test premise is wrong — devflow-claude#9 needs to be added to Product Roadmap project. The live capture step would surface this.
- If `gh project field-list 3 --owner AO-Cyber-Systems` fails with "project not found": the org slug or project number is wrong. Verify via `gh project list --owner AO-Cyber-Systems --format json`. The Product Roadmap project number might have changed; update the cassette command and the `_project_id` constant.
- If E4 fails with cassette drift: re-run the capture commands manually, save to the cassette path, commit. The diff between old and new cassette tells you what gh's response shape changed. If parser updates are needed (resolveChain code changes), that's a separate fix — file a follow-up ticket; don't try to fix in this TRD.
- If A1/A2 tests fail because OBJECTIVE.md doesn't pick up the backfill: confirm the file is at `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md` (with leading zero in `00`). This repo uses leading-zero-padded objective IDs. Check via `ls .planning/objectives/`.
- If syncObjective in E5 fails with "objective has no github_issue": the OBJECTIVE.md backfill from Task 1 didn't propagate. Re-read the file; the backfill should be in place before E5 runs.
- If syncObjective creates a duplicate sticky comment in E6: the `state_comment_id` from `.planning/.gh-mapping.json` isn't being persisted between calls. In the live test, the test must read the mapping file between calls AND ensure `writeMappingV2` is being called by `syncObjective`. The bug, if present, was introduced in TRD 01-04 — fix there and back-port; or add a test in TRD 01-04 (out of scope here, surface as concern).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/01-github-coordination-layer/01-CONTEXT.md
@.planning/objectives/01-github-coordination-layer/01-RESEARCH.md
@.planning/objectives/00-refine-defaults-table/00-CONTEXT.md
@.planning/objectives/01-github-coordination-layer/01-04-gh-sync-skill-and-cli-SUMMARY.md
@.planning/objectives/01-github-coordination-layer/01-05-pm-backend-seam-SUMMARY.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/gh.test.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
</context>

<gotchas>
- **`gh api graphql` flag types:** The capture command uses `-F` for typed fields (number=9 → integer) and `-f` for string fields. If you pass `-f number=9` (string), GraphQL rejects with "expected Int, got String." Use `-F number=9`.
- **Project number vs Project ID**: The Product Roadmap project's NUMBER is `3` (used in `gh project field-list 3 --owner AO-Cyber-Systems`). Its ID is `PVT_kwDODwqLrc4BRsOP` (used in GraphQL mutations). Don't conflate. The cassette uses ID; the field-list CLI uses number.
- **Cassette stability**: The captured `devflow-claude-9-walk.json` includes `projectItems.nodes[0].project.id` which is the Project's GLOBAL node ID. As long as Product Roadmap project isn't deleted+recreated, this ID is stable. Field IDs (`PVTSSF_xxx`) are also stable per project. Option IDs (`abc123`) can change if option labels are renamed (but typically don't for a stable Status field).
- **Idempotent `addToProject`**: When an issue is already in a project, `addProjectV2ItemById` returns `errors: [{ message: 'item_already_exists' }]`. The `updateProjectFields` code in codebase_examples treats this as success. Verify the actual error message format from a live capture if test E4 fails on first sync.
- **TRD's required `OBJECTIVE.md` for obj 0 vs `CONTEXT.md`**: obj 0 currently has `00-CONTEXT.md` (the locked-decisions doc) but NO `OBJECTIVE.md` (the standard frontmatter doc). This TRD CREATES `OBJECTIVE.md`; do not delete `00-CONTEXT.md`. Both can coexist — they serve different purposes (CONTEXT is plan-time decisions; OBJECTIVE is frontmatter-machine-readable).
- **STATE.md Session Continuity**: After this TRD completes, STATE.md should be updated to reflect "Objective 1 done." That's the standard SUMMARY-and-STATE-update flow handled by execute-trd, not this TRD's responsibility. Just ship the SUMMARY.md.
- **Don't re-capture cassettes after the initial commit.** Cassettes are stable. Only the E4 drift-detection test re-captures and diffs in `GH_INTEGRATION=1` mode — and even then, it only WARNS on drift; it doesn't auto-overwrite. Manual update flow: developer sees drift, runs the capture commands, replaces the cassette, commits.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add failing integration tests + cassette schema assertions (RED)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.test.cjs</files>
  <action>
Append Groups A–E test cases (24 total) to `gh.test.cjs`. Tests are RED because:
- Group A: OBJECTIVE.md doesn't exist yet
- Group B: cassettes don't exist yet
- Group C: depends on cassettes
- Group D: PRODUCT_ROADMAP_FIELDS not yet populated
- Group E: live-mode tests are guarded behind `GH_INTEGRATION=1` (skip in default `npm test`)

Sample skeleton:

```javascript
// === Group A: OBJECTIVE.md backfill ===

const OBJ0_PATH = path.join(__dirname, '..', '..', '..', '..', '..', '.planning', 'objectives', '00-refine-defaults-table', 'OBJECTIVE.md');
// (path is RELATIVE TO gh.test.cjs's location: plugins/devflow/devflow/bin/lib/. Up 5 levels to repo root, then .planning/...)

test('OBJECTIVE.md backfill — obj 0 has github_issue + parent_issue frontmatter', () => {
  assert.ok(fs.existsSync(OBJ0_PATH), 'OBJECTIVE.md must exist for obj 0');
  const fm = require('./frontmatter.cjs').extractFrontmatter(fs.readFileSync(OBJ0_PATH, 'utf-8'));
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
  assert.strictEqual(fm.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
});

// === Group B: cassettes ===

const CASSETTE_DIR = path.join(__dirname, '__fixtures__', 'gh-cassettes');

test('cassette devflow-claude-9-walk.json — valid JSON', () => {
  const p = path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json');
  assert.ok(fs.existsSync(p));
  const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
  assert.match(c.data.repository.issue.title, /^\[Roadmap\]/);
  assert.strictEqual(c.data.repository.issue.projectItems.nodes[0].project.id, 'PVT_kwDODwqLrc4BRsOP');
});

test('cassette product-roadmap-fields.json — has Status/Product/Quarter fields', () => {
  const p = path.join(CASSETTE_DIR, 'product-roadmap-fields.json');
  assert.ok(fs.existsSync(p));
  const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const names = new Set(c.fields.map(f => f.name));
  assert.ok(names.has('Status'));
  assert.ok(names.has('Product'));
  assert.ok(names.has('Quarter'));
});

// === Group C: replay-mode integration ===

test('integration replay — resolveChain devflow-claude#20 walks to #9 with milestone fields', () => {
  const cassette = JSON.parse(fs.readFileSync(path.join(CASSETTE_DIR, 'devflow-claude-9-walk.json'), 'utf-8'));
  const responses = new Map([
    ['api graphql', { ok: true, status: 0, stdout: JSON.stringify(cassette), stderr: '' }],
    ['issue list', fx.buildGhResponse_issueListRoadmap({ hits: [] })],
  ]);
  const mock = fx.buildMockRunGh(responses);
  gh._setRunGh(mock);
  gh._resetCache();

  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#20',
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    }),
    fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    })
  );
  assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/devflow-claude#9');
  assert.strictEqual(r.provenance.roadmap_issue, 'walked_from_parent');
  assert.ok(r.milestone, 'milestone should populate');
  assert.strictEqual(r.milestone.product, 'DevFlow');
});

// === Group D: PRODUCT_ROADMAP_FIELDS populated ===

test('PRODUCT_ROADMAP_FIELDS — _captured is true', () => {
  const constants = require('./gh.cjs').PRODUCT_ROADMAP_FIELDS || {};
  // If gh.cjs doesn't export PRODUCT_ROADMAP_FIELDS yet, this fails RED.
  assert.strictEqual(constants._captured, true);
});

test('PRODUCT_ROADMAP_FIELDS — Status field has options for In Progress', () => {
  const constants = require('./gh.cjs').PRODUCT_ROADMAP_FIELDS || {};
  assert.ok(constants.Status, 'Status field must be present');
  assert.match(constants.Status.field_id, /^PVTSSF_/);
  assert.ok(constants.Status.options['In Progress'], 'In Progress option must be present');
});

// === Group E: live-mode (gated) ===

const LIVE = process.env.GH_INTEGRATION === '1';

test('integration live — resolveChain matches replay shape', { skip: !LIVE }, () => {
  // Don't mock _runGh; use real gh
  gh._setRunGh(null);
  gh._resetCache();
  const r = gh.resolveChain(
    fx.buildFrontmatter({
      github_issue: 'AO-Cyber-Systems/devflow-claude#20',
      parent_issue: 'AO-Cyber-Systems/devflow-claude#9',
    }),
    fx.buildProjectCtx({
      github_repo: 'AO-Cyber-Systems/devflow-claude',
      org_project: 'PVT_kwDODwqLrc4BRsOP',
    })
  );
  assert.strictEqual(r.roadmap_issue, 'AO-Cyber-Systems/devflow-claude#9');
  assert.strictEqual(r.milestone.product, 'DevFlow');
});

test('integration live — sync round-trip is idempotent', { skip: !LIVE }, () => {
  gh._setRunGh(null);
  const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const r1 = gh.syncObjective('00-refine-defaults-table', root);
  assert.ok(r1.ok, `first sync failed: ${r1.error}`);
  const r2 = gh.syncObjective('00-refine-defaults-table', root);
  assert.ok(r2.ok, `second sync failed: ${r2.error}`);
  // First run may create or edit (depending on whether sticky already exists from prior runs);
  // second run MUST be edit (idempotent contract).
  assert.notStrictEqual(r2.comment_action, 'created', 'second sync must edit existing comment, not create new');
});
```

Confirm RED via `npm test`. The 24 new tests should be RED in default mode (E tests skip silently).

Commit: `git commit -m 'test(01-06): add failing integration tests + cassette schema assertions for dogfood + live round-trip'`

# CRITICAL: The path math for OBJ0_PATH and `root` is finicky — `__dirname` from gh.test.cjs is `plugins/devflow/devflow/bin/lib/`. From there, repo root is `../../../../..` (5 ups). Verify with `console.log(path.resolve(__dirname, '..', '..', '..', '..', '..'))` once during execution.
# CRITICAL: Use `{ skip: !LIVE }` test option (third arg to `test()` in node:test) — this is the canonical skip mechanism. Don't use `if (!LIVE) return;` inside the test body (counts as a passing test, masks intent).
# PATTERN: All 24 cases follow the bare `test()` form. No `describe()` blocks (the codebase doesn't use them; matches intent.test.cjs style).
  </action>
  <verify>
- `npm test 2>&1 | grep -E '(integration|cassette|PRODUCT_ROADMAP_FIELDS)' | wc -l` shows 24+ test names referencing new test cases.
- `npm test 2>&1 | tail -10` shows new tests RED. E tests skipped (or run if GH_INTEGRATION=1).
- `git log --oneline -1` shows `test(01-06): ...`
  </verify>
  <done>RED: 24 new tests added. All failing in default mode (or skipped for E group). Existing tests unaffected. Commit completed.</done>
  <recovery>
If tests for OBJ0_PATH path fail with "ENOENT" because the path math is off: print `__dirname` and walk up to find the actual repo root. The verification command in this TRD's frontmatter (`test -f .planning/objectives/00-refine-defaults-table/OBJECTIVE.md`) uses the repo-root-relative path; use the same in tests for consistency.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Backfill obj 0 OBJECTIVE.md, capture cassettes, populate PRODUCT_ROADMAP_FIELDS, finalize updateProjectFields (GREEN)</name>
  <files>.planning/objectives/00-refine-defaults-table/OBJECTIVE.md, plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json, plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json, plugins/devflow/devflow/bin/lib/gh.cjs</files>
  <action>
**Step 2.1 — Verify gh auth has required scopes** before live capture:

```bash
gh auth status 2>&1 | grep -E "Token scopes" | head -1
```

Expected: includes `'project'` and `'read:project'`. If missing, halt and emit GhAuthError-style message: `gh auth refresh -h github.com -s project,read:project`. (The TRD's tasks already use `requireGhAuth` indirectly via the syncObjective live test, but cassette capture happens BEFORE running tests, so verify pre-flight.)

**Step 2.2 — Create `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md`** with backfilled frontmatter:

```markdown
---
work: refactor
github_issue: AO-Cyber-Systems/devflow-claude#20
parent_issue: AO-Cyber-Systems/devflow-claude#9
org_project: PVT_kwDODwqLrc4BRsOP
---

# Refine (kind, work) defaults table from codebase evidence

See `.planning/objectives/00-refine-defaults-table/00-CONTEXT.md` for locked decisions.

This file's frontmatter declares the GitHub coordination links: this objective tracks `devflow-claude#20`, parent `devflow-claude#9` ([Roadmap]), in the org Product Roadmap project.
```

The body is intentionally minimal — CONTEXT.md is the source of truth for plan-time decisions. The OBJECTIVE.md is the frontmatter-machine-readable companion.

**Step 2.3 — Capture cassette `devflow-claude-9-walk.json`** by running the GraphQL query from codebase_examples and saving to disk:

```bash
mkdir -p plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes
gh api graphql -f query='
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        title
        projectItems(first: 5) {
          nodes {
            project { id title }
            fieldValues(first: 10) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2SingleSelectField { id name } }
                }
                ... on ProjectV2ItemFieldTextValue {
                  text
                  field { ... on ProjectV2Field { id name } }
                }
              }
            }
          }
        }
      }
    }
  }
' -F owner=AO-Cyber-Systems -F name=devflow-claude -F number=9 \
  > plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json
```

Verify the captured JSON has the expected shape (Group B tests). If `projectItems.nodes` is empty (devflow-claude#9 not yet in Product Roadmap), pause and surface to user — the dogfood requires the issue to be in the project.

**Step 2.4 — Capture cassette `product-roadmap-fields.json`**:

```bash
gh project field-list 3 --owner AO-Cyber-Systems --format json \
  > plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json
```

Verify the JSON has `fields` array with entries named Status, Product, Quarter. If `gh project field-list` requires a specific scope flag, the command may need updating — check `gh project field-list --help` for the current syntax.

**Step 2.5 — Update `gh.cjs`** to populate `PRODUCT_ROADMAP_FIELDS` from the cassette and finalize `updateProjectFields`:

Replace the stub block:

```javascript
const PRODUCT_ROADMAP_FIELDS = { _captured: false };
```

With the cassette-loading block (per codebase_examples):

```javascript
const PRODUCT_ROADMAP_FIELDS = (() => {
  const cassettePath = path.join(__dirname, '__fixtures__', 'gh-cassettes', 'product-roadmap-fields.json');
  if (!fs.existsSync(cassettePath)) {
    return { _captured: false };
  }
  let cassette;
  try {
    cassette = JSON.parse(fs.readFileSync(cassettePath, 'utf-8'));
  } catch {
    return { _captured: false };
  }
  const out = { _captured: true, _project_id: 'PVT_kwDODwqLrc4BRsOP' };
  for (const f of (cassette.fields || [])) {
    if (!['Status', 'Product', 'Quarter'].includes(f.name)) continue;
    const options = {};
    for (const o of (f.options || [])) {
      options[o.name] = o.id;
    }
    out[f.name] = { field_id: f.id, options };
  }
  return out;
})();
```

Replace the stub `updateProjectFields` body with the full implementation from codebase_examples (the version using `_runGh` + the captured constants).

Add `PRODUCT_ROADMAP_FIELDS` to module.exports so the test file can read it.

**Step 2.6 — Run `npm test`**. All 24 RED tests should now be GREEN. Live tests still skip unless `GH_INTEGRATION=1`.

If `GH_INTEGRATION=1` is set during execution, run live tests too: `GH_INTEGRATION=1 npm test`. Group E tests should pass; if they fail with cassette drift (E4), capture the new responses and re-commit the cassettes.

Commit: `git add -A && git commit -m 'feat(01-06): backfill obj 0 OBJECTIVE.md, capture cassettes, populate PRODUCT_ROADMAP_FIELDS, finalize updateProjectFields'`

# CRITICAL: The cassettes are committed artifacts. They live with source code in __fixtures__. Don't .gitignore them.
# CRITICAL: Verify the cassette format BEFORE updating gh.cjs's constant block — if the captured JSON shape is unexpected (e.g., gh CLI version returns differently nested data), update the parser in PRODUCT_ROADMAP_FIELDS to match. Don't munge the cassette to fit a wrong parser.
# CRITICAL: If GH_INTEGRATION=1 isn't set during executor run (autopilot), DON'T BLOCK on capturing live cassettes. Capture works without env var (it's pre-test setup, not a gated test). Only the live-mode TESTS skip without the env var. The CASSETTE CAPTURE (Steps 2.3, 2.4) is mandatory; it requires `gh` auth at execution time.
# PATTERN: addToProject's "already_exists" handling needs to extract the existing item_id from the error response (the API returns the existing item ID in some error formats). Test against live behavior in E5/E6.
# GOTCHA: If updateProjectFields is called with `Quarter: 'Q2 2026'` but Q2 2026 was renamed to "2026 Q2" in the actual project, the lookup fails and warns. Run `gh project field-list 3 --owner AO-Cyber-Systems --format json | jq '.fields[] | select(.name == "Quarter") | .options'` to inspect actual option names; align test fixtures with reality.
  </action>
  <verify>
- `test -f .planning/objectives/00-refine-defaults-table/OBJECTIVE.md` exits 0.
- `grep -q 'github_issue' .planning/objectives/00-refine-defaults-table/OBJECTIVE.md` exits 0.
- `test -f plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json` exits 0.
- `test -f plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json` exits 0.
- Both cassette files: `node -e 'JSON.parse(require("fs").readFileSync("plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json"))'` exits 0 (valid JSON).
- `npm test` passes — 24 new tests GREEN; existing tests unchanged.
- Smoke: `node plugins/devflow/devflow/bin/df-tools.cjs gh resolve 00-refine-defaults-table 2>&1 | head -20` returns chain leading to devflow-claude#9 (against live gh; or with cassette injection if not auth'd).
- If GH_INTEGRATION=1 was used: `GH_INTEGRATION=1 npm test 2>&1 | grep -E 'integration live'` shows passes.
- `git log --oneline -2` shows `feat(01-06): ...` then `test(01-06): ...`.
  </verify>
  <done>GREEN: All 24 new tests pass (E group skips without env var). OBJECTIVE.md backfilled. Cassettes captured + committed. PRODUCT_ROADMAP_FIELDS._captured=true. updateProjectFields fully wired. Live integration validated (if GH_INTEGRATION=1 was set during execution). Two atomic commits.</done>
  <recovery>
If gh auth refresh is needed mid-task: pause execution. Surface the `gh auth refresh -h github.com -s project,read:project` command to the user via stderr. After user runs it and confirms, retry the capture commands. (cmdGhResolve and friends already throw GhAuthError with the right remediation; the executor can handle it.)

If devflow-claude#9 has been deleted or moved: the capture fails. The dogfood premise is broken. Pause + surface to user. Recovery path: re-create devflow-claude#9 with `[Roadmap]` title, add to Product Roadmap project, retry. (Out of TRD scope to auto-create.)

If the cassette captures successfully but the parser in gh.cjs's PRODUCT_ROADMAP_FIELDS extracts no fields (out.Status undefined): the cassette JSON shape doesn't match the parser's expected shape. Print the actual cassette content and align the parser. The most common shape variation: `gh project field-list` may return fields under a top-level `fields:` key vs. directly as an array. Check `jq 'keys' < cassette.json` first.

If E5 (live syncObjective) fails: read the error message. Common causes: (a) PRODUCT_ROADMAP_FIELDS not populated (re-do Step 2.5), (b) issue body has illegal characters that gh issue edit rejects (escape backticks/newlines properly — `gh issue edit --body-file` may be needed for complex bodies; this is a fix in TRD 01-04's syncObjective, surface as concern not in-TRD fix), (c) auth scopes insufficient (refresh).

If E6 (idempotency on live) fails because second run also creates: the .gh-mapping.json isn't being persisted between calls within the same test. Check that syncObjective's writeMappingV2 call is reached (no early return). If the test runs in a tmp dir, the mapping persists for the test's duration but not after — that's fine; the second call within the same test should still see the in-test mapping. If not, the test setup is wrong.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
Before declaring TRD complete:
- [ ] `npm test` passes — 24 new tests GREEN (E group skipped without GH_INTEGRATION=1)
- [ ] `GH_INTEGRATION=1 npm test` passes (run once during execution if auth available; not required for default `npm test`)
- [ ] Two atomic commits: `test(01-06): ...` then `feat(01-06): ...`
- [ ] `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md` exists with `github_issue` + `parent_issue` frontmatter
- [ ] Both cassette files exist and parse as valid JSON
- [ ] `PRODUCT_ROADMAP_FIELDS._captured === true` after gh.cjs reload
- [ ] `df-tools gh resolve 00-refine-defaults-table` returns the chain in mocked OR live mode
- [ ] All 6 verification_commands in this TRD's frontmatter exit 0 (the GH_INTEGRATION-gated one prints "skipped" message when env unset; that's acceptable)
</verification>

<success_criteria>
- Obj 0's OBJECTIVE.md has frontmatter declaring github_issue and parent_issue (dogfood data ready)
- Cassettes capture real gh responses for the chain walk + Project field-list (replay tests run in CI/local without auth)
- updateProjectFields fully wired with captured field IDs (Status, Product, Quarter mutations work end-to-end)
- Replay-mode integration test runs in default `npm test` and proves the chain walks correctly
- Live-mode integration test (GH_INTEGRATION=1) validates against real gh and detects cassette drift
- df-tools gh resolve and gh sync round-trip cleanly against this repo's own state — the dogfood smoke test
- SC-9 (round-trip integration test) and SC-10 (resolver+sync validated against THIS repo's state) addressed
</success_criteria>

<output>
After completion, create `.planning/objectives/01-github-coordination-layer/01-06-dogfood-and-integration-SUMMARY.md`.

Also: update `.planning/STATE.md` to reflect "Objective 1 complete" — TRD 01-06 is the final TRD of the objective, so the SUMMARY for this TRD AND a STATE.md update are both expected. The STATE update is part of execute-objective's standard flow.
</output>

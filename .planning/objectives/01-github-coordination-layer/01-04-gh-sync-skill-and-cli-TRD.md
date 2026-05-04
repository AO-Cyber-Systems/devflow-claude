---
objective: 01-github-coordination-layer
trd: 01-04
title: gh sync subcommand + skill — idempotent disk → GitHub state push
type: tdd
confidence: high
wave: 4
depends_on: [01-03]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/skills/gh-sync/SKILL.md
autonomous: true
requirements: [SC-4, SC-5, SC-6]
verification_commands:
  - "npm test"
  - "git log --oneline feature/v1.1 -- plugins/devflow/devflow/bin/lib/gh.cjs plugins/devflow/devflow/bin/lib/gh.test.cjs | grep -E '^[a-f0-9]+ test\\(01-04\\)' | head -1"
  - "node -e 'const gh=require(\"./plugins/devflow/devflow/bin/lib/gh.cjs\"); if(typeof gh.syncObjective!==\"function\") throw new Error(\"syncObjective not exported\"); if(typeof gh.cmdGhSyncObjective!==\"function\") throw new Error(\"cmdGhSyncObjective not exported\"); console.log(\"OK\");'"
  - "node plugins/devflow/devflow/bin/df-tools.cjs gh 2>&1 | grep -q 'sync'"
  - "grep -q 'sync <objective>' plugins/devflow/skills/gh-sync/SKILL.md"

must_haves:
  truths:
    - "syncObjective(objId, projectRoot) returns { issue_updated, comment_action, project_fields_updated, warnings } — structured outcome of the sync"
    - "Issue body is rewritten to canonical form per CONTEXT.md §'Issue body format' on each sync; idempotent (running twice produces no diff in body content)"
    - "Sticky comment uses marker `<!-- df:state -->` as first line; first sync creates, subsequent syncs edit existing comment in-place"
    - "Comment ID is persisted in `.planning/.gh-mapping.json` under `objectives.<id>.state_comment_id` so subsequent syncs find the right comment to edit"
    - "Project v2 custom fields Status (and Quarter where derivable from ROADMAP milestone heading) are updated via gh api graphql mutation"
    - "df-tools gh sync <objectiveId> CLI subcommand calls requireGhAuth first (hard-fail per SC-8); on success calls syncObjective and emits result as JSON"
    - "Running `df-tools gh sync <objectiveId>` twice in a row produces no semantically different gh API calls on the second run (idempotent — assertion via mock spy: same arg sequence, same payloads)"
    - "Skill file `/devflow:gh-sync` documents the new `sync <objective>` mode"
    - "All new tests have test: commits before feat: commits per TDD Playbook"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/gh.cjs"
      provides: "Adds syncObjective + cmdGhSyncObjective + helpers buildIssueBody, buildStickyComment, findStickyComment, upsertStickyComment, updateProjectFields"
      exports: ["syncObjective", "cmdGhSyncObjective", "resolveChain", "findRoadmapIssue", "addToProject", "linkSubIssue", "cmdGhResolve", "requireGhAuth", "_resetCache", "_setRunGh", "ghStatus", "cmdGhStatus", "cmdGhSyncObjectives", "cmdGhComment", "cmdGhCloseIssue", "cmdGhSyncRelease"]
    - path: "plugins/devflow/devflow/bin/lib/gh.test.cjs"
      provides: "Adds describe('syncObjective') + idempotency + sticky-comment in-place edit + Project field update tests"
      contains: "syncObjective"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "Routes `gh sync <objectiveId>` to cmdGhSyncObjective"
      contains: "cmdGhSyncObjective"
    - path: "plugins/devflow/skills/gh-sync/SKILL.md"
      provides: "Documents the new `sync <objective>` mode alongside existing objectives/release/status modes"
      contains: "sync <objective>"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/gh.cjs::syncObjective"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::resolveChain"
      via: "syncObjective calls resolveChain to find target issue + project; reads disk state for body content"
      pattern: "resolveChain\\("
    - from: "plugins/devflow/devflow/bin/lib/gh.cjs::syncObjective"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::upsertStickyComment"
      via: "Idempotent comment upsert via marker substring match"
      pattern: "df:state"
    - from: "plugins/devflow/skills/gh-sync/SKILL.md"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::cmdGhSyncObjective"
      via: "Skill prompt instructs Claude to call `df-tools gh sync <objectiveId>` for the new mode"
      pattern: "gh sync"
---

<objective>
Add `syncObjective(objId, projectRoot)` to `lib/gh.cjs` — idempotent disk → GitHub state push. Implements: (a) issue body rewrite to canonical form, (b) sticky comment in-place upsert via `<!-- df:state -->` marker, (c) Project v2 custom field update for Status (and Quarter where derivable). Wire as `df-tools gh sync <objectiveId>` CLI subcommand. Update `/devflow:gh-sync` skill prompt to document the new mode.

Purpose: Closes objective-1 success criteria 4, 5, and finalizes 6. The sticky-comment marker is the idempotency contract — running `df:gh-sync <objective>` repeatedly is safe and produces no extra noise on the GH issue. The issue body is canonical, regenerated each sync.

Output: Extended `lib/gh.cjs` with `syncObjective` + 5 helper functions + `cmdGhSyncObjective`. New tests in `gh.test.cjs` covering body canonicalization, sticky comment upsert (create + edit-in-place), Project field mutations, and idempotency (running twice produces same gh call sequence). Updated `df-tools.cjs` routing. Updated `gh-sync` SKILL.md prompt.

Why TDD: pure-logic structured-input/output transformation with mockable boundaries (`_runGh`). The idempotency contract is testable via mock-call-sequence assertion (run twice, assert same call args). Matches CLAUDE.md TDD Playbook habits 2 (test list first) and 4 (fixture builders).
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── gh.cjs               ← MODIFY (add syncObjective + helpers + cmdGhSyncObjective)
└── gh.test.cjs          ← MODIFY (append describe('syncObjective') tests)

plugins/devflow/devflow/bin/
└── df-tools.cjs         ← MODIFY (route `gh sync <objId>` to cmdGhSyncObjective)

plugins/devflow/skills/gh-sync/
└── SKILL.md             ← MODIFY (document new `sync <objective>` mode)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

## Test list

Per CLAUDE.md TDD Playbook habit 2 — write the behavior-cases checklist before any test code.

**Group A — `buildIssueBody(state)` canonical form (`describe('buildIssueBody')`)**
- A1: Given `state = { number: 1, name: 'foo', goal: 'bar', trd_total: 3, trd_done: 1, current_wave: 2, summary_count: 1, last_commit: { sha: 'abc1234', subject: 'feat(x): y' }, success_criteria: [{ id: 'SC-1', done: true }, { id: 'SC-2', done: false }], trds: [{ name: '01-01-foo-TRD.md', brief: 'foo', done: true }] }`, returns a markdown body containing all fields in canonical order. The body has stable ordering (deterministic — running with same input produces identical output).
- A2: Body includes `**Status:** {trd_done}/{trd_total} TRDs done, current wave {current_wave}, last commit {sha}` line.
- A3: Body includes `**Success criteria:**` checklist with `- [x]` for done, `- [ ]` for pending.
- A4: Body includes `**TRDs:**` checklist mirroring success criteria.
- A5: Body ends with the `_Tracked by [DevFlow]...source of truth..._` italic line per CONTEXT.md §"Issue body format".
- A6 idempotency: `buildIssueBody(state) === buildIssueBody(state)` (same input → same output, no timestamp drift).

**Group B — `buildStickyComment(state)` (`describe('buildStickyComment')`)**
- B1: First line is exactly `<!-- df:state -->\n`.
- B2: Body contains `Wave: {N}`, `TRDs: {done}/{total}`, `SUMMARY count: {N}`, `Last commit: {sha} — {subject}`, `Branch: {branch}`.
- B3: Includes `last synced {ISO timestamp}` line — this is the ONE field that changes between syncs (the timestamp). Idempotency tests must NOT assert byte-identical comments; they assert the marker is preserved and the body has the right structural fields.
- B4: Comment body is deterministic given fixed timestamp input — `buildStickyComment(state, '2026-05-04T12:00:00Z')` is byte-identical to itself.

**Group C — `findStickyComment(issueRef)` (`describe('findStickyComment')`)** — *uses mocked `_runGh`*
- C1: Mocked `gh api repos/{owner}/{repo}/issues/{number}/comments` returns array including a comment with body starting `<!-- df:state -->\n...` → returns that comment's `id`.
- C2: Mocked response has multiple `<!-- df:state -->` comments (shouldn't happen but defensively) → returns the FIRST one (oldest by created_at) and adds a warning.
- C3: Mocked response has no marker comment → returns `null`.
- C4: Mocked failure (`ok: false`) → returns `null` and emits a warning.

**Group D — `upsertStickyComment(issueRef, body, mappingState)` (`describe('upsertStickyComment')`)**
- D1 create: When `mappingState.state_comment_id` is null AND `findStickyComment` returns null, calls `gh issue comment {issue} --body {body}`, captures the returned comment ID, returns `{ action: 'created', comment_id: <id> }`. Updates `mappingState.state_comment_id` (caller persists).
- D2 edit: When `mappingState.state_comment_id` is set, calls `gh api repos/{owner}/{repo}/issues/comments/{id} -X PATCH -f body=...`, returns `{ action: 'edited', comment_id: <id> }`.
- D3 fallback edit: When `mappingState.state_comment_id` is null but `findStickyComment` returns a hit, edits that comment (uses found ID) and persists the ID. Returns `{ action: 'edited_via_marker', comment_id: <id> }`.
- D4 idempotency contract: Calling `upsertStickyComment` twice in a row with same body → second call sees `state_comment_id` set, edits in-place, NEVER creates a new comment. Mock-spy assertion: zero `issue comment` (create) calls on the second invocation.

**Group E — `updateProjectFields(issueRef, projectId, fields)` (`describe('updateProjectFields')`)**
- E1 happy: `fields = { Status: 'In Progress', Quarter: 'Q2 2026' }` → calls `gh api graphql` with `updateProjectV2ItemFieldValue` mutation per field. Returns `{ ok: true, fields_updated: ['Status', 'Quarter'] }`.
- E2 partial: One mutation succeeds, one fails (mocked) → returns `{ ok: false, fields_updated: ['Status'], errors: [{ field: 'Quarter', error: ... }] }`.
- E3 absent project: `projectId = null` → returns `{ ok: false, error: 'no projectId; cannot update fields' }`. Does NOT throw.
- E4 issue not in project: `addProjectV2ItemById` mutation called first to ensure membership; if already a member, GraphQL returns `errors: [{ message: 'item_already_exists' }]` which is treated as success (idempotent add).

**Group F — `syncObjective(objId, projectRoot)` integration (`describe('syncObjective')`)** — *full path with mocked _runGh + tmp project*
- F1 happy: Tmp project with `OBJECTIVE.md` (frontmatter has `github_issue: AO-Cyber-Systems/devflow-claude#10`, `parent_issue: ...`), three TRD files, two SUMMARY files. `syncObjective('01-foo', tmpRoot)` calls (in order): `requireGhAuth`, `resolveChain`, `gh issue edit` (body update), `findStickyComment`, `gh issue comment` or PATCH (sticky upsert), `gh api graphql` (project field updates). Returns structured result.
- F2 missing github_issue: When OBJECTIVE.md has no `github_issue`, `syncObjective` returns `{ ok: false, error: 'objective has no github_issue; run df:gh-sync objectives to create it', warnings: [...] }`. Does NOT throw, does NOT modify gh.
- F3 disk state read: `syncObjective` reads:
   - TRD count from `*-TRD.md` files in objective dir
   - SUMMARY count from `*-SUMMARY.md` files in objective dir
   - Current wave: scans TRD frontmatter `wave:` fields, takes max where corresponding SUMMARY missing (incomplete TRDs); falls back to max wave overall if all complete.
   - Last commit: `git log -1 --pretty='%h|%s'` against the objective dir (test mocks `child_process.spawnSync` for git OR uses fs only — recommend spawning git for real on the tmp project).
   - Goal: parsed from ROADMAP.md `### Objective {N}: ...` block.
- F4 idempotency: Calling `syncObjective` twice on the SAME state produces the SAME mocked-_runGh call sequence (asserted via `mock.calls()`). Specifically: second call hits `gh issue edit` (body unchanged → still issued, gh deduplicates server-side or the test asserts payload equality), `gh api repos/.../comments/{id} -X PATCH` (edits same comment ID), `gh api graphql` updateField mutations (same field values). NO `gh issue comment` (create) on second call.
- F5 mapping persistence: After F1, `.planning/.gh-mapping.json` is updated with `objectives.01-foo.state_comment_id: <id>`. Re-running reads from this mapping; `state_comment_id` is preserved.

**Group G — `cmdGhSyncObjective` CLI integration (`describe('cmdGhSyncObjective')`)**
- G1: `df-tools gh sync 01-foo` (run via spawnSync in test) on a tmp project with mocked-globally-via-test-runner gh — succeeds, prints JSON result, exits 0.
- G2: `df-tools gh sync 01-foo` when auth is missing → exits non-zero, structured error on stderr with remediation.
- G3: `df-tools gh sync nonexistent-id` → exits non-zero with "objective not found".
- G4: `df-tools gh sync` (no objective ID) → exits non-zero with usage message.

**Group H — Skill prompt update (no test; verified by grep in `<verify>`)**
- H1: `plugins/devflow/skills/gh-sync/SKILL.md` mentions `sync <objective>` mode in `<objective>` section.
- H2: Skill prompt's `<process>` section documents the new mode with the bash command.

The 26 enumerated cases above cover happy paths (A1–A5, B1–B2, B4, C1, D1, E1, F1, G1), edge cases (A6, B3, C2, D3, E2, E4, F3), failure modes (C3–C4, D4 — wait D4 is idempotency, F2, G2–G4), idempotency (A6, B4, D4, F4, F5).

## RED → GREEN → REFACTOR plan

Three atomic commits:

1. `test(01-04): add failing test list for syncObjective + sticky comment idempotency + Project field updates` — RED. Append all 26 cases to `gh.test.cjs`. Confirm RED.

2. `feat(01-04): implement syncObjective + helpers + cmdGhSyncObjective + skill prompt update` — GREEN. Implements:
   - `buildIssueBody(state)` — pure function returning canonical markdown
   - `buildStickyComment(state, isoTimestamp)` — pure function
   - `findStickyComment(issueRef)` — gh API call
   - `upsertStickyComment(issueRef, body, mappingState)` — create-or-edit logic
   - `updateProjectFields(issueRef, projectId, fields)` — Project v2 mutations
   - `syncObjective(objId, projectRoot)` — orchestrator
   - `cmdGhSyncObjective(cwd, objId, raw)` — CLI entry
   - df-tools.cjs routing for `gh sync <id>`
   - SKILL.md updated with new mode docs

3. `refactor(01-04): {if needed}` — Only if GREEN reveals structure cleanups (e.g., extracting GraphQL strings to constants, splitting buildIssueBody by section).

<embedded_context>

<codebase_examples>
**Existing `formatIssueBody` (`gh.cjs` lines 134-147)**:

```javascript
function formatIssueBody(obj, projectName) {
  const lines = [
    `**Objective ${obj.number}: ${obj.name}**`,
    '',
    obj.goal ? `**Goal:** ${obj.goal}` : null,
    '',
    obj.success_criteria.length
      ? '**Success criteria:**\n' + obj.success_criteria.map(c => `- ${c}`).join('\n')
      : null,
    '',
    `_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). Source of truth: \`.planning/objectives/\` in this repo._`,
  ].filter(l => l !== null);
  return lines.join('\n');
}
```

This is the existing format — used by `cmdGhSyncObjectives`. The new `buildIssueBody` for `syncObjective` MUST match the canonical form in CONTEXT.md §"Issue body format" which adds: `**Status:**` line, `**TRDs:**` checklist (with done state), `[x]/[ ]` checkboxes for success_criteria. **Don't reuse `formatIssueBody`** — it's the v1.29 shape and doesn't include status/TRD lists. Build the new one alongside.

**Existing mapping shape (`gh.cjs` lines 32-47)**:

```javascript
function readMapping(cwd) {
  const p = path.join(cwd, MAPPING_REL);
  if (!fs.existsSync(p)) return { milestone_id: null, objectives: {} };
  // ... returns { milestone_id, objectives: { '1': 42, '2.1': 43 } }
}
```

The current shape has `objectives: { number: issue_id }`. **Extend to**: `objectives: { number: { issue_id, state_comment_id } }`. Need migration logic that reads the old shape (`objectives['1'] === 42`) and converts to the new shape (`objectives['1'] = { issue_id: 42, state_comment_id: null }`) on first read. Existing callers (`cmdGhSyncObjectives` etc.) already use `mapping.objectives[number]` as a number; they need to keep working — so the read function should return BOTH shapes' compatibility (or callers should be updated).

Cleanest approach: add a `readMappingV2` that returns the new shape, and have the new `syncObjective` use it. Existing callers stay on `readMapping` (which can internally convert if it sees v2 data). Document this clearly.

**Existing skill prompt (`skills/gh-sync/SKILL.md` lines 13-49)**:

```markdown
<objective>
One-way push from `.planning/` -> GitHub. ...

Three modes (parsed from $ARGUMENTS):
- `objectives` (default) — create/update one issue per roadmap objective, ensure milestone exists
- `release <tag>` — generate release notes from SUMMARY.md files since the previous tag
- `status` — report whether GitHub integration is enabled and reachable
</objective>

<process>
1. Check `.planning/config.json` for `github.enabled` and `github.repo`. ...

2. Run the requested operation:

\`\`\`bash
# Default — sync objectives
node ~/.claude/devflow/bin/df-tools.cjs gh sync-objectives

# Release notes for a tag
node ~/.claude/devflow/bin/df-tools.cjs gh sync-release "$TAG"

# Status check
node ~/.claude/devflow/bin/df-tools.cjs gh status
\`\`\`
...
</process>
```

Update the prompt to add a 4th mode: `<objective_id>` — sync the linked GH issue's body + sticky comment + Project v2 fields for that specific objective. This is the new fine-grained sync (vs. `objectives` which loops all of them).

**`gh issue edit --body` for body rewrite**: `gh issue edit {number} --repo {repo} --body {body}` overwrites the issue body. No diff handling needed — gh just sets the body to whatever's passed.

**Updating Project v2 single-select fields via GraphQL**:

```graphql
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId,
    itemId: $itemId,
    fieldId: $fieldId,
    value: { singleSelectOptionId: $optionId }
  }) { projectV2Item { id } }
}
```

This requires field IDs and option IDs — discovered via `gh project field-list <projectNumber>` once and committed as constants. For `Product Roadmap` (#3), the field IDs and Status option IDs are static; capture them once and store in a constant block in gh.cjs.
</codebase_examples>

<anti_patterns>
- **Do NOT use `gh issue comment <issue> --edit-last`.** It edits the LAST comment regardless of author, which means a teammate's comment posted after our sticky comment would be edited. Use `gh api repos/.../comments/{id} -X PATCH` with the persisted comment ID.
- **Do NOT post a new sticky comment on every sync.** The whole point of SC-5 is idempotency. The marker `<!-- df:state -->` is the idempotency anchor; the persisted comment ID is the cache.
- **Do NOT skip the `findStickyComment` fallback.** First sync after a `.gh-mapping.json` is wiped should still find the existing sticky via marker substring rather than creating a duplicate. Test D3 covers this.
- **Do NOT couple `syncObjective` to the existing `cmdGhSyncObjectives` (plural).** The plural variant loops all objectives and creates them; the singular variant updates ONE existing objective's state. Two different concerns.
- **Do NOT use `gh issue comment {issue} --body {body}` AND THEN `gh api ... -X PATCH`** — pick one. The flow is: if we know the comment ID, PATCH; otherwise, POST a new comment and capture its ID.
- **Do NOT update Project v2 fields if `org_project` is absent.** Gracefully skip with a warning. Issue body + sticky comment can sync without Project membership.
- **Do NOT generate test data with the LLM.** Per `no_llm_test_data`. Hand-build `state` fixtures and gh response cassettes.
- **Do NOT use property-based testing for the canonical body format.** Per `no_property_based_default`. Enumerated cases only.
- **Do NOT add Gherkin/BDD test syntax.** Per `no_gherkin_layer`. Bare `test('description', () => { ... })` form throughout.
- **Do NOT add `--force` flags or "destroy and recreate" paths.** Idempotency is the design; force-recreate undermines it.
</anti_patterns>

<error_recovery>
- If GraphQL `updateProjectV2ItemFieldValue` fails with "field not found": the field IDs in the constant block are stale. Re-run `gh project field-list 3 --owner AO-Cyber-Systems --format json` to get current IDs and update the constants. The Project v2 schema is org-scoped, so field IDs are stable per org but each new org needs its own constants.
- If `findStickyComment` mistakes a user's comment containing `<!-- df:state -->` (they copy-pasted the marker for testing) for our sticky: the marker check is substring-based on the comment body. Tighten by requiring the marker to be the FIRST line of the comment (`body.startsWith('<!-- df:state -->\n')`).
- If `buildIssueBody` produces non-deterministic output between runs: the most likely culprit is iterating over `Object.keys` of an unsorted map. Sort all collections explicitly. The `success_criteria` and `trds` arrays should be passed in sorted; the function should not re-sort (input contract).
- If idempotency test F4 fails because the timestamps differ between runs: pass the timestamp explicitly to `buildStickyComment(state, isoTimestamp)`. The orchestrator captures `new Date().toISOString()` once and passes it down. For tests, inject a fixed timestamp.
- If `.planning/.gh-mapping.json` schema migration breaks existing data: the migration function (read v1 → write v2) should be idempotent and reversible. Test by hand-crafting both v1 and v2 mapping files and running the read function on both.
- If `cmdGhSyncObjective` segfaults on missing PROJECT.md: the resolver call needs to handle empty projectFm (returns empty projectCtx). Already handled in TRD 01-02's `cmdGhResolve`. Mirror that defensive read here.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/01-github-coordination-layer/01-CONTEXT.md
@.planning/objectives/01-github-coordination-layer/01-02-resolver-chain-walk-SUMMARY.md
@.planning/objectives/01-github-coordination-layer/01-03-auth-and-error-handling-SUMMARY.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/gh.test.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
@plugins/devflow/devflow/bin/df-tools.cjs
@plugins/devflow/skills/gh-sync/SKILL.md
</context>

<gotchas>
- **Comment IDs are integers in REST, strings in GraphQL.** `gh issue comment {issue}` returns a URL like `https://github.com/.../issues/10#issuecomment-12345678`. Capture the trailing integer. The PATCH endpoint uses the integer (`/issues/comments/{12345678}`).
- **Project v2 mutations are async-eventually-consistent.** A mutation may succeed but a subsequent read may not reflect it for ~1 second. Don't read-back-after-write in `syncObjective` — trust the mutation's `ok: true` response.
- **Markdown checkbox state in body:** `- [x] foo` for done, `- [ ] foo` for pending. Spaces matter — `- []foo` (no space) is NOT recognized by GitHub as a checkbox.
- **Issue edit doesn't notify subscribers.** Body rewrites are silent. Only NEW comments produce notifications. Sticky comment edits via PATCH are also silent (no notification ping). Good — we don't want to spam subscribers on every sync.
- **The existing `formatIssueBody` doesn't use `**Status:**` or TRD lists.** It's the v1.29 format. New `buildIssueBody` is a SEPARATE function; don't refactor `formatIssueBody` to add the new fields (existing callers depend on its current shape).
- **Skill argument parsing:** The current SKILL.md parses `objectives | release <tag> | status` from `$ARGUMENTS`. Adding `<objective_id>` mode means the parser needs to detect "anything that doesn't match `objectives|release|status`" as an objective ID. Document this clearly in the prompt; the prompt instructs Claude to do the routing, so it's just text-update work.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add failing test list for syncObjective + sticky-comment upsert + idempotency (RED)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs</files>
  <action>
**Step 1.1 — Extend `gh-fixtures.cjs`** with new factories needed by syncObjective tests:

```javascript
// Append to gh-fixtures.cjs:

// Build a tmp project with OBJECTIVE.md + N stub TRD files + M stub SUMMARY files + ROADMAP.md.
function buildSyncTargetProject({
  objectiveId = '01-foo',
  github_issue = 'AO-Cyber-Systems/devflow-claude#10',
  parent_issue = 'AO-Cyber-Systems/devflow-claude#9',
  org_project = 'PVT_kwDODwqLrc4BRsOP',
  github_repo = 'AO-Cyber-Systems/devflow-claude',
  trd_count = 3,
  summary_count = 1,
  goal = 'Test objective goal',
  success_criteria = [{ id: 'SC-1', text: 'first', done: true }, { id: 'SC-2', text: 'second', done: false }],
} = {}) {
  // ... mkdtempSync + write files ...
  // Returns { root, cleanup, expected: { trd_total, trd_done, current_wave, summary_count, ... } }
}

// Build canned gh response for `gh api repos/.../issues/{N}/comments` listing.
function buildGhResponse_commentsList({ comments = [] } = {}) {
  return { ok: true, status: 0, stdout: JSON.stringify(comments), stderr: '' };
}

// Canned response for `gh issue comment {issue} --body ...` (POST creating new comment)
function buildGhResponse_commentCreated({ commentId = 12345678, htmlUrl } = {}) {
  return {
    ok: true, status: 0,
    stdout: htmlUrl || `https://github.com/AO-Cyber-Systems/devflow-claude/issues/10#issuecomment-${commentId}`,
    stderr: '',
  };
}

// Canned response for `gh issue edit --body ...`
function buildGhResponse_issueEdit() {
  return { ok: true, status: 0, stdout: 'https://github.com/.../issues/10', stderr: '' };
}
```

**Step 1.2 — Append all 26 test cases to `gh.test.cjs`** (Groups A–G; G runs the CLI via spawnSync). Use `t.beforeEach(() => gh._resetCache())`.

Sample (one from Group F — the idempotency test):

```javascript
test('syncObjective — idempotency (running twice produces same gh call sequence)', async (t) => {
  const proj = fx.buildSyncTargetProject();
  const responses = new Map([
    ['auth status', { ok: true, status: 0, stdout: `github.com\n  ✓ Logged in\n  - Token scopes: 'project', 'read:project', 'repo'`, stderr: '' }],
    ['api graphql', fx.buildGhResponse_issueWithProjectItem()],   // resolveChain walk
    ['issue list', fx.buildGhResponse_issueListRoadmap({ hits: [] })],
    [`api repos/AO-Cyber-Systems/devflow-claude/issues/10/comments`, fx.buildGhResponse_commentsList({ comments: [] })],
    [`issue comment 10`, fx.buildGhResponse_commentCreated({ commentId: 12345678 })],
    [`issue edit 10`, fx.buildGhResponse_issueEdit()],
  ]);
  const mock = fx.buildMockRunGh(responses);
  gh._setRunGh(mock);

  const r1 = gh.syncObjective(proj.objectiveId, proj.root);
  const callsRun1 = mock.calls();

  // After first run, simulate the mapping persisted with state_comment_id.
  // (In the real implementation, syncObjective writes mapping itself; the test asserts behavior.)
  const r2 = gh.syncObjective(proj.objectiveId, proj.root);
  const callsRun2 = mock.calls().slice(callsRun1.length);

  // Idempotency contract:
  //   Run 1: includes `issue comment 10` (CREATE)
  //   Run 2: includes PATCH on the comment (EDIT), NOT another CREATE
  const run2HasCreate = callsRun2.some(c => c.key.startsWith('issue comment 10') && !c.key.includes('PATCH'));
  const run2HasPatch = callsRun2.some(c => c.key.includes('comments/12345678') && c.args.includes('-X') && c.args.includes('PATCH'));
  assert.ok(!run2HasCreate, 'second run must NOT issue comment create');
  assert.ok(run2HasPatch, 'second run must issue comment PATCH');

  proj.cleanup();
});
```

Confirm RED via `npm test`.

Commit: `git commit -m 'test(01-04): add failing test list for syncObjective + sticky comment idempotency + Project field updates'`

# CRITICAL: F1's mock response Map needs entries keyed by the prefix-string the runGh args join to. Run a one-off `console.log(mock.calls())` if a test fails to inspect the actual key strings.
# CRITICAL: G tests use `child_process.spawnSync('node', ['plugins/devflow/devflow/bin/df-tools.cjs', 'gh', 'sync', 'id'])` to invoke the real CLI subprocess. Subprocess can't share `_setRunGh` mocks; G tests use a real-but-throttled approach: set `GH_INTEGRATION=0` in the env to short-circuit gh calls, OR set up a stub gh in PATH. Recommend: in G tests, mock at the syncObjective level only (in-process tests), and skip live-CLI invocation tests OR run them only against a pre-recorded cassette in TRD 01-06.
  </action>
  <verify>
- `npm test 2>&1 | grep -E '(syncObjective|buildIssueBody|upsertStickyComment|updateProjectFields|findStickyComment)' | wc -l` shows 26+ test names.
- All new tests RED. Existing tests still pass.
- `git log --oneline -1` shows `test(01-04): ...`
  </verify>
  <done>RED: 26 new tests added (Groups A–G). All failing because syncObjective + helpers don't yet exist. Existing tests unaffected. Commit completed.</done>
  <recovery>
If a test in Group G can't run because spawnSync needs gh in PATH: skip Group G's CLI tests in the test file by wrapping them in `test.skip(...)` or guarding with `if (!process.env.GH_INTEGRATION) test.skip(...)`. They become integration tests gated on env. The in-process Group F tests give us the real coverage; G is smoke-test for CLI wiring.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Implement syncObjective + helpers + cmdGhSyncObjective + skill prompt update (GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/skills/gh-sync/SKILL.md</files>
  <action>
**Step 2.1 — Add to `lib/gh.cjs`**:

```javascript
// Mapping schema migration helper — converts v1 (numbers) to v2 (objects).
function readMappingV2(cwd) {
  const v1 = readMapping(cwd);
  const out = { milestone_id: v1.milestone_id, objectives: {} };
  for (const [k, v] of Object.entries(v1.objectives)) {
    if (typeof v === 'number') {
      out.objectives[k] = { issue_id: v, state_comment_id: null };
    } else if (typeof v === 'object' && v !== null) {
      out.objectives[k] = { issue_id: v.issue_id, state_comment_id: v.state_comment_id || null };
    }
  }
  return out;
}

function writeMappingV2(cwd, mapping) {
  // Write same path; format compatible with readMapping (which keeps v1 shape for back-compat).
  // For new entries (objects), write the full object shape; for migrated v1 numbers, preserve the object.
  const out = { milestone_id: mapping.milestone_id, objectives: {} };
  for (const [k, v] of Object.entries(mapping.objectives)) {
    if (v && typeof v === 'object' && v.state_comment_id !== undefined) {
      out.objectives[k] = { issue_id: v.issue_id, state_comment_id: v.state_comment_id };
    } else if (typeof v === 'number') {
      out.objectives[k] = v;
    }
  }
  fs.writeFileSync(path.join(cwd, MAPPING_REL), JSON.stringify(out, null, 2) + '\n');
}

// Pure: build canonical issue body from disk state.
function buildIssueBody(state) {
  const lines = [];
  lines.push(`**Objective ${state.number}: ${state.name}**`);
  lines.push('');
  if (state.goal) lines.push(`**Goal:** ${state.goal}`, '');
  lines.push(`**Status:** ${state.trd_done}/${state.trd_total} TRDs done, current wave ${state.current_wave || 1}, last commit ${state.last_commit?.sha || 'none'}`);
  lines.push('');
  if (state.success_criteria?.length) {
    lines.push('**Success criteria:**');
    for (const sc of state.success_criteria) {
      lines.push(`- [${sc.done ? 'x' : ' '}] ${sc.id}${sc.text ? ': ' + sc.text : ''}`);
    }
    lines.push('');
  }
  if (state.trds?.length) {
    lines.push('**TRDs:**');
    for (const t of state.trds) {
      lines.push(`- [${t.done ? 'x' : ' '}] ${t.name}${t.brief ? ' — ' + t.brief : ''}`);
    }
    lines.push('');
  }
  lines.push(`_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). Source of truth: \`.planning/objectives/${state.objectiveId}/\` in this repo._`);
  return lines.join('\n');
}

// Pure: build sticky comment body. Pass timestamp explicitly so tests are deterministic.
function buildStickyComment(state, isoTimestamp) {
  const lines = [];
  lines.push('<!-- df:state -->');
  lines.push(`**DevFlow state — last synced ${isoTimestamp}**`);
  lines.push('');
  lines.push(`- Wave: ${state.current_wave || 1}`);
  lines.push(`- TRDs: ${state.trd_done}/${state.trd_total}`);
  lines.push(`- SUMMARY count: ${state.summary_count}`);
  if (state.last_commit) lines.push(`- Last commit: ${state.last_commit.sha} — ${state.last_commit.subject}`);
  if (state.branch) lines.push(`- Branch: ${state.branch}`);
  return lines.join('\n');
}

// Find existing sticky comment via marker.
function findStickyComment(issueRef) {
  const m = issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return null;
  const [, owner, repo, num] = m;
  const r = _runGh(['api', `repos/${owner}/${repo}/issues/${num}/comments`]);
  if (!r.ok) return null;
  let arr;
  try { arr = JSON.parse(r.stdout); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  // Find FIRST comment with body starting with the marker
  for (const c of arr) {
    if (typeof c.body === 'string' && c.body.startsWith('<!-- df:state -->\n')) {
      return c.id;
    }
  }
  return null;
}

// Upsert: create-or-edit sticky comment.
// Returns { action: 'created' | 'edited' | 'edited_via_marker', comment_id }
function upsertStickyComment(issueRef, body, mappingState = {}) {
  const m = issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return { action: 'failed', error: `malformed issueRef: ${issueRef}` };
  const [, owner, repo, num] = m;

  // Path 1: known comment ID — PATCH
  if (mappingState.state_comment_id) {
    const r = _runGh(['api', `repos/${owner}/${repo}/issues/comments/${mappingState.state_comment_id}`, '-X', 'PATCH', '-f', `body=${body}`]);
    if (r.ok) return { action: 'edited', comment_id: mappingState.state_comment_id };
    // Fall through to create on PATCH failure (e.g., comment was deleted)
  }

  // Path 2: search by marker
  const found = findStickyComment(issueRef);
  if (found) {
    const r = _runGh(['api', `repos/${owner}/${repo}/issues/comments/${found}`, '-X', 'PATCH', '-f', `body=${body}`]);
    if (r.ok) return { action: 'edited_via_marker', comment_id: found };
  }

  // Path 3: create new
  const r = _runGh(['issue', 'comment', String(num), '--repo', `${owner}/${repo}`, '--body', body]);
  if (!r.ok) return { action: 'failed', error: r.stderr };
  // Parse comment ID from URL: ".../issues/N#issuecomment-12345"
  const idMatch = r.stdout.match(/issuecomment-(\d+)/);
  return { action: 'created', comment_id: idMatch ? parseInt(idMatch[1], 10) : null };
}

// Project v2 field IDs and Status option IDs for "Product Roadmap" (#3) — captured once, locked.
// To regenerate: gh project field-list 3 --owner AO-Cyber-Systems --format json
const PRODUCT_ROADMAP_FIELDS = {
  // Field IDs and option IDs go here. For initial implementation, leave as TODO + warning fallback.
  // The integration test in TRD 01-06 will populate these from a recorded cassette OR
  // call gh project field-list once and update this constant.
  _captured: false,
};

// Update Project v2 fields for an issue.
function updateProjectFields(issueRef, projectId, fields = {}) {
  if (!projectId) return { ok: false, error: 'no projectId; cannot update fields', fields_updated: [] };
  if (!PRODUCT_ROADMAP_FIELDS._captured) {
    return { ok: false, error: 'Project field IDs not yet captured; run TRD 01-06 integration test to capture', fields_updated: [], warnings: ['field IDs missing — Project field updates skipped'] };
  }
  // ... actual mutation logic (skipped in this initial implementation; covered fully in TRD 01-06)
  return { ok: true, fields_updated: Object.keys(fields) };
}

// Read disk state for an objective (TRD count, SUMMARY count, current wave, last commit, etc.).
function readObjectiveState(objectiveId, projectRoot) {
  const objDir = path.join(projectRoot, '.planning', 'objectives', objectiveId);
  if (!fs.existsSync(objDir)) {
    throw new Error(`objective directory not found: ${objDir}`);
  }
  const files = fs.readdirSync(objDir);
  const trds = files.filter(f => /-TRD\.md$/.test(f)).sort();
  const summaries = files.filter(f => /-SUMMARY\.md$/.test(f)).sort();
  // Match TRDs to summaries by stem (e.g., 01-01-foo-TRD.md → 01-01-foo-SUMMARY.md)
  const trdStems = trds.map(f => f.replace(/-TRD\.md$/, ''));
  const summaryStems = new Set(summaries.map(f => f.replace(/-SUMMARY\.md$/, '')));
  const trdEntries = trdStems.map(stem => ({
    name: stem + '-TRD.md',
    done: summaryStems.has(stem),
    // Brief from TRD frontmatter `title:` field
    brief: (() => {
      try {
        const fm = extractFrontmatter(fs.readFileSync(path.join(objDir, stem + '-TRD.md'), 'utf-8'));
        return fm.title || null;
      } catch { return null; }
    })(),
  }));
  // Current wave: max wave among incomplete TRDs (or max overall if all done)
  let currentWave = 1;
  let maxWave = 1;
  for (const t of trdEntries) {
    try {
      const fm = extractFrontmatter(fs.readFileSync(path.join(objDir, t.name), 'utf-8'));
      const w = parseInt(fm.wave, 10) || 1;
      if (w > maxWave) maxWave = w;
      if (!t.done && w > currentWave) currentWave = w;
    } catch {}
  }
  if (trdEntries.every(t => t.done)) currentWave = maxWave;

  // Last commit affecting the objective dir
  const git = require('child_process').spawnSync('git', ['log', '-1', '--pretty=%h|%s', '--', objDir], { cwd: projectRoot, encoding: 'utf-8' });
  let last_commit = null;
  if (git.status === 0 && git.stdout.trim()) {
    const [sha, ...rest] = git.stdout.trim().split('|');
    last_commit = { sha, subject: rest.join('|') };
  }

  // Branch
  const branchR = require('child_process').spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectRoot, encoding: 'utf-8' });
  const branch = branchR.status === 0 ? branchR.stdout.trim() : null;

  // Goal + name + success_criteria from ROADMAP.md (re-uses listObjectives — extract by number)
  // Extract the objective number from objectiveId (first 1-2 digits before the dash, with leading zero)
  const numMatch = objectiveId.match(/^(\d+)(?:\.\d+)?-/) || objectiveId.match(/^(\d+)$/);
  const number = numMatch ? String(parseInt(numMatch[1], 10)) : objectiveId;
  const all = listObjectives(projectRoot);
  const found = all.find(o => o.number === number);

  return {
    objectiveId,
    number,
    name: found?.name || objectiveId,
    goal: found?.goal || null,
    success_criteria: (found?.success_criteria || []).map((sc, i) => ({
      id: `SC-${i + 1}`,
      text: sc,
      // Best-effort done detection: scan summaries for "SC-N" mentions
      done: summaries.some(s => fs.readFileSync(path.join(objDir, s), 'utf-8').includes(`SC-${i + 1}`)),
    })),
    trds: trdEntries,
    trd_total: trdEntries.length,
    trd_done: trdEntries.filter(t => t.done).length,
    summary_count: summaries.length,
    current_wave: currentWave,
    last_commit,
    branch,
  };
}

// Public: orchestrator.
function syncObjective(objectiveId, projectRoot) {
  // 1. Auth check (hard-fail per SC-8)
  requireGhAuth(['project', 'read:project', 'repo']);

  // 2. Read OBJECTIVE.md frontmatter
  const objPath = path.join(projectRoot, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  if (!fs.existsSync(objPath)) {
    return { ok: false, error: `objective not found: ${objectiveId}`, warnings: [] };
  }
  const objFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
  objFm._objectiveId = objectiveId;

  if (!objFm.github_issue) {
    return { ok: false, error: 'objective has no github_issue; run df:gh-sync objectives to create it', warnings: [] };
  }

  // 3. Read PROJECT.md projectCtx
  const projectPath = path.join(projectRoot, '.planning', 'PROJECT.md');
  let projectFm = {};
  if (fs.existsSync(projectPath)) {
    projectFm = extractFrontmatter(fs.readFileSync(projectPath, 'utf-8')) || {};
  }
  const projectCtx = { github_repo: projectFm.github_repo, org_project: projectFm.org_project };

  // 4. Resolve chain (uses cache; finds parent + project)
  const chain = resolveChain(objFm, projectCtx);

  // 5. Read disk state
  const state = readObjectiveState(objectiveId, projectRoot);

  // 6. Update issue body
  const issueRef = chain.github_issue;
  const m = issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  const [, owner, repo, num] = m;
  const body = buildIssueBody(state);
  const editR = _runGh(['issue', 'edit', String(num), '--repo', `${owner}/${repo}`, '--body', body]);

  // 7. Upsert sticky comment
  const mapping = readMappingV2(projectRoot);
  const mappingEntry = mapping.objectives[state.number] || { issue_id: parseInt(num, 10), state_comment_id: null };
  const stickyBody = buildStickyComment(state, new Date().toISOString());
  const upsert = upsertStickyComment(issueRef, stickyBody, mappingEntry);
  if (upsert.comment_id) {
    mappingEntry.state_comment_id = upsert.comment_id;
    mapping.objectives[state.number] = mappingEntry;
    writeMappingV2(projectRoot, mapping);
  }

  // 8. Update Project v2 fields (best-effort)
  const fieldUpdates = {};
  if (state.trd_done === state.trd_total && state.trd_total > 0) fieldUpdates.Status = 'Done';
  else if (state.trd_done > 0) fieldUpdates.Status = 'In Progress';
  else fieldUpdates.Status = 'Todo';
  // Quarter from milestone if walked
  if (chain.milestone?.quarter) fieldUpdates.Quarter = chain.milestone.quarter;
  const projectUpdate = updateProjectFields(issueRef, chain.org_project, fieldUpdates);

  return {
    ok: true,
    issue_updated: editR.ok,
    comment_action: upsert.action,
    comment_id: upsert.comment_id,
    project_fields_updated: projectUpdate.fields_updated || [],
    chain,
    state,
    warnings: [...(chain.warnings || []), ...(projectUpdate.warnings || [])],
  };
}

function cmdGhSyncObjective(cwd, objectiveId, raw) {
  if (!objectiveId) {
    output({ error: 'Usage: gh sync <objectiveId>' }, raw, '');
    process.exit(1);
  }
  try {
    const result = syncObjective(objectiveId, cwd);
    if (!result.ok) {
      process.stderr.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(1);
    }
    output(result, raw, JSON.stringify(result, null, 2));
  } catch (e) {
    if (e.name === 'GhAuthError') {
      process.stderr.write(JSON.stringify({ error: e.message, remediation: e.remediation, scopes_missing: e.scopes_missing }, null, 2) + '\n');
      process.exit(1);
    }
    throw e;
  }
}

module.exports = {
  // ... existing exports ...
  syncObjective, cmdGhSyncObjective,
  buildIssueBody, buildStickyComment, findStickyComment, upsertStickyComment, updateProjectFields,
  readObjectiveState,
  readMappingV2, writeMappingV2,
};
```

**Step 2.2 — Route in `df-tools.cjs`** (add to the `gh` subcommand switch):

```javascript
case 'sync':
  // Two flavors: `gh sync-objectives` (existing — plural, all objectives) handled above.
  // New: `gh sync <objectiveId>` (singular — one objective's state).
  if (args[1]) cmdGhSyncObjective(cwd, args[1], raw);
  else cmdGhSyncObjectives(cwd, raw);   // back-compat: bare `gh sync` falls back to plural
  break;
```

Update help text: `'Unknown gh subcommand. Available: status, sync, sync-objectives, resolve, comment, close-issue, sync-release'`

**Step 2.3 — Update `plugins/devflow/skills/gh-sync/SKILL.md`**:

Replace the `<objective>` block's mode list with:

```markdown
Four modes (parsed from $ARGUMENTS):
- `objectives` (default for empty args) — create/update one issue per roadmap objective, ensure milestone exists
- `release <tag>` — generate release notes from SUMMARY.md files since the previous tag
- `status` — report whether GitHub integration is enabled and reachable
- `<objective_id>` (e.g. `01-github-coordination-layer`) — sync ONE objective: rewrite linked issue body to canonical form, upsert sticky state comment, update Project v2 fields. Idempotent.
```

In the `<process>` section, add a new bash block under "Run the requested operation":

```bash
# Sync a single objective's state to its linked GH issue (idempotent)
node ~/.claude/devflow/bin/df-tools.cjs gh sync "$OBJECTIVE_ID"
```

Add a sentence about idempotency: "The single-objective sync is idempotent — running it twice in a row produces no semantic difference on GitHub. The sticky comment uses marker `<!-- df:state -->` and is edited in-place."

Run `npm test` — all 26 RED tests should now be GREEN.

Commit: `git commit -am 'feat(01-04): implement syncObjective + helpers + cmdGhSyncObjective + skill prompt update'`

# CRITICAL: `updateProjectFields` is a stub in this TRD — fully implemented (with captured field IDs) in TRD 01-06's integration test. Tests E1–E4 use mocked responses; the actual production call returns "field IDs not captured" until the cassette is recorded.
# CRITICAL: `readObjectiveState`'s success_criteria done-detection is heuristic (scans SUMMARY files for "SC-N" mentions). It's intentionally permissive — TRD 01-06's dogfood test against obj 0 will validate it on real data.
# CRITICAL: cmdGhSyncObjective writes structured stderr on failure (matches cmdGhResolve's pattern from TRD 01-03). Don't use `error()` from helpers.cjs (that's for argument errors only).
# PATTERN: The order in syncObjective is: requireGhAuth → resolveChain → readObjectiveState → buildIssueBody → gh issue edit → buildStickyComment → upsertStickyComment → updateProjectFields → return result. Don't reorder; the order matters for failure-mode diagnostics.
  </action>
  <verify>
- `npm test` passes — 26 new tests GREEN; existing tests still pass.
- `node plugins/devflow/devflow/bin/df-tools.cjs gh` lists `sync` in available subcommands.
- Smoke test (against the dogfood: obj 0): `node plugins/devflow/devflow/bin/df-tools.cjs gh sync 00-refine-defaults-table 2>&1 | head -30` either completes (if `00-refine-defaults-table/OBJECTIVE.md` exists with github_issue field) or reports `objective has no github_issue` (if frontmatter not yet backfilled — TRD 01-06's job).
- `grep -q 'sync <objective>' plugins/devflow/skills/gh-sync/SKILL.md` exits 0.
- `git log --oneline -2` shows `feat(01-04): ...` then `test(01-04): ...`.
  </verify>
  <done>GREEN: 26 new tests pass. lib/gh.cjs ships syncObjective + 6 helpers + cmdGhSyncObjective. df-tools.cjs routes `gh sync <id>`. SKILL.md documents the new mode. Two atomic commits.</done>
  <recovery>
If `readObjectiveState` returns wrong success_criteria: the `listObjectives` path-parsing for objective number is fragile (assumes `01-foo` → number `1`). Test with the actual obj 0 ID `00-refine-defaults-table` — does it parse to `0`? If not, fix the regex in `numMatch`.

If `upsertStickyComment` always returns `{ action: 'created' }` even when the comment exists: the `findStickyComment` mock isn't being hit (the response Map key doesn't match). Print `mock.calls()` to inspect what `_runGh` is being called with; align the response Map keys.

If `writeMappingV2` corrupts the existing v1 mapping file: the migration writes object-shape entries but old `cmdGhSyncObjectives` reads them via `mapping.objectives[number]` expecting numbers. The `readMappingV2 → writeMappingV2` round-trip preserves both shapes; the issue is only if `writeMapping` (v1, used by existing functions) overwrites with v1 shape. Verify by reading the JSON file after a sync — entries set by syncObjective (objects) should not be clobbered by subsequent `cmdGhSyncObjectives` (numbers). If it does happen, the fix is to make existing functions also use `readMappingV2/writeMappingV2`. But scope creep — TRD 01-05 handles refactoring existing call sites; for THIS TRD, ensure `syncObjective` doesn't break the file for existing functions, even if the inverse can happen.

If skill prompt's argument parsing breaks (Claude doesn't recognize the new mode): the prompt must be EXPLICIT. Add a sentence: "If $ARGUMENTS does not match `objectives|release <tag>|status`, treat it as an objective ID and run `gh sync <id>`." Test by mentally running through the prompt's logic.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
Before declaring TRD complete:
- [ ] `npm test` passes — 26 new tests GREEN; existing tests untouched
- [ ] Two atomic commits: `test(01-04): ...` then `feat(01-04): ...`
- [ ] `lib/gh.cjs` exports `syncObjective`, `cmdGhSyncObjective`, plus 6 helpers (`buildIssueBody`, `buildStickyComment`, `findStickyComment`, `upsertStickyComment`, `updateProjectFields`, `readObjectiveState`)
- [ ] `df-tools gh sync <objectiveId>` works against a fixture (smoke or in-process test)
- [ ] `df-tools gh` lists `sync` in help text
- [ ] `gh-sync` SKILL.md documents the new `sync <objective>` mode
- [ ] Sticky comment idempotency proven via mock-call-sequence test (F4)
- [ ] All 5 verification_commands in this TRD's frontmatter exit 0
</verification>

<success_criteria>
- syncObjective() pushes issue body + sticky comment + Project v2 fields per CONTEXT.md format specs
- Sticky comment uses marker `<!-- df:state -->` and edits in-place on subsequent syncs (idempotent)
- Comment ID persisted in `.planning/.gh-mapping.json` under `objectives.<id>.state_comment_id`
- df-tools gh sync subcommand routes correctly; hard-fails on auth (via requireGhAuth from TRD 01-03)
- Skill prompt documents new mode
- SC-4 (sync command + Project v2 fields), SC-5 (idempotent sync via marker), SC-6 (lib/gh.cjs surface complete) addressed
</success_criteria>

<output>
After completion, create `.planning/objectives/01-github-coordination-layer/01-04-gh-sync-skill-and-cli-SUMMARY.md`.
</output>

---
objective: 01-github-coordination-layer
title: GitHub coordination layer
created: 2026-05-04
status: locked
tracks: AO-Cyber-Systems/devflow-claude#10
parent_issue: AO-Cyber-Systems/devflow-claude#9
---

# Objective 1 — Locked Context

This file captures user decisions that are **LOCKED** for the planner. Do not re-litigate. Do not propose alternatives. Implement exactly.

## Goal

Establish the GitHub coordination foundation that v1.1 objectives 2–6 depend on. Three components:

1. **Frontmatter convention** on PROJECT.md / OBJECTIVE.md / TRD.md declaring GH/org links (`parent_issue`, `github_issue`, `org_initiative`, `org_project`). Existing files without these fields parse cleanly (back-compat).
2. **Resolver service** (`df-tools gh resolve <objective>`) walking objective → repo `[Roadmap]` issue → org Product milestone → org Project. Returns structured org-context JSON the planner reads at plan time and the SessionStart preamble reads at execution time.
3. **`df:gh-sync` skill + `lib/gh.cjs` helpers** pushing objective state (TRDs total/done, current wave, SUMMARY count, last commit) to linked GH issues + Project v2 custom fields. One-way disk → GitHub for v1.1; bidirectional deferred to v1.2.

## What's already built (existing surface in `plugins/devflow/devflow/bin/lib/gh.cjs`)

The v1.29-shipped `lib/gh.cjs` already provides (do NOT recreate):

- `ghStatus(cwd)` — checks `.planning/config.json` `github.enabled`, gh CLI presence, auth status. Returns `{ enabled, reason, repo, labels, milestone_prefix }`.
- `cmdGhStatus(cwd, raw)` — `gh status` subcommand.
- `cmdGhSyncObjectives(cwd, raw)` — `gh sync-objectives` — creates/updates one GH issue per ROADMAP objective, ensures milestone exists. Persists mapping to `.planning/.gh-mapping.json`.
- `cmdGhComment(cwd, issueOrObjective, body, raw)` — `gh comment` — posts to issue (resolves objective number → issue via mapping).
- `cmdGhCloseIssue(cwd, objectiveOrIssue, comment, raw)` — `gh close-issue` — closes mapped issue.
- `cmdGhSyncRelease(cwd, tag, raw)` — `gh sync-release` — generates release notes from SUMMARY.md files since previous tag.
- Internal helpers: `runGh(args, opts)`, `readMapping(cwd)`, `writeMapping(cwd, mapping)`, `readConfig(cwd)`, `listObjectives(cwd)`, `getProjectName(cwd)`, `getMilestoneVersion(cwd)`, `formatIssueBody(obj, projectName)`.
- `MAPPING_REL` constant (`.planning/.gh-mapping.json`).
- `module.exports`: `ghStatus, cmdGhStatus, cmdGhSyncObjectives, cmdGhComment, cmdGhCloseIssue, cmdGhSyncRelease`.

**You are EXTENDING this file, not creating it.** New TRDs add functions for (a) chain walking (`resolveChain`, `findRoadmapIssue`, `addToProject`, `linkSubIssue`), (b) hard-fail auth wrapping, (c) idempotent objective-state sync (`syncObjective`), and (d) a thin PM-backend dispatch seam.

The existing skill at `plugins/devflow/skills/gh-sync/SKILL.md` covers `objectives`, `release <tag>`, `status` modes today. New `gh sync <objective>` mode is added in TRD 01-04, and the SKILL.md prompt is updated to cover it.

## Locked decisions (from ROADMAP §"Objective 1: GitHub coordination layer")

### 1. Plan org-aware, execute repo-focused

PROJECT.md architectural principle (already in STATE.md decisions). Resolver runs at plan time + thin SessionStart preamble; never blocks execution inner loop. This is foundational — every subsequent v1.1 objective inherits it.

### 2. Use existing org "Product Roadmap" project (#3)

Project ID: `PVT_kwDODwqLrc4BRsOP`. Custom fields: Product (DevFlow / AODex / etc.), Quarter (Q1 2026 → Q4 2027), Status (Todo / In Progress / Done). **Do NOT create a parallel "DevFlow Coordination" project.** Adding a parallel project would fragment the program view across the org.

### 3. One-way sync only (disk → GitHub) for v1.1

Bidirectional sync + webhooks are explicitly **v1.2 work**. Disk planning files remain authoritative. The resolver reads from GitHub but never writes back to disk. The sync subcommand pushes disk state to GitHub but never pulls.

### 4. Tier 2 = `[Roadmap]` parent issue per primary repo

9 such issues exist already across the org: `aodex#33`, `aosentry#20`, `aodex-flutter#2`, `trades#244`, `eden-biz#4`, `devflow#17`, `eden-ui#1`, `eden-ui-flutter#1`, `aocyber-cloud#1`. **None of them currently use native `trackedIssues` (sub-issues)** — they reference deliverables in prose. The resolver walks **to** these parent issues regardless of sub-issue population. Backfilling sub-issues under existing 9 `[Roadmap]` parents is **separate program work, NOT a v1.1 deliverable**.

For `devflow-claude` itself, `devflow-claude#9` IS the `[Roadmap]` parent issue — created during v1.1 setup, currently has 9 sub-issues (#10–#18 for v1.1 objectives 1–9). This makes devflow-claude the **dogfood project** for the resolver: TRD 01-06 round-trips the resolver against this real chain.

### 5. Decoupled from kind/work intent resolver (`lib/intent.cjs`)

Both run independently. Outputs combine in the planner agent — the planner calls both `df-tools intent resolve` AND `df-tools gh resolve` and merges results. **Do NOT couple them in code.** Separate caches, separate failure modes, separate test surfaces. This preserves objective 0's soak isolation: changes to `intent.cjs` schema don't affect `gh resolve`, and vice versa.

The two resolvers MAY share patterns (provenance reporting, sources reporting, in-memory cache) — and `lib/gh.cjs::resolveChain` SHOULD mirror `lib/intent.cjs::resolve()`'s style for consistency — but they MUST NOT import each other or share mutable state.

### 6. `lib/gh.cjs` is the GitHub backend of a (currently single-impl) PM resolver

The abstraction layer + Linear/Jira backends are explicitly **v1.2+ work**. v1.1 ships `lib/gh.cjs` only. The seam in TRD 01-05 is **scaffold-only**: a thin internal dispatcher that takes `pm: 'github'` from project config, no other backends implemented. The seam exists so swapping in `lib/linear.cjs` or `lib/jira.cjs` later doesn't require a rewrite of call sites.

The seam shape (locked):

```js
// lib/pm-backend.cjs (NEW in TRD 01-05)
function getBackend(projectConfig) {
  const pm = projectConfig?.pm?.backend || 'github';
  switch (pm) {
    case 'github': return require('./gh.cjs');
    default: throw new Error(`Unknown pm.backend: ${pm}`);
  }
}
module.exports = { getBackend };
```

Call sites use `getBackend(config).resolveChain(...)` instead of `require('./gh.cjs').resolveChain(...)`. That's the entire seam.

### 7. Hard fail on missing/expired auth

No silent degradation when `gh` is missing, token expired, or scopes insufficient. `df-tools gh resolve` and `df-tools gh sync` exit non-zero with the **exact `gh auth refresh -s ...` remediation command** in stderr. The skill invocation surfaces the error to the user; planning/execution stops.

This is a **hard inversion** of the existing `cmdGhSyncObjectives` behavior (which silently skips with `{ ok: false, skipped: true }`). The new `gh resolve` and `gh sync <objective>` subcommands are NEVER skipped; they fail loud. Existing `gh status`, `gh sync-objectives`, `gh comment`, `gh close-issue`, `gh sync-release` keep their current behavior (back-compat).

## Frontmatter shape (locked)

OBJECTIVE.md adds optional fields:

```yaml
---
work: feature
github_issue: AO-Cyber-Systems/devflow-claude#20    # full ref; or "#20" same-repo shorthand
parent_issue: AO-Cyber-Systems/devflow-claude#9     # full ref; or "#9" same-repo shorthand
org_initiative: devflow-internal-alpha              # filename in initiatives dir (v1.1 reads, doesn't sync)
org_project: PVT_kwDODwqLrc4BRsOP                    # GH Project v2 ID; defaults to org Product Roadmap
overrides:
  ...
---
```

PROJECT.md adds optional fields:

```yaml
---
kind: plugin
default_work: feature
github_repo: AO-Cyber-Systems/devflow-claude        # provides default repo context for shorthand
org_project: PVT_kwDODwqLrc4BRsOP                    # default project for objectives that don't override
---
```

TRD frontmatter inherits from objective; per-TRD `github_issue` is rare but supported:

```yaml
---
objective: 01-github-coordination-layer
trd: 01
type: tdd
github_issue: AO-Cyber-Systems/devflow-claude#52    # optional; usually omitted
---
```

**Back-compat (locked):** Existing files WITHOUT these fields MUST parse cleanly. The frontmatter parser at `plugins/devflow/devflow/bin/lib/frontmatter.cjs::extractFrontmatter` already handles unknown fields gracefully (it's a permissive parser); TRD 01-01 verifies and documents this.

**Shorthand resolution (locked):** When a frontmatter field uses `#NN` shorthand, the resolver resolves it against PROJECT.md `github_repo`. If PROJECT.md has no `github_repo`, the resolver falls back to `git config remote.origin.url` parsing. If neither resolves, the resolver emits a warning and keeps the value as `#NN` literal (does not throw).

## Resolver output shape (locked, per ROADMAP SC-2)

```json
{
  "objective": "01-github-coordination-layer",
  "github_issue": "AO-Cyber-Systems/devflow-claude#10",
  "parent_issue": "AO-Cyber-Systems/devflow-claude#9",
  "roadmap_issue": "AO-Cyber-Systems/devflow-claude#9",
  "org_initiative": null,
  "org_project": "PVT_kwDODwqLrc4BRsOP",
  "milestone": {
    "draft_or_issue_ref": "AO-Cyber-Systems/devflow#30",
    "title": "DevFlow Internal Alpha",
    "product": "DevFlow",
    "quarter": "Q2 2026",
    "status": "In Progress"
  },
  "provenance": {
    "github_issue": "frontmatter",
    "parent_issue": "frontmatter",
    "roadmap_issue": "walked_from_parent",
    "org_initiative": "absent",
    "org_project": "inherited_from_project",
    "milestone": "walked_from_parent"
  },
  "warnings": []
}
```

**Provenance vocabulary (locked):**
- `frontmatter` — value came from OBJECTIVE.md or TRD frontmatter directly
- `inherited_from_project` — value came from PROJECT.md (e.g., `org_project` defaulting)
- `walked_from_parent` — value derived by walking GraphQL: `org_project` from Product Roadmap; `milestone` from issue's project item
- `absent` — field not declared, no inheritance, no walk available
- `cached` — value served from in-memory cache (this resolve invocation, earlier call)

## Caching (locked, per ROADMAP SC-3)

In-memory cache, **per-process**, populated within a single `df-tools` invocation. Re-used by sibling calls within the same skill (e.g., `df:plan-objective` calls `gh resolve` once, then planner reads cached result). **NEVER persisted to disk.** Freshness is enforced by the invocation boundary; there is no `--refresh` flag. Each new `df-tools` process starts with empty cache.

Implementation pattern (mirror `lib/intent.cjs::loadDefaultsTable`'s `_cachedTable` style):

```js
let _cachedChains = new Map();   // key: `${repo}#${objectiveId}`
function _resetCache() { _cachedChains = new Map(); }   // for tests
```

## `lib/gh.cjs` export surface (locked, per ROADMAP SC-6)

After all v1.1 TRDs land, `lib/gh.cjs` exports:

```js
module.exports = {
  // EXISTING (preserved unchanged):
  ghStatus, cmdGhStatus, cmdGhSyncObjectives, cmdGhComment, cmdGhCloseIssue, cmdGhSyncRelease,

  // NEW in TRD 01-02:
  resolveChain,            // (frontmatter, projectCtx) => { ...chain, provenance, warnings }
  findRoadmapIssue,        // (repo) => "owner/repo#NN" | null
  cmdGhResolve,            // (cwd, objectiveId, raw) — CLI entrypoint

  // NEW in TRD 01-02 (graph helpers, used by resolveChain + sync):
  addToProject,            // (issueRef, projectId) => { ok, item_id }
  linkSubIssue,            // (parentRef, childRef) => { ok }

  // NEW in TRD 01-03:
  requireGhAuth,           // (requiredScopes) => throws structured error if missing/expired

  // NEW in TRD 01-04:
  syncObjective,           // (objId, projectRoot) => { issue_updated, comment_action, project_fields_updated }
  cmdGhSyncObjective,      // (cwd, objectiveId, raw) — CLI entrypoint
};
```

All new exports take **parsed objects** (frontmatter dict, not raw paths) so they're unit-testable with fixtures and **no live `gh` calls in the unit suite**.

## Idempotency (locked, per ROADMAP SC-5)

`df:gh-sync <objective>` is idempotent:
- Issue body: rewritten to canonical form on each sync. Running twice produces no diff.
- Sticky comment: written **in-place** using marker `<!-- df:state -->`. First sync creates the comment; subsequent syncs **find by marker substring and edit existing comment** (`gh issue comment <issue> --edit-last` is insufficient because users may have commented after; use `gh api repos/{owner}/{repo}/issues/comments/{id}` PATCH against the marker-tagged comment ID, persisted in `.planning/.gh-mapping.json`).
- Project v2 fields: writes are unconditional but values are stable for stable input — same TRD count → same Status/Quarter writes.

Marker placement (locked): The first line of the sticky comment body is exactly `<!-- df:state -->\n`. The marker MUST persist across edits (the rewriter prepends it if missing).

## Issue body format (locked)

The issue body for a sub-issue (objective-level) gets canonical sections, regenerated on each sync:

```markdown
**Objective {N}: {name}**

**Goal:** {goal from ROADMAP.md}

**Status:** {N TRDs total / M done}, current wave {wave}, last commit {sha}

**Success criteria:**
- [x] SC-1
- [x] SC-2
- [ ] SC-3
- ...

**TRDs:**
- [x] {objective}-01-TRD.md — {brief}
- [ ] {objective}-02-TRD.md — {brief}

_Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). Source of truth: `.planning/objectives/{objective}/` in this repo._
```

Sticky comment format (locked):

```markdown
<!-- df:state -->
**DevFlow state — last synced {ISO timestamp}**

- Wave: {N}
- TRDs: {done}/{total}
- SUMMARY count: {N}
- Last commit: {sha} — {subject}
- Branch: {branch}
```

## Discretion areas (planner decides)

- Sub-task granularity within each TRD (within the 2-3 task budget).
- Specific GraphQL queries for walking parent → project → milestone (planner verifies live against gh API during TRD 01-02 execution).
- Test cassette format and location (recommend `__fixtures__/gh-cassettes/{name}.json` for recorded responses).
- Whether to add `pm.backend` field to `.planning/config.json` schema in TRD 01-05 or just document it as "future config" (recommend the latter — minimal scope for v1.1).
- Test runner organization for new gh.cjs tests: append to `df-tools.test.cjs` or split to `gh.test.cjs` sibling (recommend the latter to mirror `intent.test.cjs` pattern).

## Out of scope for v1.1 (planner must NOT include)

- Bidirectional sync (GH → disk) — v1.2.
- Webhook listeners — v1.2.
- PM-backend abstraction with Linear/Jira implementations — v1.2+ (only the structural seam ships in v1.1; no Linear/Jira code).
- Backfilling sub-issues under existing 9 `[Roadmap]` parents — separate program work.
- Promoting 28 draft milestones to real issues — separate program work.
- Issue template / label standardization across repos — separate adoption work.
- Reconciling 6 misfiled objectives in this repo — separate hygiene work, prerequisite to v1.1 obj 3.
- A `--refresh` flag on `gh resolve` — invocation boundary IS the freshness boundary (locked decision).
- Heartbeat integration in resolver output (`siblings` facet from `org-context-resolver.md`) — v1.1 obj 2 ships heartbeats; obj 1's resolver output does NOT include the `siblings` facet.

## TRD types (locked, not auto-derived)

Per the user's TDD Playbook directives passed to the planner, code-shipping work in this objective is TDD by default. Documentation and prompt-only TRDs are standard.

| TRD | Type | Reason |
|---|---|---|
| 01-01 — Frontmatter fields & template docs | `standard` | Documentation + parser back-compat verification. No new code logic; verify existing parser handles unknown fields. |
| 01-02 — Resolver chain walk | `tdd` | Pure logic with structured input/output; matches Playbook habits 2 + 4. |
| 01-03 — Auth + error handling | `tdd` | Pure logic via mocked exec; testable error messages and exit codes. |
| 01-04 — gh-sync command + skill | `tdd` (lib/gh.cjs additions) + `standard` (SKILL.md prompt). Merged into one TRD per planner discretion. The lib code is the testable surface; the skill is markdown. |
| 01-05 — PM-backend seam refactor | `standard` | Light refactor of call sites; no new feature logic. Existing tests must continue to pass — that IS the verification. |
| 01-06 — Dogfood + integration | `tdd` | The integration test (gated on `GH_INTEGRATION=1`) is the testable surface. The frontmatter backfill is a pre-requisite task within the TRD. |

## CRITICAL sequencing constraint — `lib/gh.cjs` is shared by 4 TRDs

Per the user's `feedback_planner_proto_conflict` memory: planner under-encodes file-level co-modification. The orchestrator MUST sequence TRDs touching the same file even when `depends_on=[]` would suggest parallelism.

`lib/gh.cjs` is touched by TRDs 01-02, 01-03, 01-04, 01-05. **No two of these run in the same wave.** Sequencing:

- Wave 1: TRD 01-01 (templates only — no `lib/gh.cjs` touch)
- Wave 2: TRD 01-02 (lays down `resolveChain` + chain helpers in `lib/gh.cjs`)
- Wave 3: TRD 01-03 (extends `lib/gh.cjs` with auth wrapping; depends on Wave 2's chain helpers to know what to wrap)
- Wave 4: TRD 01-04 (extends `lib/gh.cjs` with `syncObjective`; depends on Wave 3's auth wrapping for fail-fast on missing scopes)
- Wave 5: TRD 01-05 (refactors `lib/gh.cjs` call sites + introduces `lib/pm-backend.cjs` seam; depends on Wave 4's full `lib/gh.cjs` surface being final)
- Wave 6: TRD 01-06 (dogfood: backfills obj 0 frontmatter + integration test; depends on all upstream)

This wave structure preserves test stability: each wave's TDD cycle gets a stable `lib/gh.cjs` baseline to write against.

## TDD discipline for tdd-typed TRDs

Per CLAUDE.md TDD Playbook (apply to TRDs 01-02, 01-03, 01-04, 01-06):

- **Test list first**: include a `## Test list` section in TRD body listing behavior cases (happy path + edge + failure mode) BEFORE any test code is written.
- **Fixture builders as their own task** ahead of the first behavior test. Hand-built factory functions in `plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs` style — no `faker`, no AI-completed sample data.
- **Recorded gh cassettes for live-API tests** captured once and committed at `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/{name}.json`. Live-API tests run only when `GH_INTEGRATION=1` is set; default `npm test` skips them.
- **One test at a time** RED → GREEN → REFACTOR. No batching tests.
- **Atomic commits per TDD TRD**: 2-3 commits (`test:` → `feat:` → optional `refactor:`).
- **Multitenancy guard not applicable** — this is a single-user CLI tool, single-org context (AO-Cyber-Systems). The `wrong-tenant assertion` requirement from intent resolver does NOT apply to gh resolver tests.
- **Outside-in not applicable** — pure-logic resolver, no UI / portal flows.

## Anti-pattern constraints (honored)

From the resolver's defaults table:

- `no_llm_test_data` — All test fixtures must be hand-built factory functions or recorded cassettes. NO AI-generated sample data in `gh-fixtures.cjs` or cassettes.
- `no_property_based_default` — Suppress property-based testing recommendations. Resolver tests use enumerated cases.
- `no_gherkin_layer` — No Gherkin/BDD syntax. Use descriptive test names directly.

## Goal-backward verification

Every TRD MUST include `must_haves` mapping to the 10 success criteria below (reproduced from ROADMAP §"Objective 1"). Each requirement ID (SC-1 through SC-10) MUST appear in at least one TRD's `requirements` frontmatter field.

1. **SC-1**: Template files (`templates/project.md`, `templates/objective.md`, `templates/job-prompt.md`) document new optional frontmatter fields with examples; existing files without these fields parse without warnings.
2. **SC-2**: `df-tools gh resolve <objective>` returns structured JSON: `{ github_issue, parent_issue, org_initiative, org_project, roadmap_issue, milestone, provenance, warnings }`. Provenance reports source per field (`frontmatter` / `inherited_from_project` / `walked_from_parent` / `absent` / `cached`).
3. **SC-3**: Resolver fetches live state via `gh api` / GraphQL at each `/df:plan-objective` and `/df:execute-objective` entry. Cache scope is **in-memory per-process** — re-used within a single skill invocation, never persisted across invocations. No `--refresh` flag.
4. **SC-4**: New `/devflow:gh-sync <objective>` mode (plus `df-tools gh sync <objective>` CLI surface) pushes linked GH issue's body + sticky comment with current objective state (TRDs total/done, current wave, last commit, SUMMARY count) and updates Project v2 custom fields (Status, Quarter where derivable).
5. **SC-5**: `df:gh-sync` is **idempotent** — running twice produces no diff in the second run; sticky comment is rewritten in-place using marker `<!-- df:state -->`.
6. **SC-6**: `lib/gh.cjs` exports a stable surface: `resolveChain(frontmatter, projectCtx)`, `syncObjective(objId)`, `findRoadmapIssue(repo)`, `linkSubIssue(parent, child)`, `addToProject(issue, projectId)`. All take parsed objects, not raw paths — unit-testable with fixtures (no live gh calls in unit suite). Module structure leaves room for `lib/linear.cjs` / `lib/jira.cjs` later without rewriting call sites.
7. **SC-7**: Frontmatter parsing supports BOTH `parent_issue: AO-Cyber-Systems/devflow-claude#9` (full ref) AND `parent_issue: #9` (same-repo shorthand resolved against PROJECT.md `github_repo`).
8. **SC-8**: Auth/binary failures (missing `gh`, expired token, insufficient scopes) → df-tools exits non-zero with the exact remediation command (e.g., `gh auth refresh -s project,read:project`); does NOT silently degrade or return partial results. Skill invocations stop and surface the error.
9. **SC-9**: **Round-trip integration test** (gated on `GH_INTEGRATION=1` env): a fixture objective with `parent_issue: AO-Cyber-Systems/devflow-claude#9` resolves end-to-end against live gh — chain walks parent → repo Roadmap issue → Product Roadmap project entry. Skipped when env unset.
10. **SC-10**: Resolver+sync flow validated against THIS repo's own state: `df-tools gh resolve 0` (objective 0) returns a chain leading to devflow-claude#20 → #9 → org Product Roadmap. Includes backfilling objective 0's OBJECTIVE.md frontmatter with `github_issue: #20, parent_issue: #9` as a TRD task.

## GitHub tracking

- **Issue:** [devflow-claude#10](https://github.com/AO-Cyber-Systems/devflow-claude/issues/10) (sub-issue of #9)
- **Gates:** #11 (cross-worktree session telemetry), #14 (initiative context layer), #15 (unified df:check-todos)
- **Branch:** `feature/v1.1` (don't push to origin until objective complete)

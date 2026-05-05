---
title: GitHub-Based Cross-Repo Coordination Layer
date: 2026-04-29
purpose: Spike findings to inform v1.1 milestone planning — cross-repo aggregation via GitHub Issues + Projects v2
status: research
---

# GitHub-Based Cross-Repo Coordination Layer

## Problem

DevFlow planning is per-repo (`.planning/objectives/` lives inside each repo). Cross-repo work has no native home, so it ends up squatting in `devflow-claude` (currently has 6 objectives that belong in other repos: `01-aodex-acp`, `02-port-acp-to-go`, `03-aosentry-ai-routing`, `04-aodex-mcp-server`, `05-usage-cost-api`, `06-flutter-macos-app`). This conflates the devflow-claude repo's own work with cross-cutting program work.

We need a coordination layer above per-repo planning that:
- Aggregates work spanning multiple repos
- Surfaces progress at the program level (epic → repo objective → TRD)
- Doesn't duplicate the per-repo planning files (single source of truth or clean projection)
- Integrates with where developers already work (PRs, code review)

## Spike findings (2026-04-29)

### Org & repo state

All 5 active repos under `AO-Cyber-Systems` org:
- `devflow-claude`
- `aodex`
- `aosentry`
- `aodex-flutter`
- `eden-libs`

Same-org membership means **sub-issues**, **cross-repo references**, and **org-level Projects v2** all work natively.

`aosentry-rails` is retired — `.planning/` should be archived, references removed from `devflow-claude/PROJECT.md`.

### Issue inventory

| Repo | Open | Closed | Templates | Notes |
|---|---|---|---|---|
| devflow-claude | 1 | 0 | bug_report.yml, feature_request.yml | Clean slate |
| aodex | 12 | 23 | none | Beta bug reports + `#33 [Roadmap]` |
| aosentry | 19 | 6 | none | Well-labeled (security/rbac/enterprise) + `#20 [Roadmap]` |
| aodex-flutter | 7 | 19 | none | Beta bug reports + `#2 [Roadmap]` |
| eden-libs | 0 | 0 | none | Empty |

### Existing roadmap issues — opportunity

Three repos already have `[Roadmap]` parent issues:
- `aodex#33` — Go Backend Migration - April 2026
- `aosentry#20` — Commercial Launch + Go Migration
- `aodex-flutter#2` — Flutter Client - Full Feature Parity by April 2026

They reference each other in prose ("Tracks to: Product Roadmap Project") but **none use the native `trackedIssues` (sub-issues) feature** — `totalCount: 0` on all three. They're using bullet lists.

This is the lift-and-shift: convert prose deliverables into real sub-issues so parents get live progress bars and Projects view rolls up.

### Auth scope blocker (resolved)

Initial `gh` token had `repo, gist, read:org` only. Refreshed with `gh auth refresh -h github.com -s project,read:project` — now `gist, project, read:org, repo`. ✓

### Existing org Project — major discovery

The org **already has a master roadmap**: **"Product Roadmap"** (Project #3, 37 items, owned by @justindonnaruma).

**Custom fields:**
- `Status` (Todo / In Progress / Done)
- `Product` (AODex / AOSentry / Trades / DevFlow / Eden Platform / Eden Biz / Infrastructure / Corporate)
- `Quarter` (Q1 2026 → Q4 2027)
- Standard fields: Title, Assignees, Labels, Repository, Milestone, Linked PRs, Parent Issue, Sub-issues progress

**Items breakdown:**
- **28 draft issues** = high-level program milestones not yet promoted to real issues (e.g. "DevFlow Internal Alpha", "AODex Public Launch", "Eden Biz GA Launch", etc.)
- **9 real `[Roadmap]` issues** linked from primary repos: `aodex#33`, `aodex-flutter#2`, `aosentry#20`, `trades#244`, `eden-biz#4`, `devflow#17`, `eden-ui#1`, `eden-ui-flutter#1`, `aocyber-cloud#1`

**None of the 9 `[Roadmap]` issues use sub-issues** — `trackedIssues.totalCount: 0` on all. The pattern is set up but not yet populated.

### `devflow` vs `devflow-claude` — the actual split

Discovered there are TWO devflow repos with explicitly separated charters:

| Repo | Role |
|---|---|
| `devflow` | Local dev platform (Go CLI + daemon): project registry, baseline stack (Traefik/Postgres/Redis/NATS/MinIO), secrets, toolchain orchestration, cross-project dep graph |
| `devflow-claude` | AI workflow orchestration: Claude Code skills, hooks, MCP, planning state |

`devflow/CHARTER.md` explicitly lists "AI workflow orchestration (that's devflow-claude)" as out-of-scope, and references a `devflow-dev` umbrella charter for the family.

**Implication:** `devflow-claude/.planning/objectives/` has been doing double duty as:
1. Its own repo's roadmap (legitimate)
2. Cross-repo program tracker (illegitimate — that role belongs at the org-Project level + `devflow#17` for DevFlow product epics)

This explains the misfiling. Six of devflow-claude's eight objectives are program-level work that has no business living in this repo.

### `devflow-claude` is NOT in the Product Roadmap

Among the 9 real `[Roadmap]` issues linked into the org Project, there is no `devflow-claude` entry. The DevFlow product line in the master roadmap is represented by `devflow#17` only. devflow-claude is implicitly a sub-component of the DevFlow product but lacks its own roadmap surface.

## GitHub primitives — what we'll use

| Primitive | Use |
|---|---|
| **Issues** | Per-repo unit of work. Each TRD or epic-level item. |
| **Sub-issues** (GA Q4 2024) | Native parent/child hierarchy. **Sub-issues can live in different repos.** Parent shows progress bar. |
| **Linked issues** (`owner/repo#NN`) | Cross-repo references. Auto-renders bidirectional links + "Tracked by" field. |
| **Task lists** | Markdown checkboxes that auto-link to issue URLs and track state. Lighter than sub-issues. |
| **Labels** | Metadata: `area:*`, `type:*`, `priority:*`. Per-repo but scriptable across org. |
| **Milestones** | **Per-repo only — do NOT span repos.** Wrong primitive for cross-repo work. |
| **Projects v2** | Org-level board/table/roadmap pulling issues from any repo. Custom fields, filters, multiple views. |
| **Discussions** | Pre-issue conversation/RFC space. |
| **Issue templates** | Structured intake forms via `.github/ISSUE_TEMPLATE/*.yml`. Map to TRD frontmatter. |

### Automation surface
- `gh` CLI for scriptable issue + project ops
- GraphQL API (required for Projects v2 mutations — REST does not cover everything)
- GitHub Actions for event-driven sync
- `.github/ISSUE_TEMPLATE/*.yml` for structured intake

## Proposed structure (revised after discovering existing Project)

### Don't create a new Project — plug into "Product Roadmap"

The existing master Project is sufficient. Its `Product` × `Quarter` fields cover what we need. Adding a parallel "DevFlow Coordination" Project would fragment the program view.

### Three-tier hierarchy

```
Tier 1: Product Roadmap (org Project)
  └─ Items grouped by Product × Quarter
     └─ Real GitHub issues from primary repos (the 9 [Roadmap] issues)
     └─ Promoted draft issues for milestones (e.g. "DevFlow Internal Alpha")

Tier 2: [Roadmap] parent issues per repo (one per primary repo)
  └─ Currently 9 exist, all without sub-issues yet
  └─ MISSING: devflow-claude#NN [Roadmap] — Claude Code Integration

Tier 3: Sub-issues = epics / objectives within a repo
  └─ Each maps 1:1 with a `.planning/objectives/NN-name/` directory
  └─ Cross-repo work = parent issue in primary repo + sub-issues in other repos
```

### Concrete example: DevFlow Internal Alpha (Q2 2026)

```
Product Roadmap project
  └─ "DevFlow Internal Alpha" (currently a draft — promote to real issue in `devflow` repo)
        Product: DevFlow, Quarter: Q2 2026, Status: In Progress
        ├─ devflow#NN  [Epic] DevFlow Coordination Layer (cross-repo)
        │     ├─ devflow-claude#NN  Cross-worktree session telemetry + TUI
        │     ├─ devflow-claude#NN  GH ↔ objective sync (df:gh-sync)
        │     ├─ devflow-claude#NN  Roadmap ↔ disk reconciliation
        │     └─ devflow-claude#NN  Project hygiene (move misfiled objectives)
        ├─ aodex#33  [Roadmap] Go Backend Migration (existing — backfill sub-issues)
        │     ├─ aodex#NN  ACP foundation (Rails)
        │     ├─ aodex#NN  Port ACP to Go
        │     └─ aodex#NN  MCP server (Go)
        ├─ aosentry#20  [Roadmap] Commercial Launch + Go Migration (existing)
        │     └─ ...
        └─ aodex-flutter#2  [Roadmap] Flutter Client (existing)
              └─ aodex-flutter#NN  Hub session screens
```

### Gaps to fill

1. **Promote 28 draft milestones** to real issues in their primary repos. Drafts in Projects v2 are hard to reference cross-repo and don't support sub-issues.
2. **Add `devflow-claude#NN [Roadmap] — Claude Code Integration`** to fill the missing line item, link into the org Project.
3. **Backfill sub-issues** under each existing `[Roadmap]` parent — convert prose deliverables into linked issues.
4. **Standardize issue templates** across primary repos (only `devflow-claude` has them).
5. **Standardize labels** across primary repos.

### Issue hierarchy

```
[Epic] (parent issue, lives in primary repo)
  └── [Objective-level issues] (one per .planning/objectives/ directory, lives in target repo)
        └── [TRD-level issues] OR task list of TRDs (per-TRD or rolled up — TBD by design)
```

Example mapping for ACP feature:

```
devflow-claude#NN  [Epic] Agent Control Plane (cross-repo)
  ├── aodex#NN          [Objective] Rails ACP foundation        → .planning/objectives/01-foundation
  ├── aodex#NN          [Objective] Port ACP to Go              → .planning/objectives/11-port-acp-to-go
  ├── aodex-flutter#NN  [Objective] Hub session screens         → (new objective)
  └── devflow-claude#NN [Objective] Hooks + install             → .planning/objectives/(new)
```

### Sync model (start here)

**Option 1: Lightweight, one-way (disk → GitHub)**

Each objective directory adds frontmatter to its `JOB.md` / `OBJECTIVE.md`:

```yaml
---
parent_issue: AO-Cyber-Systems/devflow-claude#42
github_issue: AO-Cyber-Systems/aodex#118
project: "DevFlow Coordination"
---
```

A `df:gh-sync` command:
- Reads objective state from disk (TRD count, SUMMARY count, current position from STATE.md)
- Pushes status + comment to the linked GitHub issue
- Updates Project custom fields (Status, Iteration)
- Optionally creates missing issues

Trade-off: GitHub view can lag disk. Acceptable for v1.

**Option 2: Bidirectional**

Adds: GitHub label/state changes pull down into objective frontmatter. Needs webhooks or polling. Defer to v1.2.

**Option 3: GitHub as source of truth**

Issues are canonical; objectives generated from issue acceptance criteria. Defer until model is proven.

### Issue templates (proposed standard set)

Replicate across all 5 repos:

- `epic.yml` — Cross-repo program work. Required: scope, sub-issues, success criteria
- `objective.yml` — Per-repo objective. Required: parent epic link, success criteria, requirements
- `bug.yml` — Standard bug report (devflow-claude already has this — propagate)
- `feature.yml` — Feature request (devflow-claude already has this — propagate)
- `tech-debt.yml` — Refactor/cleanup work
- `chore.yml` — Build, deps, ops

### Label taxonomy (proposed standard set)

- `type:epic`, `type:objective`, `type:bug`, `type:feature`, `type:tech-debt`, `type:chore`
- `area:backend`, `area:frontend`, `area:infra`, `area:docs`, `area:hooks`
- `priority:p0`, `priority:p1`, `priority:p2`
- `status:blocked`, `status:needs-spec`, `status:ready`
- `cross-repo` (flag for items linked into a multi-repo epic)

## Implications for v1.1 milestone planning

**Core principle (refined 2026-04-29):** **Planning is org-aware. Execution is repo-focused.** The earlier "make devflow-claude generally org-aware" framing was too broad and would have slowed the execution inner loop. The right placement: brains go at plan time, where overlap/duplication/shared-service decisions actually matter. Execution stays a local heads-down loop with at most a thin async preamble.

### Why this split

The misfiling we discovered (6 of 8 devflow-claude objectives belonged in other repos) was a *planning* failure, not an execution one. Each objective was planned in isolation, never asking "does this overlap with work in another repo? is there already a library for this in eden-libs? should this be a shared service?" Continuous org-polling during execution would slow the inner loop without adding value. Org-awareness during planning catches misfiling, finds reuse opportunities, and surfaces shared-service candidates before code gets written.

### Where org-awareness shows up

**During planning (`df:plan-objective`, `df:research-objective`):**
- Survey sibling repos for related recent work (semantic scan of SUMMARY.md, last 90 days of commits)
- Scan eden-libs / shared SDK locations for reusable capabilities
- Query the org Product Roadmap project (`PVT_kwDODwqLrc4BRsOP`) for related epics
- Detect misfiling: "should this even be a <current-repo> objective?"
- Flag shared-service opportunities: if multiple repos are about to add the same thing, propose extracting to eden-libs
- Output as a "Cross-Repo Considerations" section in CONTEXT.md, influencing TRDs

**During execution (`df:execute-objective`):**
- No continuous org-polling
- SessionStart hook MAY pull thin org context (parent issue, milestone) as async preamble
- Stop hook publishes SUMMARY → linked issue + Project status field — async, non-blocking
- Execution itself never blocks on GitHub state

**TUI viewer:** read-only, surfaces org rollup but doesn't gate execution.

### Refined v1.1 milestone scope

| # | Objective | Goal |
|---|-----------|------|
| 1 | GitHub linkage layer | Frontmatter convention (parent_issue / github_issue / org_milestone), resolver service walking the chain, gh CLI helpers. Foundation. |
| 2 | Planning-time org awareness | Extend df:research-objective + df:plan-objective to consult sibling repos, eden-libs, org Project. Output as Cross-Repo Considerations in CONTEXT.md. |
| 3 | Cross-worktree session telemetry | Hooks (SessionStart/PreToolUse/Stop/SubagentStop) → shared JSONL/SQLite store. Per-session metadata includes resolved org context. |
| 4 | Program-aware TUI viewer | Renders parallel sessions + their position in org tree. Read-only, doesn't gate execution. tmux-pane friendly. |
| 5 | Lightweight execution sync | Stop hook → SUMMARY publish to linked issue + Project Status field. SessionStart preamble pulls thin org context. Both async/non-blocking. |
| 6 | df:sync-roadmap | Reconcile ROADMAP.md checkboxes ↔ on-disk SUMMARY presence. |

**Out of scope for v1.1 milestone** (handled as ad-hoc):
- Hygiene moves of 6 misfiled objectives + archive aosentry-rails — **prerequisite, must precede milestone planning**
- Org rollup adoption (promoting drafts, backfilling sub-issues, standardizing templates) — ongoing program work, not a feature objective

## Open questions for planning

1. **Where does (B) get planned?** Options:
   - Standalone hygiene work, no formal planning (just do it)
   - As an objective in the `devflow` repo's `.planning/` (devflow has no `.planning/` yet — would be a first)
   - As a v1.1 objective in `devflow-claude` since that's where the conversation is happening
2. **Cross-repo epic granularity**: One epic per cross-repo feature (e.g. ACP, MCP, Cost API), or one umbrella per quarter milestone? Probably both — quarter milestone = parent of feature epics = parent of per-repo objectives.
3. **TRD-issue granularity**: Each TRD becomes a sub-issue under the objective issue, OR objective issue has a task list of TRDs? Recommend: objective-issue + task list (lighter than full sub-issue tree).
4. **Promote drafts now or as we go?** Bulk-promoting all 28 drafts is one PR's worth of work; piecemeal lets us refine the template as we go.
5. **devflow-claude's Roadmap issue scope**: just Claude Code integration mechanics (hooks/skills/MCP), or include the cross-repo coordination meta-work? Cleaner to scope it tight: "Claude Code Integration" only, with cross-repo work tracked at the `devflow#17` level.

## Misfiling reconciliation

devflow-claude objectives that should move:

| # | Objective | Real home | Action |
|---|-----------|-----------|--------|
| 01 | aodex-agent-control-plane | aodex | Move (or merge with existing aodex objectives) |
| 02 | port-acp-to-go | aodex | **Duplicate of `aodex/11-port-acp-to-go`** — merge |
| 03 | aosentry-ai-routing | aosentry | Move (note: aosentry-rails is retired per user) |
| 04 | aodex-mcp-server | aodex | Move |
| 05 | usage-cost-api | aodex | Move |
| 06 | flutter-macos-app | aodex-flutter | Move |
| 18 | eden-libs-sdk-extraction | eden-libs | Move (likely overlaps `eden-libs/16-ai-platform-sdk`) |
| 19 | ai-completeness | TBD | Need scope review |

Plus: archive `aosentry-rails/.planning/`, remove its references from `devflow-claude/PROJECT.md`.

## Next steps

1. ✅ Capture spike findings (this doc)
2. ✅ Refresh `gh` auth scopes
3. ✅ Discover existing org Project + repo split
4. ⏳ Decide: scope of devflow-claude v1.1 milestone (A only? A+B?)
5. ⏳ `/df:new-milestone` for devflow-claude v1.1 — research-led, then roadmap
6. ⏳ In parallel or as first objective: project hygiene (move misfiled objectives, archive aosentry-rails, fix PROJECT.md)
7. ⏳ Org-level: add devflow-claude `[Roadmap]` issue, promote DevFlow Q2 2026 draft, backfill sub-issues

## References

- GitHub sub-issues docs: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues
- Projects v2 GraphQL API: https://docs.github.com/en/graphql/reference/objects#projectv2
- `gh` CLI project commands: `gh project --help`

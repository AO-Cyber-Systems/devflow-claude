---
objective: 01-github-coordination-layer
title: GitHub coordination layer — research synthesis
created: 2026-05-04
status: pointer
sources:
  - .planning/research/github-coordination-layer.md
  - .planning/research/cross-session-coordination.md
  - .planning/research/org-context-resolver.md
---

# Objective 1 — Research synthesis

This objective's research is **complete**. The three source-of-truth research docs (referenced in frontmatter) drove the decisions now locked in `01-CONTEXT.md`. This file is a thin pointer so the executor doesn't have to re-derive.

## Source of truth

The primary research doc is `.planning/research/github-coordination-layer.md` (319 lines). Read it directly when implementing TRDs that touch:

- **gh CLI primitives** (TRD 01-02): `.planning/research/github-coordination-layer.md` §"GitHub primitives — what we'll use" enumerates the gh API + GraphQL coverage. Sub-issues (`trackedIssues`) require GraphQL; REST does not cover them.
- **Three-tier hierarchy** (TRD 01-02): §"Proposed structure" + §"Three-tier hierarchy" describe the walk: objective → `[Roadmap]` parent issue → org Product Roadmap project (#3) → org milestone draft.
- **Sync model decision** (TRD 01-04): §"Sync model (start here)" — Option 1 (one-way disk → GitHub) was selected. Options 2 (bidirectional) and 3 (GitHub source of truth) are explicitly v1.2+.
- **Existing `[Roadmap]` issues** (TRD 01-06 dogfood): §"Existing roadmap issues" lists the 9 parent issues across the org. `devflow-claude#9` is the dogfood target.
- **Auth scope requirements** (TRD 01-03): §"Auth scope blocker (resolved)" — token needs `repo, gist, project, read:project, read:org` minimum.

## Decision ratification — what locked into ROADMAP success criteria

The locked SC in ROADMAP §"Objective 1" are the ratified outcome of the research. Mapping for traceability:

| ROADMAP SC | Research source | Ratified decision |
|---|---|---|
| SC-1 (frontmatter convention) | github-coordination-layer.md §"Sync model" | Optional fields on PROJECT/OBJECTIVE/TRD; back-compat preserved by existing permissive parser. |
| SC-2 (resolver structured output) | org-context-resolver.md §"Inputs and outputs" | Reduced output shape — drop `siblings`, `initiative.recent_context`, `todos` for v1.1. Those depend on heartbeats (obj 2) and initiative-sync (obj 5). |
| SC-3 (in-memory cache only) | org-context-resolver.md §"Layered cache" + memory user-feedback | Reduced from 3-tier cache to single per-process tier. Disk caches add complexity without value at v1.1 traffic levels (1-3 resolver calls per skill invocation). |
| SC-4 (sync command + Project v2 fields) | github-coordination-layer.md §"Sync model" Option 1 | Disk → GH only; updates issue body + sticky comment + Status/Quarter fields. |
| SC-5 (idempotent sync via marker) | github-coordination-layer.md §"Implications" §"During execution" | Marker `<!-- df:state -->` for sticky comment; canonical issue body for body. |
| SC-6 (lib/gh.cjs export surface) | github-coordination-layer.md §"Implications" §"PM-backend abstraction" | v1.1 ships GitHub-only backend; seam scaffold-only (TRD 01-05). |
| SC-7 (full ref + shorthand) | github-coordination-layer.md §"Concrete example" — issue refs use `owner/repo#NN` notation | Shorthand `#NN` resolves against PROJECT.md `github_repo` (planner discretion to fall back to git remote URL). |
| SC-8 (hard fail on auth) | github-coordination-layer.md §"Auth scope blocker" + memory user-feedback | Inverts existing `lib/gh.cjs` skip-on-fail behavior for new subcommands. Existing subcommands keep current behavior (back-compat). |
| SC-9 (live integration test) | github-coordination-layer.md §"Existing roadmap issues" — 9 real `[Roadmap]` issues exist | `devflow-claude#9` is the dogfood target; test gated on `GH_INTEGRATION=1`. |
| SC-10 (dogfood obj 0) | This repo's STATE.md — obj 0 just shipped, has GH issue #20 | Backfill obj 0's OBJECTIVE.md frontmatter as part of TRD 01-06 so the dogfood test has real data. |

## What changed from research → locked decisions

- **Resolver scope shrunk from `org-context-resolver.md`'s full design.** The research doc proposed 6 facets (parent_issue, milestone, siblings, initiative, heartbeats, todos). v1.1 ships only the first 4, and `org_initiative` is read-only (no sync). `siblings` and `todos` depend on capabilities not yet built (heartbeats from obj 2; initiative-sync from obj 5).
- **Cache simplified from 3-tier to per-process.** The research doc proposed `.devflow-cache/`, `~/.devflow/cache/`, in-memory tiers. v1.1 ships only in-memory, per-process. Rationale: at v1.1 traffic (1-3 resolver calls per skill invocation), disk caches add surface area without measurable performance gain.
- **PM-backend abstraction reduced to seam-only.** Research suggested designing the abstraction. v1.1 ships scaffold (one switch statement). Linear/Jira backends are v1.2+.
- **Heartbeat/duplicate-detection deferred.** `cross-session-coordination.md` is v1.1 obj 2's spec, NOT obj 1's. The resolver output shape excludes the `siblings` facet to keep this objective tight.

## TDD posture

This objective is `kind: plugin, work: feature` — defaults table prescribes `tdd: strict` for `(plugin, feature)`. The user's CLAUDE.md TDD Playbook is detected and applied (already verified by intent resolver during obj 0). Every code-shipping TRD is `type: tdd` with the test-list-first + fixture-builder discipline.

The defaults table (`plugins/devflow/devflow/references/defaults-table.md`) for `(plugin, feature)` resolves to:

- `tdd_default: strict`
- `test_list_first: required`
- `fixture_strategy: generators`
- `outside_in: false` (pure-logic CLI tool, not a UI flow)
- `security_isolation: n/a` (single-user single-org)

Apply per-TRD as captured in CONTEXT.md §"TDD discipline".

## Cross-references

- `01-CONTEXT.md` (this objective) — locked decisions
- `.planning/research/github-coordination-layer.md` — primary research
- `.planning/research/cross-session-coordination.md` — runtime layer (v1.1 obj 2; this obj's resolver output is consumed there)
- `.planning/research/org-context-resolver.md` — full resolver design (v1.1 ships subset)
- `.planning/objectives/00-refine-defaults-table/00-CONTEXT.md` — sister objective; gh resolver mirrors intent resolver's provenance/sources style
- `plugins/devflow/devflow/bin/lib/intent.cjs` — pattern reference for the new `lib/gh.cjs::resolveChain` (mirror style, do NOT couple)

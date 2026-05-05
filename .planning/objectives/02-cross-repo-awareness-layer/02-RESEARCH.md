---
objective: 02-cross-repo-awareness-layer
title: Research synthesis (pointer doc)
created: 2026-05-04
status: pointer
---

# Objective 2 — Research synthesis

This objective's research is captured in two pre-existing docs at `.planning/research/`. **This doc is a pointer + a 1-paragraph synthesis explaining how the v1.1 simplification maps the research's heartbeat design onto a read-side aggregation layer.**

## Source-of-truth research

- **`.planning/research/cross-session-coordination.md`** (256 lines) — original heartbeat schema, lifecycle hooks, duplicate-detection design, initiative context layer, unified `df:check-todos`, user-handoff mechanism.
- **`.planning/research/github-coordination-layer.md`** (319 lines) — Product Roadmap project structure, issue hierarchy, sub-issues, `gh` primitives, sync-model decisions. Walkable via obj 1's `resolveChain`.

Read those FIRST. This doc does not duplicate their content.

## v1.1 simplification — heartbeat → read-side aggregation

The original `cross-session-coordination.md` design proposed an **active-session heartbeat**: each running Claude session writes a YAML record to a shared store every ~5 minutes (debounced); a separate aggregator reads the store to build a cross-session view. The v1.1 milestone scope tightened this to **read-side aggregation only** (locked decision #2): the data SOURCE is already there — git refs hold pushed branch state via `.planning/STATE.md`, and the org Product Roadmap project holds program-level progress via Projects v2 custom fields. We don't need a write-side daemon; we just need a reader. The "heartbeat record" becomes a **synthesized view of git-branch state** (objective from STATE.md + last-commit timestamp from `git log` + github_issue ref from the same STATE.md). This loses the sub-5-minute freshness of a daemon-based design but gains zero infrastructure cost (no shared repo, no shared schema, no cron, no failure modes from a process going dark) and zero developer onboarding (no setup beyond `git push`). The accepted limitation is **stale = invisible** (locked decision #9): a teammate who hasn't pushed in N days won't appear in the peer view; they push for visibility. For the org side, obj 1's `resolveChain` already walks ONE objective's chain; obj 2 adds `walkProject(projectId)` to iterate ALL items in the org Project + their direct sub-issues — building on the same auth/cache/error-handling primitives obj 1 lays down.

## Mapping from research → TRDs

| Research artifact | Obj 2 TRD that ships it |
|---|---|
| Heartbeat schema (cross-session-coordination.md §"Active-session heartbeat") | 02-01 + 02-02 — `parseStateMd` extracts the same fields (objective, branch, github_issue, last commit) but reads them from git instead of a heartbeat store |
| Lifecycle hooks (cross-session-coordination.md §"Lifecycle hooks") | 02-06 — SessionStart populate-if-missing; plan-time + execute-time force-refresh |
| Duplicate detection (cross-session-coordination.md §"Duplicate detection") | **NOT in obj 2** — obj 4 consumes obj 2's scanner output |
| Initiative context (cross-session-coordination.md §"Initiative context layer") | **NOT in obj 2** — obj 5 |
| Unified `df:check-todos` (cross-session-coordination.md §"Unified df:check-todos") | **NOT in obj 2** — obj 6 |
| Product Roadmap project walk (github-coordination-layer.md §"Three-tier hierarchy") | 02-03 — `walkProject` + `scanOrg` |
| Sub-issue fallback to task-list parsing (github-coordination-layer.md spike findings: "None of them currently use native trackedIssues") | 02-03 — task-list bullet parser fallback when `trackedIssues.totalCount===0` |
| `requireGhAuth` reuse (github-coordination-layer.md decision: hard-fail) | 02-03 — `scanOrg` calls `requireGhAuth(['project', 'read:project', 'repo'])` |

## Open questions resolved at planning time

The original research carried open questions; here's how obj 2 resolves them:

1. **Heartbeat storage choice** — RESOLVED: dropped (no heartbeat in v1.1). Locked decision #1.
2. **Heartbeat cadence** — RESOLVED: not applicable (no daemon).
3. **Initiative scope** — DEFERRED: obj 5.
4. **`df:check-todos` scope creep** — DEFERRED: obj 6.
5. **Handoff status-line UX** — RESOLVED: obj 7 territory; awareness layer doesn't surface handoff state.
6. **Duplicate-detection feedback loop** — DEFERRED: obj 4.

## TRD-level research consultation

Each TRD's `<research_context>` section pulls only the relevant paragraphs from the source-of-truth research docs. Executors should NOT re-read the full research — embed the necessary context in TRDs.

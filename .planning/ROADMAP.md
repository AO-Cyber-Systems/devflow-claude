# Roadmap

## Milestone v1.1 — DevFlow Coordination Layer (planning)

**Goal:** Bring devflow-claude from a per-repo planning helper to a program-aware coordination layer for AI-assisted work across the AO-Cyber-Systems org. Planning becomes org-aware (surveys sibling repos, eden-libs reuse, org Product Roadmap to surface overlap, shared-service opportunities, and misfile risk). Execution stays repo-focused with thin async preamble. Cross-session telemetry, duplicate detection, initiative context, unified todo aggregation, and structured user-handoff complete the runtime layer.

**Status:** Awaiting `/df:new-milestone` formalization. Research and architectural principles captured in:
- `.planning/research/github-coordination-layer.md` — structural layer (GitHub Issues + Projects v2 + sub-issues)
- `.planning/research/cross-session-coordination.md` — runtime layer (heartbeat, duplicate detection, initiatives, unified check-todos, df:handoff)

**Provisional objective scope** (to be refined by `/df:new-milestone` planner):

1. **GitHub coordination layer** — frontmatter conventions (parent_issue, github_issue, org_milestone), resolver service walking objective → repo [Roadmap] → org Product milestone, gh CLI helpers, df:gh-sync command. Foundation for everything else.
2. **Cross-worktree session telemetry + heartbeat** — hook-driven heartbeat schema (session_id, project, branch, github_issue, objective, job, files_touched, files_planned, state, blocked_on_user). Storage choice TBD (recommend dedicated lightweight git repo).
3. **Planning-time org awareness** — extend df:research-objective + df:plan-objective to consult sibling repos, eden-libs, org Project. Output as Cross-Repo Considerations in CONTEXT.md.
4. **Duplicate-work detection + resolution flow** — plan-time + execute-time checks against active heartbeats. Strong/hard matches block; weak matches advise. 4-option resolution: Merge / Defer / Coordinate / Proceed-anyway.
5. **Initiative context layer** — disk projection of GitHub Epics at `~/.claude/devflow/initiatives/` with planner-readable Why + Open questions. Planner reads matching initiatives by key_repos at plan time. df:initiatives sync command.
6. **Unified df:check-todos** — morning-standup view across local todos + GH issues (assigned/mentioned/review-requested) across all repos + active heartbeats + initiative open questions. Output grouped by urgency lane.
7. **df:handoff user-pause primitive (= seamless-handoff watcher daemon)** — structured pop-in/pop-out for user-only commands. Watcher daemon runs queued commands in user's interactive shell, injects results back. Status-line + df:activity surface. Currently in flight on parallel feature branch.
8. **Program-aware TUI viewer** — renders parallel sessions + their position in the org tree (parent epic, milestone, sibling progress). Read-only viewer doesn't gate execution. tmux-pane friendly.
9. **Roadmap ↔ disk reconciliation** — df:sync-roadmap reconciles ROADMAP.md checkboxes ↔ on-disk SUMMARY.md presence.

Dependency order:

```
1 (GitHub layer) ──┬──> 2 (heartbeat) ──┬──> 4 (dup-detect) ──> 6 (check-todos)
                   │                    │
                   │                    └──> 7 (df:handoff)
                   │                    │
                   │                    └──> 8 (TUI)
                   │
                   └──> 3 (planning awareness)
                   │
                   └──> 5 (initiatives — independent, can land in parallel)

9 (roadmap-disk reconcile) — independent of runtime layer; can land any time
```

**Out of scope for v1.1** (deferred):
- OS notifications for handoff (v1.2)
- Auto-start of watcher daemon via launchd/systemd (v1.2 polish)
- Backwards-compatibility shims for projects without kind/work (handled by `proposal/kind-and-work`'s migrate flag, separate branch)
- Org rollup adoption work (promoting drafts, backfilling sub-issues, standardizing templates/labels) — ongoing program work, not a feature objective

**Prerequisites for v1.1 execution:**
- `proposal/kind-and-work` merged to main (planner needs intent resolver)
- `feature/seamless-handoff` successor (watcher daemon variant) merged to main (objective 7's foundation)

# DevFlow State

## Project Reference

**Building:** DevFlow Claude — meta-prompting plugin for Claude Code, evolving into program-aware coordination layer for AO-Cyber-Systems org
**Core Value:** AI workflow orchestration + cross-repo program awareness for AI-assisted development
**Ecosystem:** AODex (Rails+Go API) + AOSentry (LLM Gateway) + Flutter (macOS Hub) + DevFlow (local platform CLI/daemon) + DevFlow Claude (this — Claude Code plugin)

## Current Position

**Milestone:** v1.1 — DevFlow Coordination Layer (in flight)
**Branch:** `feature/v1.1`
**Objective in flight:** 0 — Refine (kind, work) defaults table from codebase evidence
**Status:** Objective 0 PLANNED + VERIFIED 2026-05-04. 6 TRDs across 4 waves at `.planning/objectives/00-refine-defaults-table/`. Average verifier confidence 8.0/10, 7 minor/info briefings for executor. GH tracking: #20 (sub-issue of #9; closes #7 in PR). Next: `/df:execute-objective 0`.

## Branch State (post-merge)

- `main` — has the merged kind/work intent model (PR #8) + seamless-handoff watcher (PR #19). 349/349 tests pass.
- `feature/v1.1` (this branch) — clean off new main; carries v1.1 planning + TDD-scope research framing. 381/381 tests pass (349 + 32 from draft v1.1 hooks).
- `feature/v1.1-coordination` (superseded) — earlier name for v1.1 work; same content, can be deleted.
- `feature/seamless-handoff`, `handoff-completion-work`, `proposal/kind-and-work` — all merged via PRs #19 and #8; safe to delete.

## Recent Decisions

- **Plan org-aware, execute repo-focused** — devflow-claude consults org state at planning time; execution stays repo-local. Brains at plan time, not exec time. (Project memory: `project_devflow_claude_scope`)
- **Continue executing — no manual paste** — seamless-handoff watcher daemon (Approach B) shipped; daemon executes queued commands in user's interactive shell, injects results back via UserPromptSubmit hook. v1.1 limit: stdio-pipe dispatch can't satisfy true TTY-required prompts (doctl auth init etc.); v1.2 PTY backend closes that gap.
- **Org-level coordination via GitHub** — Product Roadmap project (`PVT_kwDODwqLrc4BRsOP`) is the substrate. devflow-claude#9 [Roadmap] now exists with 9 v1.1 sub-issues (#10–#18). Linked as sub-issue of devflow#30 (DevFlow Internal Alpha Q2 2026 epic).
- **Three research docs anchor v1.1**:
  - `github-coordination-layer.md` — structural (GH Issues + Projects v2 + sub-issues)
  - `cross-session-coordination.md` — runtime (heartbeat + duplicate detection + initiatives + check-todos + handoff)
  - `org-context-resolver.md` — foundational service every other v1.1 capability depends on
- **TDD scope research COMPLETE** — survey ran across 9 sibling repos (aodex-go, aosentry, aohealth-go, aodex-flutter, eden-libs, eden-ui, eden-ui-flutter, eden-cli, devflow-claude). 4 artifacts at `.planning/research/tdd-scope-{by-kind-work,codebase-survey,refined-defaults,summary}.md`. Locked decisions captured in `.planning/objectives/00-refine-defaults-table/00-CONTEXT.md`.
- **GH #7 (testing-levels matrix) folded into objective 0** — soft-bundle: separate reference doc (`references/testing-strategy.md`) the planner reads alongside the resolver output. No resolver coupling. Closes #7 in same PR as #20.
- **kind/work intent model is canonical** — devflow-claude's PROJECT.md uses `kind: plugin, default_work: feature`. Defaults table at `plugins/devflow/devflow/references/defaults-table.md` is the (kind, work) → defaults source of truth.
- **Objective 0 wave structure (LOCKED — see `00-CONTEXT.md` §7):** Wave 1 = TRD 0.1 (table) + 0.6 (testing-strategy doc); Wave 2 = TRD 0.2 (resolver schema, solo soak); Wave 3 = TRD 0.3 (planner) + 0.4 (CLAUDE.md absorption); Wave 4 = TRD 0.5 (migration + provenance). TRD 0.1 ≠ Wave with TRD 0.2 — hard sequencing constraint.

## Blockers / Concerns

- **`feature/v1.1-coordination` is duplicative** — same content as `feature/v1.1`. Should be deleted to avoid confusion. Its worktree at `/Users/markemerson/Source/devflow-claude-v11` can be removed.

## Session Continuity

Last session: 2026-05-04 — Objective 0 planned and verified; 6 TRDs ready for execution.
Resume file: `.planning/SESSION_PICKUP.md`
Next: `/df:execute-objective 0` (read SESSION_PICKUP.md first for the 7 executor briefings).

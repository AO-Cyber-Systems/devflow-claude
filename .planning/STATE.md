# DevFlow State

## Project Reference

**Building:** DevFlow Claude — meta-prompting plugin for Claude Code, evolving into program-aware coordination layer for AO-Cyber-Systems org
**Core Value:** AI workflow orchestration + cross-repo program awareness for AI-assisted development
**Ecosystem:** AODex (Rails+Go API) + AOSentry (LLM Gateway) + Flutter (macOS Hub) + DevFlow (local platform CLI/daemon) + DevFlow Claude (this — Claude Code plugin)

## Current Position

**Milestone:** v1.1 — DevFlow Coordination Layer (planning)
**Status:** Foundational research complete (2 docs in `.planning/research/`); awaiting `/df:new-milestone` to formalize objective roadmap.

## Branch State

Three feature branches exist in flight, none merged to main yet:

- `feature/seamless-handoff` — Approach A foundation (PreToolUse hook + handoff records). Test coverage 162/162. **Not merge-ready** as-is — Approach A is disruptive. Background agent working on Approach B (watcher daemon) at `../devflow-claude-handoff-completion`.
- `proposal/kind-and-work` — Intent model (kind/work + defaults table + CLAUDE.md absorption + migrate). Test coverage 159/159. **Merge-ready** pending one rebase to drop two duplicated handoff commits (`173ed66`, `0c94b9c`).
- `feature/v1.1-coordination` (this branch) — clean off main; planning state for v1.1 milestone goes here.

## Recent Decisions

- **Plan org-aware, execute repo-focused** — devflow-claude consults org state at planning time; execution stays repo-local. Brains at plan time, not exec time. (Project memory: `project_devflow_claude_scope`)
- **Continue executing — no manual paste** — seamless-handoff's MVP (Approach A) is foundation; Approach B watcher daemon is the actual goal. The `!` prefix is disruptive; daemon executes queued commands in user's interactive shell, injects results back.
- **Org-level coordination via GitHub** — Product Roadmap project (`PVT_kwDODwqLrc4BRsOP`) with Product × Quarter fields is the substrate. 9 existing repo `[Roadmap]` parent issues exist; sub-issues are unpopulated. devflow-claude is missing its own `[Roadmap]` issue — gap to fill in v1.1 adoption work.
- **Two complementary research docs** drive v1.1 planning: `github-coordination-layer.md` (structural) + `cross-session-coordination.md` (runtime). Together they cover the 8 v1.1 objectives.
- **kind/work intent model lives on `proposal/kind-and-work`** — once merged, devflow-claude's PROJECT.md uses `kind: plugin, default_work: feature`. This branch's PROJECT.md is forward-compatible with that model.

## Blockers / Concerns

- v1.1 milestone planning depends on `proposal/kind-and-work` merging first (so the planner agent has the intent resolver to use). Order: (1) merge kind-and-work, (2) merge seamless-handoff successor with watcher daemon, (3) plan v1.1 against clean main.
- The seamless-handoff watcher daemon is significant scope (Node + interactive shell session management + result-injection hook). Background agent estimated 3-5 TRDs.

## Session Continuity

Last session: 2026-04-29 — research docs written, v1.1 working branch initialized, seamless-handoff completion handed off to background agent.
Resume file: none
Next: User invokes `/df:new-milestone v1.1 — DevFlow Coordination Layer`

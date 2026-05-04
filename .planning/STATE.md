# DevFlow State

## Project Reference

**Building:** DevFlow Claude — meta-prompting plugin for Claude Code, evolving into program-aware coordination layer for AO-Cyber-Systems org
**Core Value:** AI workflow orchestration + cross-repo program awareness for AI-assisted development
**Ecosystem:** AODex (Rails+Go API) + AOSentry (LLM Gateway) + Flutter (macOS Hub) + DevFlow (local platform CLI/daemon) + DevFlow Claude (this — Claude Code plugin)

## Current Position

**Milestone:** v1.1 — DevFlow Coordination Layer (planning + TDD scope research)
**Branch:** `feature/v1.1` — fresh off main 2026-05-04, after PR #19 + #8 merged
**Status:** TDD scope research framing committed (`.planning/research/tdd-scope-by-kind-work.md`); awaiting first survey pass against real codebases.

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
- **TDD scope is the next gating research** — the merged kind/work defaults table has TDD opinions per cell that haven't been validated against real codebases. Open questions 6 and 7 from the kind-and-work proposal are direct inputs. Research artifact at `.planning/research/tdd-scope-by-kind-work.md` frames the questions, methodology, and acceptance criteria. Treat as an objective-0 prerequisite to v1.1 sub-issues #12 and #13.
- **kind/work intent model is canonical** — devflow-claude's PROJECT.md uses `kind: plugin, default_work: feature`. Defaults table at `plugins/devflow/devflow/references/defaults-table.md` is the (kind, work) → defaults source of truth.

## Blockers / Concerns

- **TDD scope research is framing-only right now** — no survey data yet. The structure is in place; populating it requires reading real test suites across 6+ codebases. Could be done by a focused `/df:research-objective` invocation or a dedicated subagent.
- **`feature/v1.1-coordination` is duplicative** — same content as `feature/v1.1`. Should be deleted to avoid confusion. Its worktree at `/Users/markemerson/Source/devflow-claude-v11` can be removed.

## Session Continuity

Last session: 2026-05-04 — main updated post-merge; new feature/v1.1 branch created off main; TDD scope research framing committed.
Resume file: none
Next: Either (a) populate the TDD-scope research with codebase survey findings, or (b) invoke `/df:new-milestone v1.1 — DevFlow Coordination Layer` to formalize the objective roadmap (with TDD-scope as objective 0 / prerequisite).

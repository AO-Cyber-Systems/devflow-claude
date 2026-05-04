# DevFlow State

## Project Reference

**Building:** DevFlow Claude — meta-prompting plugin for Claude Code, evolving into program-aware coordination layer for AO-Cyber-Systems org
**Core Value:** AI workflow orchestration + cross-repo program awareness for AI-assisted development
**Ecosystem:** AODex (Rails+Go API) + AOSentry (LLM Gateway) + Flutter (macOS Hub) + DevFlow (local platform CLI/daemon) + DevFlow Claude (this — Claude Code plugin)

## Current Position

**Milestone:** v1.1 — DevFlow Coordination Layer (in flight)
**Branch:** `feature/v1.1`
**Objective in flight:** 0 — Refine (kind, work) defaults table from codebase evidence
**Status:** Objective 0 IN EXECUTION. Wave 3 COMPLETE (TRD 0.3 + TRD 0.4 done). 1 TRD remaining (0.5). Next: Wave 4 — TRD 0.5 (migration + provenance). GH tracking: #20 (sub-issue of #9; closes #7 in PR).

## Branch State (post-merge)

- `main` — has the merged kind/work intent model (PR #8) + seamless-handoff watcher (PR #19). 349/349 tests pass.
- `feature/v1.1` (this branch) — clean off new main; carries v1.1 planning + TDD-scope research framing. 408/408 tests pass (381 + 27 from TRD 0.2 new tests).
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
- **TRD 0.6 complete (2026-05-04)** — `references/testing-strategy.md` authored with layer x tool x stack matrix (4 stacks, 7 layers), Flutter-web gotcha, codegen discipline, platform routing. Visual/golden and AI exploratory cells marked deferred per codebase survey. Closes GH #7. Commit: df9fb0e.
- **TRD 0.1 complete (2026-05-04)** — `defaults-table.md` rewritten to 42 cells × 9 fields. All 6 port cells drop spec-match (contract-list-first parity). All 4 non-skip ui-lib cells drop visual regression. api cells carry security_isolation. constraints: block added. Resolver seeded from full tableDefaults so all 9 fields propagate. Commits: 30e6ed2, 57c8be9. Wave 1 now complete.
- **Resolver config seeding fix (TRD 0.1 deviation)** — `intent.cjs` initialized `config = { ...tableDefaults }` so new fields (security_isolation, back_compat, tdd_default, test_list_first, fixture_strategy) surface in `df-tools intent resolve` output. Provenance for new fields deferred to TRD 0.2.
- **TRD 0.2 complete (2026-05-04)** — Extended `intent.cjs` resolver: `loadConstraints()` added; 5 new fields + provenance emitted per field; CLAUDE.md TDD Playbook promotions (skip→auto→strict, optional→required, inline→generators, n/a→multi_tenant_required for api kind); multi-tenant hard-enforcement via `wrong_tenant_assertion` in `verification_commands`; `buildMatrixProject()` fixture added. 408/408 tests pass. Commits: 8847c85 (test:), 6cb0cce (feat:). Wave 2 complete.
- **outside_in boolean field added (TRD 0.2 deviation)** — Field was in TRD 0.2's NEW_FIELDS but omitted from TRD 0.1's cell schema. Added to `(api, feature)` and `(app, feature)`. Parser extended with bool coercion for bare YAML `true`/`false`.
- **TRD 0.3 complete (2026-05-04)** — Planner agent extended: `<constraints>` block, Step 1 JSON (5 new fields + constraints), Step 2 print (9 fields grouped), Step 3 replaced with field-driven emission rules (test_list_first/fixture_strategy/security_isolation/outside_in/back_compat), new Step 4 (testing-strategy.md conditional load), new Step 5 (constraint enforcement), old Step 4 → Step 6. Merged TRDs 03+07 (same file). All 6 verification greps pass. Closes SC-3, SC-6. Commit: 21e150d. Wave 3 partial (0.4 remaining).
- **TRD 0.3+0.7 merge confirmed** — Both TRDs edit planner.md's Intent Resolution section; merged into single TRD per CONTEXT.md discretion note. Content split: TRD-03 supplies field-consumption steps; TRD-07 supplies testing-strategy.md Step 4.
- **TRD 0.4 complete (2026-05-04)** — `claude-md.cjs` extended: `PLAYBOOK_HABITS` constant (6 habits) + extended `deriveOverrides` loop. All 6 TDD Playbook habits detected; 5 structured fields emitted (tdd_default, test_list_first, fixture_strategy, outside_in, security_isolation). Habit 3 freeform-only (field:null). Legacy fields preserved. `realCLAUDEMd()` fixture added. Real `~/.claude/CLAUDE.md` round-trip confirmed. 425/425 tests pass. Commits: 49634dc (test:), cf8a12a (feat:). Wave 3 complete.
- **PLAYBOOK_HABITS design (TRD 0.4)** — 6-entry constant: field:null for habit 3 (freeform-only); /i-flagged patterns on original body text (not lowercased); legacy patterns retained unchanged alongside new loop. tdd_default:'auto' emitted by absorber; promotion to strict is resolver's job.

## Blockers / Concerns

- **`feature/v1.1-coordination` is duplicative** — same content as `feature/v1.1`. Should be deleted to avoid confusion. Its worktree at `/Users/markemerson/Source/devflow-claude-v11` can be removed.

## Session Continuity

Last session: 2026-05-04 — TRD 0.4 (CLAUDE.md absorption) complete. Wave 3 complete.
Resume file: `.planning/SESSION_PICKUP.md`
Stopped at: Completed 00-04-claude-md-absorption-TRD.md
Next: Execute Wave 4 — TRD 0.5 (migration + provenance round-trip).

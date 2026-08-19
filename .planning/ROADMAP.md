# Roadmap: DevFlow Claude

## Milestones

- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)
- 📋 **v1.3 — not yet planned** (`/devflow:milestone new`)

Full archived roadmaps: `.planning/milestones/v1.2-ROADMAP.md` (contains both v1.1 and v1.2 detail). Milestone history: `.planning/MILESTONES.md`.

## Objectives

<details>
<summary>✅ v1.1 DevFlow Coordination Layer — SHIPPED 2026-05-06</summary>

- [x] Objective 0: Refine (kind, work) defaults table (6/6 plans)
- [x] Objective 1: GitHub coordination layer (6/6 plans)
- [x] Objective 2: Cross-repo awareness layer (7/7 plans)
- [x] Objective 3: Planning-time org awareness (7/7 plans)
- [x] Objective 4: Duplicate-work detection + resolution flow (6/6 plans)
- [x] Objective 5: Initiative context layer (5/5 plans)
- [x] Objective 6: Unified check-todos (4/4 plans)
- [x] Objective 7: Handoff watcher (shipped via PR #19)
- [x] Objective 8: Program-aware TUI viewer (3/3 plans)
- [x] Objective 9: Roadmap ↔ disk reconciliation (3/3 delivered; 09-03 SUMMARY.md missing — docs gap only)
- [x] Objective 24: Natural-language routing trigger fixes (3/3 plans)

</details>

<details>
<summary>✅ v1.2 Token Efficiency + Ambient Mode + Handoff Polish — SHIPPED 2026-07-22</summary>

- [x] Objective 10: Phase E — Agent-spawn audit (2/2 plans)
- [x] Objective 11: Phase D — build → verifier wiring (1/1 plan)
- [x] Objective 12: Phase G+I — Skill consolidation 28→14 (7/7 plans)
- [x] Objective 13: Phase H — Prompt extraction to references (4/4 plans)
- [x] Objective 14: Phase F — Default-on safety nets (5/5 plans)
- [x] Objective 15: Phase A — Authoritative routing keystone (5/5 plans)
- [x] Objective 16: Phase B — /devflow:micro skill (4/4 plans)
- [x] Objective 17: Phase C — Auto-init detection (4/4 plans)
- [x] Objective 18: v1.1 polish bundle (3/3 plans)
- [x] Objective 19: PTY support for handoff watcher (5/5 plans)
- [x] Objective 20: Daemon polish bundle (5/5 plans)
- [x] Objective 21: Bidirectional GH sync + configurable defaults table (5/5 plans)
- [x] Objective 22: Workflow-impediment fixes (4/4 plans)
- [x] Objective 10: Autonomous mode overhaul (9/9 plans) <!-- duplicate number, parallel session -->
- [x] Objective 23: Claude compatibility cleanup (5/5 plans)
- [x] Objective 10: Flutter UI verification process (9/9 plans, released v2.2.0) <!-- duplicate number, parallel session -->
- [x] Objective 25: Fleet audit fixes (6/6 plans, UAT 8/8 pass)

</details>

### 📋 v1.3 (not yet planned)

Candidate scope carried forward from v1.2 deferrals:

- Phase J — Claude Code built-in integration (devflow-claude#35)
- Phase K — Agentic estimation engine (devflow-claude#36)
- PTY architectural gaps from TRD 19-05 (dispatch-wrapper isatty, wrapper stdin race, detector Ctrl+C-on-late-match)
- `devflow-watch stash add` CLI for token-passing `value_source: 'stash'`
- Durable worktree-executor marker fix (eden-press editGate "warn" is the interim mitigation)
- Docs cleanup: stale USER-GUIDE.md rows (resume-work/progress/pause-work/add-objective)
- 09-03 SUMMARY.md backfill (deliverables shipped, summary doc missing)

### Objective 26: GitHub issue auto-build monitor

**Goal:** Discover untracked GitHub issues in the current repo and drive qualifying ones through the full DevFlow pipeline (plan → execute → verify → PR) unattended, behind a trusted-author gate.
**Depends on:** Objective 25
**Jobs:** 0 jobs

Jobs:
- [ ] TBD (run /devflow:plan-objective 26 to break down)

## Progress

| Objective | Milestone | Plans | Status | Completed |
|---|---|---|---|---|
| 0–9, 6, 8, 24 (13 objectives) | v1.1 | 53/53 | Complete | 2026-05-06 |
| 10–23 (15 objectives) | v1.2 | 71/71 | Complete | 2026-05-25 |
| 25. Fleet audit fixes | v1.2 | 6/6 | Complete | 2026-07-22 |
| 26. GitHub issue auto-build monitor | v1.3 | 0/6 | Planning | — |
| 27. Gate correctness | v1.3 | 5/6 | Complete (1 deferred) | 2026-08-18 |
| 28. Model tier binding and escalation | v1.3 | 5/6 | Complete (1 deferred) | 2026-08-19 |
| 29. Context discipline | v1.3 | 4/4 | Complete | 2026-08-19 |
| 30. Agent environment hygiene | v1.3 | 4/4 | Complete | 2026-08-19 |
| 31. Telemetry and retention | v1.3 | 0/3 | Planning | — |

### Objective 27: Gate correctness ✅

**Goal:** Stop DevFlow's own gates from blocking DevFlow's own agents — close the three gate defects measured in the Autonomy Blocker Audit (1,048 edit-gate denials inside subagents, 280 on paths outside the repo, 446 commit-gate blocks from substring matching), and mitigate the harness worktree guard DevFlow cannot fix.
**Depends on:** — (independent)
**Source:** Autonomy Blocker Audit, 2026-08-18
**Jobs:** 6/6 complete

Jobs:
- [x] 27-01 Marker resolves across git worktrees + TTL (`9571a11`, `ec83003`)
- [x] 27-02 Targets outside the project root are never gated (`9571a11`)
- [x] 27-04 Commit gate matches invocation, not substring (`c13d5db`)
- [x] 27-05 Executor worktree command discipline — F-01 mitigation (`786752d`)
- [x] 27-06 Stale hook inventory, model-profiles claim, `/df:` prefix (`5d0aed8`)
- [ ] 27-03 Gate posture — **deferred by decision**, see SUMMARY.md

Evidence: 2709 tests / 2649 pass / 10 fail — identical failures to the pre-objective baseline (2681/2621/10). 28 tests added, 0 regressions.

### Objective 28: Model tier binding and escalation ✅

**Goal:** Make the model profile table actually bind (it was inert for every skill caller), refresh the live model ids, and give DevFlow an escalation signal that is not raw tool-error rate.
**Depends on:** Objective 27 (clean gate signal)
**Source:** Autonomy Blocker Audit, 2026-08-18
**Jobs:** 5/6 complete

Jobs:
- [x] 28-01 Model ids refreshed; models{} documented as live (`d469837`)
- [x] 28-02 Profile table binds; resolution auditable, unknown agents loud (`d469837`)
- [x] 28-03 effort declared per agent; reference regenerated (`55d1a82`)
- [x] 28-04 No-progress guard — lib + PreToolUse hook (`c6c1a74`)
- [x] 28-05 Escalation policy + executor request protocol (`ac7dc89`)
- [ ] 28-06 Haiku replay eval — **deferred**, 63 Haiku turns is no basis to decide

Evidence: 2748 tests / 2689 pass / 9 fail — same pre-existing daemon/timing failures. 39 tests added, 0 regressions.

### Objective 29: Context discipline ✅

**Goal:** Cut the context DevFlow agents consume — targeting whole-file reads (49.9% of tool-result tokens) and full file bodies written into tool-call arguments (33.8% of the window) — and make the measurement repeatable so the improvement is observed rather than assumed.
**Depends on:** Objective 27 (marker fix re-permits Edit)
**Source:** Autonomy Blocker Audit, 2026-08-18 — finding F-10
**Jobs:** 4/4 complete

Jobs:
- [x] 29-01 Read narrowly — locate with rg, read with offset/limit (`e0a2c81`)
- [x] 29-02 Prefer targeted Edit over whole-file tool arguments (`e0a2c81`)
- [x] 29-03 Guardrail policy recorded; CLAUDE.md audited (~3.2K tok, not bloated) (`173c7f0`)
- [x] 29-04 `df-tools context` — repeatable composition measurement (`173c7f0`)

Evidence: 2761 tests / 2701 pass / 10 fail — same pre-existing daemon/timing failures. 13 tests added, 0 regressions. Tool independently reproduces the audit (Read 53.6% @ 2,301 tok/call, images 1.4%, subagent p50 117K vs main 329K) and reports `read_share_ok: false` at 53.6% as the pre-change baseline.

### Objective 30: Agent environment hygiene ✅

**Goal:** Close the long tail of environment friction from finding F-05 — agent tool allowlists that forbid what the prompt instructs, a routing table advertising skills the model cannot invoke, CWD drift, build timeouts, and overrides that leave no trace.
**Depends on:** — (independent)
**Source:** Autonomy Blocker Audit, 2026-08-18 — finding F-05
**Jobs:** 4/4 complete

Jobs:
- [x] 30-01 Agent allowlists cover what prompts call (`6037be7`)
- [x] 30-02 Routing stops advertising un-invocable skills (`6037be7`)
- [x] 30-03 Anchor paths to worktree root; raise build timeouts (`68bd573`)
- [x] 30-04 Structured, logged gate overrides (`68bd573`)

Evidence: 2797 tests / 2737 pass / 10 fail — same pre-existing daemon/timing failures. 29 tests added, 0 regressions.

### Objective 31: Telemetry and retention

**Goal:** [To be planned]
**Depends on:** Objective 30
**Jobs:** 0 jobs

Jobs:
- [ ] TBD (run /df:plan-objective 31 to break down)

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
| 31. Telemetry and retention | v1.3 | 3/3 | Complete | 2026-08-19 |

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

### Objective 31: Telemetry and retention ✅

**Goal:** Make objectives 27–30 verifiable rather than asserted — classify blocking events repeatably, preserve session evidence before retention deletes it, and turn the signals into advisories someone will actually read.
**Depends on:** Objectives 27, 28, 30 (emit the signals this aggregates)
**Source:** Autonomy Blocker Audit, 2026-08-18
**Jobs:** 3/3 complete

Jobs:
- [x] 31-03 `df-tools session-audit` — the programme's acceptance test (`51c7766`)
- [x] 31-02 `df-tools transcript-export` — compact index before retention (`51c7766`)
- [x] 31-01 `df-tools telemetry` — status-facing view with advisories (`81796d6`)

Evidence: 2839 tests / 2780 pass / 9 fail — same pre-existing daemon/timing failures. 42 tests added, 0 regressions.
**Caveat:** hooks run from the plugin cache, so 27–30 take effect only after a version bump + `sync-runtime`. Re-run `session-audit --since <release>` then — that comparison is the real verdict.


### Objective 32: Visual-eval default path tells the truth

**Goal:** The default `df-tools verify flutter-ui-eval` invocation stops reporting green for states nothing judged. A `state_id` absent from `labels.json` must resolve to review or fail — never pass — and the offline path must stop emitting a fabricated `confidence` for a comparison it never performed.
**Depends on:** PR #68 (`feat/ui-visual-eval`) — adds the real `--judge live` vision judge this objective builds on. **Branch decision: stack, do not wait.** Work on `fix/ui-eval-default-honesty` cut from `feat/ui-visual-eval` and PR'd back into it, so #68 ships the judge and the honest default path together.
**Source:** AO-Cyber-Systems/aodex#485 (OPEN). Umbrella: AO-Cyber-Systems/eden-biz#683 (Phase 1).
**TRDs:** 4 plans in 4 waves (sequential — all four edit `flutter-ui-eval.cjs`)

Why: #485 audited the shipped gate and found `makeOfflineLabelEchoJudge` reads only `state_id` — it never opens `screenshot_path`, never reads `expected`. A missing label defaults to `{ is_broken: false }`. Reported impact: **40 states passing, 34 of which had never been judged by anything.** PR #68 supplies the judge; this objective makes the DEFAULT path honest.

Reproduced during planning against the current tree: an unlabelled state reports `"verdict": "pass"`; a stub-shaped state reports `"reviews": [null]`; and a run scoring `verdict: "fail"` exits 0.

TRDs:
- [ ] 32-01-TRD.md — Wave 1: a state nothing judged stops reporting pass (#485 defect 1, the headline)
- [ ] 32-02-TRD.md — Wave 2: offline path stops fabricating confidence; every state nameable (#485 defect 2)
- [ ] 32-03-TRD.md — Wave 3: judge selection explicit; default declares itself advisory (#485 defect 3)
- [ ] 32-04-TRD.md — Wave 4: a failing run exits non-zero (found in planning; severable)


### Objective 33: The visual gate actually runs in CI

**Goal:** Verifier Step 8c invokes the visual-eval engine with something the engine can load, so the gate executes instead of routing to SKIPPED. Today it is structurally unreachable and has judged nothing, ever.
**Depends on:** Objective 32 (makes the gate's output and exit code honest). 33 makes it RUN — both are required before "the visual gate works" is true. **Branch decision: stack.** Work on `fix/ui-eval-gate-runs` cut from `fix/ui-eval-default-honesty` (obj 32) at its tip, PR'd into `feat/ui-visual-eval` — 32-03 and 33-03 both rewrite verifier.md Step 8c, and 33 is the last writer.
**Source:** Found while planning objective 32. Umbrella: AO-Cyber-Systems/eden-biz#683 (Phase 1). Related: AO-Cyber-Systems/aodex#485.
**Jobs:** 3 TRDs in 3 waves (sequential — 33-02 and 33-03 edit files objective 32 also edits)

Why: `agents/verifier.md` Step 8c calls `df-tools verify flutter-ui-eval "$OBJECTIVE" --raw`, passing an objective **id**. The handler's first argument is a **manifest path** (`loadManifest(manifestPath)` → `fs.readFileSync`). Reproduced: `verify flutter-ui-eval 32 --raw` → `{"error":"manifest/captureResults not found","path":"32"}`. Step 8c's own contract then routes any `{error}` to `SKIPPED … NEVER a hard fail` — so the gate silently no-ops on every objective. It reports skipped rather than false-green, which is why #485 did not catch it, but CI coverage of the visual gate is currently **zero**.

Jobs:
- [ ] 33-01-TRD.md — Wave 1: one lookup, in code — objective id to manifest, four honest statuses (`not_applicable`/`absent`/`invalid`/`resolved`)
- [ ] 33-02-TRD.md — Wave 2: the load-bearing fix — the invocation Step 8c actually contains resolves to something the engine can load
- [ ] 33-03-TRD.md — Wave 3: what the gate does when it runs and finds nothing (MISSING vs gap vs silent skip) + Step 8c routing

Decision recorded in OBJECTIVE.md: **resolution is owned by the handler, not the prose** (option c, implemented as b). Two prose documents already drifted apart on this lookup; the side that owns it is the side that cannot drift, so it moves into code once. The load-bearing test then EXECUTES the invocation extracted from `verifier.md` itself — it pins behaviour, not a string.

Manifest-less policy: `not_applicable` skips silently (existing gate preserved), `absent` is **MISSING** — the surface stays on the human-verification list plus a todo, escalating to a gap only when `visual_gate: true` — and `invalid` gaps loudly. Replacing a gate that never runs with a gate that always gaps would just get it disabled.
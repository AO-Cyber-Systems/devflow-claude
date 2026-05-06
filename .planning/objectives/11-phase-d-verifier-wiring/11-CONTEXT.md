---
objective: 11-phase-d-verifier-wiring
github_issue: "#29"
parent_issue: "#25"
status: planning
---

# Objective 11: Phase D — Fix `/devflow:build` → df-verifier wiring

## Problem

Issue #29 reports: `/devflow:build` sessions are not producing real `df-verifier` spawns or `VERIFICATION.md` output, even though `## 8. Auto-Verify + Complete` is documented in `build.md`. The user observes that next-build sessions never invoke the dedicated verifier agent ≥1 time.

**Phase E context (just landed):** Phase E switched 14 misused `general-purpose` spawns to dedicated `df-*` agents across 6 workflow files. Phase E EXPLICITLY preserved `build.md:167` as a legitimate "workflow trampoline" — `Task(prompt="Run /devflow:execute-objective ${OBJECTIVE_NUMBER} --auto", subagent_type="general-purpose")`. The reasoning was: trampolines that invoke a slash command are the only valid generic use.

That reasoning is sound for the trampoline itself, but it leaves a gap: **the trampoline is the only path through which verification gets reached, and verification is silently failing**.

## Diagnosis (root cause)

The `/devflow:build` chain has two layers:

1. **Layer 1 — Build orchestrator (`build.md`):**
   - Section 7 "Execute TRDs" spawns a single `Task(subagent_type="general-purpose")` with prompt `"Run /devflow:execute-objective ${OBJECTIVE_NUMBER} --auto"` (line 167).
   - Section 8 "Auto-Verify + Complete" (lines 174-209) is a **section header that promises verification but contains zero `Task(...)` spawns**. It only has display/branching logic ("If OBJECTIVE COMPLETE", "If GAPS FOUND") that *assumes* the trampoline already verified.

2. **Layer 2 — Execute-objective (`execute-objective.md`):**
   - Has a real verifier spawn at line 521: `Task(subagent_type="verifier", model="{verifier_model}")` inside `<step name="verify_objective_goal">`.
   - That step is correctly wired to the dedicated `verifier` agent (`agents/verifier.md`).

**Why the chain breaks in practice:**

The Layer 1 trampoline pattern relies on a general-purpose subagent receiving the prompt `"Run /devflow:execute-objective ..."` and then independently:
- Reading `~/.claude/devflow/workflows/execute-objective.md`
- Faithfully executing every step including `verify_objective_goal`
- Spawning the `verifier` subagent itself
- Reporting results back to the parent build orchestrator

In practice this is unreliable: the trampoline subagent has no `<execution_context>` reference forcing it to read the full workflow file, and it can short-circuit out after the executor agents finish (sections 1-7 of execute-objective) without ever reaching the verification step. The build orchestrator then proceeds to its own section 8, which assumes verification happened and only renders a banner.

**Failure mode mapping** (per issue #29):
- (A) build delegates to execute-objective, no verify → **CONFIRMED** — trampoline can return without spawning verifier
- (B) wrong subagent_type → ruled out — when verifier *is* spawned (in execute-objective), subagent_type is correct (`"verifier"`)
- (C) wired but not invoked → **CONFIRMED** — the chain *can* invoke it but is not guaranteed to

## Locked Decisions

1. **Root cause is the build.md trampoline pattern, not the verifier agent or the execute-objective step.** The verifier spawn at `execute-objective.md:521` is correct. The bug is that `build.md` cannot guarantee that step is reached.
2. **Smallest possible fix: make build.md section 8 own the verifier spawn directly as a backstop.** Add an explicit `Task(subagent_type="verifier", ...)` block inside `## 8. Auto-Verify + Complete` so verification happens AT THE BUILD LEVEL regardless of what the trampoline did. If execute-objective.md already produced a VERIFICATION.md, the verifier agent's Step 0 detects re-verification mode and runs a fast regression check — idempotent and safe. If no VERIFICATION.md exists, the build-level spawn produces one fresh. This guarantees ≥1 `df-verifier` spawn per `/devflow:build` run.
3. **Add a regression test** that asserts the build chain spawns the verifier. Test approach: grep `build.md` for `subagent_type="verifier"` AND grep that the same file references the `verifier` agent role. This is a fast, deterministic, mechanical test (mirrors Phase E verification approach: `grep -rn "subagent_type" plugins/devflow/devflow/workflows/`). If the planner or a future refactor removes the verifier spawn, the test fails.
4. **Do NOT remove or rewrite the trampoline.** The trampoline remains correct for delegating execution wave management to execute-objective.md. We are adding a verifier backstop at the build level, not replacing the trampoline.
5. **Verifier idempotency is the key enabler for this fix.** `agents/verifier.md` Step 0 ("Check for Previous Verification") detects existing `VERIFICATION.md` and switches to re-verification mode (fast regression check on passed items, full check on failed items). This means a build-level spawn AFTER an execute-objective-level spawn is cheap and safe.

## Scope

**In scope:**
- Add explicit verifier `Task(...)` block to `build.md` section 8 (one site)
- Add regression test that asserts `build.md` contains `subagent_type="verifier"` AND points at the dedicated `verifier` agent
- Update `build.md` section 8 prose to describe the new flow

**Out of scope:**
- Refactoring the trampoline pattern itself (separate concern; would touch 3 files at line 167-style sites)
- Adding verifier spawns to other workflow trampolines (build.md is the only one observed failing per #29)
- Verifier agent changes (`agents/verifier.md` is correct)
- `verify-objective.md` workflow changes (subordinate to verifier agent; not the orchestration layer)
- `execute-objective.md` line 521 changes (already correct)

## Decomposition Strategy

**Single TRD: 11-01 — Diagnose, fix, and add regression test.** Three tasks — one diagnostic write-up commit (CONTEXT.md + RESEARCH.md already produced by planner), one wire-up fix to `build.md`, one regression test in `df-tools.test.cjs`. Single-wave, single-concern.

Why one TRD: the fix is mechanical (~5 lines in `build.md`), the test is mechanical (~10 lines in `df-tools.test.cjs`), and they share the same verification (grep `build.md` after the fix should show the new spawn site; running the new test should pass). Splitting would inflate context for no quality gain.

**Wave structure:**
- Wave 1: 11-01 (single TRD)

## Files Touched

**11-01 (diagnose, fix, test):**
- MODIFY: `plugins/devflow/devflow/workflows/build.md` (add verifier spawn in section 8)
- MODIFY: `plugins/devflow/devflow/bin/df-tools.test.cjs` (add regression test)

## Verification Approach

**Mechanical greps (the same Phase E pattern):**
1. `grep -n 'subagent_type="verifier"' plugins/devflow/devflow/workflows/build.md` returns ≥1 match
2. `grep -n '@~/.claude/agents/verifier.md\|First, read ~/.claude/agents/verifier.md' plugins/devflow/devflow/workflows/build.md` returns ≥1 match (verifies the spawn passes the agent role file)
3. `npm test` passes including the new regression test

**Smoke test (manual, post-merge):** Next `/devflow:build` session produces a `VERIFICATION.md` file in the objective directory and the session log shows ≥1 verifier subagent spawn from build.md (vs from execute-objective.md alone).

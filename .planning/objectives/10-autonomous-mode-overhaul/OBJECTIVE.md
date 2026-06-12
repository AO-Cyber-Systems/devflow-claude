---
work: feature
overrides:
  depth: comprehensive
---

# Autonomous Mode Overhaul

## Goal

Make DevFlow capable of autonomous end-to-end operation where humans are consulted only for design/architecture decisions: machine-verified checkpoints (verifier delegation instead of blind auto-approval), a decision queue that parks design choices without halting independent work, auto-resume/retry hooks, hardened agent frontmatter, and a distinct `mode: "autonomous"` config preset with an unattended-operation runbook.

## Why This Objective

A June 2026 audit of the pipeline against current Claude Code capabilities found the autonomy model calibrated backwards in two places, plus five mechanical gaps. YOLO mode auto-approves `checkpoint:human-verify` with a blind "approved" (skipping verification instead of automating it) and auto-selects the first option on `checkpoint:decision` (automating exactly the thing humans should own). Newer Claude Code primitives — Stop-hook forced continuation (`decision: "block"`), SubagentStop retry, `isolation: worktree` / `maxTurns` / `memory` agent frontmatter, `auto` permission mode, Routines — directly close the remaining gaps but are unused.

## Scope (six work items)

1. **Verifier delegation for checkpoints.** Replace blind `checkpoint:human-verify` auto-approval (`references/checkpoints.md:11`, `workflows/execute-objective.md:388-390`) with delegation to the verifier agent: spin up the app, run the Playwright/Maestro functional pass (verifier.md Step 8 already defines it), approve only on green evidence, escalate to the user only on failure. HARD CONSTRAINT: never use port 8080 for verification servers — use 8091.

2. **Decision queue.** For `checkpoint:decision` and executor deviation Rule 4: stop auto-selecting the first option in auto mode. Park the decision (context, options, recommendation) in `.planning/decisions/`, notify the user, and continue any TRDs/waves that do not depend on the answer. Wave dependency data already exists in the orchestrator.

3. **Auto-resume + retry hooks.** (a) Upgrade `hooks/verify-completion.js` (Stop, currently warn-only) to return `decision: "block"` with a resume directive when STATE.md shows mid-execution work and autonomous mode is on. (b) SubagentStop hook: retry a failed executor once with failure feedback before surfacing. (c) Wave failure handling (`workflows/execute-objective.md:336-375`): replace the "Continue?/Stop?" prompt with retry-once, then dependency-aware skip of only the dependent TRDs, reporting at the end.

4. **Agent hardening.** Adopt `isolation: worktree` on wave-parallel executors (removes same-tree commit races), `maxTurns` on executor/verifier (runaway protection), and `memory: true` where useful. Current agent frontmatter has none of these.

5. **Config integrity + de-stamping.** `require_verification` / `require_tests` are written by new-project but never read by any agent or workflow — wire them in or remove them. Collapse new-project's sequential config AskUserQuestion calls into batched calls (up to 4 questions per call, multiSelect). In autonomous mode, drop pure-stamp confirmations from transition and complete-milestone (keep scope-adjustment and destructive-action stops).

6. **Autonomous preset + runbook.** New `mode: "autonomous"` config preset distinct from yolo: machine-verify everything, queue design decisions, never wait on mechanics; yolo keeps current semantics. Ship `references/unattended-operation.md`: headless `claude -p` invocation, `auto` permission mode, recommended settings allowlist, Routines (`/schedule`) pointer for overnight objective runs.

## Notes

- Sequencing: the `mode: "autonomous"` preset (item 6's config schema part) must land before items 1-3, since the hooks and checkpoint protocol branch on it.
- Keep human-required stops intact: `checkpoint:human-action` (auth), Rule 4 architectural stops (queued, not removed), `safety.always_confirm_destructive`, discuss-objective's design-capture loops.
- Audit references: stage-by-stage human-stop map and blocker analysis from the 2026-06-12 session review (verifier already has Level-4 Playwright/Maestro capability; gap-closure loop bounded at 2 cycles; resume-after-context-reset is currently manual re-invocation only).
- Port 8080 is permanently off-limits in every example, test, hook, and agent prompt this objective touches — use 8091. Pass this through to all spawned subagents.

---
*Created: 2026-06-12*

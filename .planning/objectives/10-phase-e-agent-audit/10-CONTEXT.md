---
objective: 10-phase-e-agent-audit
github_issue: "#30"
parent_issue: "#25"
status: planning
---

# Objective 10: Phase E — Agent-Spawn Audit

## Problem

Session telemetry across 498 sessions shows 88 `general-purpose` Task spawns vs 200 dedicated `df-*` spawns — about 30% of subagent invocations bypass the specialized agents. Each `general-purpose` spawn skips the dedicated agent's preamble and specialization, undermining downstream phases (F=safety nets, G+I=consolidation, H=prompt extraction).

## Goal

Audit every `subagent_type` call in `plugins/devflow/devflow/workflows/`, switch misuse cases to the appropriate `df-*` agent in the same pass, and document the convention so future workflows don't regress.

**Acceptance criteria (from #30):**
- All `subagent_type="general-purpose"` calls audited (full table with disposition: keep | switch | document)
- Switches landed for misuse cases
- `docs/agent-spawning-convention.md` written
- (30-day metric tracked separately — not a TRD deliverable)

## Locked Decisions

1. **Audit + remediate in one pass.** No separate "audit then later fix" phase. The audit table lives in `10-RESEARCH.md` and is the source of truth the executor consumes.
2. **Convention doc lives at `docs/agent-spawning-convention.md`** per #30 spec — NOT inside `.planning/`. Repo-rooted so external contributors find it.
3. **Switches preserve existing test coverage.** No regressions in workflow integration tests if any exist. Workflow markdown changes are not unit-tested today; verification is grep + smoke-spawn check.

## Audit Findings (synthesized from grep)

**Surface area:** 17 `general-purpose` spawns across 8 workflow files (out of ~40 total `subagent_type` calls).

**Disposition split:**
- **SWITCH** (13 sites, 6 files) — work matches an existing `df-*` agent
- **DOCUMENT** (4 sites, 3 files) — `Task(prompt="Run /devflow:...")` invokes a slash-command/workflow, not agent work; generic is correct here

Full table in `10-RESEARCH.md`.

**Note on issue #30 hypothesized targets:** `verify-objective.md` and `complete-milestone.md` have ZERO `subagent_type` calls (verified via grep). The actual targets are `diagnose-issues.md`, `security-audit.md` (4 sites), `plan-objective.md` (3 sites), `execute-objective.md` (1 gap-closure site), `discuss-objective.md` (1 auto-advance site), `quick.md` (1 site), `new-project.md` (4 sites), `build.md` (1 auto-advance site).

## Scope

**In scope:**
- Audit table covering all 17 sites with rationale per disposition
- Switch edits to 6 workflow files (13 sites total)
- New `docs/agent-spawning-convention.md` codifying the rule + decision tree
- Optional: a small validator (df-tools subcommand or test) that fails when a workflow uses `general-purpose` where a dedicated agent role exists

**Out of scope:**
- 30-day session telemetry tracking (separate measurement work)
- Phase F (safety nets), Phase G+I (consolidation), Phase H (prompt extraction) — downstream objectives, gated by this audit
- New agent creation (every switch target already exists)

## Decomposition Strategy

Two TRDs, optional third:

- **10-01 — Audit + remediate** (standard) — produce full subagent_type table in `10-RESEARCH.md` and apply all 13 switches in one pass. Single-wave, single-concern.
- **10-02 — Convention doc** (standard) — write `docs/agent-spawning-convention.md`. Independent of 10-01 (doc references the convention; switch edits don't depend on doc).
- **10-03 — Validator** (DEFERRED — not in v1) — a small df-tools subcommand or test that catches future regressions. Skipped per "tight scope; aim for 2 TRDs" directive. Add as post-merge follow-up issue if Phase F doesn't already land equivalent guard.

**Wave structure:**
- Wave 1: 10-01 (audit+remediate) AND 10-02 (convention doc) in parallel — different file sets, no overlap

## Files Touched

**10-01 (audit+remediate):**
- WRITE: `.planning/objectives/10-phase-e-agent-audit/10-RESEARCH.md` (audit table)
- MODIFY: `plugins/devflow/devflow/workflows/diagnose-issues.md`
- MODIFY: `plugins/devflow/devflow/workflows/security-audit.md`
- MODIFY: `plugins/devflow/devflow/workflows/plan-objective.md`
- MODIFY: `plugins/devflow/devflow/workflows/execute-objective.md`
- MODIFY: `plugins/devflow/devflow/workflows/discuss-objective.md` (no — this one is DOCUMENT, not switch)
- MODIFY: `plugins/devflow/devflow/workflows/quick.md`
- MODIFY: `plugins/devflow/devflow/workflows/new-project.md`

**10-02 (convention doc):**
- WRITE: `docs/agent-spawning-convention.md`

## Verification Approach

**For switches:** `grep -rn "subagent_type" plugins/devflow/devflow/workflows/` after the pass should show:
- Zero `general-purpose` in switch sites
- Each switched site uses the agent name from the audit table
- The 4 DOCUMENT sites still use `general-purpose` (workflow invocations are legitimate generic)
- All previously-correct sites unchanged

**For convention doc:** `docs/agent-spawning-convention.md` exists, contains the rule statement, lists all 12 dedicated agents with one-line role + when-to-use, and shows 1-2 worked examples.

**Smoke test:** No automated workflow test suite covers Task(subagent_type=...) wiring. Visual grep + spot-check that switched-site prompts still resolve (`@~/.claude/agents/{agent}.md` references).

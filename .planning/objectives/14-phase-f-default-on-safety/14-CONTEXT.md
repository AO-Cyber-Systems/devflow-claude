---
objective: 14-phase-f-default-on-safety
github_issue: AO-Cyber-Systems/devflow-claude#31
parent_issue: AO-Cyber-Systems/devflow-claude#25
work: enhancement
---

# Phase F — Default-on safety nets: Context

## What this objective does

Flip currently opt-in safety features to default-on under Plan B's ambient model. The features already exist; they should be in the default path (opt-out, not opt-in). Session analysis confirms the underused features are not low-value — they are buried behind explicit flags.

## Why now

Phase D (objective 11) landed the verifier wiring fix on 2026-05-06 — `/devflow:build` § 8 now spawns `df-verifier` as a backstop with regression tests. F4 (verifier always runs post-build) is therefore already structurally satisfied; F4 in this objective is only an acceptance check, not net-new work. With D shipped, the rest of Phase F can land without blocking.

Phase E (objective 10) closed the agent-spawning audit and codified the convention. With both D and E complete, defaulting more features on no longer risks fan-out into the wrong agents.

## Scope (locked from issue #31)

### F1 — job-checker default-on with cheap CLI fast path

- Today: `job_checker_enabled: false` in `plugins/devflow/devflow/templates/config.json` (NOTE: actually already `true` in installed config — see RESEARCH.md acceptance check; we still need to update the template default).
- Add `df-tools verify trd-pre <objective>` cheap subcommand. Pure-logic checks; no agent spawn. Target: ~1k tokens, <2s run.
- Mechanical dimensions: requirement coverage, task completeness, dependency cycles, scope counts (per-TRD task count, per-objective TRD count).
- Full `df-job-checker` agent only spawns if cheap CLI flags issues that need LLM judgment (must-haves derivation quality, context compliance, semantic specificity).

### F2 — Research auto-trigger on novel domains

- Today: `/devflow:research-objective` is manual.
- New: planner detects "novel domain" signals during plan-objective:
  - New external dependency (in objective description) not in `package.json`
  - No existing patterns in `.planning/codebase/PATTERNS.md` matching the objective domain (or PATTERNS.md missing entirely)
  - Objective description contains comparison keywords ("evaluate", "compare", "choose between")
- When detected, planner auto-spawns `df-objective-researcher` before generating TRDs.
- `--skip-research` flag disables.

### F3 — Brownfield codebase map detector (helper now, hook later)

- Pure-logic detector helper now: `df-tools detect brownfield-map <cwd>` returns whether `.planning/` exists, whether `.planning/codebase/` is missing, and whether project has substantial code (> threshold of source files).
- The SessionStart hook integration in `classify-session.js` is **deferred to Phase A** (objective for #26). This objective ships only the detector helper plus tests.

### F4 — Verifier always runs post-build (acceptance check)

- **Already satisfied by Phase D / objective 11.** `build.md` § 8 spawns `Task(subagent_type="verifier", model="{verifier_model}")` unconditionally with regression tests guarding the wiring (see `df-tools.test.cjs` Phase D test block).
- This objective only verifies the acceptance criteria. No build.md edits.

### F5 — Drop confidence scoring per TRD

- Per session analysis, confidence scoring rarely affects execution behavior — most TRDs end up `high`.
- Remove the `confidence` field from the **TRD frontmatter required schema** (planner emits it less, frontmatter validate stops requiring it).
- Remove confidence-based branching in `executor.md` `<step name="execute_tasks">` (currently lines 64-71).
- Remove confidence-based model overrides in `references/auto-behaviors.md`.
- **Replace** with explicit per-task `caution` attribute: `<task type="auto" caution="pause-before-destructive">` — opt-in only, narrow semantics (single allowed value: `pause-before-destructive`).
- **Back-compat:** in-flight TRDs that still have `confidence` in frontmatter must continue to parse without error. Validator must accept presence of `confidence` (just no longer require it). Executor must not error if `confidence` is absent OR present.
- **NOT in scope:** the job-checker confidence-scoring (1-10 plan-quality scale) is a different feature and stays.

## Out of scope (deferred)

- F3 SessionStart hook integration → Phase A (#26)
- Bidirectional GH sync of objective state → v1.2 obj 12
- Workflow-impediment fixes (df-tools init --branch) → v1.2 obj 13

## Dependencies

- Phase D (objective 11) — complete 2026-05-06 ✓
- Phase E (objective 10) — must be complete before Wave 2 of this objective lands (verified)

## Acceptance criteria (issue #31)

- [ ] `config.json` template has `job_checker_enabled: true`
- [ ] `df-tools verify trd-pre` runs in <2s, returns structured JSON results
- [ ] Cheap checker covers requirement coverage, task completeness, dependency cycles, scope counts
- [ ] Novel-domain detector returns structured signal that planner can auto-trigger on
- [ ] Brownfield map detector helper ships (Phase A integration deferred — not blocking)
- [ ] Build → verifier rate proven via existing Phase D regression test (acceptance check, not new work)
- [ ] Confidence frontmatter field removed from required schema
- [ ] In-flight TRDs with `confidence:` still parse (back-compat preserved)
- [ ] Per-task `caution` attribute parsed by executor
- [ ] All 1471 tests still pass after the change

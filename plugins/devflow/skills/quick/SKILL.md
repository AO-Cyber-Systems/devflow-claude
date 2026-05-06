---
name: quick
description: |
  Small features (single executor, no planner, no verifier) — between micro (1-line) and build (multi-subsystem). Cutoff: <5 files, <200 LOC, no new abstractions.
  Use when the change is too big for /devflow:micro but doesn't warrant full /devflow:build planning.
  Triggers on: "small change", "small feature", "5-file change", "isolated bug fix", "do this", "tackle this", "make a quick pass"
argument-hint: "[--full]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
---
<objective>
Execute small features with DevFlow guarantees (atomic commits, STATE.md tracking) at the small-feature tier of the DevFlow ladder.

**Cutoff (advisory, enforced by convention):**
- <5 files modified
- <200 LOC changed
- No new abstractions, no architectural decisions, no new external dependencies

**Smaller? Use `/devflow:micro`** — sub-30-LOC, single-file, ~2k token cost.
**Larger or multi-subsystem? Use `/devflow:build`** — full plan/execute/verify pipeline.

Quick mode is the same system with a shorter path:
- Spawns planner (quick mode) + executor(s)
- Quick tasks live in `.planning/quick/` separate from planned objectives
- Updates STATE.md "Quick Tasks Completed" table (NOT ROADMAP.md)

**Default:** Skips research, job-checker, verifier. Use when you know exactly what to do.

**`--full` flag:** Enables job-checking (max 2 iterations) and post-execution verification. Use when you want quality guarantees without full milestone ceremony.

**Intent defaults for quick mode:** `work: bugfix` (smallest TDD posture commensurate with quick's purpose). CLAUDE.md absorption is **skipped** — quick mode honors the no-ceremony promise rather than applying user playbook directives that would require strict TDD on a typo fix. To opt back into the user playbook, prefer `/devflow:build` or `/devflow:plan-objective --work <type>` instead.
</objective>

<execution_context>
@~/.claude/devflow/workflows/quick.md
</execution_context>

<context>
@.planning/STATE.md
$ARGUMENTS
</context>

<process>
Execute the quick workflow from @~/.claude/devflow/workflows/quick.md end-to-end.
Preserve all workflow gates (validation, task description, planning, execution, state updates, commits).
</process>

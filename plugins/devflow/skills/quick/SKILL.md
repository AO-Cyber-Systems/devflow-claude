---
name: quick
description: |
  Do a small task quickly with clean git commits and progress tracking, without full project ceremony.
  Use when the user wants to do something small, quick, or ad-hoc without full objective ceremony.
  Triggers on: "quickly do", "just do this", "small task", "quick change", "quick fix", "can you just"
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
Execute small, ad-hoc tasks with DevFlow guarantees (atomic commits, STATE.md tracking).

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

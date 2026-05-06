---
name: micro
description: |
  Sub-30-LOC, single-file changes. The cheapest DevFlow path (~2k tokens). Use for typo fixes, single-line bug fixes, prop renames, dependency bumps, missing semicolons.
  Triggers on: "fix typo", "rename X to Y", "1-line fix", "single-file change", "tiny", "trivial"
argument-hint: "<description>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---
<objective>
Execute sub-30-LOC, single-file changes with atomic-commit guarantees and STATE.md tracking, in a single context window.

Micro is the FLOOR of the DevFlow ladder:
- No planner, no executor, no verifier — Claude makes the edit inline
- No JOB.md, no TRD.md, no SUMMARY.md
- No CLAUDE.md / playbook absorption (mirrors /devflow:quick's no-ceremony posture)
- Commit format: `chore(micro): {description}`
- STATE.md "Quick Tasks Completed" table receives an entry on commit

Cost target: ~2k tokens (skill body + df-tools output). For changes that exceed sub-30-LOC or touch multiple files, prefer /devflow:quick (<5 files, <200 LOC) or /devflow:build (multi-file features).
</objective>

<execution_context>
@~/.claude/devflow/workflows/micro.md
</execution_context>

<context>
@.planning/STATE.md
$ARGUMENTS
</context>

<process>
Execute the micro workflow from @~/.claude/devflow/workflows/micro.md end-to-end.
Honour the no-ceremony promise: no agent spawns, no SUMMARY.md, no planning artefacts.
</process>

---
name: df:remove-phase
description: |
  Remove a future phase from roadmap and renumber subsequent phases.
  Destructive operation — permanently removes phase and renumbers.
argument-hint: <phase-number>
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---
<objective>
Remove an unstarted future phase from the roadmap and renumber all subsequent phases to maintain a clean, linear sequence.

Purpose: Clean removal of work you've decided not to do, without polluting context with cancelled/deferred markers.
Output: Phase deleted, all subsequent phases renumbered, git commit as historical record.
</objective>

<execution_context>
@~/.claude/devflow/workflows/remove-phase.md
</execution_context>

<context>
Phase: $ARGUMENTS

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
Execute the remove-phase workflow from @~/.claude/devflow/workflows/remove-phase.md end-to-end.
Preserve all validation gates (future phase check, work check), renumbering logic, and commit.
</process>

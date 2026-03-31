---
name: cleanup
description: |
  Archive old objective directories from completed milestones to reduce clutter.
  Moves completed work to the milestones archive — use only when explicitly requested.
disable-model-invocation: true
---
<objective>
Archive objective directories from completed milestones into `.planning/milestones/v{X.Y}-objectives/`.

Use when `.planning/objectives/` has accumulated directories from past milestones.
</objective>

<execution_context>
@~/.claude/devflow/workflows/cleanup.md
</execution_context>

<process>
Follow the cleanup workflow at @~/.claude/devflow/workflows/cleanup.md.
Identify completed milestones, show a dry-run summary, and archive on confirmation.
</process>

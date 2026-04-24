---
name: plan-milestone-gaps
description: |
  Turn gaps found by milestone audit into new objectives that close them.
  Runs after audit-milestone to create fix objectives in the roadmap.
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---
<objective>
Create all objectives necessary to close gaps identified by `/devflow:audit-milestone`.

Reads MILESTONE-AUDIT.md, groups gaps into logical objectives, creates objective entries in ROADMAP.md, and offers to plan each objective.

One command creates all fix objectives — no manual `/devflow:add-objective` per gap.
</objective>

<execution_context>
@~/.claude/devflow/workflows/plan-milestone-gaps.md
</execution_context>

<context>
**Audit results:**
Glob: .planning/v*-MILESTONE-AUDIT.md (use most recent)

**Original intent (for prioritization):**
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md

**Current state:**
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
Execute the job-milestone-gaps workflow from @~/.claude/devflow/workflows/plan-milestone-gaps.md end-to-end.
Preserve all workflow gates (audit loading, prioritization, objective grouping, user confirmation, roadmap updates).
</process>

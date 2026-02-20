---
name: df:plan-phase
description: |
  Create detailed phase plan (PLAN.md) with verification loop.
  Use when the user wants to plan a phase, create execution plans, or prepare for building.
  Triggers on: "plan phase", "create plans", "plan the next phase", "let's plan", "prepare phase", "make plans for"
argument-hint: "[phase] [--auto] [--research] [--skip-research] [--gaps] [--skip-verify]"
agent: df-planner
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - mcp__context7__*
---
<objective>
Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research and verification.

**Default flow:** Research (if needed) → Plan → Verify → Done

**Orchestrator role:** Parse arguments, validate phase, research domain (unless skipped), spawn df-planner, verify with df-plan-checker, iterate until pass or max iterations, present results.
</objective>

<execution_context>
@~/.claude/devflow/workflows/plan-phase.md
@~/.claude/devflow/references/ui-brand.md
</execution_context>

<context>
Phase number: $ARGUMENTS (optional — auto-detects next unplanned phase if omitted)

**Flags:**
- `--research` — Force re-research even if RESEARCH.md exists
- `--skip-research` — Skip research, go straight to planning
- `--gaps` — Gap closure mode (reads VERIFICATION.md, skips research)
- `--skip-verify` — Skip verification loop

Normalize phase input in step 2 before any directory lookups.
</context>

<process>
Execute the plan-phase workflow from @~/.claude/devflow/workflows/plan-phase.md end-to-end.
Preserve all workflow gates (validation, research, planning, verification loop, routing).
</process>

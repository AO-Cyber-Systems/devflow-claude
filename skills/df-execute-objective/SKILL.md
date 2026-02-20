---
name: df:execute-phase
description: |
  Execute all plans in a phase with wave-based parallelization.
  Use when the user wants to build, run, or execute a planned phase.
  Triggers on: "execute phase", "run phase", "build phase", "start building", "run the plans", "let's build"
argument-hint: "<phase-number> [--gaps-only]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - TaskCreate
  - AskUserQuestion
---
<objective>
Execute all plans in a phase using wave-based parallel execution.

Orchestrator stays lean: discover plans, analyze dependencies, group into waves, spawn subagents, collect results. Each subagent loads the full execute-plan context and handles its own plan.

Context budget: ~15% orchestrator, 100% fresh per subagent.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-phase.md
@~/.claude/devflow/references/ui-brand.md
</execution_context>

<context>
Phase: $ARGUMENTS

**Flags:**
- `--gaps-only` — Execute only gap closure plans (plans with `gap_closure: true` in frontmatter). Use after verify-work creates fix plans.

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
Execute the execute-phase workflow from @~/.claude/devflow/workflows/execute-phase.md end-to-end.
Preserve all workflow gates (wave execution, checkpoint handling, verification, state updates, routing).
</process>

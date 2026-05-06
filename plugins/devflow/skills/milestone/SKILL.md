---
name: milestone
description: |
  Manage milestones: start a new one, audit a finished one, complete it, or plan gap-closure objectives.
  Subcommand-style: /devflow:milestone new | audit | complete | gaps
  Use when explicitly requested.
argument-hint: "<new|audit|complete|gaps> [args...]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - AskUserQuestion
  - Glob
  - Grep
---

<objective>
Manage milestones in the current project. Routes by first argument:
- `new [name]` — Start the next development cycle (questioning → research → requirements → roadmap)
- `audit [version]` — Verify a milestone achieved its definition of done
- `complete <version>` — Archive milestone and tag git release
- `gaps` — Turn audit gaps into new objectives that close them

Replaces 4 sibling skills: new-milestone, audit-milestone, complete-milestone, plan-milestone-gaps.
</objective>

<execution_context>
@~/.claude/devflow/workflows/new-milestone.md
@~/.claude/devflow/workflows/audit-milestone.md
@~/.claude/devflow/workflows/complete-milestone.md
@~/.claude/devflow/workflows/plan-milestone-gaps.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/PROJECT.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/devflow/bin/df-tools.cjs skill-route milestone $ARGUMENTS --raw)
```

Parse the JSON. If it contains `error`, display `usage` and stop. Otherwise extract `subcommand`, `args`, and `workflow`.

**2. Follow the resolved workflow.**

Based on `subcommand`:
- `new` → execute new-milestone workflow with residual args (the name, if provided)
- `audit` → execute audit-milestone workflow with residual args (the version, if provided)
- `complete` → execute complete-milestone workflow with residual args (the version, REQUIRED)
- `gaps` → execute plan-milestone-gaps workflow with residual args

Pass residual `args` to the workflow as `$ARGUMENTS`.
</process>

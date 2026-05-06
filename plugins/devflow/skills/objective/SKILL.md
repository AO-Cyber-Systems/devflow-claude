---
name: objective
description: |
  Add, insert, or remove an objective from the current milestone roadmap.
  Subcommand-style: /devflow:objective add | insert | remove
  Use when explicitly requested.
argument-hint: "<add|insert|remove> [args...]"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

<objective>
Manage objectives in the current milestone roadmap. Routes by first argument:
- `add <description>` — Add a new integer objective to the end of the milestone
- `insert <after> <description>` — Insert a decimal objective for urgent work
- `remove <number>` — Remove an unstarted objective and renumber siblings

Replaces 3 sibling skills: add-objective, insert-objective, remove-objective.
</objective>

<execution_context>
@~/.claude/devflow/workflows/add-objective.md
@~/.claude/devflow/workflows/insert-objective.md
@~/.claude/devflow/workflows/remove-objective.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/devflow/bin/df-tools.cjs skill-route objective $ARGUMENTS --raw)
```

Parse the JSON. If it contains `error`, display the `usage` field to the user and stop. Otherwise extract `subcommand`, `args`, and `workflow`.

**2. Follow the resolved workflow.**

Based on `subcommand`:
- `add` → execute the add-objective workflow loaded above with the residual args
- `insert` → execute the insert-objective workflow with the residual args
- `remove` → execute the remove-objective workflow with the residual args

Pass residual `args` to the workflow as if the user had typed them.

**3. Display deprecation summary if invoked via redirect** (handled by redirect skills; this consolidated skill does not log deprecation itself).
</process>

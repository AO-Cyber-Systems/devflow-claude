---
name: objective
description: |
  Add or remove an objective from the current milestone roadmap.
  Subcommand-style: /devflow:objective add | remove
  Use when explicitly requested.
  Note: 'insert' (decimal objectives) was removed in v1.2 — use 'add' instead.
argument-hint: "<add|remove> [args...]"
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
- `remove <number>` — Remove an unstarted objective and renumber siblings

Replaces 3 sibling skills: add-objective, insert-objective, remove-objective.
Note: decimal objectives (insert) were removed in v1.2 (TRD 12-06, I2 survey: 0% usage).
</objective>

<execution_context>
@~/.claude/devflow/workflows/add-objective.md
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
- `remove` → execute the remove-objective workflow with the residual args

Pass residual `args` to the workflow as if the user had typed them.

**3. Display deprecation summary if invoked via redirect** (handled by redirect skills; this consolidated skill does not log deprecation itself).
</process>

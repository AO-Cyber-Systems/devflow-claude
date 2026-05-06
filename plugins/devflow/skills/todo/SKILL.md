---
name: todo
description: |
  Manage todos: capture an idea/task or view the morning standup across local + GitHub + peer sources.
  Subcommand-style: /devflow:todo add | list
  Use when the user wants to save something for later, note an idea, or get a "what should I work on?" view.
  Triggers on: "remember to", "add a todo", "save this idea", "what should I work on?", "morning standup", "check todos".
argument-hint: "<add|list> [args...]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
Manage todos. Routes by first argument:
- `add [description]` — Capture an idea/task from current conversation
- `list [--all|--lane|--refresh|--raw]` — Morning standup view across 5 sources

Replaces 2 sibling skills: add-todo, check-todos.
</objective>

<execution_context>
@~/.claude/devflow/workflows/add-todo.md
@~/.claude/devflow/workflows/check-todos.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

@.planning/STATE.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/devflow/bin/df-tools.cjs skill-route todo $ARGUMENTS --raw)
```

Parse JSON. If `error`, display `usage` and stop. Otherwise extract `subcommand`, `args`, and `workflow`.

**2. Follow resolved workflow:**

Based on `subcommand`:
- `add` → execute add-todo workflow with residual args
- `list` → execute check-todos workflow with residual args (passes `--all`, `--lane`, etc. through)

Pass residual `args` to the workflow as if the user had typed them.
</process>

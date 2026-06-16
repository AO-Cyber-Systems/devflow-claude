---
name: status
description: |
  Consolidated status/resume/pause/health — `/devflow:status [resume|pause|check]`.
  Default: show progress + route to next action. Subcommands: check (integrity), pause (save context), resume (restore context). Both flag and bare forms accepted.
  Triggers on: "where are we?", "what's next?", "save my progress", "pick up where we left off".
argument-hint: "[check | pause | resume]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - AskUserQuestion
  - SlashCommand
---

<objective>
Project status, health checks, and work continuity. Routes by first argument:
- (no arg) — Show progress + route to next action
- `check` or `--check` — Validate `.planning/` integrity, fix issues
- `pause` or `--pause` — Save context to `.continue-here.md` for later resumption
- `resume` or `--resume` — Restore project context, pick up where you left off

Replaces 4 sibling skills: progress, health, pause-work, resume-work.

## Subcommand Reference

Both flag and bare forms are accepted interchangeably:

| Bare form | Flag form | Behavior |
|---|---|---|
| (no arg) | — | Show progress + intelligently route to next action |
| `check` | `--check` | Validate `.planning/` integrity; fix issues. Accepts `--repair`, `--migrate`, `--dry-run`. |
| `pause` | `--pause` | Save current context to `.continue-here.md` for later resumption |
| `resume` | `--resume` | Restore project context and pick up where you left off |

Use when the user asks: "where are we?", "what's the status?", "show progress", "what's next?", "is the project healthy?", "I need to stop", "save my progress", "let's continue", "pick up where we left off", "resume".
</objective>

<execution_context>
@~/.claude/devflow/workflows/progress.md
@~/.claude/devflow/workflows/health.md
@~/.claude/devflow/workflows/pause-work.md
@~/.claude/devflow/workflows/resume-project.md
</execution_context>

<context>
Subcommand: $ARGUMENTS

@.planning/STATE.md
</context>

<process>
**1. Resolve subcommand and workflow:**

```bash
ROUTE_JSON=$(node ~/.claude/devflow/bin/df-tools.cjs skill-route status $ARGUMENTS --raw)
```

Parse JSON. If `error`, display `usage` and stop. Otherwise extract `subcommand`, `args`, and `workflow`.

**2. Follow resolved workflow:**

Based on `subcommand`:
- `null` (default, no subcommand) — execute progress workflow
- `check` — execute health workflow with residual args (e.g., `--repair`, `--migrate`, `--dry-run`)
- `pause` — execute pause-work workflow
- `resume` — execute resume-project workflow

Pass residual `args` to the workflow as if the user had typed them.
</process>

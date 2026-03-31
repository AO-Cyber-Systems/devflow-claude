---
name: build
description: |
  Build a feature from start to finish — plans the work, executes it, and verifies the result in one command.
  Use when the user wants to build something, implement a feature, or work on an objective end-to-end.
  Triggers on: "build this", "build objective", "let's build", "implement this", "ship this", "make this work", "build the", "work on objective", "start building", "let's implement"
argument-hint: "<objective-number-or-description> [--pause] [--skip-research]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, TaskCreate, TaskUpdate, TaskList, AskUserQuestion, EnterPlanMode, ExitPlanMode
---

<objective>
Build an objective from start to finish: research → plan → execute → verify → done.

This is the primary way to build with DevFlow. One command, shipped code.

Usage:
- `/build 3` — Build objective 3 from the roadmap
- `/build "add user authentication"` — Build from description (creates temporary objective if no match)
- `/build 3 --pause` — Stop between phases for review
- `/build 3 --skip-research` — Skip research phase
</objective>

<execution_context>
@~/.claude/devflow/workflows/build.md
@~/.claude/devflow/references/ui-brand.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/config.json
</context>

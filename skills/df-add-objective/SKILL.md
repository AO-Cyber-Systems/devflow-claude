---
name: df:add-phase
description: |
  Add phase to end of current milestone in roadmap.
  Structural roadmap modification — use only when explicitly requested.
argument-hint: <description>
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Add a new integer phase to the end of the current milestone in the roadmap.

Routes to the add-phase workflow which handles:
- Phase number calculation (next sequential integer)
- Directory creation with slug generation
- Roadmap structure updates
- STATE.md roadmap evolution tracking
</objective>

<execution_context>
@.planning/ROADMAP.md
@.planning/STATE.md
@~/.claude/devflow/workflows/add-phase.md
</execution_context>

<process>
**Follow the add-phase workflow** from `@~/.claude/devflow/workflows/add-phase.md`.

The workflow handles all logic including:
1. Argument parsing and validation
2. Roadmap existence checking
3. Current milestone identification
4. Next phase number calculation (ignoring decimals)
5. Slug generation from description
6. Phase directory creation
7. Roadmap entry insertion
8. STATE.md updates
</process>

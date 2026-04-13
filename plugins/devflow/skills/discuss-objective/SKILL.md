---
name: discuss-objective
description: |
  Capture implementation decisions for an objective before planning — lock in preferences so research and planning don't drift into assumptions.
  Use when the user wants to shape how an objective gets built before tasks are generated.
  Triggers on: "discuss objective", "shape the objective", "lock in preferences", "before planning I want to discuss", "implementation decisions"
argument-hint: "<objective-number>"
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
---
<objective>
Extract implementation decisions that downstream agents (objective-researcher, planner) need. Surface the gray areas in the objective, let the user pick what to discuss, then deep-dive until decisions are crisp enough to act on.

**Output:** `.planning/objectives/<obj>/CONTEXT.md` — captures decisions about layout, data, UX, dependencies, and explicit "Claude's Discretion" items. Feeds directly into research queries and planner task specs.

**Not the job:** figuring out HOW to implement. That happens in research + planning using the decisions captured here.
</objective>

<execution_context>
@~/.claude/devflow/workflows/discuss-objective.md
@~/.claude/devflow/references/questioning.md
</execution_context>

<process>
Execute the discuss-objective workflow end-to-end. Write CONTEXT.md when decisions are locked. Do not proceed to planning — the user runs `/devflow:plan-objective <N>` when ready.
</process>

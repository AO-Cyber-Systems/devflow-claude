---
name: set-profile
description: |
  Switch between quality, balanced, and budget model profiles to control cost and capability.
  Use when the user wants to change the AI model tier for DevFlow agents.
  Triggers on: "change profile", "switch to quality", "switch to balanced", "switch to budget", "set profile"
argument-hint: <profile>
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Switch the model profile used by DevFlow agents. Controls which Claude model each agent uses, balancing quality vs token spend.

Routes to the set-profile workflow which handles:
- Argument validation (quality/balanced/budget)
- Config file creation if missing
- Profile update in config.json
- Confirmation with model table display
</objective>

<execution_context>
@~/.claude/devflow/workflows/set-profile.md
</execution_context>

<process>
**Follow the set-profile workflow** from `@~/.claude/devflow/workflows/set-profile.md`.

The workflow handles all logic including:
1. Profile argument validation
2. Config file ensuring
3. Config reading and updating
4. Model table generation from MODEL_PROFILES
5. Confirmation display
</process>

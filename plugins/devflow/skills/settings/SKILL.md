---
name: settings
description: |
  Configure which agents run, which AI models they use, and how the workflow behaves.
  Use when the user wants to change DevFlow settings or configure workflow behavior.
  Triggers on: "change settings", "configure DevFlow", "update settings", "workflow settings"
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
Interactive configuration of DevFlow workflow agents and model profile via multi-question prompt.

Routes to the settings workflow which handles:
- Config existence ensuring
- Current settings reading and parsing
- Interactive prompt (model, mode, research, job_check, verifier, branching)
- Config merging and writing
- Confirmation display with quick command references
</objective>

<execution_context>
@~/.claude/devflow/workflows/settings.md
</execution_context>

<process>
**Follow the settings workflow** from `@~/.claude/devflow/workflows/settings.md`.

The workflow handles all logic including:
1. Config file creation with defaults if missing
2. Current config reading
3. Interactive settings presentation with pre-selection
4. Answer parsing and config merging
5. File writing
6. Confirmation display

**Mode configuration** — include a mode question presenting all three options:

```
AskUserQuestion({
  question: "Execution mode?",
  header: "Mode",
  multiSelect: false,
  options: [
    { label: "Interactive (Default)", description: "All checkpoints present to user" },
    { label: "Yolo", description: "Human-verify auto-approved, decisions auto-select first option (legacy)" },
    { label: "Autonomous", description: "Machine-verified checkpoints, parked decisions, auto-resume (mode: autonomous) — see unattended-operation runbook" }
  ]
})
```

Write the selected mode with:

```bash
node ~/.claude/devflow/bin/df-tools.cjs config-set mode <interactive|yolo|autonomous>
```

When the user selects **Autonomous**, display a pointer after saving:

```
Autonomous mode enabled. For overnight/headless setup see:
@~/.claude/devflow/references/unattended-operation.md
```
</process>

<purpose>
Interactive configuration of DevFlow workflow agents (research, job_check, verifier) and model profile selection via multi-question prompt. Updates .planning/config.json with user preferences. Optionally saves settings as global defaults (~/.devflow/defaults.json) for future projects.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="ensure_and_load_config">
Ensure config exists and load current state:

```bash
node ~/.claude/devflow/bin/df-tools.cjs config-ensure-section
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs state load)
```

Creates `.planning/config.json` with defaults if missing and loads current config values.
</step>

<step name="read_current">
```bash
cat .planning/config.json
```

Parse current values (default to `true` if not present):
- `workflow.research` — spawn researcher during plan-objective
- `workflow.job_check` — spawn job checker during plan-objective
- `workflow.verifier` — spawn verifier during execute-objective
- `model_profile` — which model each agent uses (default: `balanced`)
- `git.branching_strategy` — branching approach (default: `"none"`)
</step>

<step name="present_settings">
Use AskUserQuestion with current values pre-selected:

```
AskUserQuestion([
  {
    question: "Which model profile for agents?",
    header: "Model",
    multiSelect: false,
    options: [
      { label: "Quality", description: "Opus everywhere except verification (highest cost)" },
      { label: "Balanced (Recommended)", description: "Opus for planning, Sonnet for execution/verification" },
      { label: "Budget", description: "Sonnet for writing, Haiku for research/verification (lowest cost)" }
    ]
  },
  {
    question: "Spawn Plan Researcher? (researches domain before planning)",
    header: "Research",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Research objective goals before planning" },
      { label: "No", description: "Skip research, plan directly" }
    ]
  },
  {
    question: "Spawn Plan Checker? (verifies plans before execution)",
    header: "Plan Check",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify plans meet objective goals" },
      { label: "No", description: "Skip plan verification" }
    ]
  },
  {
    question: "Spawn Execution Verifier? (verifies objective completion)",
    header: "Verifier",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify must-haves after execution" },
      { label: "No", description: "Skip post-execution verification" }
    ]
  },
  {
    question: "Auto-advance pipeline? (discuss → plan → execute automatically)",
    header: "Auto",
    multiSelect: false,
    options: [
      { label: "No (Recommended)", description: "Manual /clear + paste between stages" },
      { label: "Yes", description: "Chain stages via Task() subagents (same isolation)" }
    ]
  },
  {
    question: "Git branching strategy?",
    header: "Branching",
    multiSelect: false,
    options: [
      { label: "None (Recommended)", description: "Commit directly to current branch" },
      { label: "Per Objective", description: "Create branch for each objective (df/phase-{N}-{name})" },
      { label: "Per Milestone", description: "Create branch for entire milestone (df/{version}-{name})" }
    ]
  }
])
```
</step>

<step name="update_config">
Merge new settings into existing config.json:

```json
{
  ...existing_config,
  "model_profile": "quality" | "balanced" | "budget",
  "workflow": {
    "research": true/false,
    "job_check": true/false,
    "verifier": true/false,
    "auto_advance": true/false
  },
  "git": {
    "branching_strategy": "none" | "objective" | "milestone"
  }
}
```

Write updated config to `.planning/config.json`.
</step>

<step name="save_as_defaults">
Ask whether to save these settings as global defaults for future projects:

```
AskUserQuestion([
  {
    question: "Save these as default settings for all new projects?",
    header: "Defaults",
    multiSelect: false,
    options: [
      { label: "Yes", description: "New projects start with these settings (saved to ~/.devflow/defaults.json)" },
      { label: "No", description: "Only apply to this project" }
    ]
  }
])
```

If "Yes": write the same config object (minus project-specific fields like `brave_search`) to `~/.devflow/defaults.json`:

```bash
mkdir -p ~/.devflow
```

Write `~/.devflow/defaults.json` with:
```json
{
  "mode": <current>,
  "depth": <current>,
  "model_profile": <current>,
  "commit_docs": <current>,
  "parallelization": <current>,
  "branching_strategy": <current>,
  "workflow": {
    "research": <current>,
    "job_check": <current>,
    "verifier": <current>,
    "auto_advance": <current>
  }
}
```
</step>

<step name="confirm">
Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► SETTINGS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Setting              | Value |
|----------------------|-------|
| Model Profile        | {quality/balanced/budget} |
| Plan Researcher      | {On/Off} |
| Plan Checker         | {On/Off} |
| Execution Verifier   | {On/Off} |
| Auto-Advance         | {On/Off} |
| Git Branching        | {None/Per Objective/Per Milestone} |
| Saved as Defaults    | {Yes/No} |

These settings apply to future /df:plan-objective and /df:execute-objective runs.

Quick commands:
- /df:set-profile <profile> — switch model profile
- /df:plan-objective --research — force research
- /df:plan-objective --skip-research — skip research
- /df:plan-objective --skip-verify — skip plan check
```
</step>

</process>

<success_criteria>
- [ ] Current config read
- [ ] User presented with 6 settings (profile + 4 workflow toggles + git branching)
- [ ] Config updated with model_profile, workflow, and git sections
- [ ] User offered to save as global defaults (~/.devflow/defaults.json)
- [ ] Changes confirmed to user
</success_criteria>

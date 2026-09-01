---
title: "File structure"
weight: 20
lede: "Quick lookup: what every file in .planning/ is, and what writes it."
---

## Project root

```text
.planning/
  PROJECT.md              vision, constraints, `kind` on frontmatter
  REQUIREMENTS.md         scoped v1/v2 requirements with stable IDs
  ROADMAP.md              objectives in dependency order, with checkboxes
  STATE.md                decisions, blockers, position, session history
  MILESTONES.md           archive of completed milestones
  SESSION_PICKUP.md       resume note written by `status pause`
  STATE_ARCHIVE.md        rolled-off state history
  config.json             workflow configuration
  state.json              machine-readable position mirror
```

## Subdirectories

```text
  research/               domain research (new-project)
  codebase/               brownfield mapping (map-codebase)
  todos/pending/          captured ideas
  todos/done/
  debug/                  active debug sessions
  debug/resolved/
  decisions/pending/      parked DECISION-NNN.md
  milestones/             archived milestone directories
  quick/                  quick-job records
```

## Per objective

```text
  objectives/NN-objective-name/
    OBJECTIVE.md          goal, success criteria, `work` on frontmatter
    CONTEXT.md            your preferences (discuss-objective)
    RESEARCH.md           ecosystem research (research-objective)
    NN-YY-JOB.md          atomic execution plan, one per job
    NN-YY-SUMMARY.md      execution outcome and evidence
    VERIFICATION.md       verification results
    UAT.md                acceptance walkthrough
    verification/         Maestro YAML flows, capture manifests
```

## Markers and caches

Rarely touched, but they explain otherwise-confusing behaviour.

| File | Written by | Purpose |
|---|---|---|
| `.skill-active` | `df-tools skill-active --start` | Its presence is what lets `gate-edits` allow edits. Carries `expires_at`, 8h default. |
| `.edit-override` | `route-intent` | Records an override phrase in your prompt. Single-turn, consumed by `gate-edits`. |
| `.gh-mapping.json` | `gh sync-objectives` | Objective number → GitHub issue number. **Commit this.** |
| `.migrate-backup-*/` | intent-model migration | Full backup taken before any migration writes |

## Outside the project

```text
~/.claude/devflow/
  bin/                    df-tools and its lib (mirrored from the plugin)
  workflows/              workflow bodies
  references/             runtime reference docs
  templates/              templates copied into projects
  defaults-table.md       your org-wide (kind, work) overrides, if created
  .plugin-version         mirror version marker
  audit.log               Stop-hook JSONL audit entries
  transcript-index.jsonl  transcript-export output

.devflow-handoff/
  pending/                queued interactive commands
  done/                   completed results awaiting injection

.claude/agent-memory/verifier/    accumulated verification patterns
```

## Templates

Files copied into `.planning/` by `df-tools template`:

| Template | Becomes |
|---|---|
| `project.md` | `PROJECT.md` |
| `requirements.md` | `REQUIREMENTS.md` |
| `roadmap.md` | `ROADMAP.md` |
| `state.md` / `state.json` | `STATE.md` / `state.json` |
| `config.json` | `config.json` |
| `objective.md` | `OBJECTIVE.md` |
| `job-prompt.md` | `NN-YY-JOB.md` |
| `summary.md` | `NN-YY-SUMMARY.md` |
| `verification-report.md` | `VERIFICATION.md` |
| `UAT.md` | `UAT.md` |
| `milestone.md` / `milestone-archive.md` | milestone docs |
| `DEBUG.md` | debug session records |
| `continue-here.md` | resume notes |
| `claude-md.md` | a project `CLAUDE.md` starter |

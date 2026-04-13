# DevFlow User Guide

A detailed reference for workflows, troubleshooting, and configuration. For quick-start setup, see the [README](../README.md).

---

## Table of Contents

- [Workflow Diagrams](#workflow-diagrams)
- [Command Reference](#command-reference)
- [Configuration Reference](#configuration-reference)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Recovery Quick Reference](#recovery-quick-reference)

---

## Workflow Diagrams

### Full Project Lifecycle

```
  ┌──────────────────────────────────────────────────┐
  │                   NEW PROJECT                    │
  │  /devflow:new-project                                │
  │  Questions -> Research -> Requirements -> Roadmap│
  └─────────────────────────┬────────────────────────┘
                            │
             ┌──────────────▼─────────────┐
             │      FOR EACH PHASE:       │
             │                            │
             │  ┌────────────────────┐    │
             │  │ /devflow:discuss-objective │    │  <- Lock in preferences
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /devflow:plan-objective    │    │  <- Research + Plan + Verify
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /devflow:execute-objective │    │  <- Parallel execution
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /devflow:verify-work   │    │  <- Manual UAT
             │  └──────────┬─────────┘    │
             │             │              │
             │     Next Objective?────────────┘
             │             │ No
             └─────────────┼──────────────┘
                            │
            ┌───────────────▼──────────────┐
            │  /devflow:audit-milestone        │
            │  /devflow:complete-milestone     │
            └───────────────┬──────────────┘
                            │
                   Another milestone?
                       │          │
                      Yes         No -> Done!
                       │
               ┌───────▼──────────────┐
               │  /devflow:new-milestone  │
               └──────────────────────┘
```

### Planning Agent Coordination

```
  /devflow:plan-objective N
         │
         ├── Objective Researcher (x4 parallel)
         │     ├── Stack researcher
         │     ├── Features researcher
         │     ├── Architecture researcher
         │     └── Pitfalls researcher
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   Planner   │  <- Reads PROJECT.md, REQUIREMENTS.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   Plan Checker   │────>│ PASS?  │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             Yes  │  No
         │                              │   │   │
         │                              │   └───┘  (loop, up to 3x)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ JOB files  │
         │                        └────────────┘
         └── Done
```

### Execution Wave Coordination

```
  /devflow:execute-objective N
         │
         ├── Analyze plan dependencies
         │
         ├── Wave 1 (independent plans):
         │     ├── Executor A (fresh 200K context) -> commit
         │     └── Executor B (fresh 200K context) -> commit
         │
         ├── Wave 2 (depends on Wave 1):
         │     └── Executor C (fresh 200K context) -> commit
         │
         └── Verifier
               └── Check codebase against objective goals
                     │
                     ├── PASS -> VERIFICATION.md (success)
                     └── FAIL -> Issues logged for /devflow:verify-work
```

### Brownfield Workflow (Existing Codebase)

```
  /devflow:map-codebase
         │
         ├── Stack Mapper     -> codebase/STACK.md
         ├── Arch Mapper      -> codebase/ARCHITECTURE.md
         ├── Convention Mapper -> codebase/CONVENTIONS.md
         └── Concern Mapper   -> codebase/CONCERNS.md
                │
        ┌───────▼──────────┐
        │ /devflow:new-project │  <- Questions focus on what you're ADDING
        └──────────────────┘
```

---

## Command Reference

### Core Workflow

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:new-project` | Full project init: questions, research, requirements, roadmap | Start of a new project |
| `/devflow:new-project --auto @idea.md` | Automated init from document | Have a PRD or idea doc ready |
| `/devflow:discuss-objective [N]` | Capture implementation decisions | Before planning, to shape how it gets built |
| `/devflow:plan-objective [N]` | Research + plan + verify | Before executing a objective |
| `/devflow:execute-objective <N>` | Execute all jobs in parallel waves | After planning is complete |
| `/devflow:verify-work [N]` | Manual UAT with auto-diagnosis | After execution completes |
| `/devflow:audit-milestone` | Verify milestone met its definition of done | Before completing milestone |
| `/devflow:complete-milestone` | Archive milestone, tag release | All objectives verified |
| `/devflow:new-milestone [name]` | Start next version cycle | After completing a milestone |

### Navigation

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:progress` | Show status and next steps | Anytime -- "where am I?" |
| `/devflow:resume-work` | Restore full context from last session | Starting a new session |
| `/devflow:pause-work` | Save context handoff | Stopping mid-objective |
| `/devflow:help` | Show all commands | Quick reference |
| `/devflow:update` | Update DevFlow with changelog preview | Check for new versions |
| `/devflow:join-discord` | Open Discord community invite | Questions or community |

### Objective Management

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:add-objective` | Append new objective to roadmap | Scope grows after initial planning |
| `/devflow:insert-objective [N]` | Insert urgent work (decimal numbering) | Urgent fix mid-milestone |
| `/devflow:remove-objective [N]` | Remove future objective and renumber | Descoping a feature |
| `/devflow:list-objective-assumptions [N]` | Preview Claude's intended approach | Before planning, to validate direction |
| `/devflow:plan-milestone-gaps` | Create objectives for audit gaps | After audit finds missing items |
| `/devflow:research-objective [N]` | Deep ecosystem research only | Complex or unfamiliar domain |

### Brownfield & Utilities

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:map-codebase` | Analyze existing codebase | Before `/devflow:new-project` on existing code |
| `/devflow:quick` | Ad-hoc task with DevFlow guarantees | Bug fixes, small features, config changes |
| `/devflow:debug [desc]` | Systematic debugging with persistent state | When something breaks |
| `/devflow:add-todo [desc]` | Capture an idea for later | Think of something during a session |
| `/devflow:check-todos` | List pending todos | Review captured ideas |
| `/devflow:settings` | Configure workflow toggles and model profile | Change model, toggle agents |
| `/devflow:set-profile <profile>` | Quick profile switch | Change cost/quality tradeoff |
| `/devflow:reapply-patches` | Restore local modifications after update | After `/devflow:update` if you had local edits |

---

## Configuration Reference

DevFlow stores project settings in `.planning/config.json`. Configure during `/devflow:new-project` or update later with `/devflow:settings`.

### Full config.json Schema

```json
{
  "mode": "interactive",
  "depth": "standard",
  "model_profile": "balanced",
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "workflow": {
    "research": true,
    "job_check": true,
    "verifier": true
  },
  "git": {
    "branching_strategy": "none",
    "objective_branch_template": "df/objective-{objective}-{slug}",
    "milestone_branch_template": "df/{milestone}-{slug}"
  }
}
```

### Core Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `mode` | `interactive`, `yolo` | `interactive` | `yolo` auto-approves decisions; `interactive` confirms at each step |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` | Planning thoroughness: 3-5, 5-8, or 8-12 objectives |
| `model_profile` | `quality`, `balanced`, `budget` | `balanced` | Model tier for each agent (see table below) |

### Planning Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `planning.commit_docs` | `true`, `false` | `true` | Whether `.planning/` files are committed to git |
| `planning.search_gitignored` | `true`, `false` | `false` | Add `--no-ignore` to broad searches to include `.planning/` |

> **Note:** If `.planning/` is in `.gitignore`, `commit_docs` is automatically `false` regardless of the config value.

### Workflow Toggles

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `workflow.research` | `true`, `false` | `true` | Domain investigation before planning |
| `workflow.job_check` | `true`, `false` | `true` | Plan verification loop (up to 3 iterations) |
| `workflow.verifier` | `true`, `false` | `true` | Post-execution verification against objective goals |

Disable these to speed up objectives in familiar domains or when conserving tokens.

### Git Branching

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `git.branching_strategy` | `none`, `objective`, `milestone` | `none` | When and how branches are created |
| `git.objective_branch_template` | Template string | `df/objective-{objective}-{slug}` | Branch name for objective strategy |
| `git.milestone_branch_template` | Template string | `df/{milestone}-{slug}` | Branch name for milestone strategy |

**Branching strategies explained:**

| Strategy | Creates Branch | Scope | Best For |
|----------|---------------|-------|----------|
| `none` | Never | N/A | Solo development, simple projects |
| `objective` | At each `execute-objective` | One objective per branch | Code review per objective, granular rollback |
| `milestone` | At first `execute-objective` | All objectives share one branch | Release branches, PR per version |

**Template variables:** `{objective}` = zero-padded number (e.g., "03"), `{slug}` = lowercase hyphenated name, `{milestone}` = version (e.g., "v1.0").

### Model Profiles (Per-Agent Breakdown)

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| df-planner | Opus | Opus | Sonnet |
| df-roadmapper | Opus | Sonnet | Sonnet |
| df-executor | Opus | Sonnet | Sonnet |
| df-objective-researcher | Opus | Sonnet | Haiku |
| df-project-researcher | Opus | Sonnet | Haiku |
| df-research-synthesizer | Sonnet | Sonnet | Haiku |
| df-debugger | Opus | Sonnet | Sonnet |
| df-codebase-mapper | Sonnet | Haiku | Haiku |
| df-verifier | Sonnet | Sonnet | Haiku |
| df-plan-checker | Sonnet | Sonnet | Haiku |
| df-integration-checker | Sonnet | Sonnet | Haiku |

**Profile philosophy:**
- **quality** -- Opus for all decision-making agents, Sonnet for read-only verification. Use when quota is available and the work is critical.
- **balanced** -- Opus only for planning (where architecture decisions happen), Sonnet for everything else. The default for good reason.
- **budget** -- Sonnet for anything that writes code, Haiku for research and verification. Use for high-volume work or less critical objectives.

---

## Usage Examples

### New Project (Full Cycle)

```bash
claude --dangerously-skip-permissions
/devflow:new-project            # Answer questions, configure, approve roadmap
/clear
/devflow:discuss-objective 1        # Lock in your preferences
/devflow:plan-objective 1           # Research + plan + verify
/devflow:execute-objective 1        # Parallel execution
/devflow:verify-work 1          # Manual UAT
/clear
/devflow:discuss-objective 2        # Repeat for each objective
...
/devflow:audit-milestone        # Check everything shipped
/devflow:complete-milestone     # Archive, tag, done
```

### New Project from Existing Document

```bash
/devflow:new-project --auto @prd.md   # Auto-runs research/requirements/roadmap from your doc
/clear
/devflow:discuss-objective 1               # Normal flow from here
```

### Existing Codebase

```bash
/devflow:map-codebase           # Analyze what exists (parallel agents)
/devflow:new-project            # Questions focus on what you're ADDING
# (normal objective workflow from here)
```

### Quick Bug Fix

```bash
/devflow:quick
> "Fix the login button not responding on mobile Safari"
```

### Resuming After a Break

```bash
/devflow:progress               # See where you left off and what's next
# or
/devflow:resume-work            # Full context restoration from last session
```

### Preparing for Release

```bash
/devflow:audit-milestone        # Check requirements coverage, detect stubs
/devflow:plan-milestone-gaps    # If audit found gaps, create objectives to close them
/devflow:complete-milestone     # Archive, tag, done
```

### Speed vs Quality Presets

| Scenario | Mode | Depth | Profile | Research | Plan Check | Verifier |
|----------|------|-------|---------|----------|------------|----------|
| Prototyping | `yolo` | `quick` | `budget` | off | off | off |
| Normal dev | `interactive` | `standard` | `balanced` | on | on | on |
| Production | `interactive` | `comprehensive` | `quality` | on | on | on |

### Mid-Milestone Scope Changes

```bash
/devflow:add-objective              # Append a new objective to the roadmap
# or
/devflow:insert-objective 3         # Insert urgent work between objectives 3 and 4
# or
/devflow:remove-objective 7         # Descope objective 7 and renumber
```

---

## Troubleshooting

### "Project already initialized"

You ran `/devflow:new-project` but `.planning/PROJECT.md` already exists. This is a safety check. If you want to start over, delete the `.planning/` directory first.

### Context Degradation During Long Sessions

Clear your context window between major commands: `/clear` in Claude Code. DevFlow is designed around fresh contexts -- every subagent gets a clean 200K window. If quality is dropping in the main session, clear and use `/devflow:resume-work` or `/devflow:progress` to restore state.

### Plans Seem Wrong or Misaligned

Run `/devflow:discuss-objective [N]` before planning. Most plan quality issues come from Claude making assumptions that `CONTEXT.md` would have prevented. You can also run `/devflow:list-objective-assumptions [N]` to see what Claude intends to do before committing to a plan.

### Execution Fails or Produces Stubs

Check that the plan was not too ambitious. Plans should have 2-3 tasks maximum. If tasks are too large, they exceed what a single context window can produce reliably. Re-plan with smaller scope.

### Lost Track of Where You Are

Run `/devflow:progress`. It reads all state files and tells you exactly where you are and what to do next.

### Need to Change Something After Execution

Do not re-run `/devflow:execute-objective`. Use `/devflow:quick` for targeted fixes, or `/devflow:verify-work` to systematically identify and fix issues through UAT.

### Model Costs Too High

Switch to budget profile: `/devflow:set-profile budget`. Disable research and plan-check agents via `/devflow:settings` if the domain is familiar to you (or to Claude).

### Working on a Sensitive/Private Project

Set `commit_docs: false` during `/devflow:new-project` or via `/devflow:settings`. Add `.planning/` to your `.gitignore`. Planning artifacts stay local and never touch git.

### DevFlow Update Overwrote My Local Changes

Since v1.17, the installer backs up locally modified files to `df-local-patches/`. Run `/devflow:reapply-patches` to merge your changes back.

### Subagent Appears to Fail but Work Was Done

A known workaround exists for a Claude Code classification bug. DevFlow's orchestrators (execute-objective, quick) spot-check actual output before reporting failure. If you see a failure message but commits were made, check `git log` -- the work may have succeeded.

---

## Recovery Quick Reference

| Problem | Solution |
|---------|----------|
| Lost context / new session | `/devflow:resume-work` or `/devflow:progress` |
| Phase went wrong | `git revert` the objective commits, then re-plan |
| Need to change scope | `/devflow:add-objective`, `/devflow:insert-objective`, or `/devflow:remove-objective` |
| Milestone audit found gaps | `/devflow:plan-milestone-gaps` |
| Something broke | `/devflow:debug "description"` |
| Quick targeted fix | `/devflow:quick` |
| Plan doesn't match your vision | `/devflow:discuss-objective [N]` then re-plan |
| Costs running high | `/devflow:set-profile budget` and `/devflow:settings` to toggle agents off |
| Update broke local changes | `/devflow:reapply-patches` |

---

## Project File Structure

For reference, here is what DevFlow creates in your project:

```
.planning/
  PROJECT.md              # Project vision and context (always loaded)
  REQUIREMENTS.md         # Scoped v1/v2 requirements with IDs
  ROADMAP.md              # Objective breakdown with status tracking
  STATE.md                # Decisions, blockers, session memory
  config.json             # Workflow configuration
  MILESTONES.md           # Completed milestone archive
  research/               # Domain research from /devflow:new-project
  todos/
    pending/              # Captured ideas awaiting work
    done/                 # Completed todos
  debug/                  # Active debug sessions
    resolved/             # Archived debug sessions
  codebase/               # Brownfield codebase mapping (from /devflow:map-codebase)
  objectives/
    XX-objective-name/
      XX-YY-JOB.md       # Atomic execution plans
      XX-YY-SUMMARY.md    # Execution outcomes and decisions
      CONTEXT.md          # Your implementation preferences
      RESEARCH.md         # Ecosystem research findings
      VERIFICATION.md     # Post-execution verification results
```

---

## Hooks and what they enforce

DevFlow installs hooks into Claude Code's `settings.json`. Hooks run in a separate process, get the tool call as JSON on stdin, and can inject context, warn the user, or block tool execution. They are how DevFlow turns advisory rules into actually-enforced ones.

| Hook | Event | What it does | Escape hatch |
|---|---|---|---|
| `route-intent.js` | UserPromptSubmit | Detects DevFlow projects (`.planning/`) and matches user intent against 13 categories (build, plan, verify, debug, gh-sync, ...). Injects a system reminder telling Claude to use the appropriate skill rather than editing code directly. | None — silent for non-DevFlow repos and explicit `/devflow:` invocations |
| `gate-commits.js` | PreToolUse (Bash) | Blocks raw `git commit` in DevFlow projects; demands `df-tools commit` so atomic per-task commits and STATE.md stay consistent. | `DEVFLOW_ALLOW_RAW_COMMIT=1` |
| `gate-edits.js` | PreToolUse (Edit/Write/MultiEdit) | When a TRD has `status: in-progress|planned|ready`, prompts the user before code edits outside the executor (permits `.planning/**` and `*.md`). | `DEVFLOW_STRICT_EDITS=1` upgrades from "ask" to hard "deny" |
| `changelog-on-tag.js` | PreToolUse (Bash) | Blocks `git tag -a vX.Y.Z` if `CHANGELOG.md` has no `## [X.Y.Z]` heading. Tells you to run `df-tools changelog update --version vX.Y.Z` first. | `DEVFLOW_SKIP_CHANGELOG_GATE=1` |
| `verify-completion.js` | Stop | Checks the most-recent SUMMARY.md has Task Evidence and no `Self-Check: FAILED` markers. Warns only — does not block. | n/a (warning only) |
| `verify-commits.js` | SubagentStop | Warns when a subagent finishes without producing any commits in the last 10 min — silent-failure detector for the executor. | n/a (warning only) |
| `check-update.js` | SessionStart | Background npm registry check for newer DevFlow versions. | n/a |
| `statusline.js` | StatusLine | Renders model, current task, context usage, update indicator. | n/a |

### "DevFlow blocked my command — why?"

If a hook denies a tool call, the model receives the denial reason and will usually correct itself. If you want to bypass:

```bash
# One-off: prefix the command with the env var
DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "..."

# Persistent for a session
export DEVFLOW_ALLOW_RAW_COMMIT=1
```

To turn off a hook entirely, edit `~/.claude/settings.json` and remove its entry from `hooks.PreToolUse` / `hooks.UserPromptSubmit`. Reinstalling DevFlow will re-add it.

---

## GitHub integration

Opt-in mirroring of `.planning/` to GitHub issues, milestones, and releases. Planning files remain the source of truth — GitHub is derivative. Every operation is a no-op when integration is disabled, `gh` is missing, or auth has expired; failures never block your workflow.

### Enable

In `.planning/config.json`:

```json
{
  "github": {
    "enabled": true,
    "repo": "owner/name",
    "milestone_prefix": "v",
    "labels": {
      "objective": "devflow:objective",
      "in_progress": "devflow:in-progress",
      "gaps": "devflow:gaps"
    }
  }
}
```

Prereqs: `gh` CLI installed and authenticated (`gh auth login`).

### What syncs and when

| Trigger | Action | Manual command |
|---|---|---|
| End of `/devflow:new-project` (after roadmap creation) | Creates one milestone per roadmap version + one issue per objective, persists numbers to `.planning/.gh-mapping.json` | `df-tools gh sync-objectives` |
| Verifier finds gaps (`status: gaps_found`) | Posts the VERIFICATION.md `gaps:` block as an issue comment | `df-tools gh comment <obj#> @file:path` |
| Verifier final pass passes | Closes the issue with link to verification report | `df-tools gh close-issue <obj#>` |
| Tag push (`vX.Y.Z`) | Generates rich release notes from SUMMARY.md files since previous tag, creates or edits the GitHub release | `df-tools gh sync-release vX.Y.Z` |
| Manual recovery | All of the above | `/devflow:gh-sync [objectives|release vX.Y.Z|status]` |

### Mapping file

`.planning/.gh-mapping.json` is the source of truth for "which objective maps to which GitHub issue":

```json
{
  "milestone_id": 12,
  "objectives": {
    "1": 42,
    "2": 43,
    "2.1": 44
  }
}
```

Commit it. Re-running `gh sync-objectives` is idempotent — existing issues are edited, not duplicated.

### What does NOT sync

- Issues created in GitHub do not flow back to `.planning/` (would break "planning files are truth"). File issues normally; they become input to `/devflow:plan-objective`.
- Per-task commits are not re-posted to issues (too noisy). Use `gh comment` manually if you want an update mid-execution.
- GitHub Projects v2 boards are not synced (GraphQL-only, low marginal value over labels + milestones).

### Troubleshooting

```bash
# Is the integration reachable?
node ~/.claude/devflow/bin/df-tools.cjs gh status
```

Common reasons for "skipped":
- `github.enabled is false` — set `enabled: true` in config
- `gh CLI not installed` — install from https://cli.github.com
- `gh not authenticated` — run `gh auth login`
- `github.repo must be set as "owner/name"` — fix the format

---

## CHANGELOG management

DevFlow ships with an auto-updater that keeps `CHANGELOG.md` in Keep-a-Changelog format from your conventional-commit history.

```bash
# Generate an entry for the next release from git log since the last tag
node ~/.claude/devflow/bin/df-tools.cjs changelog update --version v1.30.0

# Backfill an older release with explicit range
node ~/.claude/devflow/bin/df-tools.cjs changelog update \
  --version 1.27.4 --from 6aafba1 --to dcfba83

# Preview without writing
node ~/.claude/devflow/bin/df-tools.cjs changelog update --version v1.30.0 --dry-run

# Check whether a version already has an entry
node ~/.claude/devflow/bin/df-tools.cjs changelog check 1.29.0
```

Commits are grouped by conventional-commit type (`feat` → Added, `fix` → Fixed, `perf` → Performance, etc.). Bare commits without a recognized type land under "Other". The `changelog-on-tag` hook blocks `git tag -a vX.Y.Z` until the entry exists, so you cannot ship a release without documenting it.

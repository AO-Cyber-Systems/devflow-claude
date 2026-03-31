<purpose>
Display the complete DevFlow command reference. Output ONLY the reference content. Do NOT add project-specific analysis, git status, next-step suggestions, or any commentary beyond the reference.
</purpose>

<reference>
# DevFlow Command Reference

**DevFlow** (Get Shit Done) creates hierarchical project plans optimized for solo agentic development with Claude Code.

## Quick Start

1. `/new-project` - Initialize project (includes research, requirements, roadmap)
2. `/plan-objective 1` - Create detailed plan for first objective
3. `/execute-objective 1` - Execute the objective

## Staying Updated

DevFlow evolves fast. Update periodically:

```bash
npx @ao-cyber-systems/devflow-cc@latest
```

## Core Workflow

```
/new-project → /plan-objective → /execute-objective → repeat
```

### Project Initialization

**`/new-project`**
Initialize new project through unified flow.

One command takes you from idea to ready-for-planning:
- Deep questioning to understand what you're building
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with v1/v2/out-of-scope scoping
- Roadmap creation with objective breakdown and success criteria

Creates all `.planning/` artifacts:
- `PROJECT.md` — vision and requirements
- `config.json` — workflow mode (interactive/yolo)
- `research/` — domain research (if selected)
- `REQUIREMENTS.md` — scoped requirements with REQ-IDs
- `ROADMAP.md` — objectives mapped to requirements
- `STATE.md` — project memory

Usage: `/new-project`

**`/map-codebase`**
Map an existing codebase for brownfield projects.

- Analyzes codebase with parallel Explore agents
- Creates `.planning/codebase/` with 7 focused documents
- Covers stack, architecture, structure, conventions, testing, integrations, concerns
- Use before `/new-project` on existing codebases

Usage: `/map-codebase`

### Objective Planning

**`/discuss-objective <number>`**
Help articulate your vision for an objective before planning.

- Captures how you imagine this objective working
- Creates CONTEXT.md with your vision, essentials, and boundaries
- Use when you have ideas about how something should look/feel

Usage: `/discuss-objective 2`

**`/research-objective <number>`**
Comprehensive ecosystem research for niche/complex domains.

- Discovers standard stack, architecture patterns, pitfalls
- Creates RESEARCH.md with "how experts build this" knowledge
- Use for 3D, games, audio, shaders, ML, and other specialized domains
- Goes beyond "which library" to ecosystem knowledge

Usage: `/research-objective 3`

**`/list-objective-assumptions <number>`**
See what Claude is planning to do before it starts.

- Shows Claude's intended approach for an objective
- Lets you course-correct if Claude misunderstood your vision
- No files created - conversational output only

Usage: `/list-objective-assumptions 3`

**`/plan-objective <number>`**
Create detailed execution plan for a specific objective.

- Generates `.planning/objectives/XX-phase-name/XX-YY-JOB.md`
- Breaks objective into concrete, actionable tasks
- Includes verification criteria and success measures
- Multiple plans per objective supported (XX-01, XX-02, etc.)

Usage: `/plan-objective 1`
Result: Creates `.planning/objectives/01-foundation/01-01-JOB.md`

### Execution

**`/execute-objective <phase-number>`**
Execute all jobs in an objective.

- Groups plans by wave (from frontmatter), executes waves sequentially
- Plans within each wave run in parallel via Task tool
- Verifies objective goal after all jobs complete
- Updates REQUIREMENTS.md, ROADMAP.md, STATE.md

Usage: `/execute-objective 5`

### Quick Mode

**`/quick`**
Execute small, ad-hoc tasks with DevFlow guarantees but skip optional agents.

Quick mode uses the same system with a shorter path:
- Spawns planner + executor (skips researcher, checker, verifier)
- Quick tasks live in `.planning/quick/` separate from planned objectives
- Updates STATE.md tracking (not ROADMAP.md)

Use when you know exactly what to do and the task is small enough to not need research or verification.

Usage: `/quick`
Result: Creates `.planning/quick/NNN-slug/JOB.md`, `.planning/quick/NNN-slug/SUMMARY.md`

### Roadmap Management

**`/add-objective <description>`**
Add new objective to end of current milestone.

- Appends to ROADMAP.md
- Uses next sequential number
- Updates objective directory structure

Usage: `/add-objective "Add admin dashboard"`

**`/insert-objective <after> <description>`**
Insert urgent work as decimal objective between existing objectives.

- Creates intermediate objective (e.g., 7.1 between 7 and 8)
- Useful for discovered work that must happen mid-milestone
- Maintains objective ordering

Usage: `/insert-objective 7 "Fix critical auth bug"`
Result: Creates Objective 7.1

**`/remove-objective <number>`**
Remove a future objective and renumber subsequent objectives.

- Deletes objective directory and all references
- Renumbers all subsequent objectives to close the gap
- Only works on future (unstarted) objectives
- Git commit preserves historical record

Usage: `/remove-objective 17`
Result: Objective 17 deleted, objectives 18-20 become 17-19

### Parallel Workstreams

**`/workstreams setup`**
Create parallel worktrees for independent objectives.

- Analyzes ROADMAP.md dependency graph for non-linear dependencies
- Creates git worktree + branch for each independent objective group
- Provisions `.planning/` context per worktree (filtered state, marker)
- Each worktree runs normal DevFlow commands in its own Claude session

Usage: `/workstreams setup`

**`/workstreams status`**
Check progress across all active workstreams.

- Reads each worktree's STATE.md and git branch activity
- Shows completion status per workstream
- Indicates when join objective is ready

Usage: `/workstreams status`

**`/workstreams merge`**
Merge completed workstreams back to main.

- Squash-merges each workstream branch
- Auto-reconciles `.planning/` conflicts
- Regenerates ROADMAP.md progress and STATE.md
- Cleans up worktrees and branches
- Advances to the join objective

Usage: `/workstreams merge`

### Milestone Management

**`/new-milestone <name>`**
Start a new milestone through unified flow.

- Deep questioning to understand what you're building next
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with scoping
- Roadmap creation with objective breakdown

Mirrors `/new-project` flow for brownfield projects (existing PROJECT.md).

Usage: `/new-milestone "v2.0 Features"`

**`/complete-milestone <version>`**
Archive completed milestone and prepare for next version.

- Creates MILESTONES.md entry with stats
- Archives full details to milestones/ directory
- Creates git tag for the release
- Prepares workspace for next version

Usage: `/complete-milestone 1.0.0`

### Progress Tracking

**`/progress`**
Check project status and intelligently route to next action.

- Shows visual progress bar and completion percentage
- Summarizes recent work from SUMMARY files
- Displays current position and what's next
- Lists key decisions and open issues
- Offers to execute next job or create it if missing
- Detects 100% milestone completion

Usage: `/progress`

### Session Management

**`/resume-work`**
Resume work from previous session with full context restoration.

- Reads STATE.md for project context
- Shows current position and recent progress
- Offers next actions based on project state

Usage: `/resume-work`

**`/pause-work`**
Create context handoff when pausing work mid-objective.

- Creates .continue-here file with current state
- Updates STATE.md session continuity section
- Captures in-progress work context

Usage: `/pause-work`

### Debugging

**`/debug [issue description]`**
Systematic debugging with persistent state across context resets.

- Gathers symptoms through adaptive questioning
- Creates `.planning/debug/[slug].md` to track investigation
- Investigates using scientific method (evidence → hypothesis → test)
- Survives `/clear` — run `/debug` with no args to resume
- Archives resolved issues to `.planning/debug/resolved/`

Usage: `/debug "login button doesn't work"`
Usage: `/debug` (resume active session)

### Todo Management

**`/add-todo [description]`**
Capture idea or task as todo from current conversation.

- Extracts context from conversation (or uses provided description)
- Creates structured todo file in `.planning/todos/pending/`
- Infers area from file paths for grouping
- Checks for duplicates before creating
- Updates STATE.md todo count

Usage: `/add-todo` (infers from conversation)
Usage: `/add-todo Add auth token refresh`

**`/check-todos [area]`**
List pending todos and select one to work on.

- Lists all pending todos with title, area, age
- Optional area filter (e.g., `/check-todos api`)
- Loads full context for selected todo
- Routes to appropriate action (work now, add to objective, brainstorm)
- Moves todo to done/ when work begins

Usage: `/check-todos`
Usage: `/check-todos api`

### User Acceptance Testing

**`/verify-work [objective]`**
Validate built features through conversational UAT.

- Extracts testable deliverables from SUMMARY.md files
- Presents tests one at a time (yes/no responses)
- Automatically diagnoses failures and creates fix plans
- Ready for re-execution if issues found

Usage: `/verify-work 3`

### Milestone Auditing

**`/audit-milestone [version]`**
Audit milestone completion against original intent.

- Reads all objective VERIFICATION.md files
- Checks requirements coverage
- Spawns integration checker for cross-objective wiring
- Creates MILESTONE-AUDIT.md with gaps and tech debt

Usage: `/audit-milestone`

**`/plan-milestone-gaps`**
Create objectives to close gaps identified by audit.

- Reads MILESTONE-AUDIT.md and groups gaps into objectives
- Prioritizes by requirement priority (must/should/nice)
- Adds gap closure objectives to ROADMAP.md
- Ready for `/plan-objective` on new objectives

Usage: `/plan-milestone-gaps`

### Configuration

**`/settings`**
Configure workflow toggles and model profile interactively.

- Toggle researcher, job checker, verifier agents
- Select model profile (quality/balanced/budget)
- Updates `.planning/config.json`

Usage: `/settings`

**`/set-profile <profile>`**
Quick switch model profile for DevFlow agents.

- `quality` — Opus everywhere except verification
- `balanced` — Opus for planning, Sonnet for execution (default)
- `budget` — Sonnet for writing, Haiku for research/verification

Usage: `/set-profile budget`

### Utility Commands

**`/cleanup`**
Archive accumulated objective directories from completed milestones.

- Identifies objectives from completed milestones still in `.planning/objectives/`
- Shows dry-run summary before moving anything
- Moves objective dirs to `.planning/milestones/v{X.Y}-objectives/`
- Use after multiple milestones to reduce `.planning/objectives/` clutter

Usage: `/cleanup`

**`/help`**
Show this command reference.

**`/update`**
Update DevFlow to latest version with changelog preview.

- Shows installed vs latest version comparison
- Displays changelog entries for versions you've missed
- Highlights breaking changes
- Confirms before running install
- Better than raw `npx devflow-cc`

Usage: `/update`

**`/join-discord`**
Join the DevFlow Discord community.

- Get help, share what you're building, stay updated
- Connect with other DevFlow users

Usage: `/join-discord`

## Files & Structure

```
.planning/
├── PROJECT.md            # Project vision
├── ROADMAP.md            # Current objective breakdown
├── STATE.md              # Project memory & context
├── config.json           # Workflow mode & gates
├── todos/                # Captured ideas and tasks
│   ├── pending/          # Todos waiting to be worked on
│   └── done/             # Completed todos
├── debug/                # Active debug sessions
│   └── resolved/         # Archived resolved issues
├── milestones/
│   ├── v1.0-ROADMAP.md       # Archived roadmap snapshot
│   ├── v1.0-REQUIREMENTS.md  # Archived requirements
│   └── v1.0-objectives/          # Archived objective dirs (via /cleanup or --archive-objectives)
│       ├── 01-foundation/
│       └── 02-core-features/
├── codebase/             # Codebase map (brownfield projects)
│   ├── STACK.md          # Languages, frameworks, dependencies
│   ├── ARCHITECTURE.md   # Patterns, layers, data flow
│   ├── STRUCTURE.md      # Directory layout, key files
│   ├── CONVENTIONS.md    # Coding standards, naming
│   ├── TESTING.md        # Test setup, patterns
│   ├── INTEGRATIONS.md   # External services, APIs
│   └── CONCERNS.md       # Tech debt, known issues
└── objectives/
    ├── 01-foundation/
    │   ├── 01-01-JOB.md
    │   └── 01-01-SUMMARY.md
    └── 02-core-features/
        ├── 02-01-JOB.md
        └── 02-01-SUMMARY.md
```

## Workflow Modes

Set during `/new-project`:

**Interactive Mode**

- Confirms each major decision
- Pauses at checkpoints for approval
- More guidance throughout

**YOLO Mode**

- Auto-approves most decisions
- Executes plans without confirmation
- Only stops for critical checkpoints

Change anytime by editing `.planning/config.json`

## Planning Configuration

Configure how planning artifacts are managed in `.planning/config.json`:

**`planning.commit_docs`** (default: `true`)
- `true`: Planning artifacts committed to git (standard workflow)
- `false`: Planning artifacts kept local-only, not committed

When `commit_docs: false`:
- Add `.planning/` to your `.gitignore`
- Useful for OSS contributions, client projects, or keeping planning private
- All planning files still work normally, just not tracked in git

**`planning.search_gitignored`** (default: `false`)
- `true`: Add `--no-ignore` to broad ripgrep searches
- Only needed when `.planning/` is gitignored and you want project-wide searches to include it

Example config:
```json
{
  "planning": {
    "commit_docs": false,
    "search_gitignored": true
  }
}
```

## Common Workflows

**Starting a new project:**

```
/new-project        # Unified flow: questioning → research → requirements → roadmap
/clear
/plan-objective 1       # Create plans for first objective
/clear
/execute-objective 1    # Execute all jobs in objective
```

**Resuming work after a break:**

```
/progress  # See where you left off and continue
```

**Adding urgent mid-milestone work:**

```
/insert-objective 5 "Critical security fix"
/plan-objective 5.1
/execute-objective 5.1
```

**Running independent objectives in parallel:**

```
/workstreams setup     # Analyze deps, create worktrees
# Open terminals in each worktree, run plan-objective + execute-objective
/workstreams status    # Check progress
/workstreams merge     # Merge when done, advance to join objective
```

**Completing a milestone:**

```
/complete-milestone 1.0.0
/clear
/new-milestone  # Start next milestone (questioning → research → requirements → roadmap)
```

**Capturing ideas during work:**

```
/add-todo                    # Capture from conversation context
/add-todo Fix modal z-index  # Capture with explicit description
/check-todos                 # Review and work on todos
/check-todos api             # Filter by area
```

**Debugging an issue:**

```
/debug "form submission fails silently"  # Start debug session
# ... investigation happens, context fills up ...
/clear
/debug                                    # Resume from where you left off
```

## Built-in Claude Code Integrations

DevFlow works alongside Claude Code's built-in features:

**`/loop` — Recurring monitoring:**

```
/loop 10m /progress       # Check project status every 10 minutes
/loop 5m /health          # Monitor .planning/ integrity during builds
/loop 15m /check-todos    # Periodic todo reminders
```

Use `/loop` during long `/execute-objective` runs to track progress without switching context.

**Plan Mode — Pre-build alignment:**

Claude Code's built-in plan mode (`EnterPlanMode`) is used by `/build` and `/plan-objective` to present the execution strategy before spawning expensive agent pipelines. This lets you review and approve the approach (objective scope, agent assignments, research decisions) before any work begins.

## Getting Help

- Read `.planning/PROJECT.md` for project vision
- Read `.planning/STATE.md` for current context
- Check `.planning/ROADMAP.md` for objective status
- Run `/progress` to check where you're up to
</reference>

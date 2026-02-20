<purpose>
Display the complete DevFlow command reference. Output ONLY the reference content. Do NOT add project-specific analysis, git status, next-step suggestions, or any commentary beyond the reference.
</purpose>

<reference>
# DevFlow Command Reference

**DevFlow** (Get Shit Done) creates hierarchical project plans optimized for solo agentic development with Claude Code.

## Quick Start

1. `/df:new-project` - Initialize project (includes research, requirements, roadmap)
2. `/df:plan-phase 1` - Create detailed plan for first phase
3. `/df:execute-phase 1` - Execute the phase

## Staying Updated

DevFlow evolves fast. Update periodically:

```bash
npx devflow-cc@latest
```

## Core Workflow

```
/df:new-project → /df:plan-phase → /df:execute-phase → repeat
```

### Project Initialization

**`/df:new-project`**
Initialize new project through unified flow.

One command takes you from idea to ready-for-planning:
- Deep questioning to understand what you're building
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with v1/v2/out-of-scope scoping
- Roadmap creation with phase breakdown and success criteria

Creates all `.planning/` artifacts:
- `PROJECT.md` — vision and requirements
- `config.json` — workflow mode (interactive/yolo)
- `research/` — domain research (if selected)
- `REQUIREMENTS.md` — scoped requirements with REQ-IDs
- `ROADMAP.md` — phases mapped to requirements
- `STATE.md` — project memory

Usage: `/df:new-project`

**`/df:map-codebase`**
Map an existing codebase for brownfield projects.

- Analyzes codebase with parallel Explore agents
- Creates `.planning/codebase/` with 7 focused documents
- Covers stack, architecture, structure, conventions, testing, integrations, concerns
- Use before `/df:new-project` on existing codebases

Usage: `/df:map-codebase`

### Phase Planning

**`/df:discuss-phase <number>`**
Help articulate your vision for a phase before planning.

- Captures how you imagine this phase working
- Creates CONTEXT.md with your vision, essentials, and boundaries
- Use when you have ideas about how something should look/feel

Usage: `/df:discuss-phase 2`

**`/df:research-phase <number>`**
Comprehensive ecosystem research for niche/complex domains.

- Discovers standard stack, architecture patterns, pitfalls
- Creates RESEARCH.md with "how experts build this" knowledge
- Use for 3D, games, audio, shaders, ML, and other specialized domains
- Goes beyond "which library" to ecosystem knowledge

Usage: `/df:research-phase 3`

**`/df:list-phase-assumptions <number>`**
See what Claude is planning to do before it starts.

- Shows Claude's intended approach for a phase
- Lets you course-correct if Claude misunderstood your vision
- No files created - conversational output only

Usage: `/df:list-phase-assumptions 3`

**`/df:plan-phase <number>`**
Create detailed execution plan for a specific phase.

- Generates `.planning/phases/XX-phase-name/XX-YY-PLAN.md`
- Breaks phase into concrete, actionable tasks
- Includes verification criteria and success measures
- Multiple plans per phase supported (XX-01, XX-02, etc.)

Usage: `/df:plan-phase 1`
Result: Creates `.planning/phases/01-foundation/01-01-PLAN.md`

### Execution

**`/df:execute-phase <phase-number>`**
Execute all plans in a phase.

- Groups plans by wave (from frontmatter), executes waves sequentially
- Plans within each wave run in parallel via Task tool
- Verifies phase goal after all plans complete
- Updates REQUIREMENTS.md, ROADMAP.md, STATE.md

Usage: `/df:execute-phase 5`

### Quick Mode

**`/df:quick`**
Execute small, ad-hoc tasks with DevFlow guarantees but skip optional agents.

Quick mode uses the same system with a shorter path:
- Spawns planner + executor (skips researcher, checker, verifier)
- Quick tasks live in `.planning/quick/` separate from planned phases
- Updates STATE.md tracking (not ROADMAP.md)

Use when you know exactly what to do and the task is small enough to not need research or verification.

Usage: `/df:quick`
Result: Creates `.planning/quick/NNN-slug/PLAN.md`, `.planning/quick/NNN-slug/SUMMARY.md`

### Roadmap Management

**`/df:add-phase <description>`**
Add new phase to end of current milestone.

- Appends to ROADMAP.md
- Uses next sequential number
- Updates phase directory structure

Usage: `/df:add-phase "Add admin dashboard"`

**`/df:insert-phase <after> <description>`**
Insert urgent work as decimal phase between existing phases.

- Creates intermediate phase (e.g., 7.1 between 7 and 8)
- Useful for discovered work that must happen mid-milestone
- Maintains phase ordering

Usage: `/df:insert-phase 7 "Fix critical auth bug"`
Result: Creates Phase 7.1

**`/df:remove-phase <number>`**
Remove a future phase and renumber subsequent phases.

- Deletes phase directory and all references
- Renumbers all subsequent phases to close the gap
- Only works on future (unstarted) phases
- Git commit preserves historical record

Usage: `/df:remove-phase 17`
Result: Phase 17 deleted, phases 18-20 become 17-19

### Parallel Workstreams

**`/df:workstreams setup`**
Create parallel worktrees for independent phases.

- Analyzes ROADMAP.md dependency graph for non-linear dependencies
- Creates git worktree + branch for each independent phase group
- Provisions `.planning/` context per worktree (filtered state, marker)
- Each worktree runs normal DevFlow commands in its own Claude session

Usage: `/df:workstreams setup`

**`/df:workstreams status`**
Check progress across all active workstreams.

- Reads each worktree's STATE.md and git branch activity
- Shows completion status per workstream
- Indicates when join phase is ready

Usage: `/df:workstreams status`

**`/df:workstreams merge`**
Merge completed workstreams back to main.

- Squash-merges each workstream branch
- Auto-reconciles `.planning/` conflicts
- Regenerates ROADMAP.md progress and STATE.md
- Cleans up worktrees and branches
- Advances to the join phase

Usage: `/df:workstreams merge`

### Milestone Management

**`/df:new-milestone <name>`**
Start a new milestone through unified flow.

- Deep questioning to understand what you're building next
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with scoping
- Roadmap creation with phase breakdown

Mirrors `/df:new-project` flow for brownfield projects (existing PROJECT.md).

Usage: `/df:new-milestone "v2.0 Features"`

**`/df:complete-milestone <version>`**
Archive completed milestone and prepare for next version.

- Creates MILESTONES.md entry with stats
- Archives full details to milestones/ directory
- Creates git tag for the release
- Prepares workspace for next version

Usage: `/df:complete-milestone 1.0.0`

### Progress Tracking

**`/df:progress`**
Check project status and intelligently route to next action.

- Shows visual progress bar and completion percentage
- Summarizes recent work from SUMMARY files
- Displays current position and what's next
- Lists key decisions and open issues
- Offers to execute next plan or create it if missing
- Detects 100% milestone completion

Usage: `/df:progress`

### Session Management

**`/df:resume-work`**
Resume work from previous session with full context restoration.

- Reads STATE.md for project context
- Shows current position and recent progress
- Offers next actions based on project state

Usage: `/df:resume-work`

**`/df:pause-work`**
Create context handoff when pausing work mid-phase.

- Creates .continue-here file with current state
- Updates STATE.md session continuity section
- Captures in-progress work context

Usage: `/df:pause-work`

### Debugging

**`/df:debug [issue description]`**
Systematic debugging with persistent state across context resets.

- Gathers symptoms through adaptive questioning
- Creates `.planning/debug/[slug].md` to track investigation
- Investigates using scientific method (evidence → hypothesis → test)
- Survives `/clear` — run `/df:debug` with no args to resume
- Archives resolved issues to `.planning/debug/resolved/`

Usage: `/df:debug "login button doesn't work"`
Usage: `/df:debug` (resume active session)

### Todo Management

**`/df:add-todo [description]`**
Capture idea or task as todo from current conversation.

- Extracts context from conversation (or uses provided description)
- Creates structured todo file in `.planning/todos/pending/`
- Infers area from file paths for grouping
- Checks for duplicates before creating
- Updates STATE.md todo count

Usage: `/df:add-todo` (infers from conversation)
Usage: `/df:add-todo Add auth token refresh`

**`/df:check-todos [area]`**
List pending todos and select one to work on.

- Lists all pending todos with title, area, age
- Optional area filter (e.g., `/df:check-todos api`)
- Loads full context for selected todo
- Routes to appropriate action (work now, add to phase, brainstorm)
- Moves todo to done/ when work begins

Usage: `/df:check-todos`
Usage: `/df:check-todos api`

### User Acceptance Testing

**`/df:verify-work [phase]`**
Validate built features through conversational UAT.

- Extracts testable deliverables from SUMMARY.md files
- Presents tests one at a time (yes/no responses)
- Automatically diagnoses failures and creates fix plans
- Ready for re-execution if issues found

Usage: `/df:verify-work 3`

### Milestone Auditing

**`/df:audit-milestone [version]`**
Audit milestone completion against original intent.

- Reads all phase VERIFICATION.md files
- Checks requirements coverage
- Spawns integration checker for cross-phase wiring
- Creates MILESTONE-AUDIT.md with gaps and tech debt

Usage: `/df:audit-milestone`

**`/df:plan-milestone-gaps`**
Create phases to close gaps identified by audit.

- Reads MILESTONE-AUDIT.md and groups gaps into phases
- Prioritizes by requirement priority (must/should/nice)
- Adds gap closure phases to ROADMAP.md
- Ready for `/df:plan-phase` on new phases

Usage: `/df:plan-milestone-gaps`

### Configuration

**`/df:settings`**
Configure workflow toggles and model profile interactively.

- Toggle researcher, plan checker, verifier agents
- Select model profile (quality/balanced/budget)
- Updates `.planning/config.json`

Usage: `/df:settings`

**`/df:set-profile <profile>`**
Quick switch model profile for DevFlow agents.

- `quality` — Opus everywhere except verification
- `balanced` — Opus for planning, Sonnet for execution (default)
- `budget` — Sonnet for writing, Haiku for research/verification

Usage: `/df:set-profile budget`

### Utility Commands

**`/df:cleanup`**
Archive accumulated phase directories from completed milestones.

- Identifies phases from completed milestones still in `.planning/phases/`
- Shows dry-run summary before moving anything
- Moves phase dirs to `.planning/milestones/v{X.Y}-phases/`
- Use after multiple milestones to reduce `.planning/phases/` clutter

Usage: `/df:cleanup`

**`/df:help`**
Show this command reference.

**`/df:update`**
Update DevFlow to latest version with changelog preview.

- Shows installed vs latest version comparison
- Displays changelog entries for versions you've missed
- Highlights breaking changes
- Confirms before running install
- Better than raw `npx devflow-cc`

Usage: `/df:update`

**`/df:join-discord`**
Join the DevFlow Discord community.

- Get help, share what you're building, stay updated
- Connect with other DevFlow users

Usage: `/df:join-discord`

## Files & Structure

```
.planning/
├── PROJECT.md            # Project vision
├── ROADMAP.md            # Current phase breakdown
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
│   └── v1.0-phases/          # Archived phase dirs (via /df:cleanup or --archive-phases)
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
└── phases/
    ├── 01-foundation/
    │   ├── 01-01-PLAN.md
    │   └── 01-01-SUMMARY.md
    └── 02-core-features/
        ├── 02-01-PLAN.md
        └── 02-01-SUMMARY.md
```

## Workflow Modes

Set during `/df:new-project`:

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
/df:new-project        # Unified flow: questioning → research → requirements → roadmap
/clear
/df:plan-phase 1       # Create plans for first phase
/clear
/df:execute-phase 1    # Execute all plans in phase
```

**Resuming work after a break:**

```
/df:progress  # See where you left off and continue
```

**Adding urgent mid-milestone work:**

```
/df:insert-phase 5 "Critical security fix"
/df:plan-phase 5.1
/df:execute-phase 5.1
```

**Running independent phases in parallel:**

```
/df:workstreams setup     # Analyze deps, create worktrees
# Open terminals in each worktree, run plan-phase + execute-phase
/df:workstreams status    # Check progress
/df:workstreams merge     # Merge when done, advance to join phase
```

**Completing a milestone:**

```
/df:complete-milestone 1.0.0
/clear
/df:new-milestone  # Start next milestone (questioning → research → requirements → roadmap)
```

**Capturing ideas during work:**

```
/df:add-todo                    # Capture from conversation context
/df:add-todo Fix modal z-index  # Capture with explicit description
/df:check-todos                 # Review and work on todos
/df:check-todos api             # Filter by area
```

**Debugging an issue:**

```
/df:debug "form submission fails silently"  # Start debug session
# ... investigation happens, context fills up ...
/clear
/df:debug                                    # Resume from where you left off
```

## Getting Help

- Read `.planning/PROJECT.md` for project vision
- Read `.planning/STATE.md` for current context
- Check `.planning/ROADMAP.md` for phase status
- Run `/df:progress` to check where you're up to
</reference>

---
description: Show DevFlow autonomous agent help
allowed-tools:
  - Bash(jq * ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json)
slash-command-tools: hidden
---

# DevFlow Autonomous Agent

First, show the version:
```bash
jq -r '"v" + .version' ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json
```

An unlimited iterative development loop for Claude Code with full development lifecycle management.

## Commands

### Core Commands
| Command | Description |
|---------|-------------|
| `/devflow:autonomous` | Start autonomous loop |
| `/devflow:cancel` | Cancel active loop |
| `/devflow:status` | Check loop status |
| `/devflow:doctor` | Check for required tools |
| `/devflow:install` | Auto-install missing tools |
| `/devflow:help` | Show this help |

### Development Lifecycle
| Command | Description |
|---------|-------------|
| `/devflow:design` | Create/view project design document |
| `/devflow:trd` | Manage Task Requirement Documents |
| `/devflow:features` | Generate/sync feature_list.json |
| `/devflow:verify` | Run build verification checks |
| `/devflow:uitest` | Run Playwright MCP UI tests |
| `/devflow:regression` | Manage anti-regression suite |

## Quick Start

```bash
# 1. Create project design document
/devflow:design init "My Project"

# 2. Create Task Requirement Documents
/devflow:trd create "User authentication"
/devflow:trd create "Dashboard UI"

# 3. Generate feature list from TRDs
/devflow:features sync

# 4. Initialize verification config
/devflow:verify init

# 5. Start autonomous development loop
/devflow:autonomous --task-file .devflow/feature_list.json
```

## Development Lifecycle Workflow

```
1. /devflow:design init
   └── Creates .devflow/design.md

2. /devflow:trd create <name>
   └── Creates .devflow/trds/TRD-XXX-name.md

3. /devflow:features sync
   └── Generates .devflow/feature_list.json

4. /devflow:autonomous --task-file .devflow/feature_list.json

   For each TRD:
   ├── Run regression suite (if tests exist)
   ├── Implement feature per TRD specs
   ├── Run verification checks
   ├── Run UI tests (Playwright MCP)
   ├── Mark TRD complete
   └── Add tests to regression suite

5. Loop exits when all features complete + all tests pass
```

## File Structure

```
.devflow/
├── design.md                 # Project design document
├── trds/                     # Task Requirement Documents
│   ├── TRD-001-feature.md
│   └── TRD-002-feature.md
├── feature_list.json         # Generated from TRDs
├── verification.json         # Build verification config
└── regression/
    ├── manifest.json         # Test registry
    ├── baselines/            # UI screenshot baselines
    └── history/runs/         # Run history
```

## Autonomous Loop Options

```bash
# Basic - unlimited loop until task file complete
/devflow:autonomous Implement all features

# With completion promise
/devflow:autonomous Build the API --completion-promise "DONE"

# With iteration limit
/devflow:autonomous Fix bugs --max-iterations 50

# Specify task file
/devflow:autonomous --task-file .devflow/feature_list.json
```

## Completion Triggers

The loop ends when ANY of these occur:
1. All tasks in task file have `status: "complete"`
2. You output `<promise>PHRASE</promise>` (if configured)
3. Max iterations reached (if configured)

**NEW**: Verification gate - before completion:
- All verification checks must pass
- Regression tests must pass (if configured)

## TRD Commands

```bash
/devflow:trd create "Feature name"     # Create new TRD
/devflow:trd list                      # List all TRDs
/devflow:trd view 001                  # View TRD content
/devflow:trd status 001 complete       # Update status
```

## Verification Commands

```bash
/devflow:verify init         # Initialize config
/devflow:verify run          # Run all checks
/devflow:verify run unit     # Run specific category
/devflow:verify list         # Show configured checks
```

## Regression Commands

```bash
/devflow:regression add TRD-001   # Add tests from TRD
/devflow:regression run           # Run all tests
/devflow:regression run unit      # Run specific type
/devflow:regression report        # Show history
```

## UI Test Commands

```bash
/devflow:uitest list              # List scenarios
/devflow:uitest run "Login flow"  # Get MCP instructions
/devflow:uitest baseline TRD-001  # Capture baselines
```

## Supported Tech Stacks

- **Frontend**: Svelte 5, SvelteKit, Vite, Vitest, Playwright
- **Backend**: FastAPI, Python, Poetry, pytest
- **Tools**: npm, pnpm, git, docker, make

## Monitoring

```bash
# View state file
cat .claude/devflow.local.md

# Check iteration
grep '^iteration:' .claude/devflow.local.md

# Check task progress
jq '.features | map(select(.status != "complete")) | length' .devflow/feature_list.json
```

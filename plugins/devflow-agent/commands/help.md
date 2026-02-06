---
description: Show DevFlow autonomous agent help
allowed-tools: []
slash-command-tools: hidden
disable-model-invocation: true
---

# DevFlow Autonomous Agent

An unlimited iterative development loop for Claude Code with full development lifecycle management.

## Commands

### Core Commands
| Command | Description |
|---------|-------------|
| `/devflow-agent:autonomous` | Start autonomous loop |
| `/devflow-agent:cancel` | Cancel active loop |
| `/devflow-agent:status` | Check loop status |
| `/devflow-agent:doctor` | Check for required tools |
| `/devflow-agent:install` | Auto-install missing tools |
| `/devflow-agent:help` | Show this help |

### Development Lifecycle
| Command | Description |
|---------|-------------|
| `/devflow-agent:design` | Create/view project design document |
| `/devflow-agent:trd` | Manage Task Requirement Documents |
| `/devflow-agent:features` | Generate/sync feature_list.json |
| `/devflow-agent:verify` | Run build verification checks |
| `/devflow-agent:uitest` | Run Playwright MCP UI tests |
| `/devflow-agent:regression` | Manage anti-regression suite |

## Quick Start

```bash
# 1. Create project design document
/devflow-agent:design init "My Project"

# 2. Create Task Requirement Documents
/devflow-agent:trd create "User authentication"
/devflow-agent:trd create "Dashboard UI"

# 3. Generate feature list from TRDs
/devflow-agent:features sync

# 4. Initialize verification config
/devflow-agent:verify init

# 5. Start autonomous development loop
/devflow-agent:autonomous --task-file .devflow/feature_list.json
```

## Development Lifecycle Workflow

```
1. /devflow-agent:design init
   └── Creates .devflow/design.md

2. /devflow-agent:trd create <name>
   └── Creates .devflow/trds/TRD-XXX-name.md

3. /devflow-agent:features sync
   └── Generates .devflow/feature_list.json

4. /devflow-agent:autonomous --task-file .devflow/feature_list.json

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
/devflow-agent:autonomous Implement all features

# With completion promise
/devflow-agent:autonomous Build the API --completion-promise "DONE"

# With iteration limit
/devflow-agent:autonomous Fix bugs --max-iterations 50

# Specify task file
/devflow-agent:autonomous --task-file .devflow/feature_list.json
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
/devflow-agent:trd create "Feature name"     # Create new TRD
/devflow-agent:trd list                      # List all TRDs
/devflow-agent:trd view 001                  # View TRD content
/devflow-agent:trd status 001 complete       # Update status
```

## Verification Commands

```bash
/devflow-agent:verify init         # Initialize config
/devflow-agent:verify run          # Run all checks
/devflow-agent:verify run unit     # Run specific category
/devflow-agent:verify list         # Show configured checks
```

## Regression Commands

```bash
/devflow-agent:regression add TRD-001   # Add tests from TRD
/devflow-agent:regression run           # Run all tests
/devflow-agent:regression run unit      # Run specific type
/devflow-agent:regression report        # Show history
```

## UI Test Commands

```bash
/devflow-agent:uitest list              # List scenarios
/devflow-agent:uitest run "Login flow"  # Get MCP instructions
/devflow-agent:uitest baseline TRD-001  # Capture baselines
```

## Supported Tech Stacks

- **Frontend**: Svelte 5, SvelteKit, Vite, Vitest, Playwright
- **Backend**: FastAPI, Python, Poetry, pytest
- **Tools**: npm, pnpm, git, docker, make

## Monitoring

```bash
# View state file
cat .claude/devflow-agent.local.md

# Check iteration
grep '^iteration:' .claude/devflow-agent.local.md

# Check task progress
jq '.features | map(select(.status != "complete")) | length' .devflow/feature_list.json
```

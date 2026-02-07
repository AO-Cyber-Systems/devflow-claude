# DevFlow Autonomous Agent

An unlimited iterative development loop plugin for Claude Code. Designed for autonomous task completion with PRD-driven workflows.

## Features

- **Unlimited loops by default** - Runs until genuine task completion
- **Task file tracking** - Auto-detects feature_list.json, prd.json, tasks.json
- **Security allowlist** - Restricts bash commands to safe operations
- **Tech stack aware** - Configured for Svelte 5, FastAPI, Ruby stacks

## Installation

### Development Mode
```bash
claude --plugin-dir ./plugins/devflow
```

### Permanent Installation
Add to your Claude Code plugins directory or use `/plugin install`.

## Usage

### Start Autonomous Loop
```bash
# Basic - unlimited iterations until task file complete
/devflow:autonomous Implement all features in feature_list.json

# With completion promise
/devflow:autonomous Build the REST API --completion-promise "ALL DONE"

# With iteration limit (safety net)
/devflow:autonomous Fix all bugs --max-iterations 100

# Specify task file
/devflow:autonomous --task-file prd.json Implement user stories
```

### Other Commands
```bash
/devflow:status    # Check current loop status
/devflow:cancel    # Cancel active loop
/devflow:doctor    # Check for required tools
/devflow:install   # Auto-install missing tools (no sudo)
/devflow:help      # Show help
```

## Dependency Management

Uses **mise** as the primary tool version manager.

### Check Required Tools
```bash
/devflow:doctor
```

Shows:
- mise installation status
- Which tools are installed vs missing
- Combined `mise use -g` command for missing tools
- Fallback commands for tools not in mise

### Auto-Install
```bash
/devflow:install
```

Installs missing tools via mise:
- **mise**: node, pnpm, python, poetry, ruff, github-cli, jq, yq, ripgrep, fd
- **pip**: pytest, black, mypy, uvicorn (not in mise)
- **manual**: docker, stripe, tree, make

### Install mise First
```bash
# macOS
brew install mise

# or any platform
curl https://mise.run | sh

# Then activate in your shell
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
```

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  1. /devflow:autonomous "Build features"          │
│                         │                               │
│                         ▼                               │
│  2. Creates .claude/devflow.local.md              │
│     (state file with iteration, task file, promise)    │
│                         │                               │
│                         ▼                               │
│  3. Claude works on tasks                               │
│                         │                               │
│                         ▼                               │
│  4. Claude tries to exit                                │
│                         │                               │
│                         ▼                               │
│  5. Stop hook intercepts:                               │
│     - Checks task file for completion                   │
│     - Checks for completion promise                     │
│     - If incomplete: blocks exit, re-injects prompt     │
│                         │                               │
│                         ▼                               │
│  6. Loop continues until:                               │
│     - All tasks complete, OR                            │
│     - <promise>PHRASE</promise> output, OR              │
│     - Max iterations (if set)                           │
└─────────────────────────────────────────────────────────┘
```

## Task File Format

The plugin auto-detects these task file names:
- `feature_list.json`
- `prd.json`
- `tasks.json`
- `stories.json`

Expected format:
```json
{
  "features": [
    { "name": "User authentication", "status": "complete" },
    { "name": "Dashboard UI", "status": "in_progress" },
    { "name": "API endpoints", "status": "pending" }
  ]
}
```

Also supports `tasks` or `stories` as the array key.

## Security Allowlist

Commands are restricted to tools actually used in aocodex-v2, aosentry, and aocyberweb, plus essential exploration tools:

| Category | Commands |
|----------|----------|
| **Node/Frontend** | npm, pnpm, npx, node |
| **Python** | python, pip, poetry, pytest, ruff, black, mypy, uvicorn |
| **Build & Dev** | vite, svelte-check, svelte-kit, tsc, eslint, prettier, vitest, playwright, tailwind |
| **Make** | make (all targets) |
| **Git** | git, gh |
| **Docker** | docker, docker-compose |
| **Database** | (project-specific) |
| **Payments** | stripe |
| **Tool Manager** | mise |
| **File Exploration** | ls, cat, head, tail, less, grep, find, wc, diff, tree, file, stat, mkdir, cp, mv, touch |
| **Modern Search** | rg (ripgrep), fd, ag, ack |
| **Safe rm** | node_modules, dist, build, .svelte-kit, .vite, coverage, __pycache__, .pytest_cache, etc. |
| **Data Tools** | jq, yq |
| **Text Processing** | sed, awk, sort, uniq, tr, cut, xargs, tee |
| **HTTP** | curl, wget |
| **Process** | ps, lsof, kill, pkill (dev servers only) |

Commands not in the allowlist are blocked with a helpful message.

## Monitoring

```bash
# View full state
cat .claude/devflow.local.md

# Check current iteration
grep '^iteration:' .claude/devflow.local.md

# Check task progress
jq '[.features[] | select(.status != "complete")] | length' feature_list.json
```

## Configuration

### Completion Promise
If set, the loop only ends when you output the exact phrase in `<promise>` tags:
```
<promise>ALL TASKS COMPLETE</promise>
```

### Max Iterations
Set to 0 (default) for unlimited, or any positive integer for a safety limit.

### Task File
Specify with `--task-file` or let the plugin auto-detect from common names.

## Tech Stack Support

Optimized for:
- **aocodex-v2**: Svelte 5, SvelteKit, Vite, Vitest, Playwright, pnpm
- **aosentry**: Python, Poetry, pytest, Black, Ruff, MyPy, Make
- **aocyberweb**: Svelte 5, SvelteKit, Vite, Vitest, Playwright, Stripe

## File Structure

```
devflow/
├── .claude-plugin/
│   └── plugin.json         # Plugin metadata
├── commands/
│   ├── autonomous.md       # /devflow:autonomous
│   ├── cancel.md           # /devflow:cancel
│   ├── status.md           # /devflow:status
│   └── help.md             # /devflow:help
├── hooks/
│   ├── hooks.json          # Hook configuration
│   ├── stop-hook.sh        # Iteration control
│   └── security-hook.sh    # Command allowlist
├── scripts/
│   └── setup-autonomous.sh # Loop initialization
└── README.md
```

## License

MIT

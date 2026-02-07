#!/bin/bash
# DevFlow Autonomous Agent Setup Script
# Creates state file for unlimited autonomous loop

set -euo pipefail

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

PROMPT_PARTS=()
MAX_ITERATIONS=0  # 0 = unlimited (DEFAULT)
COMPLETION_PROMISE=""
TASK_FILE=""

show_help() {
  cat <<'HELP_EOF'
DevFlow Autonomous Agent - Unlimited iterative development loop

USAGE:
  /devflow:autonomous [PROMPT...] [OPTIONS]

ARGUMENTS:
  PROMPT...   Task description (can be multiple words)

OPTIONS:
  --max-iterations <n>        Max iterations (default: 0 = UNLIMITED)
  --completion-promise <text> Promise phrase to signal completion
  --task-file <path>          JSON file with tasks (auto-detected if not set)
  -h, --help                  Show this help

DESCRIPTION:
  Starts an UNLIMITED autonomous loop that continues until:
  1. All tasks in task file are marked complete, OR
  2. You output <promise>YOUR_PHRASE</promise>, OR
  3. Max iterations reached (if set)

  The agent will:
  - Read tasks from feature_list.json, prd.json, or tasks.json
  - Implement each task following existing code patterns
  - Run tests to verify implementation
  - Update task status and commit changes
  - Loop until all tasks complete

EXAMPLES:
  # Basic - unlimited loop until task file complete
  /devflow:autonomous Implement all features in feature_list.json

  # With completion promise
  /devflow:autonomous Build the API --completion-promise "ALL DONE"

  # With specific task file
  /devflow:autonomous --task-file prd.json Implement user stories

  # With iteration limit (safety)
  /devflow:autonomous Fix all bugs --max-iterations 50

MONITORING:
  cat .claude/devflow.local.md    # View state
  grep '^iteration:' .claude/devflow.local.md  # Current iteration

STOPPING:
  /devflow:cancel                 # Cancel the loop
HELP_EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      show_help
      ;;
    --max-iterations)
      if [[ -z "${2:-}" ]] || [[ ! "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: --max-iterations requires a non-negative integer" >&2
        exit 1
      fi
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --completion-promise)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --completion-promise requires a text argument" >&2
        exit 1
      fi
      COMPLETION_PROMISE="$2"
      shift 2
      ;;
    --task-file)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --task-file requires a file path" >&2
        exit 1
      fi
      TASK_FILE="$2"
      shift 2
      ;;
    *)
      PROMPT_PARTS+=("$1")
      shift
      ;;
  esac
done

PROMPT="${PROMPT_PARTS[*]}"

# =============================================================================
# AUTO-DETECT TASK FILE
# =============================================================================

if [[ -z "$TASK_FILE" ]]; then
  # Try common task file names
  for candidate in feature_list.json prd.json tasks.json TASKS.json stories.json; do
    if [[ -f "$candidate" ]]; then
      TASK_FILE="$candidate"
      break
    fi
  done
fi

# =============================================================================
# VALIDATE INPUT
# =============================================================================

if [[ -z "$PROMPT" ]] && [[ -z "$TASK_FILE" ]]; then
  echo "Error: Provide a prompt or ensure a task file exists" >&2
  echo "" >&2
  echo "Examples:" >&2
  echo "  /devflow:autonomous Implement all features" >&2
  echo "  /devflow:autonomous --task-file prd.json" >&2
  echo "" >&2
  echo "For help: /devflow:autonomous --help" >&2
  exit 1
fi

# =============================================================================
# CREATE STATE FILE
# =============================================================================

mkdir -p .claude

# YAML-safe completion promise
if [[ -n "$COMPLETION_PROMISE" ]]; then
  COMPLETION_PROMISE_YAML="\"$COMPLETION_PROMISE\""
else
  COMPLETION_PROMISE_YAML='""'
fi

# YAML-safe task file
if [[ -n "$TASK_FILE" ]]; then
  TASK_FILE_YAML="\"$TASK_FILE\""
else
  TASK_FILE_YAML='""'
fi

# Build default prompt if none provided
if [[ -z "$PROMPT" ]] && [[ -n "$TASK_FILE" ]]; then
  PROMPT="Work through all tasks in $TASK_FILE. For each task: implement, test, update status to complete, and commit."
fi

cat > .claude/devflow.local.md <<EOF
---
active: true
iteration: 1
max_iterations: $MAX_ITERATIONS
completion_promise: $COMPLETION_PROMISE_YAML
task_file: $TASK_FILE_YAML
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
use_subagents: true
use_native_tasks: true
---

$PROMPT

## Instructions

You are the **orchestrator** in an autonomous development loop. Your role is to coordinate work, not do all implementation yourself.

### Architecture: Orchestrator + Subagents

**Your responsibilities:**
- Manage the task queue (TaskCreate, TaskUpdate, TaskList)
- Delegate implementation to specialized subagents
- Track progress and handle failures
- Keep your context clean for coordination

**Available Subagents:**
- \`trd-implementer\`: Implements a single TRD with isolated context
- \`trd-designer\`: Designs TRDs by exploring the codebase
- \`code-reviewer\`: Reviews code for quality and security
- \`debugger\`: Investigates and fixes test failures

### For each TRD:

1. **Create native task for tracking:**
   \`\`\`
   TaskCreate: "Implement TRD-XXX: Feature Name"
   \`\`\`

2. **Check baseline health:**
   \`\`\`bash
   \${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh run
   \`\`\`

3. **Delegate to trd-implementer subagent:**
   \`\`\`
   Task(subagent_type: "trd-implementer"):
     Implement the TRD at .devflow/trds/TRD-XXX-name.md
   \`\`\`

4. **Update status on completion:**
   \`\`\`
   TaskUpdate(taskId: "X", status: "completed")
   \${CLAUDE_PLUGIN_ROOT}/scripts/trd.sh status XXX complete
   \`\`\`

5. **Add tests to regression suite:**
   \`\`\`bash
   \${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh add TRD-XXX
   \`\`\`

### Why Subagents?
- **Isolated context**: Each TRD gets fresh context, no bloat
- **Persistent memory**: Subagents learn patterns across iterations
- **Parallel work**: Can run multiple subagents concurrently
- **Clean orchestration**: Your context stays focused on coordination

### Tech Stack Commands:
- **Frontend**: npm run dev, npm run build, npm run check, npm run test
- **Backend Python**: poetry run pytest, make test-unit, make lint
- **Type checking**: npm run check, svelte-check, mypy, pyright
### Completion:
$(if [[ -n "$COMPLETION_PROMISE" ]]; then
  echo "When ALL tasks are genuinely complete, output: <promise>$COMPLETION_PROMISE</promise>"
else
  echo "Loop continues until all tasks in the task file have status 'complete' or 'done'."
fi)

### Current State:
$(if [[ -n "$TASK_FILE" ]] && [[ -f "$TASK_FILE" ]]; then
  INCOMPLETE=$(jq '[(.features // .tasks // .stories // [])[] | select(.status != "complete" and .status != "done")] | length' "$TASK_FILE" 2>/dev/null || echo "?")
  TOTAL=$(jq '[(.features // .tasks // .stories // [])[] ] | length' "$TASK_FILE" 2>/dev/null || echo "?")
  echo "- Task file: $TASK_FILE"
  echo "- Tasks remaining: $INCOMPLETE of $TOTAL"
else
  echo "- No task file detected (will use completion promise or manual stop)"
fi)
EOF

# =============================================================================
# OUTPUT CONFIRMATION
# =============================================================================

cat <<EOF

DevFlow Autonomous Agent Activated

Configuration:
  Iterations: $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo "$MAX_ITERATIONS (limited)"; else echo "UNLIMITED"; fi)
  Task file: $(if [[ -n "$TASK_FILE" ]]; then echo "$TASK_FILE"; else echo "none"; fi)
  Completion: $(if [[ -n "$COMPLETION_PROMISE" ]]; then echo "<promise>$COMPLETION_PROMISE</promise>"; else echo "auto (task file completion)"; fi)

$(if [[ -n "$TASK_FILE" ]] && [[ -f "$TASK_FILE" ]]; then
  INCOMPLETE=$(jq '[(.features // .tasks // .stories // [])[] | select(.status != "complete" and .status != "done")] | length' "$TASK_FILE" 2>/dev/null || echo "?")
  TOTAL=$(jq '[(.features // .tasks // .stories // [])[] ] | length' "$TASK_FILE" 2>/dev/null || echo "?")
  echo "Progress: $((TOTAL - INCOMPLETE))/$TOTAL tasks complete"
fi)

The stop hook is now active. When you try to exit, your prompt will be
re-injected. Previous work persists in files and git history.

To cancel: /devflow:cancel
To monitor: cat .claude/devflow.local.md

EOF

# Output the prompt to start working
echo "$PROMPT"

# Critical warning for completion promise
if [[ -n "$COMPLETION_PROMISE" ]]; then
  cat <<EOF

CRITICAL: Completion Promise Requirements
  Output: <promise>$COMPLETION_PROMISE</promise>
  ONLY when the statement is genuinely TRUE.
  Do NOT output false promises to exit the loop.
EOF
fi

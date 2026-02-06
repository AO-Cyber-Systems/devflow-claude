---
description: Check status of DevFlow autonomous loop
allowed-tools:
  - Bash(test -f .claude/devflow-agent.local.md)
  - Bash(cat .claude/devflow-agent.local.md)
  - Bash(grep * .claude/devflow-agent.local.md)
  - Bash(jq * feature_list.json)
  - Bash(jq * prd.json)
  - Bash(jq * tasks.json)
  - Bash(jq * .devflow/*.json)
  - Read
slash-command-tools: hidden
---

# DevFlow Status

Check the current status of the autonomous development loop.

## Steps

1. Check if loop is active:
```bash
test -f .claude/devflow-agent.local.md && echo "Loop is ACTIVE" || echo "No active loop"
```

2. If active, show state:
```bash
cat .claude/devflow-agent.local.md
```

3. If task file exists, show progress:
```bash
TASK_FILE=$(grep '^task_file:' .claude/devflow-agent.local.md 2>/dev/null | sed 's/task_file: *//' | sed 's/^"\(.*\)"$/\1/')
if [[ -n "$TASK_FILE" ]] && [[ -f "$TASK_FILE" ]]; then
  echo "Task file: $TASK_FILE"
  jq '{
    total: [(.features // .tasks // .stories // [])[] ] | length,
    complete: [(.features // .tasks // .stories // [])[] | select(.status == "complete" or .status == "done")] | length,
    remaining: [(.features // .tasks // .stories // [])[] | select(.status != "complete" and .status != "done")] | length
  }' "$TASK_FILE"
fi
```

Report:
- Current iteration number
- Max iterations (0 = unlimited)
- Task file progress (complete/total)
- Completion promise (if set)
- Started timestamp

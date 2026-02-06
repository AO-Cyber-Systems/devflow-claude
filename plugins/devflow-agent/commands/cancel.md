---
description: Cancel active DevFlow autonomous loop
allowed-tools:
  - Bash(test -f .claude/devflow-agent.local.md)
  - Bash(rm .claude/devflow-agent.local.md)
  - Bash(head -* .claude/devflow-agent.local.md)
  - Bash(cat .claude/devflow-agent.local.md)
  - Read
slash-command-tools: hidden
---

# Cancel DevFlow Autonomous Loop

Check if an autonomous loop is active and cancel it.

## Steps

1. First, check if a loop is active:
```bash
test -f .claude/devflow-agent.local.md && echo "Active loop found" || echo "No active loop"
```

2. If active, read the current state:
```bash
head -15 .claude/devflow-agent.local.md
```

3. Remove the state file to cancel:
```bash
rm .claude/devflow-agent.local.md && echo "DevFlow autonomous loop cancelled"
```

Report the final iteration count and confirm cancellation to the user.

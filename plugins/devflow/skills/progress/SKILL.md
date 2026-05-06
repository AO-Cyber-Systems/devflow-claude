---
name: progress
description: |
  DEPRECATED — use `/devflow:status` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:status` (default subcommand — shows progress).
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log progress --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:progress is DEPRECATED.
    Use /devflow:status instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:status` (no subcommand — defaults to progress workflow) and let it run.
</process>

---
name: health
description: |
  DEPRECATED — use `/devflow:status check` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: "[--repair] [--migrate] [--dry-run]"
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:status check`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log health --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:health is DEPRECATED.
    Use /devflow:status check instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:status check $ARGUMENTS` and let it run.
</process>

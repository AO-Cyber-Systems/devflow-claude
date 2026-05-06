---
name: pause-work
description: |
  DEPRECATED — use `/devflow:status pause` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:status pause`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log pause-work --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:pause-work is DEPRECATED.
    Use /devflow:status pause instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:status pause` and let it run.
</process>

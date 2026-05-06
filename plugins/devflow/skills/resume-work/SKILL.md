---
name: resume-work
description: |
  DEPRECATED — use `/devflow:status resume` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:status resume`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log resume-work --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:resume-work is DEPRECATED.
    Use /devflow:status resume instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:status resume` and let it run.
</process>

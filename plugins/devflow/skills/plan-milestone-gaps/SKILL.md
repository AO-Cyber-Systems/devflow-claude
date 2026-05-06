---
name: plan-milestone-gaps
description: |
  DEPRECATED — use `/devflow:milestone gaps` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
disable-model-invocation: true
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:milestone gaps`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log plan-milestone-gaps --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:plan-milestone-gaps is DEPRECATED.
    Use /devflow:milestone gaps instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:milestone gaps $ARGUMENTS` and let it run.
</process>

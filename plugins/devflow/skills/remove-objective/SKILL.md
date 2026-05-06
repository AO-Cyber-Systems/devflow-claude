---
name: remove-objective
description: |
  DEPRECATED — use `/devflow:objective remove` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: <phase-number>
disable-model-invocation: true
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:objective remove`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log remove-objective --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:remove-objective is DEPRECATED.
    Use /devflow:objective remove instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:objective remove $ARGUMENTS` and let it run.
</process>

---
name: insert-objective
description: |
  DEPRECATED — use `/devflow:objective insert` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: <after> <description>
disable-model-invocation: true
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:objective insert`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log insert-objective --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:insert-objective is DEPRECATED.
    Use /devflow:objective insert instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:objective insert $ARGUMENTS` and let it run.
</process>

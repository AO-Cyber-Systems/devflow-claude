---
name: add-objective
description: |
  DEPRECATED — use `/devflow:objective add` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: <description>
disable-model-invocation: true
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:objective add`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log add-objective --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:add-objective is DEPRECATED.
    Use /devflow:objective add instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:objective add $ARGUMENTS` and let it run.
</process>

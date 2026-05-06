---
name: add-todo
description: |
  DEPRECATED — use `/devflow:todo add` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: "[description]"
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:todo add`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log add-todo --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:add-todo is DEPRECATED.
    Use /devflow:todo add instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:todo add $ARGUMENTS` and let it run.
</process>

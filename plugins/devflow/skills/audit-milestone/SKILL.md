---
name: audit-milestone
description: |
  DEPRECATED — use `/devflow:milestone audit` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: "[version]"
disable-model-invocation: true
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:milestone audit`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log audit-milestone --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:audit-milestone is DEPRECATED.
    Use /devflow:milestone audit instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:milestone audit $ARGUMENTS` and let it run.
</process>

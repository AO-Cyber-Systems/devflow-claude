---
name: new-milestone
description: |
  DEPRECATED — use `/devflow:milestone new` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: "[milestone name]"
disable-model-invocation: true
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:milestone new`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log new-milestone --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:new-milestone is DEPRECATED.
    Use /devflow:milestone new instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:milestone new $ARGUMENTS` and let it run.
</process>

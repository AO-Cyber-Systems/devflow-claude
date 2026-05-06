---
name: complete-milestone
description: |
  DEPRECATED — use `/devflow:milestone complete` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: <version>
disable-model-invocation: true
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:milestone complete`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log complete-milestone --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:complete-milestone is DEPRECATED.
    Use /devflow:milestone complete instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:milestone complete $ARGUMENTS` and let it run.
</process>

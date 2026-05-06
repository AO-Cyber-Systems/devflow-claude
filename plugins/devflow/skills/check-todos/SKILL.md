---
name: check-todos
description: |
  DEPRECATED — use `/devflow:todo list` instead. Will be removed in v3.0.
  This redirect logs a deprecation entry and forwards to the consolidated skill.
argument-hint: "[--all] [--refresh] [--lane blocked|now|soon|ideas] [--raw]"
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Forwards to `/devflow:todo list`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log check-todos --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:check-todos is DEPRECATED.
    Use /devflow:todo list instead.
    This shim will be removed in v3.0.
```

**3. Forward to consolidated skill:**

Invoke `/devflow:todo list $ARGUMENTS` and let it run.
</process>

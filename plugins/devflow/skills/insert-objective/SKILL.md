---
name: insert-objective
description: |
  DEPRECATED — decimal objectives removed in v1.2 (TRD 12-06, I2 survey: 0% usage).
  Use `/devflow:objective add <description>` to append a new integer objective instead.
  This redirect logs a deprecation entry.
argument-hint: <after> <description>
disable-model-invocation: true
allowed-tools:
  - Bash
  - SlashCommand
---

<objective>
DEPRECATED redirect. Decimal objective insertion was removed in v1.2. Instructs user to use `objective add`.
</objective>

<process>
**1. Log deprecation:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs deprecation log insert-objective --raw > /dev/null
```

**2. Display deprecation notice to user:**

```
/devflow:insert-objective is DEPRECATED and has been removed in v1.2.
    Decimal objectives are no longer supported (0% usage across all projects — TRD 12-06 I2 survey).
    Use /devflow:objective add <description> to add a new objective at the end of the roadmap.
```

**3. Do NOT forward to objective insert** — it will return a deprecation error.
Stop after the notice above.
</process>

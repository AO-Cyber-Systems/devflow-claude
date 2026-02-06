---
description: Run build verification checks before completing a TRD
invocation: proactive
triggers:
  - before marking a TRD as complete
  - when asked to verify the build
  - after implementing a feature
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh *)
  - Read
  - Write
---

# Verification Skill

Run build verification checks to ensure code quality before marking work complete.

## When to Use

Invoke this skill **automatically**:
1. Before marking any TRD status as "complete"
2. After implementing a feature and before committing
3. When the user asks to verify or check the build

## How to Run

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh run
```

For specific categories:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh run unit
${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh run lint
${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh run type_check
${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh run build
```

## Interpreting Results

- **Exit 0**: All checks passed - safe to proceed
- **Exit 1**: One or more checks failed - fix before completing

## If Checks Fail

1. Read the failure output to identify the issue
2. Fix the code causing the failure
3. Re-run verification
4. Only mark TRD complete when all checks pass

## If No verification.json Exists

Initialize it first:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh init
```

This creates `.devflow/verification.json` with sensible defaults that auto-detect your project type.

## Integration with Autonomous Loop

Before completing a TRD:
1. Run `verify.sh run`
2. If any required check fails, do NOT mark TRD complete
3. Fix the issues
4. Re-run verification
5. Only proceed when exit code is 0

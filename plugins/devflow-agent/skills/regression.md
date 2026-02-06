---
description: Run anti-regression tests to prevent breaking existing functionality
invocation: proactive
triggers:
  - before starting work on a new TRD
  - before marking a TRD as complete
  - after completing a TRD (to add new tests)
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh *)
  - Read
  - Write
---

# Regression Testing Skill

Run the anti-regression test suite to ensure new changes don't break existing functionality.

## When to Use

Invoke this skill **automatically**:

### Before Starting a New TRD
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh run
```
Ensures the codebase is healthy before you make changes.

### Before Marking TRD Complete
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh run
```
Ensures your changes didn't break anything.

### After Marking TRD Complete
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh add TRD-XXX
```
Adds tests from the completed TRD to the regression suite.

## How to Run

Run all regression tests:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh run
```

Run specific test type:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh run unit
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh run integration
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh run e2e
```

Continue on failure (run all tests):
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh run --continue
```

## Interpreting Results

- **Exit 0**: All tests passed - safe to proceed
- **Exit 1**: Tests failed - you broke something, fix it

## If Tests Fail

1. Identify which test failed from the output
2. Check the test's source TRD to understand what it tests
3. Fix your code to not break the existing functionality
4. Re-run regression tests
5. Only proceed when all tests pass

## After Completing a TRD

Always add the TRD's tests to the regression suite:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh add TRD-XXX
```

This extracts tests from the TRD's "Regression Tests to Add" section and registers them.

## If No Regression Tests Exist

That's fine - the suite starts empty and accumulates tests as TRDs are completed. Just skip running if `.devflow/regression/manifest.json` doesn't exist or has no tests.

## Autonomous Loop Integration

1. **Start of TRD**: Run regression suite (if tests exist)
2. **Implement feature**: Do the work
3. **Before completion**: Run regression suite again
4. **After completion**: Add TRD's tests to regression suite
5. **Move to next TRD**: Repeat

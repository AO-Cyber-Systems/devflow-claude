---
description: Execute UI tests using Playwright MCP tools
invocation: proactive
triggers:
  - when a TRD has UI test scenarios defined
  - before marking a TRD with UI tests as complete
  - when asked to run UI tests
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/uitest.sh *)
  - Read
  - mcp__plugin_playwright_playwright__browser_navigate
  - mcp__plugin_playwright_playwright__browser_snapshot
  - mcp__plugin_playwright_playwright__browser_click
  - mcp__plugin_playwright_playwright__browser_type
  - mcp__plugin_playwright_playwright__browser_wait_for
  - mcp__plugin_playwright_playwright__browser_take_screenshot
  - mcp__plugin_playwright_playwright__browser_fill_form
  - mcp__plugin_playwright_playwright__browser_evaluate
  - mcp__plugin_playwright_playwright__browser_close
  - mcp__plugin_playwright_playwright__browser_console_messages
---

# UI Testing Skill

Execute UI tests defined in TRDs using Playwright MCP tools.

## When to Use

Invoke this skill **automatically**:
1. When a TRD has a "## UI Test Scenarios" section with YAML content
2. Before marking such a TRD as complete
3. When capturing baselines for the first time

## Workflow

### 1. Check if TRD Has UI Tests

Read the TRD and look for the "## UI Test Scenarios" section. If it has YAML content with `ui_tests:`, run the tests.

### 2. Get Test Instructions

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/uitest.sh run "Scenario Name" --trd TRD-XXX
```

This outputs the sequence of Playwright MCP tool calls to make.

### 3. Execute the Tests

For each step, use the appropriate Playwright MCP tool:

| Action | Tool |
|--------|------|
| `navigate` | `mcp__plugin_playwright_playwright__browser_navigate` |
| `snapshot` | `mcp__plugin_playwright_playwright__browser_snapshot` |
| `click` | `mcp__plugin_playwright_playwright__browser_click` |
| `type` | `mcp__plugin_playwright_playwright__browser_type` |
| `wait_for` | `mcp__plugin_playwright_playwright__browser_wait_for` |
| `screenshot` | `mcp__plugin_playwright_playwright__browser_take_screenshot` |
| `fill_form` | `mcp__plugin_playwright_playwright__browser_fill_form` |

### 4. Execution Pattern

```
1. browser_navigate to the URL
2. browser_snapshot to get the page state and element refs
3. Use refs from snapshot for click/type actions
4. browser_wait_for to wait for expected content
5. browser_snapshot or browser_take_screenshot for verification
```

**Important**: Always call `browser_snapshot` before `browser_click` or `browser_type` to get the current element refs.

## Baseline Capture (First Run)

For new UI tests, capture baselines:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/uitest.sh baseline TRD-XXX
```

Then execute the scenarios and save screenshots to the baseline paths shown.

## Comparing Against Baselines

On subsequent runs, compare screenshots against baselines in:
`.devflow/regression/baselines/TRD-XXX/`

## Example Execution

Given this TRD scenario:
```yaml
ui_tests:
  - name: "Login flow"
    steps:
      - action: navigate
        url: "http://localhost:5173/login"
      - action: snapshot
        name: "login-page"
      - action: type
        element: "input[name='email']"
        text: "test@example.com"
      - action: click
        element: "button[type='submit']"
      - action: wait_for
        text: "Dashboard"
```

Execute:
1. `browser_navigate` with url "http://localhost:5173/login"
2. `browser_snapshot` - note the refs for input and button
3. `browser_type` with ref from snapshot, text "test@example.com"
4. `browser_click` with ref for submit button
5. `browser_wait_for` with text "Dashboard"

## If UI Tests Fail

1. Check console messages: `browser_console_messages`
2. Take a screenshot of the failure state
3. Fix the UI code
4. Re-run the test

## Autonomous Loop Integration

When working on a TRD:
1. Check if TRD has UI test scenarios
2. If yes, after implementing the feature, run all UI tests
3. If any fail, fix and re-test
4. Only mark TRD complete when UI tests pass

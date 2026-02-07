---
description: Coordinate Playwright MCP UI tests from TRDs
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/uitest.sh *)
  - Read
  # Playwright MCP - Full Browser Automation Suite
  - mcp__plugin_playwright_playwright__browser_navigate
  - mcp__plugin_playwright_playwright__browser_navigate_back
  - mcp__plugin_playwright_playwright__browser_snapshot
  - mcp__plugin_playwright_playwright__browser_click
  - mcp__plugin_playwright_playwright__browser_type
  - mcp__plugin_playwright_playwright__browser_hover
  - mcp__plugin_playwright_playwright__browser_drag
  - mcp__plugin_playwright_playwright__browser_select_option
  - mcp__plugin_playwright_playwright__browser_fill_form
  - mcp__plugin_playwright_playwright__browser_wait_for
  - mcp__plugin_playwright_playwright__browser_take_screenshot
  - mcp__plugin_playwright_playwright__browser_evaluate
  - mcp__plugin_playwright_playwright__browser_console_messages
  - mcp__plugin_playwright_playwright__browser_network_requests
  - mcp__plugin_playwright_playwright__browser_tabs
  - mcp__plugin_playwright_playwright__browser_press_key
  - mcp__plugin_playwright_playwright__browser_handle_dialog
  - mcp__plugin_playwright_playwright__browser_file_upload
  - mcp__plugin_playwright_playwright__browser_resize
  - mcp__plugin_playwright_playwright__browser_run_code
  - mcp__plugin_playwright_playwright__browser_close
  - mcp__plugin_playwright_playwright__browser_install
slash-command-tools: hidden
---

# UI Test Coordinator (Playwright MCP)

Run the UI test coordinator:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/uitest.sh $ARGUMENTS
```

## Commands

| Command | Description |
|---------|-------------|
| `list` | List UI test scenarios from TRDs |
| `extract <trd-id>` | Extract scenarios to JSON |
| `run <scenario>` | Get Playwright MCP instructions |
| `baseline <trd-id>` | Get baseline capture instructions |
| `compare <trd-id>` | Get comparison instructions |

## Examples

```bash
# List all UI test scenarios
/devflow:uitest list

# Extract scenarios from TRD
/devflow:uitest extract TRD-001

# Get instructions for running a scenario
/devflow:uitest run "Login flow"

# Get baseline capture instructions
/devflow:uitest baseline TRD-001
```

## How It Works

1. **Define scenarios** in TRD's "UI Test Scenarios" YAML block
2. **Extract scenarios** to get Playwright MCP tool call sequences
3. **Execute** using the Playwright MCP tools
4. **Capture baselines** on first run
5. **Compare** against baselines for regression testing

## Scenario YAML Format

In TRD under "## UI Test Scenarios":

```yaml
ui_tests:
  - name: "Login flow"
    description: "Verify login works"
    steps:
      - action: navigate
        url: "http://localhost:5173/login"
      - action: snapshot
        name: "login-page"
      - action: type
        element: "input[name='email']"
        text: "test@example.com"
      - action: type
        element: "input[name='password']"
        text: "password123"
      - action: click
        element: "button[type='submit']"
        description: "Login button"
      - action: wait_for
        text: "Dashboard"
      - action: snapshot
        name: "after-login"
    baseline_path: "baselines/TRD-001/login"
```

## Supported Actions

| Action | Parameters | Playwright MCP Tool |
|--------|------------|---------------------|
| `navigate` | `url` | `browser_navigate` |
| `navigate_back` | - | `browser_navigate_back` |
| `snapshot` | `name` | `browser_snapshot` |
| `click` | `element`, `description` | `browser_click` |
| `type` | `element`, `text` | `browser_type` |
| `hover` | `element` | `browser_hover` |
| `drag` | `start`, `end` | `browser_drag` |
| `select` | `element`, `values[]` | `browser_select_option` |
| `wait_for` | `text` or `time` | `browser_wait_for` |
| `screenshot` | `filename` | `browser_take_screenshot` |
| `fill_form` | `fields[]` | `browser_fill_form` |
| `evaluate` | `function` | `browser_evaluate` |
| `press_key` | `key` | `browser_press_key` |
| `upload` | `paths[]` | `browser_file_upload` |
| `resize` | `width`, `height` | `browser_resize` |
| `tabs` | `action` | `browser_tabs` |
| `console` | - | `browser_console_messages` |
| `network` | - | `browser_network_requests` |
| `dialog` | `accept`, `text` | `browser_handle_dialog` |

## Workflow

1. Define UI tests in TRD
2. Run `/devflow:uitest run <scenario>` to get instructions
3. Execute Playwright MCP tools as instructed
4. After TRD complete, add to regression suite
5. Future runs compare against baselines

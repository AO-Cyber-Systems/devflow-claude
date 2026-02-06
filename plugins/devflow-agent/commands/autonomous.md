---
description: Start unlimited autonomous development loop with task-driven workflow
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/setup-autonomous.sh *)
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh *)
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh *)
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/uitest.sh *)
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/features.sh *)
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/trd.sh *)
  - Read
  - Write
  - Glob
  - Grep
  # Native Claude Code Tools
  - Task
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - EnterPlanMode
  - ExitPlanMode
  # Playwright MCP - Browser Automation (Full Suite)
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
  # Git MCP - Version Control
  - mcp__git__git_status
  - mcp__git__git_diff
  - mcp__git__git_diff_staged
  - mcp__git__git_log
  - mcp__git__git_show
  - mcp__git__git_commit
  - mcp__git__git_add
  - mcp__git__git_branch
  # Filesystem MCP - Enhanced File Operations
  - mcp__filesystem__read_file
  - mcp__filesystem__read_multiple_files
  - mcp__filesystem__write_file
  - mcp__filesystem__list_directory
  - mcp__filesystem__search_files
  - mcp__filesystem__get_file_info
  # Fetch MCP - API Testing
  - mcp__fetch__fetch
slash-command-tools: hidden
---

# DevFlow Autonomous Mode

Initialize the autonomous development loop:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/setup-autonomous.sh $ARGUMENTS
```

## How This Works

1. The stop hook prevents you from exiting until tasks are complete
2. Each iteration, you work on the next incomplete task
3. Progress is tracked via the task file (feature_list.json, prd.json, etc.)
4. Loop runs UNLIMITED by default - only stops when genuinely complete
5. **Subagents** handle implementation with isolated context (prevents context bloat)

## Architecture: Orchestrator + Subagents

You are the **orchestrator**. Your job is to:
- Manage the task queue (TaskCreate, TaskUpdate, TaskList)
- Delegate implementation to specialized subagents
- Track progress and handle failures
- Keep your context clean for coordination

**Available Subagents:**
| Agent | Purpose | When to Use |
|-------|---------|-------------|
| `trd-designer` | Design TRDs with codebase exploration | New feature requests |
| `trd-implementer` | Implement a single TRD | Each TRD implementation |
| `code-reviewer` | Review code quality/security | After implementation |
| `debugger` | Investigate and fix failures | Test failures, errors |

## Your Workflow Per TRD

### 1. Create Native Task for Tracking
```
TaskCreate: "Implement TRD-XXX: Feature Name"
```

### 2. Check Baseline Health
Run regression tests to ensure codebase is healthy:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh run
```

### 3. Delegate to trd-implementer Subagent
Spawn the subagent with the TRD path:
```
Task(subagent_type: "trd-implementer"):
  Implement the TRD at .devflow/trds/TRD-XXX-name.md
  Follow all acceptance criteria and run verification before completion.
```

The subagent works in **isolated context** - verbose output stays there, only summary returns.

### 4. Review Results (Optional)
For critical features, spawn code-reviewer:
```
Task(subagent_type: "code-reviewer"):
  Review the changes for TRD-XXX. Focus on security and code quality.
```

### 5. Handle Failures
If subagent reports failure, spawn debugger:
```
Task(subagent_type: "debugger"):
  Investigate test failure: [error message]
  Find root cause and fix.
```

### 6. Update Task Status
```
TaskUpdate(taskId: "X", status: "completed")
```

Also update TRD and feature list:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/trd.sh status XXX complete
${CLAUDE_PLUGIN_ROOT}/scripts/features.sh sync
```

### 7. Add to Regression Suite
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh add TRD-XXX
```

### 8. Continue to Next Task
Check TaskList for next pending task, repeat.

## Plan Mode for New TRDs

When designing a new TRD (not implementing), use Plan Mode:
```
EnterPlanMode
  → Explore codebase
  → Design TRD structure
  → Identify files to modify
ExitPlanMode
  → Present plan for approval
```

Or delegate to trd-designer subagent:
```
Task(subagent_type: "trd-designer"):
  Design a TRD for: [feature description]
  Explore the codebase first to understand existing patterns.
```

## Completion Gates

The loop ends when ALL of these are true:
- All tasks in task file have `status: "complete"`
- Verification checks pass
- Regression tests pass (if configured)

OR:
- You output `<promise>COMPLETION_PHRASE</promise>` (if configured)
- Max iterations reached (if configured)

## Quick Reference

| Action | Command/Tool |
|--------|--------------|
| Create task | `TaskCreate` |
| Update task | `TaskUpdate` |
| List tasks | `TaskList` |
| Spawn implementer | `Task(subagent_type: "trd-implementer")` |
| Spawn reviewer | `Task(subagent_type: "code-reviewer")` |
| Spawn debugger | `Task(subagent_type: "debugger")` |
| Run verification | `verify.sh run` |
| Run regression | `regression.sh run` |
| View TRD | `trd.sh view XXX` |
| Complete TRD | `trd.sh status XXX complete` |
| Sync features | `features.sh sync` |

## Context Management Best Practices

1. **Use subagents for implementation** - keeps orchestrator context clean
2. **Delegate verbose operations** - test runs, file exploration go to subagents
3. **Keep orchestrator focused** - task management, status tracking, decisions
4. **Subagent memory persists** - they learn patterns across TRDs
5. **Review subagent summaries** - don't ask for full details unless needed

## IMPORTANT

- Use subagents for TRD implementation (isolated context)
- Run regression tests BEFORE starting each TRD
- Run verification BEFORE marking TRD complete
- Run UI tests if TRD has UI scenarios
- Add completed TRD's tests to regression suite
- Do NOT output completion promise unless genuinely complete
- Trust the process - iterate until success

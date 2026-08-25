---
name: verify-work
description: |
  Test what was built by walking through expected behavior and checking it matches reality.
  Use when the user wants to test, verify, or validate what was built in an objective.
  Triggers on: "test what we built", "verify objective", "check the work", "UAT", "does it work?", "let's test", "validate the implementation"
argument-hint: "[objective number, e.g., '4']"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Edit
  - Write
  - Task
  - mcp__plugin_playwright_playwright__browser_navigate
  - mcp__plugin_playwright_playwright__browser_snapshot
  - mcp__plugin_playwright_playwright__browser_take_screenshot
  - mcp__plugin_playwright_playwright__browser_click
  - mcp__plugin_playwright_playwright__browser_fill_form
  - mcp__plugin_playwright_playwright__browser_wait_for
  - mcp__plugin_playwright_playwright__browser_tabs
  - mcp__plugin_playwright_playwright__browser_close
  - mcp__maestro__*
---
<objective>
Validate built features through conversational testing with persistent state.

Purpose: Confirm what Claude built actually works from user's perspective. One test at a time, plain text responses, no interrogation. When issues are found, automatically diagnose, plan fixes, and prepare for execution.

Output: {phase_num}-UAT.md tracking all test results. If issues found: diagnosed gaps, verified fix plans ready for /devflow:execute-objective
</objective>

<execution_context>
@~/.claude/devflow/workflows/verify-work.md
@~/.claude/devflow/templates/UAT.md
</execution_context>

<context>
Objective: $ARGUMENTS (optional)
- If provided: Test specific objective (e.g., "4")
- If not provided: Check for active sessions or prompt for objective

@.planning/STATE.md
@.planning/ROADMAP.md
</context>


<deployment_verification>

If the objective touched manifests, env vars, secrets, certificates,
cross-service calls or tenant provisioning, source-level verification is not
sufficient — those failures only appear once deployed. When a local
deployment-test environment (devcluster) is installed, run it as part of
verification and report its JSON result. When it is not, state that deployment
was not verified rather than implying it was.

See @~/.claude/devflow/references/deployment-verification.md for detection, the commands to run
in cost order, how to read the JSON, and what it explicitly cannot prove.

</deployment_verification>

<process>
Execute the verify-work workflow from @~/.claude/devflow/workflows/verify-work.md end-to-end.
Preserve all workflow gates (session management, test presentation, diagnosis, fix planning, routing).
</process>

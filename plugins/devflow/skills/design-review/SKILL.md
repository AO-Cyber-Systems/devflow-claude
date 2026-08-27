---
name: design-review
description: |
  Run the ADVISORY UI design-critique sweep on a Flutter surface or objective: capture (or reuse) each declared UI state, critique it against the project design system through the design-critic engine, and present a prioritized design-debt list.
  This is advisory design critique — it NEVER gates. The heavy first-run produces a ranked design-debt backlog whose high-priority items feed the objective-work loop.
  Use when the user wants a design review, design critique, polish pass, or design-debt audit of a UI surface.
  Triggers on: "design review", "design-review", "critique the design", "design debt", "polish pass", "how's the design", "review the UI design"
argument-hint: "[objective number, manifest path, or surface]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Task
  - mcp__plugin_playwright_playwright__browser_navigate
  - mcp__plugin_playwright_playwright__browser_snapshot
  - mcp__plugin_playwright_playwright__browser_take_screenshot
  - mcp__plugin_playwright_playwright__browser_click
  - mcp__plugin_playwright_playwright__browser_wait_for
  - mcp__plugin_playwright_playwright__browser_close
---
<objective>
Produce a prioritized, ADVISORY design-debt list for a Flutter UI surface (or whole objective) by capturing each declared state and critiquing it against the project design system through the already-shipped design-critic engine.

Purpose: Where `/devflow:ui-eval` answers "is this screen BROKEN?" (and gates), this sweep answers "is this GOOD design, and how do we improve it?" — and NEVER gates. The heavy first-run produces a ranked design-debt backlog; its high-priority items become candidate todos / future UI objectives in the objective-work loop.

Output: `design-review-report.md` + `design-review-report.json` next to the manifest, plus an advisory rollup of design debt sorted high→low.
</objective>

<execution_context>
@~/.claude/devflow/workflows/design-review.md
</execution_context>

<context>
Objective, manifest, or surface: $ARGUMENTS (optional)
- If an objective number is provided: review that objective's UI surfaces (e.g., "4").
- If a manifest path is provided: review exactly that surface manifest (single-surface design pass).
- If a surface/route is provided: capture + review that one surface.
- If not provided: locate the active objective's design-review manifest; if none, report SKIPPED cleanly.

The design-critic ENGINE is already shipped
(`plugins/devflow/devflow/bin/lib/flutter-ui-design-review.cjs`) with the `df-ui-evaluator` model
profile and the df-tools arm `flutter-ui design-review <manifest> [--live] [--raw]`. It runs ONE
qualitative critique per state (NOT N-voted — design critique is a single pass), aggregates a
prioritized design-debt list, and writes the report next to the manifest. It emits `advisory:true`
ALWAYS and never sets a pass/fail gate. This skill consumes that engine; it does not re-implement the
critique and does not pick a vision model id.

@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>
Execute the design-review workflow from @~/.claude/devflow/workflows/design-review.md end-to-end.

This is the HEAVY first-run sweep:
1. Capture or reuse screenshots for each declared state.
2. Run `df-tools flutter-ui design-review <manifest> --live --raw` (the live critique pass).
3. Present the prioritized design-debt report.

State clearly to the user that the result is ADVISORY — it NEVER gates — and that high-priority design-debt
items feed the objective-work loop as candidate todos / future UI objectives.

For a deep sweep (capture + critique + report + a ≤300-token rollup), spawn the `ui-evaluator` agent via
the Task tool with the resolved manifest path; otherwise run the workflow steps inline for a quick
single-surface design pass.

Preserve the SKIPPED fall-through on a missing/invalid manifest (never a hard fail), and never present the
report as a gate.
</process>

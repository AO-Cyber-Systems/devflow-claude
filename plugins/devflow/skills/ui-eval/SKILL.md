---
name: ui-eval
description: |
  Run the UI visual-evaluation pipeline on a Flutter surface or objective: capture each declared UI state, score it through the offline visual-eval engine, and write machine-judged evidence the verifier consumes.
  Use when the user wants to visually evaluate, judge, or dogfood a UI surface's rendered states.
  Triggers on: "visual eval", "evaluate the UI", "ui-eval", "judge the screens", "check the visuals", "does this screen look right?"
argument-hint: "[objective number or manifest path]"
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
Machine-judge the visual correctness of a Flutter UI surface (or whole objective) by capturing each declared state and scoring it through the already-shipped offline visual-eval engine.

Purpose: Visual correctness the verifier always escalated to a human (verifier Step 9) becomes machine-judged. A clean surface drops off the human-verification list; a real defect lands as a `gaps:` entry with screenshot evidence. Standalone-invocable for dogfooding a single surface.

Output: per-state `*.judge.json` + `ui-eval-report.json` under `.planning/objectives/<obj>/evidence/ui_eval/`, plus a verdict rollup.
</objective>

<execution_context>
@~/.claude/devflow/workflows/ui-eval.md
</execution_context>

<context>
Objective or manifest: $ARGUMENTS (optional)
- If an objective number is provided: evaluate that objective's UI surfaces (e.g., "4").
- If a manifest path is provided: evaluate exactly that surface manifest (single-surface dogfood).
- If not provided: locate the active objective's ui_eval manifest; if none, report SKIPPED cleanly.

The scoring engine is already shipped (`plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs`) with the
`df-ui-evaluator` model profile and the df-tools arms
`verify flutter-ui-eval <manifest> [--raw]` / `flutter-ui eval <manifest> [--raw]`. Both emit a
`scoreRun` rollup `{ verdict: 'pass'|'pass-with-reviews'|'fail', counts, reviews[], fails[], states[] }`
from the OFFLINE label-echo judge (network:false). This skill consumes that engine; it does not
re-implement scoring and does not pick a vision model id.

@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>
Execute the ui-eval workflow from @~/.claude/devflow/workflows/ui-eval.md end-to-end.
Preserve the verdict→action mapping (fail→gaps, review→notes, pass→drop-from-human-verify) and the
SKIPPED fall-through on a missing/invalid manifest (never a hard fail).

For deep judgement (capture + score + evidence write + ≤300-token rollup), spawn the `ui-evaluator`
agent via the Task tool with the resolved manifest path; otherwise run the workflow steps inline for a
quick single-surface dogfood.
</process>

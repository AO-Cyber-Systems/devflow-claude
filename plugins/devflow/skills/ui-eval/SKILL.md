---
name: ui-eval
description: |
  Run the UI visual-evaluation pipeline on a Flutter surface or objective: capture each declared UI state and score it. Default (no --judge, or --judge labels) is an ADVISORY offline label-echo lookup (no network, no real vision comparison) — it can never clear a surface from human verification. Only --judge live (a real Anthropic vision call) produces a BINDING gate.
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
Judge the visual correctness of a Flutter UI surface (or whole objective) by capturing each declared state and scoring it through the already-shipped visual-eval engine — offline (advisory, default) or live (binding, opt-in via `--judge live`).

Purpose: a `gate: 'binding'` clean pass (real vision comparison, `--judge live`) is the ONLY result that may drop a surface off the verifier's Step 9 human-verification list; a real defect lands as a `gaps:` entry with screenshot evidence regardless of gate. The default `gate: 'advisory'` path (offline label-echo, no network) is a labels lookup for dogfooding and fast iteration — it surfaces defects it can detect from the label, but a clean advisory pass NEVER clears human verification (aodex#485: an unjudged/label-only pass must not be mistaken for a machine-verified one). Standalone-invocable for dogfooding a single surface.

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
`verify flutter-ui-eval <manifest> [--raw] [--judge live|labels]` / `flutter-ui eval <manifest> [--raw] [--judge live|labels]`.
Both emit a `scoreRun` rollup
`{ verdict: 'pass'|'pass-with-reviews'|'fail', gate: 'binding'|'advisory', counts, reviews[], fails[], unjudged[], states[] }`.
`gate` is the run's STANDING, not its outcome: `'binding'` ONLY when invoked with `--judge live`
(a real Anthropic vision comparison per state); `'advisory'` on the default (no `--judge`, or
`--judge labels`) offline label-echo path (network:false) — a labels lookup, never a visual gate,
regardless of how clean its verdict is. An unrecognised `--judge` value is rejected with a usage
error rather than silently falling through to the offline path. This skill consumes that engine;
it does not re-implement scoring and does not pick a vision model id.

@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>
Execute the ui-eval workflow from @~/.claude/devflow/workflows/ui-eval.md end-to-end.
Preserve the verdict→action mapping (fail→gaps, review/unjudged→notes, `gate: 'binding'` pass only→
drop-from-human-verify; a `gate: 'advisory'` pass ALWAYS stays on the human-verification list) and
the SKIPPED fall-through on a missing/invalid manifest (never a hard fail).

For deep judgement (capture + score + evidence write + ≤300-token rollup), spawn the `ui-evaluator`
agent via the Task tool with the resolved manifest path; otherwise run the workflow steps inline for a
quick single-surface dogfood.
</process>

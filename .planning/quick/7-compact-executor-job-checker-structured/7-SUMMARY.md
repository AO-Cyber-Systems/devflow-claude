---
quick: 7
type: standard
status: complete
tags: [agent-prompts, efficiency, cache-replay, structured-returns]
files_modified:
  - plugins/devflow/agents/executor.md
  - plugins/devflow/agents/job-checker.md
key_files:
  modified:
    - plugins/devflow/agents/executor.md
    - plugins/devflow/agents/job-checker.md
decisions:
  - Preserve full Commits list with hashes verbatim in executor return — orchestrator depends on it for continuation tracking
  - Preserve prose Blockers + Warnings sub-blocks and Structured Issues YAML block verbatim in job-checker ISSUES FOUND — orchestrator parses these for revision feedback to planner
  - Replace tabular Confidence Assessment with single numeric line ("{avg}/10 (lowest plan: {low}/10)") preserving avg + lowest signal
metrics:
  duration_sec: 53
  tasks_completed: 2
  files_touched: 2
  commits: 2
completed: 2026-05-08
---

# Quick Job 7: Compact executor + job-checker structured-return templates — Summary

Per-invocation cache-replay cost reduced for the executor and job-checker structured-return templates. Both files now carry an explicit `Return budget: <=300 tokens` directive at the top of their return blocks; job-checker drops three table-shaped sections in favour of a single numeric confidence line while keeping every orchestrator-parsed prose / YAML block verbatim.

## What changed

**executor.md `<completion_format>` (light-touch additive):**
- Added `Return budget: <=300 tokens` directive line above the markdown fence.
- Strengthened the trailing "Include ALL commits" instruction with an explicit DO-NOT clause: "DO NOT include task tables, deviations narrative, or evidence bullets — those live in SUMMARY.md."
- Load-bearing template body left untouched: `## TRD COMPLETE` heading, `**TRD:**`, `**Tasks:**`, `**SUMMARY:**`, full **Commits:** list with hashes, `**Duration:**`.
- Net LOC delta: +3 lines, -1 line, +1 line modified. Body unchanged.

**job-checker.md `<structured_returns>`:**
- Added `Return budget: <=300 tokens` directive line at top of block.
- VERIFICATION PASSED template cut from ~30 lines to ~7. Removed: `**Status:** All checks passed`, `### Coverage Summary` table, `### Plan Summary` table, tabular `### Confidence Assessment`. Added: single `**Confidence:** {avg}/10 (lowest plan: {low}/10)` line. Retained: conditional `{If any plan <7: Recommendation: ...}` line + trailing run-cmd hint.
- ISSUES FOUND template: prose `### Blockers (must fix)` and `### Warnings (should fix)` sub-blocks unchanged verbatim (orchestrator parses these). `### Structured Issues` YAML block unchanged verbatim. Tabular `### Confidence Assessment` removed and replaced with single `**Confidence:** {avg}/10` line near the top. Trailing prose `### Recommendation` block collapsed to single line `{N} blocker(s) require revision.` Removed `**Plans checked:** {N}` line (low-signal — orchestrator already knows).
- Net LOC delta: ~30 lines removed, ~2 lines added. Block reduced by ~25 lines.

## Why

Continuation of quick-6 (commits `cb63b2e`, `62f0171`, `7534214`) which compacted planner / researcher / verifier structured returns. Same lever: agent return messages are cache-replayed every orchestrator turn, so verbose templates × N spawns × N turns is real per-invocation cost. Per finding F5 in `~/.claude/devflow-efficiency-handoff.md`. These two agents close item 7 fully.

## Deviations from Plan

None — JOB executed exactly as written. No bugs found, no missing critical functionality, no blocking issues, no architectural changes needed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Compact executor `<completion_format>` | `git diff plugins/devflow/agents/executor.md` | 0 | PASS |
| 2: Compact job-checker `<structured_returns>` | `git diff plugins/devflow/agents/job-checker.md` | 0 | PASS |

Visual diff confirmed for both:
- Task 1: Budget directive at top; template body (TRD COMPLETE heading, identifier, tasks count, SUMMARY path, full Commits list with hashes, Duration) unchanged; "Include ALL commits" guidance strengthened with DO-NOT clause. No other section touched.
- Task 2: Budget directive at top; VERIFICATION PASSED cut >50%, tables removed, numeric Confidence line + conditional Recommendation retained; ISSUES FOUND prose Blockers + Warnings + Structured Issues YAML preserved verbatim, tabular Confidence replaced with numeric line, trailing Recommendation prose collapsed. No other section touched.

## Success criteria

- [x] executor.md `<completion_format>` block has Return budget directive at top.
- [x] executor.md preserves Tasks count, SUMMARY path, full commits list with hashes, Duration.
- [x] executor.md "Include ALL commits" guidance strengthened with DO-NOT clause for task tables / deviations / evidence bullets.
- [x] job-checker.md `<structured_returns>` block has Return budget directive at top.
- [x] job-checker.md VERIFICATION PASSED cut >50%; tables removed; single numeric Confidence line replaces tabular block; conditional research Recommendation line retained.
- [x] job-checker.md ISSUES FOUND prose Blockers sub-block unchanged verbatim.
- [x] job-checker.md ISSUES FOUND prose Warnings sub-block unchanged verbatim.
- [x] job-checker.md ISSUES FOUND Structured Issues YAML block unchanged verbatim.
- [x] job-checker.md ISSUES FOUND tabular Confidence Assessment removed and replaced with single numeric line.
- [x] job-checker.md ISSUES FOUND trailing Recommendation prose collapsed to single line.
- [x] No other sections of either agent file modified.
- [x] No workflow files modified.
- [x] Visual diff matches the per-task verification criteria.

## Commits

- `92a5ded`: feat(quick-7): compact executor completion_format block
- `f1304e4`: feat(quick-7): compact job-checker structured_returns block

## Post-job Verification

- Auto-fix cycles used: 0
- Must-haves verified: 11/11
- Gate failures: None

## Self-Check: PASSED

- File `plugins/devflow/agents/executor.md` exists and contains the budget directive + DO-NOT clause.
- File `plugins/devflow/agents/job-checker.md` exists and contains budget directive + compacted templates.
- Commit `92a5ded` exists in git log.
- Commit `f1304e4` exists in git log.

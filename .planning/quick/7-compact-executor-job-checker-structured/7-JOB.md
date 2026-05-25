---
quick: 7
type: standard
files_modified:
  - plugins/devflow/agents/executor.md
  - plugins/devflow/agents/job-checker.md
autonomous: true
must_haves:
  - executor.md `<completion_format>` block carries explicit "Return budget: <=300 tokens" directive at top.
  - executor.md `<completion_format>` block strengthens the "Include ALL commits" guidance and adds an explicit DO-NOT clause for task tables / deviations narrative / evidence bullets (those live in SUMMARY.md).
  - executor.md `<completion_format>` block PRESERVES the current loadbearing structure (objective/TRD identifier, Tasks count, SUMMARY path, full commits list with hashes + messages, Duration). LOC barely changes.
  - job-checker.md `## VERIFICATION PASSED` template compacted >50%; Coverage Summary table, Plan Summary table, and tabular Confidence Assessment are removed; replaced with single numeric confidence line ("Confidence: {avg_score}/10 (lowest plan: {low_score}/10)").
  - job-checker.md `## VERIFICATION PASSED` retains the conditional `{If any plan <7: Recommendation: ...}` line and the trailing run-cmd hint.
  - job-checker.md `## ISSUES FOUND` template PRESERVES verbatim the prose "### Blockers (must fix)" sub-block and "### Warnings (should fix)" sub-block (orchestrator parses these for revision feedback to planner).
  - job-checker.md `## ISSUES FOUND` template PRESERVES the "### Structured Issues" YAML block (canonical issue format).
  - job-checker.md `## ISSUES FOUND` template REMOVES the tabular Confidence Assessment (replaced with single numeric confidence line) and removes the trailing prose Recommendation block.
  - job-checker.md `<structured_returns>` block carries explicit "Return budget: <=300 tokens" directive at top, phrased to fit the file's existing style.
  - No edits outside the named blocks. Other agent sections (execution_flow, success_criteria, anti_patterns, role, etc.) untouched. Workflow files untouched. Other agents untouched.
---

# Quick Job: Compact executor + job-checker structured-return templates

## Why

Continuation of quick-6 (commits cb63b2e, 62f0171, 7534214) which compacted planner / researcher / verifier structured returns. Same lever: agent return messages get cache-replayed every orchestrator turn, so verbose templates x N spawns x N turns is a real per-invocation cost. Per finding F5 in `~/.claude/devflow-efficiency-handoff.md`. These two agents close item 7 fully.

## Out of Scope

- Other sections of either agent file (execution_flow, success_criteria, anti_patterns, role, etc.).
- Workflow files.
- The 3 agents already compacted in quick-6 (planner, researcher, verifier).
- Tests — there are no tests for prompt-shape assertions; verification is visual diff only.

## Tasks

<task type="auto">
  <name>Compact executor `<completion_format>` block (light-touch additive)</name>
  <files>plugins/devflow/agents/executor.md</files>
  <action>
Edit the `<completion_format>` block (currently at lines ~623-639). The current template is already relatively terse (~13 lines); this is a light-touch additive edit, NOT a rewrite.

PRESERVE these load-bearing elements verbatim — orchestrator depends on them for multi-step continuations:
  - The `## TRD COMPLETE` heading
  - `**TRD:** {objective}-{trd}` identifier line
  - `**Tasks:** {completed}/{total}` line
  - `**SUMMARY:** {path to SUMMARY.md}` line
  - The full **Commits:** list block with `{hash}: {message}` bullets (orchestrator needs ALL hashes for continuation tracking — this MUST stay)
  - `**Duration:** {time}` line
  - The trailing instruction line "Include ALL commits (previous + new if continuation agent)."

ADD at the top of `<completion_format>`, BEFORE the markdown code fence — phrased to fit the existing terse style:

```
Return budget: <=300 tokens. Orchestrator cache-replays this every turn.
```

ADD immediately after the closing markdown fence (replacing or augmenting the existing single-line "Include ALL commits..." sentence) the following clarification — strengthen the existing guidance without removing it:

```
Include ALL commit hashes (previous + new) — orchestrator needs them for continuation tracking. DO NOT include task tables, deviations narrative, or evidence bullets — those live in SUMMARY.md.
```

LOC for this block barely changes; the template body is unchanged. This is purely additive directive guidance.

# CRITICAL: Do NOT touch any other section of executor.md (execution_flow, success_criteria, anti_patterns, role, etc.).
# CRITICAL: The Commits list with full hashes is load-bearing for the continuation-agent flow — DO NOT compact or summarize it.
# PATTERN: Mirrors the directive style applied in quick-6 to planner / researcher / verifier.
  </action>
  <verify>
Visual diff:
  `git diff plugins/devflow/agents/executor.md`
Confirm:
  - Budget directive line present at top of `<completion_format>` block.
  - Existing template body (TRD COMPLETE heading + identifier + tasks count + SUMMARY path + full Commits list with hashes + Duration) is unchanged.
  - "Include ALL commit hashes" guidance present and strengthened with the explicit DO-NOT clause covering task tables / deviations narrative / evidence bullets.
  - No other section of executor.md modified.
LOC delta is small (~3 added lines, 1 modified line).
  </verify>
  <done>
executor.md `<completion_format>` block carries the budget directive at top and the strengthened "Include ALL commits + DO-NOT-include-X" guidance at bottom. The load-bearing template body (objective/TRD id, tasks count, SUMMARY path, full commits list with hashes, duration) is unchanged. No other parts of the file touched.
  </done>
</task>

<task type="auto">
  <name>Compact job-checker `<structured_returns>` block (cut tables, preserve revision-feedback prose)</name>
  <files>plugins/devflow/agents/job-checker.md</files>
  <action>
Edit the `<structured_returns>` block (currently at lines ~563-640). Two sub-templates inside are reshaped; one orchestrator-parsed prose section is preserved verbatim.

ADD at the top of `<structured_returns>`, immediately under the opening tag, in the style of the rest of the file:

```
Return budget: <=300 tokens. Orchestrator cache-replays this every turn.
```

REPLACE the entire `## VERIFICATION PASSED` markdown code-fenced template (currently ~30 lines) with this compacted shape:

```markdown
## VERIFICATION PASSED

**Objective:** {phase-name}
**Plans verified:** {N}
**Confidence:** {avg_score}/10 (lowest plan: {low_score}/10)

{If any plan <7: **Recommendation:** Consider `/devflow:research-objective` for {topic} before execution.}

Plans verified. Run `/devflow:execute-objective {objective}` to proceed.
```

This removes:
  - The `**Status:** All checks passed` line (redundant with heading).
  - The `### Coverage Summary` table.
  - The `### Plan Summary` table.
  - The tabular `### Confidence Assessment` block.
And replaces the tabular confidence with a single numeric line preserving avg + lowest signal.

REPLACE the `## ISSUES FOUND` markdown code-fenced template (currently ~37 lines) with this compacted shape, taking care to preserve the prose Blockers + Warnings sub-blocks and the Structured Issues YAML block VERBATIM (orchestrator parses these for revision feedback to the planner — load-bearing for the revision loop):

```markdown
## ISSUES FOUND

**Objective:** {phase-name}
**Issues:** {X} blocker(s), {Y} warning(s), {Z} info
**Confidence:** {avg_score}/10

### Blockers (must fix)

**1. [{dimension}] {description}**
- Plan: {plan}
- Task: {task if applicable}
- Fix: {fix_hint}

### Warnings (should fix)

**1. [{dimension}] {description}**
- Plan: {plan}
- Fix: {fix_hint}

### Structured Issues

(YAML issues list using format from Issue Format above)

{N} blocker(s) require revision.
```

This preserves:
  - Prose Blockers sub-block (verbatim — load-bearing).
  - Prose Warnings sub-block (verbatim — load-bearing).
  - Structured Issues YAML block (verbatim — canonical issue format).
And removes:
  - The `**Plans checked:** {N}` line (low-signal; orchestrator already knows).
  - The tabular `### Confidence Assessment` block (replaced with single numeric line at the top).
  - The trailing prose `### Recommendation` block ("{N} blocker(s) require revision. Returning to planner with feedback.") — collapsed into a single trailing line.

# CRITICAL: The prose Blockers + Warnings sub-blocks and the Structured Issues YAML block are parsed by the orchestrator for revision feedback to the planner — DO NOT alter their shape, headings, or bullet structure.
# CRITICAL: Do NOT touch any other section of job-checker.md (execution_flow, success_criteria, anti_patterns, role, issue_structure, dimension definitions, etc.).
# GOTCHA: The conditional `{If any plan <7: ...}` line in VERIFICATION PASSED stays — it is the only signal flagging risky plans for the user.
# PATTERN: Mirrors the directive + table-cut style applied in quick-6 to verifier's structured returns.
  </action>
  <verify>
Visual diff:
  `git diff plugins/devflow/agents/job-checker.md`
Confirm:
  - Budget directive line present at top of `<structured_returns>` block.
  - VERIFICATION PASSED template cut by >50% — Coverage Summary, Plan Summary, tabular Confidence Assessment all removed; replaced with single numeric Confidence line; conditional Recommendation line and trailing run-cmd hint retained.
  - ISSUES FOUND template: prose `### Blockers (must fix)` and `### Warnings (should fix)` sub-blocks unchanged verbatim; `### Structured Issues` YAML block unchanged verbatim; tabular Confidence Assessment removed and replaced with single numeric Confidence line near the top; trailing Recommendation prose collapsed into "{N} blocker(s) require revision."
  - No other section of job-checker.md modified.
Estimated LOC delta: ~30 lines removed (tables + redundant prose), ~2 lines added (budget directive + numeric confidence line). Net reduction in `<structured_returns>` block ~25 lines.
  </verify>
  <done>
job-checker.md `<structured_returns>` block carries the budget directive at top. VERIFICATION PASSED template is compacted >50% to a single numeric confidence line plus the conditional research recommendation. ISSUES FOUND template preserves the prose Blockers + Warnings + Structured Issues YAML blocks verbatim, replaces the tabular Confidence Assessment with a single numeric line, and collapses the trailing Recommendation prose into one line. No other parts of the file touched.
  </done>
</task>

## Verification

Visual diff only — no test infrastructure for prompt-shape assertions.

```bash
git diff plugins/devflow/agents/executor.md plugins/devflow/agents/job-checker.md
```

Pass criteria:
- executor.md: budget directive added at top of `<completion_format>`; "Include ALL commits" guidance preserved + strengthened with DO-NOT clause; load-bearing template body unchanged.
- job-checker.md: budget directive added at top of `<structured_returns>`; VERIFICATION PASSED cut >50% to numeric confidence + conditional recommendation; ISSUES FOUND preserves prose Blockers + Warnings + Structured Issues YAML verbatim, replaces tabular Confidence with numeric line, collapses trailing Recommendation prose.
- No edits outside the two named blocks in either file.

## Success criteria

- [ ] executor.md `<completion_format>` block has Return budget directive at top.
- [ ] executor.md preserves Tasks count, SUMMARY path, full commits list with hashes, Duration.
- [ ] executor.md "Include ALL commits" guidance strengthened with DO-NOT clause for task tables / deviations / evidence bullets.
- [ ] job-checker.md `<structured_returns>` block has Return budget directive at top.
- [ ] job-checker.md VERIFICATION PASSED cut >50%; tables removed; single numeric Confidence line replaces tabular block; conditional research Recommendation line retained.
- [ ] job-checker.md ISSUES FOUND prose Blockers sub-block unchanged verbatim.
- [ ] job-checker.md ISSUES FOUND prose Warnings sub-block unchanged verbatim.
- [ ] job-checker.md ISSUES FOUND Structured Issues YAML block unchanged verbatim.
- [ ] job-checker.md ISSUES FOUND tabular Confidence Assessment removed and replaced with single numeric line.
- [ ] job-checker.md ISSUES FOUND trailing Recommendation prose collapsed to single line.
- [ ] No other sections of either agent file modified.
- [ ] No workflow files modified.
- [ ] Visual diff matches the per-task verification criteria.

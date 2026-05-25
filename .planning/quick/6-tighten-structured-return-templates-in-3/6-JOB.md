---
quick: 6-tighten-structured-return-templates-in-3
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/agents/planner.md
  - plugins/devflow/agents/objective-researcher.md
  - plugins/devflow/agents/verifier.md
autonomous: true
must_haves:
  - planner.md "Planning Complete" + "Gap Closure Plans Created" templates compacted to ~paths-only shape
  - objective-researcher.md "Research Complete" template compacted to ~6 lines
  - verifier.md "Verification Complete" template compacted to ~7 lines
  - All 3 files gain explicit "Return budget: ≤300 tokens" directive introducing the structured-return block
  - planner.md "Checkpoint Reached / Revision Complete" 1-line pointer preserved unchanged
  - objective-researcher.md "Research Blocked" template preserved unchanged
  - verifier.md "DO NOT COMMIT" directive (line ~578) preserved unchanged
  - Each diff reduces structured-return LOC by >50%
---

<objective>
Tighten the structured-return templates in 3 DevFlow agents (planner, objective-researcher, verifier) so the messages they return to the orchestrator are ≤300 tokens each. Detail already lives on disk in TRD/RESEARCH/VERIFICATION artifacts; the orchestrator can read those files when needed. Verbose return templates × N spawns × N orchestrator turns = significant cache-read cost (Mark observed 52% of $400 in a 2-day session was cache-read per finding F5 in `~/.claude/devflow-efficiency-handoff.md`).

This is a behavior-changing prompt edit. Verification is visual diff review and observed return length in a real spawn next session — no test infrastructure exists for prompt-shape assertions.
</objective>

<embedded_context>

<codebase_examples>
The 3 agent files follow a consistent structure: each has a `<structured_returns>` (planner, researcher) or `<output>` "Return to Orchestrator" (verifier) block near the bottom containing markdown templates the agent produces as its final message. The templates today are verbose (20-30 lines each) with tables, prose, and "Next Steps" sections.

The compaction pattern: collapse to (1) status header, (2) one-line key fields (objective, count, paths), (3) one-line pointer to disk artifact, (4) one-line next-action. Drop tables, drop prose, drop commentary. The orchestrator and user can read the disk artifact for full detail.
</codebase_examples>

<anti_patterns>
- DO NOT modify any other section of these agent files (execution_flow, success_criteria, role, philosophy, etc.) — only the structured-returns / output block.
- DO NOT touch workflow files (`plugins/devflow/devflow/workflows/*.md`) or other agents (executor, job-checker, integration-checker, codebase-mapper, security-auditor, etc.).
- DO NOT add unit tests — no test infrastructure exists for prompt-shape assertions, and the task explicitly says "no tests for this change."
- DO NOT remove the preserved bits: planner's "Checkpoint Reached / Revision Complete" pointer, researcher's "Research Blocked" template, verifier's "DO NOT COMMIT" directive on line ~578.
- DO NOT compact "Research Blocked" — already terse, leave alone.
</anti_patterns>

<error_recovery>
If a section header doesn't match expected line number after edits to other parts of the file, re-grep for the section heading text (`## Planning Complete`, `## Research Complete`, `## Verification Complete`) rather than trusting line numbers. Use `grep -n` to relocate before editing.

If `Edit` tool reports "string not unique" for a template fragment, expand the search string to include surrounding context (preceding heading + following blank line) until unique.
</error_recovery>

</embedded_context>

<file_tree>
plugins/devflow/agents/
├── planner.md                   ← MODIFY (structured_returns block ~lines 1120-1172)
├── objective-researcher.md      ← MODIFY (structured_returns block ~lines 331-376)
└── verifier.md                  ← MODIFY (output > Return to Orchestrator ~lines 576-608)
</file_tree>

<gotchas>
- Line numbers in the task brief are approximate. The agent files have been edited recently; do not trust line numbers — search by heading text.
- Each file's structured-return block has its own surrounding XML tag style: planner uses `<structured_returns>`, researcher uses `<structured_returns>`, verifier uses `<output>` with a "Return to Orchestrator" sub-section. The "≤300 tokens" budget directive should be inserted as a paragraph INSIDE that block, just above the first template, phrased to fit each file's existing prose voice.
- Preserve any verbatim text the brief calls out: planner line 1168-1170 (Checkpoint Reached pointer), researcher's "Research Blocked" sub-template, verifier line ~578 ("DO NOT COMMIT").
</gotchas>

<task type="auto">
<name>Compact planner.md structured_returns block</name>
<files>plugins/devflow/agents/planner.md</files>
<action>
Locate the `<structured_returns>` block in `/Users/markemerson/Source/devflow-claude/plugins/devflow/agents/planner.md` (around line 1120, after the `## Planning Complete` heading inside the block).

1. Insert this budget directive as the FIRST paragraph inside `<structured_returns>` (immediately after the opening tag, before any `## Planning Complete` heading):

   ```
   **Return budget: ≤300 tokens.** Detail lives on disk; the orchestrator reads TRD artifacts for full content. DO NOT include task tables, key decisions, file lists, wave breakdowns, or commentary in the return — only the structured fields below.
   ```

2. Replace the existing "Planning Complete" sub-template (the one with the "Wave Structure" table + "TRDs Created" table + "Next Steps" prose) with this compact version:

   ```markdown
   ## PLANNING COMPLETE

   **Objective:** {phase-name}
   **Plans:** {N} TRDs in {M} waves at:
   - {paths-list, one per line, no detail}

   Read `{paths}` for wave/confidence/files/dependencies. Run `/devflow:execute-objective {objective}` to begin.
   ```

3. Replace the existing "Gap Closure Plans Created" sub-template with the same shape — TRD count + paths-list + read-disk-for-detail + next command. Drop the "Gaps Addressed" table:

   ```markdown
   ## GAP CLOSURE PLANS CREATED

   **Objective:** {phase-name}
   **Closing:** {N} gaps from {VERIFICATION|UAT}.md
   **Plans:** {M} TRDs at:
   - {paths-list, one per line}

   Read `{paths}` for gap details. Run `/devflow:execute-objective {objective} --gaps-only` to begin.
   ```

4. Leave the "Checkpoint Reached / Revision Complete" reference (line ~1168-1170 — already a 1-line pointer to other sections) UNCHANGED.

# CRITICAL: Do not modify any text outside the `<structured_returns>` block — execution_flow, success_criteria, role, etc. are out of scope.
# GOTCHA: Line numbers are approximate; locate by heading text (`## Planning Complete`, `## Gap Closure Plans Created`).
# PATTERN: Use the Edit tool with sufficient surrounding context to ensure each replacement is unique.
</action>
<verify>
After editing, run:

```bash
grep -n "Return budget" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/planner.md
grep -n "PLANNING COMPLETE" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/planner.md
grep -n "GAP CLOSURE PLANS CREATED" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/planner.md
grep -n "Checkpoint Reached / Revision Complete" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/planner.md
```

Expected:
- "Return budget" appears once inside `<structured_returns>`.
- "PLANNING COMPLETE" still present (in compacted template).
- "GAP CLOSURE PLANS CREATED" still present (in compacted template).
- "Checkpoint Reached / Revision Complete" reference still present unchanged.

Visually inspect the diff: the two replaced templates should be ≤8 lines each (header + 2-3 fields + pointer + next-action), down from ~22 lines.
</verify>
<done>
- planner.md has `≤300 tokens` budget directive inside `<structured_returns>`.
- "Planning Complete" template is ≤8 lines (was ~22).
- "Gap Closure Plans Created" template is ≤8 lines (was ~15).
- "Checkpoint Reached / Revision Complete" 1-line pointer preserved.
- LOC reduction in `<structured_returns>` block: >50%.
- No other sections of planner.md modified.
</done>
<recovery>
If edits accidentally cross out of the `<structured_returns>` block: `git restore plugins/devflow/agents/planner.md` and retry with stricter scoping (smaller Edit string ranges, more context anchors).
</recovery>
</task>

<task type="auto">
<name>Compact objective-researcher.md structured_returns block</name>
<files>plugins/devflow/agents/objective-researcher.md</files>
<action>
Locate the `<structured_returns>` block in `/Users/markemerson/Source/devflow-claude/plugins/devflow/agents/objective-researcher.md` (around line 331).

1. Insert this budget directive as the FIRST paragraph inside `<structured_returns>` (immediately after the opening tag, before any `## Research Complete` heading):

   ```
   **Return budget: ≤300 tokens.** Detail lives on disk in RESEARCH.md; the planner reads it for full content. DO NOT include findings, decision tables, library lists, or commentary in the return — only the structured fields below.
   ```

2. Replace the existing "Research Complete" sub-template (~26 lines) with this compact version:

   ```markdown
   ## RESEARCH COMPLETE

   **Objective:** {objective_number} - {objective_name}
   **Confidence:** [HIGH|MEDIUM|LOW]
   **Path:** $OBJECTIVE_DIR/$PADDED_OBJECTIVE-RESEARCH.md
   **Open questions:** {N} (see RESEARCH.md "Open Questions" section)

   Planner can proceed.
   ```

3. Leave the "Research Blocked" sub-template UNCHANGED — already terse per task brief.

# CRITICAL: Preserve "Research Blocked" verbatim — it's already minimal.
# GOTCHA: Locate by heading text (`## Research Complete`, `## Research Blocked`), not line numbers.
</action>
<verify>
After editing, run:

```bash
grep -n "Return budget" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/objective-researcher.md
grep -n "RESEARCH COMPLETE" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/objective-researcher.md
grep -n "Research Blocked" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/objective-researcher.md
```

Expected:
- "Return budget" appears once inside `<structured_returns>`.
- "RESEARCH COMPLETE" still present (in compacted template).
- "Research Blocked" sub-template still present unchanged.

Visually inspect the diff: the replaced "Research Complete" template should be ≤7 lines (was ~26).
</verify>
<done>
- objective-researcher.md has `≤300 tokens` budget directive inside `<structured_returns>`.
- "Research Complete" template is ≤7 lines (was ~26).
- "Research Blocked" template preserved unchanged.
- LOC reduction in `<structured_returns>` block: >50%.
- No other sections of objective-researcher.md modified.
</done>
<recovery>
If "Research Blocked" gets accidentally modified: `git restore plugins/devflow/agents/objective-researcher.md` and retry, scoping the Edit to only the "Research Complete" block (anchor on `## Research Complete` heading + the "Next Steps" closing line).
</recovery>
</task>

<task type="auto">
<name>Compact verifier.md "Return to Orchestrator" template</name>
<files>plugins/devflow/agents/verifier.md</files>
<action>
Locate the "Return to Orchestrator" section in `/Users/markemerson/Source/devflow-claude/plugins/devflow/agents/verifier.md` (around line 576-608, inside the `<output>` block).

1. Insert this budget directive as a paragraph immediately above the existing "Verification Complete" template (and below the "DO NOT COMMIT" directive, which lives at line ~578):

   ```
   **Return budget: ≤300 tokens.** Detail lives on disk in VERIFICATION.md; the orchestrator reads it for full content. DO NOT include must-have tables, gap details, or commentary in the return — only the structured fields below.
   ```

2. Replace the existing "Verification Complete" template (~25 lines) with this compact version:

   ```markdown
   ## VERIFICATION COMPLETE

   **Status:** {passed | gaps_found | human_needed}
   **Score:** {N}/{M} must-haves verified
   **Report:** .planning/objectives/{objective_dir}/{phase_num}-VERIFICATION.md

   {If gaps_found:} {N} gaps in VERIFICATION.md frontmatter (use `/devflow:plan-objective --gaps` to close).
   {If human_needed:} {N} items need human testing; see VERIFICATION.md "Human Verification" section.
   ```

3. PRESERVE the "DO NOT COMMIT" directive on line ~578 verbatim — that's load-bearing for the orchestrator's commit flow.

# CRITICAL: "DO NOT COMMIT" directive at line ~578 must remain — orchestrator depends on it.
# GOTCHA: Locate by heading text (`## Verification Complete`, `DO NOT COMMIT`), not line numbers.
# PATTERN: Insert budget directive AFTER "DO NOT COMMIT" so the commit-flow guidance comes first.
</action>
<verify>
After editing, run:

```bash
grep -n "Return budget" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/verifier.md
grep -n "VERIFICATION COMPLETE" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/verifier.md
grep -n "DO NOT COMMIT" /Users/markemerson/Source/devflow-claude/plugins/devflow/agents/verifier.md
```

Expected:
- "Return budget" appears once inside the `<output>` block.
- "VERIFICATION COMPLETE" still present (in compacted template).
- "DO NOT COMMIT" directive still present on line ~578.

Visually inspect the diff: the replaced "Verification Complete" template should be ≤8 lines (was ~25).
</verify>
<done>
- verifier.md has `≤300 tokens` budget directive inside the `<output>` block.
- "Verification Complete" template is ≤8 lines (was ~25).
- "DO NOT COMMIT" directive preserved unchanged on line ~578.
- LOC reduction in "Return to Orchestrator" section: >50%.
- No other sections of verifier.md modified.
</done>
<recovery>
If "DO NOT COMMIT" directive gets accidentally modified or removed: `git restore plugins/devflow/agents/verifier.md` and retry. Scope the Edit string to begin AFTER the "DO NOT COMMIT" line and end at the closing `</output>` tag boundary.
</recovery>
</task>

<verification>

## Visual Diff Review (manual)

Run after all 3 tasks complete:

```bash
git diff plugins/devflow/agents/planner.md plugins/devflow/agents/objective-researcher.md plugins/devflow/agents/verifier.md
```

Confirm for each file:
- [ ] `**Return budget: ≤300 tokens.**` directive added inside the structured-returns / output block.
- [ ] Replaced template is ≤8 lines (down from 22-26).
- [ ] LOC reduction >50% in the affected block.
- [ ] No edits outside the structured-returns / output block.

Confirm preserved bits:
- [ ] planner.md: "Checkpoint Reached / Revision Complete" 1-line pointer untouched.
- [ ] objective-researcher.md: "Research Blocked" sub-template untouched.
- [ ] verifier.md: "DO NOT COMMIT" directive on line ~578 untouched.

## Cost-Impact Validation (deferred)

This is a prompt-shape change. Real cost impact requires observing return length in a live spawn next session. SUMMARY.md should note: "Cost-impact validation deferred to next planning session — observe orchestrator cache-read in `/devflow:build` or `/devflow:plan-objective` run to confirm return-token reduction."

</verification>

<success_criteria>
- All 3 agent files have a `**Return budget: ≤300 tokens.**` directive introducing their structured-return block.
- planner.md "Planning Complete" template is paths-only shape, ≤8 lines.
- planner.md "Gap Closure Plans Created" template is paths-only shape, ≤8 lines.
- objective-researcher.md "Research Complete" template is ≤7 lines.
- verifier.md "Verification Complete" template is ≤8 lines.
- LOC reduction >50% in each affected structured-return block.
- planner.md "Checkpoint Reached / Revision Complete" pointer preserved.
- objective-researcher.md "Research Blocked" template preserved.
- verifier.md "DO NOT COMMIT" directive preserved.
- No edits outside the targeted blocks.
- No new tests added (per task brief — no test infrastructure for prompt-shape assertions).
</success_criteria>

<output>
3 modified agent files:
- `plugins/devflow/agents/planner.md`
- `plugins/devflow/agents/objective-researcher.md`
- `plugins/devflow/agents/verifier.md`

Each with compacted structured-return template and explicit ≤300-token budget directive. Visual diff review confirms preserved sections (Checkpoint Reached pointer, Research Blocked template, DO NOT COMMIT directive). Cost-impact validation deferred to next live spawn session.
</output>

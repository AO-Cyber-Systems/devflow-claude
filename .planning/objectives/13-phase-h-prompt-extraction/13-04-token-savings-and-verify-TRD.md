---
objective: 13-phase-h-prompt-extraction
trd: 04
type: standard
confidence: high
wave: 3
depends_on: [13-01, 13-02, 13-03]
files_modified:
  - .planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md
autonomous: true
requirements:
  - PHASE-H-MEASUREMENT
  - PHASE-H-BACKCOMPAT
validation_gates:
  test: "npm test"
must_haves:
  truths:
    - "Line-count delta computed across all 7 edited agent files (planner, job-checker, debugger, objective-researcher, verifier, project-researcher, codebase-mapper)"
    - "Total token-savings estimate computed (≥25k token target from quality_gate)"
    - "All 1471 tests still pass — no behavior regressions"
    - "Inline-vs-on-disk template content drift verified (project-researcher's 5 templates + codebase-mapper's 8 templates compared against on-disk versions)"
    - "@-reference resolvability verified (every @-ref in edited agents points to a file that actually exists in plugins/devflow/devflow/)"
    - "Final SUMMARY.md exists at .planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md with all metrics"
  artifacts:
    - path: ".planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md"
      provides: "Token-savings measurement + back-compat verification report for the entire Phase H objective"
      min_lines: 60
      contains: "Token Savings"
  key_links:
    - from: "13-04-SUMMARY.md"
      to: "TRDs 01-03 SUMMARYs"
      via: "Aggregated metrics across the objective"
      pattern: "13-0[1-3]-SUMMARY"
    - from: "All edited agents"
      to: "All new reference + template files"
      via: "@~-reference resolution check (every reference resolves to an existing file)"
      pattern: "@~/.claude/devflow/(references|templates)/.*\\.md"
---

<objective>
Measure token savings, verify back-compat, and write the final objective SUMMARY for Phase H.

Purpose: Close the Phase H quality gate. Produce the line-count delta + token-savings estimate (≥25k target). Re-verify all 1471 tests pass. Sanity-check that @-references resolve to existing files. Cross-check inline-vs-on-disk content drift flagged by TRD 03 (and decide if any follow-on work is needed).

Output: 13-04-SUMMARY.md with quantified results. No agent or reference file modifications — pure measurement + verification.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Existing token-savings + line-count measurement pattern (loose precedent — there's no formal helper, just `wc -l` and arithmetic). Example pattern from prior objectives:

```bash
# Baseline (pre-extraction)
wc -l plugins/devflow/agents/*.md > /tmp/baseline.txt

# Post (after edits)
wc -l plugins/devflow/agents/*.md > /tmp/post.txt

# Delta
diff /tmp/baseline.txt /tmp/post.txt
```

For Phase H specifically, the baselines are already captured in 13-RESEARCH.md (planner.md=1420, debugger.md=1198, etc.).

Token estimation rule of thumb: ~3 tokens per line of prose, ~4 tokens per line of code (denser tokens). Conservative average: 3.5 tokens/line. The TRD 04 measurement uses this approximation; exact tokens require a tokenizer (out of scope for this measurement).
</codebase_examples>

<anti_patterns>
- DO NOT modify any agent files in this TRD. Pure measurement.
- DO NOT modify any reference or template files in this TRD. If TRD 03 flagged content drift, document the drift and recommend follow-on work — don't try to reconcile it here.
- DO NOT skip the @-reference resolvability check. A dangling @-reference is a runtime regression that won't surface in `npm test` but will break agent spawns.
- DO NOT compute token savings using a tokenizer (out of scope; line-count × 3.5 is the agreed approximation).
</anti_patterns>

<error_recovery>
- **Tests fail**: Identify the failing test. If it's load-related (an agent fails to parse), check that the responsible TRD (02 or 03) didn't accidentally corrupt YAML frontmatter — `head -10 plugins/devflow/agents/<file>.md`. Rollback the offending edit via `git checkout` and re-run that TRD's task. Document in SUMMARY.
- **@-reference dangling**: List dangling references in SUMMARY with the file they appear in + the missing target. Recommend a hot-fix TRD (typo correction or missing file creation).
- **Total line cut < 25k tokens equivalent (≈7000 lines)**: Unlikely given expected ~2000-line cut * 3.5 tokens = ~7000 tokens — but the quality_gate target is per-spawn savings, NOT total cut. Per-spawn: each `/devflow:build` spawns ~5-10 agents; if those agents collectively shed ~700+ lines (cumulative across spawns) the savings bracket starts. The savings number to surface is **the worst-case single-spawn cut** (debugger alone: ≥613 lines = ≈2150 tokens) and **the typical /devflow:build savings** (planner + executor + verifier + project-researcher + codebase-mapper = approx (266 + 0 + 137 + 429 + 504) lines = ~1336 lines = ~4700 tokens per build). Surface BOTH numbers in SUMMARY. If quality_gate's "≥25k token delta across all edited agents" reading is correct, our gross delta of ~2000 lines × 3.5 = 7000 tokens FALLS SHORT of 25k — flag this discrepancy in SUMMARY and recommend the user re-read planning_context to confirm interpretation. Possible reinterpretation: "25k tokens saved across many `/devflow:build` invocations cumulative" rather than "25k saved in a single invocation".
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/13-phase-h-prompt-extraction/13-CONTEXT.md
@.planning/objectives/13-phase-h-prompt-extraction/13-RESEARCH.md
@.planning/objectives/13-phase-h-prompt-extraction/13-01-SUMMARY.md
@.planning/objectives/13-phase-h-prompt-extraction/13-02-SUMMARY.md
@.planning/objectives/13-phase-h-prompt-extraction/13-03-SUMMARY.md
</context>

<gotchas>
- **The full line-count delta should match expectations from 13-RESEARCH.md** (~2011 lines net cut). If observed delta differs by >20%, investigate which TRD's actual edit diverged from plan.
- **Token estimation is approximate**. Use 3.5 tokens/line as the standard. Surface BOTH "raw line cut" and "estimated token savings" so the user can verify our methodology.
- **@-reference resolvability is a STRONG check**. Every `@~/.claude/devflow/<path>` in any edited agent file MUST correspond to an existing file in `plugins/devflow/devflow/<path>`. Use `find` + `grep` to enumerate.
- **Inline-vs-on-disk content drift is the most likely real risk**. If TRD 03 flagged drift, this TRD must compute the diff size for each affected template and recommend either: (a) accept the drift (on-disk wins, was already canonical), (b) update on-disk template to match inline (rare; only if inline had improvements), or (c) flag a follow-on TRD if reconciliation is non-trivial.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Compute line-count delta + token-savings estimate across all 7 edited agents</name>
  <files>.planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md</files>
  <action>
Compute the measurement metrics. No file edits to source code; only writes 13-04-SUMMARY.md.

Approach:

1. **Baseline (from 13-RESEARCH.md):**
   ```
   codebase-mapper.md:      812
   debugger.md:            1198
   job-checker.md:          689
   objective-researcher.md: 488
   planner.md:             1420
   project-researcher.md:   618
   verifier.md:             697
   TOTAL baseline:         5922
   ```

2. **Post-edit measurement:**
   ```bash
   wc -l plugins/devflow/agents/{codebase-mapper,debugger,job-checker,objective-researcher,planner,project-researcher,verifier}.md
   ```
   Capture each line count + total.

3. **Per-file delta + token estimate:**
   ```
   delta_lines = baseline - post
   delta_tokens = delta_lines × 3.5
   ```
   Tabulate per-file. Total across 7 files.

4. **Per-spawn savings (the user-facing number):**
   - Worst-case single-spawn cut = max single-agent delta = debugger.md delta (expected ~613 lines = ~2150 tokens)
   - Typical /devflow:build savings = sum of {planner + executor + verifier + project-researcher + codebase-mapper deltas}. executor.md was NOT edited (delta = 0). Sum approx (266 + 0 + 137 + 429 + 504) lines = ~1336 lines = ~4676 tokens. (Adjust to actual measured numbers.)
   - Per-/devflow:build invocation, the savings compound across spawns; first-spawn cost dominates because subsequent spawns benefit from cached resolution.

5. **Write 13-04-SUMMARY.md:**

```markdown
# Objective 13 — Phase H Prompt Extraction: TRD 04 Summary

## Status

[ ] All 4 TRDs complete
[ ] All 1471 tests pass
[ ] All @-references resolve to existing files
[ ] Token-savings measurement complete

## Line-Count Delta

| Agent | Baseline | Post-edit | Delta (cut) | Token estimate (× 3.5) |
|---|---:|---:|---:|---:|
| planner.md             | 1420 | XXX | -YYY | ~ZZZ |
| debugger.md            | 1198 | XXX | -YYY | ~ZZZ |
| codebase-mapper.md     | 812  | XXX | -YYY | ~ZZZ |
| verifier.md            | 697  | XXX | -YYY | ~ZZZ |
| job-checker.md         | 689  | XXX | -YYY | ~ZZZ |
| project-researcher.md  | 618  | XXX | -YYY | ~ZZZ |
| objective-researcher.md| 488  | XXX | -YYY | ~ZZZ |
| **TOTAL**              | 5922 | XXX | -YYY | **~ZZZ** |

## Token Savings

- **Worst-case single-spawn cut** (debugger.md alone): ~XXX tokens
- **Typical `/devflow:build` invocation cut** (planner + verifier + project-researcher + codebase-mapper): ~XXX tokens
- **Total agent-bloat cut across all 7 edited files**: ~XXX tokens
- **Quality gate target**: ≥25k tokens
- **Status**: [met / fell short — explanation]

## Test Results

```
[paste npm test output summary]
```
- Total: X/Y passing
- Regressions: 0 expected (no behavior change; only content moved)

## @-Reference Resolvability

[Output of: for each @~/.claude/devflow/<path> in edited agents, verify plugins/devflow/devflow/<path> exists]

- Total @-references in edited agents: X
- Dangling: 0 (or list)

## Inline-vs-On-Disk Drift

[Cross-reference TRD 03 SUMMARY findings; if drift was flagged, list each affected template + recommendation]

## Decisions

[Any decisions made during measurement: e.g., interpreted "25k tokens" as cumulative savings across many invocations rather than single-invocation; surface for user awareness]

## Next Steps

[If quality gate met → mark objective complete; if not → flag follow-on TRD or revisit interpretation]
```

# CRITICAL: Use the actual measured numbers, not the estimates from 13-RESEARCH.md. Numbers come from `wc -l` on the actual post-edit files.
# GOTCHA: The 25k-token quality gate may be ambitious for a pure-extraction objective (gross cut estimated at ~7000 tokens with 3.5 tokens/line approximation). If we fall short, document the math and recommend the user clarify interpretation. Possible: gate intent is per-many-invocations cumulative, not single-invocation.
# PATTERN: Match the SUMMARY style of 12-07-SUMMARY.md (the most recent objective close-out).
  </action>
  <verify>
1. `ls .planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md` returns the file
2. `wc -l .planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md` returns ≥60
3. `grep "Token Savings\|Line-Count Delta\|@-Reference Resolvability" .planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md` returns ≥3 (all three sections present)
4. `grep "TOTAL" .planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md` finds the totals row
5. SUMMARY contains numerical data for all 7 agents (manually verify via reading the table)
  </verify>
  <done>
13-04-SUMMARY.md exists with: per-agent line-count table (7 rows + totals), token-savings estimate, test result summary, @-reference resolvability report, drift findings (if any), decisions section.
  </done>
  <recovery>
- If a `wc -l` command returns unexpected output (e.g. one of the agent files was deleted), the prior TRD failed catastrophically — `git status plugins/devflow/agents/` to investigate. STOP and revert if needed.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Verify @-reference resolvability + run full test suite + final back-compat check</name>
  <files>.planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md</files>
  <action>
Two-part verification: (1) @-reference resolvability + (2) full test suite. Append findings to 13-04-SUMMARY.md.

**Part 1 — @-Reference resolvability:**

```bash
# Enumerate all @~/.claude/devflow/<path> references in edited agents
grep -rh "@~/.claude/devflow/" plugins/devflow/agents/{planner,job-checker,debugger,objective-researcher,verifier,project-researcher,codebase-mapper}.md \
  | grep -oE "@~/.claude/devflow/[^\s]+\.md" \
  | sort -u > /tmp/refs.txt

# For each reference, check the source-of-truth file exists
while read ref; do
  path=$(echo "$ref" | sed 's|@~/.claude/devflow/|plugins/devflow/devflow/|')
  if [ -f "$path" ]; then
    echo "OK: $ref -> $path"
  else
    echo "MISSING: $ref -> $path"
  fi
done < /tmp/refs.txt > /tmp/refcheck.txt

# Surface dangling refs
grep "MISSING:" /tmp/refcheck.txt | wc -l  # must be 0
```

If dangling refs exist, list them in SUMMARY under "@-Reference Resolvability" and recommend a hot-fix TRD.

**Part 2 — Full test suite:**

```bash
cd /Users/markemerson/Source/devflow-claude-v1.1
npm test 2>&1 | tail -30
```

Expected: `1471 pass` (or 1471/1471 if some skip). If any fail, identify which test + the failure mode. If a test is unrelated to Phase H (e.g. flake), document and proceed. If related (e.g. agent fails to load), STOP and recommend rollback of the offending edit.

**Part 3 — Inline-vs-on-disk drift check (TRD 03 follow-up):**

If TRD 03's SUMMARY flagged any drift between an inline template (in agent BEFORE edit) and the on-disk template (at templates/codebase/* or templates/research-project/*), spot-check by:

```bash
# For each flagged template, confirm post-edit agent points to on-disk version
grep "@~/.claude/devflow/templates/<subdir>/<name>.md" plugins/devflow/agents/<agent>.md
ls plugins/devflow/devflow/templates/<subdir>/<name>.md
```

Document: drift was flagged by TRD 03; on-disk version is now canonical (since agent @-references resolve there); inline version is gone. If user wants to retroactively reconcile, flag follow-on TRD.

**Append all findings to 13-04-SUMMARY.md:**

Update the @-Reference Resolvability + Test Results + Inline-vs-On-Disk Drift sections with concrete data.

# CRITICAL: A failing test that's plausibly Phase-H-related (any agent-loading test, any markdown-parse test, any frontmatter validation test) is a STOP signal. Investigate before declaring victory.
# GOTCHA: `grep -rh @~/.claude/devflow/` may pick up references in code comments or examples — that's fine, they still need to resolve.
# PATTERN: Mirror Phase E (objective 10) and Phase G (objective 12) close-out verification rigor.
  </action>
  <verify>
1. SUMMARY's "@-Reference Resolvability" section reports a concrete count (X total / Y dangling)
2. SUMMARY's "Test Results" section reports actual `npm test` output (passing/failing counts)
3. If 0 dangling and tests pass: SUMMARY's "Status" checkboxes all checked
4. SUMMARY ends with a "Next Steps" section recommending objective complete or follow-on work
  </verify>
  <done>
@-reference resolvability verified (0 dangling expected); npm test result documented (1471/1471 expected); drift findings documented; SUMMARY complete and ready for objective close-out.
  </done>
  <recovery>
- If npm test fails on a Phase-H-related test, identify which TRD's edit broke it. `git log --oneline -10` to find the recent commits; `git diff <commit>~1 <commit>` to inspect. STOP and recommend hot-fix TRD before declaring objective complete.
- If @-reference is dangling, identify the missing file. Most likely cause: TRD 01 didn't create it OR a typo in the @-reference path. Hot-fix TRD: edit the agent to fix the typo, OR re-create the missing file from source.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. **13-04-SUMMARY.md exists with required sections:**
   ```bash
   grep -c "Line-Count Delta\|Token Savings\|Test Results\|@-Reference Resolvability\|Status\|Next Steps" .planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md
   ```
   Expected: ≥6 (all required sections present).

2. **Quantified token savings:**
   ```bash
   grep -E "[0-9]+ tokens|[0-9]+k tokens" .planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md
   ```
   Expected: at least 1 numeric token figure (per-spawn or total).

3. **All 7 agents accounted for in line-count table:**
   ```bash
   for agent in planner job-checker debugger objective-researcher verifier project-researcher codebase-mapper; do
     grep -c "$agent" .planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md
   done  # all return ≥1
   ```

4. **All tests still pass:**
   ```bash
   npm test 2>&1 | grep -E "[0-9]+ pass|[0-9]+ fail"
   ```
   Expected: 1471 pass (or 1471/1471), 0 fail (or only pre-existing unrelated failures noted).
</verification>

<success_criteria>
- 13-04-SUMMARY.md created with line-count delta, token-savings estimate, test results, @-reference resolvability report
- All 7 edited agents accounted for in the metrics table
- All @-references in edited agents resolve to existing files (0 dangling)
- `npm test` shows 1471/1471 passing (no regressions)
- If quality_gate target (≥25k tokens) was met → SUMMARY recommends objective complete
- If quality_gate target was not met → SUMMARY explains the gap, recommends interpretation clarification or follow-on TRD
- Single atomic commit covering 13-04-SUMMARY.md
- Output ends with `## PLANNING COMPLETE` (per quality_gate)
</success_criteria>

<output>
After completion, the file `.planning/objectives/13-phase-h-prompt-extraction/13-04-SUMMARY.md` IS the output of this TRD. No additional files.

The objective close-out (marking ROADMAP.md objective 4 as complete, updating STATE.md) happens in the orchestrator, not in this TRD.
</output>

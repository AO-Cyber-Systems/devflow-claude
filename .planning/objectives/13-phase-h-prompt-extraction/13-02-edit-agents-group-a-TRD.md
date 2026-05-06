---
objective: 13-phase-h-prompt-extraction
trd: 02
type: standard
confidence: high
wave: 2
depends_on: [13-01]
files_modified:
  - plugins/devflow/agents/planner.md
  - plugins/devflow/agents/job-checker.md
  - plugins/devflow/agents/debugger.md
  - plugins/devflow/agents/objective-researcher.md
  - plugins/devflow/agents/verifier.md
autonomous: true
requirements:
  - PHASE-H2-PLANNER
  - PHASE-H2-JOB-CHECKER
  - PHASE-H2-DEBUGGER
  - PHASE-H2-OBJECTIVE-RESEARCHER
  - PHASE-H2-VERIFIER-STUB
  - PHASE-H3-VERIFIER-TEMPLATE
validation_gates:
  test: "npm test"
must_haves:
  truths:
    - "planner.md no longer contains the inline <plan_format> body — replaced with @-reference to references/trd-spec.md"
    - "planner.md no longer contains the inline <goal_backward> body — replaced with @-reference to references/goal-backward.md"
    - "job-checker.md <core_principle> retains the verifier-vs-job-checker distinction inline but references goal-backward.md for the methodology"
    - "debugger.md no longer contains <hypothesis_testing> + <investigation_techniques> + <verification_patterns> + <research_vs_reasoning> bodies — replaced with single @-reference to references/debugging-methods.md"
    - "objective-researcher.md <tool_strategy>/<source_hierarchy>/<verification_protocol> bodies replaced with @-reference to references/research-tooling.md"
    - "verifier.md <stub_detection_patterns> body replaced with @-reference to references/stub-patterns.md"
    - "verifier.md inline VERIFICATION.md template body replaced with @-reference to templates/verification-report.md (or kept inline with a documented decision in SUMMARY if on-disk template diverges)"
    - "All 5 edited agents still parse as valid markdown with intact YAML frontmatter"
    - "All 5 edited agents preserve their non-extracted sections unchanged"
  artifacts:
    - path: "plugins/devflow/agents/planner.md"
      provides: "Planner agent with TRD spec + goal-backward methodology externalized"
      contains: "@~/.claude/devflow/references/trd-spec.md"
    - path: "plugins/devflow/agents/job-checker.md"
      provides: "Job-checker agent with goal-backward methodology externalized"
      contains: "@~/.claude/devflow/references/goal-backward.md"
    - path: "plugins/devflow/agents/debugger.md"
      provides: "Debugger agent with debugging methodology externalized"
      contains: "@~/.claude/devflow/references/debugging-methods.md"
    - path: "plugins/devflow/agents/objective-researcher.md"
      provides: "Objective-researcher agent with research tooling externalized"
      contains: "@~/.claude/devflow/references/research-tooling.md"
    - path: "plugins/devflow/agents/verifier.md"
      provides: "Verifier agent with stub patterns + VERIFICATION.md template externalized"
      contains: "@~/.claude/devflow/references/stub-patterns.md"
  key_links:
    - from: "plugins/devflow/agents/planner.md"
      to: "plugins/devflow/devflow/references/trd-spec.md + goal-backward.md"
      via: "@~-syntax in agent file (resolved at agent-spawn time)"
      pattern: "@~/.claude/devflow/references/(trd-spec|goal-backward)\\.md"
    - from: "plugins/devflow/agents/debugger.md"
      to: "plugins/devflow/devflow/references/debugging-methods.md"
      via: "@~-syntax in agent file"
      pattern: "@~/.claude/devflow/references/debugging-methods\\.md"
    - from: "plugins/devflow/agents/verifier.md"
      to: "plugins/devflow/devflow/templates/verification-report.md"
      via: "@~-syntax for template reference"
      pattern: "@~/.claude/devflow/templates/verification-report\\.md"
---

<objective>
Edit 5 agent files (planner, job-checker, debugger, objective-researcher, verifier) to remove their inline duplicated methodology blocks and replace them with `@~/.claude/devflow/references/<name>.md` references. The reference files must already exist (TRD 01 dependency).

Purpose: Cut the per-spawn token cost of these agents. Each agent currently carries 100-600 lines of generic methodology that gets shipped on every spawn. After this TRD, each spawn ships a single `@`-reference line; the actual methodology resolves once per session via the runtime mirror.

Output: 5 modified agent files. Net cut: ≈1080 lines across these 5 agents (sum of preamble extractions + verifier's inline VERIFICATION.md template).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
The `@~`-reference syntax that agents already use successfully (look at existing agent files):

```markdown
<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>
```

— from `plugins/devflow/agents/executor.md` (example; this exact pattern appears in multiple agents). The `@~`-prefix resolves at agent-spawn time via Claude's file-reference syntax. The `sync-runtime.js` SessionStart hook ensures `~/.claude/devflow/references/*` exist on disk before any agent spawns.

For replacing an inline section, the convention is:

```markdown
<plan_format>

@~/.claude/devflow/references/trd-spec.md

</plan_format>
```

Keep the wrapper tags (so future readers / grep tooling can still find the section by name); the `@`-line resolves the body. This is the same pattern used for `<execution_context>` blocks today.
</codebase_examples>

<anti_patterns>
- DO NOT delete the wrapper XML tags (e.g. `<plan_format>`, `<goal_backward>`, `<hypothesis_testing>`). Keep them with the `@`-reference inside. Consumers grep for section names.
- DO NOT use `${CLAUDE_PLUGIN_ROOT}` in `@`-references. Only `@~/.claude/devflow/...` resolves correctly per CLAUDE.md "File references" convention.
- DO NOT collapse 4 separate sections in debugger.md into a single `<debugging-methods>` wrapper. Keep all 4 wrapper tags (`<hypothesis_testing>`, `<investigation_techniques>`, `<verification_patterns>`, `<research_vs_reasoning>`) and put a single shared `@`-reference inside ONE of them (e.g., the first), with the other 3 left empty (just opening/closing tags + a comment). OR — preferred — replace all 4 wrappers with a single `<debugging_methods>` wrapper containing the @-reference, AND leave a brief inline comment listing the 4 original tag names so future readers can find them.
- DO NOT modify YAML frontmatter on any agent file. Edit body only.
- DO NOT touch executor.md, integration-checker.md, research-synthesizer.md, security-auditor.md, or roadmapper.md in this TRD — they are not in H2 scope (and roadmapper's potential goal-backward usage is already captured by reference creation, not preamble edits).
</anti_patterns>

<error_recovery>
- **Verifier VERIFICATION.md template inline doesn't match on-disk templates/verification-report.md**: Compare the two. If on-disk is the more complete version, replace inline with `@~/.claude/devflow/templates/verification-report.md`. If inline is more complete, choose: (a) update on-disk template to match inline, then replace inline with `@`-ref, OR (b) keep inline + add an explanatory comment + reference. Default: prefer (a) for consistency. Document decision in SUMMARY.
- **Frontmatter accidentally deleted**: agent frontmatter is between two `---` lines at the very top of the file. If lost, the agent won't be discoverable by Claude. Restore from git: `git show HEAD:plugins/devflow/agents/<file>.md | head -20` and re-prepend.
- **Wrong line range deleted**: Use git `git diff plugins/devflow/agents/<file>.md` to inspect. If too much was cut, `git checkout plugins/devflow/agents/<file>.md` and retry with corrected line range.
- **Reference file not found at agent-spawn time**: The `@`-reference resolves at runtime against `~/.claude/devflow/references/<name>.md`. The sync-runtime hook mirrors `plugins/devflow/devflow/` → `~/.claude/devflow/` on SessionStart. If the reference doesn't exist in the source dir (TRD 01 didn't run / failed), this TRD will produce dangling references. Verify TRD 01 SUMMARY says "all 6 files created" before starting.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/13-phase-h-prompt-extraction/13-CONTEXT.md
@.planning/objectives/13-phase-h-prompt-extraction/13-RESEARCH.md
@.planning/objectives/13-phase-h-prompt-extraction/13-01-SUMMARY.md
@plugins/devflow/agents/planner.md
@plugins/devflow/agents/job-checker.md
@plugins/devflow/agents/debugger.md
@plugins/devflow/agents/objective-researcher.md
@plugins/devflow/agents/verifier.md
</context>

<gotchas>
- **Section boundaries verified 2026-05-04** in 13-RESEARCH.md. If line numbers drift between then and execution, re-`grep` for section opening tags before editing.
- **debugger.md has 4 sections to extract as ONE merged reference**. Decide between: (option A) keep all 4 tag wrappers, put `@`-ref in first only, leave others as empty wrappers with a "see <hypothesis_testing> for content" comment; (option B) replace all 4 wrappers with a single `<debugging_methods>` wrapper containing the `@`-ref + a comment listing the 4 original tag names. PREFER OPTION B for cleanest result. Surface the choice in SUMMARY.
- **job-checker.md is a partial extraction**, not a full removal. The `<core_principle>` section starts with the verifier-vs-job-checker distinction (which is job-checker-specific) and then explains goal-backward methodology (which IS in the new reference). Keep the distinction inline (lines 41-49 of current file: "Plan completeness =/= Goal achievement" through "verify each level against the actual job files"); replace ONLY the methodology paragraphs at the end (the bullet-numbered goal-backward steps + the difference table) with the `@`-reference.
- **planner.md has TWO extractions** (lines 477-641 + lines 643-743). They're adjacent; do them in one Edit call to avoid offset shift.
- **verifier.md has TWO extractions** (stub-patterns at 629-678 + VERIFICATION.md template at ~467-557). They're NOT adjacent. Do the LATER one FIRST (stub-patterns) so the earlier line numbers don't shift, then do the earlier (VERIFICATION.md template).
- **`autonomous: false` triggered by lack of confirmation?** No — all edits are mechanical. Keep `autonomous: true`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Edit planner.md and job-checker.md to externalize TRD spec + goal-backward methodology</name>
  <files>plugins/devflow/agents/planner.md, plugins/devflow/agents/job-checker.md</files>
  <action>
Two surgical edits:

**1. planner.md** — two adjacent extractions:

For lines 477-641 (`<plan_format>` section), replace the entire body between the opening and closing tags with a single @-reference. After the edit, the section reads:

```
<plan_format>

@~/.claude/devflow/references/trd-spec.md

</plan_format>
```

For lines 643-743 (`<goal_backward>` section), same treatment:

```
<goal_backward>

@~/.claude/devflow/references/goal-backward.md

</goal_backward>
```

Approach:
1. Read planner.md lines 475-745 to capture the exact bracketing context (1-2 lines before/after each section).
2. Use a single MultiEdit (or two sequential Edits, second-to-first to avoid line-number shifts) to:
   - Replace lines 478-640 (inclusive) with `\n@~/.claude/devflow/references/trd-spec.md\n` (preserve the `<plan_format>` and `</plan_format>` tags on their own lines).
   - Replace lines 644-742 with `\n@~/.claude/devflow/references/goal-backward.md\n` (preserve `<goal_backward>` and `</goal_backward>` tags).

**2. job-checker.md** — partial extraction:

Read job-checker.md lines 41-61 (the `<core_principle>` section). The section currently reads:

```
<core_principle>
**Plan completeness =/= Goal achievement**

A task "create auth endpoint" can be in the job while password hashing is missing...

Goal-backward verification works backwards from outcome:

1. What must be TRUE for the objective goal to be achieved?
2. Which tasks address each truth?
3. ...

Then verify each level against the actual job files.

**The difference:**
- `verifier`: Verifies code DID achieve goal (after execution)
- `job-checker`: Verifies plans WILL achieve goal (before execution)

Same methodology (goal-backward), different timing, different subject matter.
</core_principle>
```

Edit to:

```
<core_principle>
**Plan completeness =/= Goal achievement**

A task "create auth endpoint" can be in the job while password hashing is missing. The task exists but the goal "secure authentication" won't be achieved.

job-checker applies goal-backward verification BEFORE execution (vs verifier which applies it AFTER). Same methodology, different timing.

@~/.claude/devflow/references/goal-backward.md

**The difference:**
- `verifier`: Verifies code DID achieve goal (after execution)
- `job-checker`: Verifies plans WILL achieve goal (before execution)
</core_principle>
```

Keep the verifier-vs-job-checker distinction (job-checker specific). Replace ONLY the goal-backward methodology paragraphs (the 5-step numbered list and "Then verify each level" sentence) with the `@`-reference.

# CRITICAL: For planner.md, do the SECOND edit first (lines 643-743) so the FIRST edit's line numbers don't shift mid-task. Or use MultiEdit (which handles offset shifts automatically when given old_string/new_string pairs).
# GOTCHA: Don't accidentally delete the closing `</plan_format>` tag — the body to replace is what's BETWEEN the tags, exclusive.
# PATTERN: Match the existing `<execution_context>` convention — opening tag, blank line, `@`-reference on its own line, blank line, closing tag.
  </action>
  <verify>
1. `grep -c "@~/.claude/devflow/references/trd-spec.md" plugins/devflow/agents/planner.md` returns 1
2. `grep -c "@~/.claude/devflow/references/goal-backward.md" plugins/devflow/agents/planner.md` returns 1
3. `grep -c "@~/.claude/devflow/references/goal-backward.md" plugins/devflow/agents/job-checker.md` returns 1
4. `grep -c "^<plan_format>$\|^</plan_format>$" plugins/devflow/agents/planner.md` returns 2 (tags preserved)
5. `grep -c "^<goal_backward>$\|^</goal_backward>$" plugins/devflow/agents/planner.md` returns 2
6. `grep -c "^<core_principle>$\|^</core_principle>$" plugins/devflow/agents/job-checker.md` returns 2
7. `wc -l plugins/devflow/agents/planner.md` returns ≤1180 (was 1420; cut ≥240)
8. `wc -l plugins/devflow/agents/job-checker.md` returns ≤685 (was 689; cut ≥4)
9. `head -10 plugins/devflow/agents/planner.md | grep -c "^---$"` returns 2 (frontmatter intact)
10. `head -10 plugins/devflow/agents/job-checker.md | grep -c "^---$"` returns 2
11. `grep "verifier.*Verifies code DID\|job-checker.*Verifies plans WILL" plugins/devflow/agents/job-checker.md` finds the preserved distinction
12. `grep "## TRD.md Structure\|## Goal-Backward Methodology" plugins/devflow/agents/planner.md` returns 0 (inline content removed)
  </verify>
  <done>
planner.md and job-checker.md both contain `@`-references to the new reference files; preserve wrapper tags; preserve frontmatter; preserve the job-checker-specific verifier-vs-job-checker distinction. Line count drop matches expected (planner ≥240 lines cut, job-checker ≥4 lines cut).
  </done>
  <recovery>
- If MultiEdit fails on overlapping ranges, fall back to two sequential Edit calls: do lines 643-743 FIRST, then lines 477-641. (Reverse order = no offset shift.)
- If the `<core_principle>` partial edit produces a confused result, `git checkout plugins/devflow/agents/job-checker.md` and retry with smaller-grain Edit (replace just the numbered list + "Then verify" sentence; leave the surrounding paragraphs alone).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Edit debugger.md to externalize hypothesis-testing + investigation + verification + research-vs-reasoning</name>
  <files>plugins/devflow/agents/debugger.md</files>
  <action>
debugger.md currently has 4 separate sections (lines 102-218 hypothesis_testing, 220-426 investigation_techniques, 428-603 verification_patterns, 605-725 research_vs_reasoning) totaling ~624 lines of debugging methodology.

PREFERRED approach (option B from gotchas) — replace all 4 wrappers with a single `<debugging_methods>` wrapper:

Read debugger.md lines 100-727 to capture the bracket context.

Replace lines 102-725 (the 4 sections plus the blank-line separators between them) with:

```
<debugging_methods>

<!-- Source: extracted from inline 2026-05 (was: <hypothesis_testing> + <investigation_techniques> + <verification_patterns> + <research_vs_reasoning>) -->

@~/.claude/devflow/references/debugging-methods.md

</debugging_methods>
```

This preserves: a brief comment listing the original 4 tag names so future grep-by-section still finds context; the methodology body resolved at runtime via the @-reference.

# CRITICAL: Reading and editing 624 lines is large. Use Read with offset 100 limit 30 to verify the opening, then offset 720 limit 15 to verify the closing — confirm both are where 13-RESEARCH.md says, then do the bulk Edit.
# GOTCHA: The 4 sections are separated by blank lines and (probably) a "<section_name>"/"</section_name>" tag pair. Make sure your old_string in the Edit captures from the opening `<hypothesis_testing>` (line 102) through the closing `</research_vs_reasoning>` (line 725) inclusive — NOT line 726 which is the blank line before `<debug_file_protocol>` (the next section, which we're NOT touching).
# PATTERN: Match the planner.md edit pattern from Task 1 — preserve a wrapper tag with the @-reference inside.
  </action>
  <verify>
1. `grep -c "@~/.claude/devflow/references/debugging-methods.md" plugins/devflow/agents/debugger.md` returns 1
2. `grep -c "^<debugging_methods>$\|^</debugging_methods>$" plugins/devflow/agents/debugger.md` returns 2
3. `grep -c "^<hypothesis_testing>\|^<investigation_techniques>\|^<verification_patterns>\|^<research_vs_reasoning>" plugins/devflow/agents/debugger.md` returns 0 (or 4 inside an HTML comment, but never as live tags)
4. `wc -l plugins/devflow/agents/debugger.md` returns ≤585 (was 1198; cut ≥613)
5. `head -10 plugins/devflow/agents/debugger.md | grep -c "^---$"` returns 2 (frontmatter intact)
6. `grep "<debug_file_protocol>" plugins/devflow/agents/debugger.md` finds it (next section, NOT extracted, must remain)
7. `grep "## Falsifiability Requirement" plugins/devflow/agents/debugger.md` returns nothing (inline content removed)
8. `grep "<role>\|<philosophy>" plugins/devflow/agents/debugger.md` finds both (preceding sections preserved)
  </verify>
  <done>
debugger.md contains a single `<debugging_methods>` section wrapping the @-reference; original 4 section bodies removed; surrounding sections (`<role>`, `<philosophy>`, `<debug_file_protocol>`, `<execution_flow>`, `<checkpoint_behavior>`, etc.) preserved unchanged; line count cut ≥613 lines.
  </done>
  <recovery>
- If the bulk Edit deletes too much (e.g. accidentally swallows `<debug_file_protocol>`), `git checkout plugins/devflow/agents/debugger.md` and retry with smaller bracket. Confirm the closing `</research_vs_reasoning>` line via `grep -n "</research_vs_reasoning>" plugins/devflow/agents/debugger.md` BEFORE editing.
- If "option B" feels risky, fall back to "option A": keep all 4 wrapper tags, put @-reference in `<hypothesis_testing>` only, replace the other 3 bodies with `<!-- See <hypothesis_testing> for the @-reference; this section's content is in the merged debugging-methods.md -->`. Document choice in SUMMARY.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Edit objective-researcher.md (research tooling) and verifier.md (stub patterns + VERIFICATION.md template)</name>
  <files>plugins/devflow/agents/objective-researcher.md, plugins/devflow/agents/verifier.md</files>
  <action>
**1. objective-researcher.md** — externalize tool_strategy + source_hierarchy + verification_protocol (lines 85-175):

Read lines 83-177 to capture brackets. Replace the body of the 3 sections with a single combined replacement strategy:

PREFERRED — collapse into a single `<research_tooling>` wrapper (matching the reference filename):

```
<research_tooling>

<!-- Source: extracted from inline 2026-05 (was: <tool_strategy> + <source_hierarchy> + <verification_protocol>) -->

@~/.claude/devflow/references/research-tooling.md

</research_tooling>
```

Replace lines 85-175 (3 sections inclusive) with the above block.

**2. verifier.md** — TWO extractions (do the later one FIRST to avoid line shifts):

**2a.** Lines 629-678 (`<stub_detection_patterns>`):

```
<stub_detection_patterns>

@~/.claude/devflow/references/stub-patterns.md

</stub_detection_patterns>
```

Replace body of `<stub_detection_patterns>` (between the tags, exclusive) with the @-reference.

**2b.** VERIFICATION.md template inline (issue cites lines 467-557):

First — VERIFY the line range. Run:
```
grep -n "## VERIFICATION.md\|^## .* template\|VERIFICATION.md Template" plugins/devflow/agents/verifier.md
```

If the inline VERIFICATION.md template block sits within `<verification_process>` (lines 30-461) or `<output>` (lines 463-609) or somewhere else, identify exact start/end lines.

Compare the inline content against `plugins/devflow/devflow/templates/verification-report.md`:
```
diff plugins/devflow/devflow/templates/verification-report.md <(sed -n '467,557p' plugins/devflow/agents/verifier.md)
```

DECISION TREE:
- **If diff shows the on-disk template is equivalent or more complete** → replace inline with `@~/.claude/devflow/templates/verification-report.md` (in whatever wrapper the inline currently sits in).
- **If diff shows the inline is more complete** → update the on-disk template to match inline (write the more complete version to templates/verification-report.md), THEN replace inline with the @-reference.
- **If diff shows substantively different intents** (one is a "what verification looks like" example, the other is a "user-facing report" template) → keep both. Inline stays. Document in SUMMARY.

Default: prefer the first option (replace inline with @-ref) for the cleanest result.

# CRITICAL: For verifier.md do task 2a (later range) FIRST, then 2b (earlier range), so 2a's line numbers don't shift after 2b's edit.
# GOTCHA: The verifier inline VERIFICATION.md template MIGHT not be at lines 467-557 anymore. Always grep before editing. If the template doesn't exist inline (already moved in a prior PR), skip 2b and document in SUMMARY.
# PATTERN: Match the planner.md / debugger.md edit patterns from prior tasks.
  </action>
  <verify>
1. `grep -c "@~/.claude/devflow/references/research-tooling.md" plugins/devflow/agents/objective-researcher.md` returns 1
2. `grep -c "@~/.claude/devflow/references/stub-patterns.md" plugins/devflow/agents/verifier.md` returns 1
3. `grep -c "@~/.claude/devflow/templates/verification-report.md" plugins/devflow/agents/verifier.md` returns 1 (OR 0 if decision tree path 3 was taken — document in SUMMARY)
4. `grep -c "^<research_tooling>$\|^</research_tooling>$" plugins/devflow/agents/objective-researcher.md` returns 2
5. `grep -c "^<stub_detection_patterns>$\|^</stub_detection_patterns>$" plugins/devflow/agents/verifier.md` returns 2
6. `grep -c "^<tool_strategy>\|^<source_hierarchy>\|^<verification_protocol>" plugins/devflow/agents/objective-researcher.md` returns 0 (live tags removed; if in HTML comment, OK)
7. `wc -l plugins/devflow/agents/objective-researcher.md` returns ≤405 (was 488; cut ≥83)
8. `wc -l plugins/devflow/agents/verifier.md` returns ≤640 (was 697; cut ≥57; with verification-report extraction expected ≤560 cut ≥137)
9. `head -10 plugins/devflow/agents/objective-researcher.md | grep -c "^---$"` returns 2
10. `head -10 plugins/devflow/agents/verifier.md | grep -c "^---$"` returns 2
11. `grep "## React Component Stubs\|## API Route Stubs" plugins/devflow/agents/verifier.md` returns 0 (inline removed)
12. `grep "## Tool Priority\|## Source" plugins/devflow/agents/objective-researcher.md` returns 0 (inline removed)
  </verify>
  <done>
objective-researcher.md has tool_strategy/source_hierarchy/verification_protocol externalized via single `<research_tooling>` wrapper. verifier.md has stub_detection_patterns externalized AND VERIFICATION.md inline replaced with template @-reference (or decision documented in SUMMARY if path 3 was chosen). Both files retain frontmatter and all non-extracted sections.
  </done>
  <recovery>
- If the verifier VERIFICATION.md inline range doesn't match issue's 467-557 citation, accept the actual range from grep and update the SUMMARY's "line-range drift" note.
- If diff against templates/verification-report.md is too large to confidently merge, keep inline + add `<!-- TODO: align with templates/verification-report.md in a follow-on TRD -->` and document in SUMMARY.
- If single `<research_tooling>` wrapper feels too aggressive, fall back to keeping all 3 original wrapper tags with the @-reference in `<tool_strategy>` only.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After this TRD lands:

1. **All 5 agents have @-references to the new files:**
   ```bash
   grep -l "@~/.claude/devflow/references/trd-spec.md" plugins/devflow/agents/planner.md
   grep -l "@~/.claude/devflow/references/goal-backward.md" plugins/devflow/agents/planner.md plugins/devflow/agents/job-checker.md
   grep -l "@~/.claude/devflow/references/debugging-methods.md" plugins/devflow/agents/debugger.md
   grep -l "@~/.claude/devflow/references/research-tooling.md" plugins/devflow/agents/objective-researcher.md
   grep -l "@~/.claude/devflow/references/stub-patterns.md" plugins/devflow/agents/verifier.md
   ```
   All commands return at least one match.

2. **No stale inline content remains:**
   ```bash
   grep "## TRD.md Structure" plugins/devflow/agents/planner.md   # should return 0
   grep "## Goal-Backward Methodology" plugins/devflow/agents/planner.md  # should return 0
   grep "## Falsifiability Requirement" plugins/devflow/agents/debugger.md  # should return 0
   grep "## React Component Stubs" plugins/devflow/agents/verifier.md  # should return 0
   ```

3. **Frontmatter intact on all 5 agents:**
   ```bash
   for f in planner job-checker debugger objective-researcher verifier; do
     head -10 plugins/devflow/agents/$f.md | grep -c "^---$"
   done  # all return 2
   ```

4. **Tests still pass (no agent-loading regressions):**
   ```bash
   npm test
   ```
   1471/1471 (no behavior regressions; agents still load and parse correctly).

5. **Total line cut:**
   ```bash
   wc -l plugins/devflow/agents/{planner,job-checker,debugger,objective-researcher,verifier}.md
   ```
   Expected total ≤ ~3380 (was 4492; cut ≥1100 lines).
</verification>

<success_criteria>
- planner.md: cut ≥240 lines, contains `@~/.claude/devflow/references/trd-spec.md` and `@~/.claude/devflow/references/goal-backward.md`
- job-checker.md: cut ≥4 lines, contains `@~/.claude/devflow/references/goal-backward.md`, preserves verifier-vs-job-checker distinction
- debugger.md: cut ≥613 lines, contains `@~/.claude/devflow/references/debugging-methods.md` (single `<debugging_methods>` wrapper preferred)
- objective-researcher.md: cut ≥83 lines, contains `@~/.claude/devflow/references/research-tooling.md`
- verifier.md: cut ≥57 lines (≥137 with verification-report template extraction), contains `@~/.claude/devflow/references/stub-patterns.md` AND `@~/.claude/devflow/templates/verification-report.md` (or decision documented)
- All 5 agents preserve their YAML frontmatter unchanged
- All 5 agents preserve all non-extracted sections unchanged
- Single atomic commit covering all 5 agent edits (uniform mechanical extraction)
- `npm test` shows 1471/1471 passing
</success_criteria>

<output>
After completion, create `.planning/objectives/13-phase-h-prompt-extraction/13-02-SUMMARY.md`.

SUMMARY must capture:
- Pre/post line counts for all 5 edited agents
- Total line cut across the 5 agents
- The debugger.md decision (option A vs option B for the 4-tag collapse)
- The verifier VERIFICATION.md template decision (replaced / on-disk updated / kept inline) + diff outcome
- Any source line-range drift discovered during extraction
- Test results (X/Y pass)
- Single commit SHA
</output>

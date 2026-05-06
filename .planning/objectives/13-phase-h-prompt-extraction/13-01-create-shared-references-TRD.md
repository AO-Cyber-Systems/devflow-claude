---
objective: 13-phase-h-prompt-extraction
trd: 01
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/references/trd-spec.md
  - plugins/devflow/devflow/references/research-tooling.md
  - plugins/devflow/devflow/references/goal-backward.md
  - plugins/devflow/devflow/references/debugging-methods.md
  - plugins/devflow/devflow/references/stub-patterns.md
  - plugins/devflow/devflow/templates/codebase/patterns.md
autonomous: true
requirements:
  - PHASE-H1
validation_gates:
  test: "npm test"
must_haves:
  truths:
    - "5 reference files exist at plugins/devflow/devflow/references/ with verbatim-extracted content from source agents"
    - "1 new template file exists at plugins/devflow/devflow/templates/codebase/patterns.md"
    - "All reference files parse as valid markdown (no broken frontmatter, no malformed tables)"
    - "All reference files preserve the XML wrapper tags from their source sections so consumers can still grep for section names"
    - "Sync-runtime hook copies all 5 new references to ~/.claude/devflow/references/ on next SessionStart (verified by file presence in mirror)"
  artifacts:
    - path: "plugins/devflow/devflow/references/trd-spec.md"
      provides: "Full TRD frontmatter + structure spec (preserves <plan_format> tag)"
      min_lines: 150
      contains: "## TRD.md Structure"
    - path: "plugins/devflow/devflow/references/research-tooling.md"
      provides: "Context7 / WebFetch / WebSearch / Brave + verification protocol + confidence levels (preserves <tool_strategy> + <verification_protocol> tags)"
      min_lines: 90
      contains: "Context7"
    - path: "plugins/devflow/devflow/references/goal-backward.md"
      provides: "Truths → artifacts → key links methodology (preserves <goal_backward> tag)"
      min_lines: 90
      contains: "## Goal-Backward Methodology"
    - path: "plugins/devflow/devflow/references/debugging-methods.md"
      provides: "Hypothesis testing + investigation techniques + verification patterns + research-vs-reasoning (preserves all 4 source tags)"
      min_lines: 550
      contains: "## Falsifiability Requirement"
    - path: "plugins/devflow/devflow/references/stub-patterns.md"
      provides: "Stub detection patterns: React components, API routes, wiring red flags (preserves <stub_detection_patterns> tag)"
      min_lines: 40
      contains: "## React Component Stubs"
    - path: "plugins/devflow/devflow/templates/codebase/patterns.md"
      provides: "PATTERNS.md template + extraction guidelines (mirrors codebase-mapper inline lines 634-668)"
      min_lines: 35
      contains: "# Code Patterns"
  key_links:
    - from: "plugins/devflow/devflow/references/trd-spec.md"
      to: "TRD frontmatter spec consumers"
      via: "@~-syntax in agent files (planner.md after TRD 02)"
      pattern: "objective.*trd.*type.*confidence.*wave.*depends_on.*files_modified.*autonomous.*requirements.*must_haves"
    - from: "plugins/devflow/devflow/references/goal-backward.md"
      to: "goal-backward methodology consumers"
      via: "@~-syntax in agent files (planner.md, job-checker.md after TRD 02)"
      pattern: "Goal-Backward.*Truths.*Artifacts.*Key Links"
    - from: "plugins/devflow/hooks/sync-runtime.js"
      to: "~/.claude/devflow/references/ + ~/.claude/devflow/templates/codebase/"
      via: "SessionStart mirroring of plugins/devflow/devflow/"
      pattern: "sync-runtime|references|templates"
---

<objective>
Create the 5 shared reference files at `plugins/devflow/devflow/references/` and 1 new template at `plugins/devflow/devflow/templates/codebase/patterns.md`. These artifacts are the prerequisites for TRDs 02 and 03, which will edit agent preambles to replace inline content with `@~/.claude/devflow/references/<name>.md` references.

Purpose: Lay the foundation for the prompt-extraction wave. Without these files in place, the agent edits in TRDs 02/03 would dangle (agents would `@`-reference files that don't exist). Wave 1 = pure creation; no agent edits land here.

Output: 6 new files (5 references + 1 template). All content is copied verbatim from the source agents per the extraction table in 13-RESEARCH.md (no rewriting, no semantic changes).
</objective>

<file_tree>
plugins/devflow/devflow/
├── references/
│   ├── trd-spec.md             ← CREATE (extract from agents/planner.md:477-641)
│   ├── research-tooling.md     ← CREATE (extract from agents/project-researcher.md:63-166 + agents/objective-researcher.md:85-175)
│   ├── goal-backward.md        ← CREATE (extract from agents/planner.md:643-743)
│   ├── debugging-methods.md    ← CREATE (extract from agents/debugger.md:102-725)
│   └── stub-patterns.md        ← CREATE (extract from agents/verifier.md:629-678)
└── templates/codebase/
    └── patterns.md             ← CREATE (extract from agents/codebase-mapper.md:634-668)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Existing reference file format (mirror this convention exactly):

```markdown
# Anti-Patterns Reference

Consolidated reference of prohibited shortcuts and their detection. Cross-referenced by agents during planning and execution.

<tdd_anti_patterns>

## TDD Anti-Patterns

| Anti-Pattern | Excuse | Reality | Detection |
|---|---|---|---|
| Write tests after | "I'll add tests when it works" | Tests never get written; behavior not locked in | No `test()` commit before `feat()` commit |
...
</tdd_anti_patterns>
```

— from `plugins/devflow/devflow/references/anti-patterns.md`

Rules embedded in this format:
1. H1 title with brief 1-paragraph "what this is" intro.
2. XML-tagged sections wrap each thematic block (preserving the source agent's tag names).
3. Tables, code blocks, examples copied verbatim from source.
4. Cross-references to other references via `@~/.claude/devflow/references/<name>.md`.

Existing template file format (mirror codebase/stack.md):

```markdown
# Technology Stack Template

Template for `.planning/codebase/STACK.md` - captures the technology foundation.

**Purpose:** Document what technologies run this codebase. Focused on "what executes when you run the code."

---

## File Template

```markdown
# Technology Stack

**Analysis Date:** [YYYY-MM-DD]
...
```
```

— from `plugins/devflow/devflow/templates/codebase/stack.md`. Note the nested ``` ```markdown ... ``` ``` block — that pattern is the existing convention for codebase templates (the inner block is what gets rendered into the user's project).
</codebase_examples>

<anti_patterns>
- DO NOT rewrite or paraphrase source content. The acceptance criterion is **semantically identical** content. Copy verbatim.
- DO NOT strip the XML wrapper tags from source content. Consumers grep for `<plan_format>`, `<goal_backward>`, etc. Keep them.
- DO NOT add new content beyond what's in the source extraction range. This is a pure move, not a refactor.
- DO NOT use `${CLAUDE_PLUGIN_ROOT}` in cross-references — `@~/.claude/devflow/...` is the only resolved syntax.
- DO NOT prepend a "this file is auto-generated" header. References are first-class artifacts; they will be edited directly going forward.
</anti_patterns>

<error_recovery>
- **Source line ranges drift between digest and actual file**: If grep for the section opening tag (e.g. `^<plan_format>`) returns a different line than 13-RESEARCH.md states, trust the grep result. Update 13-RESEARCH.md notes in the SUMMARY but proceed with the actual range.
- **Verifier verification-report inline range uncertainty**: The issue cites lines 467-557 in verifier.md but the inline section may have shifted. TRD 02 (not this TRD) handles that extraction. This TRD only creates references; verification-report.md template already exists on disk.
- **patterns.md template content uncertain**: Source is codebase-mapper.md lines ~634-668. Read the actual range, copy the markdown block (the inner ``` ```markdown ``` ``` block + the "Guidelines" bullets), preserve verbatim.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/13-phase-h-prompt-extraction/13-CONTEXT.md
@.planning/objectives/13-phase-h-prompt-extraction/13-RESEARCH.md
@plugins/devflow/devflow/references/anti-patterns.md
@plugins/devflow/devflow/references/tdd.md
@plugins/devflow/devflow/templates/codebase/stack.md
</context>

<research_context>
From 13-RESEARCH.md extraction table — exact line ranges to copy:

| Source | Range | Target |
|---|---|---|
| agents/planner.md | 477-641 | references/trd-spec.md |
| agents/planner.md | 643-743 | references/goal-backward.md |
| agents/debugger.md | 102-725 (4 sections: hypothesis_testing, investigation_techniques, verification_patterns, research_vs_reasoning) | references/debugging-methods.md |
| agents/project-researcher.md | 63-166 (tool_strategy + verification_protocol) | references/research-tooling.md (combined with objective-researcher equivalent) |
| agents/objective-researcher.md | 85-175 (tool_strategy + source_hierarchy + verification_protocol) | references/research-tooling.md (merge with project-researcher version; keep both teams' content where they differ) |
| agents/verifier.md | 629-678 | references/stub-patterns.md |
| agents/codebase-mapper.md | 634-668 (PATTERNS.md template block) | templates/codebase/patterns.md |

For research-tooling.md: project-researcher and objective-researcher have *near-duplicate* content. Merge intelligently — preserve the more complete version of each shared subsection (project-researcher's tool_strategy is more verbose; objective-researcher has a cleaner table format). Where they differ in substantive guidance, include both with attribution comments.
</research_context>

<gotchas>
- **patterns.md must use the codebase template subdir convention** (templates/codebase/patterns.md, not templates/patterns.md). The other 7 codebase templates already live at templates/codebase/.
- **research-tooling.md is the ONE merge case** — all other extractions are pure copies from a single source.
- **debugger.md cuts span 624 lines** — the largest single extraction. Be careful with the boundary tags (`</hypothesis_testing>`, `<investigation_techniques>`, etc.) — preserve them as section dividers in the reference file.
- **No file should reference itself**: trd-spec.md should not say "see references/trd-spec.md". When in doubt, drop the cross-reference rather than create circularity.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Create references/trd-spec.md and references/goal-backward.md from planner.md</name>
  <files>plugins/devflow/devflow/references/trd-spec.md, plugins/devflow/devflow/references/goal-backward.md</files>
  <action>
Extract two reference files from agents/planner.md. Both follow the `references/anti-patterns.md` precedent (H1 title + 1-paragraph intro + XML-tagged sections preserving source tag names).

Approach:
1. Read agents/planner.md lines 477-641 (the entire `<plan_format>` section, opening tag through closing tag).
2. Write `plugins/devflow/devflow/references/trd-spec.md` with structure:
   ```
   # TRD Specification

   The structure, frontmatter, and field semantics for TRD.md files. Referenced by planner during plan generation; consulted by executor, verifier, and job-checker during their respective phases.

   <plan_format>

   [VERBATIM COPY of planner.md lines 478-640 — everything between the opening and closing tags, exclusive]

   </plan_format>
   ```
3. Read agents/planner.md lines 643-743 (the entire `<goal_backward>` section).
4. Write `plugins/devflow/devflow/references/goal-backward.md` with structure:
   ```
   # Goal-Backward Methodology

   The truth → artifact → wiring → key-link derivation pattern. Used by planner (deriving must_haves), verifier (deriving verification criteria), job-checker (validating plan completeness), and roadmapper (sanity-checking objective scope).

   <goal_backward>

   [VERBATIM COPY of planner.md lines 644-742]

   </goal_backward>
   ```

Verbatim means: copy character-for-character. Do NOT change formatting, indentation, table delimiters, or code-block fence styles. Do NOT add or remove blank lines within the copied block.

# CRITICAL: Preserve the `<plan_format>` and `<goal_backward>` opening/closing tags. Consumers grep by section name.
# GOTCHA: planner.md uses `~/.claude/devflow/...` (no leading `@`) inside the `<execution_context>` example block. Keep that exact text — it's an *example* of how a TRD looks, not a directive to interpret.
# PATTERN: Match references/anti-patterns.md format precedent.
  </action>
  <verify>
1. `wc -l plugins/devflow/devflow/references/trd-spec.md` returns ≥150
2. `wc -l plugins/devflow/devflow/references/goal-backward.md` returns ≥90
3. `grep -c "^<plan_format>" plugins/devflow/devflow/references/trd-spec.md` returns 1
4. `grep -c "^<goal_backward>" plugins/devflow/devflow/references/goal-backward.md` returns 1
5. `grep "## TRD.md Structure" plugins/devflow/devflow/references/trd-spec.md` finds the heading
6. `grep "## Goal-Backward Methodology" plugins/devflow/devflow/references/goal-backward.md` finds the heading
7. `diff <(sed -n '478,640p' plugins/devflow/agents/planner.md) <(sed -n '/^<plan_format>$/,/^<\/plan_format>$/p' plugins/devflow/devflow/references/trd-spec.md | sed -n '3,$p' | sed '$d')` shows no semantic differences (whitespace-only diffs OK)
  </verify>
  <done>
trd-spec.md and goal-backward.md both exist, contain verbatim source content within preserved XML tags, both pass `grep` checks for the required section headings.
  </done>
  <recovery>
If `<plan_format>` or `<goal_backward>` opening tag isn't on the expected line: `grep -n "^<plan_format>\|^<goal_backward>" plugins/devflow/agents/planner.md` to find current location, update the offset, retry. If verbatim copy produces line counts wildly different from expected (≥150 / ≥90), check for an editor adding trailing whitespace or BOM — strip and retry.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Create references/research-tooling.md (merged from project-researcher.md + objective-researcher.md), references/debugging-methods.md (from debugger.md), references/stub-patterns.md (from verifier.md)</name>
  <files>plugins/devflow/devflow/references/research-tooling.md, plugins/devflow/devflow/references/debugging-methods.md, plugins/devflow/devflow/references/stub-patterns.md</files>
  <action>
Three extractions in one task (all single-source except research-tooling, which is a 2-source merge).

Approach (in order):

**1. research-tooling.md (MERGE case):**
- Read agents/project-researcher.md lines 63-166 (`<tool_strategy>` + `<verification_protocol>`).
- Read agents/objective-researcher.md lines 85-175 (`<tool_strategy>` + `<source_hierarchy>` + `<verification_protocol>`).
- Compare the two `<tool_strategy>` blocks: project-researcher has the more verbose narrative version; objective-researcher has a cleaner table-first version. Merge:
  - Keep project-researcher's `Tool Priority Order` numbered narrative (Context7 → WebFetch → WebSearch → Brave) as the canonical version.
  - Keep objective-researcher's compact `Tool Priority` table as a quick-reference at the top.
  - Keep both `Verification Protocol` blocks if substantively different; use whichever is more complete and drop the other (default: project-researcher's).
  - Include objective-researcher's `<source_hierarchy>` table as its own section — it's not in project-researcher.
- Write `plugins/devflow/devflow/references/research-tooling.md` with structure:
  ```
  # Research Tooling

  Tool selection priority, verification protocol, and confidence-level conventions for research-time investigations. Used by project-researcher (new-project research) and objective-researcher (per-objective research).

  <tool_strategy>

  [merged content per above]

  </tool_strategy>

  <source_hierarchy>

  [from objective-researcher]

  </source_hierarchy>

  <verification_protocol>

  [project-researcher's version, or whichever is more complete]

  </verification_protocol>
  ```

**2. debugging-methods.md (single-source, large):**
- Read agents/debugger.md lines 102-725.
- Write `plugins/devflow/devflow/references/debugging-methods.md` with structure:
  ```
  # Debugging Methods

  Hypothesis testing, investigation techniques, verification patterns, and the research-vs-reasoning decision protocol. Used by debugger only.

  <hypothesis_testing>
  [VERBATIM lines 103-217]
  </hypothesis_testing>

  <investigation_techniques>
  [VERBATIM lines 221-425]
  </investigation_techniques>

  <verification_patterns>
  [VERBATIM lines 429-602]
  </verification_patterns>

  <research_vs_reasoning>
  [VERBATIM lines 606-724]
  </research_vs_reasoning>
  ```
- All four sections preserve their opening/closing tags (already in the source ranges).

**3. stub-patterns.md (single-source, small):**
- Read agents/verifier.md lines 629-678.
- Write `plugins/devflow/devflow/references/stub-patterns.md`:
  ```
  # Stub Detection Patterns

  Code patterns that indicate stub/placeholder implementations rather than real wiring. Used by verifier (post-execution code verification) and job-checker (pre-execution plan validation).

  <stub_detection_patterns>
  [VERBATIM lines 630-677]
  </stub_detection_patterns>
  ```

# CRITICAL: For research-tooling.md merge, surface the merge decision in SUMMARY (which paragraphs came from which source).
# GOTCHA: debugger.md sections are large and contain nested code blocks — preserve fence styles and indentation exactly. Use Read with offset/limit to chunk, write all at once.
# PATTERN: Match the format precedent in references/anti-patterns.md (H1 + 1-paragraph + XML-tagged sections).
  </action>
  <verify>
1. `ls plugins/devflow/devflow/references/research-tooling.md plugins/devflow/devflow/references/debugging-methods.md plugins/devflow/devflow/references/stub-patterns.md` lists all three.
2. `wc -l plugins/devflow/devflow/references/research-tooling.md` returns ≥90
3. `wc -l plugins/devflow/devflow/references/debugging-methods.md` returns ≥550
4. `wc -l plugins/devflow/devflow/references/stub-patterns.md` returns ≥40
5. `grep "## Falsifiability Requirement" plugins/devflow/devflow/references/debugging-methods.md` finds heading
6. `grep "## React Component Stubs" plugins/devflow/devflow/references/stub-patterns.md` finds heading
7. `grep "Context7" plugins/devflow/devflow/references/research-tooling.md` finds at least one mention
8. `grep -c "^<hypothesis_testing>\|^<investigation_techniques>\|^<verification_patterns>\|^<research_vs_reasoning>" plugins/devflow/devflow/references/debugging-methods.md` returns 4
  </verify>
  <done>
All three reference files exist, contain verbatim source content within preserved XML tags, pass section-heading grep checks. research-tooling.md merge decisions captured in SUMMARY.
  </done>
  <recovery>
- If debugger.md verbatim copy hits an editor limit, split the Write into 4 sections written sequentially via 4 Edit operations (after the file exists). Verify final byte-count matches `awk 'NR>=103 && NR<=724' plugins/devflow/agents/debugger.md | wc -c` ± 200 bytes (header overhead).
- If research-tooling merge produces a confused result, fall back to: keep project-researcher's full content, append objective-researcher's `<source_hierarchy>` block, drop the duplicate `<tool_strategy>` from objective-researcher. Document fallback in SUMMARY.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Create templates/codebase/patterns.md from codebase-mapper inline template</name>
  <files>plugins/devflow/devflow/templates/codebase/patterns.md</files>
  <action>
Create the missing `patterns.md` template in the codebase/ subdirectory. Source: agents/codebase-mapper.md lines ~634-668 (the `## PATTERNS.md Template (quality focus)` block + the "PATTERNS.md Guidelines" bullets that follow).

Approach:
1. Read agents/codebase-mapper.md lines 634-672 to capture the full template + guidelines.
2. Write `plugins/devflow/devflow/templates/codebase/patterns.md` mirroring the format of templates/codebase/stack.md:
   ```
   # Code Patterns Template

   Template for `.planning/codebase/PATTERNS.md` - captures representative real code from the codebase.

   **Purpose:** Show the cleanest examples of how this codebase actually does things (services, tests, error handling, routes, components). Executors mimic these patterns.

   ---

   ## File Template

   ```markdown
   # Code Patterns

   **Analysis Date:** [YYYY-MM-DD]

   ## Service/Module Pattern
   [Actual code snippet showing how a typical service/module looks in this codebase]
   File: `[source file path]`

   [... rest verbatim from codebase-mapper.md inline ...]
   ```

   ## Guidelines

   - Extract REAL code (30-60 lines each), not fabricated examples
   - Pick the most representative/cleanest file for each pattern
   - Skip patterns that don't exist (e.g., no components in a CLI tool)
   - Include the source file path so executors can read the full file
   - Max 5 patterns, min 2

   ---

   *Pattern analysis: [date]*
   ```

# CRITICAL: Use the nested ``` ```markdown ... ``` ``` fence pattern that all other templates/codebase/ files use. The inner block is what gets rendered into the user's project.
# GOTCHA: The "PATTERNS.md Guidelines" bullets in codebase-mapper.md sit OUTSIDE the inner template block in the source — preserve that distinction (guidelines are meta-documentation about how to use the template, not part of the template body).
# PATTERN: Match templates/codebase/stack.md, templates/codebase/structure.md format.
  </action>
  <verify>
1. `ls plugins/devflow/devflow/templates/codebase/patterns.md` returns the file.
2. `wc -l plugins/devflow/devflow/templates/codebase/patterns.md` returns ≥35
3. `grep "# Code Patterns Template" plugins/devflow/devflow/templates/codebase/patterns.md` finds H1.
4. `grep "Service/Module Pattern" plugins/devflow/devflow/templates/codebase/patterns.md` finds the pattern heading.
5. `grep -c "^\`\`\`markdown" plugins/devflow/devflow/templates/codebase/patterns.md` returns 1 (the inner template fence).
  </verify>
  <done>
patterns.md exists at templates/codebase/, contains the full template body + guidelines, mirrors the format of sibling templates (stack.md, structure.md, etc.).
  </done>
  <recovery>
If the codebase-mapper inline range has shifted, `grep -n "^## PATTERNS.md Template\|^## CONCERNS.md Template" plugins/devflow/agents/codebase-mapper.md` finds the bracketing headings. Use the range between them.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After this TRD lands:

1. **All 6 new files exist:**
   ```bash
   ls plugins/devflow/devflow/references/{trd-spec,research-tooling,goal-backward,debugging-methods,stub-patterns}.md plugins/devflow/devflow/templates/codebase/patterns.md
   ```
   All 6 must be present.

2. **No agent files modified yet:**
   ```bash
   git diff --stat plugins/devflow/agents/
   ```
   Should be empty (Wave 1 = creation only; agent edits are TRDs 02/03).

3. **Tests still pass:**
   ```bash
   npm test
   ```
   1471/1471 (no regressions; reference creation is purely additive).

4. **Sync-runtime hook will mirror these on next SessionStart:**
   ```bash
   ls plugins/devflow/hooks/sync-runtime.js  # confirms the hook still exists
   ```
   No code change needed — sync-runtime mirrors the entire `plugins/devflow/devflow/` tree.
</verification>

<success_criteria>
- 5 reference files exist at `plugins/devflow/devflow/references/`: trd-spec.md, research-tooling.md, goal-backward.md, debugging-methods.md, stub-patterns.md
- 1 new template exists at `plugins/devflow/devflow/templates/codebase/patterns.md`
- All files contain verbatim-extracted content from source agents (no rewriting)
- All XML wrapper tags from source sections preserved
- All files match the format precedent of `references/anti-patterns.md` (H1 + intro + tagged sections)
- `npm test` shows 1471/1471 passing
- Single atomic commit covering all 6 new files (uniform mechanical extraction; per-file commits would add noise without review benefit)
</success_criteria>

<output>
After completion, create `.planning/objectives/13-phase-h-prompt-extraction/13-01-SUMMARY.md`.

SUMMARY must capture:
- Final line counts for all 6 new files
- The research-tooling.md merge decision (which paragraphs from project-researcher vs objective-researcher)
- Any source line-range drift discovered during extraction (update notes for TRDs 02/03)
- Test results (X/Y pass)
- Single commit SHA
</output>

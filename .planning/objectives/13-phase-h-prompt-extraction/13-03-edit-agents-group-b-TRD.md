---
objective: 13-phase-h-prompt-extraction
trd: 03
type: standard
confidence: high
wave: 2
depends_on: [13-01]
files_modified:
  - plugins/devflow/agents/project-researcher.md
  - plugins/devflow/agents/codebase-mapper.md
autonomous: true
requirements:
  - PHASE-H2-PROJECT-RESEARCHER
  - PHASE-H3-PROJECT-RESEARCHER
  - PHASE-H3-CODEBASE-MAPPER
validation_gates:
  test: "npm test"
must_haves:
  truths:
    - "project-researcher.md no longer contains the inline <tool_strategy> + <verification_protocol> bodies — replaced with @-reference to references/research-tooling.md"
    - "project-researcher.md no longer contains the 5 inline output-format templates (SUMMARY, STACK, FEATURES, ARCHITECTURE, PITFALLS) — replaced with @-references to templates/research-project/*"
    - "codebase-mapper.md no longer contains the 8 inline templates (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, PATTERNS, CONCERNS) — replaced with @-references to templates/codebase/*"
    - "Both edited agents still parse as valid markdown with intact YAML frontmatter"
    - "Both edited agents preserve their non-extracted sections (role, philosophy, process steps, etc.) unchanged"
  artifacts:
    - path: "plugins/devflow/agents/project-researcher.md"
      provides: "Project-researcher agent with research tooling + 5 output-format templates externalized"
      contains: "@~/.claude/devflow/references/research-tooling.md"
    - path: "plugins/devflow/agents/codebase-mapper.md"
      provides: "Codebase-mapper agent with 8 inline templates externalized"
      contains: "@~/.claude/devflow/templates/codebase/"
  key_links:
    - from: "plugins/devflow/agents/project-researcher.md"
      to: "plugins/devflow/devflow/templates/research-project/{SUMMARY,STACK,FEATURES,ARCHITECTURE,PITFALLS}.md"
      via: "@~-syntax for template references"
      pattern: "@~/.claude/devflow/templates/research-project/"
    - from: "plugins/devflow/agents/codebase-mapper.md"
      to: "plugins/devflow/devflow/templates/codebase/{stack,integrations,architecture,structure,conventions,testing,patterns,concerns}.md"
      via: "@~-syntax for template references"
      pattern: "@~/.claude/devflow/templates/codebase/"
---

<objective>
Edit 2 agent files (project-researcher, codebase-mapper) to remove their inline duplicated content and replace it with `@~/.claude/devflow/references/<name>.md` references (research-tooling) and `@~/.claude/devflow/templates/<subdir>/<name>.md` references (output-format / codebase templates).

Purpose: Cut the per-spawn token cost of these two agents — both currently carry hundreds of lines of inline templates that already exist on disk. After this TRD, each spawn ships @-references; the actual template body resolves once per session via the runtime mirror.

Output: 2 modified agent files. Net cut: ≈930 lines (project-researcher 429 + codebase-mapper 504).

This TRD runs in parallel with TRD 02 — disjoint file ownership (TRD 02 owns planner/job-checker/debugger/objective-researcher/verifier; TRD 03 owns project-researcher/codebase-mapper). Both depend on TRD 01.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Same `@~`-reference convention as TRD 02. Agents already use this pattern in their `<execution_context>` blocks:

```markdown
<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>
```

For replacing an inline template block, the convention here mirrors what `<execution_context>` already does — multiple `@`-references stacked, one per line:

```markdown
<output_formats>

All files → `.planning/research/`

Templates:
@~/.claude/devflow/templates/research-project/SUMMARY.md
@~/.claude/devflow/templates/research-project/STACK.md
@~/.claude/devflow/templates/research-project/FEATURES.md
@~/.claude/devflow/templates/research-project/ARCHITECTURE.md
@~/.claude/devflow/templates/research-project/PITFALLS.md

</output_formats>
```

Existing on-disk template structure (mirrored to ~/.claude/devflow/templates/ on SessionStart):

```
plugins/devflow/devflow/templates/codebase/
├── architecture.md
├── concerns.md
├── conventions.md
├── integrations.md
├── patterns.md             ← created by TRD 01
├── stack.md
├── structure.md
└── testing.md

plugins/devflow/devflow/templates/research-project/
├── ARCHITECTURE.md
├── FEATURES.md
├── PITFALLS.md
├── STACK.md
└── SUMMARY.md
```

Note casing: codebase/ uses lowercase filenames, research-project/ uses UPPERCASE. Match the existing on-disk casing in @-references.
</codebase_examples>

<anti_patterns>
- DO NOT modify the existing on-disk templates in this TRD. They are the destination, not the subject. Edits to template content are out of scope (and not needed — TRD 04 will diff them as a sanity check).
- DO NOT use inconsistent casing in @-references. `codebase/stack.md` is lowercase; `research-project/STACK.md` is uppercase. Both reflect on-disk reality.
- DO NOT delete the wrapper XML tags (`<output_formats>`, `<templates>`). Keep them with the @-references inside.
- DO NOT touch any other agent files in this TRD. TRD 02 owns the others.
- DO NOT verify template content matches inline content during the edit. That's TRD 04's job. If you discover a substantive mismatch during execution, document it in SUMMARY but DO NOT update either side — leave it for TRD 04 to address.
</anti_patterns>

<error_recovery>
- **Inline template content differs from on-disk template**: Document in SUMMARY (mismatch between inline copy in agent vs on-disk template). Do NOT attempt to reconcile in this TRD — TRD 04 will diff and decide. The @-reference replacement still goes through; if there's a content drift, the on-disk wins (since that's what runtime resolves).
- **codebase-mapper has 8 templates, on-disk has 8** (after TRD 01 created patterns.md): Verify all 8 exist via `ls plugins/devflow/devflow/templates/codebase/` BEFORE doing the edit. If patterns.md is missing, TRD 01 didn't complete — check 13-01-SUMMARY.md and re-run TRD 01.
- **Frontmatter accidentally deleted**: Restore from git as in TRD 02.
- **Wrong line range deleted**: `git checkout plugins/devflow/agents/<file>.md` and retry.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/13-phase-h-prompt-extraction/13-CONTEXT.md
@.planning/objectives/13-phase-h-prompt-extraction/13-RESEARCH.md
@.planning/objectives/13-phase-h-prompt-extraction/13-01-SUMMARY.md
@plugins/devflow/agents/project-researcher.md
@plugins/devflow/agents/codebase-mapper.md
</context>

<gotchas>
- **Pre-flight check**: Before editing, run `ls plugins/devflow/devflow/templates/codebase/` and confirm all 8 expected files (architecture, concerns, conventions, integrations, patterns, stack, structure, testing) exist. If patterns.md is missing, TRD 01 failed — STOP and re-run TRD 01.
- **project-researcher has TWO extractions** (lines 63-166 preamble + lines 168-493 templates). Do the LATER one FIRST (lines 168-493 templates) so the earlier line numbers don't shift.
- **codebase-mapper templates span lines 169-672** = 504 lines. Single bulk replacement covers all 8 inline templates at once.
- **codebase-mapper template guidelines** (e.g., the "PATTERNS.md Guidelines" bullets after the PATTERNS template) — these were extracted into templates/codebase/patterns.md as part of TRD 01. They're already on-disk. Just delete the inline copy along with the template body.
- **Verify final filenames match @-reference targets exactly**: Use `ls -1` to copy filenames; do NOT type them by hand (case sensitivity).
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Edit project-researcher.md to externalize research tooling + 5 output-format templates</name>
  <files>plugins/devflow/agents/project-researcher.md</files>
  <action>
Two extractions from project-researcher.md, do the LATER one FIRST.

**1. Lines 168-493 (`<output_formats>` section — 5 inline templates):**

Read project-researcher.md lines 165-495 to verify brackets.

Replace the body of `<output_formats>` (between opening and closing tags, exclusive) with:

```
<output_formats>

All files → `.planning/research/`

Templates:
@~/.claude/devflow/templates/research-project/SUMMARY.md
@~/.claude/devflow/templates/research-project/STACK.md
@~/.claude/devflow/templates/research-project/FEATURES.md
@~/.claude/devflow/templates/research-project/ARCHITECTURE.md
@~/.claude/devflow/templates/research-project/PITFALLS.md

</output_formats>
```

The "All files → .planning/research/" line is preserved as orientation context (one line of value, kept inline; everything else externalized).

**2. Lines 63-166 (`<tool_strategy>` + `<verification_protocol>` — research methodology):**

After step 1's edit, the line numbers shift. Re-check current line range with `grep -n "^<tool_strategy>\|^</verification_protocol>" plugins/devflow/agents/project-researcher.md`.

Replace the COMBINED span from `<tool_strategy>` through `</verification_protocol>` (inclusive) with a single combined wrapper:

```
<research_tooling>

<!-- Source: extracted from inline 2026-05 (was: <tool_strategy> + <verification_protocol>) -->

@~/.claude/devflow/references/research-tooling.md

</research_tooling>
```

This collapses 2 tags into 1 wrapper matching the reference name. Mirror what TRD 02 does for objective-researcher.md.

# CRITICAL: Do step 1 (later range) FIRST. Otherwise step 2's edit will shift step 1's line numbers and the bulk replace will go wrong.
# GOTCHA: Don't accidentally include the closing `</output_formats>` in the wrong block. Always Read 2 lines before/after the target range to confirm brackets.
# PATTERN: Match objective-researcher.md's `<research_tooling>` collapse from TRD 02.
  </action>
  <verify>
1. `grep -c "@~/.claude/devflow/references/research-tooling.md" plugins/devflow/agents/project-researcher.md` returns 1
2. `grep -c "@~/.claude/devflow/templates/research-project/" plugins/devflow/agents/project-researcher.md` returns 5
3. `grep "@~/.claude/devflow/templates/research-project/SUMMARY.md\|@~/.claude/devflow/templates/research-project/STACK.md\|@~/.claude/devflow/templates/research-project/FEATURES.md\|@~/.claude/devflow/templates/research-project/ARCHITECTURE.md\|@~/.claude/devflow/templates/research-project/PITFALLS.md" plugins/devflow/agents/project-researcher.md | wc -l` returns 5
4. `grep -c "^<research_tooling>$\|^</research_tooling>$" plugins/devflow/agents/project-researcher.md` returns 2
5. `grep -c "^<output_formats>$\|^</output_formats>$" plugins/devflow/agents/project-researcher.md` returns 2
6. `wc -l plugins/devflow/agents/project-researcher.md` returns ≤200 (was 618; cut ≥418)
7. `head -10 plugins/devflow/agents/project-researcher.md | grep -c "^---$"` returns 2 (frontmatter intact)
8. `grep "## SUMMARY.md\|## STACK.md\|## Recommended Stack\|## Tool Priority Order" plugins/devflow/agents/project-researcher.md` returns 0 (inline content removed)
9. `grep "<role>\|<philosophy>\|<execution_flow>" plugins/devflow/agents/project-researcher.md` finds all (preserved sections)
  </verify>
  <done>
project-researcher.md has 6 @-references inside (1 to research-tooling.md + 5 to research-project templates), preserves frontmatter and all non-extracted sections, line count cut ≥418.
  </done>
  <recovery>
- If after step 1 the line numbers for step 2 are unclear, `grep -n "^<tool_strategy>\|^</verification_protocol>\|^<output_formats>\|^</output_formats>" plugins/devflow/agents/project-researcher.md` shows current locations.
- If the combined `<research_tooling>` wrapper feels too aggressive, fall back to: replace `<tool_strategy>` body with `@`-reference, leave `<verification_protocol>` wrapper with a `<!-- See <tool_strategy> for the @-reference; this section's content is in the merged research-tooling.md -->` comment. Document in SUMMARY.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Edit codebase-mapper.md to externalize 8 inline templates</name>
  <files>plugins/devflow/agents/codebase-mapper.md</files>
  <action>
codebase-mapper.md has its `<templates>` section at lines 169-763 (per the earlier grep) containing 8 inline templates: STACK (171), INTEGRATIONS (236), ARCHITECTURE (306), STRUCTURE (375), CONVENTIONS (444), TESTING (524), PATTERNS (634), CONCERNS (673).

PRE-FLIGHT CHECK before editing:
```
ls plugins/devflow/devflow/templates/codebase/
```
Must list 8 files: architecture.md, concerns.md, conventions.md, integrations.md, patterns.md, stack.md, structure.md, testing.md. If patterns.md is missing, STOP and re-run TRD 01.

Read codebase-mapper.md lines 167-765 to capture the bracketing context.

Replace the entire body of `<templates>` (between opening and closing tags, exclusive) with:

```
<templates>

Each codebase document follows a dedicated template. Templates live at `plugins/devflow/devflow/templates/codebase/` and are mirrored to `~/.claude/devflow/templates/codebase/` by the sync-runtime hook on SessionStart.

@~/.claude/devflow/templates/codebase/stack.md
@~/.claude/devflow/templates/codebase/integrations.md
@~/.claude/devflow/templates/codebase/architecture.md
@~/.claude/devflow/templates/codebase/structure.md
@~/.claude/devflow/templates/codebase/conventions.md
@~/.claude/devflow/templates/codebase/testing.md
@~/.claude/devflow/templates/codebase/patterns.md
@~/.claude/devflow/templates/codebase/concerns.md

Each template includes the file structure, section guidelines, and acceptance criteria. Skip patterns that don't apply to the analyzed codebase (e.g., no components in a CLI tool; no testing template if no tests exist).

</templates>
```

The intro paragraph + closing paragraph preserve orientation context (1 sentence each); everything between is template references.

# CRITICAL: Verify all 8 on-disk templates exist (especially patterns.md from TRD 01) BEFORE editing. If any are missing, the @-reference will dangle.
# GOTCHA: codebase-mapper.md `<templates>` section is huge (~594 lines). Edit targets the entire body. Use a single Edit call with old_string spanning from after `<templates>` through before `</templates>`.
# GOTCHA: Each on-disk template at templates/codebase/<name>.md uses the nested ``` ```markdown ... ``` ``` fence pattern (template body is INSIDE the inner block + has guidelines OUTSIDE). The agent doesn't need to reproduce that structure; it just @-references the template files.
# PATTERN: Mirror the project-researcher.md `<output_formats>` edit from Task 1.
  </action>
  <verify>
1. `grep -c "@~/.claude/devflow/templates/codebase/" plugins/devflow/agents/codebase-mapper.md` returns 8
2. `grep "@~/.claude/devflow/templates/codebase/stack.md\|@~/.claude/devflow/templates/codebase/integrations.md\|@~/.claude/devflow/templates/codebase/architecture.md\|@~/.claude/devflow/templates/codebase/structure.md\|@~/.claude/devflow/templates/codebase/conventions.md\|@~/.claude/devflow/templates/codebase/testing.md\|@~/.claude/devflow/templates/codebase/patterns.md\|@~/.claude/devflow/templates/codebase/concerns.md" plugins/devflow/agents/codebase-mapper.md | wc -l` returns 8
3. `grep -c "^<templates>$\|^</templates>$" plugins/devflow/agents/codebase-mapper.md` returns 2
4. `wc -l plugins/devflow/agents/codebase-mapper.md` returns ≤320 (was 812; cut ≥492)
5. `head -10 plugins/devflow/agents/codebase-mapper.md | grep -c "^---$"` returns 2 (frontmatter intact)
6. `grep "## STACK.md Template\|## INTEGRATIONS.md Template\|## ARCHITECTURE.md Template\|## PATTERNS.md Template" plugins/devflow/agents/codebase-mapper.md` returns 0 (inline content removed)
7. `grep "<why_this_matters>\|<philosophy>\|<process>\|<forbidden_files>\|<critical_rules>" plugins/devflow/agents/codebase-mapper.md` finds all (preserved sections)
  </verify>
  <done>
codebase-mapper.md has 8 @-references to templates/codebase/*.md, preserves frontmatter and all non-templates sections, line count cut ≥492.
  </done>
  <recovery>
- If pre-flight check finds a missing on-disk template, STOP — TRD 01 didn't complete. Re-run TRD 01 first.
- If the bulk Edit deletes too much (e.g. accidentally swallows `<forbidden_files>`), `git checkout plugins/devflow/agents/codebase-mapper.md` and retry with smaller bracket. Confirm the closing `</templates>` line via `grep -n "</templates>" plugins/devflow/agents/codebase-mapper.md` BEFORE editing.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After this TRD lands:

1. **Both agents have @-references to the new files:**
   ```bash
   grep -c "@~/.claude/devflow/references/research-tooling.md" plugins/devflow/agents/project-researcher.md  # 1
   grep -c "@~/.claude/devflow/templates/research-project/" plugins/devflow/agents/project-researcher.md  # 5
   grep -c "@~/.claude/devflow/templates/codebase/" plugins/devflow/agents/codebase-mapper.md  # 8
   ```

2. **No stale inline content remains:**
   ```bash
   grep "## STACK.md Template\|## SUMMARY.md\|## Tool Priority Order" plugins/devflow/agents/project-researcher.md  # 0
   grep "## INTEGRATIONS.md Template\|## CONCERNS.md Template" plugins/devflow/agents/codebase-mapper.md  # 0
   ```

3. **Frontmatter intact on both agents:**
   ```bash
   head -10 plugins/devflow/agents/project-researcher.md | grep -c "^---$"  # 2
   head -10 plugins/devflow/agents/codebase-mapper.md | grep -c "^---$"  # 2
   ```

4. **Tests still pass (no agent-loading regressions):**
   ```bash
   npm test
   ```
   1471/1471 (no behavior regressions).

5. **Total line cut:**
   ```bash
   wc -l plugins/devflow/agents/{project-researcher,codebase-mapper}.md
   ```
   Expected total ≤ ~520 (was 1430; cut ≥910 lines).
</verification>

<success_criteria>
- project-researcher.md: cut ≥418 lines, contains 1 @-reference to research-tooling.md AND 5 @-references to research-project templates
- codebase-mapper.md: cut ≥492 lines, contains 8 @-references to codebase templates
- Both agents preserve YAML frontmatter unchanged
- Both agents preserve all non-extracted sections unchanged
- Single atomic commit covering both agent edits
- `npm test` shows 1471/1471 passing
</success_criteria>

<output>
After completion, create `.planning/objectives/13-phase-h-prompt-extraction/13-03-SUMMARY.md`.

SUMMARY must capture:
- Pre/post line counts for both edited agents
- Total line cut across the 2 agents
- Pre-flight check result (all 8 codebase templates present? all 5 research-project templates present?)
- Any inline-vs-on-disk content drift discovered (NOT reconciled here; flagged for TRD 04)
- Test results (X/Y pass)
- Single commit SHA
</output>

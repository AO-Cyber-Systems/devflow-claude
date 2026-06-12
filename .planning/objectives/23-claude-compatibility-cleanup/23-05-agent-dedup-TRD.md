---
objective: 23-claude-compatibility-cleanup
trd: 05
type: standard
wave: 2
depends_on: ["23-01", "23-02", "23-03", "23-04"]
files_modified:
  - plugins/devflow/agents/planner.md
  - plugins/devflow/agents/executor.md
  - plugins/devflow/devflow/references/deviation-rules.md (CREATE)
autonomous: true
requirements: [SCOPE-7]
must_haves:
  truths:
    - "planner.md no longer inlines the full checkpoint-type and TDD sections; both are reachable via @-references to references/checkpoints.md and references/tdd.md"
    - "executor.md deviation Rules 1-4 definitions (INCLUDING the obj-10 Rule-4 structured queueable return format) live intact in references/deviation-rules.md; RULE PRIORITY stays inline"
    - "All @-references in planner.md and executor.md resolve to files that exist under plugins/devflow/devflow/ (and survive the 23-01 mirror exclusion patterns)"
    - "Objective-10 additions preserved: executor frontmatter maxTurns/isolation, Rule-4 queueable format content, verifier.md untouched"
    - "SUMMARY contains before/after byte and token measurements for planner.md and executor.md"
  artifacts:
    - "plugins/devflow/devflow/references/deviation-rules.md — new reference (content moved, not rewritten)"
    - "plugins/devflow/agents/planner.md — deduplicated"
    - "plugins/devflow/agents/executor.md — slimmed with @-reference"
  key_links:
    - "planner.md <checkpoints> → @~/.claude/devflow/references/checkpoints.md (NET-NEW reference — planner currently lacks it)"
    - "planner.md <tdd_integration> → @~/.claude/devflow/references/tdd.md (reference already exists at line 584; keep it, drop surrounding duplicate)"
    - "executor.md <deviation_rules> → @~/.claude/devflow/references/deviation-rules.md (NET-NEW reference and NET-NEW file)"
---

<objective>
Deduplicate planner.md (50,631 bytes ≈ 12.6k tokens/spawn) and executor.md (25,892 bytes) against the authoritative references: collapse planner's checkpoint and TDD blocks to summaries + @-references, consolidate planner's five overlapping context-budget sections in place, and extract executor's deviation-rule definitions to a new references/deviation-rules.md.

Purpose: highest token ROI in the objective — target >=4k tokens/spawn combined reduction across the two agent files. Behavior must stay identical: content moves behind @-references loaded at spawn, it does not disappear.
Output: Two slimmed agent prompts, one new reference file, before/after measurements.
</objective>

<file_tree>
plugins/devflow/
├── agents/planner.md                          ← MODIFY (dedupe ~145+ lines)
├── agents/executor.md                         ← MODIFY (extract ~100 lines)
└── devflow/references/deviation-rules.md      ← CREATE (content moved from executor.md)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Existing @-reference convention in agent bodies (home-mirror paths, NOT ${CLAUDE_PLUGIN_ROOT}):

```markdown
@~/.claude/devflow/references/trd-spec.md          ← planner.md:479
See @~/.claude/devflow/references/checkpoints.md   ← executor.md:249
```

Verified section line ranges (2026-06-12, current HEAD):
- planner.md: `## Quality Degradation Curve` 71-81; `<scope_estimation>` 425-475 containing `## Context Budget Rules` 427, `## Split Signals` 439, `## Depth Calibration` 450, `## Context Per Task Estimates` 460; `<checkpoints>` 489-576; `<tdd_integration>` 578-636.
- executor.md: `<deviation_rules>` starts line 114, ends ~215 (followed by `<authentication_gates>`); frontmatter lines 1-12 carries maxTurns/isolation hardening.
</codebase_examples>

<anti_patterns>
- Do NOT rewrite/improve content while moving it — this is a content MOVE. The Rule 1-4 definitions, SCOPE BOUNDARY, and FIX ATTEMPT LIMIT text transfer to deviation-rules.md intact (locked binding).
- Do NOT remove planner.md's @-reference to tdd.md (line 584) along with the block — the reference is the replacement's core.
- Do NOT extract the five context-budget sections to a reference file — they are planner-specific; consolidation happens IN-PLACE (locked binding).
- Do NOT touch verifier.md, execute-objective.md, or any hooks — obj-10 additions there are out of this TRD's file set entirely.
- Do NOT use ${CLAUDE_PLUGIN_ROOT} in @-references — it does not interpolate; use @~/.claude/devflow/... paths.
</anti_patterns>

<error_recovery>
- Every edit is git-tracked; `git checkout -- plugins/devflow/agents/planner.md` restores on a botched consolidation.
- If a preservation grep fails in Task 3, diff against `git show HEAD~N:plugins/devflow/agents/executor.md` to find the dropped content and restore it into deviation-rules.md or the inline summary as appropriate.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/23-claude-compatibility-cleanup/OBJECTIVE.md
@plugins/devflow/agents/planner.md
@plugins/devflow/agents/executor.md
@plugins/devflow/devflow/references/checkpoints.md
@plugins/devflow/devflow/references/tdd.md
</context>

<research_context>
From 23-RESEARCH.md (HIGH confidence):
- planner.md <checkpoints> (489-576, 87 lines) duplicates references/checkpoints.md; planner currently has NO @-reference to it — the reference must be ADDED when the block is removed (research Pitfall 4). Replacement shape (research Code Examples): keep a 4-line summary of the three checkpoint types + their usage split (90%/9%/1%) + the @-reference.
- planner.md <tdd_integration> (578-636, 58 lines) duplicates references/tdd.md (Iron Law, Plan Structure, Red-Green-Refactor, TDD context budget). Replacement: Iron Law one-liner + test-pairing rule one-liner + `@~/.claude/devflow/references/tdd.md`.
- Five context-budget sections all restate the ~50% rule. Consolidation target: fold the Quality Degradation Curve table (the only unique content at 71-81) into `## Context Budget Rules` (427), merge `## Split Signals` and `## Depth Calibration` into the same scope_estimation block without repetition, keep `## Context Per Task Estimates` tables. Net: one authoritative context-budget location inside <scope_estimation>, plus a one-line pointer where the Curve section was.
- executor.md extraction: lines 114-215 content → references/deviation-rules.md INCLUDING the obj-10 Rule-4 structured queueable return format (decision/context/options/recommendation/rationale fields + the autonomous-mode parking note). Inline replacement in executor.md: one-line summary per rule (Rule 1 auto-fix bugs; Rule 2 auto-add missing critical functionality; Rule 3 auto-fix blocking issues; Rule 4 STOP and return structured queueable checkpoint) + the RULE PRIORITY decision table KEPT INLINE (operationally critical) + `@~/.claude/devflow/references/deviation-rules.md`.
- The new reference ships through the same sync-runtime mirror; 23-01's exclusion patterns (test files and __fixtures__ only) do not match references/*.md — verify explicitly in Task 3.
</research_context>

<gotchas>
- Token measurement method (use consistently for before AND after): `wc -c` for bytes; tokens ≈ bytes/4 (document the proxy in the SUMMARY). Capture before-values FIRST, in Task 1, before any edit.
- The >=4k-token combined target is the objective's stated goal; research line-counts suggest ~3.2-3.5k may be the honest ceiling from the mapped sections alone. If after-measurements fall short, do NOT cut additional content to hit the number — report the shortfall and the per-section breakdown in the SUMMARY.
- planner.md was extended by objective 0 (Intent Resolution steps) and obj 3/5 (user_preferences advisory blocks) — none of those sections are in scope; touch ONLY the mapped sections.
- 12 pre-existing test failures in daemon/watcher/peer-scan/novel-domain — do not fix, do not worsen (this TRD should not affect tests at all).
- HARD CONSTRAINT: never use port 8080 in any moved/summarized content or example; use 8091 if a port example is needed.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Baseline measurements + extract executor deviation rules to references/deviation-rules.md</name>
  <files>plugins/devflow/devflow/references/deviation-rules.md, plugins/devflow/agents/executor.md, .planning/objectives/23-claude-compatibility-cleanup/23-05-measurements.md</files>
  <action>
1. BEFORE any edit, record baselines to .planning/objectives/23-claude-compatibility-cleanup/23-05-measurements.md:
```bash
wc -c plugins/devflow/agents/planner.md plugins/devflow/agents/executor.md
```
Record bytes + tokens (bytes/4) per file, labeled "before".

2. Create plugins/devflow/devflow/references/deviation-rules.md. Content: a short header (purpose: deviation-rule definitions for executors; consumed via @-reference from executor.md) + the MOVED content of executor.md lines 114-215: Rules 1-4 full definitions with triggers/examples, the complete Rule-4 structured queueable return format block (decision/context/options/recommendation/rationale + autonomous-mode note — obj-10 content, byte-faithful), Edge cases, SCOPE BOUNDARY, FIX ATTEMPT LIMIT.

3. In executor.md, replace the moved content inside <deviation_rules> with:
   - The "While executing, you WILL discover work not in the TRD" framing line + shared-process line (keep — application logic)
   - One-line summary per rule (see research_context)
   - RULE PRIORITY block KEPT INLINE verbatim (the 1/2/3 priority list + "When in doubt" heuristic)
   - `Full rule definitions, Rule-4 return format, scope boundary, and fix-attempt limit: @~/.claude/devflow/references/deviation-rules.md`
   Keep the <deviation_rules> tag wrapper. Do not touch frontmatter (maxTurns: 50, isolation: worktree), <authentication_gates>, or anything else.

Commit: `refactor(23-05): extract executor deviation rules to references/deviation-rules.md`
  </action>
  <verify>grep -c "recommendation: option-b" plugins/devflow/devflow/references/deviation-rules.md returns >=1; grep -n "RULE PRIORITY" plugins/devflow/agents/executor.md still matches inline; grep -n "deviation-rules.md" plugins/devflow/agents/executor.md shows the @-reference; grep -n "maxTurns" plugins/devflow/agents/executor.md unchanged</verify>
  <done>deviation-rules.md exists with the full moved content; executor.md keeps summaries + RULE PRIORITY + @-reference; baselines recorded</done>
  <recovery>git checkout -- plugins/devflow/agents/executor.md and re-extract if any obj-10 Rule-4 field (decision/context/options/recommendation) is missing from deviation-rules.md.</recovery>
</task>

<task type="auto">
  <name>Task 2: planner.md dedup — checkpoints, TDD, context-budget consolidation</name>
  <files>plugins/devflow/agents/planner.md</files>
  <action>
Three in-place edits to planner.md (locate by section markers, not stale line numbers):

1. Replace the full <checkpoints>...</checkpoints> block (currently 489-576) with:
```markdown
<checkpoints>
Three checkpoint types plan for user interaction:
- `checkpoint:human-verify` (90%): human confirms Claude's automated work
- `checkpoint:decision` (9%): human chooses implementation direction
- `checkpoint:human-action` (1%): action with no CLI/API equivalent (rare)

Automation-first rule: if Claude CAN do it via CLI/API, Claude MUST — checkpoints verify AFTER automation. Auth gates are created dynamically on auth errors, never pre-planned.

@~/.claude/devflow/references/checkpoints.md
</checkpoints>
```

2. Replace the full <tdd_integration>...</tdd_integration> block (currently 578-636) with:
```markdown
<tdd_integration>
Iron Law: no production code without a failing test first. Every source file with logic gets a paired test file (exception marker: `<!-- TDD-EXCEPTION: reason -->`). TDD tasks produce RED → GREEN → (REFACTOR) atomic commits and target ~40% context budget.

@~/.claude/devflow/references/tdd.md
</tdd_integration>
```

3. Consolidate the five context-budget sections IN-PLACE (no reference extraction — planner-specific):
   - Fold the Quality Degradation Curve table (lines 71-81) into `## Context Budget Rules` inside <scope_estimation>; replace the original section with a one-line pointer ("Quality degrades past ~50% context — budget table in <scope_estimation>").
   - Within <scope_estimation>, merge overlapping restatements: one statement of the ~50% rule + the degradation table + the tasks-per-plan table; keep `## Split Signals` and `## Depth Calibration` content but strip lines repeating the 50% rule or the 2-3-task rule already stated above; keep `## Context Per Task Estimates` tables.
   Preserve every UNIQUE rule/table; remove only repetition.

Commit: `refactor(23-05): dedup planner checkpoints/TDD blocks against references, consolidate context-budget sections`
  </action>
  <verify>grep -n "references/checkpoints.md" plugins/devflow/agents/planner.md shows the net-new @-reference; grep -n "references/tdd.md" plugins/devflow/agents/planner.md still matches; grep -c "complete within ~50% context" plugins/devflow/agents/planner.md returns 1; planner.md byte count dropped by >=6000 vs baseline</verify>
  <done>Both blocks replaced with summary + @-reference; exactly one authoritative context-budget statement; no Intent-Resolution/user_preferences/goal-backward content touched</done>
  <recovery>git checkout -- plugins/devflow/agents/planner.md and redo edit-by-edit if a consolidation removes a unique table (compare section inventory against the research map).</recovery>
</task>

<task type="auto">
  <name>Task 3: After-measurements + preservation and reference-resolution verification</name>
  <files>.planning/objectives/23-claude-compatibility-cleanup/23-05-measurements.md</files>
  <action>
1. After-measurements: `wc -c` both agent files; append "after" bytes + tokens (bytes/4) + per-file and combined deltas to 23-05-measurements.md. Combined target: >=4k tokens (~16,000 bytes); if short, record actuals and per-section breakdown honestly (see gotchas — do not cut more content to hit the number).

2. @-reference resolution sweep — every @~/.claude/devflow/... path in BOTH agent files must map to an existing repo file:
```bash
grep -ho '@~/.claude/devflow/[a-zA-Z0-9/._-]*' plugins/devflow/agents/planner.md plugins/devflow/agents/executor.md | sort -u | \
  sed 's|@~/.claude/devflow/|plugins/devflow/devflow/|' | while read f; do test -f "$f" || echo "DANGLING: $f"; done
```
Must print nothing.

3. Mirror-exclusion interplay check (23-01 dependency): `node -e "const p=[/\.test\.cjs$/,/\.test\.js$/,/(^|\/)__fixtures__(\/|$)/]; console.log(p.some(r=>r.test('references/deviation-rules.md')))"` prints `false` — the new reference ships through the mirror.

4. Obj-10 preservation greps:
   - `grep -n "maxTurns: 50" plugins/devflow/agents/executor.md` and `grep -n "isolation: worktree" plugins/devflow/agents/executor.md` — present
   - `grep -n "recommendation:" plugins/devflow/devflow/references/deviation-rules.md` — Rule-4 format present
   - `grep -n "RULE PRIORITY" plugins/devflow/agents/executor.md` — inline
   - `git diff --stat HEAD origin/main -- plugins/devflow/agents/verifier.md` not needed; simply: `git status --porcelain plugins/devflow/agents/verifier.md plugins/devflow/devflow/workflows/execute-objective.md` shows verifier.md unmodified by this TRD (execute-objective.md may show 23-03's committed change only)

5. `npm test` — zero new failures.

Commit: `docs(23-05): record before/after dedup measurements`
  </action>
  <verify>Dangling-reference sweep prints nothing; all preservation greps match; measurements file has before/after/delta for both agents; npm test clean of new failures</verify>
  <done>Measurements complete and honest; every @-reference resolves; obj-10 content verified intact; SUMMARY can cite the numbers directly</done>
  <recovery>Any DANGLING output → fix the path or create the missing file before commit. Any preservation grep miss → restore from git history per error_recovery.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- planner.md and executor.md slimmed; combined byte delta recorded; target >=16,000 bytes (~4k tokens), shortfall documented if any
- references/deviation-rules.md exists, contains Rules 1-4 + Rule-4 queueable format + SCOPE BOUNDARY + FIX ATTEMPT LIMIT
- Net-new @-references: planner→checkpoints.md, executor→deviation-rules.md; existing planner→tdd.md kept
- Zero dangling @-references across both agents
- verifier.md, hooks, workflows untouched by this TRD
</verification>

<success_criteria>
- Agent prompts deduplicated against authoritative references with behavior-identical content reachable at spawn
- Before/after byte + token measurements for planner.md and executor.md captured in 23-05-measurements.md and surfaced in the SUMMARY (locked requirement)
- All obj-10 additions preserved
</success_criteria>

<output>
After completion, create `.planning/objectives/23-claude-compatibility-cleanup/23-05-SUMMARY.md` — MUST include the before/after byte and token table for planner.md and executor.md.
</output>

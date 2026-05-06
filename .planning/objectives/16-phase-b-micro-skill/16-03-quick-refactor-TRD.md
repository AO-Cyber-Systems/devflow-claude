---
objective: 16-phase-b-micro-skill
trd: "03"
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/skills/quick/SKILL.md
  - plugins/devflow/devflow/workflows/quick.md
autonomous: true
requirements:
  - PHASE-B3

must_haves:
  truths:
    - "/devflow:quick is documented as the small-feature tier with explicit cutoffs (<5 files, <200 LOC, no new abstractions)"
    - "/devflow:quick description / objective explicitly contrasts itself against /devflow:micro (the floor) and /devflow:build (multi-subsystem)"
    - "Triggers for /devflow:quick no longer claim the 'one-line' / 'tiny' floor — those route to /devflow:micro"
    - "All existing /devflow:quick functionality is preserved (no behavioural change to the workflow body's process steps)"
  artifacts:
    - path: plugins/devflow/skills/quick/SKILL.md
      provides: "Updated description, triggers, objective with explicit cutoff and contrast to micro"
      contains: "<5 files"
    - path: plugins/devflow/devflow/workflows/quick.md
      provides: "Updated <purpose> documenting cutoffs; rest of workflow preserved"
      contains: "<5 files"
  key_links:
    - from: plugins/devflow/skills/quick/SKILL.md
      to: plugins/devflow/devflow/workflows/quick.md
      via: "@~/.claude/devflow/workflows/quick.md (already in place — preserved)"
      pattern: "@~/.claude/devflow/workflows/quick.md"
---

<objective>
Refactor `/devflow:quick`'s positioning documentation. Today its description claims trivial-task triggers ("quick fix", "tiny", "can you just"); after Phase B those triggers belong to `/devflow:micro`. Quick becomes the explicit small-feature tier: <5 files, <200 LOC, no new abstractions.

Purpose: Issue #27 sub-task B3 — without this clarification, the routing decision table in classifier.cjs (updated in 16-04) will say one thing and the skill description will say another. Drift between the two will defeat ambient routing on small tasks.

Output: Updated SKILL.md description + objective + triggers, and a revised `<purpose>` block in workflow.md. NO change to the workflow's `<process>` steps — quick's behaviour is untouched, only its scope documentation.
</objective>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Current `plugins/devflow/skills/quick/SKILL.md` (lines 1-46):**

```markdown
---
name: quick
description: |
  Do a small task quickly with clean git commits and progress tracking, without full project ceremony.
  Use when the user wants to do something small, quick, or ad-hoc without full objective ceremony.
  Triggers on: "quickly do", "just do this", "small task", "quick change", "quick fix", "can you just"
argument-hint: "[--full]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
---
<objective>
Execute small, ad-hoc tasks with DevFlow guarantees (atomic commits, STATE.md tracking).

Quick mode is the same system with a shorter path:
- Spawns planner (quick mode) + executor(s)
- Quick tasks live in `.planning/quick/` separate from planned objectives
- Updates STATE.md "Quick Tasks Completed" table (NOT ROADMAP.md)

**Default:** Skips research, job-checker, verifier. Use when you know exactly what to do.

**`--full` flag:** Enables job-checking (max 2 iterations) and post-execution verification. Use when you want quality guarantees without full milestone ceremony.

**Intent defaults for quick mode:** `work: bugfix` (smallest TDD posture commensurate with quick's purpose). CLAUDE.md absorption is **skipped** — quick mode honors the no-ceremony promise rather than applying user playbook directives that would require strict TDD on a typo fix. To opt back into the user playbook, prefer `/devflow:build` or `/devflow:plan-objective --work <type>` instead.
</objective>
```

**Current `plugins/devflow/devflow/workflows/quick.md` (lines 1-12, the `<purpose>` block):**

```markdown
---
status: active
---
<purpose>
Execute small, ad-hoc tasks with DevFlow guarantees (atomic commits, STATE.md tracking). Quick mode spawns planner (quick mode) + executor(s), tracks tasks in `.planning/quick/`, and updates STATE.md's "Quick Tasks Completed" table.

With `--full` flag: enables job-checking (max 2 iterations) and post-execution verification for quality guarantees without full milestone ceremony.
</purpose>
```

The rest of `workflows/quick.md` (lines 13-462) — the `<process>` steps — is the BEHAVIOUR. We are NOT changing behaviour. Only the `<purpose>` and the SKILL.md description are touched.
</codebase_examples>

<anti_patterns>
- **Do NOT** modify any of the `<process>` steps in `workflows/quick.md`. Quick's behaviour is fine; only its scope documentation needs the refactor.
- **Do NOT** remove the `--full` flag, the `Intent defaults` block, or the `CLAUDE.md absorption is skipped` paragraph from SKILL.md's objective. All those decisions still hold for quick.
- **Do NOT** change `argument-hint: "[--full]"` — the flag still exists; we're just clarifying scope.
- **Do NOT** introduce micro-specific triggers ("fix typo", "1-line fix") in quick's triggers list. Those belong to micro (16-04 wires the route-intent regex).
- **Do NOT** rename or move the skill. `/devflow:quick` keeps its name and path.
- **Do NOT** edit `plugins/devflow/devflow/workflows/quick.md`'s STATE.md table-shape logic (steps 7a-7d, lines 337-385) — that logic also serves micro entries (single shared table; locked decision 3 in CONTEXT.md).
</anti_patterns>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/16-phase-b-micro-skill/16-CONTEXT.md
@.planning/objectives/16-phase-b-micro-skill/16-RESEARCH.md

@plugins/devflow/skills/quick/SKILL.md
@plugins/devflow/devflow/workflows/quick.md
</context>

<gotchas>
1. **Description-block triggers must drop `quick fix`, `quick change`, `tiny`, `can you just`.** These are micro's territory now. Replace with feature-tier triggers: "small change", "small feature", "5-file change", "isolated bug fix".
2. **Cutoffs must match issue #27 verbatim:** `<5 files, <200 LOC, no new abstractions`. Use those exact numbers. The classifier routing table in 16-04 will reference the same.
3. **The STATE.md table logic (steps 7a-7d in workflow.md) is shared infrastructure.** Don't touch it — micro's `df-tools micro commit` (16-01) appends to the same table using the same parsing rules. If you accidentally change the column count or header detection there, you break 16-01's contract.
4. **The `<purpose>` block in workflow.md is short** (5 lines today). After this TRD it should still be short — ≤12 lines. Don't bloat.
5. **No test depends on the SKILL.md description text** (verified: no test under `plugins/devflow/devflow/bin/lib/__fixtures__/` references quick triggers). Safe to edit.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Refactor /devflow:quick SKILL.md and workflow.md purpose</name>
  <files>
    plugins/devflow/skills/quick/SKILL.md
    plugins/devflow/devflow/workflows/quick.md
  </files>
  <action>
**Part A — `plugins/devflow/skills/quick/SKILL.md`:**

Replace the YAML `description` and the `<objective>` block with the following. Keep the rest of the file (frontmatter `name`, `argument-hint`, `allowed-tools`, `<execution_context>`, `<context>`, `<process>`) UNCHANGED.

```yaml
description: |
  Small features (single executor, no planner, no verifier) — between micro (1-line) and build (multi-subsystem). Cutoff: <5 files, <200 LOC, no new abstractions.
  Use when the change is too big for /devflow:micro but doesn't warrant full /devflow:build planning.
  Triggers on: "small change", "small feature", "5-file change", "isolated bug fix", "do this", "tackle this", "make a quick pass"
```

```xml
<objective>
Execute small features with DevFlow guarantees (atomic commits, STATE.md tracking) at the small-feature tier of the DevFlow ladder.

**Cutoff (advisory, enforced by convention):**
- <5 files modified
- <200 LOC changed
- No new abstractions, no architectural decisions, no new external dependencies

**Smaller? Use `/devflow:micro`** — sub-30-LOC, single-file, ~2k token cost.
**Larger or multi-subsystem? Use `/devflow:build`** — full plan/execute/verify pipeline.

Quick mode is the same system with a shorter path:
- Spawns planner (quick mode) + executor(s)
- Quick tasks live in `.planning/quick/` separate from planned objectives
- Updates STATE.md "Quick Tasks Completed" table (NOT ROADMAP.md)

**Default:** Skips research, job-checker, verifier. Use when you know exactly what to do.

**`--full` flag:** Enables job-checking (max 2 iterations) and post-execution verification. Use when you want quality guarantees without full milestone ceremony.

**Intent defaults for quick mode:** `work: bugfix` (smallest TDD posture commensurate with quick's purpose). CLAUDE.md absorption is **skipped** — quick mode honors the no-ceremony promise rather than applying user playbook directives that would require strict TDD on a typo fix. To opt back into the user playbook, prefer `/devflow:build` or `/devflow:plan-objective --work <type>` instead.
</objective>
```

**Part B — `plugins/devflow/devflow/workflows/quick.md`:**

Replace the `<purpose>` block (lines 4-8) with:

```xml
<purpose>
Execute small features with DevFlow guarantees (atomic commits, STATE.md tracking) at the small-feature tier of the DevFlow ladder.

**Cutoff (advisory):** <5 files, <200 LOC, no new abstractions. For sub-30-LOC single-file changes, prefer `/devflow:micro` (~2k token floor). For multi-subsystem features, use `/devflow:build`.

Quick mode spawns planner (quick mode) + executor(s), tracks tasks in `.planning/quick/`, and updates STATE.md's "Quick Tasks Completed" table.

With `--full` flag: enables job-checking (max 2 iterations) and post-execution verification for quality guarantees without full milestone ceremony.
</purpose>
```

LEAVE THE REST OF `workflows/quick.md` UNCHANGED (lines 9-462). The `<required_reading>`, `<process>` steps 1-8, `<success_criteria>`, and the STATE.md table-append logic (steps 7a-7d, lines 337-385) MUST be preserved verbatim — micro depends on the same table-shape semantics.

# CRITICAL: Do NOT touch workflows/quick.md lines 13-462. Use Edit tool with precise string match for the <purpose> block only. If the Edit tool fails because the surrounding text shifted, re-read the file first and retry with the exact current text.
# CRITICAL: Use the EXACT cutoff numbers from issue #27: "<5 files, <200 LOC, no new abstractions". The classifier in 16-04 will use the same numbers verbatim.
# GOTCHA: The triggers list change is what makes route-intent's micro regex addition (16-04) work — it relies on quick's triggers no longer claiming "tiny" / "fix typo" territory.
# PATTERN: Mirror the contrast pattern used in /devflow:micro's SKILL.md — explicitly point to micro (smaller) and build (larger) as alternatives.
  </action>
  <verify>
    grep -c "Cutoff" plugins/devflow/skills/quick/SKILL.md  # expect ≥1
    grep -c "<5 files" plugins/devflow/skills/quick/SKILL.md  # expect ≥1
    grep -c "/devflow:micro" plugins/devflow/skills/quick/SKILL.md  # expect ≥1 (contrast reference)
    grep -c "/devflow:build" plugins/devflow/skills/quick/SKILL.md  # expect ≥1 (contrast reference)
    grep -c "quick fix\|tiny\|can you just" plugins/devflow/skills/quick/SKILL.md  # expect 0 (those triggers moved to micro)
    grep -c "Cutoff\|<5 files" plugins/devflow/devflow/workflows/quick.md  # expect ≥1
    diff <(sed -n '13,462p' plugins/devflow/devflow/workflows/quick.md | head -100) <(git show HEAD:plugins/devflow/devflow/workflows/quick.md | sed -n '13,113p')  # expect no diff (process steps unchanged)
    npm test 2>&1 | grep -E "^ℹ pass|^ℹ fail" | head -2  # expect pass count unchanged from end of 16-01
  </verify>
  <done>
    SKILL.md description references explicit cutoff (<5 files, <200 LOC), contrasts to /devflow:micro and /devflow:build by name, drops trivial-task triggers (no "quick fix" / "tiny" / "can you just" remaining). workflow.md `<purpose>` documents the cutoff and points to micro/build alternatives. The `<process>` steps 1-8 in workflow.md are byte-for-byte unchanged. npm test still passes.
  </done>
  <recovery>
    If the Edit tool can't match the `<purpose>` block because of whitespace differences: re-read workflows/quick.md lines 1-15 with the Read tool, copy the exact current text, then retry the edit.
    If you accidentally modify lines 13-462 of workflows/quick.md: `git checkout HEAD -- plugins/devflow/devflow/workflows/quick.md` and start over with a more precise Edit invocation.
    If npm test fails after this change: a template/snapshot test was asserting on the old wording. Inspect the failing test, decide whether to update the assertion (if the new wording is correct) or revert (if the test reflects an external contract).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
End-state checks:

1. **Description references explicit cutoff:**
   - `grep -c "<5 files" plugins/devflow/skills/quick/SKILL.md` ≥ 1.
   - `grep -c "<200 LOC" plugins/devflow/skills/quick/SKILL.md` ≥ 1.
   - `grep -c "no new abstractions" plugins/devflow/skills/quick/SKILL.md` ≥ 1.

2. **Contrast to micro and build is explicit:**
   - `grep -c "/devflow:micro" plugins/devflow/skills/quick/SKILL.md` ≥ 1.
   - `grep -c "/devflow:build" plugins/devflow/skills/quick/SKILL.md` ≥ 1.

3. **Trivial-task triggers removed from quick (they belong to micro now):**
   - `grep -c "quick fix" plugins/devflow/skills/quick/SKILL.md` == 0.
   - `grep -c "tiny" plugins/devflow/skills/quick/SKILL.md` == 0.
   - `grep -c "can you just" plugins/devflow/skills/quick/SKILL.md` == 0.

4. **Workflow `<purpose>` updated, `<process>` preserved:**
   - The `<purpose>` block contains the cutoff text.
   - The `<process>` steps (lines 14+) are byte-for-byte unchanged from before this TRD. Verify with `git diff HEAD~ plugins/devflow/devflow/workflows/quick.md` showing changes only in lines 4-12 region.

5. **No test regression:** `npm test` shows the same pass count as end-of-16-01 (1714+).
</verification>

<success_criteria>
- [ ] SKILL.md description block references the explicit cutoff (<5 files, <200 LOC, no new abstractions).
- [ ] SKILL.md description block names `/devflow:micro` (smaller) and `/devflow:build` (larger) as the alternatives.
- [ ] SKILL.md triggers list no longer contains trivial-task language (`quick fix`, `tiny`, `can you just`).
- [ ] workflow.md `<purpose>` block has cutoff text + pointer to micro/build.
- [ ] workflow.md `<process>` block is byte-identical to pre-TRD state (no behavioural change).
- [ ] At least 1 atomic commit lands: `refactor(16-03): clarify /devflow:quick scope vs /devflow:micro`.
- [ ] `npm test` shows no regression vs end-of-16-01.
</success_criteria>

<output>
After completion, create `.planning/objectives/16-phase-b-micro-skill/16-03-SUMMARY.md` summarising:
- The exact wording of the new description / objective / triggers
- Confirmation that workflow.md process steps are unchanged
- Anything 16-04 (classifier routing) needs to reference verbatim from quick's new positioning (e.g., the cutoff numbers)
</output>

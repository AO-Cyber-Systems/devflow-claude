---
objective: 03-planning-time-org-awareness
trd: 03-06
title: /df:plan-objective workflow + planner agent read Cross-Repo Considerations
type: standard
confidence: high
wave: 5
depends_on: [03-04]
files_modified:
  - plugins/devflow/devflow/workflows/plan-objective.md
  - plugins/devflow/agents/planner.md
autonomous: true
requirements: [SC-8]
verification_commands:
  - "grep 'Cross-Repo Considerations' plugins/devflow/devflow/workflows/plan-objective.md"
  - "grep 'Cross-Repo Considerations' plugins/devflow/agents/planner.md"

must_haves:
  truths:
    - "plan-objective.md workflow extracts the `## Cross-Repo Considerations` section from CONTEXT.md (when present) and includes it in the planner agent prompt's <additional_context> block"
    - "When CONTEXT.md is missing OR the section is absent, the workflow proceeds without the section (no error, no warning)"
    - "planner.md agent documents `## Cross-Repo Considerations` as advisory context — biases TRDs accordingly (e.g., reuses eden-libs candidates listed, references sibling-repo patterns, flags misfiling concern in the structured-return summary)"
    - "Planner's <additional_context> block carries the section verbatim — no LLM rewriting at workflow level"
    - "Workflow change is minimal — adds a few lines around the existing planner-prompt construction; does not refactor unrelated sections"
    - "Planner agent's prompt-handling for the new section is documented in the agent's <upstream_input> or equivalent section"
    - "No new agents spawned. Pure prompt-text addition + workflow shell-code addition."
  artifacts:
    - path: "plugins/devflow/devflow/workflows/plan-objective.md"
      provides: "Workflow extracts Cross-Repo Considerations section and injects into planner prompt's <additional_context>."
      contains: "Cross-Repo Considerations"
    - path: "plugins/devflow/agents/planner.md"
      provides: "Documentation of how the planner agent uses the Cross-Repo Considerations section. Listed in upstream_input or step prompt."
      contains: "Cross-Repo Considerations"
  key_links:
    - from: "plugins/devflow/devflow/workflows/plan-objective.md"
      to: "plugins/devflow/devflow/workflows/plan-objective.md::planner_prompt"
      via: "Inject Cross-Repo Considerations into <additional_context>"
      pattern: "Cross-Repo Considerations"
---

<objective>
Wire `/devflow:plan-objective` to read the `## Cross-Repo Considerations` section from CONTEXT.md (written by `/devflow:research-objective` per TRD 03-05) and pass it to the planner agent as advisory context. The planner reads it and biases TRDs accordingly.

This closes the loop:
- TRD 03-04: scanners + renderer produce the section
- TRD 03-05: research-objective skill writes it to CONTEXT.md
- **TRD 03-06 (this): plan-objective workflow reads it + planner agent uses it**

Output:
1. Updated `workflows/plan-objective.md` extracts section + adds to planner prompt's <additional_context>
2. Updated `agents/planner.md` documents the section as advisory upstream input
</objective>

<file_tree>
plugins/devflow/devflow/workflows/
└── plan-objective.md                       ← MODIFY  (extract + inject Cross-Repo Considerations)

plugins/devflow/agents/
└── planner.md                              ← MODIFY  (document the new section as advisory)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing planner prompt construction in plan-objective.md** (Step 9 area, ~line 268+):

```markdown
Planner prompt:

\`\`\`markdown
<planning_context>
**Objective:** {objective_number}
**Mode:** {standard | gap_closure}

**Project State:** {state_content}
**Roadmap:** {roadmap_content}
[...]
</planning_context>

<additional_context>
[Other context fields here]
</additional_context>
\`\`\`
```

**Add inside <additional_context>** (the existing block):

```markdown
<additional_context>
[existing fields]

**Cross-Repo Considerations (from CONTEXT.md):**
{cross_repo_considerations or "_(none — research-objective did not run, or scan returned empty)_"}
</additional_context>
```

**Extraction pattern** (adapt from existing CONTEXT_CONTENT extraction in step 8):

```bash
# After loading CONTEXT_CONTENT, extract the Cross-Repo Considerations section
CROSS_REPO=$(echo "$CONTEXT_CONTENT" | awk '
  /^## Cross-Repo Considerations/ { in_section = 1; print; next }
  in_section && /^## / { in_section = 0 }
  in_section { print }
')
```

If CROSS_REPO is empty, set a placeholder string `"_(none — research-objective did not run, or scan returned empty)_"`.

**Existing planner.md upstream_input pattern** (already in the agent — see line 1-30 area):

```markdown
<user_preferences>
If user provides design preferences or constraints (via orchestrator context, conversation history, or project documentation), honor them in task planning.
</user_preferences>
```

**Add a new section** or extend `<user_preferences>` to mention Cross-Repo Considerations:

```markdown
<user_preferences>
[existing content]

**Cross-Repo Considerations (advisory):** When the orchestrator passes a `## Cross-Repo Considerations` section in `<additional_context>`, treat it as advisory context. Bias TRDs to:
- Reuse the eden-libs candidates listed (don't reinvent)
- Reference sibling-repo recent work patterns where applicable
- Flag the misfiling check in your structured-return summary if a mismatch was detected
- Do NOT block planning on the section's contents; it's purely advisory
</user_preferences>
```

</codebase_examples>

<anti_patterns>

- **DO NOT make the planner step blocking on missing CONTEXT.md.** The section is optional advisory.
- **DO NOT rewrite the section content in the workflow.** Pass verbatim to the planner.
- **DO NOT add a new agent or skill spawn.** Pure prompt-text and shell-code.
- **DO NOT couple the section extraction to a specific awk version.** macOS BSD awk + Linux gawk both support the simple pattern shown.
- **DO NOT mutate CONTEXT.md from plan-objective.** Only research-objective writes (per CONTEXT.md locked decision #3).

</anti_patterns>

<error_recovery>

- **CONTEXT_CONTENT is null** (CONTEXT.md doesn't exist) → CROSS_REPO is empty → planner prompt uses placeholder. Fine.
- **awk extraction returns empty** (section absent) → planner prompt uses placeholder. Fine.
- **Section contains weird whitespace / unicode** → pass verbatim. The planner LLM handles weirdness.

</error_recovery>

</embedded_context>

<context>
@.planning/objectives/03-planning-time-org-awareness/03-CONTEXT.md
@plugins/devflow/devflow/workflows/plan-objective.md
@plugins/devflow/agents/planner.md
</context>

<gotchas>

- **`echo "$CONTEXT_CONTENT" | awk` quoting** — CONTEXT_CONTENT may contain backticks, dollar signs, special chars. Use `printf '%s' "$CONTEXT_CONTENT"` instead of `echo` to avoid escape interpretation issues.
- **Multi-line variable expansion in markdown templates** — workflows use `{var}` placeholders that get substituted by the orchestrator. Ensure CROSS_REPO can have multi-line content (newlines preserved when substituted into the planner prompt).
- **planner.md is large** — make ONLY the additive change to user_preferences; do not touch the rest of the file (>1000 lines).

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add Cross-Repo extraction + injection to plan-objective.md workflow</name>
  <files>
    plugins/devflow/devflow/workflows/plan-objective.md
  </files>
  <action>
**Pre-step:** Read the existing workflow file. Identify Step 8 ("Use Context Files from INIT") and Step 9 ("Spawn planner Agent").

**In Step 8** (Use Context Files from INIT), AFTER the existing `CONTEXT_CONTENT=$(echo "$INIT" | jq -r '.context_content // empty')` line, ADD:

```bash
# Extract Cross-Repo Considerations section from CONTEXT.md (TRD 03-06)
# Section was written by /devflow:research-objective per TRD 03-05.
# Optional: missing section/CONTEXT.md → empty placeholder.
if [[ -n "$CONTEXT_CONTENT" ]]; then
  CROSS_REPO=$(printf '%s' "$CONTEXT_CONTENT" | awk '
    /^## Cross-Repo Considerations/ { in_section = 1; print; next }
    in_section && /^## / { in_section = 0 }
    in_section { print }
  ')
fi
if [[ -z "$CROSS_REPO" ]]; then
  CROSS_REPO="_(none — research-objective did not run, or scan returned empty)_"
fi
```

**In Step 9** (Spawn planner Agent), inside the planner-prompt `<additional_context>` block, ADD a new field:

Find the existing `<additional_context>` block in the planner prompt template. Append:

```markdown
**Cross-Repo Considerations (from CONTEXT.md, advisory):**

{CROSS_REPO}
```

**Verify the workflow file is still valid** — frontmatter intact, all numbered steps preserved.

**Commit:**
```bash
git add plugins/devflow/devflow/workflows/plan-objective.md
git commit -m "feat(03-06): plan-objective workflow injects Cross-Repo Considerations into planner prompt

Step 8 extracts '## Cross-Repo Considerations' section from CONTEXT.md
via awk pattern (matches section header, stops at next ## header).
Empty / missing → placeholder text.

Step 9 planner prompt's <additional_context> includes {CROSS_REPO}
verbatim — planner reads the advisory and biases TRDs accordingly
(reuse eden-libs candidates, cross-pollinate sibling patterns,
flag misfiling).

Closes SC-8 (planner reads Cross-Repo Considerations from CONTEXT.md)."
```
  </action>
  <verify>
- `grep -A 5 'Cross-Repo Considerations' plugins/devflow/devflow/workflows/plan-objective.md | head -20`
- `grep -c 'CROSS_REPO' plugins/devflow/devflow/workflows/plan-objective.md` returns ≥ 2 (extraction + injection)
- File still parses (no broken markdown structure): `head -5 plugins/devflow/devflow/workflows/plan-objective.md` shows `--- status: active ---`
- Test: simulate workflow invocation and inspect the planner prompt — defer to TRD 03-07's dogfood.
  </verify>
  <done>
Workflow file updated. CROSS_REPO extraction runs in Step 8; injection in Step 9. Empty case handled with placeholder. No other workflow steps altered.
  </done>
  <recovery>
If awk pattern fails on a CONTEXT.md with no blank line before next `##`: handle by also matching `^## ` with required space — already in the pattern. If still failing, fall back to a Python one-liner: `python3 -c "import sys; lines=sys.stdin.read().split('\n'); ..."`.
If `printf` quoting breaks for very long CONTEXT_CONTENT (which can be multi-KB): use a tmpfile pattern: `echo "$CONTEXT_CONTENT" > /tmp/ctx.$$.md; CROSS_REPO=$(awk ... /tmp/ctx.$$.md); rm /tmp/ctx.$$.md`.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Document Cross-Repo Considerations advisory pattern in planner.md</name>
  <files>
    plugins/devflow/agents/planner.md
  </files>
  <action>
**Read** plugins/devflow/agents/planner.md, find the `<user_preferences>` section near the top.

**Add** a new sub-block AFTER the existing user_preferences content (or extend the block):

```markdown
<user_preferences>
If user provides design preferences or constraints (via orchestrator context, conversation history, or project documentation), honor them in task planning. Locked decisions are non-negotiable — implement exactly as specified. Deferred ideas must not appear in TRDs.

**Cross-Repo Considerations (advisory):** When the orchestrator passes a `## Cross-Repo Considerations` section in `<additional_context>`, treat it as advisory context (NOT locked decisions). Bias TRDs to:
- **Reuse eden-libs candidates listed** — when an eden-libs export matches a problem you're about to solve, prefer composition over reinvention. Add a TRD task to import / wrap the existing surface rather than building a new one.
- **Cross-pollinate sibling-repo patterns** — when a sibling repo has recent SUMMARY.md content overlapping the current objective, reference its approach in TRD `<codebase_examples>` if applicable. Cite the sibling repo + objective ID.
- **Surface misfiling concerns** — if the section flags a misfiling check ("possible misfile — consider whether this objective belongs in <other-repo>"), include the warning in your structured-return summary at the end of planning. Do NOT pause planning on it (advisory only); just surface to the user.
- **Do NOT block planning on the section.** It's purely advisory; if the section is empty / missing / shows `_(skipped: gh auth not available ...)_`, proceed with planning without it.
</user_preferences>
```

# CRITICAL: Preserve all other planner.md sections unchanged. Single block addition only.
# PATTERN: This is the same advisory-block style used elsewhere in planner.md.

**Commit:**
```bash
git add plugins/devflow/agents/planner.md
git commit -m "docs(03-06): document Cross-Repo Considerations advisory pattern for planner

Extends planner.md user_preferences block with guidance for the new
advisory section. Three concrete biases:
1. Reuse eden-libs candidates (prefer composition over reinvention)
2. Cross-pollinate sibling-repo patterns into <codebase_examples>
3. Surface misfiling warnings in structured return (advisory; non-blocking)

Section is advisory only — never blocks planning. Closes SC-8 (agent side)."
```
  </action>
  <verify>
- `grep -A 10 'Cross-Repo Considerations.*advisory' plugins/devflow/agents/planner.md | head -15`
- Other sections of planner.md unchanged (`git diff HEAD~1 plugins/devflow/agents/planner.md` shows only the addition)
  </verify>
  <done>
planner.md user_preferences extended with Cross-Repo Considerations advisory guidance. No other sections altered.
  </done>
  <recovery>
If accidental deletion: `git checkout HEAD~1 -- plugins/devflow/agents/planner.md` and reapply only the additive block.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none)</build>
</validation_gates>

<verification>
1. `npm test` passes (no test changes; non-regression)
2. `workflows/plan-objective.md` Step 8 extracts CROSS_REPO; Step 9 injects into planner prompt
3. `agents/planner.md` user_preferences block extended with the advisory guidance
4. Manual dogfood test deferred to TRD 03-07 (running `/devflow:plan-objective <id>` propagates the section to the planner prompt)
5. No unrelated workflow / agent sections altered
</verification>

<success_criteria>
- [ ] `workflows/plan-objective.md` Step 8 contains CROSS_REPO extraction (awk pattern)
- [ ] `workflows/plan-objective.md` Step 9 injects {CROSS_REPO} into planner prompt's <additional_context>
- [ ] `agents/planner.md` user_preferences block extended with Cross-Repo Considerations guidance (3 biases enumerated, non-blocking advisory)
- [ ] No regressions in test suite
- [ ] SC-8 (planner reads CONTEXT.md section) verifiable via grep + dogfood in TRD 03-07
</success_criteria>

<output>
After completion, create `.planning/objectives/03-planning-time-org-awareness/03-06-plan-skill-integration-SUMMARY.md`.
</output>

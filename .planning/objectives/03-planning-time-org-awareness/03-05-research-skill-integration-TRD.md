---
objective: 03-planning-time-org-awareness
trd: 03-05
title: /df:research-objective skill writes Cross-Repo Considerations to CONTEXT.md
type: standard
confidence: high
wave: 5
depends_on: [03-04]
files_modified:
  - plugins/devflow/skills/research-objective/SKILL.md
  - plugins/devflow/agents/objective-researcher.md
autonomous: true
requirements: [SC-7]
verification_commands:
  - "grep -E 'org-awareness considerations|Cross-Repo Considerations' plugins/devflow/skills/research-objective/SKILL.md"
  - "grep -E 'Cross-Repo Considerations' plugins/devflow/agents/objective-researcher.md"
  - "node ./plugins/devflow/devflow/bin/df-tools.cjs org-awareness considerations 03 2>&1 | grep '### Sibling repos'"

must_haves:
  truths:
    - "/devflow:research-objective SKILL.md adds a NEW step (after the existing init/validate/check-existing steps) that runs `df-tools org-awareness considerations <objective_id>` and writes the Markdown output as a `## Cross-Repo Considerations` section in CONTEXT.md"
    - "When CONTEXT.md doesn't yet exist, the skill creates it with `## Cross-Repo Considerations` as the only section (researcher agent adds the rest of the content)"
    - "When CONTEXT.md already exists with a `## Cross-Repo Considerations` section, the skill REPLACES the section body in-place (does not duplicate)"
    - "When CONTEXT.md exists without a `## Cross-Repo Considerations` section, the skill APPENDS the section to the end"
    - "objective-researcher agent reads the section verbatim and includes it in the `<user_constraints>` block of RESEARCH.md (so the planner sees it transitively via RESEARCH.md too)"
    - "Skill failure in the org-awareness step is non-fatal — research proceeds; the `## Cross-Repo Considerations` section either reads `_(considerations unavailable: ...)_` or is omitted entirely (skill design choice)"
    - "No new agents spawned. Pure shell + sed/awk text manipulation in the SKILL.md process block (or invocation of df-tools to do it via a small helper)"
    - "Documentation lines added to objective-researcher.md describing the Cross-Repo Considerations section as upstream input"
  artifacts:
    - path: "plugins/devflow/skills/research-objective/SKILL.md"
      provides: "Updated process: adds a step that calls df-tools org-awareness considerations and writes/updates the section in CONTEXT.md."
      contains: "org-awareness considerations"
    - path: "plugins/devflow/agents/objective-researcher.md"
      provides: "Documentation update: lists `## Cross-Repo Considerations` as a CONTEXT.md section the researcher reads."
      contains: "Cross-Repo Considerations"
  key_links:
    - from: "plugins/devflow/skills/research-objective/SKILL.md"
      to: "plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs::cmdOrgAwarenessConsiderations"
      via: "df-tools subprocess invocation"
      pattern: "df-tools org-awareness considerations"
    - from: "plugins/devflow/skills/research-objective/SKILL.md"
      to: "plugins/devflow/skills/research-objective/SKILL.md::CONTEXT.md write"
      via: "Append/replace section in CONTEXT.md"
      pattern: "Cross-Repo Considerations"
---

<objective>
Wire `/devflow:research-objective` to call `df-tools org-awareness considerations <objective_id>` at research entry and write the result as a `## Cross-Repo Considerations` section in CONTEXT.md (creating, replacing, or appending as appropriate).

This makes the section a durable artifact that persists across the entire planning lifecycle:
1. `/df:research-objective` writes/refreshes the section in CONTEXT.md
2. objective-researcher agent reads CONTEXT.md and copies it verbatim into RESEARCH.md's `<user_constraints>` block
3. `/df:plan-objective` (TRD 03-06) reads CONTEXT.md and includes the section in the planner's `<additional_context>`

Closes SC-7 (skill-side wiring; rendering side closed in TRD 03-04).

Output:
1. Updated `skills/research-objective/SKILL.md` process block with new "Run org-awareness considerations" step
2. Updated `agents/objective-researcher.md` upstream_input table listing the Cross-Repo Considerations section
</objective>

<file_tree>
plugins/devflow/skills/research-objective/
└── SKILL.md                                ← MODIFY  (add org-awareness step)

plugins/devflow/agents/
└── objective-researcher.md                 ← MODIFY  (document Cross-Repo Considerations as upstream input)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing SKILL.md process block** — `skills/research-objective/SKILL.md` (current state):

```markdown
## 0. Initialize Context

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init objective-op "$ARGUMENTS")
```

## 1. Validate Objective

```bash
OBJECTIVE_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${objective_number}")
```

## 2. Check Existing Research

[...]

## 3. Gather Objective Context

[...]

## 4. Spawn objective-researcher Agent

[...]
```

**New step inserts at position 2.5** (between "Check Existing Research" and "Gather Objective Context"):

```markdown
## 2.5. Run Cross-Repo Considerations Scan

Run the org-awareness scan to surface sibling-repo / eden-libs / org-Project signals BEFORE the researcher reads CONTEXT.md. This populates a durable `## Cross-Repo Considerations` section in CONTEXT.md that the researcher reads as upstream input.

```bash
CONSIDERATIONS=$(node ~/.claude/devflow/bin/df-tools.cjs org-awareness considerations "${objective_number}" 2>/dev/null || echo "")
```

If CONSIDERATIONS is empty (df-tools failed or scanners returned nothing), proceed to step 3 without writing.

If CONSIDERATIONS is non-empty:

```bash
CONTEXT_PATH="${objective_dir}/${padded_objective}-CONTEXT.md"
SECTION_HEADER="## Cross-Repo Considerations"

if [[ ! -f "$CONTEXT_PATH" ]]; then
  # Create CONTEXT.md with just this section as a starting scaffold
  cat > "$CONTEXT_PATH" <<EOF
---
objective: ${objective_number}-${objective_slug}
title: ${objective_name}
created: $(date -u +%Y-%m-%dT%H:%M:%SZ)
status: in_progress
---

# Objective ${objective_number} — Context

${SECTION_HEADER}

${CONSIDERATIONS}
EOF
elif grep -q "^${SECTION_HEADER}" "$CONTEXT_PATH"; then
  # Replace existing section body in-place
  # Use awk to preserve everything before/after the section
  awk -v section="${SECTION_HEADER}" -v body="${CONSIDERATIONS}" '
    BEGIN { in_section = 0; printed_body = 0 }
    {
      if ($0 == section) {
        print $0
        print body
        in_section = 1
        printed_body = 1
        next
      }
      if (in_section && /^## /) {
        in_section = 0
      }
      if (!in_section) print $0
    }
  ' "$CONTEXT_PATH" > "$CONTEXT_PATH.tmp" && mv "$CONTEXT_PATH.tmp" "$CONTEXT_PATH"
else
  # Append section at end
  echo "" >> "$CONTEXT_PATH"
  echo "${SECTION_HEADER}" >> "$CONTEXT_PATH"
  echo "" >> "$CONTEXT_PATH"
  echo "${CONSIDERATIONS}" >> "$CONTEXT_PATH"
fi
```

Display: "Cross-Repo Considerations refreshed in ${CONTEXT_PATH}"
```

**Existing objective-researcher.md upstream_input** (current state):

```markdown
<upstream_input>
**CONTEXT.md** (if exists) — User decisions from `/devflow:discuss-objective`

| Section | How You Use It |
|---------|----------------|
| `## Decisions` | Locked choices — research THESE, not alternatives |
| `## Claude's Discretion` | Your freedom areas — research options, recommend |
| `## Deferred Ideas` | Out of scope — ignore completely |
</upstream_input>
```

**Add row** to the table:

| `## Cross-Repo Considerations` | Auto-populated by `/devflow:research-objective`. Surfaces sibling-repo / eden-libs / org-Project overlaps + misfiling check. Treat as advisory context — bias research toward (a) the eden-libs candidates listed (don't reinvent), (b) the sibling-repo work shown (cross-pollinate patterns), (c) the misfiling check (flag if relevant). |

</codebase_examples>

<anti_patterns>

- **DO NOT spawn an agent for the org-awareness step.** This is a deterministic CLI invocation; no LLM needed.
- **DO NOT make the step blocking on failure.** If df-tools errors out, log + continue to step 3.
- **DO NOT use `sed -i` for in-place edit.** macOS `sed -i` requires a different argument shape (`sed -i ''`) than Linux. Use awk + tmpfile + mv (portable).
- **DO NOT delete other CONTEXT.md sections.** The replace-in-place must preserve everything before and after the Cross-Repo Considerations section.
- **DO NOT modify the section header text.** Always exactly `## Cross-Repo Considerations` — researcher's table key matches verbatim.

</anti_patterns>

<error_recovery>

- **df-tools org-awareness considerations command fails** (e.g., scanSiblings throws on a malformed sibling repo) → CONSIDERATIONS becomes empty string → step is skipped → research proceeds without the section. Logged as advisory.
- **CONTEXT.md is locked or read-only** → bash echo/awk fails with permission error → log, continue. Section just doesn't get written this run.
- **awk regex misbehaves on a CONTEXT.md with weird whitespace** → fall through to the "append section" branch (which is safe — never duplicates because `grep -q` already returned false for the SECTION_HEADER, so append is appropriate).

</error_recovery>

</embedded_context>

<context>
@.planning/objectives/03-planning-time-org-awareness/03-CONTEXT.md
@plugins/devflow/skills/research-objective/SKILL.md
@plugins/devflow/agents/objective-researcher.md
</context>

<gotchas>

- **`init objective-op` extracts `objective_dir`, `padded_objective`, `objective_slug`, `objective_name`.** Reuse these — don't re-derive paths.
- **bash heredoc inside SKILL.md** — careful with backtick + dollar-sign escaping. The CONTEXT.md scaffold heredoc contains `$(date)` and `${objective_number}` etc. — those need to expand at execution time, so `<<EOF` (not `<<'EOF'`).
- **awk single-quotes inside bash** — be careful with the awk script. Standard idiom: enclose awk in single quotes; substitute via `-v` to pass shell variables in.
- **Atomic writes** — use `mv tmpfile original` (atomic on POSIX) instead of `cp tmpfile original`.
- **`process.exit(1)` from df-tools** — `org-awareness considerations` command may exit 1 on missing objective_id; subshell `2>/dev/null || echo ""` catches that. Test by running with a deliberately-bad objective.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Update SKILL.md with new Step 2.5 (Run Cross-Repo Considerations Scan)</name>
  <files>
    plugins/devflow/skills/research-objective/SKILL.md
  </files>
  <action>
**Pre-step:** Read existing skills/research-objective/SKILL.md fully. Identify the exact location to insert (between current Step 2 "Check Existing Research" and Step 3 "Gather Objective Context").

**Insert** a new section "## 2.5 Run Cross-Repo Considerations Scan" with the bash block from <codebase_examples>. Use the exact awk pattern from the embedded example for in-place section replacement.

**Renumber subsequent sections** if necessary (the existing skill has Step 3, 4, 5, 6 — leave numbering as-is; just insert 2.5 between).

# CRITICAL: The bash block MUST handle three cases (no CONTEXT.md, exists with section, exists without section). Use the exact branching from <codebase_examples>.
# CRITICAL: All var substitutions use `${objective_dir}`, `${padded_objective}`, `${objective_number}`, `${objective_slug}`, `${objective_name}` from INIT (already loaded in step 0).
# PATTERN: Mirror the inline-bash style of obj 2's awareness skill (`skills/awareness/SKILL.md`).

**Verify the SKILL.md is still valid** (the surrounding structure preserved):
- Frontmatter YAML at top
- `<objective>` block intact
- `<process>` block contains the new section in correct position

**Commit:**
```bash
git add plugins/devflow/skills/research-objective/SKILL.md
git commit -m "feat(03-05): /devflow:research-objective writes Cross-Repo Considerations to CONTEXT.md

Adds Step 2.5 to skills/research-objective/SKILL.md: invokes df-tools
org-awareness considerations and writes/replaces a '## Cross-Repo Considerations'
section in CONTEXT.md. Three branches: create new CONTEXT.md scaffold,
replace existing section in-place, or append to existing CONTEXT.md.

Non-blocking: empty CONSIDERATIONS or df-tools error → step skipped, research
proceeds. Closes SC-7 (skill-side wiring)."
```
  </action>
  <verify>
- `grep -A 30 '## 2.5' plugins/devflow/skills/research-objective/SKILL.md` shows the new section
- `grep -c 'org-awareness considerations' plugins/devflow/skills/research-objective/SKILL.md` returns at least 1
- SKILL.md still has valid frontmatter (head -20 shows --- name: research-objective ---)
- `cat plugins/devflow/skills/research-objective/SKILL.md | head -50` looks structurally intact
  </verify>
  <done>
SKILL.md updated with Step 2.5. Bash block handles all three CONTEXT.md cases. Non-blocking on failure. Frontmatter and surrounding structure preserved.
  </done>
  <recovery>
If awk pattern misbehaves: simplify by using a Node.js helper invocation: `node -e "/* read CONTEXT, find/replace section, write */"`. Add the helper to df-tools (e.g., `df-tools org-awareness write-section <path>` reading section text from stdin). Tradeoff: more code, more deterministic.
If SKILL.md frontmatter parse breaks: re-check that the heredoc `<<EOF` (unquoted) doesn't accidentally break the surrounding markdown structure. Ensure the heredoc is INSIDE a fenced bash code block (```bash) so renderers don't process it as Markdown.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Document Cross-Repo Considerations as upstream input in objective-researcher.md</name>
  <files>
    plugins/devflow/agents/objective-researcher.md
  </files>
  <action>
**Read** `plugins/devflow/agents/objective-researcher.md`, find the `<upstream_input>` block.

**Add a new row** to the existing CONTEXT.md sections table:

```markdown
| `## Cross-Repo Considerations` | Auto-populated by `/devflow:research-objective`. Surfaces sibling-repo / eden-libs / org-Project overlaps + misfiling check (top-3 each). Treat as advisory: (a) avoid reinventing eden-libs candidates listed, (b) cross-pollinate patterns from sibling-repo recent work, (c) flag if misfiling check warns of repo mismatch. |
```

Also add to the `## User Constraints (from CONTEXT.md)` example in the `<output_format>` section, showing how the researcher copies the section into RESEARCH.md verbatim:

```markdown
<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
[Copy verbatim from CONTEXT.md ## Decisions]

### Claude's Discretion
[Copy verbatim from CONTEXT.md ## Claude's Discretion]

### Deferred Ideas (OUT OF SCOPE)
[Copy verbatim from CONTEXT.md ## Deferred Ideas]

### Cross-Repo Considerations
[Copy verbatim from CONTEXT.md ## Cross-Repo Considerations — advisory; bias research per the listed sibling repos / eden-libs candidates / org-Project overlaps]
</user_constraints>
```

# CRITICAL: Preserve all existing sections of objective-researcher.md unchanged. Only ADD rows/blocks.
# PATTERN: The agent already copies CONTEXT.md sections into RESEARCH.md's user_constraints block. Cross-Repo Considerations is the same pattern.

**Commit:**
```bash
git add plugins/devflow/agents/objective-researcher.md
git commit -m "docs(03-05): document Cross-Repo Considerations as upstream input for researcher

Updates objective-researcher.md upstream_input table + output_format example
to include the '## Cross-Repo Considerations' section. Researcher copies
the section verbatim from CONTEXT.md into RESEARCH.md's user_constraints
block, ensuring planner sees it transitively even when reading RESEARCH only."
```
  </action>
  <verify>
- `grep 'Cross-Repo Considerations' plugins/devflow/agents/objective-researcher.md` returns ≥ 2 matches (table row + user_constraints example)
- objective-researcher.md other sections unchanged (`git diff HEAD~1 -- plugins/devflow/agents/objective-researcher.md` shows only additions, no deletions of unrelated content)
  </verify>
  <done>
objective-researcher.md table extended; output_format example shows the new section being copied verbatim. Existing content preserved.
  </done>
  <recovery>
If git diff reveals accidental deletions: rebuild the file from HEAD~1 + apply only the table-row addition + the user_constraints sub-block.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none)</build>
</validation_gates>

<verification>
1. `npm test` passes (no test changes; non-regression check)
2. `skills/research-objective/SKILL.md` contains `org-awareness considerations` invocation in Step 2.5
3. `agents/objective-researcher.md` lists `## Cross-Repo Considerations` in upstream_input table + user_constraints output example
4. Manual test (not automated in this TRD; covered by 03-07 dogfood): running `/devflow:research-objective <id>` writes the section to CONTEXT.md.
</verification>

<success_criteria>
- [ ] `skills/research-objective/SKILL.md` Step 2.5 added with three-branch CONTEXT.md handling (create / replace / append)
- [ ] `agents/objective-researcher.md` upstream_input table extended
- [ ] `agents/objective-researcher.md` output_format user_constraints example extended
- [ ] No SKILL.md frontmatter / objective-researcher.md non-target sections altered
- [ ] SC-7 (skill-side wiring) verifiable via grep of the SKILL.md command + section header
</success_criteria>

<output>
After completion, create `.planning/objectives/03-planning-time-org-awareness/03-05-research-skill-integration-SUMMARY.md`.
</output>

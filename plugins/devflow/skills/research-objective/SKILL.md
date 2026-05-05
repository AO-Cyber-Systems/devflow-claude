---
name: research-objective
description: |
  Research how to build something before planning it — discovers best practices, architecture patterns, and pitfalls for the domain.
  Use when the user wants to investigate, research, or explore options before planning an objective.
  Triggers on: "research objective", "investigate before planning", "look into how to build", "what's the best approach for objective"
argument-hint: "[objective]"
allowed-tools:
  - Read
  - Bash
  - Task
---

<objective>
Research how to implement an objective. Spawns objective-researcher agent with objective context.

**Note:** This is a standalone research command. For most workflows, use `/devflow:plan-objective` which integrates research automatically.

**Use this command when:**
- You want to research without planning yet
- You want to re-research after planning is complete
- You need to investigate before deciding if an objective is feasible

**Orchestrator role:** Parse objective, validate against roadmap, check existing research, gather context, spawn researcher agent, present results.

**Why subagent:** Research burns context fast (WebSearch, Context7 queries, source verification). Fresh 200k context for investigation. Main context stays lean for user interaction.
</objective>

<context>
Objective number: $ARGUMENTS (required)

Normalize objective input in step 1 before any directory lookups.
</context>

<process>

## 0. Initialize Context

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init objective-op "$ARGUMENTS")
```

Extract from init JSON: `objective_dir`, `objective_number`, `objective_name`, `objective_found`, `commit_docs`, `has_research`.

Resolve researcher model:
```bash
RESEARCHER_MODEL=$(node ~/.claude/devflow/bin/df-tools.cjs resolve-model objective-researcher --raw)
```

## 1. Validate Objective

```bash
OBJECTIVE_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${objective_number}")
```

**If `found` is false:** Error and exit. **If `found` is true:** Extract `objective_number`, `objective_name`, `goal` from JSON.

## 2. Check Existing Research

```bash
ls .planning/objectives/${OBJECTIVE}-*/RESEARCH.md 2>/dev/null
```

**If exists:** Offer: 1) Update research, 2) View existing, 3) Skip. Wait for response.

**If doesn't exist:** Continue.

## 2.5 Run Cross-Repo Considerations Scan

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
  # Write body to a temp file first (avoids macOS BSD awk -v newline limitation)
  BODY_TMP=$(mktemp)
  printf '%s\n' "${CONSIDERATIONS}" > "$BODY_TMP"
  awk -v section="${SECTION_HEADER}" -v bodyfile="$BODY_TMP" '
    BEGIN {
      in_section = 0
      body = ""
      while ((getline line < bodyfile) > 0) { body = body line "\n" }
      close(bodyfile)
    }
    {
      if ($0 == section) {
        printf "%s\n%s", $0, body
        in_section = 1
        next
      }
      if (in_section && /^## /) { in_section = 0 }
      if (!in_section) print $0
    }
  ' "$CONTEXT_PATH" > "$CONTEXT_PATH.tmp" && mv "$CONTEXT_PATH.tmp" "$CONTEXT_PATH"
  rm -f "$BODY_TMP"
else
  # Append section at end
  echo "" >> "$CONTEXT_PATH"
  echo "${SECTION_HEADER}" >> "$CONTEXT_PATH"
  echo "" >> "$CONTEXT_PATH"
  echo "${CONSIDERATIONS}" >> "$CONTEXT_PATH"
fi
```

Display: "Cross-Repo Considerations refreshed in ${CONTEXT_PATH}"

## 3. Gather Objective Context

```bash
# Objective section already loaded in OBJECTIVE_INFO
echo "$OBJECTIVE_INFO" | jq -r '.section'
cat .planning/REQUIREMENTS.md 2>/dev/null
cat .planning/objectives/${OBJECTIVE}-*/*-CONTEXT.md 2>/dev/null
grep -A30 "### Decisions Made" .planning/STATE.md 2>/dev/null
```

Present summary with objective description, requirements, prior decisions.

## 4. Spawn objective-researcher Agent

Research modes: ecosystem (default), feasibility, implementation, comparison.

```markdown
<research_type>
Objective Research — investigating HOW to implement a specific objective well.
</research_type>

<key_insight>
The question is NOT "which library should I use?"

The question is: "What do I not know that I don't know?"

For this objective, discover:
- What's the established architecture pattern?
- What libraries form the standard stack?
- What problems do people commonly hit?
- What's SOTA vs what Claude's training thinks is SOTA?
- What should NOT be hand-rolled?
</key_insight>

<objective>
Research implementation approach for Objective {objective_number}: {objective_name}
Mode: ecosystem
</objective>

<context>
**Objective description:** {phase_description}
**Requirements:** {requirements_list}
**Prior decisions:** {decisions_if_any}
**Objective context:** {context_md_content}
</context>

<downstream_consumer>
Your RESEARCH.md will be loaded by `/devflow:plan-objective` which uses specific sections:
- `## Standard Stack` → Plans use these libraries
- `## Architecture Patterns` → Task structure follows these
- `## Don't Hand-Roll` → Tasks NEVER build custom solutions for listed problems
- `## Common Pitfalls` → Verification steps check for these
- `## Code Examples` → Task actions reference these patterns

Be prescriptive, not exploratory. "Use X" not "Consider X or Y."
</downstream_consumer>

<quality_gate>
Before declaring complete, verify:
- [ ] All domains investigated (not just some)
- [ ] Negative claims verified with official docs
- [ ] Multiple sources for critical claims
- [ ] Confidence levels assigned honestly
- [ ] Section names match what plan-objective expects
</quality_gate>

<output>
Write to: .planning/objectives/${OBJECTIVE}-{slug}/${OBJECTIVE}-RESEARCH.md
</output>
```

```
Task(
  prompt="First, read ~/.claude/agents/objective-researcher.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Objective {objective}"
)
```

## 5. Handle Agent Return

**`## RESEARCH COMPLETE`:** Display summary, offer: Plan objective, Dig deeper, Review full, Done.

**`## CHECKPOINT REACHED`:** Present to user, get response, spawn continuation.

**`## RESEARCH INCONCLUSIVE`:** Show what was attempted, offer: Add context, Try different mode, Manual.

## 6. Spawn Continuation Agent

```markdown
<objective>
Continue research for Objective {objective_number}: {objective_name}
</objective>

<prior_state>
Research file: @.planning/objectives/${OBJECTIVE}-{slug}/${OBJECTIVE}-RESEARCH.md
</prior_state>

<checkpoint_response>
**Type:** {checkpoint_type}
**Response:** {user_response}
</checkpoint_response>
```

```
Task(
  prompt="First, read ~/.claude/agents/objective-researcher.md for your role and instructions.\n\n" + continuation_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Continue research Objective {objective}"
)
```

</process>

<success_criteria>
- [ ] Objective validated against roadmap
- [ ] Existing research checked
- [ ] objective-researcher spawned with context
- [ ] Checkpoints handled correctly
- [ ] User knows next steps
</success_criteria>

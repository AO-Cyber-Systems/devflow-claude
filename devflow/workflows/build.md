<purpose>
Unified build pipeline: research → plan → execute → verify → done. Collapses the multi-step DevFlow workflow into a single command. This is the primary way to build with DevFlow.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.

@~/.claude/devflow/references/ui-brand.md
</required_reading>

<process>

## 1. Initialize

```bash
INIT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs init plan-objective "$OBJECTIVE_ARG" --include state,roadmap,requirements,context,research)
if [[ "$INIT_RAW" == @file:* ]]; then
  INIT_FILE="${INIT_RAW#@file:}"
  INIT=$(cat "$INIT_FILE")
  rm -f "$INIT_FILE"
else
  INIT="$INIT_RAW"
fi
```

Parse JSON for: `researcher_model`, `planner_model`, `checker_model`, `executor_model`, `verifier_model`, `commit_docs`, `objective_found`, `objective_dir`, `objective_number`, `objective_name`, `objective_slug`, `padded_objective`, `has_research`, `has_context`, `has_jobs`, `job_count`, `planning_exists`, `roadmap_exists`, `research_enabled`, `job_checker_enabled`.

**File contents (from --include):** `state_content`, `roadmap_content`, `requirements_content`, `context_content`, `research_content`.

**If `planning_exists` is false:** Error — run `/df:new-project` first.

## 2. Resolve Objective

**If argument is a number:** Use directly as objective number. Validate against roadmap.

**If argument is a description (not a number):**

```bash
OBJECTIVE_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap analyze)
```

Fuzzy-match description against objective names and goals. If match found, use that objective number.

**If no match found — Quick Build mode:**

Display:
```
No matching roadmap objective found for: "{description}"

Entering quick-build mode — creating temporary objective...
```

Create objective directory, generate 1-3 TRDs inline based on the description, execute them, and complete. Skip roadmap updates.

**If `objective_found` is false but number given:**
```bash
mkdir -p ".planning/objectives/${padded_objective}-${objective_slug}"
```

## 3. Brief Discussion (optional)

**Skip if:** `--skip-research` flag, or objective has clear requirements in roadmap (goal is specific, requirements are listed).

If objective needs clarification (vague goal, no requirements listed):

Use AskUserQuestion with 2-3 targeted questions about the objective's scope and approach. These replace the full discuss-objective workflow.

Example:
```
AskUserQuestion([
  {
    header: "Approach",
    question: "How should we implement [objective goal]?",
    multiSelect: false,
    options: [
      { label: "Option A", description: "..." },
      { label: "Option B", description: "..." },
      { label: "Let Claude decide", description: "Use best judgment based on research" }
    ]
  }
])
```

Store answers as inline context for the planner (no CONTEXT.md file needed).

## 4. Research

**Skip if:** `--skip-research` flag, `research_enabled` is false, or `has_research` is true (existing research).

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► RESEARCHING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn df-objective-researcher (same as plan-objective step 5).

If `--pause` flag: Display research results and wait for confirmation before proceeding.

## 5. Generate TRDs

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► PLANNING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn df-planner with full context (same as plan-objective step 8).

Pass any inline discussion answers as additional context in the planner prompt.

If `--pause` flag: Display TRD summary and wait for confirmation.

## 6. Verify TRDs (quick validation)

Quick validation — NOT the full df-job-checker loop unless `job_checker_enabled` is true:

```bash
# Verify all TRDs have verification commands
for trd in "${OBJECTIVE_DIR}"/*-TRD.md; do
  grep -q "<verify>" "$trd" || echo "WARNING: $trd missing <verify> elements"
done
```

If `job_checker_enabled` is true: Spawn df-job-checker (same as plan-objective step 10).

## 7. Execute TRDs

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► EXECUTING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Delegate to execute-objective workflow (same as /df:execute-objective). The execute-objective workflow handles:
- Wave-based parallel execution
- Per-task verification with evidence
- TDD enforcement for type: tdd TRDs
- Checkpoint handling
- Auto gap-closure (max 2 cycles)

```
Task(
  prompt="Run /df:execute-objective ${OBJECTIVE_NUMBER} --auto",
  subagent_type="general-purpose",
  description="Execute Objective ${OBJECTIVE_NUMBER}"
)
```

If `--pause` flag: Execute one wave at a time, pausing between waves.

## 8. Auto-Verify + Complete

After execute-objective returns:

**If OBJECTIVE COMPLETE (verification passed):**

Display completion:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► OBJECTIVE {X} COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Objective {X}: {Name}**

{One-liner from final SUMMARY.md}

TRDs: {count} executed
Duration: {total time}
Verification: Passed ✓
```

**If GAPS FOUND:**

Display gap summary, then auto-generate fix TRDs (max 2 cycles):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► AUTO-FIXING GAPS (Cycle {N}/2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn planner with `--gaps` flag to generate fix TRDs, then execute them.

If still failing after 2 cycles: report gaps and stop for human input.

**If execution failed:** Report failure details, suggest manual intervention.

</process>

<context_budget>
Orchestrator: ~15% context. Each subagent gets fresh 200k context.

| Phase | Context Owner | Budget |
|---|---|---|
| Discussion | Orchestrator | ~2% |
| Research | Subagent | Fresh 200k |
| Planning | Subagent | Fresh 200k |
| TRD Check | Subagent | Fresh 200k |
| Execution | Subagent(s) | Fresh 200k each |
| Verification | Subagent | Fresh 200k |
</context_budget>

<success_criteria>
- [ ] Objective resolved (number or description matched)
- [ ] Research completed (unless skipped)
- [ ] TRDs generated with verification commands
- [ ] All TRDs executed with evidence
- [ ] Post-execution verification passed (or gap-closure attempted)
- [ ] Objective marked complete in ROADMAP.md and STATE.md
- [ ] User sees final completion summary
</success_criteria>

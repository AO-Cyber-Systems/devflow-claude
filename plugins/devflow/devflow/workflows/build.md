---
status: active
---
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

**If `planning_exists` is false:** Error — run `/devflow:new-project` first.

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

## 3. Present Build Plan (EnterPlanMode)

**Skip if:** `--auto` flag or config `workflow.auto_advance` is true.

Use Claude Code's built-in plan mode to present the execution strategy before spawning agents:

```
EnterPlanMode()
```

Write a plan summarizing:
- **Objective:** {objective_name} — {goal from roadmap}
- **Pipeline:** Research → Plan → {Check (if enabled)} → Execute → Verify
- **Agents:** researcher ({researcher_model}), planner ({planner_model}), executor ({executor_model})
- **Skipped steps:** {list any --skip flags or disabled agents}
- **Estimated waves:** {based on objective complexity}

If objective needs clarification (vague goal, no requirements listed), include 2-3 scoping questions in the plan using AskUserQuestion:

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

```
ExitPlanMode()
```

Store any user answers as inline context for the planner (no CONTEXT.md file needed).

Once the user approves the plan, proceed to research.

## 4. Research

**Skip if:** `--skip-research` flag, `research_enabled` is false, or `has_research` is true (existing research).

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► RESEARCHING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn objective-researcher (same as plan-objective step 6).

If `--pause` flag: Display research results and wait for confirmation before proceeding.

## 5. Generate TRDs

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► PLANNING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn planner with full context (same as plan-objective step 9).

Pass any inline discussion answers as additional context in the planner prompt.

If `--pause` flag: Display TRD summary and wait for confirmation.

## 6. Verify TRDs (quick validation)

Quick validation — NOT the full job-checker loop unless `job_checker_enabled` is true:

```bash
# Verify all TRDs have verification commands
for trd in "${OBJECTIVE_DIR}"/*-TRD.md; do
  grep -q "<verify>" "$trd" || echo "WARNING: $trd missing <verify> elements"
done
```

If `job_checker_enabled` is true: Spawn job-checker (same as plan-objective step 11).

## 7. Execute TRDs

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► EXECUTING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Delegate to execute-objective workflow (same as /devflow:execute-objective). The execute-objective workflow handles:
- Wave-based parallel execution
- Per-task verification with evidence
- TDD enforcement for type: tdd TRDs
- Checkpoint handling
- Auto gap-closure (max 2 cycles)

```
Task(
  prompt="Run /devflow:execute-objective ${OBJECTIVE_NUMBER} --auto",
  subagent_type="general-purpose",
  description="Execute Objective ${OBJECTIVE_NUMBER}"
)
```

If `--pause` flag: Execute one wave at a time, pausing between waves.

## 8. Auto-Verify + Complete

After execute-objective returns:

**First, spawn dedicated verifier as backstop.**

The execute-objective trampoline (§ 7) delegates verification to execute-objective.md's `verify_objective_goal` step, but that path is unreliable — the trampoline subagent can return without reaching deep workflow steps. To guarantee a `VERIFICATION.md` is produced for every `/devflow:build` run, spawn the dedicated verifier here as well. The verifier agent is idempotent: if execute-objective.md already produced a VERIFICATION.md with `gaps:` section, Step 0 switches to fast re-verification mode; otherwise it runs full initial verification.

```bash
OBJECTIVE_REQ_IDS=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${OBJECTIVE_NUMBER}" | jq -r '.section' | grep -i "Requirements:" | sed 's/.*Requirements:\*\*\s*//' | sed 's/[\[\]]//g')
```

```
Task(
  prompt="Verify objective ${OBJECTIVE_NUMBER} goal achievement.
Objective directory: ${objective_dir}
Objective goal: ${goal from ROADMAP.md}
Objective requirement IDs: ${OBJECTIVE_REQ_IDS}
Check must_haves against actual codebase.
Cross-reference requirement IDs from TRD/JOB frontmatter against REQUIREMENTS.md — every ID MUST be accounted for.
Create VERIFICATION.md.",
  subagent_type="verifier",
  model="{verifier_model}"
)
```

Read status:
```bash
VERIFICATION_STATUS=$(grep "^status:" "${objective_dir}"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' ')
```

Branch on `$VERIFICATION_STATUS`:
- `passed` → continue to "If OBJECTIVE COMPLETE" display below
- `gaps_found` → continue to "If GAPS FOUND" auto-fix loop below
- `human_needed` → display human verification items, await user response

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

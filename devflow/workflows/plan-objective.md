<purpose>
Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research and verification. Default flow: Research (if needed) -> Plan -> Verify -> Done. Orchestrates df-phase-researcher, df-planner, and df-plan-checker agents with a revision loop (max 3 iterations).
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.

@~/.claude/devflow/references/ui-brand.md
</required_reading>

<process>

## 1. Initialize

Load all context in one call (include file contents to avoid redundant reads):

```bash
INIT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs init plan-phase "$PHASE" --include state,roadmap,requirements,context,research,verification,uat)
# Large payloads are written to a tmpfile — output starts with @file:/path
if [[ "$INIT_RAW" == @file:* ]]; then
  INIT_FILE="${INIT_RAW#@file:}"
  INIT=$(cat "$INIT_FILE")
  rm -f "$INIT_FILE"
else
  INIT="$INIT_RAW"
fi
```

Parse JSON for: `researcher_model`, `planner_model`, `checker_model`, `research_enabled`, `plan_checker_enabled`, `commit_docs`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `padded_phase`, `has_research`, `has_context`, `has_plans`, `plan_count`, `planning_exists`, `roadmap_exists`.

**File contents (from --include):** `state_content`, `roadmap_content`, `requirements_content`, `context_content`, `research_content`, `verification_content`, `uat_content`. These are null if files don't exist.

**If `planning_exists` is false:** Error — run `/df:new-project` first.

## 2. Parse and Normalize Arguments

Extract from $ARGUMENTS: phase number (integer or decimal like `2.1`), flags (`--research`, `--skip-research`, `--gaps`, `--skip-verify`).

**If no phase number:** Detect next unplanned phase from roadmap.

**If `phase_found` is false:** Validate phase exists in ROADMAP.md. If valid, create the directory using `phase_slug` and `padded_phase` from init:
```bash
mkdir -p ".planning/phases/${padded_phase}-${phase_slug}"
```

**Existing artifacts from init:** `has_research`, `has_plans`, `plan_count`.

## 3. Validate Phase

```bash
PHASE_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-phase "${PHASE}")
```

**If `found` is false:** Error with available phases. **If `found` is true:** Extract `phase_number`, `phase_name`, `goal` from JSON.

## 4. Load CONTEXT.md

Use `context_content` from init JSON (already loaded via `--include context`).

**CRITICAL:** Use `context_content` from INIT — pass to researcher, planner, checker, and revision agents.

If `context_content` is not null, display: `Using phase context from: ${PHASE_DIR}/*-CONTEXT.md`

**If `context_content` is null (no CONTEXT.md exists):**

Use AskUserQuestion:
- header: "No context"
- question: "No CONTEXT.md found for Phase {X}. Plans will use research and requirements only — your design preferences won't be included. Continue or capture context first?"
- options:
  - "Continue without context" — Plan using research + requirements only
  - "Run discuss-phase first" — Capture design decisions before planning

If "Continue without context": Proceed to step 5.
If "Run discuss-phase first": Display `/df:discuss-phase {X}` and exit workflow.

## 5. Handle Research

**Skip if:** `--gaps` flag, `--skip-research` flag, or `research_enabled` is false (from init) without `--research` override.

**If `has_research` is true (from init) AND no `--research` flag:** Use existing, skip to step 6.

**If RESEARCH.md missing OR `--research` flag:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► RESEARCHING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning researcher...
```

**Progress tracking (if available):**
```
TaskCreate(
  subject="Research Phase {X}",
  description="Researching implementation approach for Phase {phase_number}: {phase_name}",
  activeForm="Researching Phase {X}"
)
```

**Complexity assessment for model selection:**

Evaluate research complexity:
- If `--gaps` mode (gap-closure research): well-scoped domain → consider downgrading researcher to sonnet
- If phase has > 10 requirements or spans multiple subsystems: keep profile model (or upgrade)
- Standard phases: use `researcher_model` from profile

### Spawn df-phase-researcher

```bash
PHASE_DESC=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-phase "${PHASE}" | jq -r '.section')
# Use requirements_content from INIT (already loaded via --include requirements)
REQUIREMENTS=$(echo "$INIT" | jq -r '.requirements_content // empty' | grep -A100 "## Requirements" | head -50)
PHASE_REQ_IDS=$(echo "$INIT" | jq -r '.roadmap_content // empty' | grep -i "Requirements:" | head -1 | sed 's/.*Requirements:\*\*\s*//' | sed 's/[\[\]]//g' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
STATE_SNAP=$(node ~/.claude/devflow/bin/df-tools.cjs state-snapshot)
# Extract decisions from state-snapshot JSON: jq '.decisions[] | "\(.phase): \(.summary) - \(.rationale)"'
```

Research prompt:

```markdown
<objective>
Research how to implement Phase {phase_number}: {phase_name}
Answer: "What do I need to know to PLAN this phase well?"
</objective>

<phase_context>
IMPORTANT: If CONTEXT.md exists below, it contains user decisions from /df:discuss-phase.
- **Decisions** = Locked — research THESE deeply, no alternatives
- **Claude's Discretion** = Freedom areas — research options, recommend
- **Deferred Ideas** = Out of scope — ignore

{context_content}
</phase_context>

<additional_context>
**Phase description:** {phase_description}
**Phase requirement IDs (MUST address):** {phase_req_ids}
**Requirements:** {requirements}
**Prior decisions:** {decisions}
</additional_context>

<output>
Write to: {phase_dir}/{phase_num}-RESEARCH.md
</output>
```

```
Task(
  prompt="First, read ~/.claude/agents/df-phase-researcher.md for your role and instructions.\n\n" + research_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {phase}"
)
```

### Handle Researcher Return

**Update progress (if available):**
```
TaskUpdate(taskId=research_task_id, status="completed")
```

- **`## RESEARCH COMPLETE`:** Display confirmation, continue to step 6
- **`## RESEARCH BLOCKED`:** Display blocker, offer: 1) Provide context, 2) Skip research, 3) Abort

## 6. Check Existing Plans

```bash
ls "${PHASE_DIR}"/*-PLAN.md 2>/dev/null
```

**If exists:** Offer: 1) Add more plans, 2) View existing, 3) Replan from scratch.

## 7. Use Context Files from INIT

All file contents are already loaded via `--include` in step 1 (`@` syntax doesn't work across Task() boundaries):

```bash
# Extract from INIT JSON (no need to re-read files)
STATE_CONTENT=$(echo "$INIT" | jq -r '.state_content // empty')
ROADMAP_CONTENT=$(echo "$INIT" | jq -r '.roadmap_content // empty')
REQUIREMENTS_CONTENT=$(echo "$INIT" | jq -r '.requirements_content // empty')
RESEARCH_CONTENT=$(echo "$INIT" | jq -r '.research_content // empty')
VERIFICATION_CONTENT=$(echo "$INIT" | jq -r '.verification_content // empty')
UAT_CONTENT=$(echo "$INIT" | jq -r '.uat_content // empty')
CONTEXT_CONTENT=$(echo "$INIT" | jq -r '.context_content // empty')
```

## 8. Spawn df-planner Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► PLANNING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner...
```

**Progress tracking (if available):**
```
TaskCreate(
  subject="Plan Phase {X}",
  description="Creating executable plans for Phase {phase_number}: {phase_name}",
  activeForm="Planning Phase {X}"
)
```

**Model selection for gap-closure mode:**

If `--gaps` flag is set: gap-closure plans are scoped and diagnosed — downgrade planner to sonnet (unless user has a model_override for df-planner in config.json). Log: `Model override: df-planner {planner_model} → sonnet (reason: gap-closure mode)`

Planner prompt:

```markdown
<planning_context>
**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

**Project State:** {state_content}
**Roadmap:** {roadmap_content}
**Phase requirement IDs (every ID MUST appear in a plan's `requirements` field):** {phase_req_ids}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: If context exists below, it contains USER DECISIONS from /df:discuss-phase.
- **Decisions** = LOCKED — honor exactly, do not revisit
- **Claude's Discretion** = Freedom — make implementation choices
- **Deferred Ideas** = Out of scope — do NOT include

{context_content}

**Research:** {research_content}
**Gap Closure (if --gaps):** {verification_content} {uat_content}
</planning_context>

<downstream_consumer>
Output consumed by /df:execute-phase. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
- [ ] PLAN.md files created in phase directory
- [ ] Each plan has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality_gate>
```

```
Task(
  prompt="First, read ~/.claude/agents/df-planner.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

## 9. Handle Planner Return

**Update progress (if available):**
```
TaskUpdate(taskId=plan_task_id, status="completed")
```

- **`## PLANNING COMPLETE`:** Display plan count. If `--skip-verify` or `plan_checker_enabled` is false (from init): skip to step 13. Otherwise: step 10.
- **`## CHECKPOINT REACHED`:** Present to user, get response, spawn continuation (step 12)
- **`## PLANNING INCONCLUSIVE`:** Show attempts, offer: Add context / Retry / Manual

## 10. Spawn df-plan-checker Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker...
```

**Progress tracking (if available):**
```
TaskCreate(
  subject="Verify Phase {X} plans",
  description="Checking plans against phase goal and requirements",
  activeForm="Verifying Phase {X} plans"
)
```

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

Checker prompt:

```markdown
<verification_context>
**Phase:** {phase_number}
**Phase Goal:** {goal from ROADMAP}

**Plans to verify:** {plans_content}
**Phase requirement IDs (MUST ALL be covered):** {phase_req_ids}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: Plans MUST honor user decisions. Flag as issue if plans contradict.
- **Decisions** = LOCKED — plans must implement exactly
- **Claude's Discretion** = Freedom areas — plans can choose approach
- **Deferred Ideas** = Out of scope — plans must NOT include

{context_content}
</verification_context>

<expected_output>
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
```

```
Task(
  prompt=checker_prompt,
  subagent_type="df-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase} plans"
)
```

## 11. Handle Checker Return

**Update progress (if available):**
```
TaskUpdate(taskId=checker_task_id, status="completed")
```

- **`## VERIFICATION PASSED`:** Display confirmation. If checker output contains low-confidence plans (score <7 in Confidence Assessment table), display a note: `Note: Plan(s) {NN} scored below 7/10 confidence. Consider /df:research-phase for [topic] before execution.` Don't block — just inform. Proceed to step 13.
- **`## ISSUES FOUND`:** Display issues, check iteration count, proceed to step 12.

## 12. Revision Loop (Max 3 Iterations)

Track `iteration_count` (starts at 1 after initial plan + check).

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

**Update progress (if available):**
```
TaskUpdate(taskId=plan_task_id, description="Revision iteration {N}/3 — addressing checker issues")
```

**Model upgrade on 3rd iteration:**

If `iteration_count == 3` (final attempt): upgrade planner model to opus regardless of profile. The repeated failures suggest subtlety that needs stronger reasoning. Log: `Model override: df-planner {planner_model} → opus (reason: 3rd revision attempt)`

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

Revision prompt:

```markdown
<revision_context>
**Phase:** {phase_number}
**Mode:** revision

**Existing plans:** {plans_content}
**Checker issues:** {structured_issues_from_checker}

**Phase Context:**
Revisions MUST still honor user decisions.
{context_content}
</revision_context>

<instructions>
Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
Return what changed.
</instructions>
```

```
Task(
  prompt="First, read ~/.claude/agents/df-planner.md for your role and instructions.\n\n" + revision_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Revise Phase {phase} plans"
)
```

After planner returns -> spawn checker again (step 10), increment iteration_count.

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain:` + issue list

Offer: 1) Force proceed, 2) Provide guidance and retry, 3) Abandon

## 13. Present Final Status

Route to `<offer_next>` OR `auto_advance` depending on flags/config.

## 14. Auto-Advance Check

Check for auto-advance trigger:

1. Parse `--auto` flag from $ARGUMENTS
2. Read `workflow.auto_advance` from config:
   ```bash
   AUTO_CFG=$(node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present OR `AUTO_CFG` is true:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► AUTO-ADVANCING TO EXECUTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Plans ready. Spawning execute-phase...
```

Spawn execute-phase as Task:
```
Task(
  prompt="Run /df:execute-phase ${PHASE} --auto",
  subagent_type="general-purpose",
  description="Execute Phase ${PHASE}"
)
```

**Handle execute-phase return:**
- **PHASE COMPLETE** → Display final summary:
  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DF ► PHASE ${PHASE} COMPLETE ✓
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Auto-advance pipeline finished.

  Next: /df:discuss-phase ${NEXT_PHASE} --auto
  ```
- **GAPS FOUND / VERIFICATION FAILED** → Display result, stop chain:
  ```
  Auto-advance stopped: Execution needs review.

  Review the output above and continue manually:
  /df:execute-phase ${PHASE}
  ```

**If neither `--auto` nor config enabled:**
Route to `<offer_next>` (existing behavior).

</process>

<offer_next>
Output this markdown directly (not as a code block):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► PHASE {X} PLANNED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}
Confidence: {Display confidence scores if checker ran, e.g., "01: 8/10, 02: 7/10" | "N/A" if checker skipped}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute Phase {X}** — run all {N} plans

/df:execute-phase {X}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/phases/{phase-dir}/*-PLAN.md — review plans
- /df:plan-phase {X} --research — re-research first

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] .planning/ directory validated
- [ ] Phase validated against roadmap
- [ ] Phase directory created if needed
- [ ] CONTEXT.md loaded early (step 4) and passed to ALL agents
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] df-phase-researcher spawned with CONTEXT.md
- [ ] Existing plans checked
- [ ] df-planner spawned with CONTEXT.md + RESEARCH.md
- [ ] Plans created (PLANNING COMPLETE or CHECKPOINT handled)
- [ ] df-plan-checker spawned with CONTEXT.md
- [ ] Verification passed OR user override OR max iterations with user decision
- [ ] User sees status between agent spawns
- [ ] User knows next steps
</success_criteria>

<purpose>
Create executable objective prompts (TRD.md files) for a roadmap objective with optional inline discussion, integrated research, and verification. Default flow: Discuss (brief, optional) -> Research (if needed) -> Plan -> Verify -> Done. Orchestrates df-objective-researcher, df-planner, and df-job-checker agents with a revision loop (max 3 iterations).
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.

@~/.claude/devflow/references/ui-brand.md
</required_reading>

<process>

## 1. Initialize

Load all context in one call (include file contents to avoid redundant reads):

```bash
INIT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs init plan-objective "$OBJECTIVE" --include state,roadmap,requirements,context,research,verification,uat)
# Large payloads are written to a tmpfile — output starts with @file:/path
if [[ "$INIT_RAW" == @file:* ]]; then
  INIT_FILE="${INIT_RAW#@file:}"
  INIT=$(cat "$INIT_FILE")
  rm -f "$INIT_FILE"
else
  INIT="$INIT_RAW"
fi
```

Parse JSON for: `researcher_model`, `planner_model`, `checker_model`, `research_enabled`, `job_checker_enabled`, `commit_docs`, `objective_found`, `objective_dir`, `objective_number`, `objective_name`, `objective_slug`, `padded_objective`, `has_research`, `has_context`, `has_jobs`, `job_count`, `planning_exists`, `roadmap_exists`.

> **Note:** `has_jobs` and `job_count` cover both TRD.md and legacy JOB.md files via `findPlanFiles()` in df-tools.

**File contents (from --include):** `state_content`, `roadmap_content`, `requirements_content`, `context_content`, `research_content`, `verification_content`, `uat_content`. These are null if files don't exist.

**If `planning_exists` is false:** Error — run `/df:new-project` first.

## 2. Parse and Normalize Arguments

Extract from $ARGUMENTS: objective number (integer or decimal like `2.1`), flags (`--research`, `--skip-research`, `--gaps`, `--skip-verify`).

**If no objective number:** Detect next unplanned objective from roadmap.

**If `objective_found` is false:** Validate objective exists in ROADMAP.md. If valid, create the directory using `objective_slug` and `padded_objective` from init:
```bash
mkdir -p ".planning/objectives/${padded_objective}-${objective_slug}"
```

**Existing artifacts from init:** `has_research`, `has_jobs` (covers TRD + JOB files), `job_count`.

## 3. Validate Objective

```bash
OBJECTIVE_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${OBJECTIVE}")
```

**If `found` is false:** Error with available objectives. **If `found` is true:** Extract `objective_number`, `objective_name`, `goal` from JSON.

## 4. Brief Inline Discussion (Optional)

**If `context_content` is not null** (existing CONTEXT.md from a prior discussion):
Display: `Using objective context from: ${objective_dir}/*-CONTEXT.md`
Pass `context_content` to researcher, planner, checker, and revision agents. Skip to step 5.

**If `context_content` is null AND `--skip-discuss` flag is NOT set:**

Ask 2-3 brief clarifying questions using AskUserQuestion to capture key preferences before planning. Focus on:
1. **Key design choice** — if the objective has an obvious fork (e.g., "REST vs GraphQL", "client vs server rendering")
2. **Scope constraint** — anything the user wants explicitly in or out of scope
3. **Priority** — if multiple sub-features, which matters most

Example:
```
AskUserQuestion(
  questions=[{
    header: "Approach",
    question: "For Objective {X}: {objective_name} — any preferences on approach or scope?",
    options: [
      { label: "You decide", description: "Use your best judgment based on research" },
      { label: "Let me specify", description: "I'll provide specific preferences" }
    ],
    multiSelect: false
  }]
)
```

If user selects "You decide": Note `user_preferences: "Agent discretion"` and proceed to step 5.
If user selects "Let me specify": Capture their response as `user_preferences` text. Use this in planner/researcher prompts where `context_content` would go.

**If `--skip-discuss` flag is set:** Skip discussion, proceed directly to step 5.

> **Legacy CONTEXT.md support:** If a CONTEXT.md exists from a prior `/df:discuss-objective` session, it is still loaded and honored. New projects use inline discussion instead.

## 5. Handle Research

**Skip if:** `--gaps` flag, `--skip-research` flag, or `research_enabled` is false (from init) without `--research` override.

**If `has_research` is true (from init) AND no `--research` flag:** Use existing, skip to step 6.

**If RESEARCH.md missing OR `--research` flag:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► RESEARCHING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning researcher...
```

**Progress tracking (if available):**
```
TaskCreate(
  subject="Research Objective {X}",
  description="Researching implementation approach for Objective {objective_number}: {objective_name}",
  activeForm="Researching Objective {X}"
)
```

**Complexity assessment for model selection:**

Evaluate research complexity:
- If `--gaps` mode (gap-closure research): well-scoped domain → consider downgrading researcher to sonnet
- If objective has > 10 requirements or spans multiple subsystems: keep profile model (or upgrade)
- Standard objectives: use `researcher_model` from profile

### Spawn df-objective-researcher

```bash
PHASE_DESC=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${OBJECTIVE}" | jq -r '.section')
# Use requirements_content from INIT (already loaded via --include requirements)
REQUIREMENTS=$(echo "$INIT" | jq -r '.requirements_content // empty' | grep -A100 "## Requirements" | head -50)
OBJECTIVE_REQ_IDS=$(echo "$INIT" | jq -r '.roadmap_content // empty' | grep -i "Requirements:" | head -1 | sed 's/.*Requirements:\*\*\s*//' | sed 's/[\[\]]//g' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^$' | tr '\n' ',' | sed 's/,$//')
STATE_SNAP=$(node ~/.claude/devflow/bin/df-tools.cjs state-snapshot)
# Extract decisions from state-snapshot JSON: jq '.decisions[] | "\(.objective): \(.summary) - \(.rationale)"'
```

Research prompt:

```markdown
<objective>
Research how to implement Objective {objective_number}: {objective_name}
Answer: "What do I need to know to plan this objective well?"
</objective>

<phase_context>
If context/preferences exist below, they contain user decisions.
- **Decisions** = Locked — research THESE deeply, no alternatives
- **Discretion areas** = Freedom — research options, recommend
- **Out of scope** = Ignore

{context_content or user_preferences}
</phase_context>

<additional_context>
**Objective description:** {phase_description}
**Objective requirement IDs (MUST address):** {objective_req_ids}
**Requirements:** {requirements}
**Prior decisions:** {decisions}
</additional_context>

<output>
Write to: {objective_dir}/{phase_num}-RESEARCH.md
</output>
```

```
Task(
  prompt="First, read ~/.claude/agents/df-objective-researcher.md for your role and instructions.\n\n" + research_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Objective {objective}"
)
```

### Handle Researcher Return

**Update progress (if available):**
```
TaskUpdate(taskId=research_task_id, status="completed")
```

- **`## RESEARCH COMPLETE`:** Display confirmation, continue to step 6
- **`## RESEARCH BLOCKED`:** Display blocker, offer: 1) Provide context, 2) Skip research, 3) Abort

## 6. Check Existing TRDs

```bash
ls "${OBJECTIVE_DIR}"/*-TRD.md "${OBJECTIVE_DIR}"/*-JOB.md 2>/dev/null
```

**If exists:** Offer: 1) Add more TRDs, 2) View existing, 3) Replan from scratch.

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
 DF ► PLANNING OBJECTIVE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner...
```

**Progress tracking (if available):**
```
TaskCreate(
  subject="Plan Objective {X}",
  description="Creating executable plans for Objective {objective_number}: {objective_name}",
  activeForm="Planning Objective {X}"
)
```

**Model selection for gap-closure mode:**

If `--gaps` flag is set: gap-closure plans are scoped and diagnosed — downgrade planner to sonnet (unless user has a model_override for df-planner in config.json). Log: `Model override: df-planner {planner_model} → sonnet (reason: gap-closure mode)`

Planner prompt:

```markdown
<planning_context>
**Objective:** {objective_number}
**Mode:** {standard | gap_closure}

**Project State:** {state_content}
**Roadmap:** {roadmap_content}
**Objective requirement IDs (every ID MUST appear in a TRD's `requirements` field):** {objective_req_ids}
**Requirements:** {requirements_content}

**Objective Context/Preferences:**
If context exists below, it contains user decisions. Honor them exactly.
- **Decisions** = LOCKED — implement exactly, do not revisit
- **Discretion areas** = Freedom — make implementation choices
- **Out of scope** = Do NOT include

{context_content or user_preferences}

**Research:** {research_content}
**Gap Closure (if --gaps):** {verification_content} {uat_content}
</planning_context>

<downstream_consumer>
Output consumed by /df:execute-objective. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
- [ ] TRD.md files created in objective directory
- [ ] Each TRD has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from objective goal
</quality_gate>
```

```
Task(
  prompt="First, read ~/.claude/agents/df-planner.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Plan Objective {objective}"
)
```

## 9. Handle Planner Return

**Update progress (if available):**
```
TaskUpdate(taskId=plan_task_id, status="completed")
```

- **`## PLANNING COMPLETE`:** Display TRD count. If `--skip-verify` or `job_checker_enabled` is false (from init): skip to step 13. Otherwise: step 10.
- **`## CHECKPOINT REACHED`:** Present to user, get response, spawn continuation (step 12)
- **`## PLANNING INCONCLUSIVE`:** Show attempts, offer: Add context / Retry / Manual

## 10. Spawn df-job-checker Agent

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
  subject="Verify Objective {X} plans",
  description="Checking plans against objective goal and requirements",
  activeForm="Verifying Objective {X} plans"
)
```

```bash
PLANS_CONTENT=$(cat "${OBJECTIVE_DIR}"/*-TRD.md "${OBJECTIVE_DIR}"/*-JOB.md 2>/dev/null)
```

Checker prompt:

```markdown
<verification_context>
**Objective:** {objective_number}
**Objective Goal:** {goal from ROADMAP}

**Plans to verify:** {plans_content}
**Objective requirement IDs (MUST ALL be covered):** {objective_req_ids}
**Requirements:** {requirements_content}

**Objective Context/Preferences:**
Plans MUST honor user decisions. Flag as issue if plans contradict.
- **Decisions** = LOCKED — plans must implement exactly
- **Discretion areas** = Freedom — plans can choose approach
- **Out of scope** = Plans must NOT include

{context_content or user_preferences}
</verification_context>

<expected_output>
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
```

```
Task(
  prompt=checker_prompt,
  subagent_type="df-job-checker",
  model="{checker_model}",
  description="Verify Objective {objective} plans"
)
```

## 11. Handle Checker Return

**Update progress (if available):**
```
TaskUpdate(taskId=checker_task_id, status="completed")
```

- **`## VERIFICATION PASSED`:** Display confirmation. If checker output contains low-confidence plans (score <7 in Confidence Assessment table), display a note: `Note: Plan(s) {NN} scored below 7/10 confidence. Consider /df:research-objective for [topic] before execution.` Don't block — just inform. Proceed to step 13.
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
PLANS_CONTENT=$(cat "${OBJECTIVE_DIR}"/*-TRD.md "${OBJECTIVE_DIR}"/*-JOB.md 2>/dev/null)
```

Revision prompt:

```markdown
<revision_context>
**Objective:** {objective_number}
**Mode:** revision

**Existing TRDs:** {plans_content}
**Checker issues:** {structured_issues_from_checker}

**Objective Context/Preferences:**
Revisions MUST still honor user decisions.
{context_content or user_preferences}
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
  description="Revise Objective {objective} plans"
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

Plans ready. Spawning execute-objective...
```

Spawn execute-objective as Task:
```
Task(
  prompt="Run /df:execute-objective ${OBJECTIVE} --auto",
  subagent_type="general-purpose",
  description="Execute Objective ${OBJECTIVE}"
)
```

**Handle execute-objective return:**
- **OBJECTIVE COMPLETE** → Display final summary:
  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DF ► OBJECTIVE ${OBJECTIVE} COMPLETE ✓
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Auto-advance pipeline finished.

  Next: /df:plan-objective ${NEXT_PHASE} --auto
  ```
- **GAPS FOUND / VERIFICATION FAILED** → Display result, stop chain:
  ```
  Auto-advance stopped: Execution needs review.

  Review the output above and continue manually:
  /df:execute-objective ${OBJECTIVE}
  ```

**If neither `--auto` nor config enabled:**
Route to `<offer_next>` (existing behavior).

</process>

<offer_next>
Output this markdown directly (not as a code block):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► OBJECTIVE {X} PLANNED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Objective {X}: {Name}** — {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}
Confidence: {Display confidence scores if checker ran, e.g., "01: 8/10, 02: 7/10" | "N/A" if checker skipped}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute Objective {X}** — run all {N} plans

/df:execute-objective {X}

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/objectives/{objective-dir}/*-TRD.md — review plans
- /df:plan-objective {X} --research — re-research first

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] .planning/ directory validated
- [ ] Objective validated against roadmap
- [ ] Objective directory created if needed
- [ ] CONTEXT.md loaded early (step 4) and passed to ALL agents
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] df-objective-researcher spawned with CONTEXT.md
- [ ] Existing jobs checked
- [ ] df-planner spawned with CONTEXT.md + RESEARCH.md
- [ ] Plans created (PLANNING COMPLETE or CHECKPOINT handled)
- [ ] df-job-checker spawned with CONTEXT.md
- [ ] Verification passed OR user override OR max iterations with user decision
- [ ] User sees status between agent spawns
- [ ] User knows next steps
</success_criteria>

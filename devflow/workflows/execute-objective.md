<purpose>
Execute all jobs in an objective using wave-based parallel execution. Orchestrator stays lean — delegates job execution to subagents.
</purpose>

<core_principle>
Orchestrator coordinates, not executes. Each subagent loads the full execute-job context. Orchestrator: discover plans → analyze deps → group waves → spawn agents → handle checkpoints → collect results.
</core_principle>

<required_reading>
Read STATE.md before any operation to load project context.
</required_reading>

<process>

<step name="initialize" priority="first">
Load all context in one call:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init execute-objective "${PHASE_ARG}")
```

Parse JSON for: `executor_model`, `verifier_model`, `commit_docs`, `parallelization`, `branching_strategy`, `branch_name`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `incomplete_plans`, `plan_count`, `incomplete_count`, `state_exists`, `roadmap_exists`.

**If `phase_found` is false:** Error — objective directory not found.
**If `plan_count` is 0:** Error — no plans found in objective.
**If `state_exists` is false but `.planning/` exists:** Offer reconstruct or continue.

When `parallelization` is false, plans within a wave execute sequentially.
</step>

<step name="handle_branching">
Check `branching_strategy` from init:

**"none":** Skip, continue on current branch.

**"objective" or "milestone":** Use pre-computed `branch_name` from init:
```bash
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
```

All subsequent commits go to this branch. User handles merging.
</step>

<step name="validate_phase">
From init JSON: `phase_dir`, `plan_count`, `incomplete_count`.

Report: "Found {plan_count} plans in {phase_dir} ({incomplete_count} incomplete)"
</step>

<step name="discover_and_group_plans">
Load plan inventory with wave grouping in one call:

```bash
PLAN_INDEX=$(node ~/.claude/devflow/bin/df-tools.cjs objective-job-index "${PHASE_NUMBER}")
```

Parse JSON for: `objective`, `plans[]` (each with `id`, `wave`, `autonomous`, `objective`, `files_modified`, `task_count`, `has_summary`), `waves` (map of wave number → plan IDs), `incomplete`, `has_checkpoints`.

**Filtering:** Skip plans where `has_summary: true`. If `--gaps-only`: also skip non-gap_closure plans. If all filtered: "No matching incomplete jobs" → exit.

Report:
```
## Execution Plan

**Objective {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01-01, 01-02 | {from plan objectives, 3-8 words} |
| 2 | 01-03 | ... |
```
</step>

<step name="execute_waves">
Execute each wave in sequence. Within a wave: parallel if `PARALLELIZATION=true`, sequential if `false`.

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each job's `<objective>`. Extract what's being built and why.

   ```
   ---
   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

   - Bad: "Executing terrain generation plan"
   - Good: "Procedural terrain generator using Perlin noise — creates height maps, biome zones, and collision meshes. Required before vehicle physics can interact with ground."

2. **Create progress tasks (if available):**

   For each job in the wave:
   ```
   TaskCreate(
     subject="Execute {plan_id}: {plan_name}",
     description="Executing plan {plan_number}: {plan_objective}",
     activeForm="Executing {plan_id}"
   )
   ```

3. **Assess plan complexity for model selection:**

   For each job in the wave, evaluate complexity:
   - Read `task_count` and `files_modified` from plan index
   - **Simple** (task_count <= 2, files_modified <= 3): use sonnet — straightforward implementation
   - **Standard** (task_count 3-5): use `executor_model` from profile — normal execution
   - **Complex** (task_count > 5 or files_modified > 8): use opus — benefits from stronger context management

   Log any overrides: `Model override: df-executor {executor_model} → {override} for {plan_id} (reason: {simple|complex} plan)`

   Safety rule: never downgrade executor below sonnet.

4. **Spawn executor agents:**

   Pass paths only — executors read files themselves with their fresh 200k context.
   This keeps orchestrator context lean (~10-15%).

   ```
   Task(
     subagent_type="df-executor",
     model="{resolved_executor_model}",
     prompt="
       <objective>
       Execute plan {plan_number} of objective {phase_number}-{phase_name}.
       Commit each task atomically. Create SUMMARY.md. Update STATE.md and ROADMAP.md.
       </objective>

       <execution_context>
       @~/.claude/devflow/workflows/execute-job.md
       @~/.claude/devflow/templates/summary.md
       @~/.claude/devflow/references/checkpoints.md
       @~/.claude/devflow/references/tdd.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - Plan: {phase_dir}/{plan_file}
       - State: .planning/STATE.md
       - Config: .planning/config.json (if exists)
       </files_to_read>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] SUMMARY.md created in plan directory
       - [ ] STATE.md updated with position and decisions
       - [ ] ROADMAP.md updated with job progress (via `roadmap update-job-progress`)
       </success_criteria>
     "
   )
   ```

5. **Wait for all agents in wave to complete.**

   **Background execution (when `PARALLELIZATION=true` AND wave has 2+ plans):**

   Spawn each executor with `run_in_background=true` to enable true parallel execution:
   ```
   task_ids = []
   for each job in wave:
     result = Task(
       subagent_type="df-executor",
       model="{resolved_executor_model}",
       prompt="...",
       run_in_background=true
     )
     task_ids.append(result.task_id)
   ```

   While waiting for background agents:
   - Pre-read next wave's plan objectives (if next wave exists) to prepare context
   - Update TaskList progress periodically

   Poll for completion:
   ```
   for each task_id in task_ids:
     result = TaskOutput(task_id=task_id, block=true, timeout=600000)
   ```

   Collect all results, then proceed to spot-check.

   **Sequential execution (when `PARALLELIZATION=false` OR wave has 1 plan):**

   Use standard blocking Task() calls (existing behavior).

6. **Report completion — spot-check claims first:**

   **Update progress (if available):** For each completed plan:
   ```
   TaskUpdate(taskId=plan_task_id, status="completed")
   ```

   For each SUMMARY.md:
   - Verify first 2 files from `key-files.created` exist on disk
   - Check `git log --oneline --all --grep="{objective}-{job}"` returns ≥1 commit
   - Check for `## Self-Check: FAILED` marker

   If ANY spot-check fails: report which plan failed, route to failure handler — ask "Retry plan?" or "Continue with remaining waves?"

   If pass:
   ```
   ---
   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built — from SUMMARY.md}
   {Notable deviations, if any}

   {If more waves: what this enables for next wave}
   ---
   ```

   - Bad: "Wave 2 complete. Proceeding to Wave 3."
   - Good: "Terrain system complete — 3 biome types, height-based texturing, physics collision meshes. Vehicle physics (Wave 3) can now reference ground surfaces."

7. **Handle failures:**

   **Known Claude Code bug (classifyHandoffIfNeeded):** If an agent reports "failed" with error containing `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a DevFlow or agent issue. The error fires in the completion handler AFTER all tool calls finish. In this case: run the same spot-checks as step 4 (SUMMARY.md exists, git commits present, no Self-Check: FAILED). If spot-checks PASS → treat as **successful**. If spot-checks FAIL → treat as real failure below.

   For real failures: report which plan failed → ask "Continue?" or "Stop?" → if continue, dependent plans may also fail. If stop, partial completion report.

8. **Execute checkpoint plans between waves** — see `<checkpoint_handling>`.

9. **Proceed to next wave.**
</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Auto-mode checkpoint handling:**

Read auto-advance config:
```bash
AUTO_CFG=$(node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
```

When executor returns a checkpoint AND `AUTO_CFG` is `"true"`:
- **human-verify** → Auto-spawn continuation agent with `{user_response}` = `"approved"`. Log `⚡ Auto-approved checkpoint`.
- **decision** → Auto-spawn continuation agent with `{user_response}` = first option from checkpoint details. Log `⚡ Auto-selected: [option]`.
- **human-action** → Present to user (existing behavior below). Auth gates cannot be automated.

**Standard flow (not auto-mode, or human-action type):**

1. Spawn agent for checkpoint plan
2. Agent runs until checkpoint task or auth gate → returns structured state
3. Agent return includes: completed tasks table, current task + blocker, checkpoint type/details, what's awaited
4. **Present to user:**
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details from agent return]
   [Awaiting section from agent return]
   ```
5. User responds: "approved"/"done" | issue description | decision selection
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template:
   - `{completed_tasks_table}`: From checkpoint return
   - `{resume_task_number}` + `{resume_task_name}`: Current task
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type
7. Continuation agent verifies previous commits, continues from resume point
8. Repeat until plan completes or user stops

**Why fresh agent, not resume:** Resume relies on internal serialization that breaks with parallel tool calls. Fresh agents with explicit state are more reliable.

**Future consideration:** For simple plans (single auto task + checkpoint, no parallel tool calls), agent resume may be viable. Before considering resume, verify the agent did NOT use parallel tool calls during execution. See `@~/.claude/devflow/references/checkpoints.md` "Resume vs Fresh Agent Decision" section for the full decision framework.

**Checkpoints in parallel waves:** Agent pauses and returns while other parallel agents may complete. Present checkpoint, spawn continuation, wait for all before next wave.
</step>

<step name="aggregate_results">
After all waves:

```markdown
## Objective {X}: {Name} Execution Complete

**Waves:** {N} | **Jobs:** {M}/{total} complete

| Wave | Plans | Status |
|------|-------|--------|
| 1 | plan-01, plan-02 | ✓ Complete |
| CP | plan-03 | ✓ Verified |
| 2 | plan-04 | ✓ Complete |

### Plan Details
1. **03-01**: [one-liner from SUMMARY.md]
2. **03-02**: [one-liner from SUMMARY.md]

### Issues Encountered
[Aggregate from SUMMARYs, or "None"]
```
</step>

<step name="close_parent_artifacts">
**For decimal/polish objectives only (X.Y pattern):** Close the feedback loop by resolving parent UAT and debug artifacts.

**Skip if** objective number has no decimal (e.g., `3`, `04`) — only applies to gap-closure objectives like `4.1`, `03.1`.

**1. Detect decimal objective and derive parent:**
```bash
# Check if phase_number contains a decimal
if [[ "$PHASE_NUMBER" == *.* ]]; then
  PARENT_PHASE="${PHASE_NUMBER%%.*}"
fi
```

**2. Find parent UAT file:**
```bash
PARENT_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs find-objective "${PARENT_PHASE}" --raw)
# Extract directory from PARENT_INFO JSON, then find UAT file in that directory
```

**If no parent UAT found:** Skip this step (gap-closure may have been triggered by VERIFICATION.md instead).

**3. Update UAT gap statuses:**

Read the parent UAT file's `## Gaps` section. For each gap entry with `status: failed`:
- Update to `status: resolved`

**4. Update UAT frontmatter:**

If all gaps now have `status: resolved`:
- Update frontmatter `status: diagnosed` → `status: resolved`
- Update frontmatter `updated:` timestamp

**5. Resolve referenced debug sessions:**

For each gap that has a `debug_session:` field:
- Read the debug session file
- Update frontmatter `status:` → `resolved`
- Update frontmatter `updated:` timestamp
- Move to resolved directory:
```bash
mkdir -p .planning/debug/resolved
mv .planning/debug/{slug}.md .planning/debug/resolved/
```

**6. Commit updated artifacts:**
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs(phase-${PARENT_PHASE}): resolve UAT gaps and debug sessions after ${PHASE_NUMBER} gap closure" --files .planning/objectives/*${PARENT_PHASE}*/*-UAT.md .planning/debug/resolved/*.md
```
</step>

<step name="verify_phase_goal">
Verify objective achieved its GOAL, not just completed tasks.

**Progress tracking (if available):**
```
TaskCreate(
  subject="Verify Objective {X} goals",
  description="Checking objective goal achievement against must-haves and requirements",
  activeForm="Verifying Objective {X}"
)
```

```bash
PHASE_REQ_IDS=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${PHASE_NUMBER}" | jq -r '.section' | grep -i "Requirements:" | sed 's/.*Requirements:\*\*\s*//' | sed 's/[\[\]]//g')
```

```
Task(
  prompt="Verify objective {phase_number} goal achievement.
Objective directory: {phase_dir}
Objective goal: {goal from ROADMAP.md}
Objective requirement IDs: {phase_req_ids}
Check must_haves against actual codebase.
Cross-reference requirement IDs from PLAN frontmatter against REQUIREMENTS.md — every ID MUST be accounted for.
Create VERIFICATION.md.",
  subagent_type="df-verifier",
  model="{verifier_model}"
)
```

Read status:
```bash
grep "^status:" "$OBJECTIVE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

| Status | Action |
|--------|--------|
| `passed` | → update_roadmap |
| `human_needed` | Present items for human testing, get approval or feedback |
| `gaps_found` | Present gap summary, offer `/df:plan-objective {objective} --gaps` |

**If human_needed:**

Display items from VERIFICATION.md `human_verification` section, then for each item use AskUserQuestion:
```
AskUserQuestion(
  header: "Verify",
  question: "{item description from VERIFICATION.md}",
  multiSelect: false,
  options: [
    { label: "Verified", description: "This works correctly" },
    { label: "Issue found", description: "Something isn't right — I'll describe" },
    { label: "Can't test now", description: "Skip this item for now" }
  ]
)
```

If "Issue found": follow up with freeform "Describe the issue:" prompt. Collect all responses and route accordingly: all verified → continue. Any issues → gap closure path.

**If gaps_found:**
```
## ⚠ Objective {X}: {Name} — Gaps Found

**Score:** {N}/{M} must-haves verified
**Report:** {phase_dir}/{phase_num}-VERIFICATION.md

### What's Missing
{Gap summaries from VERIFICATION.md}

---
## ▶ Next Up

`/df:plan-objective {X} --gaps`

<sub>`/clear` first → fresh context window</sub>

Also: `cat {phase_dir}/{phase_num}-VERIFICATION.md` — full report
Also: `/df:verify-work {X}` — manual testing first
```

Gap closure cycle: `/df:plan-objective {X} --gaps` reads VERIFICATION.md → creates gap plans with `gap_closure: true` → user runs `/df:execute-objective {X} --gaps-only` → verifier re-runs.
</step>

<step name="update_roadmap">
**Mark objective complete and update all tracking files:**

```bash
COMPLETION=$(node ~/.claude/devflow/bin/df-tools.cjs objective complete "${PHASE_NUMBER}")
```

The CLI handles:
- Marking objective checkbox `[x]` with completion date
- Updating Progress table (Status → Complete, date)
- Updating job count to final
- Advancing STATE.md to next objective
- Updating REQUIREMENTS.md traceability

Extract from result: `next_phase`, `next_phase_name`, `is_last_phase`.

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs(phase-{X}): complete objective execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md .planning/objectives/{phase_dir}/*-VERIFICATION.md
```
</step>

<step name="offer_next">

**Exception:** If `gaps_found`, the `verify_phase_goal` step already presents the gap-closure path (`/df:plan-objective {X} --gaps`). No additional routing needed — skip auto-advance.

**Auto-advance detection:**

1. Parse `--auto` flag from $ARGUMENTS
2. Read `workflow.auto_advance` from config:
   ```bash
   AUTO_CFG=$(node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present OR `AUTO_CFG` is true (AND verification passed with no gaps):**

```
╔══════════════════════════════════════════╗
║  AUTO-ADVANCING → TRANSITION             ║
║  Objective {X} verified, continuing chain    ║
╚══════════════════════════════════════════╝
```

Execute the transition workflow inline (do NOT use Task — orchestrator context is ~10-15%, transition needs objective completion data already in context):

Read and follow `~/.claude/devflow/workflows/transition.md`, passing through the `--auto` flag so it propagates to the next objective invocation.

**If neither `--auto` nor `AUTO_CFG` is true:**

The workflow ends. The user runs `/df:progress` or invokes the transition workflow manually.
</step>

</process>

<context_efficiency>
Orchestrator: ~10-15% context. Subagents: fresh 200k each. No polling (Task blocks). No context bleed.
</context_efficiency>

<failure_handling>
- **classifyHandoffIfNeeded false failure:** Agent reports "failed" but error is `classifyHandoffIfNeeded is not defined` → Claude Code bug, not DevFlow. Spot-check (SUMMARY exists, commits present) → if pass, treat as success
- **Agent fails mid-plan:** Missing SUMMARY.md → report, ask user how to proceed
- **Dependency chain breaks:** Wave 1 fails → Wave 2 dependents likely fail → user chooses attempt or skip
- **All agents in wave fail:** Systemic issue → stop, report for investigation
- **Checkpoint unresolvable:** "Skip this job?" or "Abort objective execution?" → record partial progress in STATE.md
</failure_handling>

<resumption>
Re-run `/df:execute-objective {objective}` → discover_plans finds completed SUMMARYs → skips them → resumes from first incomplete plan → continues wave execution.

STATE.md tracks: last completed plan, current wave, pending checkpoints.
</resumption>

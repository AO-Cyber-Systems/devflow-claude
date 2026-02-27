<purpose>
Execute a Task Requirements Document (TRD.md) with integrated TDD enforcement, per-task verification evidence, and post-job verification loop. Also supports legacy JOB.md files.
</purpose>

<required_reading>
Read STATE.md before any operation to load project context.
Read config.json for planning behavior settings.

@~/.claude/devflow/references/git-integration.md
@~/.claude/devflow/references/tdd.md
@~/.claude/devflow/references/verification-patterns.md
@~/.claude/devflow/references/anti-patterns.md
</required_reading>

<process>

<step name="init_context" priority="first">
Load execution context:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init execute-objective "${OBJECTIVE}" --include state,config)
```

Extract from init JSON: `executor_model`, `commit_docs`, `objective_dir`, `objective_number`, `jobs`, `summaries`, `incomplete_jobs`.

**File contents (from --include):** `state_content`, `config_content`.

If `.planning/` missing: error.
</step>

<step name="identify_plan">
```bash
# Scan for TRD files first, fall back to JOB files
ls .planning/objectives/XX-name/*-TRD.md 2>/dev/null | sort
ls .planning/objectives/XX-name/*-JOB.md 2>/dev/null | sort
ls .planning/objectives/XX-name/*-SUMMARY.md 2>/dev/null | sort
```

Find first TRD/JOB without matching SUMMARY.

**Detect format from suffix:**
- `*-TRD.md` → TRD format (use `trd` frontmatter field)
- `*-JOB.md` → Legacy JOB format (use `job` frontmatter field)

<if mode="yolo">
Auto-approve: `Execute {plan-file} [Plan X of Y for Objective Z]` → parse_segments.
</if>

<if mode="interactive" OR="custom with gates.execute_next_job true">
Present plan identification, wait for confirmation.
</if>
</step>

<step name="detect_trd_type">
Parse frontmatter for `type` field:

- `type: tdd` → Enable TDD enforcement (RED → GREEN → REFACTOR per task)
- `type: standard` or `type: execute` → Standard execution with per-task verification

Parse `confidence` field:
- `confidence: low` → Extra verification, pause before destructive operations
- `confidence: medium` → Standard + extra verification at task boundaries
- `confidence: high` → Standard execution
</step>

<step name="record_start_time">
```bash
PLAN_START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PLAN_START_EPOCH=$(date +%s)
```
</step>

<step name="parse_segments">
```bash
grep -n "type=\"checkpoint" .planning/objectives/XX-name/{plan-file}
```

**Routing by checkpoint type:**

| Checkpoints | Pattern | Execution |
|-------------|---------|-----------|
| None | A (autonomous) | Single subagent: full plan + SUMMARY + commit |
| Verify-only | B (segmented) | Segments between checkpoints |
| Decision | C (main) | Execute entirely in main context |

Routing logic identical to execute-job.md — see that workflow for full pattern details.
</step>

<step name="execute_tasks_with_evidence">
For each task:

1. **If `type="auto"` (standard task):**
   - Execute task action
   - Run verification command from `<verify>` element
   - **Capture evidence:**
     ```
     EVIDENCE_CMD="npm test"
     EVIDENCE_OUTPUT=$(eval "$EVIDENCE_CMD" 2>&1)
     EVIDENCE_EXIT=$?
     ```
   - If verification fails AND `<recovery>` exists: follow recovery steps (max 2 attempts)
   - If still fails: document in SUMMARY as failed task, continue
   - Commit (see task_commit_protocol from execute-job.md)
   - Store evidence for SUMMARY.md

2. **If `type="tdd"` (TDD task):**
   - **RED phase:**
     - Write test from `<test>` element
     - Run `<verify_red>` — MUST fail (exit code != 0)
     - Capture evidence: command, output, exit code
     - If test passes: investigate (feature exists or test is wrong)
     - Commit: `test({objective}-{trd}): add failing test for [feature]`
   - **GREEN phase:**
     - Implement from `<action>` element
     - Run `<verify_green>` — MUST pass (exit code == 0)
     - Capture evidence: command, output, exit code
     - If test fails: debug, iterate (max 3 attempts)
     - Commit: `feat({objective}-{trd}): implement [feature]`
   - **REFACTOR phase (if needed):**
     - Clean up implementation
     - Run tests — MUST still pass
     - Capture evidence
     - Commit only if changes: `refactor({objective}-{trd}): clean up [feature]`

3. **If `type="checkpoint:*"`:**
   - STOP — return structured checkpoint message (same as execute-job.md)

4. **Per-task evidence collection (ALL task types):**
   ```
   TASK_EVIDENCE[N]={
     "task": N,
     "name": "Task name",
     "command": "npm test",
     "exit_code": 0,
     "output": "Tests: 12 passed",
     "status": "PASS"
   }
   ```

5. After all tasks: run validation gates, confirm success criteria
</step>

<step name="post_trd_verification_loop">
After all tasks complete, run a verification loop:

1. **Run all validation gates** (if defined in frontmatter or `<validation_gates>`):
   ```bash
   # Run each gate, capture result
   for gate in lint test build; do
     RESULT=$(eval "$GATE_CMD" 2>&1)
     EXIT=$?
     GATE_EVIDENCE+=("$gate: exit $EXIT")
   done
   ```

2. **If any gate fails:**
   - Attempt auto-fix (max 2 cycles):
     - Cycle 1: Analyze failure, fix most likely cause, re-run gate
     - Cycle 2: If still failing, try alternative fix approach
   - If still failing after 2 cycles: document as gap, include in SUMMARY

3. **Verify must_haves** (from frontmatter):
   - Check each artifact exists: `[ -f "$path" ]`
   - Check each truth has evidence (from task evidence collected)
   - Check key_links with grep patterns

4. **Record verification results** for SUMMARY.md
</step>

<step name="create_summary_with_evidence">
Create `{objective}-{trd}-SUMMARY.md` at `.planning/objectives/XX-name/`.

**Use template:** @~/.claude/devflow/templates/summary.md

**Additional evidence sections (beyond standard summary):**

```markdown
## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: [name] | `npm test` | 0 | PASS |
| 2: [name] | `curl localhost:3000/api` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | `npm run lint` | 0 | PASS |
| test | `npm test` | 0 | PASS |
| build | `npm run build` | 0 | PASS |

## TDD Evidence
<!-- Only for type: tdd TRDs -->

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test -- --grep "auth"` | 1 | FAIL (correct) |
| GREEN | `npm test -- --grep "auth"` | 0 | PASS (correct) |
| REFACTOR | `npm test` | 0 | PASS (correct) |

## Post-TRD Verification

- Auto-fix cycles used: {0|1|2}
- Must-haves verified: {N}/{M}
- Gate failures: {list or "None"}

## TDD Exceptions
<!-- Only if TDD-EXCEPTION markers were used -->
- Task 2: Configuration change — `<!-- TDD-EXCEPTION: no testable behavior -->`
```
</step>

<step name="state_updates">
Same as execute-job.md — update STATE.md, ROADMAP.md, REQUIREMENTS.md.

```bash
node ~/.claude/devflow/bin/df-tools.cjs state advance-job
node ~/.claude/devflow/bin/df-tools.cjs state update-progress
node ~/.claude/devflow/bin/df-tools.cjs state record-metric \
  --objective "${OBJECTIVE}" --job "${TRD}" --duration "${DURATION}" \
  --tasks "${TASK_COUNT}" --files "${FILE_COUNT}"
node ~/.claude/devflow/bin/df-tools.cjs roadmap update-job-progress "${OBJECTIVE_NUMBER}"
node ~/.claude/devflow/bin/df-tools.cjs requirements mark-complete ${REQ_IDS}
```
</step>

<step name="git_commit_metadata">
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs({objective}-{trd}): complete [plan-name]" --files .planning/objectives/XX-name/{objective}-{trd}-SUMMARY.md .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md
```
</step>

<step name="offer_next">
Same routing as execute-job.md — check for more TRDs/JOBs, objective completion, milestone completion.

Auto-advance if configured: phases chain automatically.
Use `--pause` flag to stop between phases.
</step>

</process>

<success_criteria>
- All tasks from TRD executed with captured evidence
- Per-task verification evidence recorded
- TDD enforcement applied for type: tdd TRDs
- Post-TRD verification loop completed (max 2 auto-fix cycles)
- SUMMARY.md created with evidence sections
- STATE.md, ROADMAP.md, REQUIREMENTS.md updated
- All metadata committed
</success_criteria>

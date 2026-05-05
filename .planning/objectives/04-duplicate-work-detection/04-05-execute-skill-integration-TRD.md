---
objective: 04-duplicate-work-detection
trd: 04-05
title: /df:execute-objective workflow integration — runs dup-detect at entry, friction-minimal (advisory ignored), 4-option AskUserQuestion only on blocking match
type: standard
confidence: high
wave: 4
depends_on: [04-01, 04-02, 04-03]
files_modified:
  - plugins/devflow/devflow/workflows/execute-objective.md
autonomous: true
requirements: [SC-7, SC-8]
verification_commands:
  - "grep -n 'df-tools dup-detect --mode execute' plugins/devflow/devflow/workflows/execute-objective.md"
  - "grep -n 'AskUserQuestion' plugins/devflow/devflow/workflows/execute-objective.md | grep -i 'merge\\|defer\\|coordinate\\|proceed'"
  - "grep -n 'dup-detect resolve' plugins/devflow/devflow/workflows/execute-objective.md"
  - "node -e 'const fs=require(\"fs\"); const c=fs.readFileSync(\"plugins/devflow/devflow/workflows/execute-objective.md\",\"utf-8\"); if (!/Duplicate-Work|dup-detect/i.test(c)) throw new Error(\"dup-detect step not added\"); console.log(\"OK\");'"

must_haves:
  truths:
    - "execute-objective.md gains a new step (numbered between current `validate_objective` and `discover_and_group_plans`) that runs `df-tools dup-detect --mode execute <objective_id> --raw` BEFORE the first wave spawns"
    - "Mode='execute' STRICTER than plan-time: only blocking matches trigger AskUserQuestion (advisory matches are filtered upstream by detectDuplicates and IGNORED here — no inline display)"
    - "If detection result has blocking: false, workflow logs the result to JSONL (`df-tools dup-detect log <id> --mode execute --blocking false --resolution none`) and continues SILENTLY (no inline note, no advisory display) per CONTEXT.md decision #5 (friction-minimal)"
    - "If detection result has blocking: true, workflow displays detection summary + presents AskUserQuestion with same 4 options (Merge / Defer / Coordinate / Proceed-anyway) — same dispatcher as plan-time"
    - "On Merge: workflow EXITS cleanly with the suggested git checkout command displayed (executor agents NOT spawned)"
    - "On Defer: workflow EXITS cleanly after .planning/.deferred/<id>.json is written (executor agents NOT spawned)"
    - "On Coordinate or Proceed-anyway: workflow CONTINUES to discover_and_group_plans + execute_waves. Coordination Note has been appended to CONTEXT.md by `df-tools dup-detect resolve`. Executor agents read CONTEXT.md transitively via the existing job context."
    - "Infrastructure failures (warnings array non-empty) display as a > Note: blockquote to user but do NOT block execution"
    - "When --gaps-only flag is set, execute-time dup-detect is SKIPPED (gap-closure plans are by definition reactive to verification failures, not new overlap)"
  artifacts:
    - path: "plugins/devflow/devflow/workflows/execute-objective.md"
      provides: "New step (e.g., '<step name=\"dup_detect_check\">' or numbered subsection) invoking df-tools dup-detect --mode execute, dispatching 4-option resolution, routing to early exit OR continuation."
      contains: "dup-detect --mode execute"
  key_links:
    - from: "plugins/devflow/devflow/workflows/execute-objective.md"
      to: "plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs::cmdDupDetectDetect + cmdDupDetectResolve + cmdDupDetectLog"
      via: "shell invocation: `df-tools dup-detect --mode execute ...` and `df-tools dup-detect resolve ...`"
      pattern: "df-tools dup-detect"
    - from: "plugins/devflow/devflow/workflows/execute-objective.md"
      to: "plugins/devflow/devflow/workflows/plan-objective.md"
      via: "shared 4-option AskUserQuestion / resolution dispatch pattern (mirrored from TRD 04-04)"
      pattern: "AskUserQuestion.*Merge.*Defer.*Coordinate.*Proceed"
---

<objective>
Wire the duplicate-work detection engine into the `/df:execute-objective` skill workflow. Insert a new step BEFORE `discover_and_group_plans` that runs `df-tools dup-detect --mode execute <objective_id>` and applies the SAME 4-option resolution dispatcher as TRD 04-04 — but with stricter behavior:

1. **Mode='execute' filters advisory upstream** (already done by `detectDuplicates`); the skill does NOT surface advisory entries inline. Friction-minimal per CONTEXT.md decision #5.
2. **Only blocking matches trigger AskUserQuestion.**
3. No-match case: silent log to JSONL, continue.
4. Same 4-option dispatcher reuses `df-tools dup-detect resolve`.

This is a SKILL-WORKFLOW edit (no new code shipped). Tested transitively via TRD 04-06 e2e integration tests covering all 4 resolution paths AT execute-time.

Output:
1. New `<step name="dup_detect_check">` step in `execute-objective.md` (or equivalent numbered subsection), inserted between `validate_objective` and `discover_and_group_plans`.
2. Skip-when-gaps-only handling (gap closure plans don't need fresh dup-detect).
</objective>

<file_tree>
plugins/devflow/devflow/workflows/
└── execute-objective.md             ← MODIFY  (insert new step between validate_objective and discover_and_group_plans)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing workflow step pattern in execute-objective.md** — `<step name="validate_objective">`:

```markdown
<step name="validate_objective">
From init JSON: `objective_dir`, `job_count`, `incomplete_count`.

Report: "Found {job_count} plans in {objective_dir} ({incomplete_count} incomplete)"
</step>
```

**Mirror pattern for `<step name="dup_detect_check">`**:

```markdown
<step name="dup_detect_check">
**Skip if:** `--gaps-only` flag (gap closure plans are reactive to verification failures, not new overlap).

Per CONTEXT.md locked decision #5 (friction-minimal at execute-time): only blocking matches surface a prompt. Advisory matches are filtered upstream by detectDuplicates.

\`\`\`bash
DETECT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect --mode execute "${OBJECTIVE_ARG}" --raw 2>/dev/null)
DETECT_OK=$?
if [[ $DETECT_OK -ne 0 ]]; then
  echo "Note: dup-detect skipped (df-tools failed); continuing without coordination signals."
  DETECT_RAW='{"blocking":false,"matches":[],"advisory":[],"warnings":["dup-detect CLI failed"],"mode":"execute","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
fi
DETECT_BLOCKING=$(echo "$DETECT_RAW" | jq -r '.blocking // false')
\`\`\`

If `DETECT_BLOCKING == "false"`:
\`\`\`bash
node ~/.claude/devflow/bin/df-tools.cjs dup-detect log "${OBJECTIVE_ARG}" \
  --mode execute --blocking false --resolution none 2>/dev/null || true
\`\`\`
Continue silently (no display, no inline note).

If `DETECT_BLOCKING == "true"`: display detection summary + AskUserQuestion (same 4 options as plan-time) + dispatch.

(Detailed prompt + dispatch pattern: see TRD 04-04 plan-objective.md ## 6.5 — re-use the same option labels and resolution mapping.)

On Merge/Defer: EXIT the workflow before \`discover_and_group_plans\`.
On Coordinate/Proceed-anyway: continue to \`discover_and_group_plans\`. Coordination Note has been written to CONTEXT.md.
</step>
```

**Existing branching pattern in execute-objective.md** — `<step name="handle_branching">`:

```markdown
<step name="handle_branching">
Check `branching_strategy` from init:

**"none":** Skip, continue on current branch.
**"objective" or "milestone":** Use pre-computed `branch_name` from init:
\`\`\`bash
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
\`\`\`
</step>
```

Mirror that conditional pattern for the dup-detect step's --gaps-only short-circuit.

</codebase_examples>

<anti_patterns>

- **DO NOT add the dup-detect step BEFORE `validate_objective`.** It must run AFTER objective validation so we know `OBJECTIVE_ARG` resolves to a real objective.
- **DO NOT add the step AFTER `discover_and_group_plans`.** Friction-minimal means the prompt happens BEFORE wave spawning, not interleaved.
- **DO NOT show the user the no-match case at execute-time.** Per CONTEXT.md decision #5 — silent log, continue. (Plan-time displays advisory; execute-time does not.)
- **DO NOT spawn executor agents if user picks Merge or Defer.** Workflow MUST exit cleanly — early-return from the step before reaching `discover_and_group_plans`.
- **DO NOT invent a new resolution dispatcher.** Reuse `df-tools dup-detect resolve --resolution <choice>` — same CLI as plan-time. The dispatcher does NOT differentiate plan vs execute (same `applyResolution` entrypoint).
- **DO NOT skip when --auto flag is set.** Auto-mode means "auto-approve checkpoints" but blocking dup-detect is NOT a checkpoint — it's a true coordination decision. The user MUST resolve it. (Future: --skip-dup-detect flag could opt out, but v1.1 doesn't ship it.)
- **DO NOT modify the `validate_objective` step.** Insert a NEW step after it.

</anti_patterns>

<error_recovery>

- **`df-tools dup-detect --mode execute` exits non-zero** (broken CLI) → skill displays warning, continues without dup-detect (friction-minimal). Per CONTEXT.md decision #8.
- **AskUserQuestion returns unexpected label** → fallback to Proceed-anyway (safest; lets execution continue with warning logged).
- **`df-tools dup-detect resolve` exits non-zero** → display error + ask user "Continue without recording or retry?" Recommended fallback: log via `dup-detect log` directly + continue.
- **`--gaps-only` flag set** → skip dup-detect entirely (gap closure plans are inherently reactive; they don't introduce new coordination concerns).
- **No `OBJECTIVE_ARG` available** (skill invoked without arg) → existing `validate_objective` already errors. Dup-detect step never reached.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/04-duplicate-work-detection/04-CONTEXT.md
@.planning/objectives/04-duplicate-work-detection/04-RESEARCH.md
@.planning/objectives/04-duplicate-work-detection/04-01-detection-engine-and-fixtures-TRD.md
@.planning/objectives/04-duplicate-work-detection/04-02-resolution-recorder-TRD.md
@.planning/objectives/04-duplicate-work-detection/04-03-format-detection-markdown-TRD.md
@.planning/objectives/04-duplicate-work-detection/04-04-plan-skill-integration-TRD.md

# File this TRD edits:
@plugins/devflow/devflow/workflows/execute-objective.md

# Pattern reference (sibling skill workflow):
@plugins/devflow/devflow/workflows/plan-objective.md
</context>

<gotchas>

- **execute-objective.md uses `<step name="...">` XML-element step structure**, NOT the `## N. Title` markdown headings of plan-objective.md. Mirror that pattern for the new step.
- **The step runs BEFORE branching is checked** — but `validate_objective` runs after branching. Insert the new step AFTER `validate_objective` so the objective is known to exist.
- **`OBJECTIVE_ARG` is the shell var holding the objective number** in execute-objective.md (different from plan-objective.md's `OBJECTIVE`). Use the correct var name.
- **`--gaps-only` flag is parsed inside discover_and_group_plans** today — but for the dup-detect skip, parse it explicitly in the new step:
  ```bash
  if [[ " $* " == *" --gaps-only "* ]]; then
    echo "Skipping dup-detect (--gaps-only)"
    # continue to next step
  fi
  ```
- **AskUserQuestion option labels MUST be ≤ 12 chars.** "Proceed" instead of "Proceed-anyway"; map back in dispatch (same as TRD 04-04).
- **Coordination Note write at execute-time is identical to plan-time** — `df-tools dup-detect resolve --resolution coordinate` calls `_writeCoordinationNote` which appends to the EXISTING CONTEXT.md (created at plan-time). The new section is appended below any existing notes.
- **Multiple plan-time runs may have already written notes**; this execute-time note is just one more. The accumulating-note behavior is INTENTIONAL.
- **The dispatcher's `mode` parameter doesn't change the behavior** — the dispatcher writes the same Coordination Note shape regardless of plan/execute mode. The `mode` field appears in the JSONL log entry only.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Insert "dup_detect_check" step in execute-objective.md workflow</name>
  <files>
    plugins/devflow/devflow/workflows/execute-objective.md
  </files>
  <action>
**Edit `plugins/devflow/devflow/workflows/execute-objective.md`** — insert a new `<step name="dup_detect_check">` element between the existing `<step name="validate_objective">` and `<step name="discover_and_group_plans">`.

The new step content:

```xml
<step name="dup_detect_check">
**Skip if:** `--gaps-only` flag (gap closure plans are reactive to verification failures, not new overlap).

```bash
GAPS_ONLY=false
if [[ " $* " == *" --gaps-only "* ]]; then
  GAPS_ONLY=true
fi
```

If `GAPS_ONLY` is true, skip this step.

Otherwise, run execute-time duplicate-work detection. Per CONTEXT.md decision #5 (friction-minimal at execute-time): only blocking matches trigger a prompt; no-match case is a silent log entry.

```bash
DETECT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect --mode execute "${OBJECTIVE_ARG}" --raw 2>/dev/null)
DETECT_OK=$?
if [[ $DETECT_OK -ne 0 ]]; then
  # Per CONTEXT.md locked decision #8: infrastructure failures are silent.
  echo "Note: dup-detect skipped (df-tools dup-detect failed); continuing without coordination signals."
  DETECT_RAW='{"blocking":false,"matches":[],"advisory":[],"warnings":["dup-detect CLI failed"],"mode":"execute","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
fi
DETECT_BLOCKING=$(echo "$DETECT_RAW" | jq -r '.blocking // false')
DETECT_MATCHES_LEN=$(echo "$DETECT_RAW" | jq -r '.matches | length')
DETECT_WARNINGS_LEN=$(echo "$DETECT_RAW" | jq -r '.warnings | length')
```

**If `DETECT_WARNINGS_LEN > 0`**, display warnings as informational blockquote (do NOT block):

```
> **Note:** Duplicate-work recheck ran with degraded signals:
> - {warning 1}
```

**If `DETECT_BLOCKING == "false"`** (no blocking match):

```bash
node ~/.claude/devflow/bin/df-tools.cjs dup-detect log "${OBJECTIVE_ARG}" \
  --mode execute --blocking false --resolution none 2>/dev/null || true
```

Continue silently to `discover_and_group_plans`. **Do not display anything to the user.** This is the friction-minimal path.

**If `DETECT_BLOCKING == "true"`**: display detection summary + ask user.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► DUPLICATE-WORK RECHECK — BLOCKING MATCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A peer session has started overlapping work since planning completed.
```

For each match in `DETECT_RAW.matches[]`:

```
**Match {N}** — {strength} via {source}
- Peer: `{peer_branch}` — `{peer_objective}`
- Signal: {signal}
- Score: {score}
```

Then surface AskUserQuestion (same 4-option list as TRD 04-04):

```
AskUserQuestion(
  questions=[{
    header: "Resolution",
    question: "Detected duplicate-work overlap before execution begins. How do you want to resolve?",
    options: [
      { label: "Merge",      description: "Abort execution. Switch to peer branch and continue there." },
      { label: "Defer",      description: "Save objective state to .planning/.deferred/. Resume later." },
      { label: "Coordinate", description: "Continue execution. Add Coordination Note to CONTEXT.md naming the peer." },
      { label: "Proceed",    description: "Continue with full warning. Likely merge conflicts at commit time." }
    ],
    multiSelect: false
  }]
)
```

Map the user's label to a resolution string (same mapping as TRD 04-04):

```bash
USER_LABEL="<from AskUserQuestion>"
case "$USER_LABEL" in
  Merge)      RESOLUTION="merge" ;;
  Defer)      RESOLUTION="defer" ;;
  Coordinate) RESOLUTION="coordinate" ;;
  Proceed)    RESOLUTION="proceed-anyway" ;;
  *)          RESOLUTION="proceed-anyway" ;;  # safest fallback
esac

PEER_BRANCH=$(echo "$DETECT_RAW" | jq -r '.matches[0].peer_branch // ""')
PEER_OBJECTIVE=$(echo "$DETECT_RAW" | jq -r '.matches[0].peer_objective // ""')

RESOLVE_RESULT=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect resolve "${OBJECTIVE_ARG}" \
  --resolution "$RESOLUTION" \
  --peer-branch "$PEER_BRANCH" \
  --peer-objective "$PEER_OBJECTIVE" \
  --raw 2>&1)
```

**Workflow routing:**

- **merge** → Display abort message + git checkout suggestion. EXIT the workflow before `discover_and_group_plans`. Display:

  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DF ► EXECUTION ABORTED — MERGE WITH PEER
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ```

  Run no further steps.

- **defer** → Display deferred state file path. EXIT the workflow before `discover_and_group_plans`. Display:

  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DF ► EXECUTION DEFERRED
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  State persisted to: ${RESOLVE_RESULT.defer_path}
  ```

- **coordinate** OR **proceed-anyway** → Coordination Note has been appended to CONTEXT.md. Continue to `discover_and_group_plans`. Executor agents will read CONTEXT.md transitively via their job context.

Note: `df-tools dup-detect resolve` already calls `recordResolution`. No separate logging step.
</step>
```

**Insertion procedure** (use Edit tool):
- Find: `<step name="discover_and_group_plans">` (the next step that comes AFTER validate_objective).
- Insert before: the entire `<step name="dup_detect_check"> ... </step>` element above.

# CRITICAL: This is the FIRST point where executor agents could otherwise spawn. Wire dup-detect BEFORE discover_and_group_plans.
# GOTCHA: AskUserQuestion option labels ≤ 12 chars. "Proceed" not "Proceed-anyway".
# PATTERN: Mirror TRD 04-04's AskUserQuestion + dispatch shape — both workflows share the same dispatcher CLI.
  </action>
  <verify>
- `grep -n '<step name="dup_detect_check">' plugins/devflow/devflow/workflows/execute-objective.md` returns exactly 1 line.
- `grep -c 'df-tools dup-detect --mode execute' plugins/devflow/devflow/workflows/execute-objective.md` returns ≥ 1.
- `grep -c 'AskUserQuestion' plugins/devflow/devflow/workflows/execute-objective.md` returns ≥ 1.
- `grep -c 'df-tools dup-detect resolve' plugins/devflow/devflow/workflows/execute-objective.md` returns ≥ 1.
- `grep -c 'df-tools dup-detect log' plugins/devflow/devflow/workflows/execute-objective.md` returns ≥ 1.
- `grep -c '<step name="discover_and_group_plans">' plugins/devflow/devflow/workflows/execute-objective.md` returns 1 (still present, not duplicated).
- `npm test 2>&1 | tail -5` shows no regressions.

**Commit:**
```bash
git add plugins/devflow/devflow/workflows/execute-objective.md
git commit -m "feat(04-05): wire dup-detect into /df:execute-objective workflow

Insert <step name=\"dup_detect_check\"> between validate_objective and
discover_and_group_plans. Workflow runs df-tools dup-detect --mode execute
before any wave spawns; on blocking match, presents AskUserQuestion with
4 options (Merge/Defer/Coordinate/Proceed); dispatches via df-tools dup-detect
resolve; routes to early exit (Merge/Defer) or wave execution (Coordinate/
Proceed-anyway).

No-match path is silent (friction-minimal per CONTEXT.md decision #5):
just a JSONL log entry, no inline display. Advisory matches filtered upstream
by detectDuplicates(mode='execute'); never surfaced.

--gaps-only flag skips dup-detect (gap closure plans are reactive).

Closes SC-7 (execute-time workflow integration with stricter behavior).
SC-8 closed via downstream effect: df-tools dup-detect resolve --resolution
defer writes .planning/.deferred/<id>.json."
```
  </verify>
  <done>
execute-objective.md contains the new <step name="dup_detect_check"> element. All grep checks pass. Existing tests still pass. SC-7 + SC-8 (workflow integration side) closed.
  </done>
  <recovery>
If the insertion point is ambiguous (multiple matches for `<step name="discover_and_group_plans">`): there should only be one. If somehow there are two, the second is wrong and should be removed before insertion.
If the workflow markdown breaks because of nested triple-backticks inside the new step: use 4-backtick fences for the outer block, OR escape the inner ones. Existing workflow uses ``` consistently — Match style.
If --gaps-only flag detection breaks (e.g., `$*` doesn't include user-provided args): the safer pattern is to read from `$ARGUMENTS` shell var (devflow-standard). Substitute as needed.
If existing `<step name="discover_and_group_plans">` is broken by adjacent edit: revert via `git checkout` and try a smaller targeted Edit.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none — repo has no lint command per CLAUDE.md)</lint>
<test>npm test</test>
<build>(none — no build step)</build>
</validation_gates>

<verification>
1. `npm test` passes (no regressions — workflow markdown is text only).
2. `execute-objective.md` contains a new `<step name="dup_detect_check">` element.
3. The new step runs BEFORE `discover_and_group_plans`.
4. Mode='execute' filters advisory upstream — workflow does NOT iterate over advisory.
5. AskUserQuestion with 4 options (Merge / Defer / Coordinate / Proceed) is present (same as plan-time).
6. Dispatch via `df-tools dup-detect resolve --resolution <choice>` is documented.
7. No-match path is silent: JSONL log only, no inline display.
8. --gaps-only flag skips dup-detect.
9. Merge / Defer paths exit cleanly without spawning executor agents.
</verification>

<success_criteria>
- [ ] `execute-objective.md` updated with new <step name="dup_detect_check"> element
- [ ] AskUserQuestion includes Merge / Defer / Coordinate / Proceed options
- [ ] Dispatch via df-tools dup-detect resolve documented
- [ ] No-match path is silent (no inline display)
- [ ] --gaps-only flag skips dup-detect
- [ ] SC-7 (execute-time workflow integration with stricter behavior) closed (workflow side)
- [ ] SC-8 (Defer state via df-tools dup-detect resolve --resolution defer) closed via dispatcher invocation
</success_criteria>

<output>
After completion, create `.planning/objectives/04-duplicate-work-detection/04-05-execute-skill-integration-SUMMARY.md`.
</output>

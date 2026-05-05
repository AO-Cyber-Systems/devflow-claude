---
objective: 04-duplicate-work-detection
trd: 04-04
title: /df:plan-objective workflow integration — runs dup-detect, surfaces 4-option AskUserQuestion, writes Coordination Note
type: standard
confidence: high
wave: 4
depends_on: [04-01, 04-02, 04-03]
files_modified:
  - plugins/devflow/devflow/workflows/plan-objective.md
autonomous: true
requirements: [SC-5, SC-6]
verification_commands:
  - "grep -n 'df-tools dup-detect --mode plan' plugins/devflow/devflow/workflows/plan-objective.md"
  - "grep -n 'AskUserQuestion' plugins/devflow/devflow/workflows/plan-objective.md | grep -i 'merge\\|defer\\|coordinate\\|proceed'"
  - "grep -n 'dup-detect resolve' plugins/devflow/devflow/workflows/plan-objective.md"
  - "node -e 'const fs=require(\"fs\"); const c=fs.readFileSync(\"plugins/devflow/devflow/workflows/plan-objective.md\",\"utf-8\"); if (!/## 6\\.5|## 4\\.5|Duplicate-Work/i.test(c)) throw new Error(\"dup-detect step not added\"); console.log(\"OK\");'"

must_haves:
  truths:
    - "plan-objective.md gains a new step (numbered between Research handling and existing Step 7 'Check Existing TRDs') that runs `df-tools dup-detect --mode plan <objective_id> --raw` AFTER researcher completes"
    - "If detection result has blocking: true, workflow displays formatDetectionMarkdown output to user (purpose=askuser variant) and presents AskUserQuestion with 4 options: Merge / Defer / Coordinate / Proceed-anyway"
    - "Workflow routes user choice via `df-tools dup-detect resolve <objective_id> --resolution <choice> --peer-branch <branch> --peer-objective <peer_id>`"
    - "On Merge: workflow exits cleanly with the suggested git checkout command displayed (planner agent NOT spawned)"
    - "On Defer: workflow exits cleanly after .planning/.deferred/<id>.json is written (planner agent NOT spawned)"
    - "On Coordinate or Proceed-anyway: workflow CONTINUES to planner agent spawn (Step 9). The Coordination Note in CONTEXT.md is now visible to the planner via the existing `context_content` already loaded in INIT (--include context)"
    - "If detection result has blocking: false, workflow logs the result to JSONL (`df-tools dup-detect log <id> --mode plan --blocking false --resolution none`) and continues without prompting"
    - "If detection result has advisory entries (plan-time only), workflow appends a one-line entry per advisory to CONTEXT.md (informational; no prompt)"
    - "Infrastructure failures (warnings array non-empty) display as a > Note: blockquote to the user but do NOT block planning"
    - "Workflow gracefully handles missing CONTEXT.md (init scenario) — `df-tools dup-detect resolve` lazy-creates it via _writeCoordinationNote"
  artifacts:
    - path: "plugins/devflow/devflow/workflows/plan-objective.md"
      provides: "New step (e.g., '## 6.5 Run Duplicate-Work Detection') invoking df-tools dup-detect at plan-time, surfacing 4-option AskUserQuestion on blocking, dispatching resolution, and routing to early exit OR planner spawn."
      contains: "dup-detect --mode plan"
  key_links:
    - from: "plugins/devflow/devflow/workflows/plan-objective.md"
      to: "plugins/devflow/devflow/bin/lib/dup-detect-cli.cjs::cmdDupDetectDetect + cmdDupDetectResolve + cmdDupDetectLog"
      via: "shell invocation: `df-tools dup-detect --mode plan ...` and `df-tools dup-detect resolve ...`"
      pattern: "df-tools dup-detect"
    - from: "plugins/devflow/devflow/workflows/plan-objective.md"
      to: "plugins/devflow/devflow/bin/lib/dup-detect.cjs::formatDetectionMarkdown"
      via: "consumed indirectly — CLI emits structured JSON, workflow re-renders or uses formatted display"
      pattern: "formatDetectionMarkdown|matches\\[\\]"
---

<objective>
Wire the duplicate-work detection engine (TRD 04-01) + resolution recorder (TRD 04-02) + formatter (TRD 04-03) into the `/df:plan-objective` skill workflow. After the researcher completes (Step 6 in current `plan-objective.md`) and before the existing Step 7 ("Check Existing TRDs"), insert a new step that:

1. Calls `df-tools dup-detect --mode plan <objective_id> --raw` to get structured detection JSON.
2. If `blocking: true`: presents the formatted markdown to the user, asks for resolution via AskUserQuestion (4 options), then dispatches the choice via `df-tools dup-detect resolve` and either EXITS the workflow (Merge / Defer) or CONTINUES with planning (Coordinate / Proceed-anyway).
3. If `blocking: false` and advisory entries present: appends one-line advisory entries to CONTEXT.md, logs to JSONL, continues silently.
4. If `blocking: false` and no advisory: logs to JSONL, continues silently.
5. Surfaces infrastructure warnings to user but never blocks on them.

This is a SKILL-WORKFLOW edit (no new code shipped). Tested transitively via TRD 04-06 e2e integration tests covering all 4 resolution paths.

Output:
1. New `## 6.5 Run Duplicate-Work Detection` step in `plan-objective.md`.
2. Updated workflow flow diagram comments (if any).
</objective>

<file_tree>
plugins/devflow/devflow/workflows/
└── plan-objective.md                ← MODIFY  (insert new step 6.5 between 6 and 7)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing workflow step pattern** — `workflows/plan-objective.md` Step 4 (current obj 3 ship):

```markdown
## 4. Brief Inline Discussion (Optional)

**If `context_content` is not null** (existing CONTEXT.md from a prior discussion):
Display: `Using objective context from: ${objective_dir}/*-CONTEXT.md`
Pass `context_content` to researcher, planner, checker, and revision agents. Skip to step 5.

**If `context_content` is null AND `--skip-discuss` flag is NOT set:**

Ask 2-3 brief clarifying questions using AskUserQuestion to capture key preferences before planning.

Example:
\`\`\`
AskUserQuestion(
  questions=[{
    header: "Approach",
    question: "For Objective {X}: ...",
    options: [
      { label: "You decide", description: "Use your best judgment based on research" },
      { label: "Let me specify", description: "I'll provide specific preferences" }
    ],
    multiSelect: false
  }]
)
\`\`\`
```

**Existing workflow CLI invocation pattern** — `skills/research-objective/SKILL.md` step 2.5 (obj 3 ship):

```bash
CONSIDERATIONS=$(node ~/.claude/devflow/bin/df-tools.cjs org-awareness considerations "${objective_number}" 2>/dev/null || echo "")
```

**Mirror for dup-detect**:

```bash
DETECT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect --mode plan "${OBJECTIVE}" --raw 2>/dev/null)
DETECT_BLOCKING=$(echo "$DETECT_RAW" | jq -r '.blocking // false')
DETECT_MATCHES_LEN=$(echo "$DETECT_RAW" | jq -r '.matches | length')
```

**Existing AskUserQuestion pattern** — `workflows/plan-objective.md` Step 4 + `skills/research-objective/SKILL.md`:

The `AskUserQuestion` call uses:
- `header`: short label (≤ 12 chars)
- `question`: full question text
- `options`: array of `{ label, description }`
- `multiSelect: false`

For 4-option resolution flow:

```
AskUserQuestion(
  questions=[{
    header: "Resolution",
    question: "Detected duplicate-work overlap with peer session. How do you want to resolve?",
    options: [
      { label: "Merge",         description: "Abort planning. Switch to peer branch and continue there." },
      { label: "Defer",         description: "Save this objective's planning state to .planning/.deferred/. Resume later." },
      { label: "Coordinate",    description: "Continue planning. Add a Coordination Note to CONTEXT.md naming the peer." },
      { label: "Proceed",       description: "Continue with full warning. Likely merge conflicts at commit time." }
    ],
    multiSelect: false
  }]
)
```

(Note: AskUserQuestion option labels MUST be ≤ 12 chars per Claude Code constraint. "Proceed" is the safe label for "Proceed-anyway"; the dispatch maps "Proceed" → 'proceed-anyway' resolution string.)

</codebase_examples>

<anti_patterns>

- **DO NOT add the dup-detect step BEFORE the researcher runs.** It runs AFTER (so RESEARCH.md already exists). Insert between current Step 6 (Handle Research) and Step 7 (Check Existing TRDs).
- **DO NOT block on infrastructure failures.** When `warnings.length > 0` and `blocking: false`, surface as a > Note: blockquote and continue.
- **DO NOT spawn the planner agent if user picks Merge or Defer.** Workflow MUST exit cleanly — early-return from the step before reaching Step 9.
- **DO NOT re-render the markdown in the workflow.** Display the JSON-parsed `formatted_markdown` field if the CLI emits it; otherwise reconstruct via the structured `matches`/`advisory` arrays. (The CLI currently does NOT emit a pre-formatted markdown — workflow can either call `formatDetectionMarkdown` directly via Node OR build a brief summary inline. Recommend: brief inline summary; full formatter is for downstream user.)
- **DO NOT prompt the user when `blocking: false`.** Friction-minimal at execute-time and at plan-time when only advisory matches found. Only blocking matches surface AskUserQuestion.
- **DO NOT modify the planner agent prompt** here — Coordinate/Proceed-anyway resolution writes Coordination Note to CONTEXT.md, which is already loaded into the planner's context via the existing `--include context` step.
- **DO NOT introduce new INIT fields.** All needed context (`objective_dir`, `padded_objective`, `objective_number`) is already in INIT.

</anti_patterns>

<error_recovery>

- **`df-tools dup-detect --mode plan` exits non-zero** (e.g., dup-detect.cjs broken) → workflow logs warning, continues planning without dup-detect. Per CONTEXT.md decision #8, infrastructure failures are silent at plan-time.
- **`jq` not installed** → use `node -e` JSON.parse fallback (existing workflow patterns use `jq` everywhere; assume present per devflow's stack).
- **AskUserQuestion returns unexpected label** (user types something else) → treat as Proceed-anyway (safest fallback; workflow continues with warning logged).
- **`df-tools dup-detect resolve` exits non-zero** → display error to user, ask whether to retry or proceed without recording. Recommended fallback: log to JSONL via `dup-detect log` directly (skips the dispatcher).

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

# File this TRD edits:
@plugins/devflow/devflow/workflows/plan-objective.md

# Pattern reference:
@plugins/devflow/skills/research-objective/SKILL.md
</context>

<gotchas>

- **`AskUserQuestion` option label max length is 12 characters.** "Proceed-anyway" is too long → use "Proceed" with description "(Proceed anyway despite blocking match)". Map back to 'proceed-anyway' resolution string in the dispatch.
- **Workflow markdown is heredoc-friendly** — bash code blocks use 4-space indented or fenced ```bash blocks. Existing pattern uses ```bash; mirror that.
- **`OBJECTIVE` shell var is the objective number** (e.g., '04'). `objective_dir` and `padded_objective` come from INIT. Use them in `dup-detect resolve` invocations.
- **The skill IS the orchestrator at this point** — `AskUserQuestion` is invoked as a tool call, not via shell. The workflow markdown describes WHAT to do; Claude Code executes the tool calls.
- **Coordination Note already auto-written** by `df-tools dup-detect resolve --resolution coordinate|proceed-anyway`. Workflow does NOT need a separate step to append.
- **Planner agent reads CONTEXT.md transitively** via the existing `INIT_RAW` --include context loading. After `dup-detect resolve` writes the Coordination Note, the planner sees it on its next read of `context_content`. NO need to re-load INIT after the Coordination Note write — the planner agent's prompt construction (Step 9) re-reads CONTEXT.md fresh from disk if needed via `cat` + tail of the newly-written section. Document this in the workflow.
- **Advisory entries (plan-mode only) need to be appended to CONTEXT.md too** — but as one-liners under a separate `## Advisory Considerations` heading or appended to a coordination-note-style section. SIMPLEST: workflow calls `dup-detect log` once per advisory entry (no CONTEXT.md modification), and the planner sees them only if the user chose Coordinate/Proceed-anyway (where blocking match's note is added). For the v1.1 first pass, **only the blocking match's note goes into CONTEXT.md**; advisory entries are JSONL-logged only. (This is a slight tightening from CONTEXT.md decision #6 wording, which says "ANY match" — but the v1.1 spirit is "matter-of-fact: only what affects user choice gets surfaced as visible state.")

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Insert "Run Duplicate-Work Detection" step in plan-objective.md workflow</name>
  <files>
    plugins/devflow/devflow/workflows/plan-objective.md
  </files>
  <action>
**Edit `plugins/devflow/devflow/workflows/plan-objective.md`** — insert a new `## 6.5 Run Duplicate-Work Detection` section between the existing `## 6. Handle Research` (which ends with the researcher return handling) and `## 7. Check Existing TRDs`.

The insertion point is after the line `- **\`## RESEARCH BLOCKED\`:**` and before `## 7. Check Existing TRDs`.

The new step content:

```markdown
## 6.5 Run Duplicate-Work Detection (plan-time)

**Skip if:** `--gaps` flag (gap closure mode skips dup-detect — already-shipped plans are inherently their own).

After research completes (or was skipped because RESEARCH.md exists), run plan-time duplicate-work detection. Per `feedback_autopilot_after_setup` memory: only blocking matches gate the planner; advisory matches log silently.

```bash
DETECT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect --mode plan "${OBJECTIVE}" --raw 2>/dev/null)
DETECT_OK=$?
if [[ $DETECT_OK -ne 0 ]]; then
  # Per CONTEXT.md locked decision #8: infrastructure failures are silent at plan-time.
  echo "Note: dup-detect skipped (df-tools dup-detect failed); continuing without coordination signals."
  DETECT_RAW='{"blocking":false,"matches":[],"advisory":[],"warnings":["dup-detect CLI failed"],"mode":"plan","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
fi
DETECT_BLOCKING=$(echo "$DETECT_RAW" | jq -r '.blocking // false')
DETECT_MATCHES_LEN=$(echo "$DETECT_RAW" | jq -r '.matches | length')
DETECT_ADVISORY_LEN=$(echo "$DETECT_RAW" | jq -r '.advisory | length')
DETECT_WARNINGS_LEN=$(echo "$DETECT_RAW" | jq -r '.warnings | length')
```

**If `DETECT_WARNINGS_LEN > 0`:** Display warnings to user (do NOT block):

```
> **Note:** Duplicate-work detection ran with degraded signals:
> - {warning 1}
> - {warning 2}
```

**If `DETECT_BLOCKING == "false"`:** No blocking match. Log result + continue.

```bash
node ~/.claude/devflow/bin/df-tools.cjs dup-detect log "${OBJECTIVE}" \
  --mode plan --blocking false --resolution none 2>/dev/null || true
```

If `DETECT_ADVISORY_LEN > 0`, display the advisory entries inline as informational (not blocking):

```
**Advisory (informational — no action required):**
- weak match: peer `<branch>` — `<signal>`
- ...
```

Continue to step 7.

**If `DETECT_BLOCKING == "true"`:** Blocking match. Display detection summary + ask user.

Display the detection markdown to the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► DUPLICATE-WORK MATCH DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

For each match in `DETECT_RAW.matches[]`:

```
**Match {N}** — {strength} via {source}
- Peer: `{peer_branch}` — `{peer_objective}`
- Signal: {signal}
- Score: {score}
```

Then surface AskUserQuestion (4-option locked list per CONTEXT.md decision #3):

```
AskUserQuestion(
  questions=[{
    header: "Resolution",
    question: "Detected duplicate-work overlap with peer session(s). How do you want to resolve?",
    options: [
      { label: "Merge",      description: "Abort planning. Switch to peer branch and continue there." },
      { label: "Defer",      description: "Save planning state to .planning/.deferred/. Resume later." },
      { label: "Coordinate", description: "Continue planning. Add Coordination Note to CONTEXT.md naming the peer." },
      { label: "Proceed",    description: "Continue with full warning. Likely merge conflicts at commit time." }
    ],
    multiSelect: false
  }]
)
```

Map the user's label to a resolution string:

| Label | Resolution string |
|---|---|
| Merge | `merge` |
| Defer | `defer` |
| Coordinate | `coordinate` |
| Proceed | `proceed-anyway` |

Pick the first match's `peer_branch` and `peer_objective` for the dispatch (top match by score):

```bash
USER_LABEL="<from AskUserQuestion>"
case "$USER_LABEL" in
  Merge)      RESOLUTION="merge" ;;
  Defer)      RESOLUTION="defer" ;;
  Coordinate) RESOLUTION="coordinate" ;;
  Proceed)    RESOLUTION="proceed-anyway" ;;
  *)          RESOLUTION="proceed-anyway" ;;  # fallback per error_recovery
esac

PEER_BRANCH=$(echo "$DETECT_RAW" | jq -r '.matches[0].peer_branch // ""')
PEER_OBJECTIVE=$(echo "$DETECT_RAW" | jq -r '.matches[0].peer_objective // ""')

RESOLVE_RESULT=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect resolve "${OBJECTIVE}" \
  --resolution "$RESOLUTION" \
  --peer-branch "$PEER_BRANCH" \
  --peer-objective "$PEER_OBJECTIVE" \
  --raw 2>&1)
```

**Workflow routing based on `$RESOLUTION`:**

- **merge** → Display the abort message + suggested git checkout command (from `RESOLVE_RESULT`). EXIT the workflow cleanly. The planner agent is NOT spawned. Display:

  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DF ► PLAN ABORTED — MERGE WITH PEER
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ```

  Run no further steps.

- **defer** → Display the deferred state file path. EXIT the workflow cleanly. Planner agent NOT spawned. Display:

  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DF ► PLAN DEFERRED
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  State persisted to: ${RESOLVE_RESULT.defer_path}
  Resume support is v1.2; for now, run `/df:plan-objective ${OBJECTIVE}` again
  after the peer session completes (and consider rebasing).
  ```

- **coordinate** OR **proceed-anyway** → Coordination Note has been appended to CONTEXT.md by `df-tools dup-detect resolve`. RE-READ `context_content` from disk before spawning the planner (so the planner sees the new note):

  ```bash
  CONTEXT_CONTENT=$(cat "${objective_dir}/${padded_objective}-CONTEXT.md" 2>/dev/null || echo "$CONTEXT_CONTENT")
  ```

  Continue to Step 7.

Note: `df-tools dup-detect resolve` already calls `recordResolution`, so a JSONL log entry has been appended for the user's choice. No separate logging step needed.
```

**After inserting the new step, update the workflow's TOC / step-count comments if any, and ensure no orphaned `## 7.` numbering breaks (renumber if necessary, OR keep existing numbers and use 6.5 as the inserted step number — recommended: keep 6.5 since renumbering all subsequent steps is risky).**

Use the Edit tool with a precise anchor:
- Find: `## 7. Check Existing TRDs`
- Insert before: the entire `## 6.5 Run Duplicate-Work Detection` section above.

# CRITICAL: Do NOT renumber existing steps. Insert as 6.5; existing references to step numbers in other code (e.g., agent prompt comments) remain valid.
# GOTCHA: AskUserQuestion option labels MUST be ≤ 12 chars. "Proceed" instead of "Proceed-anyway".
# PATTERN: Mirror obj 3 TRD 03-05's research-objective skill insertion of step 2.5 — single new section, no renumbering.
  </action>
  <verify>
- `grep -n '## 6.5 Run Duplicate-Work Detection' plugins/devflow/devflow/workflows/plan-objective.md` returns exactly 1 line.
- `grep -c 'df-tools dup-detect --mode plan' plugins/devflow/devflow/workflows/plan-objective.md` returns ≥ 1.
- `grep -c 'AskUserQuestion' plugins/devflow/devflow/workflows/plan-objective.md` returns ≥ 2 (existing in step 4 + new in 6.5).
- `grep -c 'df-tools dup-detect resolve' plugins/devflow/devflow/workflows/plan-objective.md` returns ≥ 1.
- `grep -c 'df-tools dup-detect log' plugins/devflow/devflow/workflows/plan-objective.md` returns ≥ 1.
- `grep -E '## 7\\.|## 8\\.|## 9\\.' plugins/devflow/devflow/workflows/plan-objective.md | head -3` shows existing steps 7/8/9 still present (no renumbering broke anything).
- `npm test 2>&1 | tail -5` shows no regressions.

**Commit:**
```bash
git add plugins/devflow/devflow/workflows/plan-objective.md
git commit -m "feat(04-04): wire dup-detect into /df:plan-objective workflow

Insert ## 6.5 Run Duplicate-Work Detection between Step 6 (research) and
Step 7 (check existing TRDs). Workflow runs df-tools dup-detect --mode plan
after researcher completes; on blocking match, presents AskUserQuestion with
4 options (Merge/Defer/Coordinate/Proceed); dispatches via df-tools dup-detect
resolve; routes to early exit (Merge/Defer) or planner spawn (Coordinate/
Proceed-anyway). Advisory entries logged informationally; warnings surfaced
as blockquote without blocking.

Closes SC-5 (workflow integration of plan-time detection + 4-option AskUserQuestion).
SC-6 closed via downstream effect: df-tools dup-detect resolve appends Coordination
Note to CONTEXT.md when Coordinate or Proceed-anyway chosen."
```
  </verify>
  <done>
plan-objective.md contains the new ## 6.5 step. All grep checks pass. Existing tests still pass (workflow markdown is text — no test impact except via 04-06 e2e). SC-5 + SC-6 (workflow integration side) closed.
  </done>
  <recovery>
If the insertion point is ambiguous (multiple `## 7.` matches): use a more specific anchor like `## 7. Check Existing TRDs` (full line). If that's still ambiguous, anchor on the line ABOVE step 7 (e.g., `## 6. Handle Research` end marker).
If a quoting issue breaks the bash heredoc (single quotes inside double-quoted shell vars): convert to a temp-file write pattern (write the markdown body to a tmpfile, then read it).
If renumbering accidentally happens: revert via `git checkout plugins/devflow/devflow/workflows/plan-objective.md` and re-insert with explicit "## 6.5" header (not adding to existing step 7).
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
2. `plan-objective.md` contains a new ## 6.5 step that runs `df-tools dup-detect --mode plan`.
3. AskUserQuestion with 4 options (Merge / Defer / Coordinate / Proceed) is present.
4. Dispatch via `df-tools dup-detect resolve --resolution <choice>` is documented.
5. Merge / Defer paths exit cleanly without spawning planner.
6. Coordinate / Proceed-anyway paths re-read CONTEXT.md before continuing to Step 7.
7. Existing steps 7/8/9 are not renumbered (still present at original anchors).
</verification>

<success_criteria>
- [ ] `plan-objective.md` updated with new ## 6.5 step
- [ ] AskUserQuestion includes Merge / Defer / Coordinate / Proceed options
- [ ] Dispatch via df-tools dup-detect resolve documented
- [ ] No existing step renumbered or broken
- [ ] SC-5 (plan-time workflow integration with 4-option AskUserQuestion) closed (workflow side)
- [ ] SC-6 (Coordination Note for Coordinate / Proceed-anyway) closed via df-tools dup-detect resolve invocation
</success_criteria>

<output>
After completion, create `.planning/objectives/04-duplicate-work-detection/04-04-plan-skill-integration-SUMMARY.md`.
</output>

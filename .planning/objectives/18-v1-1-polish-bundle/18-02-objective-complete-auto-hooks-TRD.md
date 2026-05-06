---
objective: 18-v1-1-polish-bundle
trd: 18-02
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/workflows/execute-objective.md
autonomous: true
requirements:
  - POLISH-AUTO-SYNC-ROADMAP
  - POLISH-AUTO-GH-SYNC

must_haves:
  truths:
    - "execute-objective.md `update_roadmap` step runs `df-tools sync-roadmap` BEFORE the final `df-tools commit`"
    - "execute-objective.md `update_roadmap` step runs `df-tools gh sync <objective_id>` AFTER sync-roadmap, gated on github_issue presence in OBJECTIVE.md"
    - "Both invocations use non-blocking `|| { echo 'Note: ...'; }` pattern — failure does not abort the objective-complete flow"
    - "When OBJECTIVE.md has no github_issue field (or no OBJECTIVE.md exists), `gh sync` invocation is skipped silently — no warning"
    - "When sync-roadmap modifies ROADMAP.md, the modifications get included in the final `df-tools commit` (sync runs BEFORE commit)"
    - "The user-facing skill output mentions both auto-runs in passing (informational, not gate-style)"
  artifacts:
    - path: "plugins/devflow/devflow/workflows/execute-objective.md"
      provides: "update_roadmap step extended with sync-roadmap + gh sync auto-runs"
      contains: "df-tools sync-roadmap"
    - path: "plugins/devflow/devflow/workflows/execute-objective.md"
      provides: "Same step also includes the gh sync invocation"
      contains: "df-tools gh sync"
  key_links:
    - from: "execute-objective.md::update_roadmap step"
      to: "df-tools sync-roadmap CLI"
      via: "bash invocation in workflow body"
      pattern: "df-tools sync-roadmap"
    - from: "execute-objective.md::update_roadmap step"
      to: "df-tools gh sync CLI"
      via: "bash invocation gated on github_issue grep"
      pattern: "df-tools gh sync"
    - from: "sync-roadmap result"
      to: "final df-tools commit (.planning/ROADMAP.md included)"
      via: "ordering — sync runs before commit"
      pattern: "df-tools commit"
---

<objective>
Wire `df-tools sync-roadmap` and `df-tools gh sync <id>` into `execute-objective.md`'s `update_roadmap` step (lines 626-645) so they run automatically at objective-complete time. Both are non-blocking — failure produces a warning but does not abort the flow.

Purpose: closes shelf-ware gap from v1.1 obj 9 + obj 1. Today the user must run these CLIs manually after every objective. After this TRD, they happen as a side-effect of the natural completion path. ROADMAP drift gets fixed in the same atomic commit; GH issues get state-pushed; user does nothing.

Output: a single workflow-text edit. No code changes, no new tests at the unit level — verification is workflow-text greps + an integration smoke test against a fixture objective.
</objective>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Current `update_roadmap` step (execute-objective.md lines 626-645) — the EXACT block to edit:**

```markdown
<step name="update_roadmap">
**Mark objective complete and update all tracking files:**

```bash
COMPLETION=$(node ~/.claude/devflow/bin/df-tools.cjs objective complete "${OBJECTIVE_NUMBER}")
```

The CLI handles:
- Marking objective checkbox `[x]` with completion date
- Updating Progress table (Status → Complete, date)
- Updating job count to final
- Advancing STATE.md to next objective
- Updating REQUIREMENTS.md traceability

Extract from result: `next_objective`, `next_objective_name`, `is_last_objective`.

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs(objective-{X}): complete objective execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md .planning/objectives/{objective_dir}/*-VERIFICATION.md
```
</step>
```

**Non-blocking pattern from `dup_detect_check` step (execute-objective.md lines 67-78):**

```bash
DETECT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect --mode execute "${OBJECTIVE_ARG}" --raw 2>/dev/null)
DETECT_OK=$?
if [[ $DETECT_OK -ne 0 ]]; then
  # Per CONTEXT.md locked decision #8: infrastructure failures are non-blocking.
  echo "Note: dup-detect skipped (df-tools dup-detect --mode execute failed); continuing without coordination signals."
  DETECT_RAW='{"blocking":false,...}'
fi
```

**Final shape (after edit):**

```markdown
<step name="update_roadmap">
**Mark objective complete and update all tracking files:**

```bash
COMPLETION=$(node ~/.claude/devflow/bin/df-tools.cjs objective complete "${OBJECTIVE_NUMBER}")
```

The CLI handles:
- Marking objective checkbox `[x]` with completion date
- Updating Progress table (Status → Complete, date)
- Updating job count to final
- Advancing STATE.md to next objective
- Updating REQUIREMENTS.md traceability

Extract from result: `next_objective`, `next_objective_name`, `is_last_objective`.

**Auto-reconcile ROADMAP drift (TRD 18-02):**

Before the final commit, reconcile any ROADMAP ↔ disk drift so the commit captures the corrected state in one atomic move. Non-blocking — failure produces a warning but does not abort completion.

```bash
node ~/.claude/devflow/bin/df-tools.cjs sync-roadmap 2>/dev/null || {
  echo "Note: sync-roadmap reconcile skipped (CLI failed); continuing without ROADMAP drift correction."
}
```

**Auto-push to GitHub (TRD 18-02):**

Push state to the linked GitHub issue when the objective has one. Skipped silently when OBJECTIVE.md is absent or has no `github_issue` field. Auth failures emit a warning with remediation but don't abort.

```bash
OBJECTIVE_MD=".planning/objectives/${OBJECTIVE_DIR}/OBJECTIVE.md"
if [[ -f "$OBJECTIVE_MD" ]] && grep -qE '^github_issue:' "$OBJECTIVE_MD" 2>/dev/null; then
  node ~/.claude/devflow/bin/df-tools.cjs gh sync "${OBJECTIVE_NUMBER}" 2>/dev/null || {
    echo "Note: gh sync skipped for objective ${OBJECTIVE_NUMBER} (CLI failed; check 'gh auth status' if persistent); continuing."
  }
fi
```

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs(objective-{X}): complete objective execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md .planning/objectives/{objective_dir}/*-VERIFICATION.md
```
</step>
```

(Note the ORDER — sync-roadmap runs BEFORE gh sync, both run BEFORE the final commit. This is locked by CONTEXT §2 and §3.)
</codebase_examples>

<anti_patterns>
- **Calling sync-roadmap AFTER the final commit.** That would leave drift uncorrected for the duration of the objective, and the next session would see the stale ROADMAP. The lock-in: sync-roadmap → gh sync → commit (in that order).
- **Failing the objective if gh sync fails.** Auth errors are common (token expiry); we surface the remediation message but proceed. The user can re-run `df-tools gh sync <id>` manually later.
- **Calling gh sync without the github_issue grep guard.** Without OBJECTIVE.md, `gh sync` errors with "objective has no github_issue" — a meaningful error for an explicit invocation but noise during auto-completion. The grep gates it cleanly.
- **Inlining a complex bash variable (e.g., wrapping in `$(...)` for capture).** Both CLIs are run for side-effects, not output. Use direct invocation + `|| { ... }` for fallback. Don't shell-quote-explode.
- **Using `set -e` in the workflow.** Workflow scripts are advisory; `set -e` is dangerous for non-blocking flows. Stay with `|| { ... }`.
- **Adding sync-roadmap to the `--files` list of the final commit.** sync-roadmap mutates `.planning/ROADMAP.md` in place — the existing `--files` list already includes ROADMAP.md, so the changes are automatically captured.
</anti_patterns>

<error_recovery>
- **`sync-roadmap` returns non-zero (e.g., ROADMAP.md malformed):** warning printed; ROADMAP.md left untouched (atomic write contract from TRD 09-03); commit proceeds without drift correction. User can run `/devflow:sync-roadmap` manually to investigate.
- **`gh sync` returns non-zero due to auth failure:** structured JSON to stderr (per TRD 01-03 GhAuthError pattern). `2>/dev/null` swallows it; the `||` fallback prints a brief warning. User runs `gh auth refresh -h github.com -s project,read:project,repo` per the remediation message they'd see in non-auto-mode.
- **`gh sync` returns non-zero due to network failure:** same pattern — warning, continue. User retries manually later.
- **OBJECTIVE.md missing entirely:** `[[ -f "$OBJECTIVE_MD" ]]` returns false; gh sync block skipped silently. This is the common case for objectives 1-17 today (pre-backfill). Once 18-01 backfill runs, all objs have OBJECTIVE.md. Even then, github_issue field may be absent (we don't auto-populate per CONTEXT §3) → grep returns 1 → block skipped. Net: graceful degradation.
- **OBJECTIVE_DIR variable undefined:** would resolve to `${OBJECTIVE_DIR}` literal in the path. The `[[ -f ... ]]` check would then return false. No crash. (Workflow author should ensure OBJECTIVE_DIR is set earlier in the workflow — line 51 `objective_dir` from init JSON should already be in scope; rename if needed.)
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@plugins/devflow/devflow/workflows/execute-objective.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs

@.planning/objectives/18-v1-1-polish-bundle/18-CONTEXT.md
@.planning/objectives/18-v1-1-polish-bundle/18-RESEARCH.md
</context>

<gotchas>
- **Variable name in the workflow.** `update_roadmap` step uses `${OBJECTIVE_NUMBER}` (line 630). Earlier in the workflow (line 24-25, init JSON) `objective_dir` is also extracted. Confirm the executor binds both before the patched block. If not, add a `OBJECTIVE_DIR=$(node ~/.claude/devflow/bin/df-tools.cjs find-objective "${OBJECTIVE_NUMBER}" --raw | jq -r .directory)` line at the top of the new auto-reconcile section.
- **The grep pattern for github_issue.** `^github_issue:` matches the YAML frontmatter line. Tolerant of `github_issue: AO-Cyber-Systems/foo#1`, `github_issue: "AO-Cyber-Systems/foo#1"`, `github_issue:#1`. Does NOT match `# github_issue: ...` (commented). Good.
- **The 2>/dev/null suppression.** This swallows BOTH structured JSON (for gh sync auth failures) AND ordinary stderr. The user-facing fallback message after `||` is intentionally generic ("CLI failed") — they can re-run the command without `2>/dev/null` to see details. This trades verbosity for non-blocking-ness, per CONTEXT §6.
- **The order matters for ROADMAP correctness.** sync-roadmap mutates ROADMAP.md → gh sync reads ROADMAP/STATE/SUMMARYs to build issue body → final commit captures both effects. Reordering breaks the chain.
- **Workflow text-edit only — zero code changes.** This TRD does NOT modify any .cjs file. The CLIs already exist (TRD 09-03 + 01-04). We're wiring them into the natural workflow.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Edit execute-objective.md update_roadmap step — insert sync-roadmap + gh sync auto-runs</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
Open `plugins/devflow/devflow/workflows/execute-objective.md`. Find the `<step name="update_roadmap">` block (currently lines 626-645). Replace it with the FINAL-shape version shown in `<codebase_examples>` above.

The patch inserts two new bash blocks BETWEEN the existing "Extract from result..." line and the existing final `df-tools commit` line:

1. The "Auto-reconcile ROADMAP drift" block — runs `df-tools sync-roadmap` with `|| { echo "Note: ..."; }` fallback.
2. The "Auto-push to GitHub" block — checks for OBJECTIVE.md and `^github_issue:` via grep, runs `df-tools gh sync` only if the gate passes.

Verify the OBJECTIVE_DIR variable is set somewhere earlier in the workflow body. Search for `OBJECTIVE_DIR=` or `objective_dir`:
```bash
grep -n "OBJECTIVE_DIR\|objective_dir" plugins/devflow/devflow/workflows/execute-objective.md
```

If `OBJECTIVE_DIR` is NOT bound to a bash variable in the executor's surrounding scope (the init JSON populates `objective_dir` JSON field, which is consumed by the orchestrator/executor agent), prepend a small variable-resolve helper to the auto-push block:

```bash
OBJECTIVE_DIR=$(node ~/.claude/devflow/bin/df-tools.cjs find-objective "${OBJECTIVE_NUMBER}" --raw | jq -r '.directory // ""')
```

(Most workflows pull `objective_dir` from the init JSON parsed at step `initialize`. If the executor agent uses a different variable name like `OBJECTIVE_PATH`, match the existing convention.)

Spot-check the diff:
```bash
git diff plugins/devflow/devflow/workflows/execute-objective.md
```

Confirm:
- Two new code-fenced bash blocks added
- The two new blocks appear AFTER "Extract from result" line and BEFORE the final `df-tools commit` line
- Each new block uses the `|| { echo "Note: ..."; }` fallback pattern
- The `gh sync` block is gated on `[[ -f "$OBJECTIVE_MD" ]] && grep -qE '^github_issue:' ...`

# CRITICAL: Order locked by CONTEXT §2/§3 — sync-roadmap MUST run BEFORE gh sync, BOTH MUST run BEFORE the final commit.
# CRITICAL: Failure of either auto-run MUST NOT abort the workflow. The `|| { ... }` pattern is non-negotiable.
# GOTCHA: The grep `^github_issue:` is anchored to start-of-line. YAML frontmatter is the only place this matches; commented `# github_issue:` is ignored. Good.
# GOTCHA: Don't add `set -e` anywhere in the new blocks. set-e + || semantics are subtle and can swallow real errors.
# PATTERN: Match the comment-style `**Auto-reconcile ROADMAP drift (TRD 18-02):**` for clarity in the workflow doc — explicit cross-reference to this TRD.
  </action>
  <verify>
1. `grep -nE 'df-tools sync-roadmap|df-tools gh sync' plugins/devflow/devflow/workflows/execute-objective.md` → returns at least 2 matches, both inside the `<step name="update_roadmap">` block.
2. `grep -nB2 -A1 'sync-roadmap reconcile skipped' plugins/devflow/devflow/workflows/execute-objective.md` → confirms the non-blocking fallback message.
3. Confirm ordering with `awk '/<step name="update_roadmap">/,/<\/step>/' plugins/devflow/devflow/workflows/execute-objective.md` — sync-roadmap MUST appear before gh sync, both MUST appear before the final `df-tools commit`.
4. `npm test` → all tests still pass (workflow text edits don't touch any .cjs; this is a sanity check).
  </verify>
  <done>
execute-objective.md's update_roadmap step contains both auto-runs in the locked order, both non-blocking, gh sync gated on github_issue presence. Order verified: sync-roadmap → gh sync → final commit. Single commit logged with `feat(18-02): wire sync-roadmap + gh sync auto-runs into execute-objective.md update_roadmap step`.
  </done>
  <recovery>
If the edit accidentally moves the final `df-tools commit` line or removes the `Mark objective complete...` header text, restore via `git diff` review and re-edit. The patch is purely additive — only two new blocks are inserted, no existing lines are deleted or reordered.
If a verification grep fails, the patch may not have landed in the right block. Re-locate `<step name="update_roadmap">` and reapply.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Integration smoke test — manual run against a known-good objective</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
This is a verification-only task — no file edits. Confirm the wiring works in practice by simulating the bash blocks against a real objective in this repo.

The simulation runs the literal commands from the patched workflow against objective 0 (which has OBJECTIVE.md WITH github_issue, so both auto-runs trigger):

```bash
# Simulate sync-roadmap auto-run
node ~/.claude/devflow/bin/df-tools.cjs sync-roadmap --dry-run 2>/dev/null || {
  echo "Note: sync-roadmap reconcile skipped (CLI failed); continuing without ROADMAP drift correction."
}
```

Expected: dry-run output (JSON or text describing zero or more drift entries), exit 0. If exit non-zero, the fallback warning prints — that's the workflow handling failure correctly.

```bash
# Simulate gh sync auto-run gate (against objective 0)
OBJECTIVE_MD=".planning/objectives/00-refine-defaults-table/OBJECTIVE.md"
if [[ -f "$OBJECTIVE_MD" ]] && grep -qE '^github_issue:' "$OBJECTIVE_MD" 2>/dev/null; then
  echo "GATE PASSED — gh sync would run for objective 0"
else
  echo "GATE FAILED — gh sync would skip for objective 0"
fi
```

Expected: `GATE PASSED` (objective 0's OBJECTIVE.md has `github_issue: AO-Cyber-Systems/devflow-claude#20`).

Now simulate the gate against a backfilled objective (e.g., 09 — assumes TRD 18-01 has run):

```bash
OBJECTIVE_MD=".planning/objectives/09-roadmap-disk-reconciliation/OBJECTIVE.md"
if [[ -f "$OBJECTIVE_MD" ]] && grep -qE '^github_issue:' "$OBJECTIVE_MD" 2>/dev/null; then
  echo "GATE PASSED — gh sync would run"
else
  echo "GATE SKIPPED — no github_issue (expected for backfilled stub)"
fi
```

Expected: `GATE SKIPPED` (the backfill creates a minimal stub with only `work:` field — no github_issue. User adds it manually when ready.)

If both expected outputs match: the workflow text is wired correctly, the auto-run pattern is robust, and the gate handles both populated-OBJECTIVE.md and backfilled-stub cases.

# CRITICAL: This is a non-mutating verification — the smoke test uses --dry-run for sync-roadmap and only echoes for gh sync. Do NOT actually call `df-tools gh sync` against a real objective during planning verification (it would push state to GitHub).
# GOTCHA: If TRD 18-01 has not yet executed (no backfilled OBJECTIVE.md), the second simulation will print `GATE SKIPPED` because the file simply doesn't exist — that's also a valid pass for the gate logic.
# PATTERN: This smoke test belongs in the SUMMARY.md verification section, not as a permanent test. The wiring is workflow text; ongoing regression is covered by reviewing the workflow file in PR.
  </action>
  <verify>
Both simulations print expected output:
- sync-roadmap dry-run completes without error OR prints the fallback warning (both are pass-states for the wiring).
- objective 0 simulation prints `GATE PASSED`.
- objective 09 simulation prints `GATE SKIPPED` (assuming TRD 18-01 backfill ran but didn't auto-populate github_issue, per CONTEXT §3).

If TRD 18-01 hasn't run yet, the OBJECTIVE.md for objective 09 doesn't exist; gate also reports SKIPPED — also valid.
  </verify>
  <done>
Smoke test confirms: sync-roadmap auto-run handles success/failure non-blockingly; gh sync gate correctly distinguishes objectives WITH vs WITHOUT github_issue; the workflow text reflects the locked order (sync-roadmap → gh sync → commit). No commit needed for this task — purely verification.
  </done>
  <recovery>
If sync-roadmap dry-run fails AND prints no fallback message: the fallback `||` is mis-quoted in the workflow patch. Re-check the bash block in execute-objective.md — the `||` must be on the same line as the `... 2>/dev/null` (or use a multi-line continuation correctly).
If the gate behaves wrongly (passes when it should skip): the grep regex is wrong. `^github_issue:` is the locked pattern; verify it's not accidentally `^# github_issue:` or `github_issue` (without anchor).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<lint>(no lint command in this repo per CLAUDE.md)</lint>
<build>(no build step)</build>
</validation_gates>

<verification>
- [ ] `<step name="update_roadmap">` block in execute-objective.md contains `df-tools sync-roadmap` invocation
- [ ] Same block contains `df-tools gh sync` invocation gated on `^github_issue:` grep
- [ ] Both invocations use `|| { echo "Note: ..."; }` non-blocking pattern
- [ ] Order: sync-roadmap → gh sync → final commit (asserted by line-number comparison)
- [ ] Smoke test (Task 2) confirms gate behavior on populated vs backfilled OBJECTIVE.md
- [ ] Single commit logged: `feat(18-02): wire sync-roadmap + gh sync auto-runs into execute-objective.md`
- [ ] No code (.cjs) files modified; only the workflow markdown
- [ ] All 1832 pre-existing tests still pass
</verification>

<success_criteria>
- POLISH-AUTO-SYNC-ROADMAP requirement met: workflow auto-runs sync-roadmap before final commit, non-blocking on failure
- POLISH-AUTO-GH-SYNC requirement met: workflow auto-runs gh sync after sync-roadmap, gated on github_issue, non-blocking on failure
- Zero regressions in existing tests
- Workflow text follows existing devflow conventions (matches the dup_detect_check non-blocking pattern from earlier in the same file)
</success_criteria>

<output>
After completion, create `.planning/objectives/18-v1-1-polish-bundle/18-02-objective-complete-auto-hooks-SUMMARY.md` per `@/Users/markemerson/.claude/devflow/templates/summary.md`. Include:
- Workflow lines added (cite line numbers)
- Smoke test results (sync-roadmap dry-run + gate-check outputs)
- Self-Check verdict: PASSED if all verification checks above pass
</output>

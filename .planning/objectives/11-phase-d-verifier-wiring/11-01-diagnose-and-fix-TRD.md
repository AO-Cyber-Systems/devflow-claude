---
objective: 11-phase-d-verifier-wiring
trd: 01
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/workflows/build.md
  - plugins/devflow/devflow/bin/df-tools.test.cjs
autonomous: true
requirements: [PHASE-D-DIAGNOSE, PHASE-D-FIX, PHASE-D-REGRESSION-TEST]
github_issue: "#29"

must_haves:
  truths:
    - "Running /devflow:build spawns the dedicated 'verifier' subagent at least once per session"
    - "build.md § 8 'Auto-Verify + Complete' contains a real Task(subagent_type=\"verifier\") block, not just display logic"
    - "Verifier spawn uses {verifier_model} from init context (honors profile)"
    - "Regression test in df-tools.test.cjs asserts the verifier spawn exists in build.md and fails if removed"
    - "Existing trampoline at build.md:167 is preserved (Phase E DOCUMENT case still valid)"
    - "Verifier idempotency (Step 0 re-verification mode) makes the build-level spawn safe even when execute-objective.md already produced a VERIFICATION.md"
  artifacts:
    - path: "plugins/devflow/devflow/workflows/build.md"
      provides: "Build orchestrator with explicit verifier spawn in § 8"
      contains: 'subagent_type="verifier"'
    - path: "plugins/devflow/devflow/bin/df-tools.test.cjs"
      provides: "Static-assert regression test for build.md verifier wiring"
      contains: "build.md spawns verifier"
  key_links:
    - from: "plugins/devflow/devflow/workflows/build.md"
      to: "plugins/devflow/agents/verifier.md"
      via: "Task(subagent_type=\"verifier\") in § 8"
      pattern: 'subagent_type="verifier"'
    - from: "plugins/devflow/devflow/bin/df-tools.test.cjs"
      to: "plugins/devflow/devflow/workflows/build.md"
      via: "fs.readFileSync + assert.match on subagent_type=\"verifier\""
      pattern: 'fs\\.readFileSync.*build\\.md'
---

<objective>
Fix the `/devflow:build` → df-verifier wiring chain so every build session spawns the dedicated verifier agent at least once, producing a `VERIFICATION.md` file. Add a regression test that fails if the wire-up is later removed.

Purpose: Issue #29 reports that build sessions are silently skipping verification. The root cause is that `build.md § 8 "Auto-Verify + Complete"` is a section header that promises verification but contains no verifier `Task()` spawn — verification is delegated to a general-purpose trampoline (build.md:167) that cannot guarantee the verify step deep inside execute-objective.md is reached. Fix: make build.md § 8 own the verifier spawn directly as a backstop. Verifier agent's Step 0 (re-verification mode) makes the spawn idempotent and safe.

Output: Updated `build.md` with explicit verifier `Task(...)` block in § 8; new regression test in `df-tools.test.cjs` asserting the spawn exists.
</objective>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern A — Canonical verifier spawn (from execute-objective.md:512-524):**

```
Task(
  prompt="Verify objective {objective_number} goal achievement.
Objective directory: {objective_dir}
Objective goal: {goal from ROADMAP.md}
Objective requirement IDs: {objective_req_ids}
Check must_haves against actual codebase.
Cross-reference requirement IDs from TRD/JOB frontmatter against REQUIREMENTS.md — every ID MUST be accounted for.
Create VERIFICATION.md.",
  subagent_type="verifier",
  model="{verifier_model}"
)
```

This is the exact shape build.md § 8 must mirror. All variables (`{objective_number}`, `{objective_dir}`, `{verifier_model}`) are already in scope from build.md § 1 Initialize.

**Pattern B — Reading status after verifier returns (from execute-objective.md:526-535):**

```bash
grep "^status:" "$OBJECTIVE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

| Status | Action |
|--------|--------|
| `passed` | → update_roadmap |
| `human_needed` | Present items for human testing |
| `gaps_found` | → auto_gap_closure |

build.md § 8 already has display branches for "If OBJECTIVE COMPLETE" and "If GAPS FOUND" — wire them off the new VERIFICATION.md status read.

**Pattern C — Existing test pattern in df-tools.test.cjs:**

```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('build.md workflow asserts', () => {
  test('build.md spawns verifier subagent in § 8 Auto-Verify', () => {
    const buildMdPath = path.join(__dirname, '..', 'workflows', 'build.md');
    const buildMd = fs.readFileSync(buildMdPath, 'utf8');
    assert.match(buildMd, /subagent_type="verifier"/,
      'build.md must spawn the dedicated verifier agent');
    assert.match(buildMd, /model="\{verifier_model\}"/,
      'verifier spawn must use {verifier_model} from init');
  });
});
```

Path resolution from `df-tools.test.cjs`:
- `__dirname` = `plugins/devflow/devflow/bin`
- `..` = `plugins/devflow/devflow`
- `..` + `workflows/build.md` = `plugins/devflow/devflow/workflows/build.md` ✓

</codebase_examples>

<anti_patterns>

**Anti-pattern 1: Removing the trampoline.** Phase E SUMMARY explicitly documents `build.md:167 — Workflow trampoline — slash command invocation` as a preserved DOCUMENT case. Do NOT remove or change `subagent_type="general-purpose"` at line 167. The fix ADDS a verifier backstop in § 8; it does not replace the trampoline.

**Anti-pattern 2: Adding the verifier spawn outside § 8.** The section header `## 8. Auto-Verify + Complete` explicitly promises verification. Putting the spawn in § 7 or in a new § 7.5 confuses the section model. The natural home is at the top of § 8.

**Anti-pattern 3: Forgetting `model="{verifier_model}"`.** All other dedicated-agent spawns in DevFlow workflows pass an explicit model parameter. Without it, the profile system can't downgrade verifier to sonnet/haiku per profile. The regression test asserts this explicitly.

**Anti-pattern 4: Re-running verifier on re-verification doesn't trigger.** Verifier Step 0 detects re-verification ONLY when `gaps:` section exists in the prior VERIFICATION.md. If execute-objective.md's spawn produced a `passed` VERIFICATION.md (no `gaps:` section), the build-level spawn re-enters initial mode. That's still safe (it produces a fresh report) but slightly more expensive. Don't try to optimize this — idempotency at the cost of a few extra seconds is the right trade.

**Anti-pattern 5: Putting the test in a new file when df-tools.test.cjs is already the home for static asserts.** The test file's existing pattern (fs.readFileSync + assert.match) is general enough to cover workflow markdown asserts. Don't fragment.

</anti_patterns>

<error_recovery>

**If the build.md edit accidentally removes section 8 display logic:** The display banners ("If OBJECTIVE COMPLETE", "If GAPS FOUND", "If execution failed") are user-visible state messaging. Restore them after the new Task block — they should fire BASED ON the VERIFICATION.md status, not before it.

**If the regression test fails because path resolution is wrong:** From `df-tools.test.cjs` (at `plugins/devflow/devflow/bin/df-tools.test.cjs`), the workflow file is at `path.join(__dirname, '..', 'workflows', 'build.md')`. Confirm by running `ls` on that resolved path before running the test.

**If `npm test` shows pre-existing failures unrelated to this change:** Check `git status` — make sure no other file was modified. The pre-Phase-D state has 1356/1356 tests passing (per Phase E SUMMARY). New count after this TRD should be 1357/1357 (one new test added).

**If the regression test asserts the wrong pattern:** The test asserts ON the literal string `subagent_type="verifier"` (with double quotes) and `model="{verifier_model}"`. If the executor uses single quotes or different formatting, BOTH the build.md edit and the test must use the same quote style. Match the existing execute-objective.md:521 style (double quotes).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/11-phase-d-verifier-wiring/11-CONTEXT.md
@.planning/objectives/11-phase-d-verifier-wiring/11-RESEARCH.md
@.planning/objectives/10-phase-e-agent-audit/10-01-SUMMARY.md
</context>

<research_context>

**Trace (from 11-RESEARCH.md):**

The build chain is: `build.md § 7 → general-purpose trampoline → execute-objective.md § verify_objective_goal → Task(subagent_type="verifier")` at line 521.

That chain is correct on paper. In practice, the trampoline subagent at build.md:167 is unreliable for reaching deep workflow steps. It receives `Run /devflow:execute-objective ${OBJECTIVE} --auto` as a prompt but has no `<execution_context>` directive. It often returns after executor agents finish (sections 1-7 of execute-objective) without reaching § verify_objective_goal.

build.md § 8 is named `## 8. Auto-Verify + Complete` but contains zero `Task(...)` spawns. It only has display logic for branches "If OBJECTIVE COMPLETE", "If GAPS FOUND", "If execution failed" — all of which assume verification already happened.

**Solution:** Add explicit verifier `Task(...)` to top of § 8. Mirror execute-objective.md:521 exactly. Verifier agent's Step 0 (re-verification mode) makes idempotent.

**Failure mode mapping (per #29):**
- (A) build delegates to execute-objective, no verify → CONFIRMED
- (B) wrong subagent_type → ruled out (execute-objective.md spawn is correct)
- (C) wired but not invoked → CONFIRMED (chain CAN invoke but is not GUARANTEED)

**Phase E preservation note:** Phase E EXPLICITLY preserved `build.md:167` as a workflow trampoline. We are NOT changing that line. We are adding a backstop in § 8.

</research_context>

<gotchas>

1. **Two spawns are fine.** If the trampoline DOES reach verify_objective_goal in execute-objective.md, the build-level spawn in § 8 just re-runs verification. Verifier Step 0 detects existing VERIFICATION.md with `gaps:` section and switches to fast regression mode. If no gaps section, it re-runs initial mode. Both are safe; both produce a valid VERIFICATION.md. The cost is a few extra seconds — well worth the guarantee.

2. **{verifier_model} is already parsed in § 1 Initialize.** Don't re-parse it. The variable is in scope throughout build.md.

3. **The verifier prompt should match execute-objective.md:514-520 exactly** so behavior is identical regardless of which spawn site fires first. Same fields: objective_number, objective_dir, objective goal from ROADMAP.md, requirement IDs.

4. **VERIFICATION.md path convention:** `${OBJECTIVE_DIR}/${OBJECTIVE_NUMBER}-VERIFICATION.md` (e.g., `.planning/objectives/11-phase-d-verifier-wiring/11-VERIFICATION.md`). The verifier agent creates it; build.md reads its `status:` frontmatter after.

5. **Section 8 ordering matters.** New verifier spawn goes FIRST. Then read VERIFICATION.md status. Then branch into existing display logic ("If OBJECTIVE COMPLETE", "If GAPS FOUND"). The auto-fix planner spawn for "If GAPS FOUND" stays as-is.

6. **DON'T break `--pause` flag handling.** Section 8 has implicit pause behavior. Make sure the verifier spawn doesn't bypass any pause logic in build.md.

7. **The test file is 2844 lines.** Append the new test at the end (or near the changelog tests at line ~2780). Don't try to insert it mid-file.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add verifier spawn to build.md § 8 Auto-Verify + Complete</name>
  <files>plugins/devflow/devflow/workflows/build.md</files>
  <action>
Add a verifier `Task(...)` block at the TOP of `## 8. Auto-Verify + Complete` (currently starts at line 174). The block must come BEFORE the existing display logic ("If OBJECTIVE COMPLETE", "If GAPS FOUND", "If execution failed").

Insert this content immediately after the section header `## 8. Auto-Verify + Complete` and the line "After execute-objective returns:":

```
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
```

KEEP all existing display branches in section 8 unchanged. They now fire BASED ON the verifier output rather than assumption.

Approach:
1. Read build.md current contents
2. Locate `## 8. Auto-Verify + Complete` (line 174)
3. Insert the new content immediately after "After execute-objective returns:" and BEFORE the first existing branch ("If OBJECTIVE COMPLETE")
4. Preserve all existing display logic verbatim — they remain valid output rendering once status is known
5. Save the file

# CRITICAL: subagent_type MUST be exactly "verifier" with double quotes — the regression test asserts on this literal string.
# CRITICAL: model parameter MUST be exactly model="{verifier_model}" — the regression test asserts this too.
# GOTCHA: All variables (${OBJECTIVE_NUMBER}, ${objective_dir}, {verifier_model}) are already in scope from § 1 Initialize. Don't re-parse them.
# GOTCHA: The trampoline at build.md:167 stays unchanged. Phase E preserved it as DOCUMENT case.
# PATTERN: Mirror execute-objective.md:512-524 exactly for the Task block contents.
  </action>
  <verify>
```bash
# Spawn site exists
grep -n 'subagent_type="verifier"' plugins/devflow/devflow/workflows/build.md

# Model parameter present
grep -n 'model="{verifier_model}"' plugins/devflow/devflow/workflows/build.md

# Trampoline at line ~167 preserved
grep -n 'subagent_type="general-purpose"' plugins/devflow/devflow/workflows/build.md

# Section 8 header still intact
grep -n '## 8. Auto-Verify + Complete' plugins/devflow/devflow/workflows/build.md
```

Expected: 1+ match for verifier spawn, 1+ match for verifier_model, 1 match for general-purpose (trampoline preserved), 1 match for section 8 header.
  </verify>
  <done>
build.md § 8 contains an explicit verifier `Task(...)` block with `subagent_type="verifier"` and `model="{verifier_model}"`. The trampoline at line 167 is unchanged. Existing display branches ("If OBJECTIVE COMPLETE", "If GAPS FOUND", "If execution failed") still present and now correctly branch off the verifier output.
  </done>
  <recovery>
If the edit corrupts the file structure: revert with `git checkout plugins/devflow/devflow/workflows/build.md`, re-read the file, then re-apply the edit using the Edit tool with smaller diffs targeting just the section 8 header and immediately following lines. Do NOT re-write the full file from scratch — too easy to lose surrounding context.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Add regression test asserting build.md verifier wiring</name>
  <files>plugins/devflow/devflow/bin/df-tools.test.cjs</files>
  <action>
Append a new `describe` block at the END of `df-tools.test.cjs` (after the existing changelog tests, around line 2844). The block contains 2-3 static-assert tests that read `build.md` and assert the verifier wire-up is present.

Required dependencies are already imported at top of file (`fs`, `path`, `node:test`, `node:assert`).

Append this content:

```javascript
// =============================================================================
// Workflow markdown static asserts (Phase D — issue #29)
// =============================================================================

describe('build.md workflow asserts (Phase D verifier wiring)', () => {
  const buildMdPath = path.join(__dirname, '..', 'workflows', 'build.md');

  test('build.md exists and is readable', () => {
    assert.ok(fs.existsSync(buildMdPath),
      `build.md not found at ${buildMdPath}`);
    const buildMd = fs.readFileSync(buildMdPath, 'utf8');
    assert.ok(buildMd.length > 0, 'build.md is empty');
  });

  test('build.md § 8 spawns dedicated verifier subagent (issue #29)', () => {
    const buildMd = fs.readFileSync(buildMdPath, 'utf8');

    // Section 8 header still present
    assert.match(buildMd, /## 8\. Auto-Verify \+ Complete/,
      'build.md must retain § 8 Auto-Verify + Complete section');

    // Verifier subagent spawn present
    assert.match(buildMd, /subagent_type="verifier"/,
      'build.md must spawn dedicated verifier agent (Phase D fix for #29)');

    // Verifier model parameter passes profile through
    assert.match(buildMd, /model="\{verifier_model\}"/,
      'verifier spawn must use {verifier_model} from § 1 Initialize parse');
  });

  test('build.md preserves trampoline (Phase E DOCUMENT case)', () => {
    const buildMd = fs.readFileSync(buildMdPath, 'utf8');

    // Trampoline still present — Phase E preserved this as legitimate
    // workflow-invocation general-purpose use
    assert.match(buildMd, /subagent_type="general-purpose"/,
      'build.md must preserve general-purpose trampoline at execute-objective invocation (Phase E DOCUMENT case)');

    // Trampoline prompt shape still matches
    assert.match(buildMd, /Run \/devflow:execute-objective/,
      'trampoline prompt must still invoke /devflow:execute-objective');
  });
});
```

# CRITICAL: Place this block at the END of the file, AFTER all existing describe blocks. Do not interleave.
# GOTCHA: __dirname inside df-tools.test.cjs resolves to `plugins/devflow/devflow/bin`. Path traversal `..` + `workflows/build.md` resolves to `plugins/devflow/devflow/workflows/build.md`. Confirm with `node -e "console.log(require('path').join(__dirname, '..', 'workflows', 'build.md'))"` if unsure.
# PATTERN: The file already has 90+ describe blocks using fs.readFileSync (e.g., for CHANGELOG.md). Reuse the same pattern style.
  </action>
  <verify>
```bash
# New tests run and pass
npm test 2>&1 | grep -E "build\.md|Phase D|verifier wiring"

# Total test count incremented
npm test 2>&1 | grep -E "tests|pass" | tail -5

# Specific test names present
grep -n "build.md spawns dedicated verifier\|build.md preserves trampoline" plugins/devflow/devflow/bin/df-tools.test.cjs
```

Expected: 3 new tests pass (`build.md exists`, `build.md § 8 spawns dedicated verifier`, `build.md preserves trampoline`). Total test count increases by 3 (e.g., 1356 → 1359).
  </verify>
  <done>
df-tools.test.cjs contains a new `describe('build.md workflow asserts (Phase D verifier wiring)', ...)` block at the end of the file with 3 tests. All 3 tests pass under `npm test`. The full test suite passes with the new test count (previous + 3).
  </done>
  <recovery>
If the new tests fail: read the actual content of build.md to confirm Task 1 landed correctly. The most common failure is quote-style mismatch — verify Task 1 uses double quotes around `verifier` and `{verifier_model}` exactly. If `npm test` reports pre-existing failures unrelated to this change, run `git status` to confirm only the two expected files are modified.

If the test path resolution fails: the assertion message includes the full resolved path. Compare against `ls plugins/devflow/devflow/workflows/build.md` from repo root to confirm the file location.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Run full test suite and capture evidence</name>
  <files>plugins/devflow/devflow/bin/df-tools.test.cjs</files>
  <action>
Run `npm test` from repo root and capture the test count.

```bash
npm test 2>&1 | tee /tmp/phase-d-test-output.txt | tail -30
```

Record:
1. Total test count (look for `tests N` summary line)
2. Pass count (look for `pass N`)
3. The 3 new tests under `build.md workflow asserts (Phase D verifier wiring)` all show PASS
4. No new failures introduced

Compare against pre-change baseline: Phase E SUMMARY recorded 1356/1356 tests pass. Post-change should be 1359/1359 (or whatever the current count + 3 is).

Update SUMMARY.md (created at end of TRD execution) with:
- Final test count
- Confirmation that the 3 new tests pass
- Grep evidence from build.md showing verifier spawn site present

# CRITICAL: If ANY existing test fails (regression), do NOT mark this task done. Investigate root cause. The change is purely additive (new spawn block + new tests) — there should be zero impact on existing tests.
# GOTCHA: `npm test` runs the full glob pattern `plugins/devflow/**/*.test.cjs`. Hook tests may run too — those should also pass unchanged.
  </action>
  <verify>
```bash
# Full suite passes
npm test 2>&1 | grep -E "^# pass|^# fail" | head -5

# New tests specifically pass
npm test 2>&1 | grep "Phase D verifier wiring"
```

Expected: zero failures. The 3 new tests appear in the output as passing.
  </verify>
  <done>
`npm test` exits 0 with all tests passing. Test count is increased by exactly 3 (the new Phase D regression tests). SUMMARY.md captures the final test count and pass evidence.
  </done>
  <recovery>
If a non-Phase-D test fails after this change: revert Task 1's build.md edit and re-run `npm test`. If the failure persists, the issue is pre-existing — note in SUMMARY.md and proceed. If the failure DISAPPEARS after revert, the build.md edit somehow broke a parser test (very unlikely — workflows are markdown, not parsed by tests). In that case, re-apply Task 1 with smaller diffs and re-run.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>

**Mechanical greps (deterministic):**
1. `grep -c 'subagent_type="verifier"' plugins/devflow/devflow/workflows/build.md` returns ≥1
2. `grep -c 'model="{verifier_model}"' plugins/devflow/devflow/workflows/build.md` returns ≥1
3. `grep -c 'subagent_type="general-purpose"' plugins/devflow/devflow/workflows/build.md` returns 1 (trampoline preserved)
4. `grep -c "build.md spawns dedicated verifier" plugins/devflow/devflow/bin/df-tools.test.cjs` returns 1

**Test suite:**
5. `npm test` exits 0
6. Test count = previous count + 3

**Goal verification (issue #29 acceptance):**
7. The change makes it MECHANICALLY IMPOSSIBLE for build.md to drop the verifier spawn without the regression test failing.
8. Next `/devflow:build` session will spawn `df-verifier` ≥1 time (the build-level spawn at § 8 is unconditional).

</verification>

<success_criteria>

- [ ] build.md § 8 contains explicit `Task(subagent_type="verifier", model="{verifier_model}")` block
- [ ] Trampoline at build.md:167 unchanged (Phase E DOCUMENT case preserved)
- [ ] df-tools.test.cjs contains 3 new tests asserting build.md verifier wiring
- [ ] All 3 new tests pass
- [ ] No existing tests regressed
- [ ] Total test count increased by exactly 3
- [ ] SUMMARY.md documents the final test count, grep evidence, and confirms all 3 must-have truths

</success_criteria>

<output>
After completion, create `.planning/objectives/11-phase-d-verifier-wiring/11-01-SUMMARY.md` documenting:
- Files modified (build.md + df-tools.test.cjs)
- Final test count vs baseline
- Grep output proving verifier spawn present
- Atomic commit hashes (one per task, or one combined per executor's commit-cadence judgment)
- Confirmation that issue #29 acceptance criterion ("next /devflow:build session spawns df-verifier ≥1 time") is structurally guaranteed by the spawn site existence
</output>

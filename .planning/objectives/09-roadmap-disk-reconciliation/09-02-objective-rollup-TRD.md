---
objective: 09-roadmap-disk-reconciliation
trd: 09-02
type: tdd
confidence: high
wave: 2
depends_on:
  - 09-01
files_modified:
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
autonomous: true
requirements:
  - SC-4
must_haves:
  truths:
    - "When ALL TRDs in an objective are [x], _rollupObjectiveStatus updates the objective's '**Status:** in flight' line to '**Status:** complete YYYY-MM-DD'"
    - "When NOT all TRDs are [x], the Status line is left alone"
    - "When the Status line already says 'complete' (any date), no rewrite happens (idempotent)"
    - "When a Progress markdown table exists with a row matching 'Objective N', that row's status cell is updated"
    - "When no Progress table exists, rollup skips silently (no warning, no error)"
    - "Rollup runs AFTER the rule loop in reconcile, so a final-TRD flip in the same run triggers rollup"
    - "Rollup emits change entries with kind: 'objective_rollup_status' and 'objective_rollup_progress' (per row mutated)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs"
      provides: "_rollupObjectiveStatus helper + reconcile integration"
      contains: "_rollupObjectiveStatus"
    - path: "plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs"
      provides: "Test groups RU (rollup), RUI (rollup integration via reconcile)"
      contains: "_rollupObjectiveStatus"
  key_links:
    - from: "lib/roadmap-reconcile.cjs::reconcile"
      to: "lib/roadmap-reconcile.cjs::_rollupObjectiveStatus"
      via: "called after rule loop, BEFORE _writeReconciledRoadmap"
      pattern: "_rollupObjectiveStatus\\("
    - from: "_rollupObjectiveStatus"
      to: "the parsed line array"
      via: "in-place line replacement for Status line + Progress table cells"
      pattern: "lines\\[.*\\]\\s*="
---

<objective>
Add **objective-level rollup** atop the 09-01 reconciler engine. When ALL TRDs under `### Objective N: ...` are `[x]` (after the rule loop), update the objective's `**Status:**` line to `complete YYYY-MM-DD` and (if present) update the Progress table row.

Modifies `reconcile` to call `_rollupObjectiveStatus` after the rule loop, before the atomic write.

Purpose: SC-4 (objective-level rollup — Status line + Progress table).
Output: `_rollupObjectiveStatus` helper + integration into `reconcile` + new test groups.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── roadmap-reconcile.cjs                ← MODIFY (add _rollupObjectiveStatus + integrate)
├── roadmap-reconcile.test.cjs           ← MODIFY (add RU/RUI test groups)
└── __fixtures__/
    └── awareness-fixtures.cjs           ← MODIFY (extend buildReconcileFixtures with progress_table opt)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**ROADMAP.md objective section format (verbatim from this repo):**

```markdown
### Objective 5: Initiative context layer

**Goal:** Project GitHub Epics ...

**Tracks:** devflow-claude#14 (sub-issue of #9 [Roadmap]). Independent of obj 2-4...

**Inputs (research complete):**
- ...

**Locked decisions:**
1. ...

**Success Criteria:**
1. ...

**Out of scope (v1.1 — explicit):**
- ...

**TRDs:** 5 plans across 5 waves
- [ ] 05-01-reader-and-fixtures-TRD.md — ...
- [ ] 05-02-writer-sync-TRD.md — ...
```

This repo's ROADMAP currently does NOT carry a `**Status:** in flight` line on every objective (some have it embedded in narrative prose). For the rollup, accept either:
- Explicit `**Status:** ...` line within objective section
- Implicit (no Status line at all) → rollup ADDS one when all TRDs are `[x]`

**`_rollupObjectiveStatus` shape (locked):**

```js
function _rollupObjectiveStatus(lines, today) {
  // today: 'YYYY-MM-DD' — injected for testability (default: new Date().toISOString().slice(0, 10))
  const result = { lines, changes: [] };

  // 1. Walk lines, find each '### Objective N: ...' block boundaries
  const objSections = _findObjectiveSections(lines);

  for (const section of objSections) {
    // section: { num, startLine, endLine, statusLineIdx (or -1), trdCheckboxLines: [{idx, checked}] }
    if (section.trdCheckboxLines.length === 0) continue;
    const allChecked = section.trdCheckboxLines.every(t => t.checked);
    if (!allChecked) continue;

    // 2. Status line update
    if (section.statusLineIdx >= 0) {
      const cur = lines[section.statusLineIdx];
      const completeMatch = cur.match(/\*\*Status:\*\*\s+complete\b/i);
      if (!completeMatch) {
        const before = cur;
        const after = `**Status:** complete ${today}`;
        lines[section.statusLineIdx] = after;
        result.changes.push({
          kind: 'objective_rollup_status',
          objective_num: section.num,
          before,
          after,
        });
      }
    }
    // 3. Progress table — find '## Progress' section, look for row matching `| Objective N`
    // Implementation in _updateProgressTable helper
    const progressUpdate = _updateProgressTable(lines, section.num, today);
    if (progressUpdate) result.changes.push(progressUpdate);
  }

  return result;
}
```

**Status line regex (locked):**

```js
// Match: '**Status:** in flight' or '**Status:** Objective 0 formalized 2026-...' (top-level milestone)
// We only match within a `### Objective N:` section — top-level milestone status is OUT OF SCOPE.
const STATUS_LINE_RE = /^\*\*Status:\*\*\s+(.+?)$/;
const STATUS_COMPLETE_RE = /^\*\*Status:\*\*\s+complete\b/i;
```

**Progress table detection (locked — best-effort):**

```js
function _updateProgressTable(lines, objectiveNum, today) {
  // Find '## Progress' header
  const headerIdx = lines.findIndex(l => /^## Progress\b/.test(l));
  if (headerIdx < 0) return null;
  // Walk forward looking for a markdown table row with 'Objective N' or `| <N> |` pattern
  for (let i = headerIdx; i < lines.length && !/^## /.test(lines[i].slice(headerIdx === i ? 100 : 0)); i++) {
    const line = lines[i];
    // Match table row: starts with '|', contains 'Objective N' or '| N ' as cell
    const objMatch = line.match(new RegExp(`^\\s*\\|\\s*(Objective\\s+${objectiveNum}|${objectiveNum})\\s*\\|`, 'i'));
    if (!objMatch) continue;
    // Replace status cell — table row has cells separated by '|'
    // Heuristic: last data cell before trailing '|' is the status cell
    const cells = line.split('|');
    if (cells.length < 4) continue; // not a real table row
    const before = line;
    // Update last non-empty cell with 'complete YYYY-MM-DD'
    let updated = false;
    for (let c = cells.length - 2; c > 0; c--) {
      const cellText = cells[c].trim();
      if (cellText.length === 0) continue;
      // Skip if already 'complete'
      if (/^complete\b/i.test(cellText)) return null;
      cells[c] = ` complete ${today} `;
      updated = true;
      break;
    }
    if (!updated) continue;
    const after = cells.join('|');
    lines[i] = after;
    return {
      kind: 'objective_rollup_progress',
      objective_num: objectiveNum,
      before,
      after,
    };
  }
  return null;
}
```

# CRITICAL: The progress table detector is BEST-EFFORT. This repo's ROADMAP doesn't currently have one. Tests must use a fixture that explicitly synthesizes the `## Progress` section. RU5 test exercises this; RU6 asserts no-op when section absent.
# GOTCHA: Don't replace the status cell if it already says 'complete' — short-circuit early to preserve idempotency.
# PATTERN: Table cell mutation is fragile (markdown alignment matters); the heuristic targets the last non-empty cell before the trailing pipe. If the table has alignment whitespace, it's preserved by leaving the cell padding `' complete YYYY-MM-DD '`.

**`_findObjectiveSections` shape:**

```js
function _findObjectiveSections(lines) {
  const sections = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const objHeader = line.match(/^### Objective (\d+):/);
    if (objHeader) {
      if (current) {
        current.endLine = i - 1;
        sections.push(current);
      }
      current = {
        num: objHeader[1],
        startLine: i,
        endLine: -1,
        statusLineIdx: -1,
        trdCheckboxLines: [],
      };
      continue;
    }
    if (current) {
      // Status line — only the FIRST status line in the section counts
      if (current.statusLineIdx === -1 && /^\*\*Status:\*\*/.test(line)) {
        current.statusLineIdx = i;
      }
      // TRD checkbox line
      const trdMatch = line.match(/^\s*- \[([x ])\] (\d+-\d+)-[^.\s]+-TRD\.md/);
      if (trdMatch) {
        current.trdCheckboxLines.push({ idx: i, checked: trdMatch[1] === 'x' });
      }
    }
  }
  if (current) {
    current.endLine = lines.length - 1;
    sections.push(current);
  }
  return sections;
}
```

**Wiring into `reconcile`:**

```js
function reconcile({ projectRoot, mode = 'write', today } = {}) {
  // ... existing 09-01 logic that produces `lines` array and `result` ...

  // TRD 09-02: rollup
  const todayStr = today || new Date().toISOString().slice(0, 10);
  const rollup = _rollupObjectiveStatus(lines, todayStr);
  for (const change of rollup.changes) {
    change.path = roadmapPath;
    result.changes.push(change);
  }

  if (mode === 'write' && result.changes.length > 0) {
    _writeReconciledRoadmap(projectRoot, lines.join('\n'));
  }

  return result;
}
```

# CRITICAL: `_rollupObjectiveStatus` mutates the `lines` array IN PLACE for efficiency. Document this contract in JSDoc. Tests should construct lines as a fresh array per case to avoid cross-test contamination.
# GOTCHA: The `today` parameter is INJECTED for testability — tests pass a fixed date like `'2026-05-04'`; production passes nothing and falls back to `new Date()`. Without injection, RU tests would be non-deterministic.
</codebase_examples>

<anti_patterns>
- **Don't add a YAML or markdown table parser.** The Status line is regex; the Progress table is regex-row + cell-split. Markdown is a tree but for THIS use case, line-level mutation is sufficient.
- **Don't auto-create Progress sections.** If `## Progress` doesn't exist, the rollup skips silently. Locked per CONTEXT.md decision #3 (Progress table is OPTIONAL).
- **Don't update top-level `## Milestone v1.1 — ... (in flight)` line.** That's milestone-level rollup, which is OUT OF SCOPE for v1.1 (CONTEXT.md OOS).
- **Don't trigger rollup mid-reconcile.** Rollup runs ONCE after the full rule loop, so all checkbox flips are settled.
</anti_patterns>

<error_recovery>
- **Status line absent in objective section:** Don't add one. Skip silently. Test RU3 asserts: objective with all `[x]` but no `**Status:**` line → no rollup change emitted, no error.
- **Multiple `**Status:**` lines in objective section (malformed):** Use FIRST occurrence only (per `_findObjectiveSections` logic). Subsequent lines untouched.
- **Progress table malformed (non-pipe lines mixed in):** The detector falls back to skipping cells without 4+ pipes. Test RU6 asserts: malformed table → no error, no change emitted.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/09-roadmap-disk-reconciliation/09-CONTEXT.md
@.planning/objectives/09-roadmap-disk-reconciliation/09-01-reconciler-engine-and-fixtures-SUMMARY.md
</context>

<gotchas>
- **`today` injection:** Tests MUST pass `today: '2026-05-04'` (or any deterministic string) to `reconcile` and `_rollupObjectiveStatus` — production code defaults to `new Date().toISOString().slice(0, 10)`. Without injection, tests are flaky across midnight.
- **Idempotency for rollup:** Running reconcile twice on an already-rolled-up ROADMAP must produce zero rollup changes. RU2 asserts: input has `**Status:** complete 2026-05-04` and all `[x]` → rollup emits NO change for that objective.
- **Mixed objective state:** ROADMAP has obj 5 (all `[x]`) and obj 6 (mixed) — rollup updates obj 5's Status line and leaves obj 6 alone. RU4 asserts this.
- **Recovered objective edge case:** A previously-complete objective whose Status line was `complete 2026-04-01` and now has a TRD that became `[ ] (failed)` — locked decision: do NOT auto-revert the Status line. Rollup is FORWARD-ONLY (in-flight → complete). Reverting requires manual user intervention. Document in SUMMARY.
- **`_findObjectiveSections` precedence:** When the same objective number appears under multiple `### Objective N:` headers (very rare; would be a malformed roadmap), the LAST section wins (current variable replacement). Document but don't test — out-of-scope edge case.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Test list + RED tests for rollup</name>
  <files>
    plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  </files>
  <action>
Append rollup test list + RED tests to existing `roadmap-reconcile.test.cjs`. Extend `buildReconcileFixtures` to optionally include a Progress table.

**Test list (append to existing top-of-file comment block):**

```
TEST LIST — TRD 09-02 objective-level rollup
============================================

Group RU (_rollupObjectiveStatus pure logic):
- RU1: ALL [x] + status='in flight' → flips status line to 'complete 2026-05-04', emits objective_rollup_status change
- RU2: ALL [x] + status='complete 2026-04-01' → no change (idempotent)
- RU3: ALL [x] + NO status line in section → no change emitted, no error
- RU4: MIXED [x]/[ ] across multiple objectives → only the all-[x] obj is rolled up
- RU5: ALL [x] + Progress table row exists → row's status cell updated to 'complete 2026-05-04', emits objective_rollup_progress
- RU6: ALL [x] + malformed Progress table (3-cell row) → skipped silently
- RU7: NOT all [x] (one [ ]) → no rollup change
- RU8: TRD checkboxes empty → no rollup change

Group RUI (rollup integration via reconcile):
- RUI1: reconcile flips final TRD [ ] → [x] AND triggers rollup in same run (changes contains both kinds)
- RUI2: reconcile dry-run mode + ALL [x] → emits rollup change but does NOT write ROADMAP.md
- RUI3: reconcile write-mode + rollup → ROADMAP.md on disk has updated Status line
- RUI4: idempotency — second reconcile run on rolled-up roadmap returns changes=[]
- RUI5: 'today' parameter forwarded from reconcile → _rollupObjectiveStatus
```

**Extend `buildReconcileFixtures`:**

Add option `objectives[].progress_table_row: { status }` and `progress_table: bool` (when true, generates a `## Progress` section with a markdown table containing one row per objective). Existing fixtures using only the basic shape continue to work (back-compat).

```js
// In awareness-fixtures.cjs::buildReconcileFixtures opts:
//   { objectives: [...], milestone_status: 'in flight', progress_table: false, today: undefined }
// When progress_table=true, append a '## Progress' section after objective sections:
//
//   ## Progress
//
//   | Objective | Title | Status |
//   | --- | --- | --- |
//   | 1 | Foo | in flight |
//   | 2 | Bar | in flight |
```

**Implement RU + RUI test groups using fixtures.** All RU tests should fail at this point (RED) — `_rollupObjectiveStatus` doesn't exist yet. RUI tests fail because `reconcile` doesn't call rollup yet.

# CRITICAL: All tests pass `today: '2026-05-04'` for determinism. Default-clock branch (no `today` arg) is exercised by ONE test: RUI5 with a Date-spy.
# GOTCHA: When extending `buildReconcileFixtures`, preserve existing F1-F4 test behavior. Add new options as DEFAULT-OFF.

Commit: `test(09-02): add failing tests for objective-level rollup`.
  </action>
  <verify>
`npm test` shows new RU + RUI tests FAILING (red). Existing 09-01 tests still pass. Existing fixture tests F1-F4 still pass (back-compat).
  </verify>
  <done>
Test list comment block extended with RU + RUI groups. ~13 new tests implemented and FAILING. `buildReconcileFixtures` extended with `progress_table` option. Single commit `test(09-02): ...`.
  </done>
  <recovery>
If extending `buildReconcileFixtures` regresses F1-F4, isolate the new options behind a default-off branch — existing callers pass no new options and get identical output. Verify by running ONLY F1-F4 first: `node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs --test-name-pattern '^F'`.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement _rollupObjectiveStatus + integrate into reconcile</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs</files>
  <action>
Add the `_rollupObjectiveStatus` region to `lib/roadmap-reconcile.cjs` (between TRD 09-01 helpers and `module.exports`). Modify `reconcile` to call it after the rule loop.

**Implementation steps:**

1. Add `_findObjectiveSections(lines)` helper per embedded skeleton.
2. Add `_updateProgressTable(lines, objectiveNum, today)` helper per embedded skeleton.
3. Add `_rollupObjectiveStatus(lines, today)` orchestrator per embedded skeleton.
4. Modify `reconcile({ projectRoot, mode, today })` signature to accept `today` parameter.
5. Inside `reconcile`, after the rule loop, before `_writeReconciledRoadmap`:
   ```js
   const todayStr = today || new Date().toISOString().slice(0, 10);
   const rollup = _rollupObjectiveStatus(lines, todayStr);
   for (const change of rollup.changes) {
     change.path = roadmapPath;
     result.changes.push(change);
   }
   ```
6. Update `module.exports` to include `_rollupObjectiveStatus` (keep TRD 09-03 banner-lock for the final pass, but ensure the test can require it now).

**Implementation rules:**

- Run `npm test` after each helper. Iterate until ALL RU + RUI tests GREEN.
- Existing 09-01 tests must remain green.
- Don't break F1-F4 fixture tests (they ran with progress_table off; new tests run with progress_table on).

# CRITICAL: After GREEN, do NOT refactor logic — just verify tests pass and commit `feat(09-02): implement objective-level rollup`.
# GOTCHA: The Progress table cell-split heuristic is fragile. If RU5 fails because cells include trailing whitespace or non-breaking-space variants, test the EXACT fixture output and adjust the cell-find loop. Don't relax the test.
# PATTERN: Mirror obj 5 TRD 05-03 wave-2-extends-wave-1 module pattern (add region, integrate, advance).
  </action>
  <verify>
`npm test` shows ALL RU + RUI tests GREEN. Existing 09-01 R-group + F-group tests remain green. Total test count up by ~13.
  </verify>
  <done>
`lib/roadmap-reconcile.cjs` has `_rollupObjectiveStatus` + 2 sub-helpers (~80 lines added). `reconcile` accepts and forwards `today`. All ~13 new tests GREEN. Single commit `feat(09-02): implement objective-level rollup`.
  </done>
  <recovery>
If RU5 (Progress table cell update) keeps failing, check that the fixture-emitted table has exactly the alignment your code expects. Test by adding `console.log(JSON.stringify(line))` to dump the raw line including hidden chars; remove logging before commit.

If RUI integration tests fail because `today` doesn't propagate, ensure `reconcile` signature is `({ projectRoot, mode = 'write', today } = {})` (note: not destructured with default `today = ...` — default is computed inside the function so test injection takes precedence).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `_rollupObjectiveStatus(lines, today)` exported and tested in isolation (RU group).
2. `reconcile({ projectRoot, mode, today })` integrates rollup — same-run rule + rollup chain works (RUI1).
3. Idempotency holds across rule + rollup combination (RUI4).
4. Progress table update works when present, no-op when absent (RU5/RU6).
5. `today` parameter injectable for deterministic tests; default to UTC date string.
6. No regression in 09-01 baseline. Total test count increases by ~13.
7. Two commits: `test(09-02): ...` and `feat(09-02): ...`.
</verification>

<success_criteria>
- [ ] SC-4 satisfied: Status line + Progress table updated when ALL TRDs are `[x]`
- [ ] Idempotency proven by RUI4 (second run on rolled-up roadmap = changes:[])
- [ ] All tests GREEN; no regression
- [ ] Test list at top of test file extended with RU + RUI groups
- [ ] Hand-built fixture extension (no LLM-generated table data); `today` injected for determinism
- [ ] Commits follow `test:` → `feat:` cadence
</success_criteria>

<output>
After completion, create `.planning/objectives/09-roadmap-disk-reconciliation/09-02-objective-rollup-SUMMARY.md`. Record:

- Test count delta
- Commits (test/feat with hashes)
- Any deviations from locked design
- Note that 09-03 will lock module.exports + add CLI/skill/integration
</output>

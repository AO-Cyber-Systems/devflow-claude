---
objective: 09-roadmap-disk-reconciliation
trd: 09-01
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
autonomous: true
requirements:
  - SC-1
  - SC-2
  - SC-3
must_haves:
  truths:
    - "reconcile({ projectRoot, mode: 'write' }) returns { changes: [], warnings: [] } when ROADMAP matches disk truth (no drift)"
    - "reconcile flips '[ ] 01-01-foo-TRD.md' → '[x] 01-01-foo-TRD.md' when 01-01-foo-SUMMARY.md exists"
    - "reconcile flips '[x] 01-01-foo-TRD.md' → '[ ] 01-01-foo-TRD.md (failed)' when SUMMARY contains 'Self-Check: FAILED'"
    - "reconcile leaves '[ ] 01-99-orphan-TRD.md' unchanged when no TRD/SUMMARY file exists, but emits a trd_orphan_warning"
    - "reconcile mode='dry-run' returns changes[] without writing ROADMAP.md to disk"
    - "reconcile mode='write' atomically rewrites ROADMAP.md via tmp + rename"
    - "Re-running reconcile after a write produces zero changes (idempotency)"
    - "_checkSummaryFailed returns true for both '## Self-Check: FAILED' single-line and '## Self-Check\\n...FAILED...' section formats"
    - "_walkTrdLines parses ROADMAP.md and returns [{ objective_num, trd_id, line_index, checked, has_failed_annotation }] for every TRD checkbox line"
    - "buildReconcileFixtures({ objectives: [...] }) builds a tmpdir tree with .planning/ROADMAP.md + .planning/objectives/<n>/<id>-{TRD,SUMMARY}.md per spec"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs"
      provides: "Reconciler engine + 3 rule helpers + atomic writer + injection hooks"
      contains: "function reconcile"
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs"
      provides: "Test groups R/CSE/CSF/WTL/WR/F (reconcile, _checkSummaryExists, _checkSummaryFailed, _walkTrdLines, _writeReconciledRoadmap, fixtures)"
      contains: "buildReconcileFixtures"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"
      provides: "buildReconcileFixtures factory"
      contains: "buildReconcileFixtures"
  key_links:
    - from: "lib/roadmap-reconcile.cjs::reconcile"
      to: "lib/roadmap-reconcile.cjs::_walkTrdLines"
      via: "extracts checkbox lines from ROADMAP.md"
      pattern: "_walkTrdLines\\("
    - from: "lib/roadmap-reconcile.cjs::reconcile"
      to: "lib/roadmap-reconcile.cjs::_checkSummaryExists"
      via: "rule 1: trd_summary_exists"
      pattern: "_checkSummaryExists\\("
    - from: "lib/roadmap-reconcile.cjs::reconcile"
      to: "lib/roadmap-reconcile.cjs::_checkSummaryFailed"
      via: "rule 2: trd_summary_failed"
      pattern: "_checkSummaryFailed\\("
    - from: "lib/roadmap-reconcile.cjs::reconcile (mode=write)"
      to: "lib/roadmap-reconcile.cjs::_writeReconciledRoadmap"
      via: "atomic tmp + rename"
      pattern: "_writeReconciledRoadmap\\("
    - from: "lib/roadmap-reconcile.cjs::_writeReconciledRoadmap"
      to: "fs.renameSync (via _runFs)"
      via: "atomic write"
      pattern: "renameSync"
---

<objective>
Implement the pure-logic core of `lib/roadmap-reconcile.cjs`: parser (`_walkTrdLines`), rule helpers (`_checkSummaryExists`, `_checkSummaryFailed`), atomic writer (`_writeReconciledRoadmap`), and the main `reconcile({ projectRoot, mode })` orchestrator. Plus the `buildReconcileFixtures` factory in the shared fixtures module.

This TRD is the **reconciliation engine**. CLI/skill/integration are deferred to 09-03. Objective-level rollup is deferred to 09-02.

Purpose: SC-1 (rule kinds + return shape), SC-2 (three rule kinds enforced), SC-3 (atomic write + idempotency).
Output: Pure-logic engine + fixture factory + 6 test groups.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── roadmap-reconcile.cjs                ← CREATE (engine + rule helpers + injection hooks)
├── roadmap-reconcile.test.cjs           ← CREATE (test groups R/CSE/CSF/WTL/WR/F)
└── __fixtures__/
    └── awareness-fixtures.cjs           ← MODIFY (add buildReconcileFixtures factory)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Atomic tmp + rename (from `lib/initiatives.cjs::_writeInitiativeFile`, TRD 05-02):**

```js
function _writeInitiativeFile(home, data, opts) {
  if (opts === undefined) opts = {};
  if (!_runFs.existsSync(home)) {
    _runFs.mkdirSync(home, { recursive: true });
  }
  const slug = data.slug;
  const dest = path.join(home, `${slug}.md`);
  const tmpSuffix = opts._tmpSuffix || `tmp.${process.pid}`;
  const tmpPath = path.join(home, `.${slug}.md.${tmpSuffix}`);
  const content = _renderInitiativeMarkdown(data);
  _runFs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    _runFs.renameSync(tmpPath, dest);
  } catch (e) {
    try { _runFs.unlinkSync(tmpPath); } catch {}
    throw e;
  }
  return { slug, path: dest };
}
```

Mirror this exact shape for `_writeReconciledRoadmap(projectRoot, content)`. The dest is `<projectRoot>/.planning/ROADMAP.md`; the tmp is `<projectRoot>/.planning/.ROADMAP.md.tmp.<pid>`.

**Injection hooks (from `lib/initiatives.cjs:47-64`, TRD 05-01):**

```js
const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
};
realFs.writeFileSync = (p, data, opts) => fs.writeFileSync(p, data, opts);
realFs.mkdirSync = (p, opts) => fs.mkdirSync(p, opts);
realFs.renameSync = (oldP, newP) => fs.renameSync(oldP, newP);
realFs.unlinkSync = (p) => fs.unlinkSync(p);

let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }
```

Mirror exactly. All production fs reads/writes route through `_runFs.X()` — never `fs.X()` directly.

**Fixture builder pattern (from `lib/__fixtures__/awareness-fixtures.cjs::buildSiblingRepoTree`, TRD 03-01):**

The shared fixtures module already exports many factory functions. Add `buildReconcileFixtures` as a peer:

```js
function buildReconcileFixtures({ objectives = [], milestone_status = 'in flight' } = {}) {
  const tmpdir = path.join(os.tmpdir(), `reconcile-fixture-${process.pid}-${Date.now()}`);
  fs.mkdirSync(path.join(tmpdir, '.planning', 'objectives'), { recursive: true });

  const trdLines = [];
  for (const obj of objectives) {
    const objDir = path.join(tmpdir, '.planning', 'objectives', `${obj.num}-${obj.slug || 'foo'}`);
    fs.mkdirSync(objDir, { recursive: true });
    for (const trd of obj.trds) {
      const trdPath = path.join(objDir, `${trd.id}-TRD.md`);
      fs.writeFileSync(trdPath, `---\nobjective: ${obj.num}\ntrd: ${trd.id}\n---\n# TRD ${trd.id}\n`);
      const summaryPath = path.join(objDir, `${trd.id}-SUMMARY.md`);
      if (trd.summary === 'present') {
        fs.writeFileSync(summaryPath, `# Summary ${trd.id}\n\n## Self-Check: PASSED\n`);
      } else if (trd.summary === 'failed') {
        fs.writeFileSync(summaryPath, `# Summary ${trd.id}\n\n## Self-Check: FAILED\n\n- foo: missing\n`);
      } else if (trd.summary === 'failed-section') {
        fs.writeFileSync(summaryPath, `# Summary ${trd.id}\n\n## Self-Check\n\n- foo: FAILED\n- bar: PASSED\n`);
      }
      // else 'missing' or undefined → no SUMMARY file written
      const checkboxState = trd.initial_checkbox || ' '; // ' ' or 'x'
      const annotation = trd.initial_annotation ? ` ${trd.initial_annotation}` : '';
      trdLines.push(`- [${checkboxState}] ${trd.id}-TRD.md — ${trd.desc || 'desc'}${annotation}`);
    }
  }

  const roadmap = [
    `## Milestone v1.1 — Test (${milestone_status})`,
    '',
    ...objectives.map(obj => [
      `### Objective ${obj.num}: ${obj.title || 'Test obj'}`,
      '',
      `**Status:** ${obj.status || milestone_status}`,
      '',
      `**TRDs:** ${obj.trds.length} plans`,
      '',
      ...obj.trds.map(t => {
        const checkboxState = t.initial_checkbox || ' ';
        const annotation = t.initial_annotation ? ` ${t.initial_annotation}` : '';
        return `- [${checkboxState}] ${t.id}-TRD.md — ${t.desc || 'desc'}${annotation}`;
      }),
      '',
    ].join('\n')),
  ].join('\n');

  fs.writeFileSync(path.join(tmpdir, '.planning', 'ROADMAP.md'), roadmap);

  return {
    projectRoot: tmpdir,
    cleanup: () => fs.rmSync(tmpdir, { recursive: true, force: true }),
  };
}
```

Adjust as needed; the exact shape is up to the executor as long as it produces a tmpdir tree with `.planning/ROADMAP.md` + per-objective TRD/SUMMARY files matching the requested options.

**`_walkTrdLines` parsing strategy (locked):**

```js
function _walkTrdLines(roadmapContent) {
  const lines = roadmapContent.split('\n');
  const result = [];
  let currentObjectiveNum = null;
  // Match TRD checkbox lines: '- [ ] 01-01-foo-TRD.md — desc' or '- [x] 09-03-bar-TRD.md — desc (failed)'
  // TRD ID pattern: NN-NN (objective-trd, hyphen-separated)
  const objectiveRe = /^### Objective (\d+):/;
  const trdLineRe = /^(\s*)- \[([x ])\] ((\d+-\d+)-[^.\s]+-TRD\.md)\s+—\s+(.+?)(\s+\(failed\))?\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const objMatch = line.match(objectiveRe);
    if (objMatch) {
      currentObjectiveNum = objMatch[1];
      continue;
    }
    const trdMatch = line.match(trdLineRe);
    if (trdMatch && currentObjectiveNum) {
      result.push({
        objective_num: currentObjectiveNum,
        trd_id: trdMatch[4],            // 'NN-NN'
        trd_filename: trdMatch[3],       // '01-01-foo-TRD.md'
        line_index: i,
        line: line,
        indent: trdMatch[1] || '',
        checked: trdMatch[2] === 'x',
        description: trdMatch[5],
        has_failed_annotation: !!trdMatch[6],
      });
    }
  }
  return result;
}
```

# CRITICAL: TRD ID extraction must use the `NN-NN` prefix from filename, NOT just digits — '01-01-foo-TRD.md' → trd_id='01-01'. Used by `_checkSummaryExists` to find `01-01-*-SUMMARY.md` glob.
# GOTCHA: Some objectives in this repo's ROADMAP have the TRD list embedded inline in the objective body section (after the **TRDs:** line). Don't restrict to a `## TRDs` heading — walk every line in the objective section and match the regex.
# PATTERN: Mirror obj 5 TRD 05-01 `_extractSection` style — split on heading boundaries, match within section.

**`_checkSummaryFailed` (locked detection logic):**

```js
function _checkSummaryFailed(summaryContent) {
  if (typeof summaryContent !== 'string') return false;
  // Single-line: '## Self-Check: PASSED' or '## Self-Check: FAILED'
  const single = summaryContent.match(/^## Self-Check:\s+(PASSED|FAILED)\b/m);
  if (single) return single[1] === 'FAILED';
  // Section: '## Self-Check' header + body
  const sectionStart = summaryContent.match(/^## Self-Check\s*$/m);
  if (sectionStart) {
    const after = summaryContent.slice(sectionStart.index);
    // Section body = until next ## or end
    const bodyMatch = after.match(/^## Self-Check\s*\n([\s\S]*?)(?=^## |$)/m);
    if (bodyMatch && /\bFAILED\b/.test(bodyMatch[1])) return true;
  }
  return false; // no Self-Check section → assume PASSED (defensive)
}
```

# CRITICAL: The `\b` boundary on FAILED prevents matching 'FAILEDISH' or token-substring false positives.
</codebase_examples>

<anti_patterns>
- **Don't use `JSON.stringify(roadmap)` or any YAML library** — ROADMAP.md is plain markdown. Mutation is regex match-and-replace on individual lines, with the rest of the file preserved verbatim.
- **Don't mutate `_runFs` outside `_setRunFs` / `_resetMocks`.** All production code routes through `_runFs.X()`. Tests inject via `_setRunFs(mock)` and clean up via `_resetMocks()` in `afterEach`.
- **Don't write SUMMARY parser as a state machine.** It's a 2-pattern regex check — keep it ≤ 10 lines.
- **Don't read SUMMARY.md content if `_checkSummaryExists` returned false.** Short-circuit: rule 2 (`trd_summary_failed`) only runs after rule 1 confirms presence.
</anti_patterns>

<error_recovery>
- **Tmp file leftover after rename failure:** `_writeReconciledRoadmap` cleans up via `try { unlinkSync(tmp); } catch {}`. Test WR3 asserts: simulate rename throw → tmp file does NOT exist after the throw propagates.
- **ROADMAP.md missing entirely:** `reconcile` returns `{ changes: [], warnings: [{ kind: 'roadmap_missing', path }] }`. Don't throw — graceful empty result.
- **TRD line regex doesn't match:** Skip silently. The reconciler is conservative — if it can't parse a line, leave it alone. Test WTL5 asserts: a non-conforming line `- some other bullet` is unchanged in output.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/09-roadmap-disk-reconciliation/09-CONTEXT.md
@.planning/objectives/09-roadmap-disk-reconciliation/09-RESEARCH.md
@plugins/devflow/devflow/bin/lib/initiatives.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
</context>

<gotchas>
- **Self-Check format polymorphism:** Two formats observed (`## Self-Check: PASSED` single-line vs `## Self-Check\n...body...` section). Both must be handled by `_checkSummaryFailed`. Test cases CSF1 (PASSED single), CSF2 (FAILED single), CSF3 (FAILED section), CSF4 (no Self-Check at all) cover all paths.
- **TRD checkbox indent:** Some ROADMAP entries are indented (within nested lists). Capture indent in regex and preserve it on rewrite. Test WTL3 asserts indent preservation.
- **ROADMAP.md outside .planning/:** This repo's ROADMAP.md lives at `.planning/ROADMAP.md`. Don't accept arbitrary paths — `projectRoot` parameter resolves to `<projectRoot>/.planning/ROADMAP.md` always.
- **Failed annotation idempotency:** A TRD already marked `[ ] (failed)` should NOT be re-flipped if SUMMARY still says FAILED — that's not drift, that's the current state. Test R5 asserts: input `[ ] foo (failed)` + SUMMARY=FAILED → no change.
- **Failed → recovered:** A TRD marked `[ ] (failed)` whose SUMMARY now says PASSED → flip to `[x]` and DROP the `(failed)` annotation. Test R6 asserts this transition.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Test list + RED tests for engine + fixtures</name>
  <files>
    plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  </files>
  <action>
Write the test list as a top-of-file comment block in `roadmap-reconcile.test.cjs`, then implement RED tests for ALL groups before any production code is written.

**Test list (write at top of test file as comment block):**

```
TEST LIST — TRD 09-01 reconciler engine + fixtures
==================================================

Group F (fixture builder):
- F1: buildReconcileFixtures returns { projectRoot, cleanup }
- F2: builds .planning/ROADMAP.md with TRD checkbox lines per spec
- F3: builds <id>-TRD.md and optional <id>-SUMMARY.md per trd.summary spec
- F4: cleanup() removes the tmpdir tree

Group WTL (_walkTrdLines):
- WTL1: parses '- [ ] 01-01-foo-TRD.md — desc' → { trd_id: '01-01', checked: false, has_failed_annotation: false }
- WTL2: parses '- [x] 09-03-bar-TRD.md — desc (failed)' → { trd_id: '09-03', checked: true, has_failed_annotation: true }
- WTL3: preserves indentation (e.g., '  - [x] ...')
- WTL4: associates each TRD with its preceding '### Objective N:' header
- WTL5: skips non-TRD lines (regular bullets, prose)
- WTL6: returns [] for ROADMAP with no TRD lines

Group CSE (_checkSummaryExists):
- CSE1: returns true when <objectiveDir>/<trdId>-*-SUMMARY.md exists
- CSE2: returns false when SUMMARY file is absent
- CSE3: returns false when objective directory itself doesn't exist
- CSE4: handles glob matching — '<trdId>-*-SUMMARY.md' (any slug between trd_id and -SUMMARY)

Group CSF (_checkSummaryFailed):
- CSF1: '## Self-Check: PASSED' single-line → false
- CSF2: '## Self-Check: FAILED' single-line → true
- CSF3: '## Self-Check\n\n- foo: FAILED' section format → true
- CSF4: SUMMARY with no Self-Check section → false (defensive)
- CSF5: empty/non-string input → false
- CSF6: 'FAILEDISH' (no word boundary) → false

Group WR (_writeReconciledRoadmap):
- WR1: writes content to <projectRoot>/.planning/ROADMAP.md atomically
- WR2: tmp file does NOT exist after successful write (renamed away)
- WR3: tmp file is unlinked when rename throws (cleanup branch)
- WR4: passes through atomic guarantee — partial writes never visible at dest

Group R (reconcile orchestrator):
- R1: empty ROADMAP / no TRDs → { changes: [], warnings: [] }
- R2: '[ ]' + SUMMARY exists → flips to '[x]' (kind: 'trd_summary_exists')
- R3: '[x]' + SUMMARY missing → leaves '[x]' alone (we don't auto-uncheck on missing SUMMARY; warning emitted only when TRD file also missing)
- R4: '[x]' + SUMMARY contains FAILED → flips to '[ ] desc (failed)' (kind: 'trd_summary_failed')
- R5: '[ ] desc (failed)' + SUMMARY still FAILED → no change (idempotent on failed state)
- R6: '[ ] desc (failed)' + SUMMARY now PASSED → flip to '[x] desc' (drops (failed) annotation, kind: 'trd_summary_exists')
- R7: '[ ]' + no TRD file on disk → leave alone, emit warning (kind: 'trd_orphan_warning')
- R8: mode='dry-run' → returns changes WITHOUT writing ROADMAP.md
- R9: mode='write' → returns changes AND ROADMAP.md is rewritten on disk
- R10: idempotency — second reconcile run returns changes=[] (the locked guarantee)
- R11: ROADMAP.md missing → returns warning, no throw
- R12: indent preserved in rewritten lines (composite of WTL3 + reconcile)
```

**Add `buildReconcileFixtures(opts)` to `__fixtures__/awareness-fixtures.cjs`** following the shape in embedded_context. Export it from the existing module.exports of awareness-fixtures.cjs. Add tests F1-F4 verifying the factory.

**Implement test groups WTL/CSE/CSF/WR/R using fixtures.** All tests should fail at this point (RED) — module roadmap-reconcile.cjs doesn't exist yet. Use `node:test` runner; place tests at `plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs`. Mirror existing test file conventions (require statements at top, individual `test('...', ...)` blocks, no describe blocks).

# CRITICAL: ALL tests must reference symbols from `lib/roadmap-reconcile.cjs` — they MUST fail at this stage. Run `npm test` to confirm RED. Commit with `test(09-01): add failing tests for reconciler engine + fixtures`.
# GOTCHA: `process.pid` in tmp suffix — use `${process.pid}-${Date.now()}` to avoid collisions across parallel test workers.
# PATTERN: See `lib/initiatives.test.cjs` Group L tests for tmpdir + cleanup hygiene.
  </action>
  <verify>
`npm test` shows ALL new tests in roadmap-reconcile.test.cjs FAILING (red). Existing tests still pass. F1-F4 (fixture tests) also fail until buildReconcileFixtures is exported from awareness-fixtures.cjs.
  </verify>
  <done>
Test list comment block at top of roadmap-reconcile.test.cjs covers all 6 test groups. All test cases (~30+ tests) implemented and FAILING. `buildReconcileFixtures` exported from awareness-fixtures.cjs and exercised by F1-F4. Single commit `test(09-01): add failing tests for reconciler engine + fixtures`.
  </done>
  <recovery>
If buildReconcileFixtures fixture interferes with existing fixture tests in awareness-fixtures, isolate it in a dedicated `fixtures-reconcile.cjs` sub-module and require it from awareness-fixtures.cjs (re-export). Existing fixture tests must continue to pass.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement reconciler engine to pass all tests</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs</files>
  <action>
Create `lib/roadmap-reconcile.cjs` from scratch. Implement minimal code to make all tests in Task 1 pass.

**Module structure (locked layout):**

```js
'use strict';

/**
 * Roadmap ↔ disk reconciliation engine.
 *
 * Walks <projectRoot>/.planning/ROADMAP.md and reconciles its checkbox state
 * against on-disk SUMMARY.md presence + Self-Check verdict.
 *
 * Iron Law: ROADMAP.md mutation is line-level regex; never YAML-parse the body.
 *
 * Module growth across waves:
 *   TRD 09-01: engine (reconcile, _walkTrdLines, _checkSummaryExists,        (THIS TRD)
 *              _checkSummaryFailed, _writeReconciledRoadmap, hooks)
 *   TRD 09-02: objective-level rollup (_rollupObjectiveStatus)
 *   TRD 09-03: module.exports finalization + integration tests
 */

const fs = require('fs');
const path = require('path');

// ─── TRD 09-01: Constants ─────────────────────────────────────────────────────

const ROADMAP_REL = path.join('.planning', 'ROADMAP.md');
const OBJECTIVES_REL = path.join('.planning', 'objectives');

// ─── TRD 09-01: Injection hooks ───────────────────────────────────────────────
// All production fs reads/writes route through _runFs.X() — never fs.X() directly.

const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
  writeFileSync: (p, data, opts) => fs.writeFileSync(p, data, opts),
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
  renameSync: (oldP, newP) => fs.renameSync(oldP, newP),
  unlinkSync: (p) => fs.unlinkSync(p),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// ─── TRD 09-01: _walkTrdLines ─────────────────────────────────────────────────

function _walkTrdLines(roadmapContent) {
  // [implementation per embedded_context]
}

// ─── TRD 09-01: _checkSummaryExists ───────────────────────────────────────────

function _checkSummaryExists(objectiveDir, trdId) {
  // Glob: <objectiveDir>/<trdId>-*-SUMMARY.md
  // Use _runFs.readdirSync + filter by prefix `${trdId}-` and suffix `-SUMMARY.md`
}

// ─── TRD 09-01: _checkSummaryFailed ───────────────────────────────────────────

function _checkSummaryFailed(summaryContent) {
  // [implementation per embedded_context]
}

// ─── TRD 09-01: _writeReconciledRoadmap ───────────────────────────────────────

function _writeReconciledRoadmap(projectRoot, content) {
  const dest = path.join(projectRoot, ROADMAP_REL);
  const planningDir = path.join(projectRoot, '.planning');
  if (!_runFs.existsSync(planningDir)) {
    _runFs.mkdirSync(planningDir, { recursive: true });
  }
  const tmpPath = path.join(projectRoot, '.planning', `.ROADMAP.md.tmp.${process.pid}`);
  _runFs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    _runFs.renameSync(tmpPath, dest);
  } catch (e) {
    try { _runFs.unlinkSync(tmpPath); } catch {}
    throw e;
  }
}

// ─── TRD 09-01: reconcile ─────────────────────────────────────────────────────

function reconcile({ projectRoot, mode = 'write' } = {}) {
  const result = { changes: [], warnings: [] };
  const roadmapPath = path.join(projectRoot, ROADMAP_REL);
  if (!_runFs.existsSync(roadmapPath)) {
    result.warnings.push({ kind: 'roadmap_missing', path: roadmapPath });
    return result;
  }
  const content = _runFs.readFileSync(roadmapPath, 'utf-8');
  const trdEntries = _walkTrdLines(content);
  const lines = content.split('\n');

  for (const entry of trdEntries) {
    const objectiveDir = path.join(projectRoot, OBJECTIVES_REL);
    // Find the actual objective directory matching `<entry.objective_num>-*`
    // (objective directory naming: `<num>-<slug>`)
    const objDirActual = _findObjectiveDir(objectiveDir, entry.objective_num);
    if (!objDirActual) {
      // No objective directory — TRD orphan
      if (!entry.checked) {
        result.warnings.push({
          kind: 'trd_orphan_warning',
          objective_num: entry.objective_num,
          trd_id: entry.trd_id,
          message: `ROADMAP lists ${entry.trd_filename} but no objective directory found for ${entry.objective_num}`,
        });
      }
      continue;
    }
    const summaryExists = _checkSummaryExists(objDirActual, entry.trd_id);
    const trdFileExists = _checkTrdFileExists(objDirActual, entry.trd_id);

    // Apply rules — see CONTEXT.md §"Locked decisions #2"
    let newCheckbox = entry.checked ? 'x' : ' ';
    let newAnnotation = entry.has_failed_annotation;
    let kind = null;

    if (summaryExists) {
      const summaryPath = _findSummaryPath(objDirActual, entry.trd_id);
      const summaryContent = _runFs.readFileSync(summaryPath, 'utf-8');
      const failed = _checkSummaryFailed(summaryContent);
      if (failed) {
        // Rule 2: trd_summary_failed
        if (entry.checked || !entry.has_failed_annotation) {
          newCheckbox = ' ';
          newAnnotation = true;
          kind = 'trd_summary_failed';
        }
        // else already in failed state → no change
      } else {
        // Rule 1: trd_summary_exists (PASSED)
        if (!entry.checked || entry.has_failed_annotation) {
          newCheckbox = 'x';
          newAnnotation = false;
          kind = 'trd_summary_exists';
        }
        // else already checked w/o failed annotation → no change
      }
    } else {
      // SUMMARY missing
      if (!trdFileExists) {
        // Rule 3: trd_orphan_warning
        result.warnings.push({
          kind: 'trd_orphan_warning',
          objective_num: entry.objective_num,
          trd_id: entry.trd_id,
          message: `ROADMAP lists ${entry.trd_filename} but no TRD file found at ${objDirActual}`,
        });
      }
      // No checkbox flip when SUMMARY is absent (we don't auto-uncheck on missing)
    }

    if (kind) {
      // Rewrite line
      const newAnnotationStr = newAnnotation ? ' (failed)' : '';
      const newLine = `${entry.indent}- [${newCheckbox}] ${entry.trd_filename} — ${entry.description.replace(/\s+\(failed\)\s*$/, '')}${newAnnotationStr}`;
      lines[entry.line_index] = newLine;
      result.changes.push({
        kind,
        path: roadmapPath,
        objective_num: entry.objective_num,
        trd_id: entry.trd_id,
        before: entry.line,
        after: newLine,
      });
    }
  }

  if (mode === 'write' && result.changes.length > 0) {
    _writeReconciledRoadmap(projectRoot, lines.join('\n'));
  }

  return result;
}

// ─── TRD 09-01: helpers ───────────────────────────────────────────────────────

function _findObjectiveDir(objectivesDir, objectiveNum) {
  if (!_runFs.existsSync(objectivesDir)) return null;
  const entries = _runFs.readdirSync(objectivesDir);
  const padded = String(objectiveNum).padStart(2, '0');
  const match = entries.find(e => e === objectiveNum || e === padded || e.startsWith(`${objectiveNum}-`) || e.startsWith(`${padded}-`));
  return match ? path.join(objectivesDir, match) : null;
}

function _findSummaryPath(objectiveDir, trdId) {
  const entries = _runFs.readdirSync(objectiveDir);
  const summary = entries.find(e => e.startsWith(`${trdId}-`) && e.endsWith('-SUMMARY.md'));
  // Also accept simpler form `<trdId>-SUMMARY.md` (no slug)
  const simple = entries.find(e => e === `${trdId}-SUMMARY.md`);
  const found = summary || simple;
  return found ? path.join(objectiveDir, found) : null;
}

function _checkTrdFileExists(objectiveDir, trdId) {
  if (!_runFs.existsSync(objectiveDir)) return false;
  const entries = _runFs.readdirSync(objectiveDir);
  return entries.some(e => e.startsWith(`${trdId}-`) && e.endsWith('-TRD.md'));
}

// ─── TRD 09-01: minimal exports (final lock comes in TRD 09-03) ───────────────
// NOTE: TRD 09-03 will lock the export surface with a banner comment.
// For now, export everything needed by tests.

module.exports = {
  reconcile,
  _walkTrdLines,
  _checkSummaryExists,
  _checkSummaryFailed,
  _writeReconciledRoadmap,
  _setRunFs,
  _resetMocks,
};
```

**Implementation rules:**

1. Implement EXACTLY what tests demand — no extra features, no speculative API.
2. Run `npm test` after each helper is implemented; iterate until ALL roadmap-reconcile tests pass.
3. Existing tests across the repo must remain green (don't break obj 1/2/3/4/5 tests).
4. Use the `_findObjectiveDir` / `_findSummaryPath` shape from the embedded skeleton — these are the ONLY exception to the "tests dictate the API" rule (they're internal-only, not exported).

# CRITICAL: After GREEN, do NOT refactor logic — just verify tests pass and commit `feat(09-01): implement reconciler engine`. Refactor pass is optional and only if there's obvious duplication; otherwise skip.
# GOTCHA: `_walkTrdLines` regex must NOT capture the `(failed)` annotation as part of `description`. Strip it explicitly: `entry.description.replace(/\s+\(failed\)\s*$/, '')` when rewriting, OR exclude in the regex (recommended — non-greedy `(.+?)` with optional ` (failed)` group).
# PATTERN: See `lib/initiatives.cjs::syncInitiatives` for orchestrator shape (read disk → walk → apply rules → conditionally write).
  </action>
  <verify>
`npm test` shows ALL roadmap-reconcile tests GREEN. Existing tests remain green (1097+/1097+ baseline). No new test files have failing tests except gated/skipped ones.
  </verify>
  <done>
`lib/roadmap-reconcile.cjs` exists with reconcile + 4 helpers + 2 hooks (~250 lines). All ~30+ tests in roadmap-reconcile.test.cjs pass. Repo-wide test count up by ~30 (1097+30 ≈ 1127). Single commit `feat(09-01): implement reconciler engine`.
  </done>
  <recovery>
If a test resists greening because of regex pathology, capture the offending input/output in a regression comment in the test file (`// REGRESSION: input X → expected Y but produced Z`) and fix the regex — don't relax the test. Common offenders: indent capture, em-dash vs hyphen separator, escaped regex chars in description.

If `_writeReconciledRoadmap` rename simulation in WR3 fails, check the mock injection — `_setRunFs({...realFs, renameSync: () => { throw new Error(); }})` should leave readdirSync etc. intact. Use `Object.assign({}, realFs, override)` pattern.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: REFACTOR pass + lock test groups (optional commit)</name>
  <files>
    plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
    plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs
  </files>
  <action>
Optional refactor pass. Only commit if there are concrete, observable improvements that don't change test outcomes.

**Refactor candidates to consider:**

- Extract repeated regex constants to module-top (e.g., `const TRD_LINE_RE = /.../`).
- Consolidate `_findObjectiveDir` + `_findSummaryPath` + `_checkTrdFileExists` if they share scanning logic.
- Add JSDoc to public `reconcile` exported function (not private helpers).

**Refactor non-goals:**

- Don't add features.
- Don't change function signatures.
- Don't restructure modules (no extracting to sub-files; lib stays one file per CONTEXT.md decision).
- Don't add error types beyond plain `Error` thrown by writers.

If after review there are no observable wins, skip this task with a note in the SUMMARY: "REFACTOR: no changes — code already minimal."

If refactor is performed, run `npm test` after each change. ALL tests must remain green. Commit with `refactor(09-01): clean up reconciler engine`.

# CRITICAL: REFACTOR commit is OPTIONAL per TDD Iron Law — skip if no wins. SUMMARY.md should record either "REFACTOR commit: <hash>" or "REFACTOR skipped — no changes."
  </action>
  <verify>
`npm test` GREEN. If commit was made, `git log -1 --oneline` shows `refactor(09-01): ...`. If skipped, SUMMARY records the skip rationale.
  </verify>
  <done>
Refactor decision documented in SUMMARY. If commit made, all tests pass post-refactor. If skipped, "REFACTOR skipped" line in SUMMARY.
  </done>
  <recovery>
If refactor breaks tests, `git reset --hard HEAD` (revert refactor only — Tasks 1+2 commits remain intact). Document in SUMMARY: "REFACTOR attempted but reverted: <reason>".
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `lib/roadmap-reconcile.cjs` exists, ~200-300 lines, exports `reconcile` + 4 helpers + 2 hooks.
2. `lib/roadmap-reconcile.test.cjs` exists with test list comment block + 6 groups (F/WTL/CSE/CSF/WR/R) totaling ~30+ tests, all GREEN.
3. `lib/__fixtures__/awareness-fixtures.cjs` exports `buildReconcileFixtures`.
4. `npm test` total test count increased by ~30+. No regressions in existing tests.
5. Three rule kinds (`trd_summary_exists`, `trd_summary_failed`, `trd_orphan_warning`) exercised by R-group tests.
6. Atomic write via tmp + rename verified by WR-group tests (especially WR3 — cleanup on rename failure).
7. Idempotency verified by R10 — second reconcile run on a fixture with no remaining drift returns `changes: []`.
8. Two commits expected: `test(09-01): ...` and `feat(09-01): ...`. Optional third: `refactor(09-01): ...`.
</verification>

<success_criteria>
- [ ] SC-1 satisfied: `reconcile({ projectRoot, mode })` returns `{ changes, warnings }` with correct shape
- [ ] SC-2 satisfied: 3 rule kinds (`trd_summary_exists`, `trd_summary_failed`, `trd_orphan_warning`) emitted with correct semantics
- [ ] SC-3 satisfied: atomic write via tmp + rename; idempotency proven by R10 test
- [ ] All tests GREEN; no regressions in existing 1097+ test baseline
- [ ] Test list at top of test file enumerates all cases before any assertion
- [ ] Hand-built fixture builder used (no LLM-generated test data); deterministic test cases (no property-based)
- [ ] Commits follow `test:` → `feat:` → optional `refactor:` cadence per TDD Iron Law
</success_criteria>

<output>
After completion, create `.planning/objectives/09-roadmap-disk-reconciliation/09-01-reconciler-engine-and-fixtures-SUMMARY.md` per `@/Users/markemerson/.claude/devflow/templates/summary.md`. Record:

- Test count delta (before → after)
- Commits (test/feat/optional-refactor with hashes)
- Any deviations from the locked design (with justification)
- REFACTOR decision (committed or skipped + rationale)
- Note that 09-02 will extend `reconcile` to call `_rollupObjectiveStatus` after the rule loop
</output>

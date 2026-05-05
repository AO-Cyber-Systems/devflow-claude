'use strict';

/*
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
- R3: '[x]' + SUMMARY missing → leaves '[x]' alone (no auto-uncheck on missing SUMMARY)
- R4: '[x]' + SUMMARY contains FAILED → flips to '[ ] desc (failed)' (kind: 'trd_summary_failed')
- R5: '[ ] desc (failed)' + SUMMARY still FAILED → no change (idempotent on failed state)
- R6: '[ ] desc (failed)' + SUMMARY now PASSED → flip to '[x] desc' (drops (failed) annotation, kind: 'trd_summary_exists')
- R7: '[ ]' + no TRD file on disk → leave alone, emit warning (kind: 'trd_orphan_warning')
- R8: mode='dry-run' → returns changes WITHOUT writing ROADMAP.md
- R9: mode='write' → returns changes AND ROADMAP.md is rewritten on disk
- R10: idempotency — second reconcile run returns changes=[] (the locked guarantee)
- R11: ROADMAP.md missing → returns warning, no throw
- R12: indent preserved in rewritten lines (composite of WTL3 + reconcile)

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
*/

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('./__fixtures__/awareness-fixtures.cjs');

// MUST require the module under test — will fail (RED) until Task 2 creates it
const reconcile = require('./roadmap-reconcile.cjs');

// ─── Group F — fixture builder ────────────────────────────────────────────────

test('F1: buildReconcileFixtures returns { projectRoot, cleanup }', () => {
  const result = fixtures.buildReconcileFixtures({ objectives: [] });
  assert.ok(typeof result.projectRoot === 'string', 'projectRoot is a string');
  assert.ok(typeof result.cleanup === 'function', 'cleanup is a function');
  result.cleanup();
});

test('F2: builds .planning/ROADMAP.md with TRD checkbox lines per spec', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo Objective',
      trds: [
        { id: '01-01', slug: 'alpha', desc: 'Alpha task', initial_checkbox: ' ' },
        { id: '01-02', slug: 'beta', desc: 'Beta task', initial_checkbox: 'x' },
      ],
    }],
  });
  const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
  assert.ok(fs.existsSync(roadmapPath), 'ROADMAP.md exists');
  const content = fs.readFileSync(roadmapPath, 'utf-8');
  assert.ok(content.includes('- [ ] 01-01-alpha-TRD.md — Alpha task'), 'unchecked TRD line present');
  assert.ok(content.includes('- [x] 01-02-beta-TRD.md — Beta task'), 'checked TRD line present');
  assert.ok(content.includes('### Objective 01: Foo Objective'), 'objective header present');
  cleanup();
});

test('F3: builds <id>-TRD.md and optional <id>-SUMMARY.md per trd.summary spec', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      trds: [
        { id: '01-01', slug: 'alpha', summary: 'present' },
        { id: '01-02', slug: 'beta', summary: 'failed' },
        { id: '01-03', slug: 'gamma', summary: 'failed-section' },
        { id: '01-04', slug: 'delta' },  // no summary
      ],
    }],
  });
  const objDir = path.join(projectRoot, '.planning', 'objectives', '01-foo');
  // TRD files
  assert.ok(fs.existsSync(path.join(objDir, '01-01-alpha-TRD.md')), 'TRD file for 01-01');
  assert.ok(fs.existsSync(path.join(objDir, '01-04-delta-TRD.md')), 'TRD file for 01-04');
  // SUMMARY files
  assert.ok(fs.existsSync(path.join(objDir, '01-01-alpha-SUMMARY.md')), 'SUMMARY present for 01-01');
  assert.ok(fs.existsSync(path.join(objDir, '01-02-beta-SUMMARY.md')), 'SUMMARY present for 01-02');
  assert.ok(fs.existsSync(path.join(objDir, '01-03-gamma-SUMMARY.md')), 'SUMMARY present for 01-03');
  assert.ok(!fs.existsSync(path.join(objDir, '01-04-delta-SUMMARY.md')), 'no SUMMARY for 01-04');
  // SUMMARY content
  const s1 = fs.readFileSync(path.join(objDir, '01-01-alpha-SUMMARY.md'), 'utf-8');
  assert.ok(s1.includes('Self-Check: PASSED'), 'summary=present has PASSED');
  const s2 = fs.readFileSync(path.join(objDir, '01-02-beta-SUMMARY.md'), 'utf-8');
  assert.ok(s2.includes('Self-Check: FAILED'), 'summary=failed has FAILED single-line');
  const s3 = fs.readFileSync(path.join(objDir, '01-03-gamma-SUMMARY.md'), 'utf-8');
  assert.ok(s3.includes('## Self-Check\n'), 'summary=failed-section has section header');
  assert.ok(s3.includes('FAILED'), 'summary=failed-section has FAILED in body');
  cleanup();
});

test('F4: cleanup() removes the tmpdir tree', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({ objectives: [] });
  assert.ok(fs.existsSync(projectRoot), 'tmpdir exists before cleanup');
  cleanup();
  assert.ok(!fs.existsSync(projectRoot), 'tmpdir removed after cleanup');
});

// ─── Group WTL — _walkTrdLines ────────────────────────────────────────────────

test('WTL1: parses unchecked TRD line correctly', () => {
  const content = [
    '### Objective 01: Foo',
    '',
    '- [ ] 01-01-foo-TRD.md — some description',
  ].join('\n');
  const result = reconcile._walkTrdLines(content);
  assert.strictEqual(result.length, 1);
  const entry = result[0];
  assert.strictEqual(entry.trd_id, '01-01');
  assert.strictEqual(entry.trd_filename, '01-01-foo-TRD.md');
  assert.strictEqual(entry.checked, false);
  assert.strictEqual(entry.has_failed_annotation, false);
  assert.strictEqual(entry.objective_num, '01');
  assert.strictEqual(entry.description, 'some description');
});

test('WTL2: parses checked TRD line with (failed) annotation', () => {
  const content = [
    '### Objective 09: Bar',
    '',
    '- [x] 09-03-bar-TRD.md — some desc (failed)',
  ].join('\n');
  const result = reconcile._walkTrdLines(content);
  assert.strictEqual(result.length, 1);
  const entry = result[0];
  assert.strictEqual(entry.trd_id, '09-03');
  assert.strictEqual(entry.checked, true);
  assert.strictEqual(entry.has_failed_annotation, true);
  assert.strictEqual(entry.description, 'some desc');
});

test('WTL3: preserves indentation on TRD lines', () => {
  const content = [
    '### Objective 01: Foo',
    '',
    '  - [x] 01-01-foo-TRD.md — indented desc',
  ].join('\n');
  const result = reconcile._walkTrdLines(content);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].indent, '  ');
});

test('WTL4: associates TRD lines with their preceding ### Objective N: header', () => {
  const content = [
    '### Objective 01: First',
    '',
    '- [ ] 01-01-first-TRD.md — first trd',
    '',
    '### Objective 02: Second',
    '',
    '- [ ] 02-01-second-TRD.md — second trd',
  ].join('\n');
  const result = reconcile._walkTrdLines(content);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].objective_num, '01');
  assert.strictEqual(result[0].trd_id, '01-01');
  assert.strictEqual(result[1].objective_num, '02');
  assert.strictEqual(result[1].trd_id, '02-01');
});

test('WTL5: skips non-TRD bullet lines and prose', () => {
  const content = [
    '### Objective 01: Foo',
    '',
    '- some regular bullet',
    '- [ ] not-a-trd-line — something',
    '- [x] 01-01-valid-TRD.md — valid trd',
    'Just prose here.',
  ].join('\n');
  const result = reconcile._walkTrdLines(content);
  // Only the valid TRD line should match
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].trd_id, '01-01');
});

test('WTL6: returns [] for ROADMAP with no TRD lines', () => {
  const content = [
    '# DevFlow ROADMAP',
    '',
    '## Overview',
    '',
    'Some intro text.',
  ].join('\n');
  const result = reconcile._walkTrdLines(content);
  assert.deepStrictEqual(result, []);
});

// ─── Group CSE — _checkSummaryExists ─────────────────────────────────────────

test('CSE1: returns true when <objectiveDir>/<trdId>-*-SUMMARY.md exists', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{ id: '01-01', slug: 'alpha', summary: 'present' }],
    }],
  });
  const objDir = path.join(projectRoot, '.planning', 'objectives', '01-foo');
  const result = reconcile._checkSummaryExists(objDir, '01-01');
  assert.strictEqual(result, true);
  cleanup();
});

test('CSE2: returns false when SUMMARY file is absent', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{ id: '01-01', slug: 'alpha' }],  // no summary
    }],
  });
  const objDir = path.join(projectRoot, '.planning', 'objectives', '01-foo');
  const result = reconcile._checkSummaryExists(objDir, '01-01');
  assert.strictEqual(result, false);
  cleanup();
});

test('CSE3: returns false when objective directory itself does not exist', () => {
  const result = reconcile._checkSummaryExists('/tmp/does-not-exist-reconcile-test', '01-01');
  assert.strictEqual(result, false);
});

test('CSE4: handles glob matching — any slug between trd_id and -SUMMARY', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{ id: '01-01', slug: 'very-long-slug-name', summary: 'present' }],
    }],
  });
  // File will be 01-01-very-long-slug-name-SUMMARY.md
  const objDir = path.join(projectRoot, '.planning', 'objectives', '01-foo');
  const result = reconcile._checkSummaryExists(objDir, '01-01');
  assert.strictEqual(result, true, 'should match regardless of slug length');
  cleanup();
});

// ─── Group CSF — _checkSummaryFailed ─────────────────────────────────────────

test('CSF1: "## Self-Check: PASSED" single-line → false', () => {
  const content = '# Summary\n\n## Self-Check: PASSED\n';
  assert.strictEqual(reconcile._checkSummaryFailed(content), false);
});

test('CSF2: "## Self-Check: FAILED" single-line → true', () => {
  const content = '# Summary\n\n## Self-Check: FAILED\n\n- something: missing\n';
  assert.strictEqual(reconcile._checkSummaryFailed(content), true);
});

test('CSF3: "## Self-Check" section format with FAILED in body → true', () => {
  const content = '# Summary\n\n## Self-Check\n\n- foo: FAILED\n- bar: PASSED\n';
  assert.strictEqual(reconcile._checkSummaryFailed(content), true);
});

test('CSF4: SUMMARY with no Self-Check section → false (defensive)', () => {
  const content = '# Summary\n\nSome content without any self-check section.\n';
  assert.strictEqual(reconcile._checkSummaryFailed(content), false);
});

test('CSF5: empty / non-string input → false', () => {
  assert.strictEqual(reconcile._checkSummaryFailed(''), false);
  assert.strictEqual(reconcile._checkSummaryFailed(null), false);
  assert.strictEqual(reconcile._checkSummaryFailed(undefined), false);
  assert.strictEqual(reconcile._checkSummaryFailed(42), false);
});

test('CSF6: "FAILEDISH" does not match (word boundary)', () => {
  const content = '# Summary\n\n## Self-Check\n\n- status: FAILEDISH\n';
  assert.strictEqual(reconcile._checkSummaryFailed(content), false);
});

// ─── Group WR — _writeReconciledRoadmap ───────────────────────────────────────

test('WR1: writes content to <projectRoot>/.planning/ROADMAP.md atomically', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'df-wr-test-'));
  fs.mkdirSync(path.join(tmpBase, '.planning'), { recursive: true });
  const dest = path.join(tmpBase, '.planning', 'ROADMAP.md');
  const content = '# Test ROADMAP\n\nsome content\n';
  reconcile._writeReconciledRoadmap(tmpBase, content);
  assert.ok(fs.existsSync(dest), 'ROADMAP.md written');
  assert.strictEqual(fs.readFileSync(dest, 'utf-8'), content);
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

test('WR2: tmp file does NOT exist after successful write (renamed away)', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'df-wr-test-'));
  fs.mkdirSync(path.join(tmpBase, '.planning'), { recursive: true });

  const writtenTmps = [];
  const originalWrite = fs.writeFileSync.bind(fs);
  const originalRename = fs.renameSync.bind(fs);

  // Track what tmp paths are written
  reconcile._setRunFs(Object.assign({}, {
    existsSync: (p) => fs.existsSync(p),
    mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
    writeFileSync: (p, data, opts) => {
      if (path.basename(p).startsWith('.ROADMAP.md.tmp.')) writtenTmps.push(p);
      fs.writeFileSync(p, data, opts);
    },
    renameSync: (oldP, newP) => fs.renameSync(oldP, newP),
    unlinkSync: (p) => fs.unlinkSync(p),
    readdirSync: (p, opts) => fs.readdirSync(p, opts),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    statSync: (p) => fs.statSync(p),
  }));

  reconcile._writeReconciledRoadmap(tmpBase, '# content\n');

  reconcile._resetMocks();

  // The tmp file should no longer exist (renamed away)
  for (const tmpPath of writtenTmps) {
    assert.ok(!fs.existsSync(tmpPath), `tmp file should not exist after rename: ${tmpPath}`);
  }

  fs.rmSync(tmpBase, { recursive: true, force: true });
});

test('WR3: tmp file is unlinked when rename throws (cleanup branch)', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'df-wr-test-'));
  fs.mkdirSync(path.join(tmpBase, '.planning'), { recursive: true });

  const writtenTmps = [];
  const unlinkedPaths = [];

  reconcile._setRunFs({
    existsSync: (p) => fs.existsSync(p),
    mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
    writeFileSync: (p, data, opts) => {
      if (path.basename(p).startsWith('.ROADMAP.md.tmp.')) writtenTmps.push(p);
      fs.writeFileSync(p, data, opts);
    },
    renameSync: () => { throw new Error('simulated rename failure'); },
    unlinkSync: (p) => {
      unlinkedPaths.push(p);
      try { fs.unlinkSync(p); } catch {}
    },
    readdirSync: (p, opts) => fs.readdirSync(p, opts),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    statSync: (p) => fs.statSync(p),
  });

  let threw = false;
  try {
    reconcile._writeReconciledRoadmap(tmpBase, '# content\n');
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('simulated rename failure'), 'error propagates');
  }

  reconcile._resetMocks();

  assert.ok(threw, 'error was thrown');
  // The tmp file should have been unlinked
  assert.ok(writtenTmps.length > 0, 'a tmp file was written');
  assert.ok(unlinkedPaths.some(p => writtenTmps.includes(p)), 'tmp path was unlinked');

  fs.rmSync(tmpBase, { recursive: true, force: true });
});

test('WR4: atomic guarantee — creates tmp then renames; never writes directly to dest', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'df-wr-test-'));
  fs.mkdirSync(path.join(tmpBase, '.planning'), { recursive: true });

  const writeOrder = [];
  reconcile._setRunFs({
    existsSync: (p) => fs.existsSync(p),
    mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
    writeFileSync: (p, data, opts) => {
      writeOrder.push({ op: 'write', file: path.basename(p) });
      fs.writeFileSync(p, data, opts);
    },
    renameSync: (oldP, newP) => {
      writeOrder.push({ op: 'rename', from: path.basename(oldP), to: path.basename(newP) });
      fs.renameSync(oldP, newP);
    },
    unlinkSync: (p) => fs.unlinkSync(p),
    readdirSync: (p, opts) => fs.readdirSync(p, opts),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    statSync: (p) => fs.statSync(p),
  });

  reconcile._writeReconciledRoadmap(tmpBase, '# content\n');
  reconcile._resetMocks();

  // write to tmp must come before rename
  const writeIdx = writeOrder.findIndex(e => e.op === 'write' && e.file.startsWith('.ROADMAP.md.tmp.'));
  const renameIdx = writeOrder.findIndex(e => e.op === 'rename' && e.to === 'ROADMAP.md');
  assert.ok(writeIdx !== -1, 'tmp write recorded');
  assert.ok(renameIdx !== -1, 'rename to ROADMAP.md recorded');
  assert.ok(writeIdx < renameIdx, 'write to tmp precedes rename to dest');

  fs.rmSync(tmpBase, { recursive: true, force: true });
});

// ─── Group R — reconcile orchestrator ────────────────────────────────────────

test('R1: empty ROADMAP with no TRD lines → { changes: [], warnings: [] }', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({ objectives: [] });
  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run' });
  assert.deepStrictEqual(result, { changes: [], warnings: [] });
  cleanup();
});

test('R2: unchecked TRD + SUMMARY exists → flips to [x] (kind: trd_summary_exists)', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'Alpha task', initial_checkbox: ' ', summary: 'present' }],
    }],
  });
  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run' });
  assert.strictEqual(result.changes.length, 1);
  assert.strictEqual(result.changes[0].kind, 'trd_summary_exists');
  assert.ok(result.changes[0].after.includes('[x]'), 'flipped to checked');
  cleanup();
});

test('R3: checked TRD + SUMMARY missing → leaves [x] alone (no auto-uncheck)', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'Alpha task', initial_checkbox: 'x' }],  // no summary
    }],
  });
  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run' });
  assert.deepStrictEqual(result.changes, []);
  cleanup();
});

test('R4: checked TRD + SUMMARY contains FAILED → flips to [ ] (failed) (kind: trd_summary_failed)', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'Alpha task', initial_checkbox: 'x', summary: 'failed' }],
    }],
  });
  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run' });
  assert.strictEqual(result.changes.length, 1);
  assert.strictEqual(result.changes[0].kind, 'trd_summary_failed');
  assert.ok(result.changes[0].after.includes('[ ]'), 'flipped to unchecked');
  assert.ok(result.changes[0].after.includes('(failed)'), 'has failed annotation');
  cleanup();
});

test('R5: TRD already in (failed) state + SUMMARY still FAILED → no change (idempotent)', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{
        id: '01-01', slug: 'alpha', desc: 'Alpha task',
        initial_checkbox: ' ', initial_annotation: '(failed)',
        summary: 'failed',
      }],
    }],
  });
  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run' });
  assert.deepStrictEqual(result.changes, [], 'no changes when already in failed state');
  cleanup();
});

test('R6: TRD in (failed) state + SUMMARY now PASSED → flip to [x] dropping (failed) annotation', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{
        id: '01-01', slug: 'alpha', desc: 'Alpha task',
        initial_checkbox: ' ', initial_annotation: '(failed)',
        summary: 'present',  // PASSED now
      }],
    }],
  });
  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run' });
  assert.strictEqual(result.changes.length, 1);
  assert.strictEqual(result.changes[0].kind, 'trd_summary_exists');
  assert.ok(result.changes[0].after.includes('[x]'), 'flipped to checked');
  assert.ok(!result.changes[0].after.includes('(failed)'), 'no (failed) annotation');
  cleanup();
});

test('R7: unchecked TRD + no TRD file on disk → leave alone, emit trd_orphan_warning', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{
        id: '01-01', slug: 'alpha', desc: 'Alpha task',
        initial_checkbox: ' ',
        no_trd_file: true,   // no TRD file on disk, no SUMMARY
      }],
    }],
  });
  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run' });
  assert.deepStrictEqual(result.changes, [], 'no changes (leave alone)');
  assert.ok(result.warnings.length > 0, 'warning emitted');
  assert.ok(result.warnings.some(w => w.kind === 'trd_orphan_warning'), 'trd_orphan_warning kind');
  cleanup();
});

test('R8: mode=dry-run → returns changes WITHOUT writing ROADMAP.md', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'Alpha task', initial_checkbox: ' ', summary: 'present' }],
    }],
  });
  const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
  const before = fs.readFileSync(roadmapPath, 'utf-8');

  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run' });

  const after = fs.readFileSync(roadmapPath, 'utf-8');
  assert.strictEqual(before, after, 'ROADMAP.md unchanged in dry-run mode');
  assert.ok(result.changes.length > 0, 'changes returned');
  cleanup();
});

test('R9: mode=write → returns changes AND ROADMAP.md is rewritten on disk', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'Alpha task', initial_checkbox: ' ', summary: 'present' }],
    }],
  });
  const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
  const before = fs.readFileSync(roadmapPath, 'utf-8');

  const result = reconcile.reconcile({ projectRoot, mode: 'write' });

  const after = fs.readFileSync(roadmapPath, 'utf-8');
  assert.ok(result.changes.length > 0, 'changes returned');
  assert.notStrictEqual(before, after, 'ROADMAP.md rewritten in write mode');
  assert.ok(after.includes('[x]'), 'ROADMAP.md now has [x]');
  cleanup();
});

test('R10: idempotency — second reconcile run returns changes=[]', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01', slug: 'foo',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'Alpha task', initial_checkbox: ' ', summary: 'present' }],
    }],
  });
  // First run
  const first = reconcile.reconcile({ projectRoot, mode: 'write' });
  assert.ok(first.changes.length > 0, 'first run has changes');

  // Second run — should have no drift
  const second = reconcile.reconcile({ projectRoot, mode: 'write' });
  assert.deepStrictEqual(second.changes, [], 'second run is idempotent');
  cleanup();
});

test('R11: ROADMAP.md missing → returns warning, no throw', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'df-r11-'));
  fs.mkdirSync(path.join(tmpBase, '.planning'), { recursive: true });
  // No ROADMAP.md written

  let result;
  assert.doesNotThrow(() => {
    result = reconcile.reconcile({ projectRoot: tmpBase, mode: 'dry-run' });
  }, 'should not throw on missing ROADMAP.md');

  assert.ok(result.warnings.some(w => w.kind === 'roadmap_missing'), 'roadmap_missing warning');
  assert.deepStrictEqual(result.changes, []);

  fs.rmSync(tmpBase, { recursive: true, force: true });
});

test('R12: indent preserved in rewritten lines', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'df-r12-'));
  fs.mkdirSync(path.join(tmpBase, '.planning', 'objectives', '01-foo'), { recursive: true });

  // Write TRD file
  fs.writeFileSync(
    path.join(tmpBase, '.planning', 'objectives', '01-foo', '01-01-alpha-TRD.md'),
    '---\nobjective: 01\ntrd: 01-01\n---\n',
    'utf-8',
  );
  // Write SUMMARY file (PASSED)
  fs.writeFileSync(
    path.join(tmpBase, '.planning', 'objectives', '01-foo', '01-01-alpha-SUMMARY.md'),
    '# Summary\n\n## Self-Check: PASSED\n',
    'utf-8',
  );
  // ROADMAP with indented TRD line
  const roadmapContent = [
    '### Objective 01: Foo',
    '',
    '  - [ ] 01-01-alpha-TRD.md — indented task',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(tmpBase, '.planning', 'ROADMAP.md'), roadmapContent, 'utf-8');

  const result = reconcile.reconcile({ projectRoot: tmpBase, mode: 'write' });

  assert.strictEqual(result.changes.length, 1);
  assert.ok(result.changes[0].after.startsWith('  - [x]'), 'indent preserved in written line');

  const written = fs.readFileSync(path.join(tmpBase, '.planning', 'ROADMAP.md'), 'utf-8');
  assert.ok(written.includes('  - [x] 01-01-alpha-TRD.md'), 'ROADMAP.md has indented [x] line');

  fs.rmSync(tmpBase, { recursive: true, force: true });
});

// ─── Group RU — _rollupObjectiveStatus pure logic ────────────────────────────

test('RU1: ALL [x] + status=in flight → flips to complete 2026-05-04, emits objective_rollup_status', () => {
  const lines = [
    '### Objective 01: Foo',
    '',
    '**Status:** in flight',
    '',
    '- [x] 01-01-foo-TRD.md — task one',
    '- [x] 01-02-bar-TRD.md — task two',
    '',
  ];
  const result = reconcile._rollupObjectiveStatus(lines, '2026-05-04');
  assert.strictEqual(result.changes.length, 1);
  const ch = result.changes[0];
  assert.strictEqual(ch.kind, 'objective_rollup_status');
  assert.strictEqual(ch.objective_num, '1');
  assert.strictEqual(ch.after, '**Status:** complete 2026-05-04');
  assert.ok(ch.before.includes('in flight'));
  // lines mutated in place
  assert.strictEqual(lines[2], '**Status:** complete 2026-05-04');
});

test('RU2: ALL [x] + status=complete 2026-04-01 → no change (idempotent)', () => {
  const lines = [
    '### Objective 01: Foo',
    '',
    '**Status:** complete 2026-04-01',
    '',
    '- [x] 01-01-foo-TRD.md — task one',
    '',
  ];
  const result = reconcile._rollupObjectiveStatus(lines, '2026-05-04');
  assert.deepStrictEqual(result.changes, []);
  // Line must not be modified
  assert.strictEqual(lines[2], '**Status:** complete 2026-04-01');
});

test('RU3: ALL [x] + NO status line → no change emitted, no error', () => {
  const lines = [
    '### Objective 01: Foo',
    '',
    'Some narrative prose (no Status line).',
    '',
    '- [x] 01-01-foo-TRD.md — task one',
    '',
  ];
  let result;
  assert.doesNotThrow(() => {
    result = reconcile._rollupObjectiveStatus(lines, '2026-05-04');
  });
  assert.deepStrictEqual(result.changes, []);
});

test('RU4: MIXED [x]/[ ] → only all-[x] objective is rolled up, other left alone', () => {
  const lines = [
    '### Objective 05: Alpha',
    '',
    '**Status:** in flight',
    '',
    '- [x] 05-01-a-TRD.md — task one',
    '- [x] 05-02-b-TRD.md — task two',
    '',
    '### Objective 06: Beta',
    '',
    '**Status:** in flight',
    '',
    '- [x] 06-01-a-TRD.md — task one',
    '- [ ] 06-02-b-TRD.md — task two (incomplete)',
    '',
  ];
  const result = reconcile._rollupObjectiveStatus(lines, '2026-05-04');
  assert.strictEqual(result.changes.length, 1);
  assert.strictEqual(result.changes[0].kind, 'objective_rollup_status');
  assert.strictEqual(result.changes[0].objective_num, '5');
  // Obj 05 Status line flipped
  assert.strictEqual(lines[2], '**Status:** complete 2026-05-04');
  // Obj 06 Status line unchanged
  assert.strictEqual(lines[9], '**Status:** in flight');
});

test('RU5: ALL [x] + Progress table row exists → row status cell updated, emits objective_rollup_progress', () => {
  const lines = [
    '### Objective 01: Foo',
    '',
    '**Status:** in flight',
    '',
    '- [x] 01-01-foo-TRD.md — task one',
    '',
    '## Progress',
    '',
    '| Objective | Title | Status |',
    '| --- | --- | --- |',
    '| 01 | Foo | in flight |',
    '',
  ];
  const result = reconcile._rollupObjectiveStatus(lines, '2026-05-04');
  // Should have status change + progress change
  assert.ok(result.changes.length >= 1, 'at least one change');
  const progressChange = result.changes.find(c => c.kind === 'objective_rollup_progress');
  assert.ok(progressChange, 'objective_rollup_progress change emitted');
  assert.strictEqual(progressChange.objective_num, '1');
  assert.ok(progressChange.after.includes('complete 2026-05-04'), 'progress row updated');
  // Table row line must be mutated
  assert.ok(lines[10].includes('complete 2026-05-04'), 'line mutated in place');
});

test('RU6: ALL [x] + malformed Progress table (3-cell row) → skipped silently, no error', () => {
  const lines = [
    '### Objective 01: Foo',
    '',
    '**Status:** in flight',
    '',
    '- [x] 01-01-foo-TRD.md — task one',
    '',
    '## Progress',
    '',
    '| 01 | malformed',    // only 3 cells (not 4)
    '',
  ];
  let result;
  assert.doesNotThrow(() => {
    result = reconcile._rollupObjectiveStatus(lines, '2026-05-04');
  });
  // No progress change (malformed row skipped), but status change still emitted
  const progressChange = result.changes.find(c => c.kind === 'objective_rollup_progress');
  assert.ok(!progressChange, 'no progress change on malformed row');
});

test('RU7: NOT all [x] → no rollup change', () => {
  const lines = [
    '### Objective 01: Foo',
    '',
    '**Status:** in flight',
    '',
    '- [x] 01-01-foo-TRD.md — task one',
    '- [ ] 01-02-bar-TRD.md — task two (incomplete)',
    '',
  ];
  const result = reconcile._rollupObjectiveStatus(lines, '2026-05-04');
  assert.deepStrictEqual(result.changes, []);
  assert.strictEqual(lines[2], '**Status:** in flight');
});

test('RU8: TRD checkboxes empty (no TRD lines in section) → no rollup change', () => {
  const lines = [
    '### Objective 01: Foo',
    '',
    '**Status:** in flight',
    '',
    'This objective has no TRD checkbox lines yet.',
    '',
  ];
  const result = reconcile._rollupObjectiveStatus(lines, '2026-05-04');
  assert.deepStrictEqual(result.changes, []);
  assert.strictEqual(lines[2], '**Status:** in flight');
});

// ─── Group RUI — rollup integration via reconcile ─────────────────────────────

test('RUI1: reconcile flips final TRD [ ] → [x] AND triggers rollup in same run', () => {
  // All TRDs complete on disk (SUMMARY present+PASSED), but ROADMAP still has [ ] for last TRD
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '05',
      slug: 'alpha',
      title: 'Alpha',
      status: 'in flight',
      trds: [
        { id: '05-01', slug: 'a', desc: 'task one', initial_checkbox: 'x', summary: 'present' },
        { id: '05-02', slug: 'b', desc: 'task two', initial_checkbox: ' ', summary: 'present' },
      ],
    }],
  });
  const result = reconcile.reconcile({ projectRoot, mode: 'write', today: '2026-05-04' });
  // Should have both trd_summary_exists (for 05-02) and objective_rollup_status
  const trdChange = result.changes.find(c => c.kind === 'trd_summary_exists');
  const rollupChange = result.changes.find(c => c.kind === 'objective_rollup_status');
  assert.ok(trdChange, 'trd_summary_exists change present');
  assert.ok(rollupChange, 'objective_rollup_status change present');
  assert.ok(rollupChange.after.includes('2026-05-04'), 'rollup uses injected today');
  cleanup();
});

test('RUI2: reconcile dry-run + ALL [x] in ROADMAP → emits rollup change, does NOT write', () => {
  // Build fixture where ROADMAP already has all [x] so no rule changes, but status still "in flight"
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '05',
      slug: 'alpha',
      title: 'Alpha',
      status: 'in flight',
      trds: [
        { id: '05-01', slug: 'a', desc: 'task one', initial_checkbox: 'x', summary: 'present' },
      ],
    }],
  });
  const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
  const before = fs.readFileSync(roadmapPath, 'utf-8');

  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run', today: '2026-05-04' });

  const after = fs.readFileSync(roadmapPath, 'utf-8');
  assert.strictEqual(before, after, 'ROADMAP.md not written in dry-run');
  const rollupChange = result.changes.find(c => c.kind === 'objective_rollup_status');
  assert.ok(rollupChange, 'rollup change emitted even in dry-run');
  cleanup();
});

test('RUI3: reconcile write-mode + rollup → ROADMAP.md has updated Status line on disk', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '05',
      slug: 'alpha',
      title: 'Alpha',
      status: 'in flight',
      trds: [
        { id: '05-01', slug: 'a', desc: 'task one', initial_checkbox: 'x', summary: 'present' },
      ],
    }],
  });
  reconcile.reconcile({ projectRoot, mode: 'write', today: '2026-05-04' });
  const written = fs.readFileSync(path.join(projectRoot, '.planning', 'ROADMAP.md'), 'utf-8');
  assert.ok(written.includes('**Status:** complete 2026-05-04'), 'Status line updated on disk');
  cleanup();
});

test('RUI4: idempotency — second reconcile run on rolled-up roadmap returns changes=[]', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '05',
      slug: 'alpha',
      title: 'Alpha',
      status: 'in flight',
      trds: [
        { id: '05-01', slug: 'a', desc: 'task one', initial_checkbox: 'x', summary: 'present' },
      ],
    }],
  });
  // First run: flips status to complete
  const first = reconcile.reconcile({ projectRoot, mode: 'write', today: '2026-05-04' });
  assert.ok(first.changes.length > 0, 'first run has changes');

  // Second run: already rolled up → no changes
  const second = reconcile.reconcile({ projectRoot, mode: 'write', today: '2026-05-04' });
  assert.deepStrictEqual(second.changes, [], 'second run is idempotent (no changes)');
  cleanup();
});

test('RUI5: today parameter forwarded from reconcile to _rollupObjectiveStatus', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '05',
      slug: 'alpha',
      title: 'Alpha',
      status: 'in flight',
      trds: [
        { id: '05-01', slug: 'a', desc: 'task one', initial_checkbox: 'x', summary: 'present' },
      ],
    }],
  });
  const result = reconcile.reconcile({ projectRoot, mode: 'dry-run', today: '2099-01-15' });
  const rollupChange = result.changes.find(c => c.kind === 'objective_rollup_status');
  assert.ok(rollupChange, 'rollup change emitted');
  assert.ok(rollupChange.after.includes('2099-01-15'), 'injected today date used in rollup');
  cleanup();
});

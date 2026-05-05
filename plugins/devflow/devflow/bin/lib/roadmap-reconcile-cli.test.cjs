'use strict';

/*
TEST LIST — TRD 09-03 CLI + flag parser + render summary
=========================================================

Group CLI (subprocess-based, exercising df-tools sync-roadmap):
- CLI1: default mode + clean fixture → exit 0, "No drift detected"
- CLI2: default mode + drift fixture → exit 0, ROADMAP file rewritten
- CLI3: --dry-run flag → exit 0, ROADMAP unchanged on disk, JSON output has changes
- CLI4: --raw flag + drift fixture → raw human-readable text output to stdout
- CLI5: --interactive in non-TTY → warning on stderr + falls back to write mode
- CLI6: ROADMAP missing → warning emitted, exit 0 (graceful)

Group FP (_parseFlags unit tests):
- FP1: --dry-run → { flags: { 'dry-run': true }, positional: [] }
- FP2: --interactive --raw → both flags true
- FP3: empty args → { flags: {}, positional: [] }
- FP4: unknown --flag treated as boolean flag

Group RS (_renderSummary unit tests):
- RS1: empty result → 'No drift detected. ROADMAP matches disk truth.'
- RS2: 1 change → includes kind + obj + trd + before/after lines
- RS3: warnings → 'Warnings: N' line + per-warning detail
- RS4: mixed changes + warnings → both sections present
*/

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('./__fixtures__/awareness-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const { _parseFlags, _renderSummary } = require('./roadmap-reconcile-cli.cjs');

// ─── Group CLI — subprocess-based tests ──────────────────────────────────────

test('CLI1: default mode + clean fixture → exit 0, "No drift detected"', () => {
  // Build fixture where all TRDs are already correctly [x] with SUMMARY and status is
  // already 'complete' so no rollup change fires either
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'complete 2026-05-04',  // already complete → no rollup change
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: 'x', summary: 'present' }],
    }],
  });

  try {
    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap'], {
      encoding: 'utf-8',
      cwd: projectRoot,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // Output should say no drift (human-readable)
    const out = r.stdout;
    let parsed;
    try {
      parsed = JSON.parse(out);
    } catch {}
    const noDrift = out.includes('No drift detected') ||
      (parsed && parsed.changes_count === 0);
    assert.ok(noDrift, `expected zero drift in output: ${out}`);
  } finally {
    cleanup();
  }
});

test('CLI2: default mode + drift fixture → exit 0, ROADMAP file rewritten with [x]', () => {
  // Build fixture where ROADMAP shows [ ] but SUMMARY exists (drift)
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'in flight',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: ' ', summary: 'present' }],
    }],
  });

  try {
    const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
    const before = fs.readFileSync(roadmapPath, 'utf-8');
    assert.ok(before.includes('- [ ]'), 'fixture starts with unchecked TRD');

    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap'], {
      encoding: 'utf-8',
      cwd: projectRoot,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);

    const after = fs.readFileSync(roadmapPath, 'utf-8');
    assert.ok(after.includes('- [x]'), 'ROADMAP was rewritten with [x]');
    assert.ok(!after.includes('- [ ] 01-01'), 'no longer unchecked');
  } finally {
    cleanup();
  }
});

test('CLI3: --dry-run flag → exit 0, ROADMAP unchanged on disk, JSON output has changes', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'in flight',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: ' ', summary: 'present' }],
    }],
  });

  try {
    const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
    const before = fs.readFileSync(roadmapPath, 'utf-8');

    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap', '--dry-run'], {
      encoding: 'utf-8',
      cwd: projectRoot,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);

    // ROADMAP must NOT be written in dry-run
    const after = fs.readFileSync(roadmapPath, 'utf-8');
    assert.strictEqual(before, after, 'ROADMAP.md unchanged in dry-run mode');

    // JSON output should show changes
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch (e) {
      assert.fail(`stdout not valid JSON: ${r.stdout.slice(0, 200)}`);
    }
    assert.ok(parsed.changes_count > 0, 'changes_count > 0');
    assert.strictEqual(parsed.mode, 'dry-run', 'mode is dry-run');
  } finally {
    cleanup();
  }
});

test('CLI4: --raw flag + drift fixture → human-readable text output to stdout', () => {
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'in flight',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: ' ', summary: 'present' }],
    }],
  });

  try {
    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap', '--dry-run', '--raw'], {
      encoding: 'utf-8',
      cwd: projectRoot,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // --raw produces human-readable text, not JSON
    let parsed = null;
    try { parsed = JSON.parse(r.stdout); } catch {}
    assert.ok(parsed === null, '--raw output should not be JSON');
    assert.ok(r.stdout.length > 0, 'has output');
  } finally {
    cleanup();
  }
});

test('CLI5: --interactive in non-TTY → warning on stderr + falls back to write mode', () => {
  // In subprocess (non-TTY), --interactive should warn and fall back to write mode
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'in flight',
      trds: [{ id: '01-01', slug: 'alpha', desc: 'desc', initial_checkbox: ' ', summary: 'present' }],
    }],
  });

  try {
    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap', '--interactive'], {
      encoding: 'utf-8',
      cwd: projectRoot,
      // stdin is not a TTY in spawnSync
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // Warning should appear on stderr
    assert.ok(
      r.stderr.includes('non-TTY') || r.stderr.includes('falling back'),
      `expected non-TTY warning in stderr: ${r.stderr}`,
    );
    // Write mode applied — ROADMAP should be updated
    const roadmapPath = path.join(projectRoot, '.planning', 'ROADMAP.md');
    const content = fs.readFileSync(roadmapPath, 'utf-8');
    assert.ok(content.includes('- [x]'), 'write mode applied after non-TTY fallback');
  } finally {
    cleanup();
  }
});

test('CLI6: ROADMAP missing → warning emitted, exit 0 (graceful)', () => {
  // Build tmpdir with no ROADMAP.md
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-cli6-'));
  fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  // No ROADMAP.md written

  try {
    const r = spawnSync('node', [DF_TOOLS, 'sync-roadmap', '--dry-run'], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // Should have emitted warning about missing ROADMAP
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch (e) {
      assert.fail(`stdout not valid JSON: ${r.stdout.slice(0, 200)}`);
    }
    assert.ok(parsed.warnings_count > 0 || parsed.warnings.length > 0, 'warning present');
    const hasRoadmapWarning = (parsed.warnings || []).some(w => w.kind === 'roadmap_missing');
    assert.ok(hasRoadmapWarning, 'roadmap_missing warning present');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── Group FP — _parseFlags unit tests ───────────────────────────────────────

test('FP1: --dry-run → { flags: { "dry-run": true }, positional: [] }', () => {
  const result = _parseFlags(['--dry-run']);
  assert.deepStrictEqual(result.flags, { 'dry-run': true });
  assert.deepStrictEqual(result.positional, []);
});

test('FP2: --interactive --raw → both flags true', () => {
  const result = _parseFlags(['--interactive', '--raw']);
  assert.strictEqual(result.flags['interactive'], true);
  assert.strictEqual(result.flags['raw'], true);
});

test('FP3: empty args → { flags: {}, positional: [] }', () => {
  const result = _parseFlags([]);
  assert.deepStrictEqual(result.flags, {});
  assert.deepStrictEqual(result.positional, []);
});

test('FP4: unknown --flag treated as boolean flag', () => {
  const result = _parseFlags(['--unknown-flag']);
  assert.strictEqual(result.flags['unknown-flag'], true);
});

// ─── Group RS — _renderSummary unit tests ────────────────────────────────────

test('RS1: empty result → "No drift detected. ROADMAP matches disk truth."', () => {
  const result = _renderSummary({ changes: [], warnings: [] });
  assert.strictEqual(result, 'No drift detected. ROADMAP matches disk truth.');
});

test('RS2: 1 change → includes kind + obj + trd + before/after lines', () => {
  const result = _renderSummary({
    changes: [{
      kind: 'trd_summary_exists',
      objective_num: '01',
      trd_id: '01-01',
      before: '- [ ] 01-01-foo-TRD.md — some desc',
      after: '- [x] 01-01-foo-TRD.md — some desc',
    }],
    warnings: [],
  });
  assert.ok(result.includes('trd_summary_exists'), 'kind present');
  assert.ok(result.includes('01'), 'objective_num present');
  assert.ok(result.includes('01-01'), 'trd_id present');
  assert.ok(result.includes('- [ ]'), 'before line');
  assert.ok(result.includes('- [x]'), 'after line');
});

test('RS3: warnings → "Warnings: N" line + per-warning detail', () => {
  const result = _renderSummary({
    changes: [],
    warnings: [{ kind: 'trd_orphan_warning', message: 'missing TRD file for 01-01' }],
  });
  assert.ok(result.includes('Warnings: 1'), 'warnings count');
  assert.ok(result.includes('trd_orphan_warning'), 'warning kind');
});

test('RS4: mixed changes + warnings → both sections present', () => {
  const result = _renderSummary({
    changes: [{
      kind: 'trd_summary_exists',
      objective_num: '01',
      trd_id: '01-01',
      before: '- [ ] 01-01-foo-TRD.md — desc',
      after: '- [x] 01-01-foo-TRD.md — desc',
    }],
    warnings: [{ kind: 'trd_orphan_warning', message: 'orphan' }],
  });
  assert.ok(result.includes('Drift corrected'), 'changes section');
  assert.ok(result.includes('Warnings:'), 'warnings section');
});

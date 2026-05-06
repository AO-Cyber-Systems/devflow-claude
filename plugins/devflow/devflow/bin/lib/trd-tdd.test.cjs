'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  parseTrdTasks,
  resolveEffectiveTddFlag,
  cmdTrdTddInspect,
  _setRunFs,
  _resetMocks,
} = require('./trd-tdd.cjs');

const {
  buildLegacyTddTrd,
  buildTaskLevelTddTrd,
  buildOverrideTddTrd,
  buildMalformedTrd,
  buildUnquotedAttrTrd,
} = require('./__fixtures__/trd-tdd-fixtures.cjs');

// ─── Group F: Fixture sanity ──────────────────────────────────────────────────

describe('F — Fixtures', () => {
  test('F1: buildLegacyTddTrd() returns valid TRD with type:tdd + 2 tasks', () => {
    const content = buildLegacyTddTrd();
    assert.ok(content.includes('type: tdd'), 'should have TRD-level type:tdd');
    assert.ok(content.includes('<TASK-EX'), 'should contain TASK-EX elements');
    const count = (content.match(/<TASK-EX/g) || []).length;
    assert.equal(count, 2, 'should have 2 tasks');
  });

  test('F2: buildTaskLevelTddTrd() returns type:standard + mixed tasks', () => {
    const content = buildTaskLevelTddTrd();
    assert.ok(content.includes('type: standard'), 'should have type:standard');
    assert.ok(content.includes('tdd="true"'), 'task 1 should have tdd="true"');
    // Task 2 should have no tdd attr
    const lines = content.split('\n');
    const task2Line = lines.find(l => l.includes('Task 2'));
    assert.ok(!task2Line || !task2Line.includes('tdd='), 'task 2 name line should not have tdd attr');
  });

  test('F3: buildOverrideTddTrd() returns type:tdd + one task with tdd="false"', () => {
    const content = buildOverrideTddTrd();
    assert.ok(content.includes('type: tdd'), 'should have TRD-level type:tdd');
    assert.ok(content.includes('tdd="false"'), 'should have a task with tdd="false"');
  });

  test('F4: buildMalformedTrd() returns broken TASK-EX (no closing >)', () => {
    const content = buildMalformedTrd();
    assert.ok(content.includes('MISSING_CLOSING_BRACKET'), 'should contain malformed tag');
  });
});

// ─── Group PA: parseTrdTasks ──────────────────────────────────────────────────

describe('PA — parseTrdTasks', () => {
  test('PA1: parse legacy type:tdd TRD with 2 tasks → tdd_attr:null for both', () => {
    const content = buildLegacyTddTrd();
    const result = parseTrdTasks(content);
    assert.equal(result.frontmatter.type, 'tdd', 'frontmatter.type should be tdd');
    assert.equal(result.tasks.length, 2, 'should parse 2 tasks');
    assert.equal(result.tasks[0].tdd_attr, null, 'task 1 tdd_attr should be null (no attr)');
    assert.equal(result.tasks[1].tdd_attr, null, 'task 2 tdd_attr should be null (no attr)');
    assert.equal(result.tasks[0].type, 'tdd', 'task 1 type should be tdd');
    assert.equal(result.tasks[1].type, 'tdd', 'task 2 type should be tdd');
  });

  test('PA2: parse task-level TRD with mixed tdd="true" + no flag → correct attrs', () => {
    const content = buildTaskLevelTddTrd();
    const result = parseTrdTasks(content);
    assert.equal(result.frontmatter.type, 'standard', 'frontmatter.type should be standard');
    assert.equal(result.tasks.length, 2, 'should parse 2 tasks');
    assert.equal(result.tasks[0].tdd_attr, true, 'task 1 tdd_attr should be true');
    assert.equal(result.tasks[0].type, 'auto', 'task 1 type should be auto');
    assert.equal(result.tasks[1].tdd_attr, null, 'task 2 tdd_attr should be null (no attr)');
    assert.equal(result.tasks[1].type, 'auto', 'task 2 type should be auto');
  });

  test('PA3: parse with unquoted tdd=true → resolves to tdd_attr:true', () => {
    const content = buildUnquotedAttrTrd();
    const result = parseTrdTasks(content);
    assert.equal(result.tasks.length, 1, 'should parse 1 task');
    assert.equal(result.tasks[0].tdd_attr, true, 'unquoted tdd=true should resolve to true');
  });

  test('PA4: parse with explicit tdd="false" → tdd_attr:false', () => {
    const content = buildOverrideTddTrd();
    const result = parseTrdTasks(content);
    assert.equal(result.tasks.length, 2, 'should parse 2 tasks');
    assert.equal(result.tasks[0].tdd_attr, null, 'task 1 has no tdd attr');
    assert.equal(result.tasks[1].tdd_attr, false, 'task 2 tdd_attr should be false');
  });

  test('PA5: parse TRD with no tasks → empty tasks array', () => {
    const emptyTrd = `---
objective: 99-test
trd: 99
type: standard
wave: 1
---

<objective>No tasks here.</objective>
`;
    const result = parseTrdTasks(emptyTrd);
    assert.deepEqual(result.tasks, [], 'tasks should be empty array');
    assert.equal(result.frontmatter.type, 'standard', 'should still parse frontmatter');
  });

  test('PA6: parse malformed TRD (no closing >) → graceful skip, returns parsed-so-far', () => {
    const content = buildMalformedTrd();
    // Should not throw
    let result;
    assert.doesNotThrow(() => { result = parseTrdTasks(content); }, 'should not throw on malformed TRD');
    // Should return at least task 1 (the well-formed one)
    assert.ok(Array.isArray(result.tasks), 'tasks should be an array');
    // Well-formed task 1 should be present
    assert.ok(result.tasks.length >= 1, 'should parse at least 1 well-formed task');
    assert.equal(result.tasks[0].tdd_attr, true, 'task 1 should have tdd_attr:true');
  });
});

// ─── Group RE: resolveEffectiveTddFlag ────────────────────────────────────────

describe('RE — resolveEffectiveTddFlag', () => {
  test('RE1: resolveEffectiveTddFlag("tdd", null) → true (legacy back-compat)', () => {
    assert.equal(resolveEffectiveTddFlag('tdd', null), true);
  });

  test('RE2: resolveEffectiveTddFlag("tdd", true) → true (explicit, redundant but valid)', () => {
    assert.equal(resolveEffectiveTddFlag('tdd', true), true);
  });

  test('RE3: resolveEffectiveTddFlag("tdd", false) → false (explicit task override)', () => {
    assert.equal(resolveEffectiveTddFlag('tdd', false), false);
  });

  test('RE4: resolveEffectiveTddFlag("standard", true) → true (new task-level pattern)', () => {
    assert.equal(resolveEffectiveTddFlag('standard', true), true);
  });

  test('RE5: resolveEffectiveTddFlag("standard", null) → false (no TDD marker)', () => {
    assert.equal(resolveEffectiveTddFlag('standard', null), false);
  });

  test('RE6: resolveEffectiveTddFlag("standard", false) → false (explicit no-TDD)', () => {
    assert.equal(resolveEffectiveTddFlag('standard', false), false);
  });

  test('RE7: resolveEffectiveTddFlag(undefined, true) → true (missing frontmatter type)', () => {
    assert.equal(resolveEffectiveTddFlag(undefined, true), true);
  });

  test('RE8: resolveEffectiveTddFlag(undefined, null) → false (no type, no task attr)', () => {
    assert.equal(resolveEffectiveTddFlag(undefined, null), false);
  });
});

// ─── Group CLI: cmdTrdTddInspect ──────────────────────────────────────────────

describe('CLI — cmdTrdTddInspect', () => {
  let tmpDir;
  let capturedOutput;
  let capturedExitCode;
  const originalExit = process.exit;
  const originalStdout = process.stdout.write.bind(process.stdout);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trd-tdd-test-'));
    capturedOutput = '';
    capturedExitCode = null;

    // Mock process.exit and stdout
    process.exit = (code) => { capturedExitCode = code; throw new Error(`EXIT:${code}`); };
    process.stdout.write = (data) => { capturedOutput += data; return true; };
  });

  afterEach(() => {
    process.exit = originalExit;
    process.stdout.write = originalStdout;
    _resetMocks();
    // Clean up tmpDir
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  });

  test('CLI1: inspect legacy type:tdd TRD → all tasks have tdd_effective:true', () => {
    const trdPath = path.join(tmpDir, 'legacy.md');
    fs.writeFileSync(trdPath, buildLegacyTddTrd(), 'utf-8');

    try { cmdTrdTddInspect(tmpDir, trdPath, false); } catch (e) {
      if (!e.message.startsWith('EXIT:')) throw e;
    }

    assert.equal(capturedExitCode, 0, 'should exit 0');
    const parsed = JSON.parse(capturedOutput);
    assert.equal(parsed.frontmatter.type, 'tdd', 'frontmatter type should be tdd');
    assert.equal(parsed.tasks.length, 2, 'should have 2 tasks');
    assert.equal(parsed.tasks[0].tdd_effective, true, 'task 1 should have tdd_effective:true');
    assert.equal(parsed.tasks[1].tdd_effective, true, 'task 2 should have tdd_effective:true');
  });

  test('CLI2: inspect task-level TRD → mixed tdd_effective per task', () => {
    const trdPath = path.join(tmpDir, 'task-level.md');
    fs.writeFileSync(trdPath, buildTaskLevelTddTrd(), 'utf-8');

    try { cmdTrdTddInspect(tmpDir, trdPath, false); } catch (e) {
      if (!e.message.startsWith('EXIT:')) throw e;
    }

    assert.equal(capturedExitCode, 0, 'should exit 0');
    const parsed = JSON.parse(capturedOutput);
    assert.equal(parsed.tasks.length, 2, 'should have 2 tasks');
    assert.equal(parsed.tasks[0].tdd_effective, true, 'task 1 (tdd="true") should have tdd_effective:true');
    assert.equal(parsed.tasks[1].tdd_effective, false, 'task 2 (no tdd attr) should have tdd_effective:false');
  });

  test('CLI3: inspect missing file → exits 1, error JSON', () => {
    const missingPath = path.join(tmpDir, 'nonexistent.md');

    try { cmdTrdTddInspect(tmpDir, missingPath, false); } catch (e) {
      if (!e.message.startsWith('EXIT:')) throw e;
    }

    assert.equal(capturedExitCode, 1, 'should exit 1 for missing file');
    const parsed = JSON.parse(capturedOutput);
    assert.ok(parsed.error, 'should have error field');
    assert.ok(parsed.path, 'should have path field');
  });

  test('CLI4: --raw flag returns canonical JSON (no decoration)', () => {
    const trdPath = path.join(tmpDir, 'raw-test.md');
    fs.writeFileSync(trdPath, buildTaskLevelTddTrd(), 'utf-8');

    try { cmdTrdTddInspect(tmpDir, trdPath, true); } catch (e) {
      if (!e.message.startsWith('EXIT:')) throw e;
    }

    assert.equal(capturedExitCode, 0, 'should exit 0');
    // With raw=true, output() passes rawValue; no pretty-printing; still valid JSON
    assert.doesNotThrow(() => JSON.parse(capturedOutput), 'raw output should be valid JSON');
  });

  test('CLI-inject: _setRunFs mock allows injecting virtual fs', () => {
    const fakeContent = buildLegacyTddTrd();
    const fakePath = '/fake/legacy.md';

    _setRunFs({
      existsSync: (p) => p === fakePath,
      readFileSync: (p) => { if (p === fakePath) return fakeContent; throw new Error('not found'); },
    });

    try { cmdTrdTddInspect('/fake', fakePath, false); } catch (e) {
      if (!e.message.startsWith('EXIT:')) throw e;
    }

    assert.equal(capturedExitCode, 0, 'should exit 0 with injected fs');
    const parsed = JSON.parse(capturedOutput);
    assert.equal(parsed.tasks.length, 2, 'should parse 2 tasks from injected content');
  });
});

// ─── Group EX: Export-lock ────────────────────────────────────────────────────

describe('EX — Export lock', () => {
  test('EX1: module exports exactly 5 entries (canonical surface)', () => {
    const mod = require('./trd-tdd.cjs');
    const keys = Object.keys(mod).sort();
    const expected = ['_resetMocks', '_setRunFs', 'cmdTrdTddInspect', 'parseTrdTasks', 'resolveEffectiveTddFlag'].sort();
    assert.deepEqual(keys, expected, `Expected 5 exports: ${expected.join(', ')}`);
  });

  test('EX2: module source contains LOCKED banner comment', () => {
    const modPath = require.resolve('./trd-tdd.cjs');
    const source = fs.readFileSync(modPath, 'utf-8');
    assert.ok(
      source.includes('LOCKED by TRD 12-05'),
      'module should have LOCKED by TRD 12-05 banner'
    );
  });
});

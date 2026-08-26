'use strict';

/**
 * override.test.cjs — TRD 30-04
 *
 * The point of a structured override is that it leaves a trace. These tests
 * pin the two properties that make the trace useful: a reason is mandatory,
 * and repeated overrides of one gate surface as "needs rescoping".
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { recordOverride, readOverrides, pruneLog, GATES } = require('./override.cjs');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-override-'));
  fs.mkdirSync(path.join(dir, '.planning'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const pd = () => path.join(dir, '.planning');

describe('recordOverride()', () => {
  test('records gate, reason and timestamp', () => {
    const r = recordOverride({ planningDir: pd(), gate: 'edits', reason: 'hotfix', now: '2026-08-19T00:00:00Z' });
    assert.equal(r.ok, true);
    assert.equal(r.gate, 'edits');
    assert.equal(r.reason, 'hotfix');
    assert.equal(r.at, '2026-08-19T00:00:00Z');
  });

  test('arms the marker for marker-driven gates', () => {
    recordOverride({ planningDir: pd(), gate: 'edits', reason: 'x' });
    assert.ok(fs.existsSync(path.join(pd(), GATES.edits)), 'edit gate marker must be armed');
  });

  test('env-var gates are logged but arm no marker', () => {
    const r = recordOverride({ planningDir: pd(), gate: 'commits', reason: 'release chore' });
    assert.equal(r.ok, true);
    assert.equal(r.marker, null);
    assert.equal(readOverrides({ planningDir: pd() }).total, 1, 'still logged');
  });

  test('a reason is mandatory — this is the whole point', () => {
    for (const bad of [undefined, null, '', '   ']) {
      const r = recordOverride({ planningDir: pd(), gate: 'edits', reason: bad });
      assert.equal(r.ok, false);
      assert.equal(r.reason_code, 'missing-reason');
    }
  });

  test('unknown gates are refused with the known list', () => {
    const r = recordOverride({ planningDir: pd(), gate: 'nope', reason: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.reason_code, 'unknown-gate');
    assert.match(r.message, /edits/);
  });

  test('missing planning dir is refused, not crashed', () => {
    const r = recordOverride({ planningDir: null, gate: 'edits', reason: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.reason_code, 'no-planning-dir');
  });
});

describe('readOverrides()', () => {
  test('returns empty state when nothing has been logged', () => {
    const r = readOverrides({ planningDir: pd() });
    assert.deepEqual(r.entries, []);
    assert.equal(r.total, 0);
  });

  test('newest first, tallied by gate', () => {
    recordOverride({ planningDir: pd(), gate: 'edits', reason: 'first', now: '2026-01-01T00:00:00Z' });
    recordOverride({ planningDir: pd(), gate: 'commits', reason: 'second', now: '2026-01-02T00:00:00Z' });
    const r = readOverrides({ planningDir: pd() });
    assert.equal(r.entries[0].reason, 'second', 'newest must come first');
    assert.deepEqual(r.by_gate, { edits: 1, commits: 1 });
    assert.equal(r.total, 2);
  });

  test('a gate overridden 5+ times is flagged as needing rescoping', () => {
    for (let i = 0; i < 5; i++) {
      recordOverride({ planningDir: pd(), gate: 'edits', reason: `attempt ${i}` });
    }
    const r = readOverrides({ planningDir: pd() });
    assert.deepEqual(r.needs_rescoping, [{ gate: 'edits', overrides: 5 }]);
  });

  test('four overrides is not yet a pattern', () => {
    for (let i = 0; i < 4; i++) recordOverride({ planningDir: pd(), gate: 'edits', reason: `a${i}` });
    assert.deepEqual(readOverrides({ planningDir: pd() }).needs_rescoping, []);
  });

  test('a corrupt line does not lose the rest of the log', () => {
    recordOverride({ planningDir: pd(), gate: 'edits', reason: 'good one' });
    fs.appendFileSync(path.join(pd(), '.override-log.jsonl'), '{{{ not json\n');
    recordOverride({ planningDir: pd(), gate: 'edits', reason: 'another' });
    const r = readOverrides({ planningDir: pd() });
    assert.equal(r.total, 2, 'both valid entries survive the corrupt line');
  });

  test('limit caps the returned entries but not the tally', () => {
    for (let i = 0; i < 10; i++) recordOverride({ planningDir: pd(), gate: 'edits', reason: `r${i}` });
    const r = readOverrides({ planningDir: pd(), limit: 3 });
    assert.equal(r.entries.length, 3);
    assert.equal(r.total, 10);
  });
});

describe('pruneLog()', () => {
  test('keeps the newest entries and drops the rest', () => {
    for (let i = 0; i < 12; i++) recordOverride({ planningDir: pd(), gate: 'edits', reason: `r${i}` });
    const res = pruneLog(pd(), 5);
    assert.equal(res.pruned, 7);
    const r = readOverrides({ planningDir: pd(), limit: 100 });
    assert.equal(r.total, 5);
    assert.equal(r.entries[0].reason, 'r11', 'newest retained');
  });

  test('is a no-op below the cap', () => {
    recordOverride({ planningDir: pd(), gate: 'edits', reason: 'x' });
    assert.equal(pruneLog(pd(), 500).pruned, 0);
  });
});

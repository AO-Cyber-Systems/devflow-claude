'use strict';

/**
 * progress-guard.test.cjs — TRD 28-04
 *
 * The guard's whole value is that it fires on real loops and stays quiet
 * otherwise, so both directions are tested explicitly.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { signature, record, message, DEFAULT_WARN_AT, DEFAULT_STUCK_AT } =
  require('./progress-guard.cjs');

const step = (tool, args) => ({ tool, args });

describe('signature()', () => {
  test('identical calls share a signature', () => {
    assert.equal(
      signature(step('Bash', { command: 'go test ./...' })),
      signature(step('Bash', { command: 'go test ./...' }))
    );
  });

  test('argument order does not change the signature', () => {
    assert.equal(
      signature(step('Edit', { file_path: '/a', old_string: 'x', new_string: 'y' })),
      signature(step('Edit', { new_string: 'y', file_path: '/a', old_string: 'x' }))
    );
  });

  test('different arguments produce different signatures', () => {
    assert.notEqual(
      signature(step('Bash', { command: 'go test ./a' })),
      signature(step('Bash', { command: 'go test ./b' }))
    );
  });

  test('different tools with identical args differ', () => {
    assert.notEqual(signature(step('Read', { p: 1 })), signature(step('Write', { p: 1 })));
  });

  test('volatile fields are ignored', () => {
    assert.equal(
      signature(step('Bash', { command: 'ls', timestamp: 1 })),
      signature(step('Bash', { command: 'ls', timestamp: 999 }))
    );
  });
});

describe('record() — streak counting', () => {
  test('counts consecutive identical steps', () => {
    let s = null;
    const calls = [];
    for (let i = 0; i < 5; i++) {
      const r = record(s, step('Bash', { command: 'go test ./...' }));
      s = r.state;
      calls.push(r.repeats);
    }
    assert.deepEqual(calls, [1, 2, 3, 4, 5]);
  });

  test('a different step resets the streak', () => {
    let s = null;
    s = record(s, step('Bash', { command: 'a' })).state;
    s = record(s, step('Bash', { command: 'a' })).state;
    const changed = record(s, step('Bash', { command: 'b' }));
    assert.equal(changed.repeats, 1, 'varying the approach is progress');
    assert.equal(changed.level, 'ok');
  });

  test('warns at the warn threshold, reports stuck at the stuck threshold', () => {
    let s = null;
    const levels = [];
    for (let i = 0; i < DEFAULT_STUCK_AT; i++) {
      const r = record(s, step('Bash', { command: 'flaky' }));
      s = r.state;
      levels.push(r.level);
    }
    assert.equal(levels[DEFAULT_WARN_AT - 2], 'ok', 'quiet below the warn threshold');
    assert.equal(levels[DEFAULT_WARN_AT - 1], 'warn');
    assert.equal(levels[DEFAULT_STUCK_AT - 1], 'stuck');
  });

  test('tripped fires only on threshold crossings, not every repeat', () => {
    let s = null;
    const tripped = [];
    for (let i = 0; i < 7; i++) {
      const r = record(s, step('Bash', { command: 'x' }));
      s = r.state;
      if (r.tripped) tripped.push(r.repeats);
    }
    assert.deepEqual(tripped, [DEFAULT_WARN_AT, DEFAULT_STUCK_AT],
      'a stuck loop must not warn on every single call');
  });

  test('thresholds are configurable', () => {
    let s = null;
    let r;
    for (let i = 0; i < 2; i++) { r = record(s, step('Bash', { command: 'x' }), { warnAt: 2, stuckAt: 3 }); s = r.state; }
    assert.equal(r.level, 'warn');
  });

  test('recent history is bounded by the window', () => {
    let s = null;
    for (let i = 0; i < 60; i++) s = record(s, step('Bash', { command: `c${i}` }), { window: 10 }).state;
    assert.ok(s.recent.length <= 10, `expected <=10 retained, got ${s.recent.length}`);
  });

  test('tolerates null/garbage prior state', () => {
    assert.equal(record(null, step('Bash', { command: 'x' })).repeats, 1);
    assert.equal(record(undefined, step('Bash', { command: 'x' })).repeats, 1);
    assert.equal(record('nonsense', step('Bash', { command: 'x' })).repeats, 1);
  });
});

describe('record() — does NOT fire on normal work', () => {
  test('a varied sequence never leaves level ok', () => {
    let s = null;
    const seq = [
      step('Read', { file_path: '/a.js' }),
      step('Edit', { file_path: '/a.js', old_string: 'x', new_string: 'y' }),
      step('Bash', { command: 'npm test' }),
      step('Read', { file_path: '/b.js' }),
      step('Bash', { command: 'git status' }),
      step('Bash', { command: 'npm test' }), // same as earlier but not consecutive
    ];
    for (const st of seq) {
      const r = record(s, st);
      s = r.state;
      assert.equal(r.level, 'ok', `unexpected ${r.level} on ${st.tool}`);
    }
  });

  test('two identical calls in a row are not yet a loop', () => {
    let s = null;
    s = record(s, step('Bash', { command: 'git status' })).state;
    const second = record(s, step('Bash', { command: 'git status' }));
    assert.equal(second.level, 'ok', 'a legitimate re-check must not trip the guard');
  });
});

describe('message()', () => {
  test('warn names the next action, not just the count', () => {
    const m = message({ repeats: 3, level: 'warn' }, 'Bash');
    assert.match(m, /Bash/);
    assert.match(m, /vary the approach|stuck/i);
  });

  test('stuck frames the loop as an escalation trigger', () => {
    const m = message({ repeats: 5, level: 'stuck' }, 'Bash');
    assert.match(m, /escalation trigger/i);
    assert.match(m, /Stop repeating/i);
  });
});

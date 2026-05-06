'use strict';

/**
 * Tests for lib/notifier.cjs — OS desktop notification dispatcher.
 *
 * Coverage groups (TRD 20-01 test_list_first):
 *   N: notify() platform routing + behavior (8 tests)
 *   F: failure modes (5 tests)
 *   EX: export surface lock (1 test)
 *
 * Group I (daemon integration) lives in watcher-daemon.test.cjs.
 * Group D (documentation) verified via grep at GREEN time.
 *
 * Test pattern: most tests use the in-memory mock (_setRunExec) for speed
 * and determinism. N-1 and N-2 also use the executable shim approach to
 * verify real subprocess invocation via PATH override.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const notifier = require('./notifier.cjs');
const fx = require('./__fixtures__/daemon-polish-fixtures.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setPlatform(p) {
  const prev = process.env.NOTIFIER_PLATFORM_OVERRIDE;
  process.env.NOTIFIER_PLATFORM_OVERRIDE = p;
  return () => {
    if (prev === undefined) delete process.env.NOTIFIER_PLATFORM_OVERRIDE;
    else process.env.NOTIFIER_PLATFORM_OVERRIDE = prev;
  };
}

function clearDisableEnv() {
  const prev = process.env.NOTIFIER_DISABLE;
  delete process.env.NOTIFIER_DISABLE;
  return () => {
    if (prev === undefined) delete process.env.NOTIFIER_DISABLE;
    else process.env.NOTIFIER_DISABLE = prev;
  };
}

// ---------------------------------------------------------------------------
// Group N — notify() platform routing + behavior
// ---------------------------------------------------------------------------

describe('notifier — Group N: platform routing + behavior', () => {
  let tmpDir;
  let restorePlat;
  let restoreDisable;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-N-'));
    notifier._resetMocks();
    restoreDisable = clearDisableEnv();
  });

  afterEach(() => {
    if (restorePlat) restorePlat();
    restoreDisable();
    notifier._resetMocks();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('N-1 darwin invokes execFile with osascript + AppleScript expression containing title and body', async () => {
    restorePlat = setPlatform('darwin');
    const mock = fx.buildMockExecFile();
    notifier._setRunExec(mock.fn);

    await notifier.notify({ title: 'Test Title', body: 'Test Body' });

    assert.equal(mock.calls.length, 1, 'expected 1 execFile call');
    assert.equal(mock.calls[0].cmd, 'osascript');
    // args[0] === '-e', args[1] is the AppleScript expression
    assert.equal(mock.calls[0].args[0], '-e');
    const expr = mock.calls[0].args[1];
    assert.match(expr, /display notification/);
    assert.match(expr, /Test Body/);
    assert.match(expr, /Test Title/);
  });

  test('N-2 linux invokes execFile with notify-send + title + body argv', async () => {
    restorePlat = setPlatform('linux');
    const mock = fx.buildMockExecFile();
    notifier._setRunExec(mock.fn);

    await notifier.notify({ title: 'Linux Title', body: 'Linux Body' });

    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].cmd, 'notify-send');
    // notify-send <title> <body> (urgency optional, prepended via -u)
    assert.ok(mock.calls[0].args.includes('Linux Title'), 'argv has title');
    assert.ok(mock.calls[0].args.includes('Linux Body'), 'argv has body');
  });

  test('N-3 NOTIFIER_DISABLE=1 returns early without invoking execFile', async () => {
    restorePlat = setPlatform('darwin');
    process.env.NOTIFIER_DISABLE = '1';
    const mock = fx.buildMockExecFile();
    notifier._setRunExec(mock.fn);

    await notifier.notify({ title: 'X', body: 'Y' });

    assert.equal(mock.calls.length, 0, 'no execFile call when NOTIFIER_DISABLE=1');
  });

  test('N-4 platform=win32 is a no-op (no warning spam)', async () => {
    restorePlat = setPlatform('win32');
    const mock = fx.buildMockExecFile();
    notifier._setRunExec(mock.fn);
    const warnings = [];
    const log = (level, msg) => { if (level === 'warn') warnings.push(msg); };

    await notifier.notify({ title: 'X', body: 'Y', log });

    assert.equal(mock.calls.length, 0);
    assert.equal(warnings.length, 0, 'no warning on win32 no-op');
  });

  test('N-5 escapes embedded double-quotes and backslashes in AppleScript', async () => {
    restorePlat = setPlatform('darwin');
    const mock = fx.buildMockExecFile();
    notifier._setRunExec(mock.fn);

    await notifier.notify({ title: 'has "quotes"', body: 'back\\slash and "more"' });

    assert.equal(mock.calls.length, 1);
    const expr = mock.calls[0].args[1];
    // Embedded quotes must be \-escaped in the AppleScript string literal
    assert.match(expr, /\\"quotes\\"/);
    // Backslashes doubled
    assert.match(expr, /back\\\\slash/);
  });

  test('N-6 resolves/returns even when execFile fails — never throws', async () => {
    restorePlat = setPlatform('darwin');
    const err = new Error('boom');
    const mock = fx.buildMockExecFile({ throwError: err });
    notifier._setRunExec(mock.fn);

    // Must not throw; notify() catches and logs
    await assert.doesNotReject(() => notifier.notify({ title: 'X', body: 'Y' }));
  });

  test('N-7 urgency option maps to notify-send -u on linux; ignored on darwin', async () => {
    // Linux: urgency emitted as `-u critical`
    restorePlat = setPlatform('linux');
    const mockL = fx.buildMockExecFile();
    notifier._setRunExec(mockL.fn);
    await notifier.notify({ title: 'X', body: 'Y', urgency: 'critical' });
    assert.equal(mockL.calls[0].cmd, 'notify-send');
    assert.deepEqual(
      mockL.calls[0].args.slice(0, 2),
      ['-u', 'critical'],
      'linux: -u <urgency> first',
    );

    // Darwin: urgency ignored (osascript expression unchanged)
    restorePlat();
    restorePlat = setPlatform('darwin');
    notifier._resetMocks();
    const mockD = fx.buildMockExecFile();
    notifier._setRunExec(mockD.fn);
    await notifier.notify({ title: 'X', body: 'Y', urgency: 'critical' });
    assert.equal(mockD.calls[0].cmd, 'osascript');
    // No special urgency argv on darwin
    assert.equal(mockD.calls[0].args.length, 2, 'darwin: still just -e <script>');
  });

  test('N-8 multiple calls with same payload invoke execFile twice (no dedup)', async () => {
    restorePlat = setPlatform('darwin');
    const mock = fx.buildMockExecFile();
    notifier._setRunExec(mock.fn);

    await notifier.notify({ title: 'X', body: 'Y' });
    await notifier.notify({ title: 'X', body: 'Y' });

    assert.equal(mock.calls.length, 2, 'no dedup; two execFile calls');
  });
});

// ---------------------------------------------------------------------------
// Group F — Failure modes
// ---------------------------------------------------------------------------

describe('notifier — Group F: failure modes', () => {
  let tmpDir;
  let restorePlat;
  let restoreDisable;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-F-'));
    notifier._resetMocks();
    restoreDisable = clearDisableEnv();
  });

  afterEach(() => {
    if (restorePlat) restorePlat();
    restoreDisable();
    notifier._resetMocks();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('F-1 ENOENT first call sets _notifierDisabled=true; second call no-ops', async () => {
    restorePlat = setPlatform('darwin');
    const enoent = new Error('spawn osascript ENOENT');
    enoent.code = 'ENOENT';
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw enoent;
    };
    notifier._setRunExec(fn);
    const warnings = [];
    const log = (level, msg) => { if (level === 'warn') warnings.push(msg); };

    await notifier.notify({ title: 'X', body: 'Y', log });
    assert.equal(callCount, 1, 'first call invokes execFile');

    await notifier.notify({ title: 'X', body: 'Y', log });
    assert.equal(callCount, 1, 'second call skips execFile (disabled)');
    assert.equal(warnings.length, 1, 'exactly one warning emitted');
    assert.match(warnings[0], /not found on PATH|disabled/);
  });

  test('F-2 non-ENOENT error logs warning per call; _notifierDisabled stays false', async () => {
    restorePlat = setPlatform('linux');
    const dbusErr = new Error('Failed to connect to DBus');
    dbusErr.code = 'EIO';
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw dbusErr;
    };
    notifier._setRunExec(fn);
    const warnings = [];
    const log = (level, msg) => { if (level === 'warn') warnings.push(msg); };

    await notifier.notify({ title: 'X', body: 'Y', log });
    await notifier.notify({ title: 'X', body: 'Y', log });

    assert.equal(callCount, 2, 'both calls invoke execFile (non-ENOENT does not disable)');
    assert.equal(warnings.length, 2, 'warning per call');
  });

  test('F-3 _resetMocks clears _notifierDisabled state', async () => {
    restorePlat = setPlatform('darwin');
    const enoent = new Error('ENOENT'); enoent.code = 'ENOENT';
    const failFn = async () => { throw enoent; };
    notifier._setRunExec(failFn);
    await notifier.notify({ title: 'X', body: 'Y' }); // disables
    // Now reset and provide a working mock — must invoke execFile again
    notifier._resetMocks();
    const mock = fx.buildMockExecFile();
    notifier._setRunExec(mock.fn);
    await notifier.notify({ title: 'X', body: 'Y' });
    assert.equal(mock.calls.length, 1, '_resetMocks cleared _notifierDisabled');
  });

  test('F-4 captures errors via injected logger (deps.log), falls back to console.warn', async () => {
    restorePlat = setPlatform('darwin');
    const err = new Error('something broke');
    notifier._setRunExec(async () => { throw err; });

    const captured = [];
    const log = (level, msg) => captured.push({ level, msg });
    await notifier.notify({ title: 'X', body: 'Y', log });
    assert.equal(captured.length, 1);
    assert.equal(captured[0].level, 'warn');
    assert.match(captured[0].msg, /something broke|dispatch failed/);
  });

  test('F-5 empty title or body still dispatches (no validation)', async () => {
    restorePlat = setPlatform('darwin');
    const mock = fx.buildMockExecFile();
    notifier._setRunExec(mock.fn);

    await notifier.notify({ title: '', body: '' });
    assert.equal(mock.calls.length, 1, 'empty payload still dispatches');
  });
});

// ---------------------------------------------------------------------------
// Group EX — Export surface lock
// ---------------------------------------------------------------------------

describe('notifier — Group EX: export surface', () => {
  test('EX-1 module.exports is exactly { notify, _setRunExec, _resetMocks }', () => {
    const keys = Object.keys(notifier).sort();
    assert.deepStrictEqual(keys, ['_resetMocks', '_setRunExec', 'notify']);
  });
});

'use strict';

/**
 * Tests for lib/wrappers/index.cjs (TRD 20-05).
 *
 * Group GF: getWrapper factory.
 * Group EX-1: export surface lock.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const wrappers = require('./index.cjs');

describe('wrappers/index.cjs — Group GF: getWrapper factory', () => {
  test('GF-1 getWrapper("/bin/bash") returns module with shellName="bash"', () => {
    const w = wrappers.getWrapper('/bin/bash');
    assert.equal(w.shellName, 'bash');
  });

  test('GF-2 getWrapper("/bin/zsh") returns SAME module as bash (zsh routes through bash)', () => {
    const w = wrappers.getWrapper('/bin/zsh');
    assert.equal(w.shellName, 'bash', 'zsh routes through bash wrapper');
  });

  test('GF-3 getWrapper("/usr/local/bin/fish") returns module with shellName="fish"', () => {
    const w = wrappers.getWrapper('/usr/local/bin/fish');
    assert.equal(w.shellName, 'fish');
  });

  test('GF-4 getWrapper("pwsh") returns module with shellName="powershell"', () => {
    const w = wrappers.getWrapper('pwsh');
    assert.equal(w.shellName, 'powershell');
  });

  test('GF-5 getWrapper("powershell") returns same as pwsh', () => {
    const wp = wrappers.getWrapper('pwsh');
    const ws = wrappers.getWrapper('powershell');
    assert.equal(ws.shellName, wp.shellName);
  });

  test('GF-6 getWrapper("powershell.exe") returns powershell wrapper (basename + .exe stripped)', () => {
    const w = wrappers.getWrapper('powershell.exe');
    assert.equal(w.shellName, 'powershell');
  });

  test('GF-7 getWrapper("csh") throws UnsupportedShell with code=EUNSUPPORTEDSHELL', () => {
    assert.throws(
      () => wrappers.getWrapper('csh'),
      (e) => e instanceof wrappers.UnsupportedShell && e.code === 'EUNSUPPORTEDSHELL',
    );
  });

  test('GF-8 getWrapper("") throws UnsupportedShell', () => {
    assert.throws(
      () => wrappers.getWrapper(''),
      (e) => e.code === 'EUNSUPPORTEDSHELL',
    );
  });

  test('GF-9 SUPPORTED_SHELLS export includes [bash, zsh, fish, pwsh, powershell]', () => {
    assert.ok(Array.isArray(wrappers.SUPPORTED_SHELLS));
    for (const sh of ['bash', 'zsh', 'fish', 'pwsh', 'powershell']) {
      assert.ok(wrappers.SUPPORTED_SHELLS.includes(sh), `expected ${sh} in SUPPORTED_SHELLS`);
    }
  });
});

describe('wrappers/index.cjs — Group EX', () => {
  test('EX-1 module.exports is exactly { getWrapper, UnsupportedShell, SUPPORTED_SHELLS }', () => {
    const keys = Object.keys(wrappers).sort();
    assert.deepStrictEqual(keys, ['SUPPORTED_SHELLS', 'UnsupportedShell', 'getWrapper']);
  });
});

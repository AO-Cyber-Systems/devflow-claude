'use strict';

/**
 * Tests for lib/wrappers/fish.cjs (TRD 20-05).
 *
 * Group FW (unit-level + end-to-end gated on `fish` PATH).
 * Group EX-3 (export surface lock).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const fish = require('./fish.cjs');
const { shellAvailable } = require('../__fixtures__/daemon-polish-fixtures.cjs');

const fishAvailable = shellAvailable('fish');

describe('wrappers/fish.cjs — Group FW unit', () => {
  test('FW-1 wrapCommand uses fish "set VAR (cmd)" syntax (NOT bash $(cmd))', () => {
    const lines = fish.wrapCommand('echo hello', 'h-1');
    assert.ok(lines.some((l) => /^set __DFW_OUT \(mktemp/.test(l)),
      'expected fish: set VAR (cmd) syntax');
    // Must NOT contain bash $(...) syntax
    assert.ok(!lines.some((l) => l.includes('$(mktemp')),
      'must not use bash command substitution');
  });

  test('FW-2 wrapCommand uses begin; cmd; end > $__DFW_OUT 2> $__DFW_ERR', () => {
    const lines = fish.wrapCommand('echo hello', 'h-1');
    assert.ok(lines.some((l) => l.includes('begin; echo hello; end > $__DFW_OUT 2> $__DFW_ERR')));
  });

  test('FW-3 wrapCommand uses set __DFW_RC $status (NOT $?)', () => {
    const lines = fish.wrapCommand('echo x', 'h-1');
    assert.ok(lines.some((l) => l === 'set __DFW_RC $status'),
      'fish uses $status, not $?');
    assert.ok(!lines.some((l) => /\$\?/.test(l)),
      'must not use bash $?');
  });

  test('FW-4 wrapCommand sentinel echo lines match expected shape with id', () => {
    const lines = fish.wrapCommand('echo x', 'h-1');
    assert.ok(lines.some((l) => l === 'echo __DFW_BEGIN_h-1__'));
    assert.ok(lines.some((l) => l === 'echo __DFW_DELIM_h-1__'));
    assert.ok(lines.some((l) => l === 'echo __DFW_END_h-1__:$__DFW_RC'));
  });

  test('FW-5 initLines includes function fish_prompt; end and set fish_greeting ""', () => {
    const init = fish.initLines('pipe');
    assert.ok(init.some((l) => l.includes('function fish_prompt')));
    assert.ok(init.some((l) => l.includes("set fish_greeting ''")));
  });

  test('FW-6 shellArgs(true) returns ["-i"]; (false) returns []', () => {
    assert.deepEqual(fish.shellArgs(true), ['-i']);
    assert.deepEqual(fish.shellArgs(false), []);
  });
});

// End-to-end gated tests
const { spawnSync } = require('child_process');

describe('wrappers/fish.cjs — Group FW end-to-end', () => {
  test('FW-7 dispatches echo end-to-end via real fish', { skip: !fishAvailable }, () => {
    // Run the wrappedLines directly through fish -c to verify the protocol
    // produces parseable output. Bypasses the watcher-shell layer; we just
    // verify the wrapper's syntax is fish-valid.
    const lines = fish.wrapCommand('echo hello', 'fw-7');
    const script = lines.join('\n');
    const r = spawnSync('fish', ['-c', script], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0, `fish exited ${r.status}: ${r.stderr}`);
    assert.match(r.stdout, /__DFW_BEGIN_fw-7__/);
    assert.match(r.stdout, /hello/);
    assert.match(r.stdout, /__DFW_END_fw-7__:0/);
  });

  test('FW-8 failed cmd reports exit_code=1', { skip: !fishAvailable }, () => {
    const lines = fish.wrapCommand('false', 'fw-8');
    const r = spawnSync('fish', ['-c', lines.join('\n')], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0, 'shell ran fine, command failed inside');
    assert.match(r.stdout, /__DFW_END_fw-8__:1/);
  });

  test('FW-9 stderr captured', { skip: !fishAvailable }, () => {
    const lines = fish.wrapCommand('echo err >&2', 'fw-9');
    const r = spawnSync('fish', ['-c', lines.join('\n')], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0);
    // stderr content lives between __DFW_DELIM and __DFW_END markers
    assert.match(r.stdout, /__DFW_DELIM_fw-9__\nerr/);
  });
});

describe('wrappers/fish.cjs — Group EX', () => {
  test('EX-3 export surface lock', () => {
    const keys = Object.keys(fish).sort();
    assert.deepStrictEqual(keys, ['initLines', 'lineSep', 'shellArgs', 'shellName', 'wrapCommand']);
  });
});

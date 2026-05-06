'use strict';

/**
 * Tests for lib/wrappers/bash.cjs (TRD 20-05).
 *
 * Group BW: bash wrapper byte-identical to current watcher-shell.cjs logic.
 * Group EX-2: export surface lock.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

const bash = require('./bash.cjs');

describe('wrappers/bash.cjs — Group BW', () => {
  test('BW-1 wrapCommand starts with __DFW_OUT=$(mktemp ...) line', () => {
    const lines = bash.wrapCommand('echo hello', 'h-1');
    assert.match(lines[0], /^__DFW_OUT=\$\(mktemp 2>\/dev\/null\)/);
  });

  test('BW-2 wrapCommand contains { echo hello ; } > $__DFW_OUT 2> $__DFW_ERR', () => {
    const lines = bash.wrapCommand('echo hello', 'h-1');
    assert.ok(lines.some((l) => l.includes('{ echo hello ; } > $__DFW_OUT 2> $__DFW_ERR')));
  });

  test('BW-3 wrapCommand contains __DFW_RC=$?', () => {
    const lines = bash.wrapCommand('echo x', 'h-1');
    assert.ok(lines.some((l) => l === '__DFW_RC=$?'));
  });

  test('BW-4 wrapCommand contains BEGIN/DELIM/END echo lines with id', () => {
    const lines = bash.wrapCommand('echo x', 'h-1');
    assert.ok(lines.some((l) => l === 'echo __DFW_BEGIN_h-1__'));
    assert.ok(lines.some((l) => l === 'echo __DFW_DELIM_h-1__'));
    assert.ok(lines.some((l) => l === 'echo __DFW_END_h-1__:$__DFW_RC'));
  });

  test('BW-5 initLines("pty") starts with stty -echo', () => {
    const init = bash.initLines('pty');
    assert.equal(init[0], 'stty -echo 2>/dev/null');
  });

  test('BW-6 initLines("pipe") does NOT include stty -echo', () => {
    const init = bash.initLines('pipe');
    assert.ok(!init.some((l) => l.includes('stty -echo')), 'pipe mode skips stty');
  });

  test('BW-7 shellArgs(true) returns ["-i"]; shellArgs(false) returns []', () => {
    assert.deepEqual(bash.shellArgs(true), ['-i']);
    assert.deepEqual(bash.shellArgs(false), []);
  });

  test('BW-8 lineSep is "\\n"', () => {
    assert.equal(bash.lineSep, '\n');
  });

  test('BW-9 wrapCommand byte-identical to current watcher-shell.cjs:354-374 logic', () => {
    // Hardcoded expected array — derived from watcher-shell.cjs:354-374
    // BEFORE the wrapper extraction. If the bash extraction is correct, this
    // assertion is the regression guard for v1.1+obj19 byte-identical
    // behavior.
    const id = 'h-byteid';
    const cmd = 'gh auth login';
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    const expected = [
      '__DFW_OUT=$(mktemp 2>/dev/null) __DFW_ERR=$(mktemp 2>/dev/null)',
      `{ ${cmd} ; } > $__DFW_OUT 2> $__DFW_ERR`,
      '__DFW_RC=$?',
      `echo ${begin}`,
      'cat $__DFW_OUT 2>/dev/null',
      `echo ${delim}`,
      'cat $__DFW_ERR 2>/dev/null',
      `echo ${end}:$__DFW_RC`,
      'rm -f $__DFW_OUT $__DFW_ERR',
      '',
    ];
    const actual = bash.wrapCommand(cmd, id);
    assert.deepStrictEqual(actual, expected, 'byte-identical to v1.1+obj19 wrappedLines');
  });
});

describe('wrappers/bash.cjs — Group EX', () => {
  test('EX-2 module.exports keys are exactly the locked surface', () => {
    const keys = Object.keys(bash).sort();
    assert.deepStrictEqual(keys, ['initLines', 'lineSep', 'shellArgs', 'shellName', 'wrapCommand']);
  });
});

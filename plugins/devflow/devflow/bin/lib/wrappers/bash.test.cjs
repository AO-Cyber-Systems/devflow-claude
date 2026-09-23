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

  // Issue #95. `stty -echo` silences the tty driver and nothing readline writes
  // itself; readline >= 8.1 brackets every line it reads in ESC[?2004h /
  // ESC[?2004l, which lands inside the sentinel-fenced capture region on every
  // current Linux bash. The mode has to be turned off at the source, and this
  // asserts the directive is actually issued — the capture-side strip in
  // watcher-shell.cjs would otherwise hide its absence.
  test('BW-5b initLines("pty") disables readline bracketed-paste (bash)', () => {
    const init = bash.initLines('pty');
    assert.ok(
      init.some((l) => /bind\s+'set enable-bracketed-paste off'/.test(l)),
      'pty init must turn readline bracketed-paste off'
    );
  });

  test('BW-5c initLines("pty") also disables zsh bracketed-paste (zsh routes here)', () => {
    const init = bash.initLines('pty');
    assert.ok(
      init.some((l) => /unset zle_bracketed_paste/.test(l)),
      'pty init must unset zle_bracketed_paste for the zsh callers of this wrapper'
    );
  });

  test('BW-5d bracketed-paste directives run BEFORE the prompt/monitor lines', () => {
    // They must take effect before anything else is read, or the lines that
    // follow are themselves bracketed.
    const init = bash.initLines('pty');
    const bindAt = init.findIndex((l) => l.includes('enable-bracketed-paste'));
    const ps1At = init.findIndex((l) => l.startsWith("PS1="));
    assert.ok(bindAt >= 0 && ps1At >= 0);
    assert.ok(bindAt < ps1At, 'bracketed-paste must be disabled before later init lines are read');
  });

  test('BW-6b initLines("pipe") does NOT touch bracketed-paste (no TTY, no readline)', () => {
    const init = bash.initLines('pipe');
    assert.ok(!init.some((l) => l.includes('bracketed-paste')), 'pipe mode has no line editor');
    assert.ok(!init.some((l) => l.includes('zle_bracketed_paste')), 'pipe mode has no zle');
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

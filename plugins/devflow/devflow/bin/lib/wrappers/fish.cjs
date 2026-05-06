'use strict';

/**
 * wrappers/fish — fish 3.0+ dispatch wrapper (TRD 20-05).
 *
 * Key differences from bash:
 *   - `set VAR (cmd)` instead of `VAR=$(cmd)`
 *   - `(mktemp)` instead of `$(mktemp)` for command substitution
 *   - `$status` instead of `$?` for last exit code
 *   - `begin; <cmd>; end > out 2> err` block for I/O redirection
 *   - `function fish_prompt; end` to silence prompt
 *   - `set fish_greeting ''` to skip greeting
 *
 * Sentinel pattern is identical to bash — fish's `echo` builtin emits
 * plain ASCII identically. The parser in watcher-shell.cjs is shell-
 * agnostic.
 *
 * Fish 3.0+ required for `function ... end` syntax. Older fish would
 * fail on the init lines with a shell-side syntax error captured in the
 * sentinel stderr region.
 *
 * Interface: { shellName, shellArgs, wrapCommand, lineSep, initLines }
 */

module.exports = {
  shellName: 'fish',

  shellArgs: (interactive) => (interactive ? ['-i'] : []),

  lineSep: '\n',

  initLines: (mode) => {
    const base = [
      'function fish_prompt; end',
      "set fish_greeting ''",
    ];
    return mode === 'pty' ? ['stty -echo 2>/dev/null', ...base] : base;
  },

  wrapCommand: (cmd, id) => {
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    return [
      'set __DFW_OUT (mktemp 2>/dev/null); set __DFW_ERR (mktemp 2>/dev/null)',
      `begin; ${cmd}; end > $__DFW_OUT 2> $__DFW_ERR`,
      'set __DFW_RC $status',
      `echo ${begin}`,
      'cat $__DFW_OUT 2>/dev/null',
      `echo ${delim}`,
      'cat $__DFW_ERR 2>/dev/null',
      `echo ${end}:$__DFW_RC`,
      'rm -f $__DFW_OUT $__DFW_ERR',
      '',
    ];
  },
};

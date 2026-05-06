'use strict';

/**
 * wrappers/bash — bash/zsh dispatch wrapper (TRD 20-05).
 *
 * Extracted byte-identical from watcher-shell.cjs:354-374 (current bash
 * logic). zsh routes to this same module via wrappers/index.cjs because
 * zsh is bash-compatible for our sentinel pattern (mktemp, $?, $VAR,
 * set +o monitor, PS1).
 *
 * Interface: { shellName, shellArgs, wrapCommand, lineSep, initLines }
 */

module.exports = {
  shellName: 'bash',

  shellArgs: (interactive) => (interactive ? ['-i'] : []),

  lineSep: '\n',

  initLines: (mode) => {
    const base = [
      'set +o monitor 2>/dev/null',
      "PS1=''",
      "PS2=''",
      "PROMPT_COMMAND=''",
      'unset PROMPT_DIRTRIM',
    ];
    // PTY mode needs `stty -echo` first to disable cooked-mode echo;
    // pipe mode doesn't echo so it's omitted.
    return mode === 'pty' ? ['stty -echo 2>/dev/null', ...base] : base;
  },

  wrapCommand: (cmd, id) => {
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    return [
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
  },
};

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
    //
    // `stty -echo` only silences the TTY DRIVER. readline writes control
    // sequences of its own that the driver never sees, and since readline 8.1
    // it wraps every line it reads in the bracketed-paste pair ESC[?2004h /
    // ESC[?2004l followed by a CRLF on accept-line. Those land BETWEEN the
    // BEGIN and DELIM sentinels of the dispatch wrapper and become part of the
    // captured output, so on the bash that ships with any current Linux distro
    // a `handoff` result reads `ESC[?2004hESC[?2004l\r\nhello\n…` instead of
    // `hello\n`. macOS ships bash 3.2 / readline 6.x, which has no such mode,
    // which is why this was invisible to every developer on this team until CI
    // ran the suite on ubuntu-latest (issue #95). This is a USER-FACING bug, so
    // it is fixed at the source rather than scrubbed out of the capture.
    //
    // Both lines are error-suppressed because this module serves bash AND zsh
    // (wrappers/index.cjs routes zsh here): `bind` is a bash builtin that zsh
    // does not have, and `zle_bracketed_paste` is a zsh array that bash does
    // not have. Each shell runs the one that applies to it and swallows the
    // other. Readline only reads `bind` in an interactive shell, which is
    // exactly what PTY mode spawns (`bash -i`); pipe mode has no TTY, so
    // readline is not in play there at all.
    const ptyQuiet = [
      "bind 'set enable-bracketed-paste off' 2>/dev/null",  // bash / readline >= 8.1
      'unset zle_bracketed_paste 2>/dev/null',              // zsh / zle
    ];
    return mode === 'pty' ? ['stty -echo 2>/dev/null', ...ptyQuiet, ...base] : base;
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

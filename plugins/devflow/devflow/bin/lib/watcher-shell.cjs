'use strict';

/**
 * watcher-shell — long-lived dual-mode shell session for the devflow-watch
 * daemon.
 *
 * Two transports, one protocol:
 *
 *   interactive: true  → PTY backend (node-pty). Real pseudo-terminal.
 *                        TTY-required commands (gh auth login, doctl auth init,
 *                        gpg --decrypt) work because they pass `isatty(stdin)`.
 *                        Used by the production daemon.
 *
 *   interactive: false → pipe backend (child_process.spawn). No TTY.
 *                        Faster, simpler, no native dep at module-load time.
 *                        Used by unit tests and any caller that doesn't need
 *                        a real terminal.
 *
 * The sentinel-fenced output protocol is identical on both transports — the
 * dispatch wrapper writes a temp-file-redirected command and emits BEGIN /
 * DELIM / END markers around the captured stdout / stderr / exit-code:
 *
 *   __DFW_OUT=$(mktemp); __DFW_ERR=$(mktemp)
 *   { <cmd> ; } > $__DFW_OUT 2> $__DFW_ERR
 *   __DFW_RC=$?
 *   echo __DFW_BEGIN_<id>__
 *   cat $__DFW_OUT 2>/dev/null
 *   echo __DFW_DELIM_<id>__
 *   cat $__DFW_ERR 2>/dev/null
 *   echo __DFW_END_<id>__:$__DFW_RC
 *   rm -f $__DFW_OUT $__DFW_ERR
 *
 * On PTY mode the line separator is `\r` (carriage return — PTY input
 * convention). On pipe mode it stays `\n`. `splitDispatchOutput` is
 * transport-agnostic: it scans for BEGIN/DELIM/END from the buffer head, so
 * PTY input echo (which appears before BEGIN) is harmless prefix garbage.
 *
 * Per dispatch, a single Promise is created. The data listener accumulates a
 * buffer; after each chunk we check whether the END sentinel has arrived.
 * Once seen, we split the buffer by BEGIN/DELIM/END to recover stdout,
 * stderr, and exit code, then resolve.
 *
 * Why temp files instead of `1>&2` mirroring of a stderr sentinel: when
 * bash's stderr is connected to a pipe (not a TTY), it block-buffers and the
 * END sentinel may never arrive in time, leaving captured stderr empty.
 * Routing through temp files + cat puts everything on the captured stream
 * where the sentinel parser is reliable. (PTY mode merges stdout+stderr at
 * the OS layer anyway, so the temp-file separation is load-bearing on both
 * transports.)
 *
 * See 19-RESEARCH.md §2 "Sentinel protocol compatibility" for the full
 * design rationale.
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

let _ptyModule = null;
function _loadPTY() {
  if (_ptyModule) return _ptyModule;
  try {
    _ptyModule = require('node-pty');
    return _ptyModule;
  } catch (e) {
    throw new Error(
      'node-pty not installed — set interactive:false on ShellSession or run "npm install" to fetch the prebuilt binary. ' +
      `Underlying error: ${e.message}`
    );
  }
}

class ShellSessionClosed extends Error {
  constructor(msg) {
    super(msg || 'shell session closed');
    this.name = 'ShellSessionClosed';
  }
}

class ShellSession extends EventEmitter {
  constructor({ shell, env, cwd, interactive } = {}) {
    super();
    this.shell = shell || process.env.SHELL || 'bash';
    this.env = env || process.env;
    this.cwd = cwd || process.cwd();
    // interactive=true (default) loads user rc files for the daemon's prod
    // use case (mise/nvm/conda/aliases) AND uses node-pty for TTY-required
    // commands. Tests pass interactive=false to avoid the native dep + hangs
    // on slow rc files in CI/test environments.
    this.interactive = interactive !== false;
    this.proc = null;
    this._isPTY = false;
    this._closed = false;
    this._stdoutBuf = '';
    this._stderrBuf = '';
    this._activeDispatch = null; // { id, beginRx, endRx, resolve, timeout }
    // TRD 19-02: external data listeners for token-passing prompt detection.
    // Daemon attaches a detector that scans the data stream for prompt
    // regexes and writes resolved secrets back to the shell. Both PTY mode
    // (single onData stream) and pipe mode (stdout + stderr) feed listeners.
    this._extDataListeners = [];
  }

  /**
   * Attach an external data listener — called for every chunk emitted by
   * the underlying proc (PTY mode: combined stream; pipe mode: stdout AND
   * stderr). Used by the daemon to detect interactive prompts in the
   * accumulated buffer and inject resolved secrets via injectInput().
   *
   * @param {(chunk: string) => void} fn
   */
  attachDataListener(fn) {
    if (typeof fn === 'function') this._extDataListeners.push(fn);
  }

  /**
   * Detach a previously-attached data listener. No-op if not present.
   *
   * @param {(chunk: string) => void} fn
   */
  detachDataListener(fn) {
    this._extDataListeners = this._extDataListeners.filter((x) => x !== fn);
  }

  /**
   * Inject input back into the shell session — used by the prompt detector
   * to write resolved secrets + carriage-return when a prompt regex matches.
   * Routes through PTY proc.write or pipe proc.stdin.write per active mode.
   *
   * Silently no-ops if the session is closed or not yet spawned. (Detector
   * may race ahead of close events; quiet failure is preferable to throw.)
   *
   * @param {string} s
   */
  injectInput(s) {
    if (this._closed || !this.proc) return;
    if (this._isPTY) this.proc.write(s);
    else this.proc.stdin.write(s);
  }

  _emitExtData(chunk) {
    if (this._extDataListeners.length === 0) return;
    // Snapshot listeners before iterating: a listener may detach itself.
    const listeners = this._extDataListeners.slice();
    for (const fn of listeners) {
      try { fn(chunk); } catch { /* listener errors must not break dispatch */ }
    }
  }

  async spawn() {
    if (this.proc) throw new Error('already spawned');

    if (this.interactive) {
      // PTY path — real pseudo-terminal via node-pty
      const pty = _loadPTY();
      try {
        this.proc = pty.spawn(this.shell, ['-i'], {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd: this.cwd,
          env: this.env,
        });
      } catch (e) {
        throw new Error(`PTY spawn failed: ${e.message}`);
      }
      this._isPTY = true;
      // PTYs merge stdout+stderr at the OS layer; the sentinel protocol's
      // temp-file redirection inside the wrapped command separates them again.
      this.proc.onData((chunk) => {
        this._stdoutBuf += chunk;
        // TRD 19-02: feed external listeners (e.g. prompt detector) BEFORE
        // _tryComplete so the detector can inject a secret in time for the
        // running command to consume it before the END sentinel arrives.
        this._emitExtData(chunk);
        this._tryComplete();
      });
      this.proc.onExit(() => this._onExit());
      // Quiet PS1 / job-control / PROMPT_COMMAND noise. PTY input terminator
      // is \r (carriage return), NOT \n.
      //
      // CRITICAL: `stty -echo` first. PTYs in cooked mode echo input back
      // by default — without this, the dispatch buffer contains every input
      // line interleaved with bash's output. Sentinel matching breaks because
      // the BEGIN/DELIM/END tokens appear in the echoed `echo BEGIN` lines
      // BEFORE bash's actual `echo` output produces them. With echo disabled
      // the buffer contains only program output, identical-shape to pipe mode.
      this._writeRaw([
        'stty -echo 2>/dev/null',
        'set +o monitor 2>/dev/null',
        "PS1=''",
        "PS2=''",
        "PROMPT_COMMAND=''",
        'unset PROMPT_DIRTRIM',
        '',
      ].join('\r'));
      // Drain any prelude noise (PS1 prompt before clear, login messages, etc.)
      // so the first dispatch's buffer scan starts clean. Also gives the
      // `stty -echo` enough time to take effect before the next write —
      // without this, the first dispatch may still see echoed input.
      await new Promise((r) => setTimeout(r, 100));
      this._stdoutBuf = '';
      this._stderrBuf = '';
    } else {
      // Pipe path — existing v1.1 behavior, byte-identical to pre-PTY release
      const args = [];  // interactive:false → no -i flag
      this.proc = spawn(this.shell, args, {
        env: this.env,
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this._isPTY = false;
      this.proc.stdout.setEncoding('utf8');
      this.proc.stderr.setEncoding('utf8');
      this.proc.stdout.on('data', (chunk) => {
        this._stdoutBuf += chunk;
        // TRD 19-02: feed external listeners (e.g. prompt detector) BEFORE
        // _tryComplete. Pipe-mode emits both streams; prompts CAN come on
        // stderr (e.g. `read -p prompt: var 1>&2`) so stderr listeners get
        // chunks too.
        this._emitExtData(chunk);
        this._tryComplete();
      });
      this.proc.stderr.on('data', (chunk) => {
        this._stderrBuf += chunk;
        this._emitExtData(chunk);
        this._tryComplete();
      });
      this.proc.on('exit', () => this._onExit());
      this.proc.on('error', () => this._onExit());
      // Quiet job-control noise on `bash -i` without a TTY, AND clear the
      // interactive prompt so PS1 doesn't pollute captured stderr. Also
      // disable PROMPT_COMMAND so any side-effect bash adds doesn't leak.
      // Send these in a single write so they execute before any dispatch.
      this._writeRaw([
        'set +o monitor 2>/dev/null',
        "PS1=''",
        "PS2=''",
        "PROMPT_COMMAND=''",
        'unset PROMPT_DIRTRIM',
        '',
      ].join('\n'));
    }
  }

  /**
   * Write raw text to the underlying proc, routing through the correct API
   * for the active transport.
   *  - PTY mode: proc.write (no .stdin)
   *  - pipe mode: proc.stdin.write
   */
  _writeRaw(s) {
    if (this._isPTY) this.proc.write(s);
    else this.proc.stdin.write(s);
  }

  _onExit() {
    this._closed = true;
    if (this._activeDispatch && !this._activeDispatch.settled) {
      this._activeDispatch.settled = true;
      clearTimeout(this._activeDispatch.timer);
      this._activeDispatch.resolve({
        stdout: '',
        stderr: '',
        exit_code: -1,
        status: 'shell_died',
      });
      this._activeDispatch = null;
    }
    this.emit('closed');
  }

  isAlive() {
    return !!(this.proc && !this._closed);
  }

  _tryComplete() {
    const d = this._activeDispatch;
    if (!d || d.settled) return;
    const endMatch = this._stdoutBuf.match(d.endRx);
    if (!endMatch) return;
    const rc = parseInt(endMatch[1], 10);
    // Split the stdout buffer into the three sections fenced by
    // BEGIN / DELIM / END sentinels.
    let { stdout, stderr } = splitDispatchOutput(this._stdoutBuf, d.begin, d.delim, d.end);
    // PTY mode normalization: PTY emits \r\n line endings (PTY cooked-mode
    // convention). Strip the \r so the result shape is byte-identical to
    // pipe-mode output. Pipe mode never emits \r so this is a no-op there.
    if (this._isPTY) {
      stdout = stdout.replace(/\r\n/g, '\n');
      stderr = stderr.replace(/\r\n/g, '\n');
    }
    // Trim everything up through the END line.
    this._stdoutBuf = trimAfter(this._stdoutBuf, d.end);
    d.settled = true;
    clearTimeout(d.timer);
    this._activeDispatch = null;
    d.resolve({
      stdout,
      stderr,
      exit_code: rc,
      status: rc === 0 ? 'done' : 'failed',
    });
  }

  /**
   * Dispatch a command. Returns { stdout, stderr, exit_code, status }.
   *
   * @param {string} id — handoff id (used as sentinel; must be /[A-Za-z0-9-]+/)
   * @param {string} cmd — the command
   * @param {object} opts — { timeout_ms }
   */
  dispatch(id, cmd, opts = {}) {
    if (!this.isAlive()) {
      return Promise.reject(new ShellSessionClosed());
    }
    if (this._activeDispatch) {
      return Promise.reject(new Error('dispatch in progress'));
    }
    const timeoutMs = typeof opts.timeout_ms === 'number' ? opts.timeout_ms : 600000;
    const begin = `__DFW_BEGIN_${id}__`;
    const delim = `__DFW_DELIM_${id}__`;
    const end = `__DFW_END_${id}__`;
    const endRx = new RegExp(`${escapeRegex(end)}:(-?\\d+)`);

    return new Promise((resolve) => {
      const d = {
        id,
        begin,
        delim,
        end,
        endRx,
        resolve,
        settled: false,
        timer: null,
      };
      d.timer = setTimeout(() => {
        if (d.settled) return;
        d.settled = true;
        this._activeDispatch = null;
        // Kill the shell — the daemon will respawn for the next command.
        try { this.proc.kill('SIGTERM'); } catch {}
        // PTY procs need destroy() to release the underlying socket FD;
        // otherwise the host event loop stays alive. SIGTERM alone is not
        // enough — see node-pty UnixTerminal.destroy() upstream.
        if (this._isPTY) {
          try { this.proc.destroy(); } catch {}
        }
        this._closed = true;
        resolve({ stdout: '', stderr: '', exit_code: -1, status: 'timeout' });
      }, timeoutMs);
      this._activeDispatch = d;

      // Route the user command's stdout/stderr through temp files and serialize
      // back through THIS shell's stdout fenced by BEGIN / DELIM / END sentinels.
      // This avoids stderr block-buffering issues when bash's own stderr is piped.
      // Line separator: \r on PTY (PTY input convention), \n on pipe.
      const wrappedLines = [
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
      const sep = this._isPTY ? '\r' : '\n';
      this._writeRaw(wrappedLines.join(sep));
      // In case markers already arrived (race-free).
      this._tryComplete();
    });
  }

  async kill() {
    if (!this.proc) return;
    if (this._closed) return;
    this._closed = true;
    if (this._isPTY) {
      // node-pty: kill signal + destroy() which closes the read stream and
      // releases the file descriptor. Without destroy() the socket holds
      // the event loop alive and the host process won't exit cleanly.
      try { this.proc.kill('SIGTERM'); } catch {}
      await new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => {
          if (done) return;
          done = true;
          try { this.proc.kill('SIGKILL'); } catch {}
          try { this.proc.destroy(); } catch {}
          resolve();
        }, 500);
        try {
          this.proc.onExit(() => {
            if (done) return;
            done = true;
            clearTimeout(t);
            try { this.proc.destroy(); } catch {}
            resolve();
          });
        } catch {
          // onExit may already have fired or the proc may be torn down.
          if (done) return;
          done = true;
          clearTimeout(t);
          try { this.proc.destroy(); } catch {}
          resolve();
        }
      });
    } else {
      // child_process: SIGTERM, wait for exit, fall back to SIGKILL.
      try { this.proc.kill('SIGTERM'); } catch {}
      await new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => {
          if (done) return;
          done = true;
          try { this.proc.kill('SIGKILL'); } catch {}
          resolve();
        }, 500);
        this.proc.once('exit', () => {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve();
        });
      });
    }
    if (this._activeDispatch && !this._activeDispatch.settled) {
      this._activeDispatch.settled = true;
      clearTimeout(this._activeDispatch.timer);
      this._activeDispatch.resolve({
        stdout: '',
        stderr: '',
        exit_code: -1,
        status: 'killed',
      });
      this._activeDispatch = null;
    }
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split a stdout buffer fenced by BEGIN / DELIM / END sentinels into
 * { stdout, stderr } sections. Each section is the content of the lines
 * BETWEEN its bounding sentinels (exclusive of the sentinel lines).
 *
 * Transport-agnostic: pipe-mode buffers contain only the sentinel-fenced
 * content; PTY-mode buffers may have a prefix of echoed input before the
 * BEGIN sentinel — `buf.indexOf(begin)` skips it as harmless prefix.
 */
function splitDispatchOutput(buf, begin, delim, end) {
  const bIdx = buf.indexOf(begin);
  if (bIdx === -1) return { stdout: '', stderr: '' };
  const afterBegin = buf.indexOf('\n', bIdx);
  if (afterBegin === -1) return { stdout: '', stderr: '' };

  const dIdx = buf.indexOf(delim, afterBegin + 1);
  if (dIdx === -1) {
    // No delimiter yet — return what we have as stdout, no stderr.
    return { stdout: buf.slice(afterBegin + 1), stderr: '' };
  }
  // stdout = afterBegin+1 .. start of delim line
  const delimLineStart = buf.lastIndexOf('\n', dIdx) + 1;
  const stdout = buf.slice(afterBegin + 1, delimLineStart);

  const afterDelim = buf.indexOf('\n', dIdx);
  if (afterDelim === -1) return { stdout, stderr: '' };

  const eIdx = buf.indexOf(end, afterDelim + 1);
  if (eIdx === -1) return { stdout, stderr: buf.slice(afterDelim + 1) };
  const endLineStart = buf.lastIndexOf('\n', eIdx) + 1;
  const stderr = buf.slice(afterDelim + 1, endLineStart);

  return { stdout, stderr };
}

/**
 * Drop everything up to and including the line containing `end`.
 */
function trimAfter(buf, end) {
  const eIdx = buf.indexOf(end);
  if (eIdx === -1) return buf;
  const eol = buf.indexOf('\n', eIdx);
  if (eol === -1) return '';
  return buf.slice(eol + 1);
}

module.exports = { ShellSession, ShellSessionClosed, splitDispatchOutput };

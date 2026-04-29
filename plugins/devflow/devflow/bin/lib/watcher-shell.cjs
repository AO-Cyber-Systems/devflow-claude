'use strict';

/**
 * watcher-shell — long-lived interactive shell session for the
 * devflow-watch daemon.
 *
 * Approach: spawn `bash -i` (or `zsh -i`) with stdio pipes. To capture per-
 * command stdout/stderr/exit-code, dispatch redirects the user command's
 * stdout/stderr to temp files and serializes all output through this
 * shell's stdout, fenced by sentinels:
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
 * Why temp files instead of `1>&2` mirroring of a stderr sentinel: when
 * bash's stderr is connected to a pipe (not a TTY), it block-buffers and
 * the END sentinel may never arrive in time, leaving captured stderr empty.
 * Routing through temp files + cat puts everything on stdout where the
 * sentinel parser is reliable.
 *
 * Per dispatch, a single Promise is created. The stdout listener accumulates
 * a buffer; after each chunk we check whether the END sentinel for this
 * dispatch has arrived. Once seen, we split the buffer by BEGIN/DELIM/END
 * to recover stdout, stderr, and exit code, then resolve.
 *
 * Trade-offs vs node-pty:
 *  - No real TTY, so programs that read /dev/tty (sudo, gpg passphrase) won't
 *    work. The allowlist explicitly excludes those.
 *  - Many shell-flow tools (mise, nvm, direnv, conda) source from interactive
 *    rc files and DO work with `bash -i` / `zsh -i` even without a real TTY.
 *  - No native dep, no compile, works on any Node >= 16.
 *  - Commands producing huge output (>~MB) hit temp-file disk IO; acceptable
 *    for dev-tool use cases.
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

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
    // use case (mise/nvm/conda/aliases). Tests pass interactive=false to
    // avoid hangs on slow rc files in CI/test environments.
    this.interactive = interactive !== false;
    this.proc = null;
    this._closed = false;
    this._stdoutBuf = '';
    this._stderrBuf = '';
    this._activeDispatch = null; // { id, beginRx, endRx, resolve, timeout }
  }

  async spawn() {
    if (this.proc) throw new Error('already spawned');
    const args = this.interactive ? ['-i'] : [];
    this.proc = spawn(this.shell, args, {
      env: this.env,
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      this._stdoutBuf += chunk;
      this._tryComplete();
    });
    this.proc.stderr.on('data', (chunk) => {
      this._stderrBuf += chunk;
      this._tryComplete();
    });
    this.proc.on('exit', () => this._onExit());
    this.proc.on('error', () => this._onExit());
    // Quiet job-control noise on `bash -i` without a TTY, AND clear the
    // interactive prompt so PS1 doesn't pollute captured stderr. Also
    // disable PROMPT_COMMAND so any side-effect bash adds doesn't leak.
    // Send these in a single write so they execute before any dispatch.
    this.proc.stdin.write([
      'set +o monitor 2>/dev/null',
      "PS1=''",
      "PS2=''",
      "PROMPT_COMMAND=''",
      'unset PROMPT_DIRTRIM',
      '',
    ].join('\n'));
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
    const { stdout, stderr } = splitDispatchOutput(this._stdoutBuf, d.begin, d.delim, d.end);
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
        this._closed = true;
        resolve({ stdout: '', stderr: '', exit_code: -1, status: 'timeout' });
      }, timeoutMs);
      this._activeDispatch = d;

      // Route the user command's stdout/stderr through temp files and serialize
      // back through THIS shell's stdout fenced by BEGIN / DELIM / END sentinels.
      // This avoids stderr block-buffering issues when bash's own stderr is piped.
      const wrapped = [
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
      ].join('\n');
      this.proc.stdin.write(wrapped);
      // In case markers already arrived (race-free).
      this._tryComplete();
    });
  }

  async kill() {
    if (!this.proc) return;
    if (this._closed) return;
    this._closed = true;
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

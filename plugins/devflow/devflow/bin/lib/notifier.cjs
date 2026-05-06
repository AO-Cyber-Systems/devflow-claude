'use strict';

/**
 * notifier — OS desktop notification dispatcher (TRD 20-01).
 *
 * Async notify({title, body, urgency?, log?}) routes to:
 *   - darwin: `osascript -e 'display notification ... with title ...'`
 *   - linux:  `notify-send [-u <urgency>] <title> <body>`
 *   - other:  no-op (no warning spam)
 *
 * Subprocess invocation goes through `execFile` (NOT `exec`) so user-controlled
 * cmd content never lands in a `/bin/sh -c` string. AppleScript double-quotes
 * and backslashes are escaped via _esc().
 *
 * Module-level disable:
 *   - `NOTIFIER_DISABLE=1` env var → unconditional no-op (set per-process to
 *     bypass entirely without editing config)
 *   - First ENOENT during dispatch flips `_notifierDisabled = true`, logs ONE
 *     warning, and disables for the rest of the process lifetime. Cleared by
 *     `_resetMocks()` (test-only API).
 *
 * Test seam: `_setRunExec(fn)` swaps the realRunExec backing for an in-memory
 * mock. Tests that need full subprocess fidelity use the executable shim
 * pattern (PATH override + marker file) instead — see daemon-polish-fixtures.
 */

const { execFile } = require('child_process');

const realRunExec = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 5000, ...opts }, (err, stdout, stderr) => {
    if (err) reject(err);
    else resolve({ stdout, stderr });
  });
});

let _runExec = realRunExec;
let _notifierDisabled = false;

function _setRunExec(fn) {
  _runExec = (fn != null) ? fn : realRunExec;
}

function _resetMocks() {
  _runExec = realRunExec;
  _notifierDisabled = false;
}

/**
 * Escape a string for embedding inside an AppleScript double-quoted literal.
 * Backslash MUST be escaped before double-quote (otherwise \" becomes \\").
 */
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * Dispatch a desktop notification. Async. Never throws — all errors are caught
 * and logged via `opts.log` (or console.warn fallback).
 *
 * @param {object} opts
 * @param {string} opts.title — notification title
 * @param {string} opts.body — notification body
 * @param {string} [opts.urgency] — linux only; mapped to `notify-send -u <urgency>`
 * @param {function} [opts.log] — (level, msg) => void; defaults to console.warn for warn level
 */
async function notify(opts = {}) {
  if (process.env.NOTIFIER_DISABLE === '1') return;
  if (_notifierDisabled) return;

  const log = opts.log || ((level, msg) => {
    if (level === 'warn') console.warn(`[notifier] ${msg}`);
  });
  const plat = process.env.NOTIFIER_PLATFORM_OVERRIDE || process.platform;
  const title = opts.title == null ? 'DevFlow Watch' : String(opts.title);
  const body = opts.body == null ? '' : String(opts.body);

  try {
    if (plat === 'darwin') {
      const script = `display notification "${_esc(body)}" with title "${_esc(title)}"`;
      await _runExec('osascript', ['-e', script]);
    } else if (plat === 'linux') {
      const args = [];
      if (opts.urgency) args.push('-u', String(opts.urgency));
      args.push(title, body);
      await _runExec('notify-send', args);
    } else {
      // Other platforms (win32 etc.) — silent no-op for v1.2
      return;
    }
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      _notifierDisabled = true;
      const tool = plat === 'darwin' ? 'osascript' : 'notify-send';
      log('warn', `${tool} not found on PATH; OS notifications disabled for this session`);
      return;
    }
    const msg = e && e.message ? e.message : String(e);
    log('warn', `notification dispatch failed: ${msg}`);
  }
}

module.exports = { notify, _setRunExec, _resetMocks };

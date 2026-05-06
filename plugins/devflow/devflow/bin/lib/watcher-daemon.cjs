'use strict';

/**
 * watcher-daemon — core loop for the devflow-watch process.
 *
 * Pulls pending handoff records from .devflow-handoff/pending/, validates
 * each command against the allowlist, dispatches via a long-lived
 * ShellSession, and writes a done record to .devflow-handoff/done/.
 *
 * Module is split from devflow-watch.cjs so the loop logic is unit-testable
 * without spawning a real CLI subprocess.
 */

const fs = require('fs');
const path = require('path');

const allowlist = require('./watcher-allowlist.cjs');
const handoff = require('./handoff.cjs');
const state = require('./watcher-state.cjs');

const POLL_INTERVAL_MS = 500;
const DEFAULT_DISPATCH_TIMEOUT_MS = 600000; // 10 minutes per command

// TRD 19-02: redaction settings for token-passing.
//   REDACT_PLACEHOLDER — what resolved secrets get replaced with in done.stdout/stderr.
//   MIN_REDACT_LEN — values shorter than this are NOT redacted (avoid collapsing
//   unrelated output that happens to share a short substring with a token).
const REDACT_PLACEHOLDER = '***REDACTED***';
const MIN_REDACT_LEN = 8;

function pendingDir(projectRoot) {
  return path.join(projectRoot, '.devflow-handoff', 'pending');
}

function doneDir(projectRoot) {
  return path.join(projectRoot, '.devflow-handoff', 'done');
}

function readPending(projectRoot) {
  const dir = pendingDir(projectRoot);
  if (!fs.existsSync(dir)) return [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return []; }
  const recs = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const filePath = path.join(dir, name);
    try {
      const rec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (rec && typeof rec.id === 'string') {
        rec._path = filePath;
        recs.push(rec);
      }
    } catch {
      // skip malformed
    }
  }
  recs.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  return recs;
}

function writeDoneRecord(projectRoot, record) {
  const dir = doneDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${record.id}.json`);
  // Atomic-ish write
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
  return filePath;
}

function removePendingRecord(record) {
  if (!record._path) return;
  try { fs.unlinkSync(record._path); } catch {}
}

/**
 * Resolve secrets at dispatch time (TRD 19-02). Each entry is annotated
 * with the resolved value (or null + err message if resolution failed),
 * a compiled prompt regex, and a `consumed` flag the prompt detector flips
 * when it has written the value to the shell.
 *
 * Resolution sources:
 *   - 'env'   → process.env[value_ref]; missing/empty → resolution error
 *   - 'stash' → stashGetter(handoff_id, value_ref); null/undefined → error
 *
 * @param {Array} secrets — pending.inputs.secrets entries
 * @param {string} handoffId
 * @param {function|null} stashGetter — (id, ref) => string|null
 */
function _resolveSecrets(secrets, handoffId, stashGetter) {
  const out = [];
  for (const s of secrets) {
    let value = null;
    let err = null;
    if (s.value_source === 'env') {
      const v = process.env[s.value_ref];
      if (!v) err = `env var "${s.value_ref}" unset or empty`;
      else value = v;
    } else if (s.value_source === 'stash') {
      const v = stashGetter ? stashGetter(handoffId, s.value_ref) : null;
      if (v == null) err = `stash empty for ref "${s.value_ref}" (handoff ${handoffId})`;
      else value = v;
    } else {
      // Should never reach here — validateInputsSchema rejects unknown sources
      // before processOnce calls _resolveSecrets. Defensive: mark error.
      err = `unknown value_source "${s.value_source}"`;
    }
    out.push({
      regex: new RegExp(s.prompt_match),
      ref: s.value_ref,
      source: s.value_source,
      value,
      err,
      consumed: false,
    });
  }
  return out;
}

/**
 * Build a chunk-handler that scans the accumulated PTY/pipe buffer for any
 * unconsumed prompt regex. On match it writes the resolved value + CR via
 * sessionInjector. On duplicate match (already consumed) or on first match
 * after a resolution failure, it injects Ctrl+C and reports an error.
 *
 * Re-match guard: matches that occur BEFORE the most recent injection point
 * are ignored (PTY echo + cooked-mode bytes from the answer itself often
 * re-match the prompt regex; we only count matches after lastInjectionIdx).
 *
 * @param {Array} resolvedSecrets — output of _resolveSecrets
 * @param {(s:string)=>void} sessionInjector — wraps session.injectInput
 * @param {(msg:string)=>void} onError — called once per detected error
 */
function _makePromptDetector(resolvedSecrets, sessionInjector, onError) {
  let buf = '';
  let lastInjectionIdx = 0;
  return function onChunk(chunk) {
    buf += chunk;
    for (const sec of resolvedSecrets) {
      if (sec.consumed === 'error') continue;
      if (sec.consumed === true) {
        // Already answered. Scan only the tail (post-injection) for
        // re-prompts; match here means the tool is rejecting our value.
        const tail = buf.slice(lastInjectionIdx);
        if (sec.regex.test(tail)) {
          try { sessionInjector('\x03'); } catch { /* ignore */ }
          sec.consumed = 'error';
          onError(`duplicate prompt match for "${sec.ref}" (likely incorrect value)`);
        }
        continue;
      }
      if (sec.err) {
        // Failed resolution — first prompt match aborts the dispatch.
        if (sec.regex.test(buf)) {
          try { sessionInjector('\x03'); } catch { /* ignore */ }
          sec.consumed = 'error';
          onError(`secret resolution failed for "${sec.ref}" (${sec.err})`);
        }
        continue;
      }
      if (sec.regex.test(buf)) {
        try { sessionInjector(sec.value + '\r'); } catch { /* ignore */ }
        sec.consumed = true;
        lastInjectionIdx = buf.length;
      }
    }
  };
}

/**
 * Redact resolved secret values from stdout/stderr text. Values shorter
 * than MIN_REDACT_LEN are skipped (would risk collapsing legitimate output
 * that incidentally shares a substring with a short token).
 *
 * Done-record redaction runs once at end-of-dispatch against the full
 * captured buffers — NOT chunk-by-chunk during streaming. This avoids
 * the "secret split across two chunks" problem.
 */
function _redactSecrets(text, resolvedSecrets) {
  if (!text) return text;
  let out = text;
  for (const sec of resolvedSecrets) {
    if (!sec.value || sec.value.length < MIN_REDACT_LEN) continue;
    // Escape regex special chars in the literal value.
    const esc = sec.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'g'), REDACT_PLACEHOLDER);
  }
  return out;
}

/**
 * Process a single pending record. Returns the done record written.
 *
 * Dependencies are injected so this is easy to unit-test without spawning
 * a real shell session.
 *
 * @param {object} pending — pending record (with _path)
 * @param {object} deps
 * @param {object} deps.session — { dispatch(id, cmd, opts) } returning result
 * @param {Array}  deps.allowlist — allowlist patterns from loadAllowlist
 * @param {string} deps.projectRoot
 * @param {function} [deps.log] — optional logger(level, msg)
 * @param {number} [deps.timeoutMs]
 */
async function processOnce(pending, deps) {
  const { session, allowlist: allow, projectRoot, log, timeoutMs, stashGetter } = deps;
  const startedAt = new Date().toISOString();
  const logFn = log || (() => {});

  // Validate against allowlist
  const validation = allowlist.validateCommand(pending.cmd, allow);
  if (!validation.ok) {
    logFn('warn', `rejected ${pending.id}: ${validation.reason}`);
    const done = state.makeDoneRecord(pending, {
      stdout: '',
      stderr: `[devflow-watch] rejected: ${validation.reason}`,
      exit_code: -2,
      status: 'rejected',
      started_at: startedAt,
    });
    writeDoneRecord(projectRoot, done);
    removePendingRecord(pending);
    return done;
  }

  // TRD 19-02: validate inputs schema before dispatch. Failed validation
  // emits a `failed` done record and skips dispatch entirely (the daemon
  // should never call into a tool with broken token-passing config).
  if (pending.inputs) {
    const v = handoff.validateInputsSchema(pending.inputs);
    if (!v.ok) {
      logFn('warn', `inputs invalid for ${pending.id}: ${v.reason}`);
      const done = state.makeDoneRecord(pending, {
        stdout: '',
        stderr: `[devflow-watch] inputs invalid: ${v.reason}`,
        exit_code: -4,
        status: 'failed',
        started_at: startedAt,
      });
      writeDoneRecord(projectRoot, done);
      removePendingRecord(pending);
      return done;
    }
  }

  // TRD 19-02: resolve secrets at dispatch time (in memory only; never logged
  // or persisted as cleartext). Empty secrets list = no token-passing, dispatch
  // proceeds byte-identical to v1.1.
  const secrets = (pending.inputs && Array.isArray(pending.inputs.secrets))
    ? pending.inputs.secrets
    : [];
  const resolvedSecrets = secrets.length > 0
    ? _resolveSecrets(secrets, pending.id, stashGetter || null)
    : [];

  // Wire prompt detector if we have any secrets to answer. The detector's
  // first detected error is captured here and folded into the done record
  // after dispatch resolves.
  let detectorErr = null;
  let detector = null;
  if (resolvedSecrets.length > 0
      && typeof session.attachDataListener === 'function'
      && typeof session.injectInput === 'function') {
    detector = _makePromptDetector(
      resolvedSecrets,
      (s) => session.injectInput(s),
      (msg) => { if (!detectorErr) detectorErr = msg; },
    );
    session.attachDataListener(detector);
  }

  // Log the COMMAND, never the resolved secret values. Audit-grep for
  // "dispatching " in ~/.devflow/devflow-watch.log should show only cmd lines.
  logFn('info', `dispatching ${pending.id}: ${pending.cmd}`);
  let result;
  try {
    result = await session.dispatch(pending.id, pending.cmd, {
      timeout_ms: timeoutMs || DEFAULT_DISPATCH_TIMEOUT_MS,
    });
  } catch (e) {
    result = {
      stdout: '',
      stderr: `[devflow-watch] dispatch error: ${e && e.message ? e.message : String(e)}`,
      exit_code: -3,
      status: 'error',
    };
  } finally {
    if (detector && typeof session.detachDataListener === 'function') {
      try { session.detachDataListener(detector); } catch { /* ignore */ }
    }
  }

  // Detector error overrides successful exit_code (the tool may have
  // exited 0 after Ctrl+C abort, but the dispatch still failed our intent).
  if (detectorErr) {
    const baseStderr = result.stderr || '';
    result.stderr = baseStderr
      ? `${baseStderr}\n[devflow-watch] ${detectorErr}`
      : `[devflow-watch] ${detectorErr}`;
    if (result.status === 'done' || result.status === 'failed') {
      result.status = 'failed';
      if (!result.exit_code || result.exit_code === 0) result.exit_code = -5;
    }
  }

  // Redact resolved secret values from stdout/stderr before persisting.
  // Run AFTER dispatch resolution against the full buffers, NOT during
  // streaming — avoids the secret-split-across-chunks problem.
  result.stdout = _redactSecrets(result.stdout, resolvedSecrets);
  result.stderr = _redactSecrets(result.stderr, resolvedSecrets);

  const done = state.makeDoneRecord(pending, { ...result, started_at: startedAt });
  writeDoneRecord(projectRoot, done);
  removePendingRecord(pending);
  logFn('info', `completed ${pending.id} status=${done.status} exit=${done.exit_code}`);
  return done;
}

/**
 * Build the long-running poll loop. Returns { stop } that can be invoked to
 * exit cleanly. Loop uses setInterval — no aggressive busy-wait.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {object} opts.session
 * @param {Array}  opts.allowlist
 * @param {function} [opts.log]
 * @param {number} [opts.pollIntervalMs]
 * @param {number} [opts.timeoutMs]
 */
function runLoop(opts) {
  const {
    projectRoot,
    session,
    allowlist: allow,
    log = () => {},
    pollIntervalMs = POLL_INTERVAL_MS,
    timeoutMs,
  } = opts;

  let stopped = false;
  let inFlight = null;

  async function tick() {
    if (stopped) return;
    if (inFlight) return; // serial dispatch — one command at a time
    const pending = readPending(projectRoot);
    if (pending.length === 0) return;
    const next = pending[0];
    inFlight = processOnce(next, {
      session, allowlist: allow, projectRoot, log, timeoutMs,
    }).catch((e) => {
      log('error', `processOnce threw: ${e && e.message ? e.message : String(e)}`);
    }).finally(() => {
      inFlight = null;
    });
  }

  const interval = setInterval(tick, pollIntervalMs);
  // Fire one immediately so the first record doesn't wait the full interval.
  tick();

  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      // Drain in-flight
      if (inFlight) {
        try { await inFlight; } catch {}
      }
    },
  };
}

module.exports = {
  pendingDir,
  doneDir,
  readPending,
  writeDoneRecord,
  removePendingRecord,
  processOnce,
  runLoop,
  POLL_INTERVAL_MS,
  DEFAULT_DISPATCH_TIMEOUT_MS,
};

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
const state = require('./watcher-state.cjs');

const POLL_INTERVAL_MS = 500;
const DEFAULT_DISPATCH_TIMEOUT_MS = 600000; // 10 minutes per command

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
  const { session, allowlist: allow, projectRoot, log, timeoutMs } = deps;
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
  }

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

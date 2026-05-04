'use strict';

/**
 * Watcher state library — PID file lifecycle, liveness check, done-record
 * helpers used by the devflow-watch daemon and by hooks that need to know
 * whether the daemon is running.
 *
 * Module is dependency-free CommonJS so hooks (which run in their own Node
 * processes) can require it directly. All paths honour $HOME (so tests can
 * point at a temp dir).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PID_FILE_NAME = 'devflow-watch.pid';
const PID_DIR_NAME = '.devflow';

function homeDir() {
  // Use process.env.HOME first so tests can override it. os.homedir() reads
  // HOME on POSIX, USERPROFILE on Windows; we re-read it each call rather
  // than caching at module load.
  return process.env.HOME || os.homedir();
}

function pidFilePath() {
  // Allow explicit override via env (used by hook tests).
  if (process.env.DEVFLOW_HANDOFF_PID_FILE) {
    return process.env.DEVFLOW_HANDOFF_PID_FILE;
  }
  return path.join(homeDir(), PID_DIR_NAME, PID_FILE_NAME);
}

function writePidFile({ pid, version, shell, watching }) {
  const file = pidFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    pid,
    version: version || '0.0.0',
    shell: shell || null,
    watching: Array.isArray(watching) ? watching : [],
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

function readPidFile() {
  const file = pidFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

function removePidFile() {
  const file = pidFilePath();
  try {
    fs.unlinkSync(file);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

function isWatcherLive() {
  const info = readPidFile();
  if (!info || typeof info.pid !== 'number') return false;
  try {
    process.kill(info.pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a done-record from a pending-record + execution result.
 *
 * @param {object} pending — the original pending record
 * @param {object} result — { stdout, stderr, exit_code, status, started_at }
 * @returns done-record (with consumed: false, completed_at)
 */
function makeDoneRecord(pending, result) {
  return {
    ...pending,
    started_at: result.started_at || new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: result.status || (result.exit_code === 0 ? 'done' : 'failed'),
    exit_code: result.exit_code,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    consumed: false,
  };
}

function markConsumed(donePath) {
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(donePath, 'utf8'));
  } catch {
    return false;
  }
  rec.consumed = true;
  // Atomic-ish: write to tmp + rename.
  const tmp = donePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2) + '\n');
  fs.renameSync(tmp, donePath);
  return true;
}

function listUnconsumed(doneDir) {
  if (!fs.existsSync(doneDir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(doneDir);
  } catch {
    return [];
  }
  const recs = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const filePath = path.join(doneDir, name);
    try {
      const rec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (rec && rec.consumed === false) {
        rec._path = filePath;
        recs.push(rec);
      }
    } catch {
      // skip malformed
    }
  }
  recs.sort((a, b) => (a.completed_at || '').localeCompare(b.completed_at || ''));
  return recs;
}

module.exports = {
  pidFilePath,
  writePidFile,
  readPidFile,
  removePidFile,
  isWatcherLive,
  makeDoneRecord,
  markConsumed,
  listUnconsumed,
};

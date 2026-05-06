'use strict';

/**
 * decline-tracker.cjs — df-tools decline tracking for auto-init (Phase C, C3)
 *
 * Manages ~/.claude/devflow/declined-projects.json — a per-cwd record of
 * when the user declined DevFlow initialization and when the decline expires.
 *
 * CLI surface:
 *   df-tools project-decline [<cwd>] [--duration-days N]
 *   df-tools project-accept  [<cwd>]
 *
 * File format (locked per #28):
 *   {
 *     "/Users/justin/dev/some-repo": {
 *       "declined_at": "2026-05-05T12:00:00.000Z",
 *       "expires_at":  "2026-06-04T12:00:00.000Z"
 *     }
 *   }
 *
 * Key design decisions:
 *   - Atomic writes via .tmp rename — both files live in same dir (same filesystem)
 *   - readDecline auto-prunes expired entries on every read (intentional side-effect)
 *   - Corrupt JSON → fail-open with {} (decline tracking is best-effort)
 *   - File written as {} when last entry is removed, never deleted (avoids TOCTOU)
 *   - Time injection via `now` parameter for testability
 *   - fs injection via _setRunFs for atomic-write spy tests
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { output, error } = require('./helpers.cjs');

// ─── Constants ────────────────────────────────────────────────────────────────

// LOCKED PATH — must match other ~/.claude/devflow/ uses (sync-runtime.js, audit.log)
const DEVFLOW_HOME = path.join(os.homedir(), '.claude', 'devflow');
const DECLINED_PROJECTS_PATH = path.join(DEVFLOW_HOME, 'declined-projects.json');

const DEFAULT_DURATION_DAYS = 30;

// ─── fs injection (for testability) ──────────────────────────────────────────

const realFs = {
  existsSync: (...a) => fs.existsSync(...a),
  mkdirSync: (...a) => fs.mkdirSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
  writeFileSync: (...a) => fs.writeFileSync(...a),
  renameSync: (...a) => fs.renameSync(...a),
  unlinkSync: (...a) => fs.unlinkSync(...a),
};
let _runFs = realFs;

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; _runDeclinePath = DECLINED_PROJECTS_PATH; }

// ─── Path override (for tests — redirect away from real ~/.claude/devflow/) ───

let _runDeclinePath = DECLINED_PROJECTS_PATH;
function _setDeclinePath(p) { _runDeclinePath = (p != null) ? p : DECLINED_PROJECTS_PATH; }

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Read the declined-projects.json file. Returns {} on missing file or corrupt JSON.
 * Never throws.
 */
function _readJson() {
  const filePath = _runDeclinePath;
  if (!_runFs.existsSync(filePath)) return {};
  try {
    const raw = _runFs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    // Corrupt JSON — fail-open with empty state
    return {};
  }
}

/**
 * Atomically write the declined-projects.json file.
 * Creates parent directory if needed.
 * Writes to .tmp in same dir first, then renames — safe against partial writes.
 *
 * Atomic rename only works within same filesystem; .tmp lives in same dir as target.
 */
function _writeJsonAtomic(obj) {
  const filePath = _runDeclinePath;
  const dir = path.dirname(filePath);
  if (!_runFs.existsSync(dir)) _runFs.mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  _runFs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2));
  _runFs.renameSync(tmpPath, filePath);
}

/**
 * Compute the expires_at timestamp given declined_at and durationDays.
 * @param {string} declinedAt - ISO 8601 string
 * @param {number} durationDays - number of days until expiry
 * @returns {string} ISO 8601 string
 */
function _computeExpiresAt(declinedAt, durationDays) {
  const d = new Date(declinedAt);
  d.setUTCDate(d.getUTCDate() + durationDays);
  return d.toISOString();
}

// ─── Pure API ─────────────────────────────────────────────────────────────────

/**
 * Write (or overwrite) a decline entry for the given cwd.
 *
 * @param {string} cwd - absolute path to the project directory
 * @param {object} [opts]
 * @param {string} [opts.now] - ISO 8601 timestamp (default: current time)
 * @param {number} [opts.durationDays] - days until expiry (default: 30)
 * @returns {{ declined_at: string, expires_at: string }}
 */
function writeDecline(cwd, { now = new Date().toISOString(), durationDays = DEFAULT_DURATION_DAYS } = {}) {
  const existing = _readJson();
  const expiresAt = _computeExpiresAt(now, durationDays);
  existing[cwd] = { declined_at: now, expires_at: expiresAt };
  _writeJsonAtomic(existing);
  return { declined_at: now, expires_at: expiresAt };
}

/**
 * Read the decline status for the given cwd.
 * Auto-prunes expired entries from the file (intentional side-effect on read).
 *
 * @param {string} cwd - absolute path to the project directory
 * @param {object} [opts]
 * @param {string} [opts.now] - ISO 8601 timestamp (default: current time)
 * @returns {{ declined: boolean, expires_at: string|null }}
 */
function readDecline(cwd, { now = new Date().toISOString() } = {}) {
  const data = _readJson();
  const entry = data[cwd];

  if (!entry) {
    return { declined: false, expires_at: null };
  }

  const isExpired = entry.expires_at <= now;

  if (isExpired) {
    // Auto-prune: remove all expired entries and rewrite
    const pruned = {};
    for (const [key, val] of Object.entries(data)) {
      if (val.expires_at > now) {
        pruned[key] = val;
      }
    }
    _writeJsonAtomic(pruned);
    return { declined: false, expires_at: null };
  }

  return { declined: true, expires_at: entry.expires_at };
}

/**
 * Clear the decline entry for the given cwd. Idempotent — no error if absent.
 * When the last entry is removed, writes {} (does NOT delete the file).
 *
 * @param {string} cwd - absolute path to the project directory
 * @returns {{ cleared: boolean, was_present: boolean }}
 */
function clearDecline(cwd) {
  const data = _readJson();

  if (!Object.prototype.hasOwnProperty.call(data, cwd)) {
    return { cleared: false, was_present: false };
  }

  delete data[cwd];
  _writeJsonAtomic(data);
  return { cleared: true, was_present: true };
}

// ─── CLI entry points ─────────────────────────────────────────────────────────

/**
 * CLI handler for `df-tools project-decline [<cwd>] [--duration-days N]`
 *
 * @param {string} processCwd - process.cwd() (used as default cwd)
 * @param {string[]} args - args after 'project-decline'
 * @param {boolean} raw - --raw flag (true = JSON output)
 */
function cmdProjectDecline(processCwd, args, raw) {
  // Parse args: optional positional path, optional --duration-days N
  let targetCwd = processCwd;
  let durationDays = DEFAULT_DURATION_DAYS;

  const argsCopy = [...args];
  const durationIdx = argsCopy.indexOf('--duration-days');

  if (durationIdx !== -1) {
    const durationStr = argsCopy[durationIdx + 1];
    const parsed = parseInt(durationStr, 10);
    if (!durationStr || isNaN(parsed) || parsed <= 0) {
      error(`--duration-days must be a positive integer, got: ${durationStr}`);
      return;
    }
    durationDays = parsed;
    argsCopy.splice(durationIdx, 2);
  }

  // If there's a remaining positional arg that isn't a flag, it's the cwd
  if (argsCopy.length > 0 && !argsCopy[0].startsWith('--')) {
    targetCwd = argsCopy[0];
  }

  const result = writeDecline(targetCwd, { durationDays });

  const humanSummary = `Declined: ${targetCwd}\n  declined_at: ${result.declined_at}\n  expires_at:  ${result.expires_at}`;
  output(result, raw, JSON.stringify(result));
}

/**
 * CLI handler for `df-tools project-accept [<cwd>]`
 *
 * @param {string} processCwd - process.cwd() (used as default cwd)
 * @param {string[]} args - args after 'project-accept'
 * @param {boolean} raw - --raw flag (true = JSON output)
 */
function cmdProjectAccept(processCwd, args, raw) {
  // Parse args: optional positional path
  let targetCwd = processCwd;

  const argsCopy = [...args];
  if (argsCopy.length > 0 && !argsCopy[0].startsWith('--')) {
    targetCwd = argsCopy[0];
  }

  const result = clearDecline(targetCwd);

  const humanSummary = result.cleared
    ? `Accepted: ${targetCwd} (decline entry removed)`
    : `Accepted: ${targetCwd} (no active decline entry)`;
  output(result, raw, JSON.stringify(result));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  writeDecline,
  readDecline,
  clearDecline,
  cmdProjectDecline,
  cmdProjectAccept,
  DECLINED_PROJECTS_PATH,
  _setDeclinePath,
  _setRunFs,
  _resetMocks,
};

'use strict';

/**
 * decline-tracker-fixtures.cjs — Test fixtures for decline-tracker.cjs
 *
 * Provides:
 *   mkTmpDeclineHome()     — returns a tmpdir-based path safe for _setDeclinePath injection
 *   mkDeclineFile(entries, declineFilePath) — write declined-projects.json with entries
 *   SCENARIOS              — named presets for various decline file states
 *   Constants: NOW, NOW_PLUS_30D, PAST, PAST_PLUS_1D
 *
 * Hand-built factory builders. No random IDs. Locked test timestamps.
 * Caller MUST clean up: fs.rmSync(path.dirname(returnedPath), { recursive: true, force: true })
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── Locked test timestamps ───────────────────────────────────────────────────

const NOW = '2026-05-04T12:00:00.000Z';
const NOW_PLUS_30D = '2026-06-03T12:00:00.000Z';
const PAST = '2026-04-01T12:00:00.000Z';
const PAST_PLUS_1D = '2026-04-02T12:00:00.000Z';

// ─── Factory helpers ──────────────────────────────────────────────────────────

/**
 * Returns a path safe to use as DECLINED_PROJECTS_PATH override in tests.
 * The returned path does NOT exist yet; tests must call mkDeclineFile or
 * let writeDecline create it. The parent dir will be created.
 *
 * Path pattern: <tmpdir>/decline-home-XXXX/.claude/devflow/declined-projects.json
 *
 * @returns {string} absolute path to declined-projects.json in a fresh tmpdir
 */
function mkTmpDeclineHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'decline-home-'));
  return path.join(home, '.claude', 'devflow', 'declined-projects.json');
}

/**
 * Write declined-projects.json with given entries object.
 * Creates parent directory if it does not exist.
 *
 * @param {object} entries - top-level { [cwd]: { declined_at, expires_at } }
 * @param {string} declineFilePath - absolute path to write (typically from mkTmpDeclineHome)
 */
function mkDeclineFile(entries, declineFilePath) {
  const dir = path.dirname(declineFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(declineFilePath, JSON.stringify(entries, null, 2));
}

// ─── Named scenarios ──────────────────────────────────────────────────────────

const SCENARIOS = {
  /** empty: no entries in the file */
  empty: () => ({}),

  /** oneActive: one non-expired entry */
  oneActive: () => ({
    '/some/path': { declined_at: NOW, expires_at: NOW_PLUS_30D },
  }),

  /** oneExpired: one expired entry (expires_at is in the past) */
  oneExpired: () => ({
    '/some/path': { declined_at: PAST, expires_at: PAST_PLUS_1D },
  }),

  /** mixed: one active + one expired entry */
  mixed: () => ({
    '/active': { declined_at: NOW, expires_at: NOW_PLUS_30D },
    '/expired': { declined_at: PAST, expires_at: PAST_PLUS_1D },
  }),
};

module.exports = {
  mkTmpDeclineHome,
  mkDeclineFile,
  SCENARIOS,
  NOW,
  NOW_PLUS_30D,
  PAST,
  PAST_PLUS_1D,
};

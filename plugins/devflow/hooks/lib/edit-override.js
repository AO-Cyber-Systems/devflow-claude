/**
 * hooks/lib/edit-override.js — Shared override-phrase + marker helpers
 *
 * Single source of truth for:
 *   - OVERRIDE_PHRASES list (consumed by route-intent.js and gate-edits.js)
 *   - hasOverridePhrase() detection helper
 *   - .edit-override marker write/consume lifecycle with TTL guard
 *
 * Design contract (locked decision 1, 24-CONTEXT.md):
 *   - route-intent.js (UserPromptSubmit) detects override phrases and writes the marker
 *   - gate-edits.js (PreToolUse) consumes the marker (check + delete = single-turn)
 *   - Stale markers (mtime > TTL) are ALSO deleted on consume (cleanup on read)
 *   - All fs ops are try/catch — hooks must never crash the harness
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Override phrases — single source of truth (locked decision 1)
// ---------------------------------------------------------------------------

const OVERRIDE_PHRASES = [
  'skip devflow',
  'just edit',
  'bypass devflow',
  'force edit',
];

// ---------------------------------------------------------------------------
// TTL for the single-turn marker (planner-locked: "a few minutes")
// ---------------------------------------------------------------------------

const EDIT_OVERRIDE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `text` contains any override phrase (case-insensitive).
 * Null-safe: returns false for null/undefined/non-string.
 *
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
function hasOverridePhrase(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return OVERRIDE_PHRASES.some(p => lower.includes(p));
}

/**
 * Returns the absolute path to the .edit-override marker file.
 *
 * @param {string} planningDir - Absolute path to the .planning directory
 * @returns {string}
 */
function editOverrideMarkerPath(planningDir) {
  return path.join(planningDir, '.edit-override');
}

// ---------------------------------------------------------------------------
// Marker lifecycle
// ---------------------------------------------------------------------------

/**
 * Write a single-turn .edit-override marker to planningDir.
 * Called by route-intent.js (UserPromptSubmit) when an override phrase is detected.
 *
 * @param {string|null|undefined} planningDir
 * @returns {boolean} true on success, false on any error (falsy planningDir, fs error)
 */
function writeEditOverrideMarker(planningDir) {
  if (!planningDir) return false;
  try {
    fs.writeFileSync(
      editOverrideMarkerPath(planningDir),
      JSON.stringify({ created_at: new Date().toISOString() })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Consume the .edit-override marker: check freshness, delete in ALL cases (fresh or stale).
 * Called by gate-edits.js (PreToolUse) to compute overrideActive.
 *
 * Behavior:
 *   - falsy planningDir → false
 *   - marker missing → false
 *   - marker exists, fresh (mtime within TTL) → true, marker deleted
 *   - marker exists, stale (mtime > TTL) → false, marker deleted
 *   - fs errors on delete are swallowed (best-effort; TTL bounds any leftover)
 *
 * @param {string|null|undefined} planningDir
 * @param {number} [nowMs] - Current time in ms (injectable for deterministic tests)
 * @returns {boolean}
 */
function consumeEditOverrideMarker(planningDir, nowMs = Date.now()) {
  if (!planningDir) return false;

  const markerPath = editOverrideMarkerPath(planningDir);

  // Stat the marker; ENOENT → not present → false
  let stat;
  try {
    stat = fs.statSync(markerPath);
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    // Other stat error (EACCES etc.) — fail closed
    return false;
  }

  const mtimeMs = stat.mtimeMs;

  // Delete the marker in ALL cases (consume-on-read + stale cleanup)
  try {
    fs.unlinkSync(markerPath);
  } catch {
    // Best-effort delete; EACCES / race → marker may linger but TTL bounds it
  }

  // Fresh if age <= TTL
  return (nowMs - mtimeMs) <= EDIT_OVERRIDE_TTL_MS;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  OVERRIDE_PHRASES,
  EDIT_OVERRIDE_TTL_MS,
  hasOverridePhrase,
  editOverrideMarkerPath,
  writeEditOverrideMarker,
  consumeEditOverrideMarker,
};

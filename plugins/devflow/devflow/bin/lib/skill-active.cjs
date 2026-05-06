'use strict';

/**
 * skill-active.cjs — df-tools skill-active CLI subcommand
 *
 * Manages the `.planning/.skill-active` marker file that signals to gate-edits.js
 * (TRD 15-03) that a DevFlow skill is currently running and Edit/Write/MultiEdit
 * should be allowed.
 *
 * CLI surface:
 *   df-tools skill-active --start <skill-name>   writes marker
 *   df-tools skill-active --end                  removes marker (idempotent)
 *   df-tools skill-active --status               show marker JSON or {active:false}
 *
 * Also accepts start/end/status without -- prefix for ergonomics.
 *
 * Marker format:
 *   { "skill": "<name>", "started_at": "<ISO8601>", "pid": <number> }
 *
 * Note: pid is the df-tools subprocess PID, not the calling skill's PID.
 * Skills are ephemeral Claude tool calls without a stable PID; the df-tools
 * call PID is an acceptable diagnostic value.
 */

const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');

// ─── fs injection (for testability) ──────────────────────────────────────────

const realFs = {
  existsSync: (...a) => fs.existsSync(...a),
  mkdirSync: (...a) => fs.mkdirSync(...a),
  writeFileSync: (...a) => fs.writeFileSync(...a),
  unlinkSync: (...a) => fs.unlinkSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
};
let _runFs = realFs;

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// ─── findPlanningDir ──────────────────────────────────────────────────────────

/**
 * Walk up from `start` to find the nearest ancestor containing `.planning/`.
 * Returns the full path to `.planning/` or null if not found.
 *
 * Does NOT shell out to git — mirrors the pattern used by other df-tools helpers.
 */
function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (_runFs.existsSync(path.join(dir, '.planning'))) {
      return path.join(dir, '.planning');
    }
    dir = path.dirname(dir);
  }
  return null;
}

// ─── markerPath ───────────────────────────────────────────────────────────────

/**
 * Returns the absolute path to `.planning/.skill-active`.
 * Marker is INSIDE .planning/, not at project root.
 */
function markerPath(planningDir) {
  return path.join(planningDir, '.skill-active');
}

// ─── startSkill ───────────────────────────────────────────────────────────────

/**
 * Writes the skill-active marker file.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .planning/ or null
 * @param {string|undefined} opts.skillName - skill name (caller-supplied, opaque)
 * @param {number} opts.pid - process PID (df-tools subprocess PID)
 * @param {string} opts.now - ISO8601 timestamp string (injected for testability)
 * @returns {{ ok: boolean, marker?: object, path?: string, reason?: string, message?: string }}
 */
function startSkill({ planningDir, skillName, pid, now }) {
  if (!planningDir) {
    return {
      ok: false,
      reason: 'no-planning-dir',
      message: 'No .planning/ directory found in cwd or ancestors',
    };
  }

  if (!skillName || typeof skillName !== 'string' || !skillName.trim()) {
    return {
      ok: false,
      reason: 'missing-skill-name',
      message: 'skill-active --start requires <skill-name> argument',
    };
  }

  const payload = {
    skill: skillName.trim(),
    started_at: now,
    pid,
  };

  try {
    _runFs.writeFileSync(markerPath(planningDir), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } catch (e) {
    return {
      ok: false,
      reason: 'write-failed',
      message: e.message,
    };
  }

  return { ok: true, marker: payload, path: markerPath(planningDir) };
}

// ─── endSkill ─────────────────────────────────────────────────────────────────

/**
 * Removes the skill-active marker file. Idempotent — no error if absent.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .planning/ or null
 * @returns {{ ok: boolean, removed?: boolean, message?: string, reason?: string }}
 */
function endSkill({ planningDir }) {
  if (!planningDir) {
    return {
      ok: false,
      reason: 'no-planning-dir',
      message: 'No .planning/ directory found in cwd or ancestors',
    };
  }

  const p = markerPath(planningDir);

  if (!_runFs.existsSync(p)) {
    return { ok: true, removed: false, message: 'Marker did not exist (idempotent no-op)' };
  }

  try {
    _runFs.unlinkSync(p);
  } catch (e) {
    return { ok: false, reason: 'unlink-failed', message: e.message };
  }

  return { ok: true, removed: true };
}

// ─── statusSkill ─────────────────────────────────────────────────────────────

/**
 * Returns the current marker state.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .planning/ or null
 * @returns {{ active: boolean, marker?: object|null, path?: string, reason?: string, parse_error?: string }}
 */
function statusSkill({ planningDir }) {
  if (!planningDir) {
    return { active: false, reason: 'no-planning-dir' };
  }

  const p = markerPath(planningDir);

  if (!_runFs.existsSync(p)) {
    return { active: false };
  }

  try {
    const raw = _runFs.readFileSync(p, 'utf8');
    return { active: true, marker: JSON.parse(raw), path: p };
  } catch (e) {
    return { active: true, marker: null, path: p, parse_error: e.message };
  }
}

// ─── cmdSkillActive ───────────────────────────────────────────────────────────

/**
 * CLI entry point for `df-tools skill-active`.
 *
 * @param {string} cwd - current working directory (for findPlanningDir)
 * @param {string[]} args - args after the 'skill-active' keyword
 *   e.g. ['--start', 'build'] or ['--end'] or ['--status']
 * @param {boolean} raw - --raw flag (true = JSON-only output)
 */
function cmdSkillActive(cwd, args, raw) {
  const planningDir = findPlanningDir(cwd);

  // Support both --start and start (with and without -- prefix)
  const op = (args[0] || '').replace(/^--/, '');
  const skillName = args[1];

  if (op === 'start') {
    const result = startSkill({
      planningDir,
      skillName,
      pid: process.pid,
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      error(result.message || 'skill-active --start failed');
      return;
    }
    output(result, raw, JSON.stringify(result));
    return;
  }

  if (op === 'end') {
    const result = endSkill({ planningDir });
    if (!result.ok) {
      error(result.message || 'skill-active --end failed');
      return;
    }
    output(result, raw, JSON.stringify(result));
    return;
  }

  if (op === 'status') {
    const result = statusSkill({ planningDir });
    output(result, raw, JSON.stringify(result));
    return;
  }

  error(`Unknown skill-active subcommand: "${op}". Available: --start <name>, --end, --status`);
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  cmdSkillActive,
  startSkill,
  endSkill,
  statusSkill,
  findPlanningDir,
  markerPath,
  _setRunFs,
  _resetMocks,
};

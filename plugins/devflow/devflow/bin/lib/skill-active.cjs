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

// ─── worktree-aware resolution (TRD 27-01) ───────────────────────────────────

/**
 * Default marker lifetime. A crashed skill must not leave the edit gate open
 * forever; 8h comfortably exceeds a long build while still bounding the blast
 * radius. Legacy markers with no `expires_at` never expire (back-compat).
 */
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Walk up from `start` to the nearest directory containing `.git`
 * (a directory in a normal checkout, a file in a linked worktree).
 */
function findRepoRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (_runFs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Given a repo root, return the MAIN checkout's root.
 *
 * In a linked worktree, `.git` is a file containing
 * `gitdir: /main/.git/worktrees/<name>` — so the main checkout is everything
 * before `/.git/worktrees/`. In a normal checkout `.git` is a directory and
 * readFileSync throws EISDIR, so the input is already the main root.
 *
 * Deliberately does not shell out to git (mirrors findPlanningDir's contract).
 */
function mainRepoRootFrom(repoRoot) {
  if (!repoRoot) return null;
  let raw;
  try {
    raw = _runFs.readFileSync(path.join(repoRoot, '.git'), 'utf8');
  } catch {
    return repoRoot; // .git is a directory → already the main checkout
  }
  const m = /^gitdir:\s*(.+)$/m.exec(String(raw));
  if (!m) return repoRoot;
  const marker = `${path.sep}.git${path.sep}worktrees${path.sep}`;
  const idx = m[1].trim().indexOf(marker);
  return idx === -1 ? repoRoot : m[1].trim().slice(0, idx);
}

/**
 * The `.planning/` of the MAIN checkout, as seen from anywhere inside a
 * worktree. Returns null when it cannot be resolved or does not exist.
 *
 * This is the fix for the audit's F-02: `.planning/.skill-active` is gitignored,
 * so a worktree checks out `.planning/` WITHOUT the marker and every
 * worktree-isolated agent was denied.
 */
function sharedPlanningDir(start) {
  const mainRoot = mainRepoRootFrom(findRepoRoot(start));
  if (!mainRoot) return null;
  const p = path.join(mainRoot, '.planning');
  return _runFs.existsSync(p) ? p : null;
}

/**
 * True when a marker payload has an `expires_at` in the past.
 * Markers without `expires_at` (written before TRD 27-01) never expire.
 */
function isExpired(marker, nowMs) {
  if (!marker || !marker.expires_at) return false;
  const t = Date.parse(marker.expires_at);
  return Number.isFinite(t) && nowMs > t;
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
 * @param {string|null} [opts.sharedDir] - MAIN checkout's .planning/ when the
 *   caller is inside a linked worktree; the marker is mirrored there so
 *   worktree-isolated agents can see it (TRD 27-01).
 * @param {number} [opts.ttlMs] - marker lifetime, defaults to DEFAULT_TTL_MS
 * @returns {{ ok: boolean, marker?: object, path?: string, paths?: string[], reason?: string, message?: string }}
 */
function startSkill({ planningDir, skillName, pid, now, sharedDir, ttlMs }) {
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

  const startedMs = Date.parse(now);
  const payload = {
    skill: skillName.trim(),
    started_at: now,
    pid,
    expires_at: new Date(
      (Number.isFinite(startedMs) ? startedMs : Date.now()) + (ttlMs || DEFAULT_TTL_MS)
    ).toISOString(),
  };

  // Write to every distinct location a reader might resolve: the caller's own
  // .planning/ and — when started from inside a linked worktree — the MAIN
  // checkout's .planning/, so sibling worktree agents see the same marker.
  const targets = [planningDir];
  if (sharedDir && sharedDir !== planningDir) targets.push(sharedDir);

  const written = [];
  for (const dir of targets) {
    try {
      _runFs.writeFileSync(markerPath(dir), JSON.stringify(payload, null, 2) + '\n', 'utf8');
      written.push(markerPath(dir));
    } catch (e) {
      // The caller's own .planning/ is required; the shared copy is best-effort.
      if (dir === planningDir) {
        return { ok: false, reason: 'write-failed', message: e.message };
      }
    }
  }

  return { ok: true, marker: payload, path: markerPath(planningDir), paths: written };
}

// ─── endSkill ─────────────────────────────────────────────────────────────────

/**
 * Removes the skill-active marker file. Idempotent — no error if absent.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .planning/ or null
 * @returns {{ ok: boolean, removed?: boolean, message?: string, reason?: string }}
 */
function endSkill({ planningDir, sharedDir }) {
  const targets = [];
  if (planningDir) targets.push(planningDir);
  if (sharedDir && sharedDir !== planningDir) targets.push(sharedDir);

  if (!targets.length) {
    return {
      ok: false,
      reason: 'no-planning-dir',
      message: 'No .planning/ directory found in cwd or ancestors',
    };
  }

  let removed = false;
  for (const dir of targets) {
    const p = markerPath(dir);
    if (!_runFs.existsSync(p)) continue;
    try {
      _runFs.unlinkSync(p);
      removed = true;
    } catch (e) {
      return { ok: false, reason: 'unlink-failed', message: e.message };
    }
  }

  return removed
    ? { ok: true, removed: true }
    : { ok: true, removed: false, message: 'Marker did not exist (idempotent no-op)' };
}

// ─── statusSkill ─────────────────────────────────────────────────────────────

/**
 * Returns the current marker state.
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir - absolute path to .planning/ or null
 * @returns {{ active: boolean, marker?: object|null, path?: string, reason?: string, parse_error?: string }}
 */
function statusSkill({ planningDir, sharedDir, nowMs }) {
  const candidates = [];
  if (planningDir) candidates.push(planningDir);
  if (sharedDir && sharedDir !== planningDir) candidates.push(sharedDir);

  if (!candidates.length) {
    return { active: false, reason: 'no-planning-dir' };
  }

  const at = Number.isFinite(nowMs) ? nowMs : Date.now();
  let expiredPath = null;

  for (const dir of candidates) {
    const p = markerPath(dir);
    if (!_runFs.existsSync(p)) continue;

    let marker;
    try {
      marker = JSON.parse(_runFs.readFileSync(p, 'utf8'));
    } catch (e) {
      // Unparseable marker is still a marker — fail open, as before.
      return { active: true, marker: null, path: p, parse_error: e.message };
    }

    if (isExpired(marker, at)) { expiredPath = p; continue; }
    return { active: true, marker, path: p };
  }

  return expiredPath
    ? { active: false, reason: 'expired', path: expiredPath }
    : { active: false };
}

/**
 * Boolean convenience wrapper used by the edit gate.
 * Resolves both the local and the MAIN-checkout marker and honours TTL.
 */
function isSkillActive({ cwd, nowMs }) {
  const planningDir = findPlanningDir(cwd);
  const sharedDir = sharedPlanningDir(cwd);
  return statusSkill({ planningDir, sharedDir, nowMs }).active === true;
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
  const sharedDir = sharedPlanningDir(cwd);

  // Support both --start and start (with and without -- prefix)
  const op = (args[0] || '').replace(/^--/, '');
  const skillName = args[1];

  if (op === 'start') {
    const result = startSkill({
      planningDir,
      sharedDir,
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
    const result = endSkill({ planningDir, sharedDir });
    if (!result.ok) {
      error(result.message || 'skill-active --end failed');
      return;
    }
    output(result, raw, JSON.stringify(result));
    return;
  }

  if (op === 'status') {
    const result = statusSkill({ planningDir, sharedDir });
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
  isSkillActive,
  findPlanningDir,
  findRepoRoot,
  mainRepoRootFrom,
  sharedPlanningDir,
  isExpired,
  markerPath,
  DEFAULT_TTL_MS,
  _setRunFs,
  _resetMocks,
};

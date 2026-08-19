'use strict';

/**
 * override.cjs — TRD 30-04
 *
 * A structured, logged replacement for prose gate overrides.
 *
 * Today a user bypasses a gate by typing "skip devflow" or exporting
 * DEVFLOW_ALLOW_RAW_COMMIT=1. Both work, and both are invisible to DevFlow: the
 * 2026-08-18 audit found 15 user-authored overrides across 10 sessions, and not
 * one of them left a trace. That is the wrong signal to discard — a gate
 * overridden repeatedly is a gate that needs rescoping, and without a log the
 * only way to learn that is a forensic transcript audit.
 *
 * This records WHY, so `/devflow:status` can show which gates people keep
 * fighting.
 *
 * The phrase path still works; this is an additional, auditable entry point,
 * not a replacement that breaks muscle memory.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = '.override-log.jsonl';
/** Gates that can be overridden, mapped to the marker the hook consumes. */
const GATES = {
  edits: '.edit-override',
  commits: null,   // env-var driven (DEVFLOW_ALLOW_RAW_COMMIT); logged only
  changelog: null, // env-var driven (DEVFLOW_SKIP_CHANGELOG_GATE); logged only
};
/** Keep the log bounded — it is a signal, not an archive. */
const MAX_ENTRIES = 500;

function logPath(planningDir) {
  return path.join(planningDir, LOG_FILE);
}

/**
 * Record an override and, where the gate is marker-driven, arm the marker.
 *
 * @param {object} opts
 * @param {string} opts.planningDir
 * @param {string} opts.gate - one of Object.keys(GATES)
 * @param {string} opts.reason - free text; required, because an override
 *   without a stated reason is exactly the signal that gets lost
 * @param {string} [opts.now] - ISO timestamp (injected for tests)
 * @returns {{ok: boolean, gate?: string, marker?: string|null, reason?: string, message?: string}}
 */
function recordOverride({ planningDir, gate, reason, now }) {
  if (!planningDir) {
    return { ok: false, reason_code: 'no-planning-dir', message: 'No .planning/ directory found' };
  }
  if (!gate || !Object.prototype.hasOwnProperty.call(GATES, gate)) {
    return {
      ok: false,
      reason_code: 'unknown-gate',
      message: `Unknown gate "${gate}". Known: ${Object.keys(GATES).join(', ')}`,
    };
  }
  if (!reason || !String(reason).trim()) {
    return {
      ok: false,
      reason_code: 'missing-reason',
      message: 'A reason is required — an unexplained override is the signal this command exists to capture',
    };
  }

  const entry = {
    gate,
    reason: String(reason).trim(),
    at: now || new Date().toISOString(),
  };

  try {
    fs.appendFileSync(logPath(planningDir), JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    return { ok: false, reason_code: 'log-failed', message: e.message };
  }

  // Arm the marker for gates that consume one (single-turn, TTL-bounded).
  let marker = null;
  if (GATES[gate]) {
    marker = path.join(planningDir, GATES[gate]);
    try {
      fs.writeFileSync(marker, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      marker = null; // logged regardless; the phrase path still works
    }
  }

  return { ok: true, gate, reason: entry.reason, at: entry.at, marker };
}

/**
 * Read the override log, newest first, with per-gate tallies.
 *
 * @param {object} opts
 * @param {string} opts.planningDir
 * @param {number} [opts.limit=20]
 * @returns {{entries: object[], by_gate: object, total: number}}
 */
function readOverrides({ planningDir, limit = 20 }) {
  if (!planningDir) return { entries: [], by_gate: {}, total: 0 };
  let raw;
  try { raw = fs.readFileSync(logPath(planningDir), 'utf8'); } catch { return { entries: [], by_gate: {}, total: 0 }; }

  const all = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { all.push(JSON.parse(line)); } catch { /* skip a corrupt line, keep the rest */ }
  }

  const by_gate = {};
  for (const e of all) by_gate[e.gate] = (by_gate[e.gate] || 0) + 1;

  return {
    entries: all.slice(-limit).reverse(),
    by_gate,
    total: all.length,
    // A gate fought repeatedly is mis-scoped, not a user problem.
    needs_rescoping: Object.entries(by_gate)
      .filter(([, n]) => n >= 5)
      .map(([g, n]) => ({ gate: g, overrides: n })),
  };
}

/**
 * Trim the log to MAX_ENTRIES, keeping the newest.
 */
function pruneLog(planningDir, max = MAX_ENTRIES) {
  try {
    const raw = fs.readFileSync(logPath(planningDir), 'utf8');
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length <= max) return { pruned: 0 };
    const keep = lines.slice(-max);
    fs.writeFileSync(logPath(planningDir), keep.join('\n') + '\n', 'utf8');
    return { pruned: lines.length - keep.length };
  } catch {
    return { pruned: 0 };
  }
}

module.exports = { recordOverride, readOverrides, pruneLog, GATES, LOG_FILE, MAX_ENTRIES };

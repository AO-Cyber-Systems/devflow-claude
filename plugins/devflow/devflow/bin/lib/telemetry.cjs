'use strict';

/**
 * telemetry.cjs — TRD 31-01
 *
 * One view over the signals objectives 27-30 started emitting, so a drifting
 * run is visible without a forensic transcript audit.
 *
 * Sources, all local and already being written:
 *   .planning/.override-log.jsonl   — structured gate overrides (TRD 30-04)
 *   .planning/.progress-guard.json  — stuck-loop detection state (TRD 28-04)
 *   session transcripts             — blocking events (TRD 31-03)
 *
 * Deliberately read-only and cheap: it aggregates what exists rather than
 * instrumenting anything new. The expensive part (transcript scanning) is
 * opt-in via `sessions`, so the default call is fast enough for a status view.
 */

const fs = require('fs');
const path = require('path');
const { readOverrides } = require('./override.cjs');

/**
 * @param {object} opts
 * @param {string|null} opts.planningDir
 * @param {object} [opts.sessionReport] - optional output of session-audit analyze()
 * @returns {object}
 */
function collect({ planningDir, sessionReport }) {
  const out = { overrides: null, progress_guard: null, blocks: null, advisories: [] };
  if (!planningDir) return { ...out, advisories: ['no .planning/ — not a DevFlow project'] };

  // --- overrides -----------------------------------------------------------
  const ov = readOverrides({ planningDir, limit: 5 });
  out.overrides = { total: ov.total, by_gate: ov.by_gate, recent: ov.entries };
  for (const r of ov.needs_rescoping || []) {
    out.advisories.push(
      `gate "${r.gate}" overridden ${r.overrides}x — a gate fought repeatedly is mis-scoped, not a user problem`
    );
  }

  // --- progress guard ------------------------------------------------------
  try {
    const raw = fs.readFileSync(path.join(planningDir, '.progress-guard.json'), 'utf8');
    const all = JSON.parse(raw);
    const sessions = Object.entries(all)
      .map(([sid, e]) => ({ session: sid, streak: (e && e.guard && e.guard.streak) || 0, updated: e && e.updated }))
      .sort((a, b) => b.streak - a.streak);
    out.progress_guard = { sessions_tracked: sessions.length, worst_streak: sessions[0] ? sessions[0].streak : 0 };
    if (out.progress_guard.worst_streak >= 3) {
      out.advisories.push(
        `a session repeated the same call ${out.progress_guard.worst_streak}x — check for a stuck loop`
      );
    }
  } catch { out.progress_guard = { sessions_tracked: 0, worst_streak: 0 }; }

  // --- blocking events (opt-in; caller supplies the scan) ------------------
  if (sessionReport) {
    out.blocks = {
      total: sessionReport.total_events,
      devflow_owned: sessionReport.devflow_owned_events,
      sessions_with_blocks_pct: sessionReport.sessions_with_blocks_pct,
      top: Object.entries(sessionReport.by_category || {}).slice(0, 5)
        .map(([category, n]) => ({ category, events: n })),
    };
    if (sessionReport.devflow_owned_events > 0) {
      out.advisories.push(
        `${sessionReport.devflow_owned_events} DevFlow-owned blocks in this window — ` +
        `objectives 27/30 target these; re-check after the plugin cache re-syncs`
      );
    }
  }

  if (!out.advisories.length) out.advisories.push('nothing needs attention');
  return out;
}

module.exports = { collect };

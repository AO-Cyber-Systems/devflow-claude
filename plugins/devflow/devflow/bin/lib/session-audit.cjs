'use strict';

/**
 * session-audit.cjs — TRD 31-03
 *
 * Classifies autonomy-blocking events in Claude Code session transcripts.
 *
 * This is the durable form of the 2026-08-18 Autonomy Blocker Audit, which was
 * a throwaway script. Two reasons it needs to live in the repo:
 *
 *   1. It is the acceptance test for objectives 27-30. Those objectives claim to
 *      have removed specific block categories; the only honest way to confirm
 *      that is to re-measure and watch the categories collapse.
 *   2. Re-deriving it invites re-deriving its bugs. The original first pass
 *      counted prose ABOUT gates as gate events (899 false hits from planning
 *      documents that merely discuss them). Classification here runs only on
 *      structured tool_result errors, never on free text.
 *
 * Baseline to beat (2,746 sessions, 2026-05-29 → 2026-08-18):
 *   worktree-isolation   2685   (harness guard, not DevFlow — mitigated in 27-05)
 *   devflow-edit-gate    1357   (fixed in 27-01/27-02)
 *   devflow-commit-gate   446   (fixed in 27-04)
 *   file-not-found        498   (mitigated in 30-03)
 *   tool-not-available    164   (fixed in 30-01)
 *   skill-not-invocable    68   (fixed in 30-02)
 */

const fs = require('fs');
const path = require('path');

/**
 * Classifiers, applied ONLY to the content of a failed tool_result.
 * Order matters — first match wins, most specific first.
 */
const RULES = [
  ['devflow-edit-gate', /DevFlow ambient mode active|direct Edit\/Write\/MultiEdit denied/i],
  ['devflow-commit-gate', /Raw .?git commit.? is blocked|df-tools\.cjs commit.*so the commit is scoped/i],
  ['devflow-changelog-gate', /CHANGELOG\.md lacks|DEVFLOW_SKIP_CHANGELOG_GATE/i],
  ['worktree-isolation', /is isolated in the worktree/i],
  ['skill-not-invocable', /disable-model-invocation/i],
  ['tool-not-available', /No such tool available|is not enabled in this context/i],
  ['permission-denial', /user doesn't want to (proceed|take this action)|tool use was rejected/i],
  ['read-before-write', /File has not been read yet|File has been modified since read/i],
  ['edit-string-miss', /String to replace not found|No changes to make: old_string and new_string/i],
  ['command-timeout', /Command timed out after/i],
  ['file-not-found', /File does not exist|ENOENT|no such file or directory/i],
  ['output-too-large', /exceeds maximum allowed (size|tokens)/i],
];

/** Categories DevFlow owns and this programme claims to have fixed. */
const DEVFLOW_OWNED = new Set([
  'devflow-edit-gate', 'devflow-commit-gate', 'devflow-changelog-gate',
  'skill-not-invocable', 'tool-not-available',
]);

/**
 * Classify one failed tool_result's text.
 * @param {string} text
 * @returns {string} category, or 'other-tool-error'
 */
function classify(text) {
  const t = String(text || '');
  for (const [name, re] of RULES) if (re.test(t)) return name;
  return 'other-tool-error';
}

function newAccumulator() {
  return { events: [], sessions: new Set(), blockedSessions: new Set(), files: 0 };
}

/**
 * Fold one transcript record into the accumulator.
 * Exported so aggregation is testable without disk.
 */
function accumulate(acc, row, sessionId) {
  if (!row || typeof row !== 'object') return;
  if (sessionId) acc.sessions.add(sessionId);

  const content = row.message && row.message.content;
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type !== 'tool_result' || block.is_error !== true) continue;
    const text = typeof block.content === 'string'
      ? block.content
      : JSON.stringify(block.content || '');
    acc.events.push({
      category: classify(text),
      ts: row.timestamp || null,
      sidechain: row.isSidechain === true,
      session: sessionId || null,
    });
    if (sessionId) acc.blockedSessions.add(sessionId);
  }
}

/**
 * @param {object} acc
 * @returns {object} report
 */
function summarize(acc) {
  const by_category = {};
  const by_period = {};
  let sidechain = 0;

  for (const e of acc.events) {
    by_category[e.category] = (by_category[e.category] || 0) + 1;
    if (e.sidechain) sidechain += 1;
    if (e.ts) {
      const period = String(e.ts).slice(0, 7);
      (by_period[period] || (by_period[period] = {}))[e.category] =
        (by_period[period][e.category] || 0) + 1;
    }
  }

  const devflowOwned = Object.entries(by_category)
    .filter(([c]) => DEVFLOW_OWNED.has(c))
    .reduce((a, [, n]) => a + n, 0);

  const sessions = acc.sessions.size;
  return {
    files_scanned: acc.files,
    sessions,
    sessions_with_blocks: acc.blockedSessions.size,
    sessions_with_blocks_pct: sessions
      ? +((100 * acc.blockedSessions.size) / sessions).toFixed(1) : 0,
    total_events: acc.events.length,
    sidechain_pct: acc.events.length
      ? +((100 * sidechain) / acc.events.length).toFixed(1) : 0,
    by_category: Object.fromEntries(
      Object.entries(by_category).sort((a, b) => b[1] - a[1])
    ),
    by_period,
    devflow_owned_events: devflowOwned,
    // The programme's claim, stated as a number rather than a vibe.
    verdict: devflowOwned === 0
      ? 'no DevFlow-owned blocks in this window'
      : `${devflowOwned} DevFlow-owned blocks remain — objectives 27/30 target these`,
  };
}

function collectTranscripts(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectTranscripts(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

/**
 * Scan transcripts and report blocking events.
 *
 * @param {string[]} roots
 * @param {{limit?: number, since?: string}} [opts] - `since` is an ISO date;
 *   events before it are excluded, which is how you compare a window AFTER a
 *   fix against the baseline before it.
 * @returns {object}
 */
function analyze(roots, opts = {}) {
  const acc = newAccumulator();
  let files = [];
  for (const r of roots) collectTranscripts(r, files);
  if (opts.limit && files.length > opts.limit) files = files.slice(0, opts.limit);
  acc.files = files.length;

  for (const file of files) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const sessionId = path.basename(file, '.jsonl');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (opts.since && row.timestamp && String(row.timestamp) < opts.since) continue;
      accumulate(acc, row, sessionId);
    }
  }
  return summarize(acc);
}

module.exports = {
  analyze, accumulate, summarize, newAccumulator, classify,
  collectTranscripts, RULES, DEVFLOW_OWNED,
};

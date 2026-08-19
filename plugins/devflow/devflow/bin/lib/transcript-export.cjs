'use strict';

/**
 * transcript-export.cjs — TRD 31-02
 *
 * Preserves session history before Claude Code's retention cleanup removes it.
 *
 * The 2026-08-18 audit found 164 sessions between 2026-04-24 and 2026-07-13
 * already unrecoverable — only the user prompts survived. Every future audit
 * of this kind gets weaker as that window slides.
 *
 * Two modes, because raw transcripts are large (the audited corpus was 3.2GB):
 *
 *   index (default) — one compact JSON row per session: identity, span, turn
 *     counts, model mix, and blocking-event tallies. Kilobytes, not gigabytes,
 *     and it preserves everything the audit actually needed to draw its
 *     conclusions. This is the recommended durable artifact.
 *
 *   --full <dir>    — copy the raw .jsonl files. Complete but heavy; use when
 *     you need to re-read actual content, not just measure it.
 */

const fs = require('fs');
const path = require('path');
const { classify } = require('./session-audit.cjs');

/**
 * Summarize one transcript into an index row.
 *
 * @param {string} file
 * @returns {object|null}
 */
function indexTranscript(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }

  const row = {
    session: path.basename(file, '.jsonl'),
    project: path.basename(path.dirname(file)),
    first_ts: null, last_ts: null, cwd: null, version: null,
    turns: { user: 0, assistant: 0, sidechain: 0 },
    models: {},
    blocks: {},
    // stat size, NOT raw.length — string length counts characters, and the
    // incremental skip compares against fs.statSync().size. Mixing the two
    // makes every re-run look like growth and re-indexes the whole corpus.
    bytes: (() => { try { return fs.statSync(file).size; } catch { return raw.length; } })(),
  };

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }

    if (o.timestamp) {
      if (!row.first_ts || o.timestamp < row.first_ts) row.first_ts = o.timestamp;
      if (!row.last_ts || o.timestamp > row.last_ts) row.last_ts = o.timestamp;
    }
    if (o.cwd) row.cwd = o.cwd;
    if (o.version) row.version = o.version;
    if (o.type === 'user') row.turns.user += 1;
    if (o.type === 'assistant') {
      row.turns.assistant += 1;
      if (o.isSidechain) row.turns.sidechain += 1;
      const m = o.message && o.message.model;
      if (m) row.models[m] = (row.models[m] || 0) + 1;
    }

    const content = o.message && o.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (!b || b.type !== 'tool_result' || b.is_error !== true) continue;
      const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '');
      const cat = classify(text);
      row.blocks[cat] = (row.blocks[cat] || 0) + 1;
    }
  }
  return row;
}

function collect(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

/**
 * Export an index (and optionally raw copies).
 *
 * Idempotent on the index: sessions already present are skipped unless they
 * have grown, so this is safe to run on a schedule.
 *
 * @param {object} opts
 * @param {string[]} opts.roots
 * @param {string} opts.out - index file path (.jsonl)
 * @param {string} [opts.fullDir] - when set, also copy raw transcripts here
 * @param {number} [opts.limit]
 * @returns {{indexed: number, skipped: number, copied: number, out: string, sessions: number}}
 */
function exportTranscripts({ roots, out, fullDir, limit }) {
  let files = [];
  for (const r of roots) collect(r, files);
  if (limit && files.length > limit) files = files.slice(0, limit);

  // Load existing index so re-runs are incremental.
  const seen = new Map();
  try {
    for (const line of fs.readFileSync(out, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); seen.set(r.session, r.bytes || 0); } catch { /* skip */ }
    }
  } catch { /* first run */ }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fullDir) fs.mkdirSync(fullDir, { recursive: true });

  let indexed = 0, skipped = 0, copied = 0;
  const rows = [];

  for (const file of files) {
    const session = path.basename(file, '.jsonl');
    let size = 0;
    try { size = fs.statSync(file).size; } catch { continue; }
    if (seen.has(session) && seen.get(session) >= size) { skipped += 1; continue; }

    const row = indexTranscript(file);
    if (!row) continue;
    rows.push(row);
    indexed += 1;

    if (fullDir) {
      try {
        fs.copyFileSync(file, path.join(fullDir, `${row.project}__${session}.jsonl`));
        copied += 1;
      } catch { /* best effort */ }
    }
  }

  if (rows.length) {
    fs.appendFileSync(out, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  }

  return { indexed, skipped, copied, out, sessions: files.length };
}

module.exports = { exportTranscripts, indexTranscript, collect };

'use strict';

/**
 * context-audit.cjs — TRD 29-04
 *
 * Recomputes context composition from Claude Code session transcripts, so the
 * numbers behind objective 29 can be re-measured instead of re-derived by hand.
 *
 * The audit that motivated this objective ran from a throwaway script; without
 * a durable tool the next person re-invents it and, more importantly, re-invents
 * its bugs.
 *
 * TOKEN ACCOUNTING — the trap that matters:
 *   Text is estimated at ~4 chars/token. Image blocks are NOT: their cost is a
 *   function of dimensions (~1.5K tokens for a typical screenshot), while their
 *   base64 payload runs ~150KB. Counting chars/4 on base64 over-states images by
 *   roughly 25x. A first pass did exactly that and reported screenshots as 19%
 *   of context; the true figure is 1.5%. Images are therefore priced per block.
 *
 * Everything here is pure apart from the explicit fs reads, so the aggregation
 * is unit-testable without fixtures on disk.
 */

const fs = require('fs');
const path = require('path');

/** Rough chars-per-token for text. */
const CHARS_PER_TOKEN = 4;
/** Per-image token estimate — dimension-driven, NOT base64 length. */
const TOKENS_PER_IMAGE = 1500;

/**
 * Token cost of one tool_result's content.
 *
 * @param {*} content - string, or an array of blocks
 * @returns {{text: number, image: number}}
 */
function tokensOfResult(content) {
  if (typeof content === 'string') {
    return { text: content.length / CHARS_PER_TOKEN, image: 0 };
  }
  if (!Array.isArray(content)) {
    return { text: JSON.stringify(content || '').length / CHARS_PER_TOKEN, image: 0 };
  }
  let text = 0;
  let image = 0;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'image') image += TOKENS_PER_IMAGE;
    else if (block.type === 'text') text += String(block.text || '').length / CHARS_PER_TOKEN;
    else text += JSON.stringify(block).length / CHARS_PER_TOKEN;
  }
  return { text, image };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * Fold one parsed transcript record into the accumulator.
 * Exported so the aggregation can be tested without touching disk.
 *
 * @param {object} acc - accumulator from newAccumulator()
 * @param {object} row - one parsed JSONL record
 */
function accumulate(acc, row) {
  if (!row || typeof row !== 'object') return;

  // Per-turn context size comes from the reported usage fields, which are exact.
  if (row.type === 'assistant' && row.message && row.message.usage) {
    const u = row.message.usage;
    const ctx = (u.input_tokens || 0) +
                (u.cache_read_input_tokens || 0) +
                (u.cache_creation_input_tokens || 0);
    if (ctx > 0) (row.isSidechain ? acc.ctxSide : acc.ctxMain).push(ctx);
    acc.model[row.message.model || 'unknown'] =
      (acc.model[row.message.model || 'unknown'] || 0) + 1;
  }

  const content = row.message && row.message.content;
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;

    if (block.type === 'tool_use') {
      acc.toolNameById[block.id] = block.name;
      acc.inputs += JSON.stringify(block.input || '').length / CHARS_PER_TOKEN;
    } else if (block.type === 'text' && block.text) {
      acc.assistantText += block.text.length / CHARS_PER_TOKEN;
    } else if (block.type === 'tool_result') {
      const { text, image } = tokensOfResult(block.content);
      acc.results += text;
      acc.images += image;
      const tool = acc.toolNameById[block.tool_use_id] || '(unknown)';
      const e = acc.byTool[tool] || (acc.byTool[tool] = { calls: 0, tokens: 0, max: 0 });
      e.calls += 1;
      e.tokens += text + image;
      if (text + image > e.max) e.max = text + image;
      acc.resultSizes.push(text + image);
    }
  }
}

function newAccumulator() {
  return {
    results: 0, inputs: 0, assistantText: 0, images: 0,
    byTool: {}, toolNameById: {}, resultSizes: [],
    ctxSide: [], ctxMain: [], model: {}, files: 0,
  };
}

/**
 * Turn an accumulator into the reported shape.
 *
 * @param {object} acc
 * @returns {object}
 */
function summarize(acc) {
  const total = acc.results + acc.inputs + acc.assistantText + acc.images;
  const pct = n => (total ? +((100 * n) / total).toFixed(1) : 0);
  const resultTotal = acc.results + acc.images;

  const tools = Object.entries(acc.byTool)
    .map(([tool, e]) => ({
      tool,
      calls: e.calls,
      tokens: Math.round(e.tokens),
      share_pct: resultTotal ? +((100 * e.tokens) / resultTotal).toFixed(1) : 0,
      avg_per_call: e.calls ? Math.round(e.tokens / e.calls) : 0,
      max: Math.round(e.max),
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const sizes = acc.resultSizes.slice().sort((a, b) => a - b);
  const side = acc.ctxSide.slice().sort((a, b) => a - b);
  const main = acc.ctxMain.slice().sort((a, b) => a - b);
  const ctxStats = arr => ({
    turns: arr.length,
    p50: Math.round(percentile(arr, 0.5)),
    p90: Math.round(percentile(arr, 0.9)),
    p99: Math.round(percentile(arr, 0.99)),
    max: arr.length ? Math.round(arr[arr.length - 1]) : 0,
    over_200k_pct: arr.length
      ? +((100 * arr.filter(v => v > 200000).length) / arr.length).toFixed(1)
      : 0,
  });

  const readShare = (tools.find(t => t.tool === 'Read') || {}).share_pct || 0;

  return {
    files_scanned: acc.files,
    total_tokens: Math.round(total),
    composition: {
      tool_results_pct: pct(acc.results),
      tool_inputs_pct: pct(acc.inputs),
      assistant_text_pct: pct(acc.assistantText),
      images_pct: pct(acc.images),
    },
    by_tool: tools.slice(0, 12),
    result_size_tokens: {
      p50: Math.round(percentile(sizes, 0.5)),
      p90: Math.round(percentile(sizes, 0.9)),
      p99: Math.round(percentile(sizes, 0.99)),
      max: sizes.length ? Math.round(sizes[sizes.length - 1]) : 0,
    },
    context_per_turn: { subagent: ctxStats(side), main_thread: ctxStats(main) },
    targets: {
      read_share_pct: readShare,
      read_share_target: 40,
      read_share_ok: readShare < 40,
    },
    note: 'Images priced per block (~1500 tok), NOT by base64 length — chars/4 over-states them ~25x.',
  };
}

/**
 * Walk a directory collecting .jsonl transcripts.
 */
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
 * Analyze transcripts under one or more roots.
 *
 * @param {string[]} roots
 * @param {{limit?: number}} [opts] - cap files scanned (newest-first is not
 *   guaranteed; the cap exists so an ad-hoc run cannot take minutes)
 * @returns {object} summary
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
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      accumulate(acc, row);
    }
    // tool_use ids are per-transcript; clearing avoids cross-file collisions
    acc.toolNameById = {};
  }
  return summarize(acc);
}

module.exports = {
  analyze,
  accumulate,
  summarize,
  newAccumulator,
  tokensOfResult,
  collectTranscripts,
  CHARS_PER_TOKEN,
  TOKENS_PER_IMAGE,
};

#!/usr/bin/env node

/**
 * DevFlow Handoff Result Routing (UserPromptSubmit)
 *
 * When the devflow-watch daemon completes a queued command, it writes a
 * record to .devflow-handoff/done/<id>.json. On the user's next prompt,
 * this hook injects any unconsumed completions into Claude's context as
 * additionalContext, so Claude can resume the deferred work without the
 * user pasting `! cmd`.
 *
 * Closes the loop for Approach B (watcher daemon) — without this hook,
 * watcher results would sit in done/ unread.
 *
 * Behaviour:
 *   - Walk up from cwd looking for .devflow-handoff/done/ (mirrors
 *     route-intent.js's findPlanningDir pattern)
 *   - Skip records older than DEVFLOW_HANDOFF_RESULT_TTL_MS (default 1h)
 *   - Skip records already marked consumed
 *   - Render unconsumed records as compact markdown additionalContext
 *   - Mark each emitted record consumed:true so they don't re-inject
 *   - Special-case rejected/timeout/error statuses with phrasing that
 *     tells Claude NOT to retry the rejected/timed-out command
 *
 * Truncation: each record's stdout+stderr capped at MAX_OUTPUT_CHARS
 * to bound additionalContext size.
 *
 * Skipped entirely when:
 *   - No .devflow-handoff/done/ directory in cwd or any parent
 *   - All records consumed or stale
 *   - DEVFLOW_SKIP_HANDOFF_RESULTS=1 (escape hatch)
 *
 * Defensive: never throws, never blocks the user prompt. Malformed JSON
 * in done/ is silently skipped.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HANDOFF_DIR = '.devflow-handoff';
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_OUTPUT_CHARS = 4000;

function findHandoffDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, HANDOFF_DIR))) return path.join(dir, HANDOFF_DIR);
    dir = path.dirname(dir);
  }
  return null;
}

function ttlMs() {
  const env = parseInt(process.env.DEVFLOW_HANDOFF_RESULT_TTL_MS, 10);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TTL_MS;
}

function listDoneFiles(doneDir) {
  if (!fs.existsSync(doneDir)) return [];
  try {
    return fs.readdirSync(doneDir)
      .filter(name => name.endsWith('.json'))
      .map(name => path.join(doneDir, name));
  } catch {
    return [];
  }
}

function readRecord(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function isStale(record, now, ttl) {
  if (!record.completed_at) return false; // can't tell — keep it
  const t = new Date(record.completed_at).getTime();
  if (Number.isNaN(t)) return false;
  return (now - t) > ttl;
}

function selectUnconsumed(doneDir) {
  const now = Date.now();
  const ttl = ttlMs();
  const records = [];
  for (const filePath of listDoneFiles(doneDir)) {
    const rec = readRecord(filePath);
    if (!rec) continue;
    if (rec.consumed === true) continue;
    if (isStale(rec, now, ttl)) continue;
    rec._path = filePath;
    records.push(rec);
  }
  records.sort((a, b) => (a.completed_at || '').localeCompare(b.completed_at || ''));
  return records;
}

function truncate(s, max) {
  if (typeof s !== 'string') return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (truncated, ${s.length - max} more chars)`;
}

function renderRecord(rec) {
  const lines = [];
  let header;
  if (rec.status === 'rejected') {
    header = `### ${rec.id} — \`${rec.cmd}\` — ✗ rejected by daemon`;
  } else if (rec.status === 'timeout') {
    header = `### ${rec.id} — \`${rec.cmd}\` — ✗ timeout`;
  } else if (rec.status === 'error') {
    header = `### ${rec.id} — \`${rec.cmd}\` — ✗ daemon error`;
  } else if (rec.exit_code === 0) {
    header = `### ${rec.id} — \`${rec.cmd}\` — ✓ exit 0`;
  } else {
    header = `### ${rec.id} — \`${rec.cmd}\` — ✗ exit ${rec.exit_code != null ? rec.exit_code : '?'}`;
  }
  lines.push(header);
  if (rec.completed_at) lines.push(`*completed ${rec.completed_at}*`);

  if (rec.status === 'rejected') {
    lines.push('');
    lines.push('**The daemon refused this command.** Do NOT retry it as-is — its allowlist excluded it. ' +
      'If the user genuinely needs this run, ask them to run it manually or extend the allowlist.');
    if (rec.stderr) {
      lines.push('');
      lines.push('```');
      lines.push(truncate(rec.stderr, MAX_OUTPUT_CHARS));
      lines.push('```');
    }
    return lines.join('\n');
  }

  if (rec.status === 'timeout') {
    lines.push('');
    lines.push('**Command exceeded the daemon timeout.** Consider whether to retry, increase ' +
      `\`timeout_ms\` on the next handoff, or surface the slow operation to the user.`);
    return lines.join('\n');
  }

  // Normal output rendering for done/failed/error
  const stdout = truncate(rec.stdout || '', MAX_OUTPUT_CHARS);
  const stderr = truncate(rec.stderr || '', MAX_OUTPUT_CHARS);
  if (stdout) {
    lines.push('');
    lines.push('stdout:');
    lines.push('```');
    lines.push(stdout);
    lines.push('```');
  }
  if (stderr) {
    lines.push('');
    lines.push('stderr:');
    lines.push('```');
    lines.push(stderr);
    lines.push('```');
  }
  if (!stdout && !stderr) {
    lines.push('');
    lines.push('*(no output captured)*');
  }
  return lines.join('\n');
}

function renderResults(records) {
  const lines = [
    '## Deferred command results',
    '',
    `${records.length} command${records.length === 1 ? '' : 's'} the watcher ran out-of-band ` +
      'since your last turn. Use these to continue any work that was deferred.',
    '',
  ];
  for (const r of records) {
    lines.push(renderRecord(r));
    lines.push('');
  }
  return lines.join('\n');
}

function markConsumed(records) {
  const now = new Date().toISOString();
  for (const rec of records) {
    rec.consumed = true;
    rec.consumed_at = now;
    const tmp = rec._path + '.tmp';
    try {
      const out = { ...rec };
      delete out._path;
      fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
      fs.renameSync(tmp, rec._path);
    } catch {
      // non-fatal — record will inject again next turn
    }
  }
}

function emit(additionalContext) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(output));
}

function main() {
  if (process.env.DEVFLOW_SKIP_HANDOFF_RESULTS === '1') return;

  const handoffDir = findHandoffDir(process.cwd());
  if (!handoffDir) return;
  const doneDir = path.join(handoffDir, 'done');

  const unconsumed = selectUnconsumed(doneDir);
  if (unconsumed.length === 0) return;

  emit(renderResults(unconsumed));
  markConsumed(unconsumed);
}

if (require.main === module) {
  main();
}

module.exports = {
  findHandoffDir,
  selectUnconsumed,
  renderRecord,
  renderResults,
  markConsumed,
  truncate,
  isStale,
  DEFAULT_TTL_MS,
  MAX_OUTPUT_CHARS,
};

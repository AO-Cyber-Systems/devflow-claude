#!/usr/bin/env node

/**
 * DevFlow Handoff Result Injection (UserPromptSubmit)
 *
 * **DRAFT — landing as part of v1.1 "DevFlow Coordination Layer" milestone.**
 * Not registered in hooks.json yet; activated when the seamless-handoff
 * watcher daemon ships (see feature/seamless-handoff successor branch).
 *
 * When the seamless-handoff watcher daemon completes a queued command, it
 * writes a record to .devflow-handoff/done/<id>.json. On the user's next
 * prompt, this hook injects any unconsumed completions into Claude's
 * context so Claude can resume the deferred work without the user pasting
 * `! cmd` and without manually re-issuing the command.
 *
 * This is the "Claude continues executing" return path. The hook makes
 * watcher results auto-flow into the conversation.
 *
 * Behavior:
 *   - Scan .devflow-handoff/done/*.json
 *   - Filter to records without `consumed: true`
 *   - Render as compact markdown additionalContext
 *   - Mark each record consumed by writing `consumed: true` + `consumed_at`
 *
 * Skipped when:
 *   - No .devflow-handoff/done/ directory (no watcher activity)
 *   - All records already consumed
 *   - DEVFLOW_SKIP_HANDOFF_INJECT=1 (escape hatch)
 *
 * Defensive: if the done/ directory has malformed records, skip them and
 * continue. Never block the user's prompt.
 *
 * Output shape (when results are pending injection):
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "UserPromptSubmit",
 *       "additionalContext": "## Deferred command results\n\n... markdown ..."
 *     }
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HANDOFF_DIR = '.devflow-handoff';
const MAX_OUTPUT_CHARS_PER_RECORD = 4000;

function findHandoffDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, HANDOFF_DIR))) return path.join(dir, HANDOFF_DIR);
    dir = path.dirname(dir);
  }
  return null;
}

function listUnconsumed(doneDir) {
  if (!fs.existsSync(doneDir)) return [];
  let entries;
  try { entries = fs.readdirSync(doneDir); } catch { return []; }

  const records = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const filePath = path.join(doneDir, entry);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue; // skip malformed
    }
    if (record && record.consumed !== true) {
      records.push({ filePath, record });
    }
  }
  // Chronological order by completed_at (or created_at fallback)
  records.sort((a, b) => {
    const at = a.record.completed_at || a.record.created_at || '';
    const bt = b.record.completed_at || b.record.created_at || '';
    return at.localeCompare(bt);
  });
  return records;
}

function truncate(s, max) {
  if (typeof s !== 'string') return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (truncated, ${s.length - max} more chars)`;
}

function renderResults(records) {
  const lines = [
    '## Deferred command results',
    '',
    `${records.length} command${records.length === 1 ? '' : 's'} the watcher ran out-of-band ` +
      `since your last turn. Use these to continue any work that was deferred.`,
    '',
  ];

  for (const { record } of records) {
    const exit = (record.exit_code === 0)
      ? '✓ exit 0'
      : `✗ exit ${record.exit_code != null ? record.exit_code : '?'}`;
    lines.push(`### ${record.id} — \`${record.cmd}\` — ${exit}`);
    if (record.completed_at) lines.push(`*completed ${record.completed_at}*`);
    lines.push('');
    if (record.output) {
      lines.push('```');
      lines.push(truncate(record.output, MAX_OUTPUT_CHARS_PER_RECORD));
      lines.push('```');
    } else {
      lines.push('*(no output captured)*');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function markConsumed(records) {
  const now = new Date().toISOString();
  for (const { filePath, record } of records) {
    record.consumed = true;
    record.consumed_at = now;
    try {
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2) + '\n');
    } catch {
      // Permissions or race — non-fatal; record will inject again next turn
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
  if (process.env.DEVFLOW_SKIP_HANDOFF_INJECT === '1') return;

  const handoffDir = findHandoffDir(process.cwd());
  if (!handoffDir) return;

  const doneDir = path.join(handoffDir, 'done');
  const unconsumed = listUnconsumed(doneDir);
  if (unconsumed.length === 0) return;

  emit(renderResults(unconsumed));
  markConsumed(unconsumed);
}

if (require.main === module) {
  main();
}

module.exports = {
  findHandoffDir,
  listUnconsumed,
  renderResults,
  markConsumed,
  truncate,
};

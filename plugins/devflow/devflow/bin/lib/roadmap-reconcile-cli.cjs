'use strict';

/**
 * CLI subcommand router for `df-tools sync-roadmap`.
 *
 * TRD 09-03: cmdSyncRoadmapRoute with --dry-run, --interactive flags.
 *
 * Modes:
 *   (default) write mode — walks ROADMAP and applies drift corrections atomically
 *   --dry-run            — emits structured changes JSON without writing ROADMAP.md
 *   --interactive        — prompts y/N per drift via TTY readline; non-TTY falls back
 *                          to write mode with warning
 *
 * Anti-pattern: NEVER put interactive prompting logic in reconcile(). That's a CLI-layer
 * concern. The engine stays pure: reconcile() does dry-run → caller prompts → caller
 * applies accepted changes.
 */

const path = require('path');
const fs = require('fs');
const reconcile = require('./roadmap-reconcile.cjs');
const { output } = require('./helpers.cjs');

// ─── Flag parser ──────────────────────────────────────────────────────────────

/**
 * Parse argv flags. Supports boolean flags (--dry-run, --interactive, --raw).
 *
 * @param {string[]} args - argv after command name
 * @returns {{ flags: Record<string,boolean>, positional: string[] }}
 */
function _parseFlags(args) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--dry-run' || a === '--interactive' || a === '--raw') {
      flags[a.slice(2)] = true;
      i++;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
      i++;
    } else {
      positional.push(a);
      i++;
    }
  }
  return { flags, positional };
}

// ─── Human-readable renderer ──────────────────────────────────────────────────

/**
 * Render a concise human-readable summary for the CLI output.
 *
 * @param {{ changes: Array, warnings: Array }} result
 * @returns {string}
 */
function _renderSummary(result) {
  const lines = [];
  if (result.changes.length === 0 && result.warnings.length === 0) {
    lines.push('No drift detected. ROADMAP matches disk truth.');
    return lines.join('\n');
  }
  if (result.changes.length > 0) {
    lines.push(`Drift corrected: ${result.changes.length} change(s)`);
    for (const c of result.changes) {
      lines.push(`  [${c.kind}] obj=${c.objective_num || ''} trd=${c.trd_id || ''}`);
      if (c.before && c.after) {
        lines.push(`    - ${c.before.trim()}`);
        lines.push(`    + ${c.after.trim()}`);
      }
    }
  }
  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.length}`);
    for (const w of result.warnings) {
      lines.push(`  [${w.kind}] ${w.message || JSON.stringify(w)}`);
    }
  }
  return lines.join('\n');
}

// ─── Synchronous readline helper ─────────────────────────────────────────────

/**
 * Read one line from stdin fd 0 synchronously using fs.readSync.
 * Only call when process.stdin.isTTY is true.
 *
 * @returns {string} trimmed line
 */
function _readlineSync() {
  const buf = Buffer.alloc(256);
  let out = '';
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n = fs.readSync(0, buf, 0, 1);
      if (n === 0) break;
      const ch = buf[0];
      if (ch === 0x0a) break; // newline
      out += String.fromCharCode(ch);
    }
  } catch {
    // stdin closed or not readable — return empty
  }
  return out.trim();
}

// ─── Apply accepted changes helper ───────────────────────────────────────────

/**
 * Apply only the accepted changes to ROADMAP.md atomically.
 * Re-reads the current ROADMAP content, applies each accepted change by
 * line_index (using change.after), then writes via _writeReconciledRoadmap.
 *
 * @param {string} cwd - project root
 * @param {Array} accepted - subset of changes from dry-run result that user accepted
 */
function _applyAcceptedChanges(cwd, accepted) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const lines = content.split('\n');

  for (const change of accepted) {
    if (typeof change.line_index === 'number') {
      lines[change.line_index] = change.after;
    }
  }

  reconcile._writeReconciledRoadmap(cwd, lines.join('\n'));
}

// ─── Interactive mode runner ──────────────────────────────────────────────────

/**
 * Interactive mode: dry-run first to collect changes, prompt y/N per change,
 * then apply only accepted ones.
 *
 * NEVER call this when process.stdin.isTTY is false.
 *
 * @param {string} cwd - project root
 * @param {boolean} raw - raw output flag
 */
function _runInteractive(cwd, raw) {
  // Step 1: dry-run to collect all changes
  const dryResult = reconcile.reconcile({ projectRoot: cwd, mode: 'dry-run' });

  if (dryResult.changes.length === 0) {
    output(
      { mode: 'interactive', changes: [], warnings: dryResult.warnings, changes_count: 0, warnings_count: dryResult.warnings.length },
      raw,
      'No drift detected.',
    );
    return;
  }

  // Step 2: prompt per change
  const accepted = [];
  for (const change of dryResult.changes) {
    process.stderr.write(`\n[${change.kind}] obj=${change.objective_num || ''} trd=${change.trd_id || ''}\n`);
    if (change.before && change.after) {
      process.stderr.write(`  - ${change.before.trim()}\n`);
      process.stderr.write(`  + ${change.after.trim()}\n`);
    }
    process.stderr.write('Apply? [y/N] ');
    const answer = _readlineSync();
    if (/^[yY]/.test(answer)) accepted.push(change);
  }

  // Step 3: apply accepted changes (if any)
  if (accepted.length === 0) {
    output(
      { mode: 'interactive', changes: [], warnings: dryResult.warnings, changes_count: 0, warnings_count: dryResult.warnings.length },
      raw,
      'No changes accepted.',
    );
    return;
  }

  _applyAcceptedChanges(cwd, accepted);
  output(
    { mode: 'interactive', changes: accepted, warnings: dryResult.warnings, changes_count: accepted.length, warnings_count: dryResult.warnings.length },
    raw,
    `Applied ${accepted.length} change(s).`,
  );
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Route sync-roadmap subcommand.
 *
 * @param {string} cwd - project root (process.cwd() in production)
 * @param {string[]} args - argv after 'sync-roadmap'
 * @param {boolean} raw - --raw flag from df-tools.cjs parser
 */
function cmdSyncRoadmapRoute(cwd, args, raw) {
  const { flags } = _parseFlags(args);

  let mode = 'write';
  if (flags['dry-run']) mode = 'dry-run';
  else if (flags['interactive']) mode = 'interactive';

  // Interactive mode: handle TTY check at CLI layer
  if (mode === 'interactive') {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        JSON.stringify({ warning: 'non-TTY environment; falling back to write mode' }) + '\n',
      );
      mode = 'write';
    } else {
      return _runInteractive(cwd, raw);
    }
  }

  // Standard write or dry-run
  const result = reconcile.reconcile({ projectRoot: cwd, mode });
  output(
    {
      mode,
      changes: result.changes,
      warnings: result.warnings,
      changes_count: result.changes.length,
      warnings_count: result.warnings.length,
    },
    raw,
    _renderSummary(result),
  );
}

module.exports = {
  cmdSyncRoadmapRoute,
  _parseFlags,
  _renderSummary,
  _applyAcceptedChanges,
};

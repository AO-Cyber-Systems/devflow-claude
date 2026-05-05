'use strict';

/**
 * CLI subcommand router for `df-tools check-todos`.
 *
 * TRD 06-04: Full flag wiring with Markdown-default output.
 *   --all      bypass per-lane truncation
 *   --refresh  force re-fetch all sources
 *   --lane <n> filter to one lane (validated against LANE_NAMES)
 *   --raw      emit JSON aggregate instead of Markdown
 */

const ct = require('./check-todos.cjs');
const { output, error } = require('./helpers.cjs');

function _parseFlags(args) {
  const flags = {};
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--all' || a === '--refresh' || a === '--raw') {
      flags[a.slice(2)] = true;
      i++;
    } else if (a === '--lane') {
      flags['lane'] = args[i + 1] || null;
      i += 2;
    } else if (a.startsWith('--')) {
      // Unknown flag — record for diagnostics but don't error (forward-compat with future flags)
      flags[a.slice(2)] = true;
      i++;
    } else {
      i++; // positional silently ignored
    }
  }
  return flags;
}

function cmdCheckTodosRoute(cwd, args, raw) {
  const flags = _parseFlags(args);

  if (flags['lane'] && !ct.LANE_NAMES.includes(flags['lane'])) {
    error(`Unknown lane: ${flags['lane']}. Valid: ${ct.LANE_NAMES.join(', ')}`);
  }

  // raw flag from main() arg-strip OR --raw flag from local parse (defensive)
  const isRaw = !!raw || !!flags['raw'];

  const aggregateResult = ct.aggregate({
    projectRoot: cwd,
    refresh: !!flags['refresh'],
  });

  if (isRaw) {
    output(aggregateResult, true, JSON.stringify(aggregateResult, null, 2));
    return;
  }

  // Markdown render path
  const markdown = ct.formatCheckTodosMarkdown(aggregateResult, {
    all: !!flags['all'],
    lane: flags['lane'] || null,
  });

  // Use raw=true with the markdown string so output() writes it verbatim to stdout
  output(markdown, true, markdown);
}

module.exports = { cmdCheckTodosRoute, _parseFlags };

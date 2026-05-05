'use strict';

/**
 * CLI subcommand router for `df-tools check-todos`.
 *
 * TRD 06-01: scaffold with raw-JSON-only output; --lane validation.
 *            Full flag wiring + markdown renderer deferred to TRD 06-04.
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
      flags[a.slice(2)] = true;
      i++;
    } else {
      i++; // positional ignored
    }
  }
  return flags;
}

function cmdCheckTodosRoute(cwd, args, raw) {
  // TRD 06-01 scaffold: aggregate-and-emit-raw only. Full flag wiring + render in TRD 06-04.
  const flags = _parseFlags(args);
  if (flags['lane'] && !ct.LANE_NAMES.includes(flags['lane'])) {
    error(`Unknown lane: ${flags['lane']}. Valid: ${ct.LANE_NAMES.join(', ')}`);
  }
  const result = ct.aggregate({ projectRoot: cwd, refresh: !!flags['refresh'] });
  // TRD 06-01: always raw JSON until 06-04 adds the markdown renderer + flag wiring.
  output(result, true, JSON.stringify(result));
}

module.exports = { cmdCheckTodosRoute, _parseFlags };

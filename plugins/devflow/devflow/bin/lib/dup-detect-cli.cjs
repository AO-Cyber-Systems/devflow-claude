'use strict';

/**
 * CLI subcommand router for `df-tools dup-detect <subcommand>`.
 *
 * Wired into df-tools.cjs via `case 'dup-detect':` arm.
 *
 * TRD 04-01 ships: --mode plan/execute detection (wired to detectDuplicates).
 * Stubs for resolve / log subcommands (filled by TRD 04-02).
 *
 * CLI surface (locked per CONTEXT.md):
 *   df-tools dup-detect --mode plan <objective_id> [--raw]
 *   df-tools dup-detect --mode execute <objective_id> [--raw]
 *   df-tools dup-detect resolve <objective_id> --resolution <...> --peer-branch <...> --peer-objective <...>
 *   df-tools dup-detect log <objective_id> --mode <plan|execute> [--blocking <bool>] ...
 */

const { detectDuplicates } = require('./dup-detect.cjs');
const { output } = require('./helpers.cjs');

// ─── Arg parsing helpers ──────────────────────────────────────────────────────

/**
 * Parse args array into flags and positional args.
 * Handles: --flag value, --flag=value, --bool-flag.
 */
function _parseArgs(args) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
        i++;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[arg.slice(2)] = args[i + 1];
        i += 2;
      } else {
        flags[arg.slice(2)] = true;
        i++;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }
  return { flags, positional };
}

// ─── cmdDupDetectDetect ───────────────────────────────────────────────────────

/**
 * Handle `df-tools dup-detect --mode plan|execute <objective_id> [--raw]`.
 *
 * Routes to detectDuplicates() and emits structured JSON result.
 */
function cmdDupDetectDetect(cwd, args, raw) {
  const { flags, positional } = _parseArgs(args);
  const mode = flags['mode'];
  const objective_id = positional[0];

  if (!mode || !['plan', 'execute'].includes(mode)) {
    process.stderr.write(
      'Usage: df-tools dup-detect --mode <plan|execute> <objective_id> [--raw]\n'
    );
    process.exit(1);
    return;
  }
  if (!objective_id) {
    process.stderr.write(
      'Usage: df-tools dup-detect --mode <plan|execute> <objective_id> [--raw]\n'
    );
    process.exit(1);
    return;
  }

  // Construct minimal objective context from objective_id
  const objective = {
    id: objective_id,
    title: objective_id,
    github_issue: null,
    files_modified: [],
  };

  const result = detectDuplicates({ objective, mode, cwd });
  output(result, raw);
}

// ─── Stub: cmdDupDetectResolve (TRD 04-02) ───────────────────────────────────

function cmdDupDetectResolve(cwd, args, raw) {
  process.stderr.write(
    '[dup-detect] resolve subcommand not yet implemented (TRD 04-02).\n'
  );
  process.exit(1);
}

// ─── Stub: cmdDupDetectLog (TRD 04-02) ───────────────────────────────────────

function cmdDupDetectLog(cwd, args, raw) {
  process.stderr.write(
    '[dup-detect] log subcommand not yet implemented (TRD 04-02).\n'
  );
  process.exit(1);
}

// ─── cmdDupDetectRoute ────────────────────────────────────────────────────────

/**
 * Main router for `df-tools dup-detect <subcommand> [args]`.
 *
 * Handles both:
 *   - Subcommand-first style:  `dup-detect resolve <id> ...`
 *   - Flag-first style:       `dup-detect --mode plan <id> ...`
 */
function cmdDupDetectRoute(cwd, args, raw) {
  const sub = args[0];

  // No args or explicit help flags
  if (!sub || sub === '--help' || sub === '-h') {
    process.stderr.write([
      'Usage: df-tools dup-detect <subcommand|--mode> [args]',
      '',
      'Detection:',
      '  --mode plan <objective_id> [--raw]     Run plan-time detection (hard+strong+weak signals)',
      '  --mode execute <objective_id> [--raw]  Run execute-time detection (hard+strong only)',
      '',
      'Resolution (TRD 04-02):',
      '  resolve <objective_id> --resolution <merge|defer|coordinate|proceed-anyway>',
      '                         --peer-branch <name> --peer-objective <id>',
      '',
      'Logging (TRD 04-02):',
      '  log <objective_id> --mode <plan|execute> [--blocking <true|false>]',
      '                     [--top-match-json <json>] [--resolution <resolution>]',
      '',
    ].join('\n'));
    process.exit(sub ? 0 : 1);
    return;
  }

  // Flag-first style: `dup-detect --mode plan <id>`
  if (sub === '--mode') {
    return cmdDupDetectDetect(cwd, args, raw);
  }

  // Subcommand-first style
  const rest = args.slice(1);

  if (sub === 'resolve') return cmdDupDetectResolve(cwd, rest, raw);
  if (sub === 'log') return cmdDupDetectLog(cwd, rest, raw);

  process.stderr.write(
    `Unknown dup-detect subcommand: ${sub}\nRun df-tools dup-detect --help for usage.\n`
  );
  process.exit(1);
}

module.exports = {
  cmdDupDetectRoute,
  cmdDupDetectDetect,
  cmdDupDetectResolve,
  cmdDupDetectLog,
};

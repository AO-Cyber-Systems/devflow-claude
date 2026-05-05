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

const dd = require('./dup-detect.cjs');
const { detectDuplicates } = dd;
const { output } = require('./helpers.cjs');
const path = require('path');
const fs = require('fs');

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

// ─── cmdDupDetectResolve (TRD 04-02) ─────────────────────────────────────────

function _parseResolveArgs(args) {
  const out = {
    objective_id: null, resolution: null, peer_branch: null,
    peer_objective: null, cwd: null, errors: [],
  };
  const a = args.slice();
  while (a.length > 0) {
    const t = a.shift();
    if (t === '--resolution') out.resolution = a.shift() || null;
    else if (t === '--peer-branch') out.peer_branch = a.shift() || null;
    else if (t === '--peer-objective') out.peer_objective = a.shift() || null;
    else if (t === '--cwd') out.cwd = a.shift() || null;
    else if (t.startsWith('--')) out.errors.push(`Unknown flag: ${t}`);
    else if (out.objective_id === null) out.objective_id = t;
  }
  if (!out.objective_id) out.errors.push('objective_id is required');
  const valid = ['merge', 'defer', 'coordinate', 'proceed-anyway'];
  if (!out.resolution || !valid.includes(out.resolution)) {
    out.errors.push(`--resolution must be one of: ${valid.join(', ')} (got: ${String(out.resolution)})`);
  }
  return out;
}

function cmdDupDetectResolve(cwd_outer, args, raw) {
  const parsed = _parseResolveArgs(args);
  if (parsed.errors.length > 0) {
    process.stderr.write(parsed.errors.map(e => 'Error: ' + e).join('\n') + '\n');
    process.exit(1);
    return;
  }
  const cwd = parsed.cwd || cwd_outer;

  // Resolve objective_dir + padded_objective from objective_id
  const objsDir = path.join(cwd, '.planning', 'objectives');
  let objective_dir = path.join(objsDir, parsed.objective_id); // fallback
  let padded_objective = parsed.objective_id;
  if (fs.existsSync(objsDir)) {
    try {
      const objs = fs.readdirSync(objsDir);
      const matchingDir = objs.find(n => n.startsWith(`${parsed.objective_id}-`) || n === parsed.objective_id);
      if (matchingDir) {
        objective_dir = path.join(objsDir, matchingDir);
        const m = matchingDir.match(/^(\d+)-/);
        if (m) padded_objective = m[1];
      }
    } catch { /* swallow — fallback path used */ }
  }

  // Build minimal detection object for the dispatcher
  const detection = {
    mode: 'plan',
    timestamp: new Date().toISOString(),
    matches: [{
      strength: 'unknown',
      source: 'peer',
      peer_branch: parsed.peer_branch,
      peer_objective: parsed.peer_objective,
      signal: '(provided via CLI; signal omitted)',
      score: null,
    }],
  };

  const result = dd.applyResolution({
    resolution: parsed.resolution,
    objective_id: parsed.objective_id,
    peer_branch: parsed.peer_branch,
    peer_objective: parsed.peer_objective,
    cwd,
    detection,
    objective_dir,
    padded_objective,
  });

  // Always record to JSONL log
  dd.recordResolution({
    objective_id: parsed.objective_id,
    mode: 'plan',
    blocking: true,
    top_match: { strength: 'unknown', peer: parsed.peer_branch, score: null },
    resolution: parsed.resolution,
    cwd,
  });

  output({ ok: true, resolution: parsed.resolution, ...result }, raw);
}

// ─── cmdDupDetectLog (TRD 04-02) ─────────────────────────────────────────────

function _parseLogArgs(args) {
  const out = {
    objective_id: null, mode: null, blocking: null,
    top_match: null, resolution: 'none', cwd: null, errors: [],
  };
  const a = args.slice();
  while (a.length > 0) {
    const t = a.shift();
    if (t === '--mode') out.mode = a.shift() || null;
    else if (t === '--blocking') {
      const v = a.shift();
      if (v === 'true') out.blocking = true;
      else if (v === 'false') out.blocking = false;
      else out.errors.push(`--blocking must be 'true' or 'false' (got: ${v})`);
    } else if (t === '--top-match-json') {
      const v = a.shift();
      try { out.top_match = JSON.parse(v); } catch (e) { out.errors.push(`--top-match-json parse error: ${e.message}`); }
    } else if (t === '--resolution') out.resolution = a.shift() || 'none';
    else if (t === '--cwd') out.cwd = a.shift() || null;
    else if (t.startsWith('--')) out.errors.push(`Unknown flag: ${t}`);
    else if (out.objective_id === null) out.objective_id = t;
  }
  if (!out.objective_id) out.errors.push('objective_id is required');
  if (out.mode !== 'plan' && out.mode !== 'execute') {
    out.errors.push(`--mode must be 'plan' or 'execute' (got: ${String(out.mode)})`);
  }
  const validRes = ['merge', 'defer', 'coordinate', 'proceed-anyway', 'none'];
  if (!validRes.includes(out.resolution)) {
    out.errors.push(`--resolution must be one of: ${validRes.join(', ')} (got: ${out.resolution})`);
  }
  return out;
}

function cmdDupDetectLog(cwd_outer, args, raw) {
  const parsed = _parseLogArgs(args);
  if (parsed.errors.length > 0) {
    process.stderr.write(parsed.errors.map(e => 'Error: ' + e).join('\n') + '\n');
    process.exit(1);
    return;
  }
  const cwd = parsed.cwd || cwd_outer;
  dd.recordResolution({
    objective_id: parsed.objective_id,
    mode: parsed.mode,
    blocking: parsed.blocking !== null ? parsed.blocking : false,
    top_match: parsed.top_match,
    resolution: parsed.resolution,
    cwd,
  });
  output({ ok: true, logged: true }, raw);
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

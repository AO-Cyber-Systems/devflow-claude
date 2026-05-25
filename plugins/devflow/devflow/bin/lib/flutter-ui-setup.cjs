'use strict';

/**
 * flutter-ui-setup.cjs — `df-tools flutter-ui setup` subcommand
 *
 * One-command adoption path for downstream Flutter projects:
 *   1. Detect missing system tools (jq, gh, chromedriver).
 *   2. Build a platform-aware install plan (darwin → brew, linux → apt).
 *   3. Dispatch installs via the devflow-watch handoff (when daemon is live)
 *      OR print copy-pasteable shell commands (when daemon is down — exit 1).
 *   4. Chain into flutter-ui-bootstrap.cjs to scaffold pubspec/dirs/marker.
 *   5. Idempotent — re-runs on a set-up project return status:'already-set-up'.
 *
 * Pure-logic CLI wrapper. Hand-built fixtures drive every test (TDD Playbook habit 4).
 *
 * Module exports:
 *   detectMissingTools, buildInstallPlan, dispatchInstalls, cmdFlutterUISetup
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ───── detectMissingTools ────────────────────────────────────────────────────

const DEFAULT_REQUIRED_TOOLS = ['jq', 'gh', 'chromedriver'];

/**
 * Pure function: given a PATH dir and a list of required tools, return the
 * names of those that are NOT present in the dir (preserving input order).
 *
 * Tests pass a single dir for determinism; production callers can pass the
 * effective PATH (colon-joined) — see TODO note below if/when we extend.
 *
 * @param {object} opts
 * @param {string} opts.pathDir         — directory to probe (e.g. a $PATH entry)
 * @param {string[]} [opts.requiredTools]
 * @returns {string[]}                  — missing tool names, input-ordered
 */
function detectMissingTools(opts) {
  const o = opts || {};
  const dir = o.pathDir;
  const required = Array.isArray(o.requiredTools) ? o.requiredTools : DEFAULT_REQUIRED_TOOLS;
  if (!dir) return [...required]; // no PATH dir → nothing detectable, everything missing
  const missing = [];
  for (const tool of required) {
    const candidate = path.join(dir, tool);
    if (!fs.existsSync(candidate)) missing.push(tool);
  }
  return missing;
}

// ───── buildInstallPlan ──────────────────────────────────────────────────────

/**
 * Pure function: given a list of missing tools and a platform, return an
 * ordered list of install commands (input order preserved).
 *
 * Platform routing:
 *   darwin → 'brew install <tool>' (chromedriver gets the --cask flag — see gotchas)
 *   linux  → 'sudo apt-get install -y <tool>'
 *   other  → '# manual install required: <tool>' (advisory; no platform support)
 *
 * @param {object} opts
 * @param {string[]} opts.missing       — tool names (e.g. from detectMissingTools)
 * @param {string} opts.platform        — typically process.platform
 * @returns {string[]}                  — install commands, input-ordered
 */
function buildInstallPlan(opts) {
  const o = opts || {};
  const missing = Array.isArray(o.missing) ? o.missing : [];
  const platform = o.platform;
  if (missing.length === 0) return [];
  return missing.map((tool) => formatInstallCommand(tool, platform));
}

function formatInstallCommand(tool, platform) {
  if (platform === 'darwin') {
    // chromedriver is a cask on Homebrew, not a formula.
    if (tool === 'chromedriver') return 'brew install --cask chromedriver';
    return `brew install ${tool}`;
  }
  if (platform === 'linux') {
    return `sudo apt-get install -y ${tool}`;
  }
  // Unsupported platform — emit advisory comment so the human knows to install manually.
  return `# manual install required: ${tool}`;
}

// ───── dispatchInstalls ──────────────────────────────────────────────────────

/**
 * Write a pending handoff record for each command in the plan. The daemon
 * (devflow-watch) consumes these records via filesystem watch and executes the
 * shell commands in the user's interactive PTY session.
 *
 * Record shape matches handoff.cjs::validateInputsSchema expectations (the
 * `inputs` field is omitted entirely — installs don't need token-passing, so the
 * empty-secrets case is the canonical no-op for schema validation).
 *
 * @param {string[]} plan       — install commands (each a shell string)
 * @param {object} opts
 * @param {string} opts.pendingDir — absolute path to .devflow-handoff/pending/
 * @param {string} opts.cwd       — cwd the daemon should execute commands in
 * @returns {{ dispatched: number, ids: string[] }}
 */
function dispatchInstalls(plan, opts) {
  const o = opts || {};
  const pendingDir = o.pendingDir;
  const cwd = o.cwd;
  if (!Array.isArray(plan)) throw new TypeError('dispatchInstalls: plan must be an array');
  if (!pendingDir) throw new TypeError('dispatchInstalls: opts.pendingDir required');
  if (!cwd) throw new TypeError('dispatchInstalls: opts.cwd required');

  const ids = [];
  for (const cmd of plan) {
    const id = newHandoffId();
    const record = {
      id,
      cmd,
      cwd,
      status: 'pending',
      created_at: new Date().toISOString(),
      // No `inputs` — these installs don't need token-passing. handoff.validateInputsSchema
      // treats the absent/empty-secrets case as ok:true (see handoff.cjs lines 31-36).
    };
    const filePath = path.join(pendingDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2) + '\n');
    ids.push(id);
  }
  return { dispatched: plan.length, ids };
}

function newHandoffId() {
  return 'h-' + crypto.randomBytes(4).toString('hex');
}

// ───── cmdFlutterUISetup (CLI entry point) ───────────────────────────────────

/**
 * CLI entry point. Wired from df-tools.cjs `case 'flutter-ui':` arm.
 *
 * Behaviour:
 *   - parse flags (--print-only, --auto, --raw)
 *   - detect missing tools across PATH → build platform-aware install plan
 *   - daemon live → dispatchInstalls (writes handoff pending records)
 *   - daemon down (or --print-only) → print commands to stdout AND exit 1
 *     (signals human action required, except when nothing is missing)
 *   - chain into flutter-ui-bootstrap.checkBootstrapState after install verify
 *   - idempotency short-circuit: all tools present + marker + bootstrap-ready
 *     → exit 0 with status:'already-set-up' and zero handoff records written
 *
 * @param {string} cwd   — process working directory (target project)
 * @param {string[]} args — args[2..] from the top-level dispatcher
 * @param {boolean} raw  — true when --raw was passed at the top level
 */
function cmdFlutterUISetup(cwd, args, raw) {
  const flags = parseFlags(args || []);
  const platform = process.platform;

  // Detect tools across the WHOLE PATH (not just one dir), so production users
  // who already have brew-installed binaries on a non-test PATH don't get false
  // positives. A tool is "missing" only when absent from every PATH entry.
  const required = ['jq', 'gh', 'chromedriver'];
  const stillMissing = detectMissingAcrossPath(required);
  const plan = buildInstallPlan({ missing: stillMissing, platform });

  // ── Daemon detection (lazy require so this module loads cleanly in unit tests
  //    that never touch the daemon path).
  const watcherState = require('./watcher-state.cjs');
  const pidInfo = watcherState.readPidFile();
  const daemonLive = pidInfo && watcherState.isWatcherLive();
  if (pidInfo && !daemonLive) {
    // Stale PID file — advisory + treat as not-running.
    process.stderr.write(`[advisory] stale devflow-watch PID file at ${watcherState.pidFilePath()}; treating as not-running\n`);
  }

  // ── Print-only OR daemon-down path: print commands + exit nonzero (1) when
  //    there is anything to install; exit 0 with status:'ok' otherwise.
  if (flags.print_only || !daemonLive) {
    if (raw) {
      emit({ status: daemonLive ? 'print-only' : 'no-daemon', platform, missing: stillMissing, plan, flags }, raw);
    } else {
      // Human-friendly: one command per line. Empty plan → friendly note.
      if (plan.length === 0) {
        process.stdout.write('# all required tools already installed\n');
      } else {
        for (const cmd of plan) process.stdout.write(cmd + '\n');
      }
    }
    process.exit(plan.length === 0 ? 0 : 1);
  }

  // ── Daemon-live path: dispatch via handoff records.
  const pendingDir = path.join(cwd, '.devflow-handoff', 'pending');
  fs.mkdirSync(pendingDir, { recursive: true });
  const dispatch = dispatchInstalls(plan, { pendingDir, cwd });

  emit({ status: 'dispatched', platform, missing: stillMissing, plan, flags, dispatch }, raw);
  process.exit(0);
}

/**
 * Probe every entry of $PATH for each tool; return tool names absent from ALL
 * entries (i.e. truly missing). Preserves input order.
 */
function detectMissingAcrossPath(required) {
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const missing = [];
  for (const tool of required) {
    let found = false;
    for (const dir of pathEntries) {
      try {
        if (fs.existsSync(path.join(dir, tool))) { found = true; break; }
      } catch { /* permission/etc — treat as miss */ }
    }
    if (!found) missing.push(tool);
  }
  return missing;
}

function parseFlags(args) {
  return {
    print_only: args.includes('--print-only'),
    auto: args.includes('--auto'),
    raw: args.includes('--raw'),
  };
}

function emit(payload, raw) {
  if (raw) {
    process.stdout.write(JSON.stringify(payload));
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }
}

module.exports = {
  detectMissingTools,
  buildInstallPlan,
  dispatchInstalls,
  cmdFlutterUISetup,
};

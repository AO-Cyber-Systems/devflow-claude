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

// ───── cmdFlutterUISetup (CLI entry point — stub for now) ────────────────────

/**
 * CLI entry point. Wired from df-tools.cjs `case 'flutter-ui':` arm.
 *
 * Behaviour (filled in case-by-case in Task 3):
 *   - parse flags from `args` (--print-only, --auto, --raw)
 *   - detect missing tools → build install plan
 *   - daemon live → dispatchInstalls; daemon down → print + exit 1
 *   - chain into flutter-ui-bootstrap.checkBootstrapState
 *   - idempotency short-circuit when all tools present + marker + bootstrap-ready
 *
 * @param {string} cwd   — process working directory (target project)
 * @param {string[]} args — args[2..] from the top-level dispatcher
 * @param {boolean} raw  — true when --raw was passed at the top level
 */
function cmdFlutterUISetup(cwd, args, raw) {
  // Stub: emits a JSON object containing the install plan derived from the
  // current PATH + platform. Task 3 layers daemon/bootstrap/idempotency on top.
  const flags = parseFlags(args || []);
  const platform = process.platform;

  // Probe PATH entries for the required tools. We compute a per-entry missing
  // list, then intersect — a tool is "missing" only if absent from every PATH dir.
  const required = ['jq', 'gh', 'chromedriver'];
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const stillMissing = required.filter((tool) => {
    for (const dir of pathEntries) {
      try {
        if (fs.existsSync(path.join(dir, tool))) return false;
      } catch { /* permission/etc — treat as miss */ }
    }
    return true;
  });

  const plan = buildInstallPlan({ missing: stillMissing, platform });

  const payload = {
    status: 'preview',
    platform,
    missing: stillMissing,
    plan,
    flags,
  };

  emit(payload, raw);
  process.exit(0);
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
  cmdFlutterUISetup,
};

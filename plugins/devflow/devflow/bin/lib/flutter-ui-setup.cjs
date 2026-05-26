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

// Tools required to run Flutter UI verification end-to-end:
//   jq           — executor parses JSON output from df-tools commands
//   chromedriver — web tier: `flutter drive` against Chrome for integration_test/
//   maestro      — mobile tier: `maestro test .maestro/*.yaml` for end-to-end mobile flows
// gh (GitHub CLI) is intentionally NOT here — it belongs to separate devflow features
// (gh-sync, awareness, dup-detect) which check for it themselves when needed.
const DEFAULT_REQUIRED_TOOLS = ['jq', 'maestro', 'chromedriver'];

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
  // maestro distributes via a platform-agnostic curl installer — no brew formula or apt package.
  // Same command on darwin and linux. See https://maestro.mobile.dev/getting-started/installing-maestro
  if (tool === 'maestro') return 'curl -fsSL "https://get.maestro.mobile.dev" | bash';
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

  // ── Gate: refuse to operate outside a Flutter UI repo. DevFlow should NOT
  //    install Flutter tooling (chromedriver/maestro/jq) into an unrelated dir.
  //    Each consuming Flutter UI repo (eden-ui-flutter, etc.) is responsible for
  //    its own tooling install path — devflow's job is to detect + scaffold +
  //    dispatch when the repo is verifiably a Flutter UI repo.
  const repoCheck = detectFlutterRepo({ cwd });
  if (!repoCheck.isFlutterRepo) {
    emit({
      status: 'not-a-flutter-project',
      platform,
      cwd,
      checks: repoCheck.checks,
      failures: repoCheck.failures,
      flags,
    }, raw);
    process.exit(1);
  }

  // Detect tools across the WHOLE PATH (not just one dir), so production users
  // who already have brew-installed binaries on a non-test PATH don't get false
  // positives. A tool is "missing" only when absent from every PATH entry.
  // Keep this list in sync with DEFAULT_REQUIRED_TOOLS above.
  const required = DEFAULT_REQUIRED_TOOLS;
  const stillMissing = detectMissingAcrossPath(required);
  const plan = buildInstallPlan({ missing: stillMissing, platform });

  // ── Idempotency short-circuit (must run BEFORE any handoff dispatch):
  //    all tools present AND .planning/.flutter-ui-bootstrap-done marker present
  //    AND bootstrap detector reports action:'skip' → exit 0 with status:'already-set-up'.
  //    Note: --print-only intentionally bypasses this short-circuit so the user
  //    can always preview the plan (which will be empty in this case).
  if (!flags.print_only && stillMissing.length === 0) {
    const markerPath = path.join(cwd, '.planning', '.flutter-ui-bootstrap-done');
    if (fs.existsSync(markerPath)) {
      const { checkBootstrapState: peek } = require('./flutter-ui-bootstrap.cjs');
      const peeked = peek({ projectDir: cwd });
      if (peeked.action === 'skip') {
        emit({
          status: 'already-set-up',
          platform,
          missing: [],
          plan: [],
          flags,
          bootstrap: peeked,
        }, raw);
        process.exit(0);
      }
    }
  }

  // ── Daemon detection (lazy require so this module loads cleanly in unit tests
  //    that never touch the daemon path).
  const watcherState = require('./watcher-state.cjs');
  const pidInfo = watcherState.readPidFile();
  const daemonLive = pidInfo && watcherState.isWatcherLive();
  if (pidInfo && !daemonLive) {
    // Stale PID file — advisory + treat as not-running.
    process.stderr.write(`[advisory] stale devflow-watch PID file at ${watcherState.pidFilePath()}; treating as not-running\n`);
  }

  // ── Print-only path: print plan + exit. NEVER side-effects (no dispatch, no
  //    bootstrap chain). Plan-empty → exit 0; plan-non-empty → exit 1 (signals
  //    human action required).
  if (flags.print_only) {
    if (raw) {
      emit({ status: 'print-only', platform, missing: stillMissing, plan, flags }, raw);
    } else {
      if (plan.length === 0) {
        process.stdout.write('# all required tools already installed\n');
      } else {
        for (const cmd of plan) process.stdout.write(cmd + '\n');
      }
    }
    process.exit(plan.length === 0 ? 0 : 1);
  }

  // ── No daemon + something to install: can't proceed via handoff. Print
  //    commands to stdout + exit 1 (signals caller that human action required).
  //    Bootstrap chain skipped here because installs are unmet prerequisites —
  //    no point scaffolding a project that doesn't yet have the tools to verify it.
  if (!daemonLive && plan.length > 0) {
    if (raw) {
      emit({ status: 'no-daemon', platform, missing: stillMissing, plan, flags }, raw);
    } else {
      for (const cmd of plan) process.stdout.write(cmd + '\n');
    }
    process.exit(1);
  }

  // ── Daemon-live path: dispatch via handoff records (only if plan non-empty).
  //    When daemon is down and plan is empty, this block is a no-op and we fall
  //    through to bootstrap — daemon is NOT required for bootstrap scaffolding.
  let dispatch = { dispatched: 0, ids: [] };
  if (daemonLive && plan.length > 0) {
    const pendingDir = path.join(cwd, '.devflow-handoff', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    dispatch = dispatchInstalls(plan, { pendingDir, cwd });
  }

  // ── Bootstrap chain runs whenever tools are present (with or without daemon)
  //    OR whenever daemon dispatched the installs. Lazy-require keeps the module
  //    out of the no-daemon-missing-tools fast path above. Forwards the bootstrap
  //    result unchanged on the same JSON output.
  const { checkBootstrapState } = require('./flutter-ui-bootstrap.cjs');
  const bootstrap = checkBootstrapState({ projectDir: cwd });

  const status = plan.length === 0 ? 'tools-ready' : 'dispatched';
  emit({ status, platform, missing: stillMissing, plan, flags, dispatch, bootstrap }, raw);
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

// ───── detectFlutterRepo ─────────────────────────────────────────────────────

// Minimum Flutter SDK version DevFlow's Flutter UI verification system targets.
// Below this, integration_test + maestro flow patterns we expect may not be stable.
// Bumped if upstream tooling requires.
const MIN_FLUTTER_VERSION = '3.16.0';
const MIN_FLUTTER_PARTS = MIN_FLUTTER_VERSION.split('.').map(Number);

// Reuses the same regex as flutter-ui-scope.cjs::PUBSPEC_FLUTTER_DEP_RE.
// Kept local here to avoid cross-module coupling on a hot-path detector.
const PUBSPEC_FLUTTER_DEP_RE = /^\s*flutter\s*:\s*\n\s+sdk\s*:\s*flutter\s*$/m;

// Matches `flutter: ">=3.16.0"` (or `'>=3.16.0'`) on an indented environment line.
// Captures the version core for numeric comparison.
const PUBSPEC_FLUTTER_VERSION_RE = /^\s+flutter\s*:\s*['"]?>=\s*(\d+)\.(\d+)\.(\d+)/m;

/**
 * Gate detector: decide whether `cwd` looks like a Flutter UI repo DevFlow
 * should operate on. Composite of 4 checks:
 *
 *   1. pubspec.yaml exists
 *   2. pubspec declares `flutter: sdk: flutter` dependency
 *   3. `lib/` directory exists
 *   4. environment.flutter version constraint is >= MIN_FLUTTER_VERSION
 *      (null when constraint absent — advisory pass, not a hard fail)
 *
 * Returns: { isFlutterRepo, checks: {pubspec, flutterDep, libDir, minVersion},
 *            failures: string[] }
 *
 * minVersion semantics:
 *   true  → constraint present AND >= MIN_FLUTTER_VERSION
 *   false → constraint present AND <  MIN_FLUTTER_VERSION (HARD fail)
 *   null  → constraint absent (advisory pass — caller may warn)
 *
 * @param {object} opts
 * @param {string} opts.cwd  — target project directory (absolute)
 */
function detectFlutterRepo(opts) {
  const o = opts || {};
  const cwd = o.cwd;
  const checks = { pubspec: false, flutterDep: false, libDir: false, minVersion: null };
  const failures = [];

  if (!cwd) {
    failures.push('detectFlutterRepo: cwd not provided');
    return { isFlutterRepo: false, checks, failures };
  }

  const pubspecPath = path.join(cwd, 'pubspec.yaml');
  if (fs.existsSync(pubspecPath)) {
    checks.pubspec = true;
  } else {
    failures.push(`no pubspec.yaml at ${pubspecPath} — not a Dart/Flutter project`);
  }

  let pubspecContent = '';
  if (checks.pubspec) {
    try {
      pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
    } catch (err) {
      failures.push(`pubspec.yaml unreadable: ${err.message}`);
    }
  }

  if (pubspecContent) {
    checks.flutterDep = PUBSPEC_FLUTTER_DEP_RE.test(pubspecContent);
    if (!checks.flutterDep) {
      failures.push("pubspec.yaml has no 'flutter: sdk: flutter' dependency — not a Flutter project");
    }

    const versionMatch = pubspecContent.match(PUBSPEC_FLUTTER_VERSION_RE);
    if (versionMatch) {
      const got = [versionMatch[1], versionMatch[2], versionMatch[3]].map(Number);
      const meetsMin = compareVersionParts(got, MIN_FLUTTER_PARTS) >= 0;
      checks.minVersion = meetsMin;
      if (!meetsMin) {
        failures.push(`Flutter version constraint ${versionMatch[0].trim()} is below required ${MIN_FLUTTER_VERSION}`);
      }
    } // else: no constraint → minVersion stays null (advisory pass)
  }

  const libPath = path.join(cwd, 'lib');
  try {
    checks.libDir = fs.existsSync(libPath) && fs.statSync(libPath).isDirectory();
  } catch { checks.libDir = false; }
  if (!checks.libDir) {
    failures.push(`no 'lib/' directory at ${libPath} — Flutter projects place source under lib/`);
  }

  // Pass = all required checks true. minVersion:null counts as pass (advisory).
  const required = checks.pubspec && checks.flutterDep && checks.libDir;
  const versionOk = checks.minVersion !== false; // true OR null → ok
  const isFlutterRepo = required && versionOk;

  return { isFlutterRepo, checks, failures };
}

function compareVersionParts(a, b) {
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
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
  detectFlutterRepo,
  cmdFlutterUISetup,
};

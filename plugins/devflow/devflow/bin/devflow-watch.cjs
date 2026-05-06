#!/usr/bin/env node
'use strict';

/**
 * devflow-watch — daemon CLI for the seamless handoff watcher.
 *
 * Subcommands:
 *   start [--project <path>] [--shell <name>] [--foreground]
 *     Start the daemon. Default detaches (background); --foreground stays
 *     in this process. Refuses to start if a live PID is already recorded.
 *     Cleans up stale PID files automatically.
 *
 *   stop
 *     Send SIGTERM to the recorded daemon. Waits up to 5s for clean exit,
 *     then removes the PID file. Idempotent: prints "not running" exit 0
 *     when no daemon is recorded.
 *
 *   status
 *     Print JSON: { running, pid, version, uptime_ms, project, shell,
 *                   pending_count, done_count, allowlist_size }
 *
 *   logs [--tail N]
 *     Print the last N lines of ~/.devflow/devflow-watch.log (default 100).
 *
 *   version
 *     Print "devflow-watch <version>".
 *
 * Exit codes:
 *   0  — success (or "not running" for stop)
 *   1  — bad args / unknown subcommand
 *   2  — already running (start) or daemon error
 *   3  — operational failure
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const state = require('./lib/watcher-state.cjs');
const allowlistLib = require('./lib/watcher-allowlist.cjs');

const VERSION = '0.1.0'; // bumped per release
const LOG_DIR_NAME = '.devflow';
const LOG_FILE_NAME = 'devflow-watch.log';
const STOP_TIMEOUT_MS = 5000;

function homeDir() { return process.env.HOME || os.homedir(); }
function logFilePath() { return path.join(homeDir(), LOG_DIR_NAME, LOG_FILE_NAME); }

function printErr(msg) { process.stderr.write(msg + '\n'); }
function printOut(msg) { process.stdout.write(msg + '\n'); }

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

function cmdStatus() {
  const info = state.readPidFile();
  const live = state.isWatcherLive();
  const watching = (info && Array.isArray(info.watching)) ? info.watching : [];
  const result = {
    running: live,
    pid: info && live ? info.pid : null,
    version: info ? info.version : null,
    started_at: info ? info.started_at : null,
    uptime_ms: info && live && info.started_at
      ? Date.now() - new Date(info.started_at).getTime()
      : null,
    // TRD 20-03: multi-project surface
    projects: watching,                              // plural — new
    project: watching[0] || null,                    // back-compat singular
    shell: info ? info.shell : null,
    pending_counts: {},                              // per-project map — new
    done_counts: {},                                 // new
  };

  // Per-project pending/done counts
  for (const p of watching) {
    try {
      const pendingDir = path.join(p, '.devflow-handoff', 'pending');
      const doneDir = path.join(p, '.devflow-handoff', 'done');
      result.pending_counts[p] = fs.existsSync(pendingDir)
        ? fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json')).length
        : 0;
      result.done_counts[p] = fs.existsSync(doneDir)
        ? fs.readdirSync(doneDir).filter((f) => f.endsWith('.json')).length
        : 0;
    } catch {
      result.pending_counts[p] = 0;
      result.done_counts[p] = 0;
    }
  }

  // Back-compat scalar sums
  result.pending_count = Object.values(result.pending_counts).reduce((a, b) => a + b, 0);
  result.done_count = Object.values(result.done_counts).reduce((a, b) => a + b, 0);

  const { allowlist } = allowlistLib.loadAllowlist();
  result.allowlist_size = allowlist.length;

  if (info && !live) result.stale_pid_file = true;
  printOut(JSON.stringify(result, null, 2));
  return 0;
}

// ---------------------------------------------------------------------------
// logs
// ---------------------------------------------------------------------------

function cmdLogs(flags) {
  const file = logFilePath();
  if (!fs.existsSync(file)) {
    printOut('(no log file yet)');
    return 0;
  }
  const tailN = parseInt(flags.tail, 10) || 100;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const slice = lines.slice(-tailN - 1);
  process.stdout.write(slice.join('\n'));
  if (!slice[slice.length - 1] || !slice[slice.length - 1].endsWith('\n')) {
    process.stdout.write('\n');
  }
  return 0;
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

async function cmdStop() {
  const info = state.readPidFile();
  if (!info || typeof info.pid !== 'number') {
    printOut('devflow-watch: not running');
    return 0;
  }
  if (!state.isWatcherLive()) {
    state.removePidFile();
    printOut('devflow-watch: stale PID file removed');
    return 0;
  }
  try { process.kill(info.pid, 'SIGTERM'); } catch (e) {
    if (e.code === 'ESRCH') {
      state.removePidFile();
      printOut('devflow-watch: process already gone');
      return 0;
    }
    printErr(`devflow-watch: stop failed: ${e.message}`);
    return 3;
  }

  // Wait up to STOP_TIMEOUT_MS for the process to exit (PID file removed).
  const start = Date.now();
  while (Date.now() - start < STOP_TIMEOUT_MS) {
    if (!state.isWatcherLive() && !state.readPidFile()) break;
    if (!state.isWatcherLive() && state.readPidFile()) {
      // Process gone but daemon didn't clean up — clean up for it
      state.removePidFile();
      break;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  if (state.isWatcherLive()) {
    printErr('devflow-watch: stop timed out — sending SIGKILL');
    try { process.kill(info.pid, 'SIGKILL'); } catch {}
    state.removePidFile();
    return 3;
  }

  printOut('devflow-watch: stopped');
  return 0;
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

function cmdStart(flags) {
  // TRD 20-02: chain --install-service flag → install + return (launchd
  // /systemd handles the actual start via the installed service file).
  if (flags['install-service']) {
    return cmdInstallService(flags);
  }

  // Refuse if already running
  if (state.isWatcherLive()) {
    const info = state.readPidFile();
    printErr(`devflow-watch: already running (pid ${info && info.pid})`);
    return 2;
  }
  // Stale PID file? Clean it up.
  if (state.readPidFile() && !state.isWatcherLive()) {
    state.removePidFile();
  }

  // TRD 20-03: parse --project as comma-list (single value still works).
  const projectArg = flags.project || process.cwd();
  const projects = String(projectArg)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));
  if (projects.length === 0) projects.push(path.resolve(process.cwd()));
  for (const p of projects) {
    if (!fs.existsSync(p)) {
      printErr(`devflow-watch: warning: project path not found: ${p} (will be polled when created)`);
    }
  }
  const shell = flags.shell || process.env.SHELL || 'bash';

  if (flags.foreground) {
    return runForeground({ projects, shell });
  }
  return startDetached({ projects, shell });
}

function startDetached({ projects, shell }) {
  // Spawn ourselves with --foreground in a detached child. Pass projects as
  // comma-list to match the input format.
  const projectArg = projects.join(',');
  const child = spawn(process.execPath, [__filename, 'start',
    '--project', projectArg,
    '--shell', shell,
    '--foreground',
  ], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  child.unref();

  // Wait briefly for the child to write its PID file.
  const start = Date.now();
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (state.isWatcherLive()) {
        clearInterval(interval);
        const info = state.readPidFile();
        printOut(`devflow-watch: started (pid ${info.pid}, projects ${projectArg})`);
        resolve(0);
        return;
      }
      if (Date.now() - start > 5000) {
        clearInterval(interval);
        printErr('devflow-watch: child failed to start within 5s');
        resolve(2);
      }
    }, 50);
  });
}

function runForeground({ projects, shell }) {
  // 20-03: primary projectRoot for logs/cwd/config-load is projects[0];
  // the daemon iterates ALL projects via watching:[] in PID file.
  const projectRoot = projects[0];
  // Lazy require so the start CLI doesn't pay the import cost when launching detached.
  const daemon = require('./lib/watcher-daemon.cjs');
  const { ShellSession } = require('./lib/watcher-shell.cjs');

  // Open log file (append mode)
  const logFile = logFilePath();
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logFd = fs.openSync(logFile, 'a');
  function log(level, msg) {
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}\n`;
    try { fs.writeSync(logFd, line); } catch {}
  }

  // Write PID file with multi-project watching: []
  state.writePidFile({
    pid: process.pid,
    version: VERSION,
    shell,
    watching: projects,
  });
  log('info', `started pid=${process.pid} projects=${projects.join(',')} shell=${shell}`);
  printOut(`devflow-watch: started (pid ${process.pid}, projects ${projects.join(',')})`);

  const { allowlist, userPatterns, degraded } = allowlistLib.loadAllowlist();
  if (degraded) log('warn', 'user allow file present but malformed; ignoring');
  log('info', `allowlist size=${allowlist.length} (${userPatterns} user-extended)`);

  const session = new ShellSession({ shell, cwd: projectRoot, interactive: true });

  let loop = null;
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log('info', `received ${signal}, shutting down`);
    if (loop) {
      try { await loop.stop(); } catch (e) { log('error', `loop.stop: ${e.message}`); }
    }
    try { await session.kill(); } catch {}
    state.removePidFile();
    log('info', 'exited cleanly');
    try { fs.closeSync(logFd); } catch {}
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // TRD 20-01: opt-in OS notifications via .planning/config.json
  //   daemon: { notifications, notify_on_start, notify_on_complete }
  // Disabled by default. Construction errors fall back to no-notifier
  // (deps.notifier=null) — daemon stays functional even if config is
  // malformed.
  let notifier = null;
  let notify_on_start = true;
  let notify_on_complete = true;
  try {
    const configPath = path.join(projectRoot, '.planning', 'config.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg && cfg.daemon && cfg.daemon.notifications === true) {
        notifier = require('./lib/notifier.cjs');
        if (cfg.daemon.notify_on_start === false) notify_on_start = false;
        if (cfg.daemon.notify_on_complete === false) notify_on_complete = false;
        log('info', `notifications enabled (start=${notify_on_start}, complete=${notify_on_complete})`);
      }
    }
  } catch (e) {
    log('warn', `notifications config load failed: ${e.message}; continuing without notifications`);
  }

  return session.spawn().then(() => {
    loop = daemon.runLoop({
      projectRoot, session, allowlist, log,
      notifier, notify_on_start, notify_on_complete,
    });
    // Keep process alive — runLoop's setInterval is the heartbeat.
    return new Promise(() => {});
  }).catch((e) => {
    log('error', `failed to spawn shell: ${e.message}`);
    state.removePidFile();
    process.exit(3);
  });
}

// ---------------------------------------------------------------------------
// install-service / uninstall-service (TRD 20-02)
// ---------------------------------------------------------------------------

async function cmdInstallService(flags) {
  const installer = require('./lib/service-installer.cjs');
  const platform = process.platform;
  if (platform !== 'darwin' && platform !== 'linux') {
    printErr(`devflow-watch: install-service unsupported platform: ${platform} (v1.2 supports darwin + linux)`);
    return 1;
  }
  const projectRoot = path.resolve(flags.project || process.cwd());
  const devflowWatchPath = path.resolve(__filename);
  try {
    const { servicePath } = await installer.installService({
      platform, projectRoot, devflowWatchPath,
    });
    printOut(`devflow-watch: service installed at ${servicePath}`);
    return 0;
  } catch (e) {
    printErr(`devflow-watch: install failed: ${e && e.message ? e.message : String(e)}`);
    return 3;
  }
}

async function cmdUninstallService() {
  const installer = require('./lib/service-installer.cjs');
  const platform = process.platform;
  if (platform !== 'darwin' && platform !== 'linux') {
    printErr(`devflow-watch: uninstall-service unsupported platform: ${platform}`);
    return 1;
  }
  try {
    const { servicePath } = await installer.uninstallService({ platform });
    printOut(`devflow-watch: service uninstalled (was at ${servicePath})`);
    return 0;
  } catch (e) {
    printErr(`devflow-watch: uninstall failed: ${e && e.message ? e.message : String(e)}`);
    return 3;
  }
}

// ---------------------------------------------------------------------------
// add-project / remove-project (TRD 20-03)
// ---------------------------------------------------------------------------

function cmdAddProject(flags) {
  const projectPath = flags._[1];
  if (!projectPath) {
    printErr('Usage: devflow-watch add-project <path>');
    return 1;
  }
  if (!state.isWatcherLive()) {
    printErr(`devflow-watch: daemon not running. Start it first: devflow-watch start --project ${projectPath}`);
    return 2;
  }
  try {
    const next = state.addWatchedProject(projectPath);
    printOut(`devflow-watch: added ${path.resolve(projectPath)} (now watching ${next.watching.length} project(s))`);
    return 0;
  } catch (e) {
    printErr(`devflow-watch: add-project failed: ${e && e.message ? e.message : String(e)}`);
    return 3;
  }
}

function cmdRemoveProject(flags) {
  const projectPath = flags._[1];
  if (!projectPath) {
    printErr('Usage: devflow-watch remove-project <path>');
    return 1;
  }
  // Idempotent: even if no PID file, treat as success.
  if (!state.readPidFile()) {
    printOut('devflow-watch: not running (no-op)');
    return 0;
  }
  try {
    const next = state.removeWatchedProject(projectPath);
    printOut(`devflow-watch: removed ${path.resolve(projectPath)} (now watching ${next.watching.length} project(s))`);
    return 0;
  } catch (e) {
    if (e && e.code === 'ENOPIDFILE') {
      printOut('devflow-watch: not running (no-op)');
      return 0;
    }
    printErr(`devflow-watch: remove-project failed: ${e && e.message ? e.message : String(e)}`);
    return 3;
  }
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

async function main(argv) {
  const flags = parseFlags(argv);
  const sub = flags._[0];

  if (sub === 'start') return cmdStart(flags);
  if (sub === 'stop') {
    const code = await cmdStop();
    if (flags['uninstall-service']) {
      // Chain: stop first, then uninstall (TRD 20-02 convenience flag).
      const u = await cmdUninstallService();
      return u !== 0 ? u : code;
    }
    return code;
  }
  if (sub === 'status') return cmdStatus();
  if (sub === 'logs') return cmdLogs(flags);
  if (sub === 'install-service') return cmdInstallService(flags);
  if (sub === 'uninstall-service') return cmdUninstallService();
  if (sub === 'add-project') return cmdAddProject(flags);
  if (sub === 'remove-project') return cmdRemoveProject(flags);
  if (sub === 'version' || flags.version === true) {
    printOut(`devflow-watch ${VERSION}`);
    return 0;
  }

  printErr('Usage: devflow-watch <start|stop|status|logs|add-project|remove-project|install-service|uninstall-service|version> [flags]');
  return 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => { if (typeof code === 'number') process.exit(code); },
    (e) => { printErr(`devflow-watch: ${e && e.message ? e.message : e}`); process.exit(3); },
  );
}

module.exports = { main, parseFlags, VERSION };

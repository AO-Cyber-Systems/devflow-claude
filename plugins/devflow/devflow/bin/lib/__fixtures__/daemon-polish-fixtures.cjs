'use strict';

/**
 * Fixture builders for objective 20 (daemon polish bundle).
 *
 * Per CLAUDE.md TDD playbook habit 4: fixture generators, NOT LLM-generated
 * test data. Hand-built factories keep tests deterministic and reviewable.
 *
 * 20-01 (notifier): buildNotifierShimEnv, buildMockExecFile, readNotifierMarkerCalls
 * 20-02 (auto-launch): buildLaunchctlShimEnv, buildSystemctlShimEnv,
 *                       buildServiceInstallerTmpHome, readShimCalls
 * 20-03 (multi-project): buildMultiProjectFixture, buildPidFileFixture
 * 20-05 (cross-shell): shellAvailable
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SHIM_DIR = __dirname; // .../bin/lib/__fixtures__/
const OSASCRIPT_SHIM = path.join(SHIM_DIR, 'osascript-shim.cjs');
const NOTIFY_SEND_SHIM = path.join(SHIM_DIR, 'notify-send-shim.cjs');
const LAUNCHCTL_SHIM = path.join(SHIM_DIR, 'launchctl-shim.cjs');
const SYSTEMCTL_SHIM = path.join(SHIM_DIR, 'systemctl-shim.cjs');

// Ensure shims have executable bits at module load. Idempotent.
function _chmodShim(p) {
  try {
    if (fs.existsSync(p)) fs.chmodSync(p, 0o755);
  } catch {
    // best-effort; tests will reveal if EACCES
  }
}
_chmodShim(OSASCRIPT_SHIM);
_chmodShim(NOTIFY_SEND_SHIM);
_chmodShim(LAUNCHCTL_SHIM);
_chmodShim(SYSTEMCTL_SHIM);

// ---------------------------------------------------------------------------
// 20-01: Notifier
// ---------------------------------------------------------------------------

/**
 * Build a notifier shim env: prepends fixture dir to PATH so osascript /
 * notify-send invocations resolve to the shim. Returns paths + cleanup.
 *
 * The shim files must already be executable; chmod is applied at module load
 * (above). The fixture also creates a sym-named symlink for `osascript` and
 * `notify-send` pointing at the .cjs shim so PATH-based exec resolves the
 * basenames properly.
 *
 * @param {string} tmpDir — directory for the marker file
 */
function buildNotifierShimEnv(tmpDir) {
  // Create a per-test bin dir with `osascript` and `notify-send` symlinks
  // (or copies on systems where symlink isn't allowed) pointing at the shim.
  const binDir = fs.mkdtempSync(path.join(tmpDir, 'shim-bin-'));
  const osascriptPath = path.join(binDir, 'osascript');
  const notifySendPath = path.join(binDir, 'notify-send');

  // Use shell-script wrappers (more portable than symlinks for Node entry).
  // `exec node <shim>` carries argv. Set executable.
  fs.writeFileSync(
    osascriptPath,
    `#!/bin/sh\nexec ${process.execPath} ${OSASCRIPT_SHIM} "$@"\n`,
  );
  fs.chmodSync(osascriptPath, 0o755);
  fs.writeFileSync(
    notifySendPath,
    `#!/bin/sh\nexec ${process.execPath} ${NOTIFY_SEND_SHIM} "$@"\n`,
  );
  fs.chmodSync(notifySendPath, 0o755);

  const markerFile = path.join(tmpDir, 'notify-marker.jsonl');
  const prevPATH = process.env.PATH;
  const prevOsascriptMarker = process.env.OSASCRIPT_SHIM_MARKER_FILE;
  const prevNotifyMarker = process.env.NOTIFY_SEND_SHIM_MARKER_FILE;

  process.env.PATH = `${binDir}:${prevPATH || ''}`;
  process.env.OSASCRIPT_SHIM_MARKER_FILE = markerFile;
  process.env.NOTIFY_SEND_SHIM_MARKER_FILE = markerFile;

  return {
    binDir,
    osascriptPath,
    notifySendPath,
    markerFile,
    cleanup() {
      if (prevPATH === undefined) delete process.env.PATH;
      else process.env.PATH = prevPATH;
      if (prevOsascriptMarker === undefined) delete process.env.OSASCRIPT_SHIM_MARKER_FILE;
      else process.env.OSASCRIPT_SHIM_MARKER_FILE = prevOsascriptMarker;
      if (prevNotifyMarker === undefined) delete process.env.NOTIFY_SEND_SHIM_MARKER_FILE;
      else process.env.NOTIFY_SEND_SHIM_MARKER_FILE = prevNotifyMarker;
      try { fs.rmSync(binDir, { recursive: true, force: true }); } catch {}
    },
  };
}

/**
 * Build an in-memory mock for _runExec. Returns {fn, calls} where fn matches
 * the realRunExec signature and calls accumulates {cmd, args, opts} entries.
 *
 * Optional opts: {throwError: Error to throw} — the mock rejects when set.
 */
function buildMockExecFile(opts = {}) {
  const calls = [];
  const fn = async (cmd, args, fnOpts) => {
    calls.push({ cmd, args, opts: fnOpts });
    if (opts.throwError) throw opts.throwError;
    if (typeof opts.respond === 'function') return opts.respond(cmd, args, fnOpts);
    return { stdout: '', stderr: '' };
  };
  return { fn, calls };
}

/**
 * Read JSONL marker file and return parsed entries.
 */
function readNotifierMarkerCalls(markerFile) {
  if (!fs.existsSync(markerFile)) return [];
  const content = fs.readFileSync(markerFile, 'utf8');
  return content.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 20-02: Auto-launch
// ---------------------------------------------------------------------------

function buildLaunchctlShimEnv(tmpDir) {
  const binDir = fs.mkdtempSync(path.join(tmpDir, 'launchctl-bin-'));
  const launchctlPath = path.join(binDir, 'launchctl');
  fs.writeFileSync(
    launchctlPath,
    `#!/bin/sh\nexec ${process.execPath} ${LAUNCHCTL_SHIM} "$@"\n`,
  );
  fs.chmodSync(launchctlPath, 0o755);

  const markerFile = path.join(tmpDir, 'launchctl-marker.jsonl');
  const prevPATH = process.env.PATH;
  const prevMarker = process.env.LAUNCHCTL_SHIM_MARKER_FILE;

  process.env.PATH = `${binDir}:${prevPATH || ''}`;
  process.env.LAUNCHCTL_SHIM_MARKER_FILE = markerFile;

  return {
    binDir,
    launchctlPath,
    markerFile,
    cleanup() {
      if (prevPATH === undefined) delete process.env.PATH;
      else process.env.PATH = prevPATH;
      if (prevMarker === undefined) delete process.env.LAUNCHCTL_SHIM_MARKER_FILE;
      else process.env.LAUNCHCTL_SHIM_MARKER_FILE = prevMarker;
      try { fs.rmSync(binDir, { recursive: true, force: true }); } catch {}
    },
  };
}

function buildSystemctlShimEnv(tmpDir) {
  const binDir = fs.mkdtempSync(path.join(tmpDir, 'systemctl-bin-'));
  const systemctlPath = path.join(binDir, 'systemctl');
  fs.writeFileSync(
    systemctlPath,
    `#!/bin/sh\nexec ${process.execPath} ${SYSTEMCTL_SHIM} "$@"\n`,
  );
  fs.chmodSync(systemctlPath, 0o755);

  const markerFile = path.join(tmpDir, 'systemctl-marker.jsonl');
  const prevPATH = process.env.PATH;
  const prevMarker = process.env.SYSTEMCTL_SHIM_MARKER_FILE;

  process.env.PATH = `${binDir}:${prevPATH || ''}`;
  process.env.SYSTEMCTL_SHIM_MARKER_FILE = markerFile;

  return {
    binDir,
    systemctlPath,
    markerFile,
    cleanup() {
      if (prevPATH === undefined) delete process.env.PATH;
      else process.env.PATH = prevPATH;
      if (prevMarker === undefined) delete process.env.SYSTEMCTL_SHIM_MARKER_FILE;
      else process.env.SYSTEMCTL_SHIM_MARKER_FILE = prevMarker;
      try { fs.rmSync(binDir, { recursive: true, force: true }); } catch {}
    },
  };
}

/**
 * Build a tmp HOME for service-installer tests. Sets HOME env var so that
 * service-installer's _userHome() resolves to the tmp dir, which means
 * ~/Library/LaunchAgents and ~/.config/systemd/user resolve there too.
 */
function buildServiceInstallerTmpHome(tmpDir) {
  const home = fs.mkdtempSync(path.join(tmpDir, 'svc-home-'));
  const launchAgentsDir = path.join(home, 'Library', 'LaunchAgents');
  const systemdUserDir = path.join(home, '.config', 'systemd', 'user');
  const prevHOME = process.env.HOME;
  process.env.HOME = home;
  return {
    home,
    launchAgentsDir,
    systemdUserDir,
    restoreHome() {
      if (prevHOME === undefined) delete process.env.HOME;
      else process.env.HOME = prevHOME;
      try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
    },
  };
}

function readShimCalls(markerFile) {
  return readNotifierMarkerCalls(markerFile);
}

// ---------------------------------------------------------------------------
// 20-03: Multi-project
// ---------------------------------------------------------------------------

/**
 * Build N project dirs with .devflow-handoff/pending populated. Returns
 * {home, projects: [...], pendingFiles: {projRoot: [recordId, ...]}, cleanup}.
 */
function buildMultiProjectFixture(tmpDir, opts = {}) {
  const projectCount = opts.projectCount || 2;
  const recordsPerProject = opts.recordsPerProject || 1;
  const home = fs.mkdtempSync(path.join(tmpDir, 'mp-home-'));
  const prevHOME = process.env.HOME;
  process.env.HOME = home;
  const projects = [];
  const pendingFiles = {};
  for (let i = 0; i < projectCount; i++) {
    const proj = fs.mkdtempSync(path.join(tmpDir, `mp-project-${i}-`));
    projects.push(proj);
    const pendDir = path.join(proj, '.devflow-handoff', 'pending');
    fs.mkdirSync(pendDir, { recursive: true });
    pendingFiles[proj] = [];
    for (let j = 0; j < recordsPerProject; j++) {
      const id = `h-mp-${i}-${j}`;
      const rec = {
        id,
        cmd: `echo project-${i}-record-${j}`,
        cwd: proj,
        created_at: new Date(Date.now() + i * 1000 + j * 100).toISOString(),
        status: 'pending',
      };
      fs.writeFileSync(path.join(pendDir, `${id}.json`), JSON.stringify(rec, null, 2));
      pendingFiles[proj].push(id);
    }
  }
  return {
    home,
    projects,
    pendingFiles,
    cleanup() {
      if (prevHOME === undefined) delete process.env.HOME;
      else process.env.HOME = prevHOME;
      try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
      for (const p of projects) {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
      }
    },
  };
}

/**
 * Write a fixture PID file at $HOME/.devflow/devflow-watch.pid. Caller must
 * have HOME pointing at a tmp dir already (e.g. via buildMultiProjectFixture
 * or buildServiceInstallerTmpHome).
 */
function buildPidFileFixture(opts = {}) {
  const home = process.env.HOME || os.homedir();
  const pidFile = path.join(home, '.devflow', 'devflow-watch.pid');
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  const payload = {
    pid: opts.pid || process.pid,
    version: opts.version || '0.1.0',
    shell: opts.shell || 'bash',
    watching: Array.isArray(opts.watching) ? opts.watching : [],
    started_at: opts.started_at || new Date().toISOString(),
  };
  fs.writeFileSync(pidFile, JSON.stringify(payload, null, 2) + '\n');
  return { pidFile, payload };
}

// ---------------------------------------------------------------------------
// 20-04: Status-line watcher segment
// ---------------------------------------------------------------------------

// __dirname is .../plugins/devflow/devflow/bin/lib/__fixtures__/
// statusline.js is at .../plugins/devflow/hooks/statusline.js
// so we go up 4 levels (__fixtures__ → lib → bin → devflow) and then
// down into hooks/.
const STATUSLINE_HOOK_PATH = path.resolve(
  __dirname, '..', '..', '..', '..', 'hooks', 'statusline.js',
);

const WATCHER_STATE_SOURCE_PATH = path.resolve(__dirname, '..', 'watcher-state.cjs');

/**
 * Build a Claude-style statusline input JSON. All fields optional with sane
 * defaults; pass overrides as needed.
 *
 * @param {object} opts
 * @param {string} [opts.workspace_dir] — data.workspace.current_dir
 * @param {string} [opts.model_name]    — data.model.display_name
 * @param {string} [opts.session_id]    — data.session_id
 * @param {number} [opts.remaining_pct] — data.context_window.remaining_percentage
 * @returns {string} JSON string suitable for stdin of statusline.js
 */
function buildStatuslineInput(opts = {}) {
  const payload = {
    model: { display_name: opts.model_name || 'Sonnet 4.5' },
    workspace: { current_dir: opts.workspace_dir || '/tmp/sl-test-project' },
    session_id: opts.session_id || 'sl-test-session',
    context_window: {
      remaining_percentage:
        opts.remaining_pct == null ? 70 : opts.remaining_pct,
    },
  };
  return JSON.stringify(payload);
}

/**
 * Build a complete env for spawning statusline.js as a subprocess. Sets up:
 * - tmpHome with optional .devflow/devflow-watch.pid (alive vs stale vs absent)
 * - tmpHome/.claude/devflow/bin/lib/watcher-state.cjs (copy from real source)
 *   so statusline.js can require it without depending on plugin sync state
 * - projectDir/.planning/config.json with the requested daemon block
 * - projectDir's per-project .devflow-handoff/pending/<id>.json fixtures
 *   matching the requested counts in pendingByProject
 *
 * Pass `daemonAlive: true` to use the test-runner's own PID (always live)
 * or `daemonAlive: false` to write a clearly-dead high-range PID (999999).
 * Pass `daemonAlive: 'absent'` to skip writing the PID file entirely.
 * Pass `installWatcherStateLib: false` to simulate devflow-not-synced edge case.
 *
 * @param {object} opts
 * @param {string} opts.tmpHome              — directory to act as $HOME
 * @param {string} opts.projectDir           — directory to act as workspace
 * @param {boolean|'absent'} [opts.daemonAlive=true]  — PID liveness shape
 * @param {string[]} [opts.watching=[]]      — project paths in PID watching: []
 * @param {object} [opts.pendingByProject={}] — { [projRoot]: count }
 * @param {object|null} [opts.configContent=null] — full config.json content
 *   (when null, no config file is written)
 * @param {boolean} [opts.installWatcherStateLib=true] — copy watcher-state.cjs
 *   into tmpHome/.claude/devflow/bin/lib/
 * @param {boolean} [opts.malformedConfig=false] — write garbage instead of JSON
 * @param {boolean} [opts.malformedPidFile=false] — write garbage instead of JSON
 * @returns {object} {home, projectDir, env, cleanup}
 */
function buildStatuslineEnv(opts = {}) {
  const {
    tmpHome,
    projectDir,
    daemonAlive = true,
    watching = [],
    pendingByProject = {},
    configContent = null,
    installWatcherStateLib = true,
    malformedConfig = false,
    malformedPidFile = false,
  } = opts;

  if (!tmpHome) throw new Error('buildStatuslineEnv: tmpHome required');
  if (!projectDir) throw new Error('buildStatuslineEnv: projectDir required');

  // Ensure base dirs exist.
  fs.mkdirSync(tmpHome, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  // 1. Install watcher-state.cjs at synced runtime path (mirrors plugin sync).
  if (installWatcherStateLib) {
    const libDir = path.join(tmpHome, '.claude', 'devflow', 'bin', 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    fs.copyFileSync(
      WATCHER_STATE_SOURCE_PATH,
      path.join(libDir, 'watcher-state.cjs'),
    );
  }

  // 2. Write PID file (alive / dead / absent).
  if (daemonAlive !== 'absent') {
    const pidFile = path.join(tmpHome, '.devflow', 'devflow-watch.pid');
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    if (malformedPidFile) {
      fs.writeFileSync(pidFile, '{not valid json');
    } else {
      const pid = daemonAlive === true ? process.pid : 999999;
      const payload = {
        pid,
        version: '0.1.0',
        shell: 'bash',
        watching,
        started_at: new Date().toISOString(),
      };
      fs.writeFileSync(pidFile, JSON.stringify(payload, null, 2) + '\n');
    }
  }

  // 3. Write project-local .planning/config.json.
  if (configContent !== null) {
    const planningDir = path.join(projectDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    const configPath = path.join(planningDir, 'config.json');
    if (malformedConfig) {
      fs.writeFileSync(configPath, '{not valid json');
    } else {
      fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
    }
  }

  // 4. Populate per-project pending dirs with fixture records.
  for (const [projRoot, count] of Object.entries(pendingByProject)) {
    if (count === 'EACCES_MARKER') {
      // Special sentinel: create dir but make it unreadable for F-2 test.
      // We can't reliably chmod 0 on macOS+root contexts; use a non-dir
      // file at the expected dir path instead — readdirSync throws ENOTDIR
      // which is also an exception statusline must swallow.
      fs.mkdirSync(path.join(projRoot, '.devflow-handoff'), { recursive: true });
      fs.writeFileSync(
        path.join(projRoot, '.devflow-handoff', 'pending'),
        'not-a-directory',
      );
      continue;
    }
    if (count === 'MISSING') continue; // intentionally don't create dir
    const pendDir = path.join(projRoot, '.devflow-handoff', 'pending');
    fs.mkdirSync(pendDir, { recursive: true });
    for (let i = 0; i < count; i++) {
      const id = `sl-pend-${path.basename(projRoot)}-${i}`;
      const rec = {
        id,
        cmd: `echo pending-${i}`,
        cwd: projRoot,
        created_at: new Date(Date.now() + i).toISOString(),
        status: 'pending',
      };
      fs.writeFileSync(path.join(pendDir, `${id}.json`), JSON.stringify(rec, null, 2));
    }
  }

  // 5. Build subprocess env (override HOME so statusline reads from tmpHome).
  const env = {
    ...process.env,
    HOME: tmpHome,
    // Drop DEVFLOW_HANDOFF_PID_FILE override so watcher-state uses HOME-based
    // path resolution (tests sometimes run with this env var set).
  };
  delete env.DEVFLOW_HANDOFF_PID_FILE;

  return {
    home: tmpHome,
    projectDir,
    env,
    cleanup() {
      // Caller is expected to rmSync the parent tmp dir; this is a no-op
      // placeholder for symmetry with other fixture builders.
    },
  };
}

/**
 * Run statusline.js as a subprocess with the given JSON stdin and env.
 * Returns { stdout, stderr, status, signal }.
 *
 * @param {object} opts
 * @param {string} opts.input — JSON string to pipe to stdin
 * @param {object} opts.env   — env vars (must include HOME override)
 * @param {string} [opts.cwd] — subprocess cwd (default: tmpdir)
 */
function runStatuslineSubprocess(opts = {}) {
  const { input, env, cwd = os.tmpdir() } = opts;
  if (!fs.existsSync(STATUSLINE_HOOK_PATH)) {
    throw new Error(`statusline.js not found at ${STATUSLINE_HOOK_PATH}`);
  }
  const result = spawnSync(process.execPath, [STATUSLINE_HOOK_PATH], {
    input,
    encoding: 'utf8',
    env,
    cwd,
    timeout: 5000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    signal: result.signal,
  };
}

/**
 * Strip ANSI escape codes from a string. Used for assertion convenience —
 * tests assert against visible substrings (e.g. `⏸ 3 pending`) rather than
 * against full ANSI sequences.
 */
function stripAnsi(s) {
  if (typeof s !== 'string') return '';
  // Matches CSI + SGR sequences — the only ANSI we emit in statusline.
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ---------------------------------------------------------------------------
// 20-05: Cross-shell
// ---------------------------------------------------------------------------

/**
 * Probe whether a shell binary is on PATH and runnable. Mirrors obj 19
 * TRD 19-01's node-pty availability gating pattern. Tests use this to skip
 * end-to-end fish/pwsh tests cleanly when the binary isn't installed.
 *
 * @param {string} name — shell binary name (e.g. 'fish', 'pwsh')
 * @param {Array<string>} probeArgs — args that should produce __DFW_PROBE__
 *   on stdout (default: -c 'echo __DFW_PROBE__')
 */
function shellAvailable(name, probeArgs = ['-c', 'echo __DFW_PROBE__']) {
  try {
    const r = spawnSync(name, probeArgs, { encoding: 'utf8', timeout: 3000 });
    return r.status === 0 && r.stdout && r.stdout.includes('__DFW_PROBE__');
  } catch {
    return false;
  }
}

module.exports = {
  // 20-01
  buildNotifierShimEnv,
  buildMockExecFile,
  readNotifierMarkerCalls,
  // 20-02
  buildLaunchctlShimEnv,
  buildSystemctlShimEnv,
  buildServiceInstallerTmpHome,
  readShimCalls,
  // 20-03
  buildMultiProjectFixture,
  buildPidFileFixture,
  // 20-04
  buildStatuslineInput,
  buildStatuslineEnv,
  runStatuslineSubprocess,
  stripAnsi,
  STATUSLINE_HOOK_PATH,
  // 20-05
  shellAvailable,
};

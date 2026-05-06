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
  // 20-05
  shellAvailable,
};

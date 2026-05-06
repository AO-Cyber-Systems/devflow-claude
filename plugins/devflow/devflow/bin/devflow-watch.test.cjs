'use strict';

/**
 * Integration tests for devflow-watch CLI.
 *
 * Each test sandboxes HOME so PID files / logs land in a temp dir.
 * Tests are limited to ~6 (status, logs, stop idempotency, start/stop
 * foreground, stale-PID-cleanup) per the TRD note. Loop-level coverage
 * lives in watcher-daemon.test.cjs.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

const CLI = path.join(__dirname, 'devflow-watch.cjs');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-cli-'));
}

function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

function runCli(args, env = {}, opts = {}) {
  try {
    const out = execFileSync('node', [CLI, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
      ...opts,
    });
    return { ok: true, stdout: out, stderr: '', code: 0 };
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || e.message,
      code: e.status,
    };
  }
}

async function spawnForegroundDaemon(home, projectRoot) {
  const child = spawn('node', [CLI, 'start', '--project', projectRoot, '--foreground', '--shell', 'bash'], {
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for PID file to record THIS child's pid (not a stale pid that was
  // already in the file when we started).
  const pidFile = path.join(home, '.devflow', 'devflow-watch.pid');
  const start = Date.now();
  while (Date.now() - start < 3000) {
    try {
      if (fs.existsSync(pidFile)) {
        const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
        if (info && info.pid === child.pid) break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 25));
  }
  return { child, pidFile };
}

// ---------------------------------------------------------------------------
// status — fast, no daemon spawn
// ---------------------------------------------------------------------------

describe('devflow-watch status', () => {
  let home;
  beforeEach(() => { home = mkTmp(); });
  afterEach(() => rmTmp(home));

  test('reports running:false when no PID file exists', () => {
    const r = runCli(['status'], { HOME: home });
    assert.ok(r.ok, `failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.running, false);
    assert.equal(out.pid, null);
    assert.ok(typeof out.allowlist_size === 'number' && out.allowlist_size > 0);
  });

  test('reports running:false + stale_pid_file when PID file points to dead pid', () => {
    const pidDir = path.join(home, '.devflow');
    fs.mkdirSync(pidDir, { recursive: true });
    fs.writeFileSync(
      path.join(pidDir, 'devflow-watch.pid'),
      JSON.stringify({ pid: 999999, version: '0.0.0', watching: [], started_at: new Date().toISOString() }),
    );
    const r = runCli(['status'], { HOME: home });
    assert.ok(r.ok);
    const out = JSON.parse(r.stdout);
    assert.equal(out.running, false);
    assert.equal(out.stale_pid_file, true);
  });
});

// ---------------------------------------------------------------------------
// stop — idempotency
// ---------------------------------------------------------------------------

describe('devflow-watch stop', () => {
  let home;
  beforeEach(() => { home = mkTmp(); });
  afterEach(() => rmTmp(home));

  test('idempotent: prints "not running" exit 0 when no daemon', () => {
    const r = runCli(['stop'], { HOME: home });
    assert.ok(r.ok, `failed: ${r.stderr}`);
    assert.match(r.stdout, /not running/);
  });

  test('cleans up stale PID file', () => {
    const pidDir = path.join(home, '.devflow');
    fs.mkdirSync(pidDir, { recursive: true });
    fs.writeFileSync(
      path.join(pidDir, 'devflow-watch.pid'),
      JSON.stringify({ pid: 999999, version: '0.0.0', watching: [], started_at: new Date().toISOString() }),
    );
    const r = runCli(['stop'], { HOME: home });
    assert.ok(r.ok);
    assert.match(r.stdout, /stale/);
    assert.ok(!fs.existsSync(path.join(pidDir, 'devflow-watch.pid')));
  });
});

// ---------------------------------------------------------------------------
// start — foreground lifecycle (slow: spawns real daemon)
// ---------------------------------------------------------------------------

describe('devflow-watch start (foreground) + stop', () => {
  let home, project;
  beforeEach(() => {
    home = mkTmp();
    project = mkTmp();
    fs.mkdirSync(path.join(project, '.devflow-handoff', 'pending'), { recursive: true });
  });
  afterEach(() => { rmTmp(home); rmTmp(project); });

  test('foreground daemon writes PID file, status reports running, stop kills it', async () => {
    const { child, pidFile } = await spawnForegroundDaemon(home, project);
    try {
      assert.ok(fs.existsSync(pidFile), 'PID file should be created');
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      assert.equal(info.pid, child.pid);
      assert.equal(info.shell, 'bash');
      assert.deepEqual(info.watching, [project]);

      // status reports running
      const status = runCli(['status'], { HOME: home });
      const out = JSON.parse(status.stdout);
      assert.equal(out.running, true);
      assert.equal(out.pid, child.pid);

      // stop ends it cleanly
      const stop = runCli(['stop'], { HOME: home });
      assert.ok(stop.ok, `stop failed: ${stop.stderr}`);
      assert.match(stop.stdout, /stopped/);
      assert.ok(!fs.existsSync(pidFile), 'PID file should be removed by daemon shutdown');

      // child should exit shortly after SIGTERM
      const exited = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), 3000);
        child.on('exit', () => { clearTimeout(t); resolve(true); });
      });
      assert.ok(exited, 'daemon should exit after SIGTERM');
    } finally {
      try { child.kill('SIGKILL'); } catch {}
    }
  });

  test('start refuses when daemon already running', async () => {
    const { child } = await spawnForegroundDaemon(home, project);
    try {
      const r = runCli(['start', '--project', project, '--foreground'], { HOME: home });
      assert.equal(r.ok, false);
      assert.match(r.stderr, /already running/);
      assert.equal(r.code, 2);
    } finally {
      try { child.kill('SIGTERM'); } catch {}
      // brief wait for cleanup
      await new Promise(r => setTimeout(r, 200));
    }
  });

  test('start cleans up stale PID file and starts fresh', async () => {
    // Pre-write a stale PID file pointing at a dead pid
    const pidDir = path.join(home, '.devflow');
    fs.mkdirSync(pidDir, { recursive: true });
    fs.writeFileSync(
      path.join(pidDir, 'devflow-watch.pid'),
      JSON.stringify({ pid: 999999, version: '0.0.0', watching: [], started_at: new Date().toISOString() }),
    );

    const { child, pidFile } = await spawnForegroundDaemon(home, project);
    try {
      assert.ok(fs.existsSync(pidFile));
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      assert.equal(info.pid, child.pid, 'new daemon should overwrite stale pid');
    } finally {
      try { child.kill('SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
  });
});

// ---------------------------------------------------------------------------
// logs
// ---------------------------------------------------------------------------

describe('devflow-watch logs', () => {
  let home;
  beforeEach(() => { home = mkTmp(); });
  afterEach(() => rmTmp(home));

  test('reports "no log file yet" when nothing has run', () => {
    const r = runCli(['logs'], { HOME: home });
    assert.ok(r.ok);
    assert.match(r.stdout, /no log file/);
  });

  test('--tail N returns the last N lines', () => {
    const logDir = path.join(home, '.devflow');
    fs.mkdirSync(logDir, { recursive: true });
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`).join('\n');
    fs.writeFileSync(path.join(logDir, 'devflow-watch.log'), lines + '\n');
    const r = runCli(['logs', '--tail', '5'], { HOME: home });
    assert.ok(r.ok);
    const out = r.stdout.split('\n').filter(Boolean);
    assert.equal(out.length, 5);
    assert.equal(out[0], 'line-16');
    assert.equal(out[4], 'line-20');
  });
});

// ===========================================================================
// TRD 20-02 Group C — install-service / uninstall-service CLI subcommands
// ===========================================================================

const fxBin = require('./lib/__fixtures__/daemon-polish-fixtures.cjs');

describe('devflow-watch install-service / uninstall-service (TRD 20-02)', () => {
  let home, tmp, shimEnv;
  beforeEach(() => {
    home = mkTmp();
    tmp = mkTmp();
    // Set up launchctl + systemctl shims on PATH so install-service doesn't
    // hit real system tools. Fixture overrides PATH; we pass that through to
    // the subprocess via env.
    shimEnv = {
      launchctl: fxBin.buildLaunchctlShimEnv(tmp),
      systemctl: fxBin.buildSystemctlShimEnv(tmp),
    };
  });
  afterEach(() => {
    if (shimEnv) {
      shimEnv.launchctl.cleanup();
      shimEnv.systemctl.cleanup();
    }
    rmTmp(home);
    rmTmp(tmp);
  });

  // Helper: build env for spawned CLI that includes shim PATH + tmp HOME
  function shimCliEnv() {
    return {
      HOME: home,
      PATH: process.env.PATH,
      LAUNCHCTL_SHIM_MARKER_FILE: shimEnv.launchctl.markerFile,
      SYSTEMCTL_SHIM_MARKER_FILE: shimEnv.systemctl.markerFile,
    };
  }

  test('C-1 install-service invokes installer with current platform + cwd', () => {
    if (process.platform !== 'darwin' && process.platform !== 'linux') {
      // Skip on win32 — covered by C-5
      return;
    }
    const r = runCli(['install-service', '--project', home], shimCliEnv());
    assert.ok(r.ok, `failed: ${r.stderr}`);
    assert.match(r.stdout, /service installed/i);
    // Verify shim was called
    const markerFile = process.platform === 'darwin'
      ? shimEnv.launchctl.markerFile
      : shimEnv.systemctl.markerFile;
    const calls = fxBin.readShimCalls(markerFile);
    assert.ok(calls.length > 0, `${process.platform} shim should have been called`);
  });

  test('C-2 uninstall-service invokes installer.uninstallService', () => {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return;
    // Pre-install via direct module call so uninstall has something to remove
    const r = runCli(['uninstall-service'], shimCliEnv());
    // Uninstall is idempotent — should succeed even when nothing installed
    assert.ok(r.ok || r.code === 0, `uninstall-service failed: ${r.stderr}`);
  });

  test('C-5 install-service on unsupported platform exits 1 with clear message', () => {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // We can't easily simulate win32 from an actual macOS/linux runtime.
      // The CLI's platform check is `process.platform`. Skip gracefully.
      return;
    }
    const r = runCli(['install-service'], shimCliEnv());
    assert.equal(r.ok, false);
    assert.match(r.stderr, /unsupported platform/i);
    assert.equal(r.code, 1);
  });

  test('C-6 install-service --project /custom/path passes /custom/path to installer', () => {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return;
    const customProject = mkTmp();
    try {
      const r = runCli(['install-service', '--project', customProject], shimCliEnv());
      assert.ok(r.ok, `failed: ${r.stderr}`);
      // Verify the service file content references customProject
      let serviceFile;
      if (process.platform === 'darwin') {
        serviceFile = path.join(home, 'Library', 'LaunchAgents', 'com.aocyber.devflow-watch.plist');
      } else {
        serviceFile = path.join(home, '.config', 'systemd', 'user', 'devflow-watch.service');
      }
      assert.ok(fs.existsSync(serviceFile));
      const content = fs.readFileSync(serviceFile, 'utf8');
      assert.ok(content.includes(customProject), 'service file references --project value');
    } finally {
      rmTmp(customProject);
    }
  });

  test('C-7 help / no args lists install-service / uninstall-service', () => {
    const r = runCli([], { HOME: home });
    assert.equal(r.ok, false);
    assert.match(r.stderr, /install-service/);
    assert.match(r.stderr, /uninstall-service/);
  });
});

// ===========================================================================
// TRD 20-03 Group C — multi-project CLI subcommands
// ===========================================================================

describe('devflow-watch multi-project CLI (TRD 20-03)', () => {
  let home;
  beforeEach(() => { home = mkTmp(); });
  afterEach(() => rmTmp(home));

  test('C-2 start --project /p (single) writes watching:[/p] (back-compat)', async () => {
    const project = mkTmp();
    try {
      const child = spawn('node', [CLI, 'start', '--project', project, '--foreground', '--shell', 'bash'], {
        env: { ...process.env, HOME: home },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const pidFile = path.join(home, '.devflow', 'devflow-watch.pid');
      const start = Date.now();
      while (Date.now() - start < 3000) {
        try {
          if (fs.existsSync(pidFile)) {
            const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
            if (info && info.pid === child.pid) break;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 25));
      }
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      assert.deepEqual(info.watching, [project], 'single-project back-compat preserved');
      try { child.kill('SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 200));
    } finally {
      rmTmp(project);
    }
  });

  test('C-1 start --project /p1,/p2 writes watching:[/p1, /p2]', async () => {
    const p1 = mkTmp();
    const p2 = mkTmp();
    try {
      const child = spawn('node', [CLI, 'start', '--project', `${p1},${p2}`, '--foreground', '--shell', 'bash'], {
        env: { ...process.env, HOME: home },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const pidFile = path.join(home, '.devflow', 'devflow-watch.pid');
      const start = Date.now();
      while (Date.now() - start < 3000) {
        try {
          if (fs.existsSync(pidFile)) {
            const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
            if (info && info.pid === child.pid && info.watching && info.watching.length === 2) break;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 25));
      }
      const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      assert.equal(info.watching.length, 2, 'two projects in watching array');
      assert.ok(info.watching.includes(p1));
      assert.ok(info.watching.includes(p2));
      try { child.kill('SIGTERM'); } catch {}
      await new Promise(r => setTimeout(r, 200));
    } finally {
      rmTmp(p1);
      rmTmp(p2);
    }
  });

  test('C-4 add-project when daemon dead exits 2 + clear message', () => {
    const r = runCli(['add-project', '/some/path'], { HOME: home });
    assert.equal(r.ok, false);
    assert.match(r.stderr, /not running|daemon.*not.*running/i);
    assert.equal(r.code, 2);
  });

  test('C-6 remove-project when /p not watched exits 0 (idempotent — no PID file)', () => {
    const r = runCli(['remove-project', '/some/path'], { HOME: home });
    // Idempotent: success exit code even when daemon not running
    assert.ok(r.ok, `expected idempotent success: ${r.stderr}`);
  });

  test('C-7 status JSON contains projects:[...] (plural) AND project (singular)', async () => {
    // Pre-write a PID file simulating a dead daemon with multi-project
    const pidDir = path.join(home, '.devflow');
    fs.mkdirSync(pidDir, { recursive: true });
    const p1 = mkTmp();
    const p2 = mkTmp();
    try {
      fs.writeFileSync(
        path.join(pidDir, 'devflow-watch.pid'),
        JSON.stringify({ pid: 999999, version: '0.1.0', shell: 'bash', watching: [p1, p2], started_at: new Date().toISOString() }),
      );
      const r = runCli(['status'], { HOME: home });
      assert.ok(r.ok, `failed: ${r.stderr}`);
      const out = JSON.parse(r.stdout);
      assert.ok(Array.isArray(out.projects), 'projects key is array');
      assert.equal(out.projects.length, 2);
      assert.equal(out.project, p1, 'project (singular) = first watching entry');
    } finally {
      rmTmp(p1);
      rmTmp(p2);
    }
  });

  test('C-8 status JSON contains pending_counts per-project map', async () => {
    const pidDir = path.join(home, '.devflow');
    fs.mkdirSync(pidDir, { recursive: true });
    const p1 = mkTmp();
    const p2 = mkTmp();
    try {
      fs.mkdirSync(path.join(p1, '.devflow-handoff', 'pending'), { recursive: true });
      fs.writeFileSync(path.join(p1, '.devflow-handoff', 'pending', 'h-x.json'), '{"id":"h-x","cmd":"echo"}');
      fs.writeFileSync(
        path.join(pidDir, 'devflow-watch.pid'),
        JSON.stringify({ pid: 999999, version: '0.1.0', shell: 'bash', watching: [p1, p2], started_at: new Date().toISOString() }),
      );
      const r = runCli(['status'], { HOME: home });
      assert.ok(r.ok);
      const out = JSON.parse(r.stdout);
      assert.equal(typeof out.pending_counts, 'object');
      assert.equal(out.pending_counts[p1], 1);
      assert.equal(out.pending_counts[p2], 0);
    } finally {
      rmTmp(p1);
      rmTmp(p2);
    }
  });

  test('C-9 status JSON contains pending_count (sum) for back-compat', async () => {
    const pidDir = path.join(home, '.devflow');
    fs.mkdirSync(pidDir, { recursive: true });
    const p1 = mkTmp();
    try {
      fs.mkdirSync(path.join(p1, '.devflow-handoff', 'pending'), { recursive: true });
      fs.writeFileSync(path.join(p1, '.devflow-handoff', 'pending', 'h-x.json'), '{"id":"h-x"}');
      fs.writeFileSync(path.join(p1, '.devflow-handoff', 'pending', 'h-y.json'), '{"id":"h-y"}');
      fs.writeFileSync(
        path.join(pidDir, 'devflow-watch.pid'),
        JSON.stringify({ pid: 999999, version: '0.1.0', shell: 'bash', watching: [p1], started_at: new Date().toISOString() }),
      );
      const r = runCli(['status'], { HOME: home });
      assert.ok(r.ok);
      const out = JSON.parse(r.stdout);
      assert.equal(out.pending_count, 2, 'sum across projects');
    } finally {
      rmTmp(p1);
    }
  });

  test('C-11 help / usage line lists add-project / remove-project', () => {
    const r = runCli([], { HOME: home });
    assert.equal(r.ok, false);
    assert.match(r.stderr, /add-project/);
    assert.match(r.stderr, /remove-project/);
  });
});

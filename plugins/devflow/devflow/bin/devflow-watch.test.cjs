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

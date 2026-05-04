'use strict';

/**
 * End-to-end integration tests for the seamless handoff pipeline.
 *
 * Spawns devflow-watch as a real subprocess, writes pending records that
 * exercise the full daemon → shell dispatch → done record → route-results
 * hook injection path, and asserts the visible behavior at each stage.
 *
 * Slow tests (real subprocess + real shell session). Limited to the
 * pipeline integration; component-level coverage lives in:
 *   - watcher-state.test.cjs
 *   - watcher-allowlist.test.cjs
 *   - watcher-shell.test.cjs
 *   - watcher-daemon.test.cjs
 *   - devflow-watch.test.cjs
 *   - route-results.test.js
 *   - gate-interactive.test.js
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const CLI = path.join(__dirname, 'devflow-watch.cjs');
const ROUTE_RESULTS_HOOK = path.join(__dirname, '..', '..', 'hooks', 'route-results.js');

// A test allowlist that lets the daemon run benign shell builtins
// so we can validate the pipeline without requiring real interactive auth.
const TEST_ALLOW_JSON = JSON.stringify({
  commands: [
    { pattern: '^echo\\b', label: 'test:echo' },
    { pattern: '^printf\\b', label: 'test:printf' },
    { pattern: '^true\\b', label: 'test:true' },
  ],
});

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-e2e-'));
}

function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

function writeAllowFile(home) {
  const dir = path.join(home, '.devflow');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'devflow-watch-allow.json');
  fs.writeFileSync(file, TEST_ALLOW_JSON);
  return file;
}

function writePending(projectRoot, id, cmd) {
  const dir = path.join(projectRoot, '.devflow-handoff', 'pending');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    id,
    cmd,
    cwd: projectRoot,
    status: 'pending',
    source: 'hook',
    created_at: new Date().toISOString(),
  }, null, 2) + '\n');
  return filePath;
}

async function withDaemon({ home, project, shell }, fn) {
  // Use bash with interactive=false-equivalent at the daemon level.
  // The daemon's ShellSession defaults to interactive:true; the test allow
  // file routes harmless commands through it.
  const child = spawn('node', [CLI, 'start',
    '--project', project,
    '--shell', shell || 'bash',
    '--foreground',
  ], {
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for PID file with our child's pid
  const pidFile = path.join(home, '.devflow', 'devflow-watch.pid');
  const start = Date.now();
  while (Date.now() - start < 5000) {
    try {
      if (fs.existsSync(pidFile)) {
        const info = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
        if (info && info.pid === child.pid) break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }

  try {
    await fn(child);
  } finally {
    try { child.kill('SIGTERM'); } catch {}
    // Wait for clean exit
    await new Promise((resolve) => {
      const t = setTimeout(() => resolve(), 3000);
      child.on('exit', () => { clearTimeout(t); resolve(); });
    });
  }
}

async function waitForDoneRecord(projectRoot, id, timeoutMs = 10000) {
  const filePath = path.join(projectRoot, '.devflow-handoff', 'done', `${id}.json`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) {
      try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`done record ${id} did not appear within ${timeoutMs}ms`);
}

function runRouteResults(projectRoot) {
  const result = spawnSync('node', [ROUTE_RESULTS_HOOK], {
    cwd: projectRoot,
    encoding: 'utf-8',
    input: '',
  });
  return result;
}

// ---------------------------------------------------------------------------

describe('handoff pipeline — end-to-end', () => {
  let home, project;
  beforeEach(() => {
    home = mkTmp();
    project = mkTmp();
    fs.mkdirSync(path.join(project, '.devflow-handoff', 'pending'), { recursive: true });
    writeAllowFile(home);
  });
  afterEach(() => { rmTmp(home); rmTmp(project); });

  test('write pending → daemon executes → route-results emits result with stdout', { timeout: 30000 }, async () => {
    await withDaemon({ home, project }, async () => {
      writePending(project, 'h-001', 'echo hello-world');
      const done = await waitForDoneRecord(project, 'h-001');
      assert.equal(done.status, 'done');
      assert.equal(done.exit_code, 0);
      assert.match(done.stdout, /hello-world/);

      const r = runRouteResults(project);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
      assert.match(out.hookSpecificOutput.additionalContext, /h-001/);
      assert.match(out.hookSpecificOutput.additionalContext, /hello-world/);
    });
  });

  test('disallowed command produces rejected done record + "Do NOT retry" guidance', { timeout: 30000 }, async () => {
    await withDaemon({ home, project }, async () => {
      writePending(project, 'h-002', 'rm -rf /tmp/whatever');
      const done = await waitForDoneRecord(project, 'h-002');
      assert.equal(done.status, 'rejected');
      assert.equal(done.exit_code, -2);

      const r = runRouteResults(project);
      const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
      assert.match(ctx, /rejected by daemon/);
      assert.match(ctx, /Do NOT retry/);
    });
  });

  test('idempotency: route-results emits once, silence on second invocation', { timeout: 30000 }, async () => {
    await withDaemon({ home, project }, async () => {
      writePending(project, 'h-003', 'echo idempotent');
      await waitForDoneRecord(project, 'h-003');

      const r1 = runRouteResults(project);
      assert.ok(r1.stdout.length > 0, 'first invocation should emit');

      const r2 = runRouteResults(project);
      assert.equal(r2.stdout, '', 'second invocation should be silent (consumed flag)');
    });
  });

  test('multi-record: 3 queued commands appear in a single injection', { timeout: 30000 }, async () => {
    await withDaemon({ home, project }, async () => {
      writePending(project, 'h-004', 'echo first');
      writePending(project, 'h-005', 'echo second');
      writePending(project, 'h-006', 'echo third');

      await waitForDoneRecord(project, 'h-004');
      await waitForDoneRecord(project, 'h-005');
      await waitForDoneRecord(project, 'h-006');

      const r = runRouteResults(project);
      const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
      // All three should be in a single additionalContext (3 commands the watcher ran)
      assert.match(ctx, /3 commands the watcher ran/);
      assert.match(ctx, /h-004/);
      assert.match(ctx, /h-005/);
      assert.match(ctx, /h-006/);
      assert.match(ctx, /first/);
      assert.match(ctx, /second/);
      assert.match(ctx, /third/);
    });
  });
});

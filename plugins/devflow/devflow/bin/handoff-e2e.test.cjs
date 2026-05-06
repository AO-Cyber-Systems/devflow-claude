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
const http = require('http');
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

// ---------------------------------------------------------------------------
// TRD 19-05: PTY-path mock auth e2e tests
//
// Validates that the PTY-backed daemon (TRD 19-01) + token-passing wire
// format (TRD 19-02) correctly drive real `gh auth login` and `doctl auth
// init` commands against LOCAL MOCK HTTP SERVERS — no real credentials,
// no real network, no real GH/DO API. CI runs replay-only.
//
// Behavior list (must be in a comment block at the top of the describe):
//   MA-1: gating — when ptyAvailable() OR ghAvailable()/doctlAvailable()
//         returns false, all MA-* tests skip cleanly via t.skip()
//   MA-2: mockGhServer responds to POST /login/device/code with cassette
//   MA-3: mockGhServer responds to POST /login/oauth/access_token with cassette
//   MA-4: mockDoctlServer responds to GET /v2/account with cassette
//   MA-5: end-to-end — gh auth login via PTY against mockGh produces a
//         done record (status:'done' OR a rejection only when allowlist
//         missing the entry — the GREEN phase adds the entry)
//   MA-6: end-to-end — doctl auth init via PTY with inputs.secrets[env]
//         pointing at DIGITALOCEAN_TOKEN produces status:'done', exit_code:0,
//         AND the token is redacted from done.stdout (proves 19-02 wiring
//         survives the full e2e pipeline)
//   MA-7: failure case — DIGITALOCEAN_TOKEN unset → daemon emits
//         status:'failed' with stderr containing "secret resolution failed"
//   MA-8: deferred — mock 401 returns non-zero exit; covered by overriding
//         cassette in MA-7 path, NOT a separate test in v1.2 (see SUMMARY)
//
// Cassette pattern (matches obj 1 TRD 01-06): JSON in __fixtures__/handoff-cassettes/,
// hand-built minimal until live re-record is convenient. Replay-only in CI.
// ---------------------------------------------------------------------------

describe('handoff pipeline — PTY-path mock auth (TRD 19-05)', () => {
  // Behavior list — see header block above for MA-1 through MA-8.

  function ptyAvailable() {
    try { require('node-pty'); return true; } catch { return false; }
  }
  function ghAvailable() {
    try {
      const r = spawnSync('gh', ['--version'], { stdio: 'ignore' });
      return r.status === 0;
    } catch { return false; }
  }
  function doctlAvailable() {
    try {
      const r = spawnSync('doctl', ['version'], { stdio: 'ignore' });
      return r.status === 0;
    } catch { return false; }
  }

  // Test allowlist that includes the new gh + doctl auth patterns plus
  // the benign builtins from the v1.1 baseline. RED phase: this constant
  // is NOT wired into writeAllowFile yet — daemon will reject MA-5/6/7
  // commands. GREEN phase wires it in via writeMockAllowFile().
  const MOCK_AUTH_ALLOW_JSON = JSON.stringify({
    commands: [
      { pattern: '^echo\\b', label: 'test:echo' },
      { pattern: '^printf\\b', label: 'test:printf' },
      { pattern: '^true\\b', label: 'test:true' },
      { pattern: '^gh\\s+auth\\s+login\\b', label: 'test:gh-auth-login' },
      { pattern: '^doctl\\s+auth\\s+init\\b', label: 'test:doctl-auth-init' },
    ],
  });

  function writeMockAllowFile(home) {
    const dir = path.join(home, '.devflow');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'devflow-watch-allow.json');
    fs.writeFileSync(file, MOCK_AUTH_ALLOW_JSON);
    return file;
  }

  async function withDaemonAndMocks(spawnOpts, fn) {
    const { home, project, mockGhPort, mockDoctlPort, doToken } = spawnOpts;
    const env = {
      ...process.env,
      HOME: home,
      // Redirect gh + doctl at the mock servers. gh respects GH_HOST;
      // doctl respects DIGITALOCEAN_API_URL. TLS is NOT required for
      // local mocks (both tools accept HTTP when the env vars carry
      // an http:// URL or a bare host:port without scheme).
      GH_HOST: `127.0.0.1:${mockGhPort}`,
      DIGITALOCEAN_API_URL: `http://127.0.0.1:${mockDoctlPort}/`,
      DIGITALOCEAN_TOKEN: doToken == null ? '' : doToken,
    };
    const child = spawn('node', [CLI, 'start',
      '--project', project,
      '--shell', 'bash',
      '--foreground',
    ], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait for PID file with our child's pid (mirrors withDaemon)
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
      await new Promise((resolve) => {
        const t = setTimeout(() => resolve(), 3000);
        child.on('exit', () => { clearTimeout(t); resolve(); });
      });
    }
  }

  let home, project, mockGh, mockDoctl, mockGhPort, mockDoctlPort;
  beforeEach(async () => {
    home = mkTmp();
    project = mkTmp();
    fs.mkdirSync(path.join(project, '.devflow-handoff', 'pending'), { recursive: true });
    if (!ptyAvailable()) return;

    const { mockGhServer, mockDoctlServer } = require('./__fixtures__/mock-auth-servers.cjs');
    mockGh = mockGhServer();
    mockDoctl = mockDoctlServer();
    await new Promise((r, rej) => {
      mockGh.once('error', rej);
      mockGh.listen(0, '127.0.0.1', () => r());
    });
    await new Promise((r, rej) => {
      mockDoctl.once('error', rej);
      mockDoctl.listen(0, '127.0.0.1', () => r());
    });
    mockGhPort = mockGh.address().port;
    mockDoctlPort = mockDoctl.address().port;
  });
  afterEach(async () => {
    try { if (mockGh) await new Promise(r => mockGh.close(() => r())); } catch {}
    try { if (mockDoctl) await new Promise(r => mockDoctl.close(() => r())); } catch {}
    mockGh = null; mockDoctl = null; mockGhPort = null; mockDoctlPort = null;
    rmTmp(home); rmTmp(project);
  });

  test('MA-2 mockGhServer responds to POST /login/device/code with cassette', { timeout: 10000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');

    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: mockGhPort,
        method: 'POST', path: '/login/device/code',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }, (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      });
      req.on('error', reject);
      req.end('client_id=fake&scope=repo');
    });

    assert.equal(body.status, 200, 'POST /login/device/code should return 200');
    const json = JSON.parse(body.body);
    assert.ok(json.device_code, 'response should include device_code');
    assert.ok(json.user_code, 'response should include user_code');
    assert.ok(json.verification_uri, 'response should include verification_uri');
  });

  test('MA-3 mockGhServer responds to POST /login/oauth/access_token with cassette', { timeout: 10000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');

    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: mockGhPort,
        method: 'POST', path: '/login/oauth/access_token',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }, (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      });
      req.on('error', reject);
      req.end('device_code=x&grant_type=urn:ietf:params:oauth:grant-type:device_code');
    });

    assert.equal(body.status, 200);
    const json = JSON.parse(body.body);
    assert.ok(json.access_token, 'response should include access_token');
    assert.ok(json.token_type, 'response should include token_type');
  });

  test('MA-4 mockDoctlServer responds to GET /v2/account with cassette', { timeout: 10000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');

    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: mockDoctlPort,
        method: 'GET', path: '/v2/account',
        headers: { 'Authorization': 'Bearer fake-token' },
      }, (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(body.status, 200);
    const json = JSON.parse(body.body);
    assert.ok(json.account, 'response should include account object');
    assert.ok(json.account.uuid, 'account should include uuid');
  });

  test('MA-2b mock unknown path returns 404 with diagnostic body', { timeout: 5000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');

    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: mockGhPort,
        method: 'GET', path: '/this/path/does/not/exist',
      }, (res) => {
        let buf = '';
        res.on('data', (c) => { buf += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.equal(body.status, 404);
    const json = JSON.parse(body.body);
    assert.match(json.error, /no cassette match/i);
  });

  test('MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN fails with secret-resolution stderr', { timeout: 30000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');
    if (!doctlAvailable()) return t.skip('doctl unavailable');

    writeMockAllowFile(home);

    await withDaemonAndMocks({ home, project, mockGhPort, mockDoctlPort, doToken: '' }, async () => {
      // Use a more permissive prompt regex than `Enter your access token:`
      // to handle doctl variations: it has been observed to print
      // "Please authenticate doctl..." or "Enter your DigitalOcean access token:"
      // in different versions. /access token/i is the stable substring.
      const pendingPath = path.join(project, '.devflow-handoff', 'pending', 'h-do-secfail.json');
      fs.writeFileSync(pendingPath, JSON.stringify({
        id: 'h-do-secfail',
        cmd: 'doctl auth init',
        cwd: project,
        status: 'pending',
        source: 'hook',
        created_at: new Date().toISOString(),
        inputs: {
          secrets: [
            { prompt_match: 'access token', value_source: 'env', value_ref: 'DIGITALOCEAN_TOKEN' },
          ],
        },
      }, null, 2) + '\n');

      const done = await waitForDoneRecord(project, 'h-do-secfail', 25000);
      assert.equal(done.status, 'failed', `expected failed, got ${done.status} (stderr: ${done.stderr})`);
      assert.match(done.stderr || '', /secret resolution failed/, 'stderr should mention secret resolution');
      assert.match(done.stderr || '', /DIGITALOCEAN_TOKEN/, 'stderr should mention the env var name');
    });
  });

  test('MA-6 doctl auth init via PTY with inputs.secrets[env] succeeds against mock + redacts token', { timeout: 45000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');
    if (!doctlAvailable()) return t.skip('doctl unavailable');

    writeMockAllowFile(home);
    const fakeToken = 'do-test-token-1234567890abcdefghij';  // > MIN_REDACT_LEN=8

    await withDaemonAndMocks({ home, project, mockGhPort, mockDoctlPort, doToken: fakeToken }, async () => {
      const pendingPath = path.join(project, '.devflow-handoff', 'pending', 'h-do-ok.json');
      fs.writeFileSync(pendingPath, JSON.stringify({
        id: 'h-do-ok',
        cmd: 'doctl auth init',
        cwd: project,
        status: 'pending',
        source: 'hook',
        created_at: new Date().toISOString(),
        inputs: {
          secrets: [
            { prompt_match: 'access token', value_source: 'env', value_ref: 'DIGITALOCEAN_TOKEN' },
          ],
        },
      }, null, 2) + '\n');

      const done = await waitForDoneRecord(project, 'h-do-ok', 40000);
      // doctl against the mock should validate the token (GET /v2/account → 200)
      // and exit 0. If it doesn't (mock cassette mismatches what doctl sends,
      // or doctl on this version does something unexpected), the test
      // assertion will fail with the actual done record content for inspection.
      if (done.status !== 'done') {
        // Provide diagnostic context in the failure message.
        assert.fail(
          `expected done.status='done', got '${done.status}'\n`
          + `exit_code=${done.exit_code}\n`
          + `stdout=${(done.stdout || '').slice(0, 400)}\n`
          + `stderr=${(done.stderr || '').slice(0, 400)}`,
        );
      }
      assert.equal(done.exit_code, 0);
      // Token redaction: the resolved value must NEVER appear verbatim
      // in the persisted done record (this is the key e2e contract that
      // confirms TRD 19-02 redaction wires through the full pipeline).
      assert.doesNotMatch(
        done.stdout || '',
        new RegExp(fakeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        'fake token must be redacted from stdout',
      );
      assert.doesNotMatch(
        done.stderr || '',
        new RegExp(fakeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        'fake token must be redacted from stderr',
      );
    });
  });
});

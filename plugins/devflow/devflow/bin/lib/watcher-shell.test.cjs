/**
 * Tests for watcher-shell — interactive shell session with sentinel-based
 * command dispatch.
 *
 * Behaviour list (TRD 01-04):
 *   1. spawn() ready
 *   2. dispatch returns stdout/stderr/exit_code
 *   3. sentinels parsed correctly
 *   4. exit code 0 vs non-zero
 *   5. echo hello -> stdout: "hello\n"
 *   6. echo err >&2 -> stderr: "err\n"
 *   7. timeout -> status: 'timeout', exit_code: -1
 *   8. env preserved across dispatches
 *   9. kill() sends SIGTERM
 *  10. dispatch after kill rejects
 *  11. crash recovery
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const { ShellSession, ShellSessionClosed } = require('./watcher-shell.cjs');

// Unit tests use non-interactive bash for speed and CI reliability.
// The interactive=true path (loading user rc files for mise/nvm/conda/aliases)
// is the production daemon's concern; an integration smoke test with
// interactive=true belongs in TRD 01-07 (end-to-end), not here.
const SHELL = 'bash';

async function withSession(opts, fn) {
  const session = new ShellSession({ shell: SHELL, interactive: false, ...opts });
  await session.spawn();
  try {
    await fn(session);
  } finally {
    try { await session.kill(); } catch {}
  }
}

describe('watcher-shell — basic dispatch', () => {
  test('echo hello returns { stdout: "hello\\n", exit_code: 0 }', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-1', 'echo hello');
      assert.equal(r.stdout, 'hello\n');
      assert.equal(r.exit_code, 0);
      assert.equal(r.status, 'done');
    });
  });

  test('false returns exit_code: 1, status: failed', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-2', 'false');
      assert.equal(r.exit_code, 1);
      assert.equal(r.status, 'failed');
    });
  });

  test('echo to stderr is captured separately', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-3', 'echo err 1>&2');
      assert.equal(r.stdout, '');
      assert.equal(r.stderr, 'err\n');
      assert.equal(r.exit_code, 0);
    });
  });

  test('two dispatches preserve env (FOO=bar)', async () => {
    await withSession({}, async (s) => {
      const a = await s.dispatch('h-4', 'export FOO=bar');
      assert.equal(a.exit_code, 0);
      const b = await s.dispatch('h-5', 'echo $FOO');
      assert.equal(b.stdout, 'bar\n');
    });
  });

  test('multi-line stdout preserved', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-6', "printf 'a\\nb\\nc\\n'");
      assert.equal(r.stdout, 'a\nb\nc\n');
    });
  });
});

describe('watcher-shell — timeout', () => {
  test('command exceeding timeout returns status: timeout', async () => {
    await withSession({}, async (s) => {
      const r = await s.dispatch('h-7', 'sleep 5', { timeout_ms: 200 });
      assert.equal(r.status, 'timeout');
      assert.equal(r.exit_code, -1);
    });
  });
});

describe('watcher-shell — lifecycle', () => {
  test('dispatch after kill rejects with ShellSessionClosed', async () => {
    const s = new ShellSession({ shell: SHELL });
    await s.spawn();
    await s.kill();
    await assert.rejects(
      () => s.dispatch('h-8', 'echo hi'),
      ShellSessionClosed,
    );
  });

  test('isAlive returns true after spawn, false after kill', async () => {
    const s = new ShellSession({ shell: SHELL });
    await s.spawn();
    assert.equal(s.isAlive(), true);
    await s.kill();
    assert.equal(s.isAlive(), false);
  });
});

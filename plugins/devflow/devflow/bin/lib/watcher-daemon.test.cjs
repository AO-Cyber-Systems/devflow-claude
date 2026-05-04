'use strict';

/**
 * Unit tests for watcher-daemon.cjs — the core loop logic, with shell
 * session and filesystem dependencies stubbed so we can validate behavior
 * without subprocess overhead.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const daemon = require('./watcher-daemon.cjs');
const allowlistLib = require('./watcher-allowlist.cjs');

function mkTmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-daemon-'));
  fs.mkdirSync(path.join(root, '.devflow-handoff', 'pending'), { recursive: true });
  return root;
}

function rmTmp(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

function writePending(root, id, cmd, extra = {}) {
  const file = path.join(root, '.devflow-handoff', 'pending', `${id}.json`);
  const rec = {
    id,
    cmd,
    cwd: root,
    status: 'pending',
    created_at: new Date().toISOString(),
    ...extra,
  };
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  return file;
}

function fakeSession(behaviour) {
  // behaviour: (id, cmd) => { stdout, stderr, exit_code, status }
  return {
    dispatch(id, cmd) {
      return Promise.resolve(behaviour(id, cmd));
    },
  };
}

// ---------------------------------------------------------------------------
// readPending
// ---------------------------------------------------------------------------

describe('readPending', () => {
  let root;
  beforeEach(() => { root = mkTmpProject(); });
  afterEach(() => rmTmp(root));

  test('returns empty when no records exist', () => {
    assert.deepEqual(daemon.readPending(root), []);
  });

  test('returns records sorted by created_at', () => {
    writePending(root, 'h-b', 'echo b', { created_at: '2026-04-29T10:01:00Z' });
    writePending(root, 'h-a', 'echo a', { created_at: '2026-04-29T10:00:00Z' });
    const recs = daemon.readPending(root);
    assert.equal(recs.length, 2);
    assert.equal(recs[0].cmd, 'echo a');
    assert.equal(recs[1].cmd, 'echo b');
  });

  test('skips malformed json', () => {
    fs.writeFileSync(path.join(root, '.devflow-handoff', 'pending', 'h-bad.json'), 'not json');
    writePending(root, 'h-good', 'echo ok', { created_at: '2026-04-29T10:00:00Z' });
    const recs = daemon.readPending(root);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].cmd, 'echo ok');
  });

  test('ignores non-json files', () => {
    fs.writeFileSync(path.join(root, '.devflow-handoff', 'pending', 'README.md'), '# readme');
    writePending(root, 'h-1', 'echo ok', { created_at: '2026-04-29T10:00:00Z' });
    assert.equal(daemon.readPending(root).length, 1);
  });
});

// ---------------------------------------------------------------------------
// processOnce
// ---------------------------------------------------------------------------

describe('processOnce', () => {
  let root;
  beforeEach(() => { root = mkTmpProject(); });
  afterEach(() => rmTmp(root));

  test('happy path: validates, dispatches, writes done record, removes pending', async () => {
    const filePath = writePending(root, 'h-1', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    const session = fakeSession(() => ({
      stdout: 'logged in', stderr: '', exit_code: 0, status: 'done',
    }));
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });

    assert.equal(done.status, 'done');
    assert.equal(done.exit_code, 0);
    assert.equal(done.stdout, 'logged in');
    assert.equal(done.consumed, false);

    // Pending file removed, done file present
    assert.ok(!fs.existsSync(filePath));
    const doneFile = path.join(root, '.devflow-handoff', 'done', 'h-1.json');
    assert.ok(fs.existsSync(doneFile));
    const onDisk = JSON.parse(fs.readFileSync(doneFile, 'utf8'));
    assert.equal(onDisk.id, 'h-1');
    assert.equal(onDisk.consumed, false);
  });

  test('disallowed command writes rejected done record without dispatching', async () => {
    writePending(root, 'h-2', 'rm -rf /');
    const allow = allowlistLib.defaultAllowlist();
    let dispatched = false;
    const session = { dispatch() { dispatched = true; return Promise.resolve(); } };
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });

    assert.equal(dispatched, false, 'should not dispatch disallowed cmd');
    assert.equal(done.status, 'rejected');
    assert.equal(done.exit_code, -2);
    assert.match(done.stderr, /rm -rf|denied by guard/);
  });

  test('command outside curated list is rejected', async () => {
    writePending(root, 'h-3', 'echo nope-not-in-allowlist');
    const allow = allowlistLib.defaultAllowlist();
    const session = { dispatch: () => { throw new Error('should not dispatch'); } };
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });
    assert.equal(done.status, 'rejected');
    assert.match(done.stderr, /does not match|allowlist/);
  });

  test('skipIf form (gh auth login --with-token) is rejected', async () => {
    writePending(root, 'h-4', 'gh auth login --with-token < /tmp/token');
    const allow = allowlistLib.defaultAllowlist();
    const session = { dispatch: () => { throw new Error('should not dispatch'); } };
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });
    assert.equal(done.status, 'rejected');
    assert.match(done.stderr, /skipIf|non-interactive/);
  });

  test('dispatch error is caught and written as error done record', async () => {
    writePending(root, 'h-5', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    const session = { dispatch() { return Promise.reject(new Error('boom')); } };
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });
    assert.equal(done.status, 'error');
    assert.equal(done.exit_code, -3);
    assert.match(done.stderr, /boom/);
  });

  test('non-zero exit_code from dispatch becomes failed status', async () => {
    writePending(root, 'h-6', 'mise use');
    const allow = allowlistLib.defaultAllowlist();
    const session = fakeSession(() => ({
      stdout: '', stderr: 'oops', exit_code: 1, status: 'failed',
    }));
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });
    assert.equal(done.status, 'failed');
    assert.equal(done.exit_code, 1);
    assert.equal(done.stderr, 'oops');
  });
});

// ---------------------------------------------------------------------------
// runLoop — fire-and-stop test (1 record, then stop)
// ---------------------------------------------------------------------------

describe('runLoop', () => {
  let root;
  beforeEach(() => { root = mkTmpProject(); });
  afterEach(() => rmTmp(root));

  test('processes pending records in serial then stops cleanly', async () => {
    writePending(root, 'h-1', 'gh auth login');
    writePending(root, 'h-2', 'mise use');
    const allow = allowlistLib.defaultAllowlist();
    const callOrder = [];
    const session = {
      async dispatch(id) {
        callOrder.push(id);
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    const loop = daemon.runLoop({
      projectRoot: root,
      session,
      allowlist: allow,
      pollIntervalMs: 25,
    });
    // Wait until both done records exist
    const doneDir = path.join(root, '.devflow-handoff', 'done');
    const start = Date.now();
    while (Date.now() - start < 5000) {
      try {
        if (fs.readdirSync(doneDir).filter(f => f.endsWith('.json')).length === 2) break;
      } catch {}
      await new Promise(r => setTimeout(r, 25));
    }
    await loop.stop();
    assert.deepEqual(callOrder, ['h-1', 'h-2'], 'serial dispatch in created_at order');

    const dones = fs.readdirSync(doneDir).filter(f => f.endsWith('.json'));
    assert.equal(dones.length, 2);
  });

  test('stop drains in-flight dispatch', async () => {
    writePending(root, 'h-1', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    let dispatchResolved = false;
    const session = {
      async dispatch() {
        await new Promise(r => setTimeout(r, 100));
        dispatchResolved = true;
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    const loop = daemon.runLoop({
      projectRoot: root,
      session,
      allowlist: allow,
      pollIntervalMs: 10,
    });
    // Let one dispatch start, then stop before it finishes
    await new Promise(r => setTimeout(r, 30));
    await loop.stop();
    assert.equal(dispatchResolved, true, 'stop should await in-flight dispatch');
  });
});

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

// =============================================================================
// TRD 19-02: processOnce token-passing tests
// =============================================================================
// Behavior list:
//   TP-1:  pending with valid inputs.secrets[env] resolves and writes value to session
//   TP-2:  pending with inputs.secrets[stash] but no stashGetter → status:'failed' with reason
//   TP-3:  pending with inputs.secrets[env] but env var unset → status:'failed' with reason
//   TP-4:  prompt re-match → Ctrl+C injection + status:'failed' with 'duplicate prompt match'
//   TP-5:  stdout containing the resolved secret value gets redacted in done record
//   TP-6:  pending without inputs field dispatches byte-identical to v1.1 (back-compat)
//   TP-7:  pending with inputs.secrets:[] dispatches like TP-6 (empty array OK)
//   TP-8:  pending with inputs.secrets[keyring] → status:'failed' before dispatch
//   TP-9:  redaction skips values shorter than MIN_REDACT_LEN
//   TP-10: stderr containing resolved secret also gets redacted
// =============================================================================

/**
 * Token-passing-aware mock session. Exposes attachDataListener / detachDataListener
 * / injectInput so processOnce can wire its prompt detector. Tests can drive
 * `dispatch` to simulate prompt streams (call session._emitData(chunk)) while
 * dispatch is in-flight.
 */
function makeTokenSession(opts) {
  const o = opts || {};
  const session = {
    _listeners: [],
    _injectedInputs: [],
    _dispatchedCmds: [],
    attachDataListener(fn) { this._listeners.push(fn); },
    detachDataListener(fn) { this._listeners = this._listeners.filter((x) => x !== fn); },
    injectInput(s) { this._injectedInputs.push(s); },
    _emitData(chunk) {
      // Snapshot listeners so detach during iteration doesn't break.
      for (const fn of this._listeners.slice()) fn(chunk);
    },
    dispatch(id, cmd /* , opts */) {
      this._dispatchedCmds.push({ id, cmd });
      return new Promise((resolve) => {
        // If a `stream` array was provided, emit each chunk synchronously
        // so the prompt detector sees them BEFORE we resolve. The result
        // value comes from `result()` (called after streaming).
        if (Array.isArray(o.stream)) {
          for (const chunk of o.stream) this._emitData(chunk);
        }
        const r = (typeof o.result === 'function')
          ? o.result(this)
          : (o.result || { stdout: '', stderr: '', exit_code: 0, status: 'done' });
        resolve(r);
      });
    },
  };
  return session;
}

describe('processOnce — token passing (TRD 19-02)', () => {
  let root;
  beforeEach(() => { root = mkTmpProject(); });
  afterEach(() => rmTmp(root));

  test('TP-1: valid inputs.secrets[env] resolves and writes value to session', async () => {
    process.env.TP1_TOKEN = 'super-secret-token-12345';
    try {
      writePending(root, 'h-tp1', 'doctl auth init', {
        inputs: {
          secrets: [{
            prompt_match: 'Enter your access token:',
            value_source: 'env',
            value_ref: 'TP1_TOKEN',
          }],
        },
      });
      const allow = allowlistLib.defaultAllowlist();
      const session = makeTokenSession({
        // Simulate the tool prompting for the token
        stream: ['Enter your access token: '],
        result: { stdout: 'authenticated\n', stderr: '', exit_code: 0, status: 'done' },
      });
      const pending = daemon.readPending(root);
      const done = await daemon.processOnce(pending[0], {
        session, allowlist: allow, projectRoot: root,
      });
      assert.equal(done.status, 'done');
      assert.equal(done.exit_code, 0);
      // The injected value should include the token + carriage-return.
      const injected = session._injectedInputs.join('');
      assert.ok(injected.includes('super-secret-token-12345'),
        `expected injected token, got: ${JSON.stringify(session._injectedInputs)}`);
      assert.ok(injected.endsWith('\r'),
        'injection must terminate with carriage-return');
    } finally {
      delete process.env.TP1_TOKEN;
    }
  });

  test('TP-2: inputs.secrets[stash] with no stashGetter → status:failed on prompt match', async () => {
    writePending(root, 'h-tp2', 'doctl auth init', {
      inputs: {
        secrets: [{
          prompt_match: 'Enter your access token:',
          value_source: 'stash',
          value_ref: 'do-token',
        }],
      },
    });
    const allow = allowlistLib.defaultAllowlist();
    const session = makeTokenSession({
      stream: ['Enter your access token: '],
      result: { stdout: '', stderr: '', exit_code: 0, status: 'done' },
    });
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
      stashGetter: null,
    });
    assert.equal(done.status, 'failed');
    assert.match(done.stderr, /secret resolution failed/);
    assert.match(done.stderr, /stash empty/);
    // Ctrl+C should have been injected to abort
    assert.ok(session._injectedInputs.includes('\x03'),
      'expected Ctrl+C injection on resolution failure');
  });

  test('TP-3: inputs.secrets[env] with unset env var → status:failed on prompt match', async () => {
    delete process.env.TP3_MISSING_TOKEN;
    writePending(root, 'h-tp3', 'doctl auth init', {
      inputs: {
        secrets: [{
          prompt_match: 'Enter your access token:',
          value_source: 'env',
          value_ref: 'TP3_MISSING_TOKEN',
        }],
      },
    });
    const allow = allowlistLib.defaultAllowlist();
    const session = makeTokenSession({
      stream: ['Enter your access token: '],
      result: { stdout: '', stderr: '', exit_code: 0, status: 'done' },
    });
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });
    assert.equal(done.status, 'failed');
    assert.match(done.stderr, /secret resolution failed/);
    assert.match(done.stderr, /env var "TP3_MISSING_TOKEN" unset/);
    assert.ok(session._injectedInputs.includes('\x03'));
  });

  test('TP-4: prompt re-match → Ctrl+C + status:failed with duplicate prompt match', async () => {
    process.env.TP4_TOKEN = 'token-with-enough-length';
    try {
      writePending(root, 'h-tp4', 'doctl auth init', {
        inputs: {
          secrets: [{
            prompt_match: 'Enter your access token:',
            value_source: 'env',
            value_ref: 'TP4_TOKEN',
          }],
        },
      });
      const allow = allowlistLib.defaultAllowlist();
      const session = makeTokenSession({
        // Simulate: tool prompts, daemon answers, tool re-prompts (rejected value)
        stream: [
          'Enter your access token: ',
          // The daemon writes the value; that doesn't show up in the stream
          // (mock session doesn't echo). Then the tool prompts again:
          '\nInvalid token.\nEnter your access token: ',
        ],
        result: { stdout: '', stderr: '', exit_code: 0, status: 'done' },
      });
      const pending = daemon.readPending(root);
      const done = await daemon.processOnce(pending[0], {
        session, allowlist: allow, projectRoot: root,
      });
      assert.equal(done.status, 'failed');
      assert.match(done.stderr, /duplicate prompt match/);
      assert.ok(session._injectedInputs.includes('\x03'),
        'expected Ctrl+C on duplicate prompt');
    } finally {
      delete process.env.TP4_TOKEN;
    }
  });

  test('TP-5: stdout containing resolved secret gets redacted in done record', async () => {
    process.env.TP5_TOKEN = 'super-secret-token-12345';
    try {
      writePending(root, 'h-tp5', 'doctl auth init', {
        inputs: {
          secrets: [{
            prompt_match: 'Token:',
            value_source: 'env',
            value_ref: 'TP5_TOKEN',
          }],
        },
      });
      const allow = allowlistLib.defaultAllowlist();
      const session = makeTokenSession({
        stream: ['Token: '],
        // Buggy tool echoes the token back in its stdout — must be redacted.
        result: {
          stdout: 'Authenticated. Token saved as super-secret-token-12345.\n',
          stderr: '',
          exit_code: 0,
          status: 'done',
        },
      });
      const pending = daemon.readPending(root);
      const done = await daemon.processOnce(pending[0], {
        session, allowlist: allow, projectRoot: root,
      });
      assert.equal(done.status, 'done');
      assert.ok(!done.stdout.includes('super-secret-token-12345'),
        `stdout should NOT contain raw token, got: ${done.stdout}`);
      assert.match(done.stdout, /\*\*\*REDACTED\*\*\*/);
    } finally {
      delete process.env.TP5_TOKEN;
    }
  });

  test('TP-6: pending without inputs field dispatches byte-identical to v1.1', async () => {
    writePending(root, 'h-tp6', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    let listenerAttached = false;
    const session = {
      attachDataListener() { listenerAttached = true; },
      detachDataListener() {},
      injectInput() {},
      async dispatch() {
        return { stdout: 'logged in\n', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });
    assert.equal(done.status, 'done');
    assert.equal(done.stdout, 'logged in\n');
    assert.equal(listenerAttached, false,
      'no data listener should be attached when no inputs.secrets');
  });

  test('TP-7: pending with inputs.secrets:[] dispatches like TP-6 (empty array OK)', async () => {
    writePending(root, 'h-tp7', 'gh auth login', {
      inputs: { secrets: [] },
    });
    const allow = allowlistLib.defaultAllowlist();
    let listenerAttached = false;
    const session = {
      attachDataListener() { listenerAttached = true; },
      detachDataListener() {},
      injectInput() {},
      async dispatch() {
        return { stdout: 'ok\n', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });
    assert.equal(done.status, 'done');
    assert.equal(listenerAttached, false,
      'empty secrets array should NOT attach a data listener');
  });

  test('TP-8: inputs.secrets[keyring] → status:failed before dispatch (validation rejects)', async () => {
    writePending(root, 'h-tp8', 'doctl auth init', {
      inputs: {
        secrets: [{
          prompt_match: 'Token:',
          value_source: 'keyring',
          value_ref: 'do-token',
        }],
      },
    });
    const allow = allowlistLib.defaultAllowlist();
    let dispatched = false;
    const session = {
      attachDataListener() {},
      detachDataListener() {},
      injectInput() {},
      async dispatch() {
        dispatched = true;
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root,
    });
    assert.equal(done.status, 'failed');
    assert.equal(dispatched, false, 'must not dispatch when validation fails');
    assert.match(done.stderr, /inputs invalid/);
    assert.match(done.stderr, /keyring/);
  });

  test('TP-9: redaction skips values shorter than MIN_REDACT_LEN', async () => {
    process.env.TP9_TOKEN = 'short'; // 5 chars, below MIN_REDACT_LEN=8
    try {
      writePending(root, 'h-tp9', 'doctl auth init', {
        inputs: {
          secrets: [{
            prompt_match: 'Token:',
            value_source: 'env',
            value_ref: 'TP9_TOKEN',
          }],
        },
      });
      const allow = allowlistLib.defaultAllowlist();
      const session = makeTokenSession({
        stream: ['Token: '],
        // Output contains the short token literally; redaction must NOT collapse
        // unrelated 'short' substrings (e.g. "URL is too short").
        result: {
          stdout: 'Login flow short-circuited.\n',
          stderr: '',
          exit_code: 0,
          status: 'done',
        },
      });
      const pending = daemon.readPending(root);
      const done = await daemon.processOnce(pending[0], {
        session, allowlist: allow, projectRoot: root,
      });
      assert.equal(done.status, 'done');
      assert.ok(done.stdout.includes('short'),
        'short tokens must NOT be redacted (collision risk)');
      assert.ok(!done.stdout.includes('***REDACTED***'),
        'no redaction marker expected for short value');
    } finally {
      delete process.env.TP9_TOKEN;
    }
  });

  test('TP-10: stderr containing resolved secret also gets redacted', async () => {
    process.env.TP10_TOKEN = 'leaked-on-stderr-token-XYZ';
    try {
      writePending(root, 'h-tp10', 'doctl auth init', {
        inputs: {
          secrets: [{
            prompt_match: 'Token:',
            value_source: 'env',
            value_ref: 'TP10_TOKEN',
          }],
        },
      });
      const allow = allowlistLib.defaultAllowlist();
      const session = makeTokenSession({
        stream: ['Token: '],
        result: {
          stdout: '',
          stderr: 'Warning: token leaked-on-stderr-token-XYZ in debug log.\n',
          exit_code: 0,
          status: 'done',
        },
      });
      const pending = daemon.readPending(root);
      const done = await daemon.processOnce(pending[0], {
        session, allowlist: allow, projectRoot: root,
      });
      assert.ok(!done.stderr.includes('leaked-on-stderr-token-XYZ'),
        'stderr must redact the secret');
      assert.match(done.stderr, /\*\*\*REDACTED\*\*\*/);
    } finally {
      delete process.env.TP10_TOKEN;
    }
  });
});

// ===========================================================================
// TRD 20-01 Group I — Notifier integration (processOnce + runLoop)
// ===========================================================================

function makeNotifierMock() {
  const calls = [];
  return {
    calls,
    notify: async (opts) => { calls.push(opts); },
  };
}

describe('processOnce — Group I: notifier integration (TRD 20-01)', () => {
  let root;
  beforeEach(() => { root = mkTmpProject(); });
  afterEach(() => rmTmp(root));

  test('I-1 deps.notifier=null: no notifier calls; behavior byte-identical', async () => {
    writePending(root, 'h-i1', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    const session = fakeSession(() => ({ stdout: 'hi\n', stderr: '', exit_code: 0, status: 'done' }));
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root, notifier: null,
    });
    assert.equal(done.status, 'done');
  });

  test('I-2 deps.notifier set: notify called BEFORE session.dispatch (dispatch-start)', async () => {
    writePending(root, 'h-i2', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    const order = [];
    const notif = {
      notify: async (opts) => {
        order.push({ type: 'notify-' + (opts.body && opts.body.startsWith('dispatching') ? 'start' : 'complete'), body: opts.body });
      },
    };
    const session = {
      dispatch: async (id, cmd) => {
        order.push({ type: 'dispatch', id, cmd });
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    const pending = daemon.readPending(root);
    await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root, notifier: notif,
    });
    // Order: notify-start → dispatch → notify-complete
    assert.equal(order[0].type, 'notify-start');
    assert.equal(order[1].type, 'dispatch');
    assert.equal(order[2].type, 'notify-complete');
    // Body of start references the cmd
    assert.match(order[0].body, /gh auth login/);
  });

  test('I-3 notifier.notify called AFTER writeDoneRecord (dispatch-complete signal)', async () => {
    writePending(root, 'h-i3', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    const notif = makeNotifierMock();
    const session = fakeSession(() => ({ stdout: '', stderr: '', exit_code: 0, status: 'done' }));
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root, notifier: notif,
    });
    assert.equal(notif.calls.length, 2, 'two calls: start + complete');
    // Second call body references status / completion
    assert.match(notif.calls[1].body, /completed h-i3/);
    assert.equal(done.status, 'done');
  });

  test('I-4 notifier errors during dispatch-start do NOT prevent dispatch', async () => {
    writePending(root, 'h-i4', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    let dispatchHappened = false;
    const notif = {
      notify: async () => { throw new Error('boom'); },
    };
    const session = {
      dispatch: async () => { dispatchHappened = true; return { stdout: '', stderr: '', exit_code: 0, status: 'done' }; },
    };
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root, notifier: notif,
    });
    assert.ok(dispatchHappened, 'dispatch must run despite notifier throwing');
    assert.equal(done.status, 'done');
  });

  test('I-5 notifier errors during dispatch-complete do NOT prevent done record', async () => {
    writePending(root, 'h-i5', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    let calls = 0;
    const notif = {
      notify: async () => {
        calls++;
        if (calls === 2) throw new Error('boom-complete');
      },
    };
    const session = fakeSession(() => ({ stdout: '', stderr: '', exit_code: 0, status: 'done' }));
    const pending = daemon.readPending(root);
    const done = await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root, notifier: notif,
    });
    const donePath = path.join(root, '.devflow-handoff', 'done', 'h-i5.json');
    assert.ok(fs.existsSync(donePath), 'done record written despite notifier throwing');
    assert.equal(done.status, 'done');
  });

  test('I-8 notify_on_start=false suppresses dispatch-start (only complete called)', async () => {
    writePending(root, 'h-i8', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    const notif = makeNotifierMock();
    const session = fakeSession(() => ({ stdout: '', stderr: '', exit_code: 0, status: 'done' }));
    const pending = daemon.readPending(root);
    await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root, notifier: notif,
      notify_on_start: false,
    });
    assert.equal(notif.calls.length, 1, 'only complete called when notify_on_start=false');
    assert.match(notif.calls[0].body, /completed/);
  });

  test('I-9 notify_on_complete=false suppresses dispatch-complete (only start called)', async () => {
    writePending(root, 'h-i9', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    const notif = makeNotifierMock();
    const session = fakeSession(() => ({ stdout: '', stderr: '', exit_code: 0, status: 'done' }));
    const pending = daemon.readPending(root);
    await daemon.processOnce(pending[0], {
      session, allowlist: allow, projectRoot: root, notifier: notif,
      notify_on_complete: false,
    });
    assert.equal(notif.calls.length, 1, 'only start called when notify_on_complete=false');
    assert.match(notif.calls[0].body, /dispatching/);
  });
});

// ===========================================================================
// TRD 20-03 Group D — runLoop multi-project iteration
// ===========================================================================

const stateLib = require('./watcher-state.cjs');

describe('runLoop — Group D: multi-project iteration (TRD 20-03)', () => {
  let h;
  let projects;
  beforeEach(() => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-mp-home-'));
    const prevHOME = process.env.HOME;
    process.env.HOME = home;
    h = {
      home,
      cleanup: () => {
        if (prevHOME === undefined) delete process.env.HOME;
        else process.env.HOME = prevHOME;
        try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
      },
    };
    projects = [
      fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-mp-p1-')),
      fs.mkdtempSync(path.join(os.tmpdir(), 'dfw-mp-p2-')),
    ];
    for (const p of projects) {
      fs.mkdirSync(path.join(p, '.devflow-handoff', 'pending'), { recursive: true });
    }
  });
  afterEach(() => {
    h.cleanup();
    for (const p of projects) rmTmp(p);
  });

  test('D-1 tick re-reads watching:[] from PID file each call', async () => {
    stateLib.writePidFile({ pid: process.pid, version: '0.1.0', shell: 'bash', watching: [projects[0]] });
    const calls = [];
    const session = {
      dispatch: async (id, cmd) => {
        calls.push({ id, cmd });
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    writePending(projects[0], 'h-d1-a', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    const loop = daemon.runLoop({
      projectRoot: projects[0], session, allowlist: allow, log: () => {}, pollIntervalMs: 30,
    });
    await new Promise((r) => setTimeout(r, 250));
    await loop.stop();
    assert.ok(calls.length >= 1, 'at least one dispatch happened');
  });

  test('D-2 watching=[p1, p2], pending in p1 → tick processes p1', async () => {
    stateLib.writePidFile({ pid: process.pid, version: '0.1.0', shell: 'bash', watching: projects });
    const calls = [];
    const session = {
      dispatch: async (id, cmd) => {
        calls.push({ id, cmd });
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    writePending(projects[0], 'h-d2-a', 'gh auth login');
    const allow = allowlistLib.defaultAllowlist();
    const loop = daemon.runLoop({
      projectRoot: projects[0], session, allowlist: allow, log: () => {}, pollIntervalMs: 30,
    });
    await new Promise((r) => setTimeout(r, 250));
    await loop.stop();
    assert.ok(calls.some((c) => c.id === 'h-d2-a'), 'p1 was dispatched');
  });

  test('D-3 p1 has pending, p2 empty → tick processes p1 (skips empty p2)', async () => {
    stateLib.writePidFile({ pid: process.pid, version: '0.1.0', shell: 'bash', watching: projects });
    writePending(projects[0], 'h-d3-a', 'gh auth login');
    const calls = [];
    const session = {
      dispatch: async (id, cmd) => {
        calls.push({ id, cmd });
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    const allow = allowlistLib.defaultAllowlist();
    const loop = daemon.runLoop({
      projectRoot: projects[0], session, allowlist: allow, log: () => {}, pollIntervalMs: 30,
    });
    await new Promise((r) => setTimeout(r, 250));
    await loop.stop();
    assert.ok(calls.some((c) => c.id === 'h-d3-a'));
  });

  test('D-4 watching=[] → tick is silent no-op', async () => {
    stateLib.writePidFile({ pid: process.pid, version: '0.1.0', shell: 'bash', watching: [] });
    const calls = [];
    const session = {
      dispatch: async (id, cmd) => { calls.push({ id, cmd }); return { stdout: '', stderr: '', exit_code: 0, status: 'done' }; },
    };
    const allow = allowlistLib.defaultAllowlist();
    const loop = daemon.runLoop({
      projectRoot: projects[0], session, allowlist: allow, log: () => {}, pollIntervalMs: 30,
    });
    await new Promise((r) => setTimeout(r, 150));
    await loop.stop();
    assert.equal(calls.length, 0, 'no dispatches when watching=[]');
  });

  test('D-5 PID file null (test path) → fall back to opts.projectRoot', async () => {
    stateLib.removePidFile();
    writePending(projects[0], 'h-d5-fallback', 'gh auth login');
    const calls = [];
    const session = {
      dispatch: async (id, cmd) => { calls.push({ id, cmd }); return { stdout: '', stderr: '', exit_code: 0, status: 'done' }; },
    };
    const allow = allowlistLib.defaultAllowlist();
    const loop = daemon.runLoop({
      projectRoot: projects[0], session, allowlist: allow, log: () => {}, pollIntervalMs: 30,
    });
    await new Promise((r) => setTimeout(r, 250));
    await loop.stop();
    assert.ok(calls.some((c) => c.id === 'h-d5-fallback'), 'fallback when PID file missing');
  });

  test('D-6 dispatch remains serial — only one inFlight at a time', async () => {
    stateLib.writePidFile({ pid: process.pid, version: '0.1.0', shell: 'bash', watching: projects });
    writePending(projects[0], 'h-d6-a', 'gh auth login');
    writePending(projects[0], 'h-d6-b', 'doctl auth init');
    writePending(projects[1], 'h-d6-c', 'gcloud auth login');
    let inFlightAtAnyTime = 0;
    let maxInFlight = 0;
    const session = {
      dispatch: async (id, cmd) => {
        inFlightAtAnyTime++;
        if (inFlightAtAnyTime > maxInFlight) maxInFlight = inFlightAtAnyTime;
        await new Promise((r) => setTimeout(r, 50));
        inFlightAtAnyTime--;
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    const allow = allowlistLib.defaultAllowlist();
    const loop = daemon.runLoop({
      projectRoot: projects[0], session, allowlist: allow, log: () => {}, pollIntervalMs: 30,
    });
    await new Promise((r) => setTimeout(r, 500));
    await loop.stop();
    assert.equal(maxInFlight, 1, 'serial dispatch — max 1 in flight');
  });

  test('D-7 addWatchedProject mid-runLoop visible to next tick', async () => {
    stateLib.writePidFile({ pid: process.pid, version: '0.1.0', shell: 'bash', watching: [projects[0]] });
    writePending(projects[1], 'h-d7-late', 'gh auth login');
    const calls = [];
    const session = {
      dispatch: async (id, cmd) => { calls.push({ id, cmd }); return { stdout: '', stderr: '', exit_code: 0, status: 'done' }; },
    };
    const allow = allowlistLib.defaultAllowlist();
    const loop = daemon.runLoop({
      projectRoot: projects[0], session, allowlist: allow, log: () => {}, pollIntervalMs: 30,
    });
    // Initially watching only p1; p2 has pending but won't be picked up
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(calls.length, 0, 'p2 pending NOT picked up before add-project');
    // Now add p2
    stateLib.addWatchedProject(projects[1]);
    await new Promise((r) => setTimeout(r, 200));
    await loop.stop();
    assert.ok(calls.some((c) => c.id === 'h-d7-late'), 'mid-loop add-project visible to next tick');
  });

  test('D-9 processOnce called with correct projectRoot per pending record', async () => {
    stateLib.writePidFile({ pid: process.pid, version: '0.1.0', shell: 'bash', watching: projects });
    writePending(projects[1], 'h-d9-only-p2', 'gh auth login');
    const session = {
      dispatch: async (id, cmd) => ({ stdout: '', stderr: '', exit_code: 0, status: 'done' }),
    };
    const allow = allowlistLib.defaultAllowlist();
    const loop = daemon.runLoop({
      projectRoot: projects[0], session, allowlist: allow, log: () => {}, pollIntervalMs: 30,
    });
    await new Promise((r) => setTimeout(r, 300));
    await loop.stop();
    const doneFile = path.join(projects[1], '.devflow-handoff', 'done', 'h-d9-only-p2.json');
    assert.ok(fs.existsSync(doneFile), 'done record landed in p2');
  });

  test('D-8 remove-project of project with in-flight dispatch — dispatch completes', async () => {
    stateLib.writePidFile({ pid: process.pid, version: '0.1.0', shell: 'bash', watching: projects });
    writePending(projects[0], 'h-d8-inflight', 'gh auth login');
    let dispatchStarted = false;
    let dispatchCompleted = false;
    const session = {
      dispatch: async (id, cmd) => {
        dispatchStarted = true;
        // Mid-dispatch, remove the project from watching
        stateLib.removeWatchedProject(projects[0]);
        await new Promise((r) => setTimeout(r, 50));
        dispatchCompleted = true;
        return { stdout: '', stderr: '', exit_code: 0, status: 'done' };
      },
    };
    const allow = allowlistLib.defaultAllowlist();
    const loop = daemon.runLoop({
      projectRoot: projects[0], session, allowlist: allow, log: () => {}, pollIntervalMs: 30,
    });
    await new Promise((r) => setTimeout(r, 300));
    await loop.stop();
    assert.ok(dispatchStarted, 'dispatch started');
    assert.ok(dispatchCompleted, 'dispatch completed despite mid-dispatch removal');
  });
});

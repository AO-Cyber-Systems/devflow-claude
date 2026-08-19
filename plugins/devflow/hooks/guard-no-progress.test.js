'use strict';

/**
 * guard-no-progress.test.js — TRD 28-04
 *
 * Subprocess tests: the hook is only useful if it behaves correctly when the
 * harness runs it, so these drive the real binary with real payloads.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'guard-no-progress.js');
const { prune, IGNORED_TOOLS } = require('./guard-no-progress.js');

function mkProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-'));
  fs.mkdirSync(path.join(tmp, '.planning'));
  return tmp;
}

function payload({ tool = 'Bash', input = { command: 'go test ./...' }, session = 's1', cwd }) {
  return JSON.stringify({
    session_id: session,
    hook_event_name: 'PreToolUse',
    cwd,
    tool_name: tool,
    tool_input: input,
  });
}

function run(cwd, body, env = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd, input: body, encoding: 'utf8', env: { ...process.env, ...env },
  });
  let decision = null;
  if (r.stdout && r.stdout.trim()) {
    try { decision = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; } catch { /* ignore */ }
  }
  return { decision, stderr: r.stderr.trim(), status: r.status };
}

describe('guard-no-progress — escalation ladder', () => {
  test('warns on the 3rd identical call and asks on the 5th', () => {
    const tmp = mkProject();
    try {
      const seen = [];
      for (let i = 0; i < 6; i++) seen.push(run(tmp, payload({ cwd: tmp })));
      assert.equal(seen[0].decision, null, 'call 1 must be silent');
      assert.equal(seen[1].decision, null, 'call 2 must be silent');
      assert.ok(seen[2].stderr.length > 0, 'call 3 must warn on stderr');
      assert.equal(seen[2].decision, null, 'call 3 must NOT block');
      assert.equal(seen[4].decision, 'ask', 'call 5 must escalate to the human');
      assert.equal(seen[5].decision, null, 'call 6 must not re-fire — one prompt per threshold');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  test('a different command resets the streak', () => {
    const tmp = mkProject();
    try {
      for (let i = 0; i < 4; i++) run(tmp, payload({ cwd: tmp }));
      const varied = run(tmp, payload({ cwd: tmp, input: { command: 'npm test' } }));
      assert.equal(varied.decision, null);
      assert.equal(varied.stderr, '', 'varying the approach is progress, not a loop');
      // and the counter really restarted
      const next = run(tmp, payload({ cwd: tmp, input: { command: 'npm test' } }));
      assert.equal(next.decision, null);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  test('separate sessions do not contaminate each other', () => {
    const tmp = mkProject();
    try {
      for (let i = 0; i < 4; i++) run(tmp, payload({ cwd: tmp, session: 'A' }));
      const other = run(tmp, payload({ cwd: tmp, session: 'B' }));
      assert.equal(other.decision, null);
      assert.equal(other.stderr, '', 'session B is on its first call');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
});

describe('guard-no-progress — fails open', () => {
  test('no .planning/ anywhere → silent no-op', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-noplan-'));
    try {
      for (let i = 0; i < 6; i++) {
        const r = run(tmp, payload({ cwd: tmp }));
        assert.equal(r.decision, null, 'must never gate outside a DevFlow project');
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  test('malformed stdin → silent no-op, exit 0', () => {
    const tmp = mkProject();
    try {
      const r = run(tmp, 'not json at all');
      assert.equal(r.decision, null);
      assert.equal(r.status, 0);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  test('corrupt state file is recovered from, not fatal', () => {
    const tmp = mkProject();
    try {
      fs.writeFileSync(path.join(tmp, '.planning', '.progress-guard.json'), '{{{ broken');
      const r = run(tmp, payload({ cwd: tmp }));
      assert.equal(r.status, 0);
      assert.equal(r.decision, null);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  test('DEVFLOW_SKIP_PROGRESS_GUARD=1 disables it entirely', () => {
    const tmp = mkProject();
    try {
      for (let i = 0; i < 6; i++) {
        const r = run(tmp, payload({ cwd: tmp }), { DEVFLOW_SKIP_PROGRESS_GUARD: '1' });
        assert.equal(r.decision, null);
        assert.equal(r.stderr, '');
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  test('bookkeeping tools are ignored', () => {
    const tmp = mkProject();
    try {
      for (const tool of IGNORED_TOOLS) {
        for (let i = 0; i < 6; i++) {
          const r = run(tmp, payload({ cwd: tmp, tool, input: { x: 1 } }));
          assert.equal(r.decision, null, `${tool} must never trip the guard`);
        }
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
});

describe('guard-no-progress — state hygiene', () => {
  test('prune() drops sessions past the TTL and keeps fresh ones', () => {
    const now = Date.now();
    const out = prune({
      fresh: { guard: {}, updated: now - 1000 },
      stale: { guard: {}, updated: now - 25 * 60 * 60 * 1000 },
      junk: null,
    }, now);
    assert.deepEqual(Object.keys(out), ['fresh']);
  });

  test('state file stays a single small JSON object', () => {
    const tmp = mkProject();
    try {
      for (let i = 0; i < 30; i++) run(tmp, payload({ cwd: tmp, input: { command: `c${i}` } }));
      const raw = fs.readFileSync(path.join(tmp, '.planning', '.progress-guard.json'), 'utf8');
      const parsed = JSON.parse(raw);
      assert.equal(typeof parsed, 'object');
      assert.ok(raw.length < 20000, `state file grew to ${raw.length} bytes`);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
});

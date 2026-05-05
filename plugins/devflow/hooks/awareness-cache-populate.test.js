'use strict';
/**
 * TRD 02-06 — Group H: awareness-cache-populate.js hook behavior tests
 * Group R: hooks.json registration tests
 *
 * Test list (TDD Playbook habit 2 — documented before test code written):
 * H1: no-op when no .planning/ in cwd
 * H2: no-op when DEVFLOW_SKIP_AWARENESS_POPULATE=1
 * H3: spawns with detached:true, stdio:'ignore', calls child.unref()
 * H4: hook returns within 100ms (fire-and-forget contract)
 * H5: no spawn when both sections fresh (TTL-respected)
 * H6: peer stale + org fresh → spawns scan-peer --no-fetch only
 * H7: both stale → spawns show --refresh --raw
 * H8: missing CLAUDE_PLUGIN_ROOT falls back to ~/.claude path
 * R1: hooks.json registers awareness-cache-populate as SessionStart hook
 * R2: hooks.json sync-runtime entry preserved
 * R3: hooks.json is valid JSON
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Module under test (created in Task 2 / GREEN phase)
const hookModule = require('./awareness-cache-populate.js');

function tempCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-aw-hook-'));
  return {
    cwd: dir,
    cleanup: () => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    },
  };
}

// ─── Group H: hook behavior ───────────────────────────────────────────────────

test('H1: no-op when no .planning/ in cwd', () => {
  const t = tempCwd();
  try {
    let spawnCalled = false;
    hookModule._main({
      cwd: t.cwd,
      env: {},
      _spawn: () => { spawnCalled = true; return { unref: () => {} }; },
    });
    assert.strictEqual(spawnCalled, false);
  } finally { t.cleanup(); }
});

test('H2: no-op when DEVFLOW_SKIP_AWARENESS_POPULATE=1', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  try {
    let spawnCalled = false;
    hookModule._main({
      cwd: t.cwd,
      env: { DEVFLOW_SKIP_AWARENESS_POPULATE: '1' },
      _spawn: () => { spawnCalled = true; return { unref: () => {} }; },
    });
    assert.strictEqual(spawnCalled, false);
  } finally { t.cleanup(); }
});

test('H3: spawns with detached:true + stdio:"ignore" + calls unref()', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  try {
    const calls = [];
    let unrefCalled = false;
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake/plugin/root' },
      _spawn: (cmd, args, opts) => {
        calls.push({ cmd, args, opts });
        return { unref: () => { unrefCalled = true; } };
      },
    });
    assert.strictEqual(calls.length, 1, 'expected exactly one spawn call');
    assert.strictEqual(calls[0].opts.detached, true, 'detached must be true');
    assert.strictEqual(calls[0].opts.stdio, 'ignore', 'stdio must be "ignore"');
    assert.strictEqual(unrefCalled, true, 'child.unref() must be called');
  } finally { t.cleanup(); }
});

test('H4: hook returns within 100ms wall-time (fire-and-forget contract)', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  try {
    const start = Date.now();
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake' },
      _spawn: () => ({ unref: () => {} }),
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 100, `hook took ${elapsed}ms which is >= 100ms limit`);
  } finally { t.cleanup(); }
});

test('H5: no spawn when both sections fresh (within TTL)', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  // Write fresh cache — both sections fetched just now
  fs.writeFileSync(
    path.join(t.cwd, '.planning', '.awareness-cache.json'),
    JSON.stringify({
      peer: { fetched_at: new Date().toISOString(), branches: [] },
      org:  { fetched_at: new Date().toISOString(), items: [] },
    }, null, 2)
  );
  try {
    let spawnCalled = false;
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake' },
      _spawn: () => { spawnCalled = true; return { unref: () => {} }; },
    });
    assert.strictEqual(spawnCalled, false, 'should not spawn when both sections are fresh');
  } finally { t.cleanup(); }
});

test('H6: peer stale + org fresh → spawns scan-peer --no-fetch only', () => {
  // Trade-off note: --no-fetch skips slow git fetch when only peer is stale.
  // Re-using local refs is still useful (finds pushed branches without blocking
  // session start on a potentially slow remote fetch). Locked per verifier briefing.
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  const oldTs = new Date(Date.now() - 60 * 60_000).toISOString(); // 60 min ago — stale
  fs.writeFileSync(
    path.join(t.cwd, '.planning', '.awareness-cache.json'),
    JSON.stringify({
      peer: { fetched_at: oldTs, branches: [] },
      org:  { fetched_at: new Date().toISOString(), items: [] },
    }, null, 2)
  );
  try {
    const calls = [];
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake' },
      _spawn: (cmd, args, opts) => { calls.push({ cmd, args }); return { unref: () => {} }; },
    });
    assert.strictEqual(calls.length, 1, 'expected exactly one spawn for peer-only refresh');
    const argsStr = calls[0].args.join(' ');
    assert.ok(argsStr.includes('scan-peer'), `expected scan-peer in args: ${argsStr}`);
    assert.ok(argsStr.includes('--no-fetch'), `expected --no-fetch in args: ${argsStr}`);
    assert.ok(!argsStr.includes('scan-org'), `unexpected scan-org in args: ${argsStr}`);
    assert.ok(!argsStr.includes('show'), `unexpected show in args: ${argsStr}`);
  } finally { t.cleanup(); }
});

test('H7: both stale → spawns awareness show --refresh --raw', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  const oldTs = new Date(Date.now() - 60 * 60_000).toISOString();
  fs.writeFileSync(
    path.join(t.cwd, '.planning', '.awareness-cache.json'),
    JSON.stringify({
      peer: { fetched_at: oldTs, branches: [] },
      org:  { fetched_at: oldTs, items: [] },
    }, null, 2)
  );
  try {
    const calls = [];
    hookModule._main({
      cwd: t.cwd,
      env: { CLAUDE_PLUGIN_ROOT: '/fake' },
      _spawn: (cmd, args, opts) => { calls.push({ cmd, args }); return { unref: () => {} }; },
    });
    assert.strictEqual(calls.length, 1, 'expected exactly one spawn for full refresh');
    const argsStr = calls[0].args.join(' ');
    assert.ok(argsStr.includes('show'), `expected show in args: ${argsStr}`);
    assert.ok(argsStr.includes('--refresh'), `expected --refresh in args: ${argsStr}`);
  } finally { t.cleanup(); }
});

test('H8: missing CLAUDE_PLUGIN_ROOT falls back to ~/.claude/devflow/bin path', () => {
  const t = tempCwd();
  fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
  try {
    const calls = [];
    hookModule._main({
      cwd: t.cwd,
      env: {}, // no CLAUDE_PLUGIN_ROOT
      _spawn: (cmd, args) => { calls.push({ cmd, args }); return { unref: () => {} }; },
    });
    assert.strictEqual(calls.length, 1, 'should still spawn even without CLAUDE_PLUGIN_ROOT');
    // Spawned df-tools path should reference .claude home path
    assert.match(calls[0].args[0], /\.claude/, `expected .claude in path: ${calls[0].args[0]}`);
  } finally { t.cleanup(); }
});

// ─── Group R: hooks.json registration ────────────────────────────────────────

test('R1: hooks.json registers awareness-cache-populate as SessionStart hook', () => {
  const hooksJsonPath = path.resolve(__dirname, 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) {
    // Skip — hooks.json not found at expected path
    return;
  }
  const j = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8'));
  const ss = j.hooks && j.hooks.SessionStart;
  assert.ok(Array.isArray(ss), 'SessionStart must be an array in hooks.json');
  const found = ss.some(g => (g.hooks || []).some(h =>
    (h.command || '').includes('awareness-cache-populate')
  ));
  assert.ok(found, 'awareness-cache-populate must be registered as SessionStart hook');
});

test('R2: hooks.json sync-runtime entry preserved', () => {
  const hooksJsonPath = path.resolve(__dirname, 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) return;
  const content = fs.readFileSync(hooksJsonPath, 'utf-8');
  assert.match(content, /sync-runtime\.js/, 'sync-runtime.js must still be present in hooks.json');
});

test('R3: hooks.json is valid JSON', () => {
  const hooksJsonPath = path.resolve(__dirname, 'hooks.json');
  if (!fs.existsSync(hooksJsonPath)) return;
  assert.doesNotThrow(
    () => JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8')),
    'hooks.json must be valid JSON'
  );
});

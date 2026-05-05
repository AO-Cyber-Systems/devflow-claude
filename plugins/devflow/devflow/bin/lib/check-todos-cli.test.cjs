'use strict';

// TEST LIST — TRD 06-04 CLI tests (REPLACES TRD 06-01 CLI1-CLI4 scaffold tests)
//
// Group CLI2 — check-todos-cli full flag wiring: CLI2-1 through CLI2-8
//
// CLI2-1: df-tools check-todos (default, no flags) → exit 0, stdout starts with '# 📋 DevFlow Standup —'
// CLI2-2: df-tools check-todos --raw → exit 0, stdout is valid JSON with 6-key aggregate shape
// CLI2-3: df-tools check-todos --all → exit 0, Markdown rendered (no truncation footer for small fixture)
// CLI2-4: df-tools check-todos --lane now → only '## ⚡ Now' section in output
// CLI2-5: df-tools check-todos --lane invalid → exit 1, error mentions valid lanes
// CLI2-6: df-tools check-todos --refresh → exit 0, JSON (via --raw) has cached:false
// CLI2-7: df-tools check-todos --raw --lane blocked → JSON result.blocked populated; markdown NOT emitted
// CLI2-8: _parseFlags(['--all', '--refresh', '--lane', 'now', '--raw']) → { all: true, refresh: true, lane: 'now', raw: true }

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const { buildCheckTodosFixtures } = require('./__fixtures__/awareness-fixtures.cjs');
const { _parseFlags } = require('./check-todos-cli.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

// ─── Group CLI2 — full flag wiring tests (TRD 06-04) ────────────────────────

describe('check-todos-cli: Group CLI2 — full flag wiring (TRD 06-04)', () => {
  it('CLI2-1: df-tools check-todos (default) → exit 0, stdout starts with # 📋 DevFlow Standup —', () => {
    const fixture = buildCheckTodosFixtures();
    const r = spawnSync('node', [DF_TOOLS, 'check-todos'], {
      encoding: 'utf-8',
      cwd: fixture.projectRoot,
      env: Object.assign({}, process.env, { HOME: process.env.HOME }),
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.startsWith('# 📋 DevFlow Standup —'),
      `expected Markdown output starting with heading; got: ${r.stdout.slice(0, 200)}`,
    );
    fixture.cleanup();
  });

  it('CLI2-2: df-tools check-todos --raw → exit 0, valid JSON with 6-key aggregate shape', () => {
    const fixture = buildCheckTodosFixtures();
    const r = spawnSync('node', [DF_TOOLS, 'check-todos', '--raw'], {
      encoding: 'utf-8',
      cwd: fixture.projectRoot,
      env: Object.assign({}, process.env, { HOME: process.env.HOME }),
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch (e) {
      assert.fail(`stdout not valid JSON: ${r.stdout.slice(0, 200)}`);
    }
    for (const key of ['blocked', 'now', 'soon', 'ideas', 'warnings', 'cached']) {
      assert.ok(key in parsed, `expected key '${key}' in aggregate result`);
    }
    assert.ok(Array.isArray(parsed.blocked), 'blocked is array');
    assert.ok(Array.isArray(parsed.now), 'now is array');
    assert.ok(Array.isArray(parsed.soon), 'soon is array');
    assert.ok(Array.isArray(parsed.ideas), 'ideas is array');
    assert.ok(Array.isArray(parsed.warnings), 'warnings is array');
    assert.strictEqual(typeof parsed.cached, 'boolean', 'cached is boolean');
    fixture.cleanup();
  });

  it('CLI2-3: df-tools check-todos --all → exit 0, Markdown rendered (no truncation footer for small fixture)', () => {
    const fixture = buildCheckTodosFixtures();
    const r = spawnSync('node', [DF_TOOLS, 'check-todos', '--all'], {
      encoding: 'utf-8',
      cwd: fixture.projectRoot,
      env: Object.assign({}, process.env, { HOME: process.env.HOME }),
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // Should still render Markdown (not JSON)
    assert.ok(
      r.stdout.includes('# 📋 DevFlow Standup —'),
      `expected Markdown output; got: ${r.stdout.slice(0, 200)}`,
    );
    // Empty fixture has no entries, so no truncation footer
    assert.ok(
      !r.stdout.includes('--all for full list'),
      `should not have truncation footer for empty fixture; got: ${r.stdout.slice(0, 200)}`,
    );
    fixture.cleanup();
  });

  it('CLI2-4: df-tools check-todos --lane now → only ## ⚡ Now section in output', () => {
    const fixture = buildCheckTodosFixtures();
    const r = spawnSync('node', [DF_TOOLS, 'check-todos', '--lane', 'now'], {
      encoding: 'utf-8',
      cwd: fixture.projectRoot,
      env: Object.assign({}, process.env, { HOME: process.env.HOME }),
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('## ⚡ Now'), 'expected Now section in output');
    // Other lane sections should NOT appear when filtering
    assert.ok(!r.stdout.includes('## 🔥 Blocked'), 'Blocked section should be absent with --lane now');
    assert.ok(!r.stdout.includes('## 📋 Soon'), 'Soon section should be absent with --lane now');
    assert.ok(!r.stdout.includes('## 💡 Ideas'), 'Ideas section should be absent with --lane now');
    fixture.cleanup();
  });

  it('CLI2-5: df-tools check-todos --lane invalid → exit 1, error mentions valid lanes', () => {
    const fixture = buildCheckTodosFixtures();
    const r = spawnSync('node', [DF_TOOLS, 'check-todos', '--lane', 'unknown-lane'], {
      encoding: 'utf-8',
      cwd: fixture.projectRoot,
      env: Object.assign({}, process.env),
    });
    assert.strictEqual(r.status, 1, `expected exit 1; stderr: ${r.stderr}`);
    const combined = r.stderr + r.stdout;
    assert.ok(
      combined.includes('blocked') && combined.includes('now') && combined.includes('soon') && combined.includes('ideas'),
      `expected valid lane names in error output; got: ${combined.slice(0, 200)}`,
    );
    fixture.cleanup();
  });

  it('CLI2-6: df-tools check-todos --refresh --raw → exit 0, JSON has cached:false', () => {
    const fixture = buildCheckTodosFixtures();
    const r = spawnSync('node', [DF_TOOLS, 'check-todos', '--refresh', '--raw'], {
      encoding: 'utf-8',
      cwd: fixture.projectRoot,
      env: Object.assign({}, process.env, { HOME: process.env.HOME }),
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch (e) {
      assert.fail(`stdout not valid JSON: ${r.stdout.slice(0, 200)}`);
    }
    assert.strictEqual(parsed.cached, false, 'cached should be false when --refresh is used');
    fixture.cleanup();
  });

  it('CLI2-7: df-tools check-todos --raw --lane blocked → JSON shape with blocked array; no Markdown', () => {
    // Note: --raw wins over default markdown render; --lane is passed through to aggregate opts
    // df-tools.cjs strips --raw before passing args to cmdCheckTodosRoute,
    // but the raw=true boolean is passed as the third arg. --lane stays in args.
    const fixture = buildCheckTodosFixtures();
    const r = spawnSync('node', [DF_TOOLS, 'check-todos', '--lane', 'blocked', '--raw'], {
      encoding: 'utf-8',
      cwd: fixture.projectRoot,
      env: Object.assign({}, process.env, { HOME: process.env.HOME }),
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    // When --raw, output is full JSON aggregate (not markdown)
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch (e) {
      assert.fail(`expected JSON with --raw; got: ${r.stdout.slice(0, 200)}`);
    }
    assert.ok(Array.isArray(parsed.blocked), 'blocked is array in raw output');
    // Not markdown
    assert.ok(!r.stdout.startsWith('#'), 'should not start with Markdown heading when --raw');
    fixture.cleanup();
  });

  it('CLI2-8: _parseFlags all flags → correct parsed flags object', () => {
    const flags = _parseFlags(['--all', '--refresh', '--lane', 'now', '--raw']);
    assert.strictEqual(flags.all, true, 'all should be true');
    assert.strictEqual(flags.refresh, true, 'refresh should be true');
    assert.strictEqual(flags.lane, 'now', 'lane should be now');
    assert.strictEqual(flags.raw, true, 'raw should be true');
  });

  it('CLI2-8b: _parseFlags with --raw flag only', () => {
    const flags = _parseFlags(['--raw']);
    assert.strictEqual(flags.raw, true);
  });

  it('CLI2-8c: _parseFlags ignores unknown positional args', () => {
    const flags = _parseFlags(['positional', '--refresh']);
    assert.strictEqual(flags.refresh, true);
    assert.strictEqual(flags.positional, undefined);
  });
});

'use strict';

// TEST LIST — TRD 06-01 CLI scaffold tests
//
// Group CLI — check-todos-cli scaffold: CLI1-CLI4
//
// CLI1: df-tools check-todos --raw → exit 0, valid JSON with 6-key aggregate shape
// CLI2: df-tools check-todos --lane unknown → exit 1, error lists valid lanes
// CLI3: df-tools check-todos --refresh → exit 0, JSON has cached:false
// CLI4: _parseFlags unit test — parses --all, --refresh, --lane correctly

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const { buildCheckTodosFixtures } = require('./__fixtures__/awareness-fixtures.cjs');
const { _parseFlags } = require('./check-todos-cli.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

// ─── Group CLI — check-todos-cli scaffold ────────────────────────────────────

describe('check-todos-cli: Group CLI — scaffold tests', () => {
  it('CLI1: df-tools check-todos --raw → exit 0, valid JSON with 6-key shape', () => {
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
    assert.ok(Array.isArray(parsed.blocked), 'blocked is array');
    assert.ok(Array.isArray(parsed.now), 'now is array');
    assert.ok(Array.isArray(parsed.soon), 'soon is array');
    assert.ok(Array.isArray(parsed.ideas), 'ideas is array');
    assert.ok(Array.isArray(parsed.warnings), 'warnings is array');
    assert.strictEqual(typeof parsed.cached, 'boolean', 'cached is boolean');
    fixture.cleanup();
  });

  it('CLI2: df-tools check-todos --lane unknown → exit 1, error lists valid lanes', () => {
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

  it('CLI3: df-tools check-todos --refresh → exit 0, JSON has cached:false (TRD 06-01)', () => {
    const fixture = buildCheckTodosFixtures();
    const r = spawnSync('node', [DF_TOOLS, 'check-todos', '--refresh'], {
      encoding: 'utf-8',
      cwd: fixture.projectRoot,
      env: Object.assign({}, process.env),
    });
    assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch (e) {
      assert.fail(`stdout not valid JSON: ${r.stdout.slice(0, 200)}`);
    }
    assert.strictEqual(parsed.cached, false, 'cached should be false in TRD 06-01');
    fixture.cleanup();
  });

  it('CLI4: _parseFlags parses --all, --refresh, --lane now correctly', () => {
    const flags = _parseFlags(['--all', '--refresh', '--lane', 'now']);
    assert.strictEqual(flags.all, true);
    assert.strictEqual(flags.refresh, true);
    assert.strictEqual(flags.lane, 'now');
  });

  it('CLI4b: _parseFlags with --raw flag', () => {
    const flags = _parseFlags(['--raw']);
    assert.strictEqual(flags.raw, true);
  });

  it('CLI4c: _parseFlags ignores unknown positional args', () => {
    const flags = _parseFlags(['positional', '--refresh']);
    assert.strictEqual(flags.refresh, true);
    assert.strictEqual(flags.positional, undefined);
  });
});

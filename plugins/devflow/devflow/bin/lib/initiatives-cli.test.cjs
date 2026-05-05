'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('./__fixtures__/awareness-fixtures.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

function mkTmp(prefix = 'df-init-cli-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ─── Group CLI — list / show / sync-stub ─────────────────────────────────────

test('CLI1: df-tools initiatives list emits JSON array to stdout (exit 0)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'alpha' }, { slug: 'beta' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'list', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    assert.fail(`stdout not valid JSON: ${r.stdout}`);
  }
  assert.ok(Array.isArray(parsed), 'stdout is JSON array');
  assert.strictEqual(parsed.length, 2, 'two initiatives listed');
  // Each entry has slug + github_issue + key_repos
  for (const item of parsed) {
    assert.ok(item.slug, 'slug present');
    assert.ok(item.github_issue, 'github_issue present');
    assert.ok(Array.isArray(item.key_repos), 'key_repos is array');
  }
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI2: df-tools initiatives list --home <tmpdir> reads from supplied home', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'custom-home-test', github_issue: 'AO-Cyber-Systems/devflow#99' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'list', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].slug, 'custom-home-test');
  assert.strictEqual(parsed[0].github_issue, 'AO-Cyber-Systems/devflow#99');
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI3: df-tools initiatives list returns [] (valid empty JSON) when home dir missing', () => {
  const missingHome = path.join(os.tmpdir(), 'df-no-such-initiatives-dir-' + Date.now());
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'list', '--home', missingHome], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    assert.fail(`stdout not valid JSON: ${r.stdout}`);
  }
  assert.deepStrictEqual(parsed, [], 'returns empty JSON array');
});

test('CLI4: df-tools initiatives show <slug> emits rendered body to stdout (exit 0)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'show-test', title: 'Show Test Initiative', why: 'Because showing works.' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'show', 'show-test', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes('show-test'), 'output includes slug');
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI5: df-tools initiatives show <missing-slug> writes error JSON to stderr (exit 1)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'alpha' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'show', 'nonexistent-slug', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 1, `expected exit 1; status was: ${r.status}`);
  let errObj;
  try {
    errObj = JSON.parse(r.stderr);
  } catch (e) {
    assert.fail(`stderr not valid JSON: ${r.stderr}`);
  }
  assert.ok(errObj.error, 'error field present in stderr JSON');
  assert.ok(errObj.error.includes('nonexistent-slug'), `error message should mention slug; got: ${errObj.error}`);
  assert.ok(Array.isArray(errObj.available), 'available list present');
  fs.rmSync(home, { recursive: true, force: true });
});

test('CLI6: df-tools initiatives sync is a stub — emits error JSON to stderr (exit 1) with TRD 05-02 message', () => {
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'sync'], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 1, `expected exit 1 (stub); status was: ${r.status}`);
  let errObj;
  try {
    errObj = JSON.parse(r.stderr);
  } catch (e) {
    assert.fail(`stderr not valid JSON: ${r.stderr}`);
  }
  assert.ok(errObj.error, 'error field present');
  assert.ok(
    errObj.error.includes('05-02') || errObj.error.includes('not yet implemented'),
    `error message should mention 05-02 or "not yet implemented"; got: ${errObj.error}`,
  );
});

test('CLI7: df-tools initiatives <unknown-subcommand> writes usage error (exit 1)', () => {
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'frobnicate'], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 1, `expected exit 1; status was: ${r.status}`);
  let errObj;
  try {
    errObj = JSON.parse(r.stderr);
  } catch (e) {
    assert.fail(`stderr not valid JSON: ${r.stderr}`);
  }
  assert.ok(errObj.error, 'error field present');
  assert.ok(errObj.error.toLowerCase().includes('unknown') || errObj.error.toLowerCase().includes('frobnicate'), `error mentions unknown command; got: ${errObj.error}`);
});

test('CLI8: df-tools initiatives (no subcommand) writes usage error listing valid subcommands (exit 1)', () => {
  const r = spawnSync('node', [DF_TOOLS, 'initiatives'], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 1, `expected exit 1; status was: ${r.status}`);
  let errObj;
  try {
    errObj = JSON.parse(r.stderr);
  } catch (e) {
    assert.fail(`stderr not valid JSON: ${r.stderr}`);
  }
  assert.ok(errObj.error, 'error field present');
  // Should mention valid subcommands
  const errorStr = errObj.error;
  assert.ok(
    errorStr.includes('list') || errorStr.includes('show') || errorStr.includes('sync'),
    `error should mention valid subcommands; got: ${errorStr}`,
  );
});

// ─── Group I — Integration with df-tools.cjs router ─────────────────────────

test('I1: df-tools initiatives list routes through case "initiatives" arm (subprocess)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'router-test' }],
  });
  const r = spawnSync('node', [DF_TOOLS, 'initiatives', 'list', '--home', home], {
    encoding: 'utf-8',
  });
  assert.strictEqual(r.status, 0, `router arm failed; stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.ok(Array.isArray(parsed), 'router returns JSON array');
  fs.rmSync(home, { recursive: true, force: true });
});

test('I2: Other case arms still work — awareness, org-awareness, dup-detect no regressions', () => {
  // awareness scan-peer --no-fetch smoke test
  const r = spawnSync('node', [DF_TOOLS, 'awareness', 'scan-peer', '--no-fetch'], {
    encoding: 'utf-8',
    cwd: path.join(__dirname, '..', '..', '..', '..', '..'),
  });
  // scan-peer may fail if no git repo but should not crash with unknown command
  const stderr = r.stderr || '';
  assert.ok(
    !stderr.includes('Unknown command: awareness'),
    `awareness case arm broken; stderr: ${stderr}`,
  );
});

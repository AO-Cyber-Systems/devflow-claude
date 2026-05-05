'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');

// ─── Group CLI — org-awareness-cli.cjs subcommand wiring ─────────────────────

test('CLI1 — scan-siblings returns JSON to stdout with exit 0', () => {
  const r = spawnSync('node', [dfTools, 'org-awareness', 'scan-siblings', '03', '--raw'], {
    encoding: 'utf-8',
    cwd: path.resolve(__dirname, '..', '..', '..', '..', '..', '..'),
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout); }, `stdout should be valid JSON, got: ${r.stdout}`);
  assert.ok('matches' in parsed, 'result should have matches field');
  assert.ok('warnings' in parsed, 'result should have warnings field');
  assert.ok('scanned_repos' in parsed, 'result should have scanned_repos field');
});

test('CLI2 — scan-siblings with --raw flag returns same parseable JSON', () => {
  const r = spawnSync('node', [dfTools, 'org-awareness', 'scan-siblings', '03', '--raw'], {
    encoding: 'utf-8',
    cwd: path.resolve(__dirname, '..', '..', '..', '..', '..', '..'),
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.ok(Array.isArray(parsed.matches));
});

test('CLI3 — no subcommand prints help to stderr + exit 1', () => {
  const r = spawnSync('node', [dfTools, 'org-awareness'], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
  assert.match(r.stderr, /scan-siblings|Usage/i, `expected help text in stderr, got: ${r.stderr}`);
});

test('CLI4 — --help prints help to stderr + exit 0', () => {
  const r = spawnSync('node', [dfTools, 'org-awareness', '--help'], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}`);
  assert.match(r.stderr, /scan-siblings|Usage/i, `expected help text in stderr, got: ${r.stderr}`);
});

test('CLI5 — scan-libs returns placeholder error with exit 1 (TRD 03-02 stub)', () => {
  const r = spawnSync('node', [dfTools, 'org-awareness', 'scan-libs', '03'], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  assert.strictEqual(r.status, 1, `expected exit 1 for unimplemented command, got ${r.status}`);
  assert.match(r.stderr, /not yet implemented|TRD 03-02/i,
    `expected not-implemented message in stderr, got: ${r.stderr}`);
});

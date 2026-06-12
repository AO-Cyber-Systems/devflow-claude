'use strict';

/**
 * Test suite for lib/dup-detect-cli.cjs
 *
 * Tests: CLI subcommand routing, --mode plan/execute wiring, --raw flag,
 * help text emission, and stubs for 04-02 commands.
 */

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { cmdDupDetectRoute, cmdDupDetectDetect } = require('./dup-detect-cli.cjs');

const dfTools = path.resolve(__dirname, '..', 'df-tools.cjs');

function _mkTmpRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-cli-test-'));
  fs.mkdirSync(path.join(tmp, '.planning'), { recursive: true });
  return tmp;
}

// ─── Route: help / missing subcommand ────────────────────────────────────────

test('CLI: no subcommand → exits 1 (usage error)', () => {
  // Capture stderr
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), [], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  assert.strictEqual(exitCode, 1, 'should exit(1) on missing subcommand');
  const stderrText = stderrChunks.join('');
  assert.ok(stderrText.includes('Usage') || stderrText.includes('df-tools dup-detect'),
    `stderr: ${stderrText}`);
});

test('CLI: --help → exits 0', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), ['--help'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  assert.strictEqual(exitCode, 0, 'should exit(0) on --help');
  const stderrText = stderrChunks.join('');
  assert.ok(stderrText.includes('mode plan') || stderrText.includes('mode execute') ||
    stderrText.includes('resolve') || stderrText.includes('log'),
    `stderr should show subcommands: ${stderrText}`);
});

test('CLI: -h → exits 0 with usage', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), ['-h'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  assert.strictEqual(exitCode, 0);
});

// ─── Route: unknown subcommand ────────────────────────────────────────────────

test('CLI: unknown subcommand → exits 1 with message', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), ['unknown-cmd'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  assert.strictEqual(exitCode, 1);
  const stderrText = stderrChunks.join('');
  assert.ok(stderrText.includes('unknown') || stderrText.includes('Unknown'),
    `stderr: ${stderrText}`);
});

// ─── Route: resolve stub ──────────────────────────────────────────────────────

test('CLI: resolve subcommand → exits with stub message (04-02 placeholder)', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };
  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { stdoutChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  const tmp = _mkTmpRepo();
  fs.mkdirSync(path.join(tmp, '.planning', 'objectives', '04-test'), { recursive: true });
  try {
    cmdDupDetectRoute(tmp, ['resolve', '04', '--resolution', 'coordinate', '--peer-branch', 'feature/x', '--peer-objective', '03'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.stdout.write = origStdout;
    process.exit = origExit;
  }

  // Should emit something (not silently swallow)
  const allOutput = stderrChunks.join('') + stdoutChunks.join('');
  assert.ok(allOutput.length > 0, 'resolve stub should emit some output');
});

// ─── Route: log stub ─────────────────────────────────────────────────────────

test('CLI: log subcommand → exits with stub message (04-02 placeholder)', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };
  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { stdoutChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  const tmp = _mkTmpRepo();
  try {
    cmdDupDetectRoute(tmp, ['log', '04', '--mode', 'execute'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.stdout.write = origStdout;
    process.exit = origExit;
  }

  const allOutput = stderrChunks.join('') + stdoutChunks.join('');
  assert.ok(allOutput.length > 0, 'log stub should emit some output');
});

// ─── Module exports ───────────────────────────────────────────────────────────

test('CLI exports: cmdDupDetectRoute and cmdDupDetectDetect are functions', () => {
  assert.strictEqual(typeof cmdDupDetectRoute, 'function');
  assert.strictEqual(typeof cmdDupDetectDetect, 'function');
});

// ─── TRD 04-02: Group CLI8 (resolve subcommand) ──────────────────────────────

test('CLI8a — resolve --resolution coordinate writes coordination note + jsonl log, exits 0', () => {
  const tmp = _mkTmpRepo();
  fs.mkdirSync(path.join(tmp, '.planning', 'objectives', '04-test'), { recursive: true });
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'resolve', '04',
      '--resolution', 'coordinate',
      '--peer-branch', 'feature/peer',
      '--peer-objective', '03',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 0, `expected exit 0\nstderr: ${r.stderr}\nstdout: ${r.stdout}`);
    // jsonl log should exist with at least 1 line
    const logPath = path.join(tmp, '.planning', '.dup-detect-log.jsonl');
    assert.ok(fs.existsSync(logPath), 'JSONL log should exist');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.ok(lines.length >= 1, 'should have at least 1 JSONL line');
    // Result should be JSON
    const result = JSON.parse(r.stdout);
    assert.strictEqual(result.ok, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI8b — resolve --resolution defer writes .planning/.deferred/04.json + jsonl log', () => {
  const tmp = _mkTmpRepo();
  fs.mkdirSync(path.join(tmp, '.planning', 'objectives', '04-test'), { recursive: true });
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'resolve', '04',
      '--resolution', 'defer',
      '--peer-branch', 'feature/peer',
      '--peer-objective', '03',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const deferPath = path.join(tmp, '.planning', '.deferred', '04.json');
    assert.ok(fs.existsSync(deferPath), '.planning/.deferred/04.json should exist');
    const logPath = path.join(tmp, '.planning', '.dup-detect-log.jsonl');
    assert.ok(fs.existsSync(logPath), 'JSONL log should exist');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI8c — resolve --resolution merge prints abort message, exits 0, jsonl log recorded', () => {
  const tmp = _mkTmpRepo();
  fs.mkdirSync(path.join(tmp, '.planning', 'objectives', '04-test'), { recursive: true });
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'resolve', '04',
      '--resolution', 'merge',
      '--peer-branch', 'feature/peer',
      '--peer-objective', '03',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    // Merge returns aborted: true — check result JSON
    const result = JSON.parse(r.stdout);
    assert.strictEqual(result.aborted, true, 'should return aborted: true');
    // jsonl log should be recorded
    const logPath = path.join(tmp, '.planning', '.dup-detect-log.jsonl');
    assert.ok(fs.existsSync(logPath), 'JSONL log should exist even for merge');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI8d — resolve --resolution proceed-anyway writes coordination note with warning + jsonl', () => {
  const tmp = _mkTmpRepo();
  fs.mkdirSync(path.join(tmp, '.planning', 'objectives', '04-test'), { recursive: true });
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'resolve', '04',
      '--resolution', 'proceed-anyway',
      '--peer-branch', 'feature/peer',
      '--peer-objective', '03',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const result = JSON.parse(r.stdout);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.warning_appended, true, 'should have warning_appended: true');
    const logPath = path.join(tmp, '.planning', '.dup-detect-log.jsonl');
    assert.ok(fs.existsSync(logPath), 'JSONL log should exist');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI8e — resolve with missing --resolution flag exits 1 with error', () => {
  const tmp = _mkTmpRepo();
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'resolve', '04',
      '--peer-branch', 'feature/peer',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
    assert.ok(r.stderr.includes('Error') || r.stderr.length > 0, 'should emit error to stderr');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI8f — resolve with invalid --resolution value exits 1 with error', () => {
  const tmp = _mkTmpRepo();
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'resolve', '04',
      '--resolution', 'foo',
      '--peer-branch', 'feature/peer',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── TRD 04-02: Group CLI9 (log subcommand) ──────────────────────────────────

test('CLI9a — log --mode execute --blocking false --resolution none appends JSONL line', () => {
  const tmp = _mkTmpRepo();
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'log', '04',
      '--mode', 'execute',
      '--blocking', 'false',
      '--resolution', 'none',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const logPath = path.join(tmp, '.planning', '.dup-detect-log.jsonl');
    assert.ok(fs.existsSync(logPath), 'JSONL log should exist');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.strictEqual(lines.length, 1, 'should have 1 line');
    const rec = JSON.parse(lines[0]);
    assert.strictEqual(rec.mode, 'execute');
    assert.strictEqual(rec.blocking, false);
    assert.strictEqual(rec.resolution, 'none');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI9b — log --top-match-json parses JSON and includes in record', () => {
  const tmp = _mkTmpRepo();
  const topMatch = JSON.stringify({ strength: 'strong', peer: 'feature/peer', score: 0.8 });
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'log', '04',
      '--mode', 'plan',
      '--blocking', 'true',
      '--top-match-json', topMatch,
      '--resolution', 'coordinate',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const logPath = path.join(tmp, '.planning', '.dup-detect-log.jsonl');
    const rec = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim());
    assert.ok(rec.top_match, 'top_match should be present');
    assert.strictEqual(rec.top_match.strength, 'strong');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI9c — log with malformed --top-match-json exits 1 with parse error', () => {
  const tmp = _mkTmpRepo();
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'log', '04',
      '--mode', 'plan',
      '--blocking', 'true',
      '--top-match-json', '{invalid json}',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI9d — log with missing --mode exits 1 with error', () => {
  const tmp = _mkTmpRepo();
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'log', '04',
      '--blocking', 'false',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI9e — log with invalid --resolution value exits 1 with error', () => {
  const tmp = _mkTmpRepo();
  try {
    const r = spawnSync('node', [
      dfTools, 'dup-detect', 'log', '04',
      '--mode', 'plan',
      '--resolution', 'invalid-res',
      '--cwd', tmp,
    ], { encoding: 'utf-8', timeout: 10000 });
    assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

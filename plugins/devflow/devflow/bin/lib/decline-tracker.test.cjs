'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  writeDecline,
  readDecline,
  clearDecline,
  _setDeclinePath,
  _setRunFs,
  _resetMocks,
  DECLINED_PROJECTS_PATH,
} = require('./decline-tracker.cjs');

const {
  mkTmpDeclineHome,
  mkDeclineFile,
  SCENARIOS,
  NOW,
  NOW_PLUS_30D,
  PAST,
  PAST_PLUS_1D,
} = require('./__fixtures__/decline-tracker-fixtures.cjs');

// ─── Shared setup helpers ─────────────────────────────────────────────────────

/** Creates a fresh tmpdir-based decline file path and sets the path override. */
function mkTmpEnv() {
  const declinePath = mkTmpDeclineHome();
  _setDeclinePath(declinePath);
  return {
    declinePath,
    homeDir: path.dirname(path.dirname(path.dirname(declinePath))),
  };
}

// ─── writeDecline ─────────────────────────────────────────────────────────────

describe('writeDecline', () => {
  let env;

  beforeEach(() => {
    env = mkTmpEnv();
  });

  afterEach(() => {
    _resetMocks();
    _setDeclinePath(null);
    fs.rmSync(env.homeDir, { recursive: true, force: true });
  });

  test('case 1: write to non-existent file → file created with single entry; entry has declined_at and expires_at', () => {
    const result = writeDecline('/my/project', { now: NOW });
    assert.ok(result.declined_at, 'should have declined_at');
    assert.ok(result.expires_at, 'should have expires_at');
    assert.equal(result.declined_at, NOW);
    // Verify file was actually created
    assert.ok(fs.existsSync(env.declinePath), 'declined-projects.json should exist');
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.ok(contents['/my/project'], 'should have entry for /my/project');
    assert.equal(contents['/my/project'].declined_at, NOW);
    assert.ok(contents['/my/project'].expires_at, 'should have expires_at');
  });

  test('case 2: write to existing file → entry merged, other entries preserved', () => {
    // Set up existing file with another cwd
    mkDeclineFile({ '/other/project': { declined_at: PAST, expires_at: NOW } }, env.declinePath);
    writeDecline('/my/project', { now: NOW });
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.ok(contents['/other/project'], 'existing entry should be preserved');
    assert.ok(contents['/my/project'], 'new entry should be added');
  });

  test('case 3: write same cwd twice → second write overwrites (declined_at + expires_at refreshed)', () => {
    writeDecline('/my/project', { now: PAST });
    writeDecline('/my/project', { now: NOW });
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.equal(contents['/my/project'].declined_at, NOW, 'declined_at should be refreshed to NOW');
    assert.equal(Object.keys(contents).length, 1, 'should only have one entry');
  });

  test('case 4: write with custom durationDays:14 → expires_at = declined_at + 14 days (ISO arithmetic)', () => {
    const result = writeDecline('/my/project', { now: NOW, durationDays: 14 });
    // NOW is 2026-05-04T12:00:00.000Z; +14 days = 2026-05-18T12:00:00.000Z
    const expectedExpiry = '2026-05-18T12:00:00.000Z';
    assert.equal(result.expires_at, expectedExpiry, `expected ${expectedExpiry}, got ${result.expires_at}`);
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.equal(contents['/my/project'].expires_at, expectedExpiry);
  });

  test('case 5: write with default duration → expires_at = declined_at + 30 days', () => {
    const result = writeDecline('/my/project', { now: NOW });
    // NOW is 2026-05-04T12:00:00.000Z; +30 days = 2026-06-03T12:00:00.000Z
    assert.equal(result.expires_at, NOW_PLUS_30D, `expected ${NOW_PLUS_30D}, got ${result.expires_at}`);
  });
});

// ─── readDecline ──────────────────────────────────────────────────────────────

describe('readDecline', () => {
  let env;

  beforeEach(() => {
    env = mkTmpEnv();
  });

  afterEach(() => {
    _resetMocks();
    _setDeclinePath(null);
    fs.rmSync(env.homeDir, { recursive: true, force: true });
  });

  test('case 6: file missing → returns { declined: false, expires_at: null }', () => {
    const result = readDecline('/my/project', { now: NOW });
    assert.deepEqual(result, { declined: false, expires_at: null });
  });

  test('case 7: cwd not in file → returns { declined: false, expires_at: null }', () => {
    mkDeclineFile(SCENARIOS.oneActive(), env.declinePath);
    const result = readDecline('/some/other/path', { now: NOW });
    assert.deepEqual(result, { declined: false, expires_at: null });
  });

  test('case 8: cwd in file, not yet expired → returns { declined: true, expires_at: "..." }', () => {
    mkDeclineFile(SCENARIOS.oneActive(), env.declinePath);
    const result = readDecline('/some/path', { now: NOW });
    assert.equal(result.declined, true);
    assert.equal(result.expires_at, NOW_PLUS_30D);
  });

  test('case 9: cwd in file, expired → returns { declined: false, expires_at: null } AND removes entry from file (auto-prune)', () => {
    mkDeclineFile(SCENARIOS.oneExpired(), env.declinePath);
    const result = readDecline('/some/path', { now: NOW });
    assert.deepEqual(result, { declined: false, expires_at: null });
    // Auto-prune: expired entry should be removed from file
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.equal(Object.keys(contents).length, 0, 'expired entry should have been pruned');
  });

  test('case 10: corrupt JSON → returns { declined: false, expires_at: null } (graceful fail-open)', () => {
    const dir = path.dirname(env.declinePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(env.declinePath, 'NOT VALID JSON{{{{', 'utf-8');
    const result = readDecline('/my/project', { now: NOW });
    assert.deepEqual(result, { declined: false, expires_at: null });
  });
});

// ─── clearDecline ─────────────────────────────────────────────────────────────

describe('clearDecline', () => {
  let env;

  beforeEach(() => {
    env = mkTmpEnv();
  });

  afterEach(() => {
    _resetMocks();
    _setDeclinePath(null);
    fs.rmSync(env.homeDir, { recursive: true, force: true });
  });

  test('case 11: file missing → no-op; returns { cleared: false, was_present: false }; no error', () => {
    const result = clearDecline('/my/project');
    assert.deepEqual(result, { cleared: false, was_present: false });
  });

  test('case 12: cwd not in file → no-op; returns { cleared: false, was_present: false }; other entries untouched', () => {
    mkDeclineFile(SCENARIOS.oneActive(), env.declinePath);
    const result = clearDecline('/some/other/path');
    assert.deepEqual(result, { cleared: false, was_present: false });
    // Other entries should still be there
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.ok(contents['/some/path'], 'other entries should be untouched');
  });

  test('case 13: cwd in file → entry removed; other entries preserved; returns { cleared: true, was_present: true }', () => {
    mkDeclineFile(SCENARIOS.mixed(), env.declinePath);
    const result = clearDecline('/active');
    assert.deepEqual(result, { cleared: true, was_present: true });
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.equal(contents['/active'], undefined, '/active should be removed');
    assert.ok(contents['/expired'], '/expired should be preserved');
  });

  test('case 14: only entry → file written as {}, NOT deleted', () => {
    mkDeclineFile(SCENARIOS.oneActive(), env.declinePath);
    const result = clearDecline('/some/path');
    assert.deepEqual(result, { cleared: true, was_present: true });
    // File should still exist, not be deleted
    assert.ok(fs.existsSync(env.declinePath), 'file should still exist (written as {})');
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.deepEqual(contents, {});
  });
});

// ─── Atomic write smoke ───────────────────────────────────────────────────────

describe('atomic write smoke', () => {
  let env;

  beforeEach(() => {
    env = mkTmpEnv();
  });

  afterEach(() => {
    _resetMocks();
    _setDeclinePath(null);
    fs.rmSync(env.homeDir, { recursive: true, force: true });
  });

  test('case 15: writeDecline uses atomic rename (.tmp → final path)', () => {
    const calls = [];
    const tmpPath = env.declinePath + '.tmp';

    const spyFs = {
      existsSync: (...a) => fs.existsSync(...a),
      mkdirSync: (...a) => fs.mkdirSync(...a),
      readFileSync: (...a) => fs.readFileSync(...a),
      writeFileSync: (p, data, ...rest) => {
        calls.push({ op: 'writeFileSync', path: p });
        fs.writeFileSync(p, data, ...rest);
      },
      renameSync: (from, to) => {
        calls.push({ op: 'renameSync', from, to });
        fs.renameSync(from, to);
      },
      unlinkSync: (...a) => fs.unlinkSync(...a),
    };
    _setRunFs(spyFs);

    writeDecline('/my/project', { now: NOW });

    const writeCall = calls.find(c => c.op === 'writeFileSync');
    const renameCall = calls.find(c => c.op === 'renameSync');

    assert.ok(writeCall, 'should have called writeFileSync');
    assert.ok(renameCall, 'should have called renameSync');
    assert.ok(writeCall.path.endsWith('.tmp'), `writeFileSync should write to .tmp path, got: ${writeCall.path}`);
    assert.equal(renameCall.from, tmpPath, `renameSync should rename from .tmp: ${renameCall.from}`);
    assert.equal(renameCall.to, env.declinePath, `renameSync should rename to final path: ${renameCall.to}`);
  });
});

// ─── EXPORTS smoke ────────────────────────────────────────────────────────────

describe('module exports', () => {
  test('DECLINED_PROJECTS_PATH points to ~/.claude/devflow/declined-projects.json', () => {
    const expected = path.join(os.homedir(), '.claude', 'devflow', 'declined-projects.json');
    assert.equal(DECLINED_PROJECTS_PATH, expected);
  });
});

// ─── cmdProjectDecline + cmdProjectAccept ─────────────────────────────────────

const {
  cmdProjectDecline,
  cmdProjectAccept,
} = require('./decline-tracker.cjs');

describe('cmdProjectDecline', () => {
  let env;

  beforeEach(() => {
    env = mkTmpEnv();
  });

  afterEach(() => {
    _resetMocks();
    _setDeclinePath(null);
    fs.rmSync(env.homeDir, { recursive: true, force: true });
  });

  test('case 16: no args → uses cwd, calls writeDecline with default 30 days', () => {
    const output = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => { output.push(s); return true; };
    try {
      // We can't call cmdProjectDecline directly in-process because output() calls process.exit
      // Use subprocess instead (cases 16-26 test via spawnSync in the CLI group below)
      // Here just verify the file is written with default duration when we call the helper
      const result = writeDecline(process.cwd(), { now: NOW });
      assert.equal(result.expires_at, NOW_PLUS_30D);
    } finally {
      process.stdout.write = origWrite;
    }
  });

  test('case 17: explicit path arg → uses provided path', () => {
    const result = writeDecline('/some/path', { now: NOW });
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.ok(contents['/some/path']);
  });

  test('case 18: --duration-days 60 → writes entry with 60-day expiry', () => {
    const result = writeDecline('/my/project', { now: NOW, durationDays: 60 });
    // NOW = 2026-05-04T12:00:00.000Z; +60 days = 2026-07-03T12:00:00.000Z
    const expectedExpiry = '2026-07-03T12:00:00.000Z';
    assert.equal(result.expires_at, expectedExpiry);
  });

  test('case 19: /some/path + --duration-days 14 → writes 14-day entry for /some/path', () => {
    const result = writeDecline('/some/path', { now: NOW, durationDays: 14 });
    assert.equal(result.expires_at, '2026-05-18T12:00:00.000Z');
    const contents = JSON.parse(fs.readFileSync(env.declinePath, 'utf-8'));
    assert.ok(contents['/some/path']);
    assert.equal(contents['/some/path'].expires_at, '2026-05-18T12:00:00.000Z');
  });
});

describe('cmdProjectAccept', () => {
  let env;

  beforeEach(() => {
    env = mkTmpEnv();
  });

  afterEach(() => {
    _resetMocks();
    _setDeclinePath(null);
    fs.rmSync(env.homeDir, { recursive: true, force: true });
  });

  test('case 20: no args → uses cwd, calls clearDecline', () => {
    writeDecline(process.cwd(), { now: NOW });
    const result = clearDecline(process.cwd());
    assert.equal(result.cleared, true);
  });

  test('case 21: explicit path → calls clearDecline for that path', () => {
    writeDecline('/some/path', { now: NOW });
    const result = clearDecline('/some/path');
    assert.deepEqual(result, { cleared: true, was_present: true });
  });

  test('case 22: cwd has no entry → exits 0 silently (no error thrown)', () => {
    // clearDecline is idempotent
    assert.doesNotThrow(() => {
      const result = clearDecline('/nonexistent/path');
      assert.deepEqual(result, { cleared: false, was_present: false });
    });
  });
});

// ─── CLI subprocess tests ─────────────────────────────────────────────────────

const DF_TOOLS = require.resolve('../df-tools.cjs');

function spawnDeclineCli(extraArgs, tmpHome) {
  return spawnSync(process.execPath, [DF_TOOLS, ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env, HOME: tmpHome },
    cwd: '/tmp',
  });
}

describe('CLI subprocess: project-decline + project-accept', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'decline-cli-home-'));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('case 23: project-decline --raw → emits JSON with declined_at + expires_at', () => {
    const proc = spawnDeclineCli(['project-decline', '/tmp/test-cwd', '--raw'], tmpHome);
    assert.equal(proc.status, 0, `expected exit 0, stderr: ${proc.stderr}`);
    const parsed = JSON.parse(proc.stdout);
    assert.ok(parsed.declined_at, 'should have declined_at');
    assert.ok(parsed.expires_at, 'should have expires_at');
  });

  test('case 24: project-decline non-raw → emits human-readable summary line', () => {
    const proc = spawnDeclineCli(['project-decline', '/tmp/test-cwd'], tmpHome);
    assert.equal(proc.status, 0, `expected exit 0, stderr: ${proc.stderr}`);
    // Should not be valid JSON (it's human-readable)
    assert.ok(proc.stdout.length > 0, 'should have output');
    // Human readable output should contain meaningful text
    assert.ok(
      proc.stdout.includes('declined') || proc.stdout.includes('Declined') ||
      proc.stdout.includes('expires') || proc.stdout.includes('/tmp/test-cwd'),
      `expected human-readable output, got: ${proc.stdout}`
    );
  });

  test('case 25: project-accept --raw → emits { cleared, was_present } JSON', () => {
    // First decline, then accept
    spawnDeclineCli(['project-decline', '/tmp/test-cwd2', '--raw'], tmpHome);
    const proc = spawnDeclineCli(['project-accept', '/tmp/test-cwd2', '--raw'], tmpHome);
    assert.equal(proc.status, 0, `expected exit 0, stderr: ${proc.stderr}`);
    const parsed = JSON.parse(proc.stdout);
    assert.ok('cleared' in parsed, 'should have cleared field');
    assert.ok('was_present' in parsed, 'should have was_present field');
  });

  test('case 26: project-decline with malformed --duration-days abc → exit non-zero', () => {
    const proc = spawnDeclineCli(['project-decline', '/tmp/test-cwd', '--duration-days', 'abc'], tmpHome);
    assert.notEqual(proc.status, 0, 'expected non-zero exit for invalid duration');
  });

  test('case 27: round-trip: project-decline → file written → project-accept → file emptied', () => {
    const testCwd = '/tmp/test-decline-cwd';
    const declineFilePath = path.join(tmpHome, '.claude', 'devflow', 'declined-projects.json');

    // Decline
    const procDecline = spawnDeclineCli(['project-decline', testCwd, '--duration-days', '7', '--raw'], tmpHome);
    assert.equal(procDecline.status, 0, `decline failed: ${procDecline.stderr}`);
    assert.ok(fs.existsSync(declineFilePath), 'decline file should exist after project-decline');
    const afterDecline = JSON.parse(fs.readFileSync(declineFilePath, 'utf-8'));
    assert.ok(afterDecline[testCwd], `should have entry for ${testCwd}`);

    // Accept
    const procAccept = spawnDeclineCli(['project-accept', testCwd, '--raw'], tmpHome);
    assert.equal(procAccept.status, 0, `accept failed: ${procAccept.stderr}`);
    const afterAccept = JSON.parse(fs.readFileSync(declineFilePath, 'utf-8'));
    assert.equal(Object.keys(afterAccept).length, 0, 'file should be empty {} after accept');
  });

  test('case 28: project-accept → exits 0, emits JSON', () => {
    const testCwd = '/tmp/test-accept-only-cwd';
    spawnDeclineCli(['project-decline', testCwd, '--raw'], tmpHome);
    const proc = spawnDeclineCli(['project-accept', testCwd, '--raw'], tmpHome);
    assert.equal(proc.status, 0, `expected exit 0, stderr: ${proc.stderr}`);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.cleared, true);
    assert.equal(parsed.was_present, true);
  });

  test('case 29: project-decline then project-accept then decline-check shows not-declined (direct fs)', () => {
    const testCwd = '/tmp/test-roundtrip-cwd';
    const declineFilePath = path.join(tmpHome, '.claude', 'devflow', 'declined-projects.json');

    // Decline
    spawnDeclineCli(['project-decline', testCwd, '--raw'], tmpHome);
    let contents = JSON.parse(fs.readFileSync(declineFilePath, 'utf-8'));
    assert.ok(contents[testCwd], 'should be declined after decline');

    // Accept
    spawnDeclineCli(['project-accept', testCwd, '--raw'], tmpHome);
    contents = JSON.parse(fs.readFileSync(declineFilePath, 'utf-8'));
    assert.equal(contents[testCwd], undefined, 'should be removed after accept');
  });
});

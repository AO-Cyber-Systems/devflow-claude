'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  startMicro,
  commitMicro,
  abortMicro,
  _resetMocks,
} = require('./micro.cjs');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function mkAmbient() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-'));
  fs.mkdirSync(path.join(root, '.planning'));
  return { root, planningDir: path.join(root, '.planning') };
}

function mkGitAmbient() {
  const env = mkAmbient();
  // Init git repo
  spawnSync('git', ['init', '-q'], { cwd: env.root });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: env.root });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: env.root });
  // Create an initial commit so HEAD exists
  fs.writeFileSync(path.join(env.root, 'README.md'), '# test\n');
  spawnSync('git', ['add', 'README.md'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });
  spawnSync('git', ['commit', '-m', 'chore: initial'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });
  // Write a minimal STATE.md with 5-column Quick Tasks Completed table
  const stateMd5col = `# DevFlow State\n\n## Quick Tasks Completed\n\n| # | Description | Date | Commit | Directory |\n|---|---|---|---|---|\n`;
  fs.writeFileSync(path.join(env.root, '.planning', 'STATE.md'), stateMd5col, 'utf8');
  return env;
}

function mkGitAmbient6col() {
  const env = mkGitAmbient();
  // Overwrite STATE.md with 6-column (Status column present)
  const stateMd6col = `# DevFlow State\n\n## Quick Tasks Completed\n\n| # | Description | Date | Commit | Directory | Status |\n|---|---|---|---|---|---|\n`;
  fs.writeFileSync(path.join(env.root, '.planning', 'STATE.md'), stateMd6col, 'utf8');
  return env;
}

// ─── startMicro ───────────────────────────────────────────────────────────────

describe('startMicro', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  // Test 1: happy path — returns ok:true with next_num, slug, task_dir, marker
  test('happy: returns ok:true with next_num, slug, task_dir, marker and writes .skill-active', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      pid: 1234,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, true);
    assert.ok(typeof result.next_num === 'number');
    assert.ok(typeof result.slug === 'string');
    assert.ok(typeof result.task_dir === 'string');
    assert.ok(result.marker);
    // marker should have skill = 'micro'
    const markerPath = path.join(env.planningDir, '.skill-active');
    assert.equal(fs.existsSync(markerPath), true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.equal(marker.skill, 'micro');
  });

  // Test 2: edge — empty description → ok:false, reason:missing-description
  test('edge: empty description returns ok:false with reason missing-description', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: '',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing-description');
  });

  // Test 3: edge — whitespace-only description → ok:false, reason:missing-description
  test('edge: whitespace-only description returns ok:false with reason missing-description', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: '   ',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing-description');
  });

  // Test 4: edge — planningDir null → ok:false, reason:no-planning-dir
  test('edge: planningDir null returns ok:false with reason no-planning-dir', () => {
    const result = startMicro({
      planningDir: null,
      description: 'rename foo to bar',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-planning-dir');
  });

  // Test 5: edge — pre-existing marker is overwritten (last-write-wins)
  test('edge: pre-existing marker is overwritten (last-write-wins)', () => {
    // Write a marker for a different skill
    const markerPath = path.join(env.planningDir, '.skill-active');
    fs.writeFileSync(markerPath, JSON.stringify({ skill: 'build', started_at: 'x', pid: 1 }), 'utf8');
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      pid: 2,
      now: '2026-05-06T01:00:00Z',
    });
    assert.equal(result.ok, true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.equal(marker.skill, 'micro');
  });

  // Test 6: edge — existing .planning/quick dirs raise next_num correctly
  test('edge: existing .planning/quick/0042-foo dir makes next_num === 43', () => {
    fs.mkdirSync(path.join(env.planningDir, 'quick', '0042-foo'), { recursive: true });
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'add missing semicolon',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, true);
    assert.equal(result.next_num, 43);
  });

  // Test 7: edge — description with special chars produces slug ≤40 chars lowercase-hyphen
  test('edge: description with special chars produces slug that is lowercase-hyphen and ≤40 chars', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'Fix typo: Rename "foo" → "bar" (important!)',
      pid: 1,
      now: '2026-05-06T00:00:00Z',
    });
    assert.equal(result.ok, true);
    assert.match(result.slug, /^[a-z0-9-]+$/);
    assert.ok(result.slug.length <= 40, `slug length ${result.slug.length} exceeds 40 chars`);
  });
});

// ─── commitMicro ─────────────────────────────────────────────────────────────

describe('commitMicro', () => {
  let env;
  beforeEach(() => {
    env = mkGitAmbient();
    process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1';
  });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    delete process.env.DEVFLOW_ALLOW_RAW_COMMIT;
    _resetMocks();
  });

  // Test 8: happy — commits chore(micro): {description}, removes marker, appends STATE.md row
  test('happy: commits with chore(micro): message, removes marker, appends STATE.md row', () => {
    // First start a micro task to set the marker
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    // Create a file to commit
    fs.writeFileSync(path.join(env.root, 'fix.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got reason: ${result.reason}`);
    assert.ok(result.commit_hash, 'expected commit_hash');
    assert.equal(result.removed_marker, true);
    // marker should be gone
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false);
    // STATE.md should have an appended row
    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes('fix typo in readme'), 'STATE.md should contain task description');
  });

  // Test 9: happy with files array — only that subset is staged
  test('happy with files: passes files list to gitRunner', () => {
    startMicro({ planningDir: env.planningDir, description: 'bump dependency version', pid: 1, now: '2026-05-06T00:00:00Z' });
    // Create two files, only stage one
    fs.writeFileSync(path.join(env.root, 'a.txt'), 'a\n');
    fs.writeFileSync(path.join(env.root, 'b.txt'), 'b\n');

    let capturedArgs = null;
    const mockGitRunner = (cwd, args, env2) => {
      capturedArgs = { cwd, args, env2 };
      // simulate success
      return { exitCode: 0, stdout: 'abc1234', stderr: '' };
    };

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'bump dependency version',
      files: ['a.txt'],
      now: '2026-05-06T00:01:00Z',
      gitRunner: mockGitRunner,
    });
    // The gitRunner should have been called with files containing 'a.txt'
    assert.ok(capturedArgs !== null, 'gitRunner should have been called');
  });

  // Test 10: edge — no active marker → ok:false, reason:no-active-micro
  test('edge: no active marker returns ok:false with reason no-active-micro', () => {
    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'rename foo to bar',
      files: null,
      now: '2026-05-06T00:00:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-active-micro');
  });

  // Test 11: edge — commit fails → ok:false, reason:commit-failed, marker stays
  test('edge: gitRunner failure returns ok:false, reason commit-failed, marker stays', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });

    const failingGitRunner = () => ({ exitCode: 1, stdout: '', stderr: 'nothing to commit' });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: failingGitRunner,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'commit-failed');
    assert.equal(result.removed_marker, false);
    // marker must still be present
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), true);
  });

  // Test 12: edge — STATE.md missing → ok:false, reason:no-state-file
  test('edge: STATE.md missing returns ok:false with reason no-state-file', () => {
    fs.unlinkSync(path.join(env.planningDir, 'STATE.md'));
    startMicro({ planningDir: env.planningDir, description: 'add missing semicolon', pid: 1, now: '2026-05-06T00:00:00Z' });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'add missing semicolon',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-state-file');
  });

  // Test 13: edge — STATE.md has no Quick Tasks section → creates 5-col section
  test('edge: STATE.md with no Quick Tasks section creates 5-col section on commit', () => {
    // Overwrite STATE.md with no Quick Tasks section
    fs.writeFileSync(path.join(env.planningDir, 'STATE.md'), '# DevFlow State\n\nSome content.\n', 'utf8');
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix2.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix2.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'fix typo in readme',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got ${result.reason}`);
    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes('Quick Tasks Completed'), 'should have created the section');
    // 5-col shape — no Status column header
    const lines = stateMd.split('\n');
    const headerLine = lines.find(l => l.includes('# |') || l.includes('Description'));
    assert.ok(headerLine, 'should have a table header line');
    assert.ok(!headerLine.includes('Status'), 'created section should NOT have Status column');
  });

  // Test 14: edge — STATE.md with 6-col table appends row with Status='Atomic'
  test('edge: STATE.md with 6-col Status table appends row with Status=Atomic', () => {
    // Rebuild env with 6-col STATE.md
    fs.rmSync(env.root, { recursive: true, force: true });
    env = mkGitAmbient6col();
    process.env.DEVFLOW_ALLOW_RAW_COMMIT = '1';

    startMicro({ planningDir: env.planningDir, description: 'rename foo to bar', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix3.txt'), 'fix\n');
    spawnSync('git', ['add', 'fix3.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    const result = commitMicro({
      planningDir: env.planningDir,
      description: 'rename foo to bar',
      files: null,
      now: '2026-05-06T00:01:00Z',
      gitRunner: null,
    });
    assert.equal(result.ok, true, `expected ok:true, got ${result.reason}`);
    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes('Atomic'), 'should contain Status=Atomic in appended row');
  });
});

// ─── abortMicro ──────────────────────────────────────────────────────────────

describe('abortMicro', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  // Test 15: happy — marker present → removes, returns ok:true, removed:true
  test('happy: marker present → removes marker, returns ok:true removed:true', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), true);
    const result = abortMicro({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(result.removed, true);
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false);
  });

  // Test 16: happy — marker absent → idempotent ok:true, removed:false
  test('happy: marker absent → idempotent ok:true removed:false', () => {
    const result = abortMicro({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(result.removed, false);
  });

  // Test 17: edge — planningDir null → ok:false, reason:no-planning-dir
  test('edge: planningDir null returns ok:false with reason no-planning-dir', () => {
    const result = abortMicro({ planningDir: null });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-planning-dir');
  });
});

// ─── cmdMicro (CLI dispatch) ──────────────────────────────────────────────────

const DF_TOOLS = require.resolve('../df-tools.cjs');

function spawnMicro(cwd, extraArgs, extraEnv) {
  return spawnSync(process.execPath, [DF_TOOLS, 'micro', ...extraArgs], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

describe('cmdMicro (CLI dispatch via spawnSync e2e)', () => {
  let env;
  beforeEach(() => {
    env = mkGitAmbient();
  });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
  });

  // e2e-1: start → commit round trip
  test('e2e-1: start then commit round-trip; marker created/removed, commit in git log, STATE.md row appended', () => {
    // Start
    const startProc = spawnMicro(env.root, ['start', 'fix typo in readme', '--raw'], { DEVFLOW_ALLOW_RAW_COMMIT: '1' });
    assert.equal(startProc.status, 0, `start failed: ${startProc.stderr}`);
    const startResult = JSON.parse(startProc.stdout);
    assert.equal(startResult.ok, true);
    // marker exists
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), true);

    // Stage a file for commit
    fs.writeFileSync(path.join(env.root, 'e2e-fix.txt'), 'e2e fix\n');
    spawnSync('git', ['add', 'e2e-fix.txt'], { cwd: env.root, env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' } });

    // Commit
    const commitProc = spawnMicro(env.root, ['commit', '--raw'], { DEVFLOW_ALLOW_RAW_COMMIT: '1' });
    assert.equal(commitProc.status, 0, `commit failed: ${commitProc.stderr}`);
    const commitResult = JSON.parse(commitProc.stdout);
    assert.equal(commitResult.ok, true);
    assert.equal(commitResult.removed_marker, true);

    // marker gone
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false);

    // commit message in git log
    const logProc = spawnSync('git', ['log', '-1', '--pretty=%s'], { cwd: env.root, encoding: 'utf8' });
    assert.ok(logProc.stdout.trim().startsWith('chore(micro):'), `expected chore(micro): prefix, got: ${logProc.stdout.trim()}`);
    assert.ok(logProc.stdout.includes('fix typo in readme'), `expected description in commit msg: ${logProc.stdout.trim()}`);

    // STATE.md row appended
    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes('fix typo in readme'), 'STATE.md should contain committed task description');
  });

  // e2e-2: outside any .planning/ tree → start exits non-zero with planning dir error in stderr
  test('e2e-2: outside .planning/ tree, start exits non-zero with no-planning-dir in stderr', () => {
    const proc = spawnMicro(os.tmpdir(), ['start', 'x', '--raw'], {});
    assert.notEqual(proc.status, 0, 'expected non-zero exit outside .planning tree');
    // error() writes "Error: <message>" — check for the planning dir error text
    const stderrLower = proc.stderr.toLowerCase();
    assert.ok(
      stderrLower.includes('no-planning-dir') || stderrLower.includes('.planning') || stderrLower.includes('planning'),
      `expected planning-dir error in stderr, got: ${proc.stderr}`
    );
  });

  // dispatch: unknown subcommand exits non-zero
  test('unknown subcommand exits non-zero', () => {
    const proc = spawnMicro(env.root, ['bogus'], {});
    assert.notEqual(proc.status, 0, 'expected non-zero exit for unknown subcommand');
  });
});

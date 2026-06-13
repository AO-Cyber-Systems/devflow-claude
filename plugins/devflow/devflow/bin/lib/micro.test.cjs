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

// ─── startMicro: placeholder dir (F2) ────────────────────────────────────────

describe('startMicro: placeholder dir (F2)', () => {
  let env;
  beforeEach(() => { env = mkAmbient(); });
  afterEach(() => {
    fs.rmSync(env.root, { recursive: true, force: true });
    _resetMocks();
  });

  // Test list F2-1: startMicro creates placeholder dir on disk
  test('F2-1 happy: startMicro creates .planning/quick/<N>-<slug>/ on disk', () => {
    const result = startMicro({
      planningDir: env.planningDir,
      description: 'fix x',
      pid: 1,
      now: '2026-05-08T00:00:00Z',
    });
    assert.equal(result.ok, true);
    const expectedDir = path.join(env.planningDir, 'quick', `${result.next_num}-${result.slug}`);
    assert.equal(fs.existsSync(expectedDir), true, `expected dir to exist at ${expectedDir}`);
    assert.equal(fs.statSync(expectedDir).isDirectory(), true);
  });

  // Test list F2-3: consecutive starts get distinct N values (collision-free)
  test('F2-3 happy: consecutive starts allocate distinct N (no collision with init quick scan)', () => {
    const first = startMicro({
      planningDir: env.planningDir,
      description: 'first task',
      pid: 1,
      now: '2026-05-08T00:00:00Z',
    });
    assert.equal(first.ok, true);
    const second = startMicro({
      planningDir: env.planningDir,
      description: 'second task',
      pid: 2,
      now: '2026-05-08T00:01:00Z',
    });
    assert.equal(second.ok, true);
    // Distinct N — second must be one higher than first because first's dir is on disk
    assert.equal(second.next_num, first.next_num + 1,
      `expected second.next_num=${first.next_num + 1}, got ${second.next_num} (collision with first)`);
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

  // Test 9: happy with files array — only that subset is staged.
  // After F1 fix: gitRunner called TWICE — once with files arg, once with .planning/STATE.md.
  test('happy with files: passes files list to gitRunner (called twice — source + STATE.md)', () => {
    startMicro({ planningDir: env.planningDir, description: 'bump dependency version', pid: 1, now: '2026-05-06T00:00:00Z' });
    // Create two files, only stage one
    fs.writeFileSync(path.join(env.root, 'a.txt'), 'a\n');
    fs.writeFileSync(path.join(env.root, 'b.txt'), 'b\n');

    const allCalls = [];
    const mockGitRunner = (cwd, opts) => {
      allCalls.push({ cwd, opts });
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
    // The gitRunner should have been called twice — first with source files, second with STATE.md
    assert.equal(allCalls.length, 2, `expected 2 gitRunner calls (source + STATE.md), got ${allCalls.length}`);
    assert.deepEqual(allCalls[0].opts.files, ['a.txt'], 'first call should pass source files list');
    assert.deepEqual(allCalls[1].opts.files, ['.planning/STATE.md'], 'second call should stage .planning/STATE.md');
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

// ─── commitMicro: atomic STATE.md (F1) ───────────────────────────────────────

describe('commitMicro: atomic STATE.md (F1)', () => {
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

  // Test list F1-6 (THE bug): after commitMicro returns ok, working tree is clean
  test('F1-6 happy: working tree is clean after commitMicro returns ok (no M .planning/STATE.md)', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
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

    // Working tree should be clean — NO `M .planning/STATE.md`
    const statusProc = spawnSync('git', ['status', '--porcelain'], {
      cwd: env.root,
      encoding: 'utf8',
    });
    assert.equal(statusProc.stdout.trim(), '',
      `expected clean tree, got: ${JSON.stringify(statusProc.stdout)}`);
  });

  // Test list F1-7: two commits — `chore(micro): record STATE.md row for ...` then `chore(micro): ...`
  test('F1-7 happy: produces two atomic commits — source then STATE.md row', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
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

    // Get last 2 commit messages, newest first
    const logProc = spawnSync('git', ['log', '--format=%s', '-2'], {
      cwd: env.root,
      encoding: 'utf8',
    });
    const messages = logProc.stdout.trim().split('\n');
    assert.equal(messages.length, 2, `expected 2 commit messages, got: ${JSON.stringify(messages)}`);
    // Newest (HEAD) is the STATE.md commit
    assert.equal(messages[0], 'chore(micro): record STATE.md row for fix typo in readme',
      `HEAD message wrong: ${messages[0]}`);
    // HEAD~1 is the source commit
    assert.equal(messages[1], 'chore(micro): fix typo in readme',
      `HEAD~1 message wrong: ${messages[1]}`);
  });

  // Test list F1-8: STATE.md row records SOURCE commit hash (HEAD~1), not STATE.md commit hash (HEAD)
  test('F1-8 happy: STATE.md row records SOURCE commit hash (HEAD~1), not STATE.md commit hash', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
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

    // Resolve HEAD~1 (source commit hash)
    const sourceHashProc = spawnSync('git', ['rev-parse', '--short', 'HEAD~1'], {
      cwd: env.root,
      encoding: 'utf8',
    });
    const sourceHash = sourceHashProc.stdout.trim();
    assert.ok(sourceHash, 'expected to resolve HEAD~1');

    const stateMd = fs.readFileSync(path.join(env.planningDir, 'STATE.md'), 'utf8');
    assert.ok(stateMd.includes(sourceHash),
      `expected STATE.md to contain source hash ${sourceHash}, got STATE.md content:\n${stateMd}`);
  });

  // Test list F1-9: return shape includes both commit_hash and state_commit_hash
  test('F1-9 happy: return shape includes commit_hash AND state_commit_hash', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
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
    assert.ok(result.commit_hash, 'expected commit_hash (source)');
    assert.ok(result.state_commit_hash, 'expected state_commit_hash');
    assert.notEqual(result.commit_hash, result.state_commit_hash,
      'commit_hash and state_commit_hash should be distinct');
  });

  // Test list F1-10 (graceful degradation): if second commit (STATE.md) fails,
  // first commit still landed, marker still removed, ok:true with state_commit_hash:null
  test('F1-10 edge: STATE.md commit failure → ok:true, commit_hash set, state_commit_hash:null, marker removed', () => {
    startMicro({ planningDir: env.planningDir, description: 'fix typo in readme', pid: 1, now: '2026-05-06T00:00:00Z' });
    fs.writeFileSync(path.join(env.root, 'fix.txt'), 'fix\n');

    let callIdx = 0;
    const stderrChunks = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { stderrChunks.push(String(chunk)); return true; };

    let result;
    try {
      // Mock runner: first call (source) succeeds; second call (STATE.md) fails
      const mockGitRunner = (cwd, opts) => {
        callIdx += 1;
        if (callIdx === 1) {
          // Real source commit — actually do it so HEAD advances
          const r = spawnSync('git', ['add', 'fix.txt'], {
            cwd, encoding: 'utf8',
            env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' },
          });
          if (r.status !== 0) return { exitCode: 1, stdout: '', stderr: r.stderr || '' };
          const c = spawnSync('git', ['commit', '-m', opts.message], {
            cwd, encoding: 'utf8',
            env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' },
          });
          return {
            exitCode: c.status ?? 1,
            stdout: (c.stdout || '').trim(),
            stderr: (c.stderr || '').trim(),
          };
        }
        // Second call — simulated failure
        return { exitCode: 1, stdout: '', stderr: 'simulated STATE.md commit failure' };
      };

      result = commitMicro({
        planningDir: env.planningDir,
        description: 'fix typo in readme',
        files: null,
        now: '2026-05-06T00:01:00Z',
        gitRunner: mockGitRunner,
      });
    } finally {
      process.stderr.write = origWrite;
    }

    assert.equal(result.ok, true, `expected ok:true even with STATE.md commit failure, got: ${JSON.stringify(result)}`);
    assert.ok(result.commit_hash, 'commit_hash should be set (source landed)');
    assert.equal(result.state_commit_hash, null, 'state_commit_hash should be null on failure');
    assert.equal(result.removed_marker, true, 'marker should still be removed');
    assert.equal(fs.existsSync(path.join(env.planningDir, '.skill-active')), false,
      'marker file must not exist on disk');
    // Warning emitted to stderr
    const stderrAll = stderrChunks.join('');
    assert.ok(stderrAll.includes('STATE.md'),
      `expected stderr warning mentioning STATE.md, got: ${JSON.stringify(stderrAll)}`);
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

  // Test list F2-2: startMicro then abortMicro removes the placeholder dir from disk
  test('F2-2 happy: abortMicro removes placeholder dir created by startMicro', () => {
    const start = startMicro({
      planningDir: env.planningDir,
      description: 'add missing semicolon',
      pid: 1,
      now: '2026-05-08T00:00:00Z',
    });
    assert.equal(start.ok, true);
    const dir = path.join(env.planningDir, 'quick', `${start.next_num}-${start.slug}`);
    assert.equal(fs.existsSync(dir), true, 'precondition: dir should exist after start');

    // Need .micro-description on disk for abort to find which dir to remove
    // (startMicro already wrote it, but verify)
    const descFile = path.join(env.planningDir, '.micro-description');
    assert.equal(fs.existsSync(descFile), true, 'precondition: .micro-description should exist');

    const result = abortMicro({ planningDir: env.planningDir });
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(dir), false,
      `expected placeholder dir to be removed after abort, but still exists at ${dir}`);
  });

  // Test list F2-4: abortMicro is idempotent — placeholder dir already gone, no error
  test('F2-4 edge: abortMicro idempotent when placeholder dir already cleaned up', () => {
    const start = startMicro({
      planningDir: env.planningDir,
      description: 'idempotent abort test',
      pid: 1,
      now: '2026-05-08T00:00:00Z',
    });
    assert.equal(start.ok, true);
    const dir = path.join(env.planningDir, 'quick', `${start.next_num}-${start.slug}`);

    // Manually pre-remove the placeholder dir to simulate "already gone"
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false, 'precondition: dir manually pre-removed');

    // abort should still return ok:true without throwing
    const result = abortMicro({ planningDir: env.planningDir });
    assert.equal(result.ok, true, `expected ok:true even when dir already gone, got: ${JSON.stringify(result)}`);
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

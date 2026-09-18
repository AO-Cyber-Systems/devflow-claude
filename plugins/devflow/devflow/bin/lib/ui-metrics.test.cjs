'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const { computeBaseline, classifySubject } = require('./ui-metrics.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

// ─── Fixture: throwaway git repo ───────────────────────────────────────────
// Pattern: fs.mkdtempSync (see dup-detect.test.cjs:667) + `git init -q` +
// `git config user.email/name` + commits via execFileSync. Not the
// changelog-on-tag test's mkRepo — that helper isn't exported.

function mkTmpRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-metrics-test-'));
  execFileSync('git', ['init', '-q'], { cwd: tmp });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmp });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: tmp });
  return tmp;
}

function commit(tmp, subject, relFile) {
  const filePath = path.join(tmp, relFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${subject}\n${Date.now()}-${Math.random()}\n`);
  execFileSync('git', ['add', relFile], { cwd: tmp });
  execFileSync('git', ['commit', '-q', '-m', subject], { cwd: tmp });
}

function cleanup(tmp) {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ─── computeBaseline ────────────────────────────────────────────────────────

describe('computeBaseline', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkTmpRepo();
    // 3 feat, 2 fix, 1 fix(quick-3), 1 test, 1 merge — all touching flutter/lib/a.dart
    commit(tmp, 'feat(x): add one', 'flutter/lib/a.dart');
    commit(tmp, 'feat(x): add two', 'flutter/lib/a.dart');
    commit(tmp, 'feat(x): add three', 'flutter/lib/a.dart');
    commit(tmp, 'fix(y): fix one', 'flutter/lib/a.dart');
    commit(tmp, 'fix(y): fix two', 'flutter/lib/a.dart');
    commit(tmp, 'fix(quick-3): urgent patch', 'flutter/lib/a.dart');
    commit(tmp, 'test(z): add test', 'flutter/lib/a.dart');
    commit(tmp, "Merge branch 'a'", 'flutter/lib/a.dart');
    // touches a file OUTSIDE flutter/lib — must NOT be counted
    commit(tmp, 'feat(other): unrelated change', 'outside/b.dart');
  });

  afterEach(() => cleanup(tmp));

  test('classifies commits by type, scoped to paths', () => {
    const result = computeBaseline({ cwd: tmp, since: '2026-06-01', paths: ['flutter/lib'] });
    assert.deepStrictEqual(result.commits, { feat: 3, fix: 3, test: 1, refactor: 0, other: 1 });
  });

  test('fix_per_feat is fix/feat rounded to 2 decimals', () => {
    const result = computeBaseline({ cwd: tmp, since: '2026-06-01', paths: ['flutter/lib'] });
    assert.strictEqual(result.fix_per_feat, 1);
  });

  test('quick_fixes counts subjects matching quick-\\d+', () => {
    const result = computeBaseline({ cwd: tmp, since: '2026-06-01', paths: ['flutter/lib'] });
    assert.strictEqual(result.quick_fixes, 1);
  });

  test('echoes since and paths back', () => {
    const result = computeBaseline({ cwd: tmp, since: '2026-06-01', paths: ['flutter/lib'] });
    assert.strictEqual(result.since, '2026-06-01');
    assert.deepStrictEqual(result.paths, ['flutter/lib']);
  });

  test('a future --since yields all zeros and null fix_per_feat', () => {
    const result = computeBaseline({ cwd: tmp, since: '2099-01-01', paths: ['flutter/lib'] });
    assert.deepStrictEqual(result.commits, { feat: 0, fix: 0, test: 0, refactor: 0, other: 0 });
    assert.strictEqual(result.fix_per_feat, null);
    assert.strictEqual(result.quick_fixes, 0);
  });
});

describe('classifySubject', () => {
  test('recognizes feat/fix/test/refactor', () => {
    assert.strictEqual(classifySubject('feat(x): a'), 'feat');
    assert.strictEqual(classifySubject('fix(y): a'), 'fix');
    assert.strictEqual(classifySubject('test(z): a'), 'test');
    assert.strictEqual(classifySubject('refactor: a'), 'refactor');
  });

  test('anything else, including merge commits, is other', () => {
    assert.strictEqual(classifySubject("Merge branch 'a'"), 'other');
    assert.strictEqual(classifySubject('chore: bump deps'), 'other');
    assert.strictEqual(classifySubject('random subject with no colon or paren'), 'other');
  });
});

// ─── CLI: df-tools ui metrics baseline ─────────────────────────────────────

describe('df-tools ui metrics baseline', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkTmpRepo();
    commit(tmp, 'feat(x): add one', 'flutter/lib/a.dart');
    commit(tmp, 'fix(y): fix one', 'flutter/lib/a.dart');
  });

  afterEach(() => cleanup(tmp));

  test('writes a schema_version 1 baseline JSON with a semver engine_version', () => {
    const outFile = path.join(tmp, 'b.json');
    const r = spawnSync(
      process.execPath,
      [TOOLS_PATH, 'ui', 'metrics', 'baseline', '--paths', 'flutter/lib', '--out', outFile, '--raw'],
      { cwd: tmp, encoding: 'utf-8' }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(fs.existsSync(outFile), true);

    const json = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    assert.strictEqual(json.schema_version, 1);
    assert.match(json.engine_version, /^\d+\.\d+\.\d+/);
    assert.strictEqual(json.commits.feat, 1);
    assert.strictEqual(json.commits.fix, 1);
    assert.strictEqual(json.fix_per_feat, 1);
  });

  test('defaults --since to 2026-06-01 and --paths to flutter/lib, writing to .planning/', () => {
    const r = spawnSync(process.execPath, [TOOLS_PATH, 'ui', 'metrics', 'baseline', '--raw'], {
      cwd: tmp,
      encoding: 'utf-8',
    });
    assert.strictEqual(r.status, 0, r.stderr);
    const outFile = path.join(tmp, '.planning', 'ui-metrics-baseline.json');
    assert.strictEqual(fs.existsSync(outFile), true);
    const json = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    assert.strictEqual(json.since, '2026-06-01');
    assert.deepStrictEqual(json.paths, ['flutter/lib']);
  });

  test('prints only JSON to stdout in non-raw mode', () => {
    const outFile = path.join(tmp, 'c.json');
    const r = spawnSync(
      process.execPath,
      [TOOLS_PATH, 'ui', 'metrics', 'baseline', '--paths', 'flutter/lib', '--out', outFile],
      { cwd: tmp, encoding: 'utf-8' }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.schema_version, 1);
  });

  test('a non-repo cwd exits 1 with a one-line error on stderr, not a stack trace', () => {
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-metrics-norepo-'));
    try {
      const r = spawnSync(
        process.execPath,
        [TOOLS_PATH, 'ui', 'metrics', 'baseline', '--paths', 'flutter/lib', '--out', path.join(notRepo, 'b.json'), '--raw'],
        { cwd: notRepo, encoding: 'utf-8' }
      );
      assert.strictEqual(r.status, 1);
      assert.match(r.stderr, /ui metrics: not a git repository: /);
      assert.strictEqual(r.stderr.trim().split('\n').length, 1, `one line on stderr, got: ${r.stderr}`);
      assert.doesNotMatch(r.stderr, /\bat .*\.cjs:\d+/, 'no stack trace');
      assert.strictEqual(r.stdout, '');
      assert.strictEqual(fs.existsSync(path.join(notRepo, 'b.json')), false, 'no baseline written');
    } finally {
      fs.rmSync(notRepo, { recursive: true, force: true });
    }
  });

  test('--paths without a value is a usage error (exit 1, stderr), nothing written', () => {
    const r = spawnSync(
      process.execPath,
      [TOOLS_PATH, 'ui', 'metrics', 'baseline', '--paths'],
      { cwd: tmp, encoding: 'utf-8' }
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--paths requires a value/);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(fs.existsSync(path.join(tmp, '.planning', 'ui-metrics-baseline.json')), false);
  });

  // PR #81 review finding 3: `--paths ""` / `--paths ,` survives flagValue (a
  // defined, non-flag string) but collapses to [] after split/trim/filter — so
  // `git log` measured the WHOLE repo (no `--` path scoping) while the JSON
  // recorded `paths: []`, silently lying about what was measured. An empty
  // path list must be rejected with the same usage error as a missing value,
  // and nothing written.
  test('--paths "" (empty string) is a usage error identical to a missing value, nothing written', () => {
    const r = spawnSync(
      process.execPath,
      [TOOLS_PATH, 'ui', 'metrics', 'baseline', '--paths', ''],
      { cwd: tmp, encoding: 'utf-8' }
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--paths requires a value/);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(fs.existsSync(path.join(tmp, '.planning', 'ui-metrics-baseline.json')), false);
  });

  test('--paths , (only commas/blank entries) is a usage error identical to a missing value', () => {
    const r = spawnSync(
      process.execPath,
      [TOOLS_PATH, 'ui', 'metrics', 'baseline', '--paths', ',', '--out', path.join(tmp, 'd.json')],
      { cwd: tmp, encoding: 'utf-8' }
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--paths requires a value/);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(fs.existsSync(path.join(tmp, 'd.json')), false);
  });

  test('--since without a value is a usage error (exit 1, stderr)', () => {
    const r = spawnSync(
      process.execPath,
      [TOOLS_PATH, 'ui', 'metrics', 'baseline', '--since'],
      { cwd: tmp, encoding: 'utf-8' }
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--since requires a value/);
  });

  test('unknown ui metrics subcommand exits 1 with an error on stderr, not ok:false JSON', () => {
    const r = spawnSync(
      process.execPath,
      [TOOLS_PATH, 'ui', 'metrics', 'bogus'],
      { cwd: tmp, encoding: 'utf-8' }
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /Unknown ui metrics subcommand: bogus/);
    assert.strictEqual(r.stdout, '');
  });
});

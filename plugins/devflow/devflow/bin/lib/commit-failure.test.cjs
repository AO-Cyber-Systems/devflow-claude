'use strict';

/**
 * commit-failure.test.cjs — issue #100 finding 5.
 *
 * `df-tools commit` scopes its commit to the pathspecs it just staged
 * (`git commit -m <msg> -- <paths>`), so a concurrent executor's staged work is
 * not swept in. That form is a PARTIAL COMMIT, and git refuses a partial commit
 * while a merge is in progress.
 *
 * The refusal was reported as `{"reason": "nothing_to_commit"}` with exit 0 —
 * the one wording that makes a human stop looking. It was hit twice in a single
 * day resolving real merges and read as "nothing to commit" both times.
 *
 * Two behaviours are pinned here:
 *   - an in-merge commit names the merge and exits non-zero;
 *   - any other git failure is `commit_failed`, never `nothing_to_commit`;
 *   - a genuinely empty commit is STILL `nothing_to_commit`, and still exit 0 —
 *     callers rely on that being the benign case.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

let tmpRoots = [];
afterEach(() => {
  for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
  tmpRoots = [];
});

function git(dir, cmd) {
  return execSync(`git ${cmd}`, {
    cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DEVFLOW_ALLOW_RAW_COMMIT: '1' },
  }).trim();
}

function run(argv, cwd) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...argv], { cwd, encoding: 'utf-8' });
  const out = (r.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out); } catch { /* not JSON */ }
  return { status: r.status, out, err: (r.stderr || '').trim(), json };
}

/** A DevFlow project with committed planning docs. */
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-commit-'));
  tmpRoots.push(dir);
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  git(dir, 'init -q .');
  git(dir, 'symbolic-ref HEAD refs/heads/main');
  git(dir, 'config user.email "test@test.com"');
  git(dir, 'config user.name "Test User"');
  git(dir, 'config commit.gpgsign false');
  git(dir, 'config core.hooksPath /dev/null');
  fs.writeFileSync(path.join(dir, '.planning', 'config.json'), '{"commit_docs":true}\n');
  fs.writeFileSync(path.join(dir, '.planning', 'NOTES.md'), 'base\n');
  git(dir, 'add -A');
  git(dir, 'commit -q -m "chore: init"');
  return dir;
}

/** Drive both branches into a conflict on .planning/NOTES.md and leave it unresolved. */
function conflictedMerge(dir) {
  git(dir, 'branch side');
  fs.writeFileSync(path.join(dir, '.planning', 'NOTES.md'), 'main\n');
  git(dir, 'commit -q -am "docs: main side"');
  git(dir, 'checkout -q side');
  fs.writeFileSync(path.join(dir, '.planning', 'NOTES.md'), 'side\n');
  git(dir, 'commit -q -am "docs: other side"');
  git(dir, 'checkout -q main');
  try { git(dir, 'merge --no-ff side'); } catch { /* the conflict is the point */ }
  assert.ok(fs.existsSync(path.join(dir, '.git', 'MERGE_HEAD')),
    'fixture must leave a merge in progress');
}

describe('df-tools commit during a merge (issue #100 finding 5)', () => {
  test('a resolved merge conflict is not reported as "nothing to commit"', () => {
    const dir = makeProject();
    conflictedMerge(dir);
    fs.writeFileSync(path.join(dir, '.planning', 'NOTES.md'), 'resolved\n');

    const r = run(['commit', 'docs: resolve'], dir);

    assert.notStrictEqual(r.json && r.json.reason, 'nothing_to_commit',
      `a partial commit refused mid-merge must not be reported as "nothing to commit": ${r.out}`);
    assert.notStrictEqual(r.status, 0,
      `a commit that did not happen must exit non-zero: ${r.out}`);
    assert.match(r.out + r.err, /merge/i,
      `the message must name the merge as the cause: ${r.out} ${r.err}`);
  });

  test('the in-merge case has its own reason, distinct from any other failure', () => {
    const dir = makeProject();
    conflictedMerge(dir);
    fs.writeFileSync(path.join(dir, '.planning', 'NOTES.md'), 'resolved\n');

    const r = run(['commit', 'docs: resolve', '--files', '.planning/NOTES.md'], dir);
    assert.strictEqual(r.json && r.json.reason, 'merge_in_progress', r.out);
    assert.strictEqual(r.json.committed, false);
  });

  test('a genuinely empty commit is still the benign nothing_to_commit, exit 0', () => {
    const dir = makeProject();
    const r = run(['commit', 'docs: nothing changed'], dir);
    assert.strictEqual(r.status, 0, r.out + r.err);
    assert.strictEqual(r.json && r.json.reason, 'nothing_to_commit', r.out);
  });

  test('a normal commit still succeeds and reports its hash', () => {
    const dir = makeProject();
    fs.writeFileSync(path.join(dir, '.planning', 'NOTES.md'), 'changed\n');
    const r = run(['commit', 'docs: a real change', '--files', '.planning/NOTES.md'], dir);
    assert.strictEqual(r.status, 0, r.out + r.err);
    assert.strictEqual(r.json.committed, true, r.out);
    assert.ok(r.json.hash, 'a successful commit must report its hash');
  });
});

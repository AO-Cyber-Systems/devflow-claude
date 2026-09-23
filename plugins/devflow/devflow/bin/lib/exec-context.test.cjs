'use strict';

/**
 * exec-context.test.cjs — issue #86.
 *
 * `devflow:executor` carried `isolation: worktree` in its frontmatter. The
 * harness resolved that isolation implicitly, and got both halves wrong:
 *
 *   - the REPO came from the controller session's cwd, not from the directory
 *     the dispatch named. Executing aodex objective 571 from
 *     /Users/markemerson/Source/aodex-w1c, the first spawn landed in
 *     devflow-claude — a different repository. Every path it was given pointed
 *     somewhere it could not see, silently.
 *   - the BASE was the default branch, not the parent's HEAD. Wave 2 of a
 *     sequential objective therefore started from `main` and could not see
 *     wave 1's commits.
 *
 * The replacement is explicit: the orchestrator states the repo and the base,
 * and `df-tools exec-context` proves both before any work happens — loudly,
 * with a non-zero exit, rather than silently.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

function run(argv, cwd) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...argv], { cwd, encoding: 'utf-8' });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function git(dir, cmd) {
  return execSync(`git ${cmd}`, { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

// ── Fixture generators ───────────────────────────────────────────────────────
// Hand-built, not sampled: each repo has a named default branch and a feature
// branch carrying one commit that exists ONLY on the feature branch. That one
// commit is the whole point — it stands in for "wave 1's output", and a spawn
// based on the default branch cannot see it.

let tmpRoots = [];

function makeRepo(name, { defaultBranch = 'main' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `df-exec-${name}-`));
  tmpRoots.push(dir);
  git(dir, 'init -q .');
  git(dir, `symbolic-ref HEAD refs/heads/${defaultBranch}`);
  git(dir, 'config user.email "test@test.com"');
  git(dir, 'config user.name "Test User"');
  git(dir, 'config commit.gpgsign false');
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n`);
  git(dir, 'add -A');
  git(dir, 'commit -q -m "chore: init"');
  return dir;
}

/** Branch off, land "wave 1", and return that commit's sha. */
function landWaveOne(repo, branch = 'df/objective-571') {
  git(repo, `checkout -q -b ${branch}`);
  fs.writeFileSync(path.join(repo, 'wave1.txt'), 'wave 1 output\n');
  git(repo, 'add -A');
  git(repo, 'commit -q -m "feat(571-01): wave 1"');
  return git(repo, 'rev-parse HEAD');
}

function cleanupAll() {
  for (const d of tmpRoots) {
    try { execSync(`git -C "${d}" worktree prune`, { stdio: 'pipe' }); } catch { /* not a repo */ }
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpRoots = [];
}

describe('exec-context check — repo identity (issue #86)', () => {
  afterEach(cleanupAll);

  test('cwd inside the named repo passes', () => {
    const repo = makeRepo('target');
    const r = run(['exec-context', 'check', '--repo', repo, '--raw'], repo);
    assert.strictEqual(r.status, 0, `expected pass; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.ok, true);
    assert.strictEqual(fs.realpathSync(json.repo_root), fs.realpathSync(repo));
  });

  test('cwd in a DIFFERENT repo fails loudly and names both repos', () => {
    const target = makeRepo('target');
    const other = makeRepo('other');
    // This is the #86 incident: the dispatch named `target`, the spawn landed in `other`.
    const r = run(['exec-context', 'check', '--repo', target], other);
    assert.strictEqual(r.status, 1, `wrong-repo spawn must exit 1; stdout: ${r.stdout}`);
    const said = r.stdout + r.stderr;
    assert.ok(said.includes(path.basename(target)), `must name the expected repo; got: ${said}`);
    assert.ok(said.includes(path.basename(other)), `must name the repo it is actually in; got: ${said}`);
  });

  test('a linked worktree OF the named repo passes — worktrees are not wrong repos', () => {
    const repo = makeRepo('target');
    const wt = path.join(path.dirname(repo), `${path.basename(repo)}-wt`);
    tmpRoots.push(wt);
    git(repo, `worktree add -q -b side "${wt}"`);
    const r = run(['exec-context', 'check', '--repo', repo, '--raw'], wt);
    assert.strictEqual(r.status, 0, `a worktree of the target must pass; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.ok, true);
    assert.strictEqual(json.is_worktree, true);
  });

  test('--repo that is not a git repository fails loudly', () => {
    const repo = makeRepo('target');
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'df-exec-notrepo-'));
    tmpRoots.push(notRepo);
    const r = run(['exec-context', 'check', '--repo', notRepo], repo);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout + r.stderr, /not a git repository|does not exist/i);
  });

  test('--repo is required', () => {
    const repo = makeRepo('target');
    const r = run(['exec-context', 'check'], repo);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout + r.stderr, /--repo/);
  });
});

describe('exec-context check — explicit base (issue #86)', () => {
  afterEach(cleanupAll);

  test('ACCEPTANCE: a sequential wave sees the previous wave\'s commits', () => {
    const repo = makeRepo('target');
    const waveOne = landWaveOne(repo);
    // Wave 2 is dispatched with the base the orchestrator actually means: the
    // branch tip that wave 1 produced.
    const r = run(['exec-context', 'check', '--repo', repo, '--base', waveOne, '--raw'], repo);
    assert.strictEqual(r.status, 0, `wave 2 must see wave 1; stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    assert.strictEqual(json.ok, true);
    assert.strictEqual(json.base_visible, true);
    assert.strictEqual(json.base_sha, waveOne);
  });

  test('a spawn based on the default branch does NOT see the previous wave — and says so', () => {
    const repo = makeRepo('target');
    const waveOne = landWaveOne(repo);
    // Exactly what forced isolation did: branch from the default branch.
    const starved = path.join(path.dirname(repo), `${path.basename(repo)}-starved`);
    tmpRoots.push(starved);
    git(repo, `worktree add -q -b agent-starved "${starved}" main`);

    const r = run(['exec-context', 'check', '--repo', repo, '--base', waveOne], starved);
    assert.strictEqual(r.status, 1, `a starved spawn must exit 1; stdout: ${r.stdout}`);
    assert.match(r.stdout + r.stderr, /base/i);
    assert.ok((r.stdout + r.stderr).includes(waveOne.slice(0, 7)),
      'the failure must name the base commit that is missing');
  });

  test('--base accepts a ref, not only a sha', () => {
    const repo = makeRepo('target');
    landWaveOne(repo);
    const r = run(['exec-context', 'check', '--repo', repo, '--base', 'df/objective-571', '--raw'], repo);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(JSON.parse(r.stdout).base_visible, true);
  });

  test('an unresolvable --base fails loudly rather than being ignored', () => {
    const repo = makeRepo('target');
    const r = run(['exec-context', 'check', '--repo', repo, '--base', 'no-such-ref'], repo);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout + r.stderr, /no-such-ref/);
  });
});

describe('exec-context worktree — explicit repo and base (issue #86)', () => {
  afterEach(cleanupAll);

  test('ACCEPTANCE: the provisioned worktree contains the previous wave\'s commit', () => {
    const repo = makeRepo('target');
    const waveOne = landWaveOne(repo);
    const r = run(['exec-context', 'worktree', '--repo', repo, '--id', '571-02', '--raw'], repo);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    tmpRoots.push(json.worktree_path);

    // The base defaults to the repo's CURRENT HEAD — never the default branch.
    assert.strictEqual(json.base_sha, waveOne);
    assert.strictEqual(git(json.worktree_path, 'rev-parse HEAD'), waveOne);
    assert.ok(fs.existsSync(path.join(json.worktree_path, 'wave1.txt')),
      'wave 1 output must be visible in the wave 2 worktree');
  });

  test('the worktree is created in the NAMED repo even when cwd is a different repo', () => {
    const target = makeRepo('target');
    const waveOne = landWaveOne(target);
    const other = makeRepo('other');

    // The #86 incident, inverted: run from the wrong repo, land in the right one.
    const r = run(['exec-context', 'worktree', '--repo', target, '--id', '571-03', '--raw'], other);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    tmpRoots.push(json.worktree_path);

    assert.strictEqual(git(json.worktree_path, 'rev-parse HEAD'), waveOne);
    const wtCommon = git(json.worktree_path, 'rev-parse --git-common-dir');
    assert.ok(fs.realpathSync(path.resolve(json.worktree_path, wtCommon))
      .startsWith(fs.realpathSync(target)), 'worktree must belong to the named repo');
    // And nothing was created in the repo the command happened to run from.
    assert.strictEqual(git(other, 'worktree list').split('\n').length, 1);
  });

  test('an explicit --base is honoured over the repo HEAD', () => {
    const repo = makeRepo('target');
    const mainSha = git(repo, 'rev-parse main');
    landWaveOne(repo);
    const r = run(['exec-context', 'worktree', '--repo', repo, '--id', '571-04', '--base', 'main', '--raw'], repo);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const json = JSON.parse(r.stdout);
    tmpRoots.push(json.worktree_path);
    assert.strictEqual(json.base_sha, mainSha);
  });

  test('a second worktree for the same id fails loudly rather than reusing a stale tree', () => {
    const repo = makeRepo('target');
    landWaveOne(repo);
    const first = run(['exec-context', 'worktree', '--repo', repo, '--id', '571-05', '--raw'], repo);
    assert.strictEqual(first.status, 0, `stderr: ${first.stderr}`);
    tmpRoots.push(JSON.parse(first.stdout).worktree_path);

    const second = run(['exec-context', 'worktree', '--repo', repo, '--id', '571-05'], repo);
    assert.strictEqual(second.status, 1, `duplicate id must exit 1; stdout: ${second.stdout}`);
    assert.match(second.stdout + second.stderr, /exists/i);
  });

  test('--id is required', () => {
    const repo = makeRepo('target');
    const r = run(['exec-context', 'worktree', '--repo', repo], repo);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout + r.stderr, /--id/);
  });
});

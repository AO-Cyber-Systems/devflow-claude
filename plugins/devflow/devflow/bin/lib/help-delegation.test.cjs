'use strict';

/**
 * help-delegation.test.cjs — issue #87, the exception list.
 *
 * A few commands print their own, richer `--help` than the generic table can
 * (which judge modes are binding, which scope a scaffold writes to), so the
 * dispatcher delegates to them rather than overriding. Delegation is the one
 * way the #87 hole could be reopened: a name added to `OWN_HELP` whose handler
 * does work before it prints would be exactly the original bug again.
 *
 * So every delegation target is held to the same contract the dispatcher
 * guarantees for everything else: exit 0, say something useful, change nothing.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const { OWN_HELP, ownsHelp } = require('./help.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

// Enumerate every (command, subcommand) pair the dispatcher delegates.
function delegationTargets() {
  const out = [];
  for (const [name, owner] of Object.entries(OWN_HELP)) {
    if (owner === true) out.push([name]);
    else for (const sub of owner) out.push([name, sub]);
  }
  return out;
}

let tmpDir;

before(() => {
  // A DevFlow-shaped project with a git repo and something dirty in it, so a
  // handler that stages or writes before printing has something to catch on.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-helpdel-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'objectives'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), '{"commit_docs":true}\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n');
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
  execSync('git init -q .', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "t@t.t"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "T"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -q -m init', { cwd: tmpDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(tmpDir, 'dirty.txt'), 'unrelated work\n');
});

after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function snapshot() {
  return execSync('find . -path ./.git -prune -o -type f -print | sort | xargs shasum',
    { cwd: tmpDir, encoding: 'utf-8' });
}

describe('commands that own their --help still honour the #87 contract', () => {
  for (const target of delegationTargets()) {
    test(`${target.join(' ')} --help: exit 0, prints usage, changes nothing`, () => {
      const before = snapshot();
      const head = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

      const r = spawnSync(process.execPath, [TOOLS_PATH, ...target, '--help'],
        { cwd: tmpDir, encoding: 'utf-8', timeout: 20000 });

      const said = (r.stdout || '') + (r.stderr || '');
      assert.strictEqual(r.status, 0, `${target.join(' ')} --help must exit 0; output: ${said}`);
      assert.match(said, /usage|options|--/i, `${target.join(' ')} --help printed nothing useful`);
      assert.strictEqual(snapshot(), before, `${target.join(' ')} --help changed files on disk`);
      assert.strictEqual(
        execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim(), head,
        `${target.join(' ')} --help moved HEAD`);
    });
  }

  test('ownsHelp only matches the declared pairs', () => {
    assert.strictEqual(ownsHelp(['verify', 'flutter-ui-eval', '--help']), true);
    // A sibling subcommand of an owning command must NOT be delegated — it has
    // no handler of its own, so the dispatcher must answer for it.
    assert.strictEqual(ownsHelp(['verify', 'job-structure', '--help']), false);
    assert.strictEqual(ownsHelp(['commit', '--help']), false);
  });
});

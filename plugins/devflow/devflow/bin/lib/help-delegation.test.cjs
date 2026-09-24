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

/**
 * A plausible FIRST POSITIONAL for each target — the argument a caller would
 * really type before reaching for `--help` ("what were the flags on this
 * again?"). Issue #100 finding 4: every delegated handler only recognised a
 * help flag in the first positional slot, so `flutter-ui bootstrap ./app
 * --help` SCAFFOLDED FIVE FILES instead of printing usage. The contract is
 * positional, not "argv[0] happens to be --help".
 *
 * A whole-command owner (`awareness`) needs a real subcommand here, or the
 * route rejects the probe before the question of help even arises.
 */
const PROBE = {
  'awareness': 'show',
  'org-awareness': 'scan-siblings',
  'dup-detect': 'log',
  'defaults-table init': '--scope=project',
  'flutter-ui bootstrap': '.',
  'flutter-ui design-review': 'ui_eval/manifests/web.manifest.json',
  'flutter-ui eval': 'ui_eval/manifests/web.manifest.json',
  'verify flutter-ui-eval': 'ui_eval/manifests/web.manifest.json',
  'gh resolve': '01-probe',
};

/**
 * Every argv form a help flag can legitimately arrive in. `-h` is in HELP_FLAGS
 * and therefore in the contract; it is NOT spelled `--help`, which is how
 * `flutter-ui eval -h` came to be read as an objective NAME
 * (`"objective '-h' not found"`) rather than as a question.
 */
function helpForms(target) {
  const probe = PROBE[target.join(' ')];
  const forms = [[...target, '--help'], [...target, '-h']];
  if (probe) forms.push([...target, probe, '--help'], [...target, probe, '-h']);
  return forms;
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
  // A Flutter package, so `flutter-ui bootstrap . --help` reaches the scaffolder
  // rather than short-circuiting on `flutter-not-detected`. Without this the
  // finding-4 probe passes for the wrong reason.
  fs.writeFileSync(path.join(tmpDir, 'pubspec.yaml'),
    'name: probe_app\nenvironment:\n  sdk: ">=3.0.0"\ndependencies:\n  flutter:\n    sdk: flutter\n');
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
    for (const argv of helpForms(target)) {
      const label = argv.join(' ');
      test(`${label}: exit 0, prints usage, changes nothing`, () => {
        const before = snapshot();
        const head = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

        const r = spawnSync(process.execPath, [TOOLS_PATH, ...argv],
          { cwd: tmpDir, encoding: 'utf-8', timeout: 60000 });

        const said = (r.stdout || '') + (r.stderr || '');
        assert.strictEqual(r.status, 0, `${label} must exit 0; output: ${said}`);
        assert.match(said, /usage|options|--/i, `${label} printed nothing useful`);
        assert.strictEqual(snapshot(), before, `${label} changed files on disk`);
        assert.strictEqual(
          execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim(), head,
          `${label} moved HEAD`);
      });
    }
  }

  test('ownsHelp only matches the declared pairs', () => {
    assert.strictEqual(ownsHelp(['verify', 'flutter-ui-eval', '--help']), true);
    // A sibling subcommand of an owning command must NOT be delegated — it has
    // no handler of its own, so the dispatcher must answer for it.
    assert.strictEqual(ownsHelp(['verify', 'job-structure', '--help']), false);
    assert.strictEqual(ownsHelp(['commit', '--help']), false);
  });
});

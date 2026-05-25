'use strict';

/**
 * Paired tests for flutter-ui-setup.cjs (TRD 10-09).
 *
 * Per ~/.claude/CLAUDE.md TDD Playbook:
 *  - habit 4: hand-built fixture builders, no LLM-generated test data
 *  - habit 5: outside-in — subprocess invocation tests at the integration layer,
 *    plus module unit tests for the pure helpers
 *  - habit 3: one test at a time (RED→GREEN), atomic commits per case
 *
 * Fixture builders live at the top; behavior tests follow.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  detectMissingTools,
  buildInstallPlan,
  // dispatchInstalls, cmdFlutterUISetup — wired in later tasks
} = require('./flutter-ui-setup.cjs');

// ───── Fixture builders (hand-built; no LLM-generated data) ──────────────────

/**
 * Create a temp PATH directory containing executable shims for each tool whose
 * value is `true`. Returns the absolute path of the temp dir.
 *
 * Example: buildFakePATH({ jq: true, gh: false, chromedriver: true }) creates a
 * tmpdir with `jq` and `chromedriver` files (each chmod 0o755). `gh` is omitted.
 */
function buildFakePATH(tools) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-setup-PATH-'));
  for (const [name, present] of Object.entries(tools)) {
    if (!present) continue;
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(filePath, 0o755);
  }
  return dir;
}

/**
 * Create an empty `.devflow-handoff/{pending,done}/` subtree under tmpdir.
 * Returns { root, pending, done } absolute paths.
 */
function buildHandoffPendingDir(tmpdir) {
  const root = path.join(tmpdir, '.devflow-handoff');
  const pending = path.join(root, 'pending');
  const done = path.join(root, 'done');
  fs.mkdirSync(pending, { recursive: true });
  fs.mkdirSync(done, { recursive: true });
  return { root, pending, done };
}

/**
 * Build a temp Flutter-shaped project root with optional pubspec/integration_test/
 * .maestro/marker. Mirror of flutter-ui-bootstrap.test.cjs::makeProject.
 *
 * opts:
 *   pubspecHasIntegrationTest — when truthy, writes pubspec.yaml with the dep;
 *                                when falsy-but-defined, writes pubspec.yaml without it;
 *                                when omitted, no pubspec.yaml is written.
 *   hasIntegrationTestDir, hasMaestroDir, hasMarker — booleans (default false).
 */
function buildBootstrapTarget(tmpdir, opts) {
  const o = opts || {};
  const root = fs.mkdtempSync(path.join(tmpdir, 'flutter-ui-setup-target-'));
  if (o.pubspecHasIntegrationTest !== undefined) {
    fs.writeFileSync(
      path.join(root, 'pubspec.yaml'),
      o.pubspecHasIntegrationTest
        ? 'name: x\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n  integration_test:\n    sdk: flutter\n'
        : 'name: x\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n'
    );
  }
  if (o.hasIntegrationTestDir) fs.mkdirSync(path.join(root, 'integration_test'), { recursive: true });
  if (o.hasMaestroDir) fs.mkdirSync(path.join(root, '.maestro'), { recursive: true });
  if (o.hasMarker) {
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(root, '.planning', '.flutter-ui-bootstrap-done'), '');
  }
  return root;
}

/**
 * Write a fake devflow-watch PID file inside the given temp HOME.
 *
 *   live=true  → pid points at the current test process (process.kill(pid,0) succeeds)
 *   live=false → pid points at 999999 (unlikely to exist; process.kill throws)
 *
 * Returns the absolute path of the pid file.
 */
function buildFakePidFile(tmpHome, opts) {
  const o = opts || {};
  const pid = o.live ? process.pid : 999999;
  const dir = path.join(tmpHome, '.devflow');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'devflow-watch.pid');
  const payload = {
    pid,
    version: '0.0.0-test',
    shell: null,
    watching: [],
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

// ───── Behavior tests ────────────────────────────────────────────────────────

test.describe('detectMissingTools (TRD 10-09 cases 1-2)', () => {

  test('Case 1 — detector-jq-missing: only jq absent → result includes jq, excludes gh+chromedriver', () => {
    const pathDir = buildFakePATH({ jq: false, gh: true, chromedriver: true });
    const missing = detectMissingTools({ pathDir });
    assert.ok(Array.isArray(missing), 'missing must be an array');
    assert.ok(missing.includes('jq'), `expected missing to include 'jq'; got ${JSON.stringify(missing)}`);
    assert.ok(!missing.includes('gh'), `did not expect 'gh' in missing; got ${JSON.stringify(missing)}`);
    assert.ok(!missing.includes('chromedriver'), `did not expect 'chromedriver' in missing; got ${JSON.stringify(missing)}`);
  });

  test('Case 2 — detector-all-present: all 3 tools present → empty array', () => {
    const pathDir = buildFakePATH({ jq: true, gh: true, chromedriver: true });
    const missing = detectMissingTools({ pathDir });
    assert.deepStrictEqual(missing, []);
  });

});

test.describe('buildInstallPlan (TRD 10-09 cases 3-4)', () => {

  test("Case 3 — plan-darwin-brew: missing jq+gh on darwin → ['brew install jq', 'brew install gh'] in input order", () => {
    const plan = buildInstallPlan({ missing: ['jq', 'gh'], platform: 'darwin' });
    assert.ok(Array.isArray(plan), 'plan must be an array');
    assert.strictEqual(plan.length, 2);
    assert.strictEqual(plan[0], 'brew install jq');
    assert.strictEqual(plan[1], 'brew install gh');
  });

  test("Case 3b — plan-darwin-brew: chromedriver on darwin uses --cask flag", () => {
    const plan = buildInstallPlan({ missing: ['chromedriver'], platform: 'darwin' });
    assert.strictEqual(plan.length, 1);
    assert.strictEqual(plan[0], 'brew install --cask chromedriver');
  });

  test("Case 4 — plan-linux-apt: missing jq+gh on linux → 'sudo apt-get install -y <tool>' per item, input order preserved", () => {
    const plan = buildInstallPlan({ missing: ['jq', 'gh'], platform: 'linux' });
    assert.strictEqual(plan.length, 2);
    assert.strictEqual(plan[0], 'sudo apt-get install -y jq');
    assert.strictEqual(plan[1], 'sudo apt-get install -y gh');
  });

  test("Case 4b — empty missing → empty plan, any platform", () => {
    assert.deepStrictEqual(buildInstallPlan({ missing: [], platform: 'darwin' }), []);
    assert.deepStrictEqual(buildInstallPlan({ missing: [], platform: 'linux' }), []);
  });

});

// Re-export fixture builders so later tests (and other test files, if any) can
// reuse, and so static-analysis treats them as live.
module.exports = {
  buildFakePATH,
  buildHandoffPendingDir,
  buildBootstrapTarget,
  buildFakePidFile,
};

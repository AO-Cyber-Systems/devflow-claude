'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// RED: import will fail until next task creates the file.
const { checkBootstrapState } = require('./flutter-ui-bootstrap.cjs');

// Helper: build a temp project dir with chosen fixture state. All inputs hand-built per habit 4.
function makeProject({ pubspecHasIntegrationTest, hasIntegrationTestDir, hasMaestroDir, hasMarker }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-bootstrap-'));
  if (pubspecHasIntegrationTest !== undefined) {
    fs.writeFileSync(path.join(tmp, 'pubspec.yaml'),
      pubspecHasIntegrationTest
        ? `name: x\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n  integration_test:\n    sdk: flutter\n`
        : `name: x\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n`);
  }
  if (hasIntegrationTestDir) fs.mkdirSync(path.join(tmp, 'integration_test'), { recursive: true });
  if (hasMaestroDir) fs.mkdirSync(path.join(tmp, '.maestro'), { recursive: true });
  if (hasMarker) {
    fs.mkdirSync(path.join(tmp, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.planning', '.flutter-ui-bootstrap-done'), '');
  }
  return tmp;
}

test.describe('checkBootstrapState (REQ-10-07)', () => {

  test('Case F1 — all present, marker present → ready, action:skip', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: true, hasIntegrationTestDir: true, hasMaestroDir: true, hasMarker: true });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.strictEqual(result.ready, true);
    assert.deepStrictEqual(result.missing, []);
    assert.strictEqual(result.action, 'skip');
  });

  test('Case F2 — missing integration_test dep → missing includes integration_test_dep', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: false, hasIntegrationTestDir: true, hasMaestroDir: true, hasMarker: false });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.strictEqual(result.ready, false);
    assert.ok(result.missing.includes('integration_test_dep'));
  });

  test('Case F3 — missing integration_test dir → missing includes integration_test_dir', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: true, hasIntegrationTestDir: false, hasMaestroDir: true, hasMarker: false });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.ok(result.missing.includes('integration_test_dir'));
  });

  test('Case F4 — missing .maestro dir → missing includes maestro_dir', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: true, hasIntegrationTestDir: true, hasMaestroDir: false, hasMarker: false });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.ok(result.missing.includes('maestro_dir'));
  });

  test('Case F5 — multiple missing items combine', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: false, hasIntegrationTestDir: false, hasMaestroDir: false, hasMarker: false });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.deepStrictEqual(result.missing.sort(), ['integration_test_dep', 'integration_test_dir', 'maestro_dir']);
  });

  test('Case F6 — first run (no marker) + missing items → action:warn', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: false, hasIntegrationTestDir: false, hasMaestroDir: false, hasMarker: false });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.strictEqual(result.action, 'warn');
  });

  test('Case F7 — subsequent run (marker present) + missing items → action:fail', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: false, hasIntegrationTestDir: false, hasMaestroDir: false, hasMarker: true });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.strictEqual(result.action, 'fail');
  });

  test('Case F8 — all present + marker → ready, action:skip', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: true, hasIntegrationTestDir: true, hasMaestroDir: true, hasMarker: true });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.strictEqual(result.ready, true);
    assert.strictEqual(result.action, 'skip');
  });

  test('Case F9 — setup_task content includes pubspec/dir/marker AND test_driver scaffold when action:warn', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: false, hasIntegrationTestDir: false, hasMaestroDir: false, hasMarker: false });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.strictEqual(result.action, 'warn');
    assert.ok(result.setup_task);
    assert.match(result.setup_task, /integration_test/);
    assert.match(result.setup_task, /\.maestro/);
    assert.match(result.setup_task, /\.flutter-ui-bootstrap-done/);
    // test_driver scaffold required for web flutter drive verification (per TRD 10-04b)
    assert.match(result.setup_task, /test_driver\/integration_test\.dart/);
    assert.match(result.setup_task, /integrationDriver\(\)/);
  });

  test('Case F10 — setup_task carries caution=pause-before-destructive attribute', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: false, hasIntegrationTestDir: false, hasMaestroDir: false, hasMarker: false });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.match(result.setup_task, /caution=.{1,5}pause-before-destructive/);
  });
});

// ─── Monorepo: Flutter package under <projectDir>/flutter/ (W0-4) ────────────

test.describe('checkBootstrapState — monorepo flutter/ package', () => {

  function makeMonorepoProject({ pubspecHasIntegrationTest, hasIntegrationTestDir, hasMaestroDir, hasMarker }) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-bootstrap-mono-'));
    const flutterDir = path.join(tmp, 'flutter');
    fs.mkdirSync(flutterDir, { recursive: true });
    if (pubspecHasIntegrationTest !== undefined) {
      fs.writeFileSync(path.join(flutterDir, 'pubspec.yaml'),
        pubspecHasIntegrationTest
          ? `name: x\ndependencies:\n  flutter:\n    sdk: flutter\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n  integration_test:\n    sdk: flutter\n`
          : `name: x\ndependencies:\n  flutter:\n    sdk: flutter\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n`);
    }
    if (hasIntegrationTestDir) fs.mkdirSync(path.join(flutterDir, 'integration_test'), { recursive: true });
    if (hasMaestroDir) fs.mkdirSync(path.join(flutterDir, '.maestro'), { recursive: true });
    if (hasMarker) {
      fs.mkdirSync(path.join(tmp, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.planning', '.flutter-ui-bootstrap-done'), '');
    }
    return tmp;
  }

  test('M1 — only flutter/pubspec.yaml (with flutter: sdk section) present → action !== skip / ready-shaped result, packageDir ends with /flutter', () => {
    const tmp = makeMonorepoProject({ pubspecHasIntegrationTest: false, hasIntegrationTestDir: false, hasMaestroDir: false, hasMarker: false });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.notStrictEqual(result.action, 'skip');
    assert.ok(result.packageDir, 'result carries packageDir');
    assert.ok(result.packageDir.endsWith(`${path.sep}flutter`), `packageDir "${result.packageDir}" ends with /flutter`);
    assert.strictEqual(result.prefix, 'flutter');
  });

  test('M2 — all infra present under flutter/ + marker at repo-root .planning/ → ready, action:skip', () => {
    const tmp = makeMonorepoProject({ pubspecHasIntegrationTest: true, hasIntegrationTestDir: true, hasMaestroDir: true, hasMarker: true });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.strictEqual(result.ready, true);
    assert.strictEqual(result.action, 'skip');
    assert.strictEqual(result.packageDir, path.join(tmp, 'flutter'));
  });

  test('M3 — checks resolve relative to flutter/, not repo root (root has neither integration_test dir nor .maestro)', () => {
    const tmp = makeMonorepoProject({ pubspecHasIntegrationTest: true, hasIntegrationTestDir: true, hasMaestroDir: true, hasMarker: false });
    // Sanity: nothing at the repo root itself.
    assert.ok(!fs.existsSync(path.join(tmp, 'pubspec.yaml')));
    assert.ok(!fs.existsSync(path.join(tmp, 'integration_test')));
    assert.ok(!fs.existsSync(path.join(tmp, '.maestro')));

    const result = checkBootstrapState({ projectDir: tmp });
    assert.strictEqual(result.ready, true, `expected ready; missing=${JSON.stringify(result.missing)}`);
  });

  test('M4 — root-only project (no flutter/) still resolves packageDir === projectDir, prefix ""', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: true, hasIntegrationTestDir: true, hasMaestroDir: true, hasMarker: true });
    const result = checkBootstrapState({ projectDir: tmp });
    assert.strictEqual(result.packageDir, tmp);
    assert.strictEqual(result.prefix, '');
  });

  test('M5 — neither root nor flutter/ has a Flutter pubspec → flutter-not-detected reason, action:warn (graceful, missing includes integration_test_dep)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-bootstrap-mono-'));
    const result = checkBootstrapState({ projectDir: tmp });
    assert.ok(result.missing.includes('integration_test_dep'));
    assert.strictEqual(result.action, 'warn');
  });
});

test.describe('df-tools verify flutter-ui-bootstrap (REQ-10-07)', () => {
  const { execSync } = require('node:child_process');
  const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

  test('Case G1 — --raw outputs JSON matching checkBootstrapState shape (all present)', () => {
    const tmp = makeProject({ pubspecHasIntegrationTest: true, hasIntegrationTestDir: true, hasMaestroDir: true, hasMarker: true });
    const out = execSync(`node '${DF_TOOLS}' verify flutter-ui-bootstrap '${tmp}' --raw`, { encoding: 'utf-8' });
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.ready, true);
    assert.strictEqual(parsed.action, 'skip');
  });

  test('Case G2 — subcommand listed in verify help', () => {
    let out = '';
    try {
      out = execSync(`node '${DF_TOOLS}' verify bogus 2>&1`, { encoding: 'utf-8' });
    } catch (e) {
      out = (e.stdout || '') + (e.stderr || '');
    }
    assert.ok(/flutter-ui-bootstrap/.test(out), `expected help text to mention flutter-ui-bootstrap; got: ${out}`);
  });

  test('Case G3 — bare temp dir produces action:warn + setup_task', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flutter-ui-bootstrap-bare-'));
    const out = execSync(`node '${DF_TOOLS}' verify flutter-ui-bootstrap '${tmp}' --raw`, { encoding: 'utf-8' });
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.action, 'warn');
    assert.ok(parsed.setup_task);
    assert.match(parsed.setup_task, /test_driver\/integration_test\.dart/);
  });
});

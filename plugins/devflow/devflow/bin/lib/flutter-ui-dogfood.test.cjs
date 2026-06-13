'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'flutter-ui-dogfood');
const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const FIXTURE_TRD = path.join(FIXTURE_DIR, '.planning', 'objectives', '99-sample', '99-01-TRD.md');
const FIXTURE_UAT = path.join(FIXTURE_DIR, '.planning', 'objectives', '99-sample', '99-sample-UAT.md');

function run(args, cwdArg) {
  return JSON.parse(execSync(`node ${DF_TOOLS} ${args} --raw`, { encoding: 'utf-8', cwd: cwdArg || FIXTURE_DIR }));
}

test.describe('Flutter UI dogfood end-to-end (REQ-10-03/04/05/06/07)', () => {

  // Clean any leftover UAT.md from a previous run before tests start
  test.before(() => {
    if (fs.existsSync(FIXTURE_UAT)) fs.unlinkSync(FIXTURE_UAT);
  });

  test('Case M1 — detect flutter-ui-scope fires lib_dart_files + pubspec_flutter_dep', () => {
    const result = run('detect flutter-ui-scope 99');
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.signals.lib_dart_files.fired, true);
    assert.strictEqual(result.signals.pubspec_flutter_dep.fired, true);
  });

  test('Case M2 — detector derives platform:[mobile, web] (BOTH platforms) and state_management:riverpod', () => {
    // Per user correction: derivePlatform returns ['mobile', 'web'] by default.
    const result = run('detect flutter-ui-scope 99');
    assert.deepStrictEqual([...result.platform].sort(), ['mobile', 'web']);
    assert.strictEqual(result.state_management, 'riverpod');
  });

  test('Case M3 — verify flutter-ui-bootstrap returns ready:true, action:skip (REQ-10-07 action:skip path)', () => {
    const result = run(`verify flutter-ui-bootstrap ${FIXTURE_DIR}`);
    assert.strictEqual(result.ready, true);
    assert.strictEqual(result.action, 'skip');
  });

  test('Case M4 — verify api-contract returns ok:true (no drift)', () => {
    const result = run(`verify api-contract ${FIXTURE_TRD}`);
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.drift, []);
  });

  test('Case M5 — drift detected after fixture file modification (in temp copy)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dogfood-drift-'));
    fs.cpSync(FIXTURE_DIR, tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'lib', 'api', 'sample_client.dart'), '// drift\n');
    const tmpTrd = path.join(tmp, '.planning', 'objectives', '99-sample', '99-01-TRD.md');
    const result = JSON.parse(execSync(`node ${DF_TOOLS} verify api-contract ${tmpTrd} --raw`, { encoding: 'utf-8', cwd: tmp }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.drift.length, 1);
    assert.strictEqual(result.drift[0].status, 'DRIFTED');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('Case M6 — verify flutter-state-coverage returns overall:verified for sample widget test', () => {
    const result = run(`verify flutter-state-coverage ${FIXTURE_TRD}`);
    assert.strictEqual(result.overall, 'verified');
    assert.strictEqual(result.state_management, 'riverpod');
    assert.ok(Array.isArray(result.artifacts));
    assert.strictEqual(result.artifacts.length, 1);
    assert.strictEqual(result.artifacts[0].status, 'verified');
  });

  test('Case M7 — generate uat writes UAT.md and reports test_count >= 8 (3 states × 2 platforms + 1 maestro + 1 web-integration)', () => {
    const result = run('generate uat 99');
    assert.strictEqual(result.generated, true);
    assert.ok(result.test_count >= 8,
      `expected test_count >= 8 (3 states × 2 platforms = 6 state rows + 1 maestro + 1 web-integration), got ${result.test_count}`);
  });

  test('Case M8 — generated UAT.md exists with status:testing frontmatter', () => {
    assert.ok(fs.existsSync(FIXTURE_UAT), `UAT.md not at ${FIXTURE_UAT}`);
    const content = fs.readFileSync(FIXTURE_UAT, 'utf-8');
    assert.match(content, /^---/);
    assert.match(content, /^status: testing/m);
    assert.match(content, /^objective: 99-sample/m);
  });

  test('Case M9 — UAT.md contains per-platform state rows (each state has both mobile and web annotations)', () => {
    const content = fs.readFileSync(FIXTURE_UAT, 'utf-8');
    // Each state row should reference its platform
    assert.match(content, /loading.*mobile|mobile.*loading/i);
    assert.match(content, /loading.*web|web.*loading/i);
    assert.match(content, /data.*mobile|mobile.*data/i);
    assert.match(content, /data.*web|web.*data/i);
    assert.match(content, /error.*mobile|mobile.*error/i);
    assert.match(content, /error.*web|web.*error/i);
  });

  test('Case M10 — UAT.md contains a web-integration row referencing flutter drive', () => {
    const content = fs.readFileSync(FIXTURE_UAT, 'utf-8');
    assert.match(content, /flutter drive.*--driver=test_driver\/integration_test\.dart/);
    assert.match(content, /--target=integration_test\/sample_flow_test\.dart/);
    assert.match(content, /-d chrome/);
    // No maestro_web references — Maestro is mobile-only by design
    assert.doesNotMatch(content, /maestro_web/);
  });

  // Clean up the auto-generated UAT.md so the test is idempotent.
  test.after(() => {
    if (fs.existsSync(FIXTURE_UAT)) fs.unlinkSync(FIXTURE_UAT);
  });
});

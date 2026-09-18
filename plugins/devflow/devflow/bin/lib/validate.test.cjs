'use strict';

/**
 * Test suite for lib/validate.cjs — cmdValidateHealth's engine-lag check (W0-2).
 *
 * Covers the plugin-vs-mirror-vs-main lag reporting added on top of the existing
 * .planning/ integrity checks: E020 (mirror-stale) and W021 (plugin-behind-main).
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { cmdValidateHealth } = require('./validate.cjs');

let tmpProject;
let tmpHome;

afterEach(() => {
  if (tmpProject && fs.existsSync(tmpProject)) {
    fs.rmSync(tmpProject, { recursive: true, force: true });
    tmpProject = null;
  }
  if (tmpHome && fs.existsSync(tmpHome)) {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    tmpHome = null;
  }
});

// Minimal .planning/ so cmdValidateHealth doesn't short-circuit on Check 1
// (missing .planning/ dir) before it ever reaches the engine-lag check.
function makePlanningProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-test-'));
  fs.mkdirSync(path.join(tmp, '.planning', 'objectives'), { recursive: true });
  return tmp;
}

function makeHome(pluginVersionMarker) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-home-'));
  if (pluginVersionMarker !== undefined) {
    const mirrorDir = path.join(home, '.claude', 'devflow');
    fs.mkdirSync(mirrorDir, { recursive: true });
    fs.writeFileSync(path.join(mirrorDir, '.plugin-version'), pluginVersionMarker, 'utf-8');
  }
  return home;
}

// cmdValidateHealth ends by calling helpers.cjs `output()`, which writes to
// stdout and calls process.exit(0). Mock both so the test process survives,
// and capture every stdout chunk so we can inspect the human-readable line
// (written separately, when !raw) and the JSON payload (always the last chunk).
function runHealth(cwd, options, raw) {
  const stdoutChunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { stdoutChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdValidateHealth(cwd, options, raw);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }

  const stdout = stdoutChunks.join('');
  // The JSON payload is always the final chunk written by helpers.cjs `output()`.
  const jsonChunk = stdoutChunks[stdoutChunks.length - 1];
  let json = null;
  try { json = JSON.parse(jsonChunk); } catch { /* leave null; assertions will fail loudly */ }

  return { exitCode, stdout, json };
}

describe('cmdValidateHealth — engine lag (E020 mirror-stale, W021 plugin-behind-main)', () => {

  test('E020 raised when mirror .plugin-version differs from the plugin version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome('2.5.0');

    const { json } = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    assert.ok(json, 'expected JSON output');
    const e020 = json.errors.find(e => e.code === 'E020');
    assert.ok(e020, `expected E020 in errors: ${JSON.stringify(json.errors)}`);
    assert.strictEqual(
      e020.message,
      'mirror-stale: ~/.claude/devflow is 2.5.0 but the plugin is 2.6.0'
    );
    assert.strictEqual(
      e020.fix,
      'Start a new session so sync-runtime re-mirrors, or run the sync hook'
    );
  });

  test('E020 absent when the mirror version matches the plugin version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome('2.6.0');

    const { json } = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const e020 = json.errors.find(e => e.code === 'E020');
    assert.strictEqual(e020, undefined, 'should not raise E020 when versions match');
  });

  test('E020 absent when .plugin-version is missing (fresh machine, no mirror yet)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome(); // no .plugin-version written at all

    const { json } = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const e020 = json.errors.find(e => e.code === 'E020');
    assert.strictEqual(e020, undefined, 'should not raise E020 with no mirror present');
  });

  test('W021 raised when mainVersionFn reports a version ahead of the plugin', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome('2.6.0');

    const { json } = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    const w021 = json.warnings.find(w => w.code === 'W021');
    assert.ok(w021, `expected W021 in warnings: ${JSON.stringify(json.warnings)}`);
    assert.strictEqual(w021.message, 'plugin-behind-main: installed 2.6.0, origin/main 2.7.1');
    assert.strictEqual(w021.fix, 'Update the plugin from the marketplace');
  });

  test('W021 absent when mainVersionFn returns null (checkout unreachable)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome('2.6.0');

    const { json } = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const w021 = json.warnings.find(w => w.code === 'W021');
    assert.strictEqual(w021, undefined, 'should not raise W021 when main version is unknown');
  });

  test('W021 absent when main is behind or equal to the plugin version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome('2.6.0');

    const behind = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => '2.5.9',
    }, false);
    assert.strictEqual(behind.json.warnings.find(w => w.code === 'W021'), undefined);

    const equal = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => '2.6.0',
    }, false);
    assert.strictEqual(equal.json.warnings.find(w => w.code === 'W021'), undefined);
  });

  test('engine row present with plugin, mirror, and main versions', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome('2.5.0');

    const { json } = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    assert.deepStrictEqual(json.engine, { plugin: '2.6.0', mirror: '2.5.0', main: '2.7.1' });
  });

  test('engine row reports null mirror/main when unavailable', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome(); // no mirror

    const { json } = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    assert.deepStrictEqual(json.engine, { plugin: '2.6.0', mirror: null, main: null });
  });

  // stdout must stay JSON-only in both modes: skills parse `validate health`'s
  // stdout as JSON, so any extra line ahead of (or after) the payload breaks
  // JSON.parse for every caller. The `engine` row inside the JSON is the report;
  // there is no separate human-readable text mode. (Controller ruling, fix
  // round 1: an earlier version of this change printed an `engine: ...` line
  // before the JSON in non-raw mode — reverted for exactly this reason.)
  test('non-raw output is pure JSON.parse-able stdout (engine row carries the report)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome('2.5.0');

    const { stdout, json } = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    assert.ok(json, 'expected parseable JSON');
    assert.deepStrictEqual(JSON.parse(stdout), json, 'entire stdout must be exactly the JSON payload — no extra lines');
    assert.deepStrictEqual(json.engine, { plugin: '2.6.0', mirror: '2.5.0', main: '2.7.1' });
  });

  test('raw output is pure JSON.parse-able stdout, identical shape to non-raw', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome('2.5.0');

    const { stdout, json } = runHealth(tmpProject, {
      pluginVersionFn: () => '2.6.0',
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, true);

    assert.ok(json, 'raw mode should still produce parseable JSON');
    assert.deepStrictEqual(JSON.parse(stdout), json, 'entire stdout must be exactly the JSON payload — no extra lines');
  });

  test('default seams (no injection) do not throw and produce an engine row', () => {
    tmpProject = makePlanningProject();

    // No pluginVersionFn/homeDir/mainVersionFn passed — exercises the real
    // defaults (helpers.pluginVersion, os.homedir(), the git-based main lookup).
    const { json } = runHealth(tmpProject, {}, false);

    assert.ok(json, 'expected JSON output with default seams');
    assert.ok('engine' in json, 'engine row should be present even with default seams');
    assert.strictEqual(typeof json.engine.plugin, 'string');
  });
});

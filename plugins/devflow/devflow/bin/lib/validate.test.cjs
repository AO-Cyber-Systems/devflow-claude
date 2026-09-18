'use strict';

/**
 * Test suite for lib/validate.cjs — cmdValidateHealth's engine-lag check (W0-2)
 * and the two lib/helpers.cjs lookups it depends on (fix round 2).
 *
 * Covers the installed-vs-mirror-vs-main lag reporting added on top of the
 * existing .planning/ integrity checks: E020 (mirror-stale) and W021
 * (plugin-behind-main).
 *
 * Fix round 2 background: the round-1 implementation compared the mirror's
 * `.plugin-version` against `helpers.pluginVersion()` — but when df-tools
 * runs from the ~/.claude/devflow mirror (every skill invocation), that
 * function's first candidate doesn't exist there, so it falls through to the
 * SAME `.plugin-version` file being compared against, making E020
 * structurally dead in production. This round switches to two independent
 * sources of truth the Claude Code plugin manager maintains:
 * ~/.claude/plugins/installed_plugins.json (helpers.installedPlugin) and
 * ~/.claude/plugins/known_marketplaces.json (helpers.marketplaceCheckout).
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { cmdValidateHealth, compareSemver } = require('./validate.cjs');
const { installedPlugin, marketplaceCheckout } = require('./helpers.cjs');

let tmpProject;
let tmpHome;
let tmpExtra; // for fixture dirs that live outside tmpHome (e.g. a marketplace checkout)

afterEach(() => {
  for (const dir of [tmpProject, tmpHome, tmpExtra]) {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpProject = null;
  tmpHome = null;
  tmpExtra = null;
});

// ─── Fixture builders ──────────────────────────────────────────────────────

// Minimal .planning/ so cmdValidateHealth doesn't short-circuit on Check 1
// (missing .planning/ dir) before it ever reaches the engine-lag check.
function makePlanningProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-test-'));
  fs.mkdirSync(path.join(tmp, '.planning', 'objectives'), { recursive: true });
  return tmp;
}

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-home-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf-8');
}

// Writes ~/.claude/devflow/.plugin-version — the mirror marker sync-runtime.js
// maintains, and the ONLY thing `mirror` reads.
function makeMirror(home, version) {
  const mirrorDir = path.join(home, '.claude', 'devflow');
  fs.mkdirSync(mirrorDir, { recursive: true });
  fs.writeFileSync(path.join(mirrorDir, '.plugin-version'), version, 'utf-8');
}

// Mirrors the real layout observed on a live machine during this task:
// ~/.claude/plugins/installed_plugins.json → { plugins: { "devflow@aocyber": [ {scope, installPath, version}, ... ] } }
// with installPath pointing at a cache dir holding .claude-plugin/plugin.json.
function makeInstalledPluginFixture(home, entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  const written = list.map((e, i) => {
    const installPath = e.installPath || path.join(home, '.claude', 'plugins', 'cache', 'aocyber', 'devflow', `slot-${i}`);
    if (e.cachePluginVersion !== undefined) {
      writeJson(path.join(installPath, '.claude-plugin', 'plugin.json'), { name: 'devflow', version: e.cachePluginVersion });
    } else if (e.omitCacheDir !== true) {
      fs.mkdirSync(installPath, { recursive: true });
    }
    return {
      scope: e.scope || 'user',
      installPath,
      version: e.registryVersion,
    };
  });
  writeJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), {
    version: 2,
    plugins: { 'devflow@aocyber': written },
  });
  return written;
}

// ~/.claude/plugins/known_marketplaces.json → { aocyber: { installLocation } }
function makeMarketplaceFixture(home, installLocation) {
  fs.mkdirSync(installLocation, { recursive: true });
  writeJson(path.join(home, '.claude', 'plugins', 'known_marketplaces.json'), {
    aocyber: { installLocation },
  });
}

// cmdValidateHealth ends by calling helpers.cjs `output()`, which writes JSON
// to stdout and calls process.exit(0). Mock both so the test process survives.
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
  const jsonChunk = stdoutChunks[stdoutChunks.length - 1];
  let json = null;
  try { json = JSON.parse(jsonChunk); } catch { /* leave null; assertions will fail loudly */ }

  return { exitCode, stdout, json };
}

// ─── helpers.installedPlugin ───────────────────────────────────────────────

describe('helpers.installedPlugin', () => {
  test('reads version from the cache dir .claude-plugin/plugin.json via installPath', () => {
    tmpHome = makeHome();
    makeInstalledPluginFixture(tmpHome, { scope: 'user', registryVersion: '2.6.0', cachePluginVersion: '2.6.0' });

    const info = installedPlugin({ homeDir: tmpHome });
    assert.ok(info, 'expected an installed-plugin result');
    assert.strictEqual(info.version, '2.6.0');
    assert.ok(info.installPath.includes('cache'));
  });

  test('falls back to the registry version field when the cache plugin.json is unreadable', () => {
    tmpHome = makeHome();
    makeInstalledPluginFixture(tmpHome, { scope: 'user', registryVersion: '2.6.0', omitCacheDir: false });
    // cachePluginVersion intentionally omitted above → no .claude-plugin/plugin.json written,
    // only the bare installPath directory — exercises the fallback path.

    const info = installedPlugin({ homeDir: tmpHome });
    assert.ok(info);
    assert.strictEqual(info.version, '2.6.0');
  });

  test('prefers the scope:"user" entry when multiple entries exist (real registries list project scope too)', () => {
    tmpHome = makeHome();
    makeInstalledPluginFixture(tmpHome, [
      { scope: 'project', registryVersion: '2.6.0', cachePluginVersion: '2.6.0' },
      { scope: 'user', registryVersion: '2.6.0', cachePluginVersion: '2.6.0' },
    ]);

    const info = installedPlugin({ homeDir: tmpHome });
    assert.ok(info);
    assert.strictEqual(info.version, '2.6.0');
  });

  test('returns null when installed_plugins.json is missing', () => {
    tmpHome = makeHome();
    assert.strictEqual(installedPlugin({ homeDir: tmpHome }), null);
  });

  test('returns null when the devflow@aocyber key is absent', () => {
    tmpHome = makeHome();
    writeJson(path.join(tmpHome, '.claude', 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: { 'other-plugin@somewhere': [{ scope: 'user', version: '1.0.0' }] },
    });
    assert.strictEqual(installedPlugin({ homeDir: tmpHome }), null);
  });
});

// ─── helpers.marketplaceCheckout ───────────────────────────────────────────

describe('helpers.marketplaceCheckout', () => {
  test('returns installLocation when it names an existing directory', () => {
    tmpHome = makeHome();
    tmpExtra = fs.mkdtempSync(path.join(os.tmpdir(), 'df-validate-marketplace-'));
    makeMarketplaceFixture(tmpHome, tmpExtra);

    assert.strictEqual(marketplaceCheckout({ homeDir: tmpHome }), tmpExtra);
  });

  test('returns null when known_marketplaces.json is missing', () => {
    tmpHome = makeHome();
    assert.strictEqual(marketplaceCheckout({ homeDir: tmpHome }), null);
  });

  test('returns null when the aocyber key is absent', () => {
    tmpHome = makeHome();
    writeJson(path.join(tmpHome, '.claude', 'plugins', 'known_marketplaces.json'), {
      'claude-plugins-official': { installLocation: '/nonexistent' },
    });
    assert.strictEqual(marketplaceCheckout({ homeDir: tmpHome }), null);
  });

  test('returns null when installLocation does not exist on disk', () => {
    tmpHome = makeHome();
    writeJson(path.join(tmpHome, '.claude', 'plugins', 'known_marketplaces.json'), {
      aocyber: { installLocation: path.join(tmpHome, 'does-not-exist') },
    });
    assert.strictEqual(marketplaceCheckout({ homeDir: tmpHome }), null);
  });
});

// ─── compareSemver ──────────────────────────────────────────────────────────

describe('compareSemver', () => {
  test('numeric comparison, not lexicographic: 2.10.0 > 2.9.0', () => {
    assert.strictEqual(compareSemver('2.10.0', '2.9.0'), 1);
    assert.strictEqual(compareSemver('2.9.0', '2.10.0'), -1);
  });

  test('equal versions compare 0', () => {
    assert.strictEqual(compareSemver('2.6.0', '2.6.0'), 0);
  });

  test('handles a 2-segment input (missing patch treated as 0)', () => {
    assert.strictEqual(compareSemver('2.7', '2.6.9'), 1);
    assert.strictEqual(compareSemver('2.7', '2.7.0'), 0);
  });
});

// ─── cmdValidateHealth — E020 / W021 / engine row ──────────────────────────

describe('cmdValidateHealth — engine lag (E020 mirror-stale, W021 plugin-behind-main)', () => {

  test('E020 raised when mirror differs from the installed plugin version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    assert.ok(json, 'expected JSON output');
    const e020 = json.errors.find(e => e.code === 'E020');
    assert.ok(e020, `expected E020 in errors: ${JSON.stringify(json.errors)}`);
    assert.strictEqual(
      e020.message,
      'mirror-stale: ~/.claude/devflow is 2.5.0 but the installed plugin is 2.6.0'
    );
    assert.strictEqual(
      e020.fix,
      'Start a new session so sync-runtime re-mirrors, or run the sync hook, or run `/plugin update devflow@aocyber`'
    );
  });

  test('E020 absent when the mirror version matches the installed plugin version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const e020 = json.errors.find(e => e.code === 'E020');
    assert.strictEqual(e020, undefined, 'should not raise E020 when versions match');
  });

  test('E020 absent when .plugin-version is missing (fresh machine, no mirror yet)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome(); // no mirror written at all

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const e020 = json.errors.find(e => e.code === 'E020');
    assert.strictEqual(e020, undefined, 'should not raise E020 with no mirror present');
  });

  test('E020 absent when the installed plugin is unknown (installedPluginFn returns null)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => null,
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const e020 = json.errors.find(e => e.code === 'E020');
    assert.strictEqual(e020, undefined, 'should not raise E020 when installed is unknown');
  });

  test('W021 raised when mainVersionFn reports a version ahead of the installed plugin', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
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
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    const w021 = json.warnings.find(w => w.code === 'W021');
    assert.strictEqual(w021, undefined, 'should not raise W021 when main version is unknown');
  });

  test('W021 absent when installed is unknown, even if mainVersionFn returns a version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => null,
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    const w021 = json.warnings.find(w => w.code === 'W021');
    assert.strictEqual(w021, undefined, 'should not raise W021 when installed is unknown');
  });

  test('W021 absent when main is behind or equal to the installed plugin version', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.6.0');

    const behind = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.5.9',
    }, false);
    assert.strictEqual(behind.json.warnings.find(w => w.code === 'W021'), undefined);

    const equal = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.6.0',
    }, false);
    assert.strictEqual(equal.json.warnings.find(w => w.code === 'W021'), undefined);
  });

  test('engine row present with running, mirror, installed, and main versions', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    assert.strictEqual(json.engine.mirror, '2.5.0');
    assert.strictEqual(json.engine.installed, '2.6.0');
    assert.strictEqual(json.engine.main, '2.7.1');
    // `running` comes from the real (uninjected) helpers.pluginVersion() —
    // just assert it's present and a string, its exact value is this
    // machine's engine, not a seam under test here.
    assert.strictEqual(typeof json.engine.running, 'string');
    assert.ok(json.engine.running.length > 0);
  });

  test('engine row reports null mirror/installed/main when unavailable', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome(); // no mirror

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => null,
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, false);

    assert.strictEqual(json.engine.mirror, null);
    assert.strictEqual(json.engine.installed, null);
    assert.strictEqual(json.engine.main, null);
  });

  // stdout must stay JSON-only in both modes: skills parse `validate health`'s
  // stdout as JSON. The `engine` row inside the JSON is the report; there is
  // no separate human-readable text mode. (Controller ruling, fix round 1.)
  test('non-raw output is pure JSON.parse-able stdout (engine row carries the report)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { stdout, json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, false);

    assert.ok(json, 'expected parseable JSON');
    assert.deepStrictEqual(JSON.parse(stdout), json, 'entire stdout must be exactly the JSON payload — no extra lines');
  });

  test('raw output is pure JSON.parse-able stdout, identical shape to non-raw', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { stdout, json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.6.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => '2.7.1',
    }, true);

    assert.ok(json, 'raw mode should still produce parseable JSON');
    assert.deepStrictEqual(JSON.parse(stdout), json, 'entire stdout must be exactly the JSON payload — no extra lines');
  });

  test('default seams (no injection) do not throw and produce an engine row', () => {
    tmpProject = makePlanningProject();

    // No installedPluginFn/homeDir passed — exercises the real defaults
    // (helpers.installedPlugin, os.homedir(), helpers.pluginVersion) against
    // this machine. mainVersionFn IS stubbed: the default performs a real
    // `git fetch` in the user's marketplace clone — no network in unit tests.
    const { json } = runHealth(tmpProject, { mainVersionFn: () => null }, false);

    assert.ok(json, 'expected JSON output with default seams');
    assert.ok('engine' in json, 'engine row should be present even with default seams');
    assert.strictEqual(typeof json.engine.running, 'string');
    assert.strictEqual(json.engine.main, null);
  });

  // Spec: every tool output carries engine_version/schema_version so a consumer
  // can reject a report produced by a stale engine — on BOTH output paths.
  test('health output carries engine_version + schema_version (normal path)', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');

    const { json } = runHealth(tmpProject, {
      installedPluginFn: () => ({ version: '2.5.0', installPath: '/fake' }),
      homeDir: tmpHome,
      mainVersionFn: () => null,
    }, true);

    assert.ok(json);
    assert.strictEqual(typeof json.engine_version, 'string');
    assert.match(json.engine_version, /^\d+\.\d+\.\d+/);
    assert.strictEqual(json.schema_version, 1);
  });

  test('health output carries engine_version + schema_version on the E001 early return (no .planning/)', () => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-health-noplanning-'));

    const { json } = runHealth(tmpProject, { mainVersionFn: () => null }, true);

    assert.ok(json);
    assert.strictEqual(json.status, 'broken');
    assert.ok(json.errors.some(e => e.code === 'E001'), 'E001 raised');
    assert.strictEqual(typeof json.engine_version, 'string');
    assert.strictEqual(json.schema_version, 1);
  });

  // The end-to-end case the round-1 review flagged as missing: drive
  // cmdValidateHealth with ONLY homeDir pointed at a fixture (mirror +
  // installed_plugins.json + cache plugin.json) and mainVersionFn stubbed
  // (avoids a real network/git call) — installedPluginFn is left at its
  // real default (helpers.installedPlugin) to prove homeDir actually reaches
  // it and E020 fires on the mirror-vs-installed path exactly as it would
  // for a real skill invocation running from ~/.claude/devflow.
  test('end-to-end mirror path: default installedPluginFn + fixture homeDir → E020 fires on real mismatch', () => {
    tmpProject = makePlanningProject();
    tmpHome = makeHome();
    makeMirror(tmpHome, '2.5.0');
    makeInstalledPluginFixture(tmpHome, { scope: 'user', registryVersion: '2.6.0', cachePluginVersion: '2.6.0' });

    const { json } = runHealth(tmpProject, {
      homeDir: tmpHome,
      mainVersionFn: () => null, // avoid a real network/git call in this test
      // installedPluginFn intentionally NOT overridden — exercises the real
      // helpers.installedPlugin() default reading the fixture via homeDir.
    }, false);

    assert.ok(json, 'expected JSON output');
    const e020 = json.errors.find(e => e.code === 'E020');
    assert.ok(e020, `expected E020 via the real installedPlugin() default: ${JSON.stringify(json.errors)}`);
    assert.strictEqual(
      e020.message,
      'mirror-stale: ~/.claude/devflow is 2.5.0 but the installed plugin is 2.6.0'
    );
    assert.strictEqual(json.engine.mirror, '2.5.0');
    assert.strictEqual(json.engine.installed, '2.6.0');
  });
});

/**
 * Tests for sync-runtime.js SessionStart hook.
 *
 * All tests use isolated tmpdir for BOTH source (CLAUDE_PLUGIN_ROOT) and
 * target (HOME). NEVER passes real HOME or repo root as CLAUDE_PLUGIN_ROOT —
 * doing so would overwrite the live ~/.claude/devflow/ mirror mid-session.
 *
 * Test cases (per TRD 23-01 ## Test list):
 *   1. Fresh install — all four subdirs mirrored, .plugin-version written
 *   2. Version match + intact mirror — hook exits without modifying target
 *   3. Version mismatch — target re-synced, stale file removed
 *   4. Exclusion — *.test.cjs NOT mirrored; sibling *.cjs IS mirrored
 *   5. Exclusion — *.test.js NOT mirrored in any synced subdir
 *   6. Exclusion — __fixtures__/ dir NOT present in target
 *   7. Self-heal — marker current but bin/df-tools.cjs missing → re-syncs
 *   8. Atomicity hygiene — no devflow-tmp-* entries remain after sync
 *   9. Failure path — missing CLAUDE_PLUGIN_ROOT → exits 0, writes nothing
 *  10. Failure path — unreadable/missing plugin.json → exits 0, target untouched
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'sync-runtime.js');
const TEST_VERSION = '9.9.9-test';

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal self-contained tmp tree:
 *
 *   <root>/
 *     plugin-root/
 *       .claude-plugin/plugin.json  (declares version 9.9.9-test)
 *       devflow/
 *         bin/df-tools.cjs          (stub)
 *         bin/lib/helper.cjs        (stub — should be mirrored)
 *         bin/lib/helper.test.cjs   (test file — should NOT be mirrored)
 *         bin/lib/__fixtures__/sample.json  (fixture — should NOT be mirrored)
 *         workflows/wf.md           (stub — should be mirrored)
 *         references/ref.md         (stub — should be mirrored)
 *         templates/tpl.md          (stub — should be mirrored)
 *     home/                         (fake HOME — target is home/.claude/devflow)
 *
 * Returns { root, pluginRoot, devflowSrc, home, targetDir, versionFile }
 */
function makeTmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-rt-'));

  const pluginRoot = path.join(root, 'plugin-root');
  const claudePluginDir = path.join(pluginRoot, '.claude-plugin');
  const devflowSrc = path.join(pluginRoot, 'devflow');

  // .claude-plugin/plugin.json
  fs.mkdirSync(claudePluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudePluginDir, 'plugin.json'),
    JSON.stringify({ version: TEST_VERSION })
  );

  // devflow/bin/df-tools.cjs
  fs.mkdirSync(path.join(devflowSrc, 'bin', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(devflowSrc, 'bin', 'df-tools.cjs'), '// stub df-tools');
  // devflow/bin/lib/helper.cjs (should mirror)
  fs.writeFileSync(path.join(devflowSrc, 'bin', 'lib', 'helper.cjs'), '// stub helper');
  // devflow/bin/lib/helper.test.cjs (should NOT mirror — test file)
  fs.writeFileSync(path.join(devflowSrc, 'bin', 'lib', 'helper.test.cjs'), '// test stub');
  // devflow/bin/lib/__fixtures__/sample.json (should NOT mirror)
  fs.mkdirSync(path.join(devflowSrc, 'bin', 'lib', '__fixtures__'), { recursive: true });
  fs.writeFileSync(
    path.join(devflowSrc, 'bin', 'lib', '__fixtures__', 'sample.json'),
    '{"fixture":true}'
  );

  // devflow/workflows/wf.md
  fs.mkdirSync(path.join(devflowSrc, 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(devflowSrc, 'workflows', 'wf.md'), '# workflow stub');
  // devflow/references/ref.md
  fs.mkdirSync(path.join(devflowSrc, 'references'), { recursive: true });
  fs.writeFileSync(path.join(devflowSrc, 'references', 'ref.md'), '# reference stub');
  // devflow/templates/tpl.md
  fs.mkdirSync(path.join(devflowSrc, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(devflowSrc, 'templates', 'tpl.md'), '# template stub');

  // home dir (fake HOME)
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });

  const targetDir = path.join(home, '.claude', 'devflow');
  const versionFile = path.join(targetDir, '.plugin-version');

  return { root, pluginRoot, devflowSrc, home, targetDir, versionFile };
}

/**
 * Spawn the hook subprocess with controlled env.
 * Always pass fake HOME and fake CLAUDE_PLUGIN_ROOT to avoid live-mirror hazard.
 */
function runHook(pluginRoot, home, extraEnv = {}) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      HOME: home,
      ...extraEnv,
    },
  });
}

/** Recursively collect all file paths under dir (relative to dir). */
function listFiles(dir) {
  const results = [];
  function walk(current, rel) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relPath = rel ? rel + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name), relPath);
      } else {
        results.push(relPath);
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir, '');
  return results;
}

// ---------------------------------------------------------------------------
// Test 1: Fresh install — all four subdirs mirrored, .plugin-version written
// ---------------------------------------------------------------------------

describe('Test 1: Fresh install', () => {
  test('all four subdirs mirrored and .plugin-version written', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, `hook exited non-zero: ${result.stderr}`);

    // .plugin-version written with correct version
    assert.ok(fs.existsSync(versionFile), '.plugin-version not written');
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION);

    // All four subdirs exist in target
    for (const sub of ['workflows', 'references', 'templates', 'bin']) {
      assert.ok(
        fs.existsSync(path.join(targetDir, sub)),
        `target/${sub} not created`
      );
    }

    // Key content files present
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs')));
    assert.ok(fs.existsSync(path.join(targetDir, 'workflows', 'wf.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'references', 'ref.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'templates', 'tpl.md')));
  });
});

// ---------------------------------------------------------------------------
// Test 2: Version match + intact mirror — hook exits without modifying target
// ---------------------------------------------------------------------------

describe('Test 2: Version match + intact sentinel — early exit', () => {
  test('does not modify target when version matches and sentinel present', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Pre-build the target (simulate an already-synced state)
    fs.mkdirSync(path.join(targetDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'bin', 'df-tools.cjs'), '// already synced');
    fs.writeFileSync(versionFile, TEST_VERSION);

    // Write a canary file that should remain untouched
    const canary = path.join(targetDir, 'bin', 'canary.txt');
    fs.writeFileSync(canary, 'canary-content');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // Canary should still exist (hook exited early without re-syncing)
    assert.ok(fs.existsSync(canary), 'canary file removed — hook did not early-exit');
    assert.equal(fs.readFileSync(canary, 'utf8'), 'canary-content');
  });
});

// ---------------------------------------------------------------------------
// Test 3: Version mismatch — target re-synced, stale file removed
// ---------------------------------------------------------------------------

describe('Test 3: Version mismatch — full re-sync', () => {
  test('old stale file in target subdir is removed after swap', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Pre-build target with old version and stale file
    fs.mkdirSync(path.join(targetDir, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'bin', 'df-tools.cjs'), '// old version');
    const staleFile = path.join(targetDir, 'bin', 'stale-old.cjs');
    fs.writeFileSync(staleFile, '// this should be gone after re-sync');
    fs.writeFileSync(versionFile, '1.0.0-old');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // Version marker updated
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION);
    // Stale file is gone (atomic rename replaced entire subdir)
    assert.ok(!fs.existsSync(staleFile), 'stale file still present after re-sync');
    // New content is there
    assert.ok(fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs')));
  });
});

// ---------------------------------------------------------------------------
// Test 4: Exclusion — *.test.cjs NOT mirrored; sibling *.cjs IS mirrored
// ---------------------------------------------------------------------------

describe('Test 4: Exclusion — *.test.cjs not mirrored', () => {
  test('bin/lib/helper.test.cjs absent; bin/lib/helper.cjs present in target', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // Test file must NOT be in target
    const testFile = path.join(targetDir, 'bin', 'lib', 'helper.test.cjs');
    assert.ok(!fs.existsSync(testFile), 'helper.test.cjs should not be mirrored');

    // Non-test sibling MUST be in target
    const libFile = path.join(targetDir, 'bin', 'lib', 'helper.cjs');
    assert.ok(fs.existsSync(libFile), 'helper.cjs should be mirrored');
  });
});

// ---------------------------------------------------------------------------
// Test 5: Exclusion — *.test.js NOT mirrored in any synced subdir
// ---------------------------------------------------------------------------

describe('Test 5: Exclusion — *.test.js not mirrored', () => {
  test('a .test.js file placed in workflows/ is not mirrored', (t) => {
    const { root, pluginRoot, devflowSrc, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Add a .test.js file to workflows source
    fs.writeFileSync(
      path.join(devflowSrc, 'workflows', 'workflow.test.js'),
      '// test workflow stub'
    );

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // .test.js must NOT be in target
    const testFile = path.join(targetDir, 'workflows', 'workflow.test.js');
    assert.ok(!fs.existsSync(testFile), 'workflow.test.js should not be mirrored');

    // Non-test .md file IS there
    assert.ok(fs.existsSync(path.join(targetDir, 'workflows', 'wf.md')));
  });
});

// ---------------------------------------------------------------------------
// Test 6: Exclusion — __fixtures__/ dir NOT mirrored
// ---------------------------------------------------------------------------

describe('Test 6: Exclusion — __fixtures__/ dir not mirrored', () => {
  test('bin/lib/__fixtures__/ absent from target; parent bin/lib/ present', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // __fixtures__ dir must NOT be in target
    const fixturesDir = path.join(targetDir, 'bin', 'lib', '__fixtures__');
    assert.ok(!fs.existsSync(fixturesDir), '__fixtures__/ should not be mirrored');

    // sample.json inside __fixtures__ must NOT be mirrored
    const sampleFile = path.join(targetDir, 'bin', 'lib', '__fixtures__', 'sample.json');
    assert.ok(!fs.existsSync(sampleFile), '__fixtures__/sample.json should not be mirrored');

    // Parent lib/ with non-test sibling IS mirrored
    const libDir = path.join(targetDir, 'bin', 'lib');
    assert.ok(fs.existsSync(libDir), 'bin/lib/ should be mirrored');
    assert.ok(fs.existsSync(path.join(libDir, 'helper.cjs')), 'helper.cjs should be mirrored');
  });
});

// ---------------------------------------------------------------------------
// Test 7: Self-heal — version matches but bin/df-tools.cjs missing → re-syncs
// ---------------------------------------------------------------------------

describe('Test 7: Self-heal — sentinel missing forces re-sync', () => {
  test('re-syncs when version marker matches but bin/df-tools.cjs absent', (t) => {
    const { root, pluginRoot, home, targetDir, versionFile } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Set up target: version marker matches but no sentinel (incomplete mirror)
    fs.mkdirSync(targetDir, { recursive: true });
    // Write the version marker WITHOUT the sentinel
    fs.writeFileSync(versionFile, TEST_VERSION);
    // Do NOT create bin/df-tools.cjs — this is the corruption mode

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // After self-heal, sentinel should exist
    assert.ok(
      fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs')),
      'self-heal failed: bin/df-tools.cjs still missing'
    );
    // Version marker should reflect the version
    assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), TEST_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Test 8: Atomicity hygiene — no devflow-tmp-* entries remain after sync
// ---------------------------------------------------------------------------

describe('Test 8: Atomicity hygiene — no stale tmp dirs', () => {
  test('no devflow-tmp-* entries in targetDir after successful sync', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // No devflow-tmp-* dirs should remain in targetDir
    if (fs.existsSync(targetDir)) {
      const entries = fs.readdirSync(targetDir);
      const tmpEntries = entries.filter(e => e.startsWith('devflow-tmp-'));
      assert.deepEqual(tmpEntries, [], `stale tmp dirs remain: ${tmpEntries.join(', ')}`);
    }
  });

  test('stale devflow-tmp-* dirs from a prior crashed run are swept before sync', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Pre-create a stale tmp dir (simulating a previously crashed run)
    fs.mkdirSync(targetDir, { recursive: true });
    const staleDir = path.join(targetDir, 'devflow-tmp-bin-99999');
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, 'stale.cjs'), '// stale');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0);

    // Stale tmp dir should be gone
    assert.ok(!fs.existsSync(staleDir), 'stale devflow-tmp-* dir was not swept');
    // No new tmp dirs remain either
    const entries = fs.readdirSync(targetDir);
    const tmpEntries = entries.filter(e => e.startsWith('devflow-tmp-'));
    assert.deepEqual(tmpEntries, []);
  });
});

// ---------------------------------------------------------------------------
// Test 9: Failure path — missing CLAUDE_PLUGIN_ROOT → exits 0, writes nothing
// ---------------------------------------------------------------------------

describe('Test 9: Failure path — missing CLAUDE_PLUGIN_ROOT', () => {
  test('exits 0 and writes nothing to target when CLAUDE_PLUGIN_ROOT absent', (t) => {
    const { root, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Spawn hook without CLAUDE_PLUGIN_ROOT
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: undefined,
        HOME: home,
      },
    });

    assert.equal(result.status, 0, 'hook must exit 0 even on missing env var');
    // Target directory should not have been created
    assert.ok(
      !fs.existsSync(path.join(targetDir, '.plugin-version')),
      '.plugin-version should not be written when CLAUDE_PLUGIN_ROOT missing'
    );
  });
});

// ---------------------------------------------------------------------------
// Test 10: Failure path — missing plugin.json → exits 0, target untouched
// ---------------------------------------------------------------------------

describe('Test 10: Failure path — missing plugin.json', () => {
  test('exits 0 and does not write .plugin-version when plugin.json missing', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Remove plugin.json to simulate unreadable manifest
    const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
    fs.unlinkSync(manifestPath);

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, 'hook must exit 0 even when plugin.json missing');

    const versionFile = path.join(targetDir, '.plugin-version');
    assert.ok(
      !fs.existsSync(versionFile),
      '.plugin-version should not be written when plugin.json missing'
    );
  });

  test('exits 0 and does not write .plugin-version when plugin.json is malformed JSON', (t) => {
    const { root, pluginRoot, home, targetDir } = makeTmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Overwrite plugin.json with invalid JSON
    const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
    fs.writeFileSync(manifestPath, '{ not valid json !!');

    const result = runHook(pluginRoot, home);
    assert.equal(result.status, 0, 'hook must exit 0 even when plugin.json is malformed');

    const versionFile = path.join(targetDir, '.plugin-version');
    assert.ok(
      !fs.existsSync(versionFile),
      '.plugin-version should not be written when plugin.json malformed'
    );
  });
});

// ---------------------------------------------------------------------------
// Bonus: Exclusion regexes do NOT match references/deviation-rules.md
// (regression guard for TRD 23-05 which ships this file through the mirror)
// ---------------------------------------------------------------------------

describe('Regression: exclusion patterns do not match references/*.md', () => {
  test('references/deviation-rules.md is not excluded', () => {
    const MIRROR_EXCLUDE = [/\.test\.cjs$/, /\.test\.js$/, /(^|\/)__fixtures__(\/|$)/];
    const testPath = 'references/deviation-rules.md';
    const excluded = MIRROR_EXCLUDE.some(r => r.test(testPath));
    assert.equal(excluded, false, 'references/deviation-rules.md must not be excluded');
  });
});

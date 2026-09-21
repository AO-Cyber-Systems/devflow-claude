'use strict';

/**
 * Test suite for lib/helpers.cjs `pluginVersion()` — the two fallback
 * branches that were previously only reachable by manipulating __dirname
 * (untestable in practice, so untested): the mirror-marker fallback when
 * the plugin.json candidate is absent, and the final '0.0.0' fallback when
 * neither candidate exists. Wave-0 follow-up F4.
 *
 * `pluginVersion()` now accepts an optional `{ homeDir, manifestPath }`
 * options object so both candidates can be pointed at fixture paths without
 * touching __dirname; defaults are unchanged and no production caller
 * passes the object.
 */

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { pluginVersion } = require('./helpers.cjs');

let tmpHome;

afterEach(() => {
  if (tmpHome && fs.existsSync(tmpHome)) fs.rmSync(tmpHome, { recursive: true, force: true });
  tmpHome = null;
});

describe('pluginVersion() — mirror-marker fallback', () => {
  test('returns the trimmed contents of <homeDir>/.claude/devflow/.plugin-version when the plugin.json candidate is absent', () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-pluginversion-'));
    const markerDir = path.join(tmpHome, '.claude', 'devflow');
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(markerDir, '.plugin-version'), '  2.7.1\n', 'utf-8');

    const missingManifest = path.join(tmpHome, 'no-such-plugin.json');

    const version = pluginVersion({ homeDir: tmpHome, manifestPath: missingManifest });
    assert.strictEqual(version, '2.7.1', 'should return the trimmed marker contents');
  });
});

describe('pluginVersion() — final fallback', () => {
  test("returns '0.0.0' when neither the manifest candidate nor the mirror marker exist", () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-pluginversion-'));
    // Deliberately do NOT create <tmpHome>/.claude/devflow/.plugin-version.

    const missingManifest = path.join(tmpHome, 'no-such-plugin.json');

    const version = pluginVersion({ homeDir: tmpHome, manifestPath: missingManifest });
    assert.strictEqual(version, '0.0.0');
  });

  test("returns '0.0.0' when the mirror marker exists but is empty", () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'df-pluginversion-'));
    const markerDir = path.join(tmpHome, '.claude', 'devflow');
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(markerDir, '.plugin-version'), '   \n', 'utf-8');

    const missingManifest = path.join(tmpHome, 'no-such-plugin.json');

    const version = pluginVersion({ homeDir: tmpHome, manifestPath: missingManifest });
    assert.strictEqual(version, '0.0.0', 'a whitespace-only marker trims to empty and should not be returned as a version');
  });
});

'use strict';
// Tests for flutter-state-coverage.cjs (REQ-10-05)
// Covers: loadCatalog (H1-H3), verifyCoverage per library (I1-I4), confidence routing (J1-J3), skip/other (K1)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// RED: this import fails until flutter-state-coverage.cjs is created
const { loadCatalog, verifyCoverage } = require('./flutter-state-coverage.cjs');

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'flutter-state-coverage');
const CATALOG_PATH = path.join(__dirname, '..', '..', 'references', 'flutter-state-patterns.md');

const RIVERPOD_FULL = fs.readFileSync(path.join(FIXTURE_DIR, 'widget_test_riverpod_full.dart'), 'utf-8');
const RIVERPOD_PARTIAL = fs.readFileSync(path.join(FIXTURE_DIR, 'widget_test_riverpod_partial.dart'), 'utf-8');
const BLOC_FULL = fs.readFileSync(path.join(FIXTURE_DIR, 'widget_test_bloc_full.dart'), 'utf-8');
const EMPTY = fs.readFileSync(path.join(FIXTURE_DIR, 'widget_test_empty.dart'), 'utf-8');

// ──────────────────────────────────────────────────────────────────────────────
// loadCatalog — Catalog loader cases
// ──────────────────────────────────────────────────────────────────────────────

test.describe('loadCatalog (REQ-10-05)', () => {
  test('Case H1 — returns map with 3 library keys: riverpod, bloc, setState', () => {
    const catalog = loadCatalog(CATALOG_PATH);
    assert.ok(catalog.riverpod, 'missing riverpod key');
    assert.ok(Array.isArray(catalog.riverpod), 'riverpod should be an array');
    assert.ok(catalog.bloc, 'missing bloc key');
    assert.ok(Array.isArray(catalog.bloc), 'bloc should be an array');
    assert.ok(catalog.setState, 'missing setState key');
    assert.ok(Array.isArray(catalog.setState), 'setState should be an array');
    assert.ok(catalog.riverpod.length > 0, 'riverpod patterns should not be empty');
    assert.ok(catalog.bloc.length > 0, 'bloc patterns should not be empty');
    assert.ok(catalog.setState.length > 0, 'setState patterns should not be empty');
  });

  test('Case H2 — each catalog entry has name, pattern, covers (array), confidence fields', () => {
    const catalog = loadCatalog(CATALOG_PATH);
    for (const lib of ['riverpod', 'bloc', 'setState']) {
      for (const entry of catalog[lib]) {
        assert.ok(entry.name, `${lib} entry missing name: ${JSON.stringify(entry)}`);
        assert.ok(entry.pattern, `${lib} entry missing pattern: ${JSON.stringify(entry)}`);
        assert.ok(Array.isArray(entry.covers), `${lib} entry 'covers' should be an array: ${JSON.stringify(entry)}`);
        assert.ok(
          ['HIGH', 'MEDIUM', 'LOW'].includes(entry.confidence),
          `${lib} entry has invalid confidence '${entry.confidence}': ${JSON.stringify(entry)}`
        );
      }
    }
  });

  test('Case H3 — catalog includes the named patterns referenced by TRD 10-02', () => {
    const catalog = loadCatalog(CATALOG_PATH);
    const allNames = [
      ...catalog.riverpod.map(e => e.name),
      ...catalog.bloc.map(e => e.name),
      ...catalog.setState.map(e => e.name),
    ];
    const required = ['when_all_three', 'bloc_loading_state', 'bloc_loaded_data_state', 'bloc_error_state', 'is_loading_boolean'];
    for (const expected of required) {
      assert.ok(allNames.includes(expected), `missing expected pattern name: ${expected}`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// verifyCoverage — Riverpod cases
// ──────────────────────────────────────────────────────────────────────────────

test.describe('verifyCoverage Riverpod (REQ-10-05)', () => {
  let catalog;
  test.before(() => { catalog = loadCatalog(CATALOG_PATH); });

  test('Case I1 — full .when(loading, data, error) coverage → status:verified, no blockers', () => {
    const result = verifyCoverage({
      stateManagement: 'riverpod',
      declaredStates: ['loading', 'data', 'error'],
      widgetTestContent: RIVERPOD_FULL,
      catalog,
    });
    assert.strictEqual(result.status, 'verified', `expected verified, got ${result.status}. blockers=${JSON.stringify(result.blockers)}`);
    assert.deepStrictEqual(result.blockers, [], `expected no blockers, got ${JSON.stringify(result.blockers)}`);
    assert.ok(typeof result.coverage === 'object', 'should have coverage object');
  });

  test('Case I2 — partial fixture (.whenData only) with loading+data+error declared → HIGH misses in blockers', () => {
    const result = verifyCoverage({
      stateManagement: 'riverpod',
      declaredStates: ['loading', 'data', 'error'],
      widgetTestContent: RIVERPOD_PARTIAL,   // only .whenData(...)
      catalog,
    });
    // data should be covered (whenData HIGH pattern covers: [data])
    // loading + error should be missing HIGH patterns → blockers
    assert.notStrictEqual(result.status, 'verified', `should not be verified on partial fixture`);
    assert.ok(result.blockers.length > 0, `expected blockers for missing states, got ${JSON.stringify(result.blockers)}`);
    assert.ok(result.blockers.includes('loading'), `loading should be in blockers, got ${JSON.stringify(result.blockers)}`);
    assert.ok(result.blockers.includes('error'), `error should be in blockers, got ${JSON.stringify(result.blockers)}`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// verifyCoverage — Bloc cases
// ──────────────────────────────────────────────────────────────────────────────

test.describe('verifyCoverage Bloc (REQ-10-05)', () => {
  let catalog;
  test.before(() => { catalog = loadCatalog(CATALOG_PATH); });

  test('Case I3 — Bloc full switch (Loading/Loaded/Error) coverage → status:verified', () => {
    const result = verifyCoverage({
      stateManagement: 'bloc',
      declaredStates: ['loading', 'data', 'error'],
      widgetTestContent: BLOC_FULL,
      catalog,
    });
    assert.strictEqual(result.status, 'verified', `expected verified, got ${result.status}. blockers=${JSON.stringify(result.blockers)}`);
    assert.deepStrictEqual(result.blockers, [], `expected no blockers, got ${JSON.stringify(result.blockers)}`);
  });

  test('Case I4 — empty widget test → status:missing, all declared states in blockers', () => {
    const result = verifyCoverage({
      stateManagement: 'bloc',
      declaredStates: ['loading', 'data', 'error'],
      widgetTestContent: EMPTY,
      catalog,
    });
    assert.strictEqual(result.status, 'missing', `expected missing, got ${result.status}`);
    assert.deepStrictEqual(result.blockers.sort(), ['data', 'error', 'loading']);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// verifyCoverage — Confidence routing
// ──────────────────────────────────────────────────────────────────────────────

test.describe('verifyCoverage confidence routing (REQ-10-05)', () => {
  let catalog;
  test.before(() => { catalog = loadCatalog(CATALOG_PATH); });

  test('Case J3 — HIGH-confidence Riverpod miss on empty test → loading in blockers', () => {
    // For Riverpod, when_all_three and the loading-covering patterns are HIGH.
    // The empty fixture has no state patterns — any declared state with a HIGH pattern → blocker.
    const result = verifyCoverage({
      stateManagement: 'riverpod',
      declaredStates: ['loading'],
      widgetTestContent: EMPTY,
      catalog,
    });
    assert.ok(result.blockers.includes('loading'), `'loading' should be a blocker on empty, got blockers=${JSON.stringify(result.blockers)}`);
  });

  test('Case J1/J2 — setState patterns are all MEDIUM/LOW — miss goes to advisories not blockers', () => {
    // setState patterns are MEDIUM or LOW (never HIGH per flutter-state-patterns.md spec).
    // A miss on setState declared states → advisories, NOT blockers.
    const result = verifyCoverage({
      stateManagement: 'setState',
      declaredStates: ['loading'],
      widgetTestContent: EMPTY,
      catalog,
    });
    // setState has only MEDIUM/LOW patterns — misses must NOT appear in blockers
    assert.deepStrictEqual(result.blockers, [], `setState miss should go to advisories not blockers, got blockers=${JSON.stringify(result.blockers)}`);
    assert.ok(result.advisories.length > 0, `setState miss should produce advisories, got ${JSON.stringify(result.advisories)}`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// verifyCoverage — state_management:other / skip
// ──────────────────────────────────────────────────────────────────────────────

test.describe('verifyCoverage setState/other (REQ-10-05)', () => {
  let catalog;
  test.before(() => { catalog = loadCatalog(CATALOG_PATH); });

  test('Case K1 — state_management:other → status:skipped, no blockers, advisory emitted', () => {
    const result = verifyCoverage({
      stateManagement: 'other',
      declaredStates: ['loading'],
      widgetTestContent: EMPTY,
      catalog,
    });
    assert.strictEqual(result.status, 'skipped', `expected skipped, got ${result.status}`);
    assert.deepStrictEqual(result.blockers, [], `expected no blockers on skip, got ${JSON.stringify(result.blockers)}`);
    assert.ok(result.advisories.length > 0, `expected at least one advisory on skip, got ${JSON.stringify(result.advisories)}`);
    assert.ok(
      result.advisories.some(a => a.includes('other')),
      `advisory should mention 'other', got ${JSON.stringify(result.advisories)}`
    );
  });
});

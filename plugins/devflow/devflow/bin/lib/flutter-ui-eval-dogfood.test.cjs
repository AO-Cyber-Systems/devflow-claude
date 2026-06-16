'use strict';
// flutter-ui-eval-dogfood.test.cjs (UI-VISUAL-EVAL-JUDGE-02)
// CLI dogfood harness: drives df-tools `verify flutter-ui-eval` over the checked-in
// __fixtures__/flutter-ui-eval/ manifest with the OFFLINE label-echo judge (no network),
// exercising the REAL scoreState/scoreRun pipeline end-to-end. Mirrors flutter-ui-dogfood.test.cjs.
//
// Test list coverage: D1 (--help), D2 (--raw rollup over fixtures), F1 (flutter-ui eval reachable),
// DF1 (good->not-broken->pass), DF2 (broken-overflow->broken/high->fail),
// DF3 (run rollup verdict 'fail' w/ broken state listed), N1 (no real network call on this path).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'flutter-ui-eval');
const MANIFEST = path.join(FIXTURE_DIR, 'manifest.json');

// Run df-tools and capture stdout (no --raw appended here so callers control flags exactly).
function runRaw(argStr, opts = {}) {
  return execSync(`node ${DF_TOOLS} ${argStr}`, { encoding: 'utf-8', ...opts });
}
function runJSON(argStr) {
  return JSON.parse(runRaw(`${argStr} --raw`));
}

test.describe('flutter-ui-eval CLI dogfood (UI-VISUAL-EVAL-JUDGE-02)', () => {

  test('Case D1 — verify flutter-ui-eval --help exits 0 and prints usage (no crash, no network)', () => {
    const out = runRaw('verify flutter-ui-eval --help');
    assert.match(out, /flutter-ui-eval/);
    assert.match(out, /verify|usage|Usage/);
  });

  test('Case D2 — verify flutter-ui-eval <manifest> --raw emits a scoreRun rollup JSON', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    assert.ok(rollup && typeof rollup === 'object', 'rollup is an object');
    assert.ok('verdict' in rollup, 'rollup has a verdict');
    assert.ok(rollup.counts && typeof rollup.counts === 'object', 'rollup has counts');
    assert.ok(Array.isArray(rollup.fails), 'rollup has fails[]');
    // Offline-judge provenance: the dogfood path must declare it never hit the network.
    assert.strictEqual(rollup.network, false, 'rollup asserts no network call (offline judge)');
  });

  test('Case F1 — flutter-ui eval is a reachable subcommand (not "Unknown ... Available: setup")', () => {
    // Should route to the same handler; --help is the safe reachability probe.
    const out = runRaw('flutter-ui eval --help');
    assert.match(out, /flutter-ui-eval|eval/);
    assert.doesNotMatch(out, /Unknown flutter-ui subcommand/);
  });

  test('Case DF1 — known-good capture -> state verdict pass', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    const good = rollup.states.find(s => s.state_id === 'good-dashboard');
    assert.ok(good, 'good-dashboard state present in rollup');
    assert.strictEqual(good.verdict, 'pass');
    assert.strictEqual(good.is_broken, false);
  });

  test('Case DF2 — known-broken overflow capture -> is_broken:true, defect overflow/high, verdict fail', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    const broken = rollup.states.find(s => s.state_id === 'broken-overflow');
    assert.ok(broken, 'broken-overflow state present in rollup');
    assert.strictEqual(broken.is_broken, true);
    assert.strictEqual(broken.verdict, 'fail');
    assert.ok(Array.isArray(broken.defects) && broken.defects.length > 0, 'has defects');
    assert.ok(broken.defects.some(d => d.type === 'overflow' && d.severity === 'high'),
      'overflow/high defect recorded');
  });

  test('Case DF3 — scoreRun rollup over the fixture set -> verdict fail, broken state listed', () => {
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    assert.strictEqual(rollup.verdict, 'fail');
    assert.deepStrictEqual(rollup.fails, ['broken-overflow']);
    assert.strictEqual(rollup.counts.pass, 1);
    assert.strictEqual(rollup.counts.fail, 1);
  });

  test('Case N1 — dogfood/verify path never reaches the real network judge (offline flag asserted)', () => {
    // The handler's offline/dogfood path injects a label-echo judge; the rollup carries
    // network:false as the machine-checkable no-network guarantee for this path.
    const rollup = runJSON(`verify flutter-ui-eval ${MANIFEST}`);
    assert.strictEqual(rollup.network, false);
    assert.strictEqual(rollup.judge, 'offline-label-echo');
  });
});

'use strict';
// Tests for decideDesignReviewDefault in flutter-ui-eval-planner-default.cjs (Phase B,
// UI design-review layer). Pure decision fn: given a flutter-ui-scope detection result, decide
// whether the planner auto-notes the ADVISORY design-review pass (parallel to the ui-eval visual
// gate, but ALWAYS advisory:true / gating:false — it can NEVER gate the objective).
//
// Hand-built fixtures only (allow_generated_test_data:false) — zero network, zero LLM data.

const test = require('node:test');
const assert = require('node:assert');

const { decideDesignReviewDefault } = require('./flutter-ui-eval-planner-default.cjs');

// Hand-built scope fixtures (mirror flutter-ui-scope.cjs detectFlutterUIScope shape).
function uiScope(overrides = {}) {
  return Object.assign(
    { detected: true, signals: {}, platform: ['mobile', 'web'], state_management: 'riverpod' },
    overrides
  );
}
function nonUiScope() {
  return { detected: false, signals: {} };
}
function failsafeScope() {
  return { detected: false, error: 'no inputs' };
}

test.describe('decideDesignReviewDefault — Phase B advisory design-review default', () => {
  test('D1: detected ui scope → enabled:true, advisory:true, gating:false', () => {
    const r = decideDesignReviewDefault({ scope: uiScope(), objective: 'UI-OBJ' });
    assert.strictEqual(r.enabled, true, 'enabled for detected ui scope');
    assert.strictEqual(r.advisory, true, 'advisory:true on enable');
    assert.strictEqual(r.gating, false, 'gating:false on enable (NEVER gates)');
  });

  test('D2: non-ui scope (detected:false) → enabled:false, still advisory:true/gating:false', () => {
    const r = decideDesignReviewDefault({ scope: nonUiScope(), objective: 'API-OBJ' });
    assert.strictEqual(r.enabled, false, 'disabled for non-ui objective');
    assert.strictEqual(r.advisory, true, 'advisory:true is invariant even when disabled');
    assert.strictEqual(r.gating, false, 'gating:false is invariant even when disabled');
    assert.ok(!r.callout, 'no callout when disabled');
    assert.ok(!r.tasks || r.tasks.length === 0, 'no/empty tasks when disabled');
  });

  test('D3: failsafe / missing scope → enabled:false, never throws, invariants hold', () => {
    let r;
    assert.doesNotThrow(() => { r = decideDesignReviewDefault({ scope: failsafeScope(), objective: 'X' }); });
    assert.strictEqual(r.enabled, false, 'failsafe disabled');
    assert.strictEqual(r.advisory, true);
    assert.strictEqual(r.gating, false);
    assert.doesNotThrow(() => decideDesignReviewDefault({ objective: 'X' }));
    assert.strictEqual(decideDesignReviewDefault({}).enabled, false, 'no scope → disabled');
    assert.strictEqual(decideDesignReviewDefault().enabled, false, 'no args → disabled');
    // invariants must STILL hold with no args
    const none = decideDesignReviewDefault();
    assert.strictEqual(none.advisory, true);
    assert.strictEqual(none.gating, false);
  });

  test('D4: enabled callout marks ADVISORY/never-gates + names the objective + design-review', () => {
    const r = decideDesignReviewDefault({ scope: uiScope(), objective: 'MY-UI-OBJ' });
    assert.strictEqual(typeof r.callout, 'string', 'callout is a string');
    assert.ok(r.callout.length > 0, 'callout non-empty');
    assert.match(r.callout, /advisory/i, 'callout flags advisory');
    assert.match(r.callout, /never gates|never gate|non-gating/i, 'callout states it never gates');
    assert.match(r.callout, /design-review|design review/i, 'callout references the design-review pass');
    assert.ok(r.callout.includes('MY-UI-OBJ'), 'callout names the objective');
  });

  test('D5: enabled → tasks is array of >=2 {subject,description}: author manifest + run sweep', () => {
    const r = decideDesignReviewDefault({ scope: uiScope(), objective: 'MY-UI-OBJ' });
    assert.ok(Array.isArray(r.tasks), 'tasks is an array');
    assert.ok(r.tasks.length >= 2, 'tasks has at least 2 entries');
    for (const t of r.tasks) {
      assert.strictEqual(typeof t.subject, 'string');
      assert.ok(t.subject.length > 0, 'task subject non-empty');
      assert.strictEqual(typeof t.description, 'string');
      assert.ok(t.description.length > 0, 'task description non-empty');
    }
    const joined = r.tasks.map((t) => t.subject + ' ' + t.description).join(' ');
    assert.match(joined, /manifest/i, 'one task authors the manifest');
    assert.match(joined, /\/devflow:design-review/, 'one task runs the /devflow:design-review sweep');
    assert.ok(r.tasks.some((t) => t.subject.includes('MY-UI-OBJ')), 'tasks name the objective');
  });

  test('D6: gating:false is invariant across ALL inputs (the load-bearing never-gates contract)', () => {
    const inputs = [
      { scope: uiScope(), objective: 'A' },
      { scope: nonUiScope() },
      { scope: failsafeScope() },
      {},
      undefined,
    ];
    for (const inp of inputs) {
      const r = decideDesignReviewDefault(inp);
      assert.strictEqual(r.gating, false, 'gating must be false for every input shape');
      assert.strictEqual(r.advisory, true, 'advisory must be true for every input shape');
    }
  });

  test('D7: absent objective yields a placeholder in the callout, not undefined', () => {
    const r = decideDesignReviewDefault({ scope: uiScope() });
    assert.strictEqual(typeof r.callout, 'string');
    assert.ok(r.callout.length > 0);
    assert.ok(!r.callout.includes('undefined'), 'no literal undefined in callout');
  });
});

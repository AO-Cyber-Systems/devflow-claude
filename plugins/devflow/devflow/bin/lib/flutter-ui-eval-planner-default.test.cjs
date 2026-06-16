'use strict';
// Tests for flutter-ui-eval-planner-default.cjs (UI-VISUAL-EVAL-DEVFLOW-03 / P5).
// Pure decision fn: given a flutter-ui-scope detection result, decide whether the
// planner auto-emits the ui-eval state-matrix manifest stub + the verifier visual gate.
// Hand-built fixtures only (allow_generated_test_data:false) — zero network, zero LLM data.
//
// RED: this import fails until flutter-ui-eval-planner-default.cjs is created.

const test = require('node:test');
const assert = require('node:assert');

const { decideUIEvalDefault } = require('./flutter-ui-eval-planner-default.cjs');

// ─── Hand-built scope fixtures (mirror flutter-ui-scope.cjs detectFlutterUIScope shape) ───
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

const REQUIRED_STATE_KEYS = ['id', 'route', 'data_state', 'expected'];

test.describe('decideUIEvalDefault — P5 planner auto-emit default', () => {
  test('P1: detected ui scope → emit:true, visual_gate:true, manifest_stub is a Shape-A matrix', () => {
    const r = decideUIEvalDefault({ scope: uiScope(), objective: 'UI-OBJ' });
    assert.strictEqual(r.emit, true, 'emit should be true for detected ui scope');
    assert.strictEqual(r.visual_gate, true, 'visual_gate should be true');
    assert.ok(r.manifest_stub && typeof r.manifest_stub === 'object', 'manifest_stub present');
    assert.ok(Array.isArray(r.manifest_stub.states), 'manifest_stub.states is an array (Shape-A)');
    assert.ok(r.manifest_stub.states.length >= 1, 'manifest_stub carries at least one example state');
  });

  test('P2: non-ui scope (detected:false) → emit:false, no manifest_stub, visual_gate:false', () => {
    const r = decideUIEvalDefault({ scope: nonUiScope(), objective: 'API-OBJ' });
    assert.strictEqual(r.emit, false, 'emit should be false for non-ui objective');
    assert.strictEqual(r.visual_gate, false, 'visual_gate should be false');
    assert.ok(!r.manifest_stub, 'no manifest_stub emitted for non-ui objective');
  });

  test('P3: failsafe scope ({detected:false, error}) → emit:false, never throws', () => {
    let r;
    assert.doesNotThrow(() => {
      r = decideUIEvalDefault({ scope: failsafeScope(), objective: 'X' });
    }, 'failsafe must not throw');
    assert.strictEqual(r.emit, false, 'failsafe emit:false');
    assert.strictEqual(r.visual_gate, false, 'failsafe visual_gate:false');
    // Also: missing scope entirely must not throw.
    assert.doesNotThrow(() => decideUIEvalDefault({ objective: 'X' }));
    assert.strictEqual(decideUIEvalDefault({}).emit, false, 'no scope → emit:false');
    assert.strictEqual(decideUIEvalDefault().emit, false, 'no args → emit:false');
  });

  test('P4: emitted manifest_stub.states[0] carries required Shape-A per-state keys', () => {
    const r = decideUIEvalDefault({ scope: uiScope(), objective: 'UI-OBJ' });
    const seed = r.manifest_stub.states[0];
    for (const k of REQUIRED_STATE_KEYS) {
      assert.ok(Object.prototype.hasOwnProperty.call(seed, k), `seed state has key '${k}'`);
    }
    // stub must serialize cleanly (it is referenced/written as a manifest stub)
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(r.manifest_stub)), 'manifest_stub is JSON-serializable');
  });

  test('P5: visual_gate truthy marker present iff emit:true', () => {
    const emitted = decideUIEvalDefault({ scope: uiScope() });
    assert.ok(emitted.visual_gate, 'visual_gate truthy when emit:true');
    assert.strictEqual(emitted.emit, true);

    const withheld = decideUIEvalDefault({ scope: nonUiScope() });
    assert.ok(!withheld.visual_gate, 'visual_gate falsy when emit:false');
    assert.strictEqual(withheld.emit, false);
  });

  test('P5b: objective name flows into the stub (or a TODO placeholder when absent)', () => {
    const named = decideUIEvalDefault({ scope: uiScope(), objective: 'MY-UI-OBJ' });
    assert.strictEqual(named.manifest_stub.objective, 'MY-UI-OBJ');
    const anon = decideUIEvalDefault({ scope: uiScope() });
    assert.ok(typeof anon.manifest_stub.objective === 'string' && anon.manifest_stub.objective.length > 0,
      'absent objective yields a placeholder string, not undefined');
  });

  // ─── CALLOUT-01: explicit call-out + session-task descriptors (additive) ───

  test('C1: emit case → callout is a non-empty string naming the visual gate + /devflow:ui-eval + the objective', () => {
    const r = decideUIEvalDefault({ scope: uiScope(), objective: 'MY-UI-OBJ' });
    assert.strictEqual(typeof r.callout, 'string', 'callout is a string');
    assert.ok(r.callout.length > 0, 'callout is non-empty');
    assert.match(r.callout, /visual/i, 'callout mentions "visual"');
    assert.match(r.callout, /\/devflow:ui-eval|ui_eval/, 'callout references /devflow:ui-eval (or ui_eval)');
    assert.ok(r.callout.includes('MY-UI-OBJ'), 'callout names the objective');
  });

  test('C2: emit case → tasks is an array of >=2 {subject,description}: author manifest + run gate', () => {
    const r = decideUIEvalDefault({ scope: uiScope(), objective: 'MY-UI-OBJ' });
    assert.ok(Array.isArray(r.tasks), 'tasks is an array');
    assert.ok(r.tasks.length >= 2, 'tasks has at least 2 entries');
    for (const t of r.tasks) {
      assert.strictEqual(typeof t.subject, 'string', 'each task has a string subject');
      assert.ok(t.subject.length > 0, 'task subject non-empty');
      assert.strictEqual(typeof t.description, 'string', 'each task has a string description');
      assert.ok(t.description.length > 0, 'task description non-empty');
    }
    const joined = r.tasks.map((t) => `${t.subject} ${t.description}`).join(' ');
    assert.match(joined, /manifest/i, 'one task is about authoring the manifest');
    assert.match(joined, /\/devflow:ui-eval/, 'one task is about running the /devflow:ui-eval gate');
    assert.ok(r.tasks.some((t) => t.subject.includes('MY-UI-OBJ')), 'tasks name the objective');
  });

  test('C3: non-emit case (detected!==true) → no callout, no tasks, still {emit:false}', () => {
    const r = decideUIEvalDefault({ scope: nonUiScope(), objective: 'API-OBJ' });
    assert.strictEqual(r.emit, false, 'emit:false for non-ui');
    assert.ok(!r.callout, 'no callout when emit:false');
    assert.ok(!r.tasks || (Array.isArray(r.tasks) && r.tasks.length === 0), 'no/empty tasks when emit:false');
    const fsr = decideUIEvalDefault({ scope: failsafeScope() });
    assert.ok(!fsr.callout && (!fsr.tasks || fsr.tasks.length === 0), 'failsafe carries no callout/tasks');
    const none = decideUIEvalDefault({});
    assert.ok(!none.callout && (!none.tasks || none.tasks.length === 0), 'missing scope carries no callout/tasks');
  });

  test('C4: existing P1-P5 keys unchanged on emit (emit/visual_gate/manifest_stub still correct alongside callout/tasks)', () => {
    const r = decideUIEvalDefault({ scope: uiScope(), objective: 'UI-OBJ' });
    assert.strictEqual(r.emit, true, 'emit unchanged');
    assert.strictEqual(r.visual_gate, true, 'visual_gate unchanged');
    assert.ok(r.manifest_stub && Array.isArray(r.manifest_stub.states) && r.manifest_stub.states.length >= 1,
      'manifest_stub Shape-A unchanged');
    assert.strictEqual(r.manifest_stub.objective, 'UI-OBJ', 'manifest_stub objective unchanged');
    assert.strictEqual(typeof r.callout, 'string');
    assert.ok(Array.isArray(r.tasks));
  });
});

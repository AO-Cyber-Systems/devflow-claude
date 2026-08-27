'use strict';
// Tests for flutter-ui-eval-planner-default.cjs (UI-VISUAL-EVAL-DEVFLOW-03 / P5).
// Pure decision fn: given a flutter-ui-scope detection result, decide whether the
// planner auto-emits the ui-eval state-matrix manifest stub + the verifier visual gate.
// Hand-built fixtures only (allow_generated_test_data:false) — zero network, zero LLM data.
//
// RED: this import fails until flutter-ui-eval-planner-default.cjs is created.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { decideUIEvalDefault, buildManifestStub } = require('./flutter-ui-eval-planner-default.cjs');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

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

// 32-02 DELIBERATE CHANGE: was ['id', ...]. That literal 'id' key encoded the exact defect
// this TRD closes -- buildManifestStub emitted `id` while the engine (flutter-ui-eval.cjs)
// reads `st.state_id` everywhere, so a stub-derived manifest resolved state_id:undefined,
// missed the label lookup, and (pre-32-01) fell through to a fabricated not-broken pass.
// This is a plausible mechanism behind aodex#485's headline count (34 unjudged states
// reporting green). The hand-built fixture manifest used `state_id` (matching the ENGINE,
// not the generator), which is exactly why 66 green tests never caught the mismatch. See
// Case A2/A2b below and the SUMMARY's "sixth defect" note.
const REQUIRED_STATE_KEYS = ['state_id', 'route', 'data_state', 'expected'];

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

// ──────────────────────────────────────────────────────────────────────────────
// Case A2 / A2b (32-02) — buildManifestStub must emit the key the ENGINE reads.
//
// Found during 32-02: buildManifestStub emitted `id`, flutter-ui-eval.cjs's
// cmdVerifyFlutterUIEval reads `st.state_id` everywhere. A stub-derived manifest
// therefore resolved state_id:undefined -- a SIXTH defect, distinct from the five in
// aodex#485, and plausibly the mechanism behind #485's headline count: pre-32-01, that
// same undefined key missed the label lookup and fell through `|| { is_broken: false }`
// straight to a fabricated pass. The checked-in fixture manifest.json was hand-written
// using `state_id` (matching the CONSUMER, not the generator), which is exactly why 66
// green tests never saw the mismatch.
//
// A2 pins the key by name; A2b feeds the stub's ACTUAL output through the engine's own
// CLI path (df-tools verify flutter-ui-eval) so the generator and the consumer can never
// drift apart again without a visible, load-bearing test failure.
// ──────────────────────────────────────────────────────────────────────────────

test.describe('buildManifestStub — emits the key the engine reads (32-02)', () => {
  test('Case A2 — buildManifestStub().states[0] carries a state_id property (not `id`)', () => {
    const stub = buildManifestStub('OBJ');
    assert.ok(Object.prototype.hasOwnProperty.call(stub.states[0], 'state_id'),
      'the engine reads st.state_id; the stub must emit that exact key');
    assert.ok(!Object.prototype.hasOwnProperty.call(stub.states[0], 'id'),
      'the stub must not ALSO carry the old `id` key (no silent dual-shape drift)');
  });

  test("Case A2b — the stub, fed through the ENGINE's own CLI path, is attributable with NO fallback advisory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-stub-'));
    try {
      const stub = buildManifestStub('A2B-OBJ');
      const seed = stub.states[0];
      // Fill the placeholder value on WHICHEVER key the stub actually emits -- do NOT
      // manually add a `state_id` property here, or this test would pass even if the
      // stub still emitted the old `id` key (masking the exact defect under test).
      const idKey = Object.prototype.hasOwnProperty.call(seed, 'state_id') ? 'state_id' : 'id';
      seed[idKey] = 'stub-seed-state';
      seed.screenshot_path = './seed.png';

      fs.writeFileSync(
        path.join(tmpDir, 'labels.json'),
        JSON.stringify({ 'stub-seed-state': { is_broken: false } }, null, 2),
        'utf-8',
      );
      fs.writeFileSync(path.join(tmpDir, 'seed.png'), 'stub-pixel-placeholder', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(stub, null, 2), 'utf-8');

      const out = execSync(
        `node ${DF_TOOLS} verify flutter-ui-eval ${path.join(tmpDir, 'manifest.json')} --raw`,
        { encoding: 'utf-8' },
      );
      const rollup = JSON.parse(out);

      assert.strictEqual(rollup.states.length, 1, 'the stub-derived manifest has exactly one state');
      assert.strictEqual(rollup.states[0].state_id, 'stub-seed-state',
        'a stub-derived manifest must be attributable by the engine WITHOUT needing the id-fallback');
      assert.strictEqual(rollup.states[0].verdict, 'pass', 'the labelled seed state judges normally');

      const advisories = [...(rollup.states[0].advisories || []), ...(rollup.states[0].errors || [])];
      assert.ok(!advisories.some(a => /non-canonical/i.test(a)),
        'the canonical (fixed) stub path must never trigger the id-fallback advisory');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

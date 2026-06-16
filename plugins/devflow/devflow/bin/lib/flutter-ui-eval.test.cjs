'use strict';
// Tests for flutter-ui-eval.cjs (UI-VISUAL-EVAL-JUDGE-01) — pure VLM-judge scoring engine.
// Covers the full test list: scoreRun (R1-3), scoreState (S1-4), aggregateVotes (V1-4),
// loadManifest (L1-3), validateJudgeResult (G1-5), callVisionJudge w/ fake judge (C1-2).
// Fixtures come from hand-built generators only; zero network, zero LLM-generated data.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// RED: this import fails until flutter-ui-eval.cjs is created
const {
  loadManifest,
  validateJudgeResult,
  aggregateVotes,
  scoreState,
  scoreRun,
  callVisionJudge,
  defaultVisionJudge,
  makeOfflineLabelEchoJudge,
  DEFECT_TYPES,
  SEVERITIES,
} = require('./flutter-ui-eval.cjs');
const {
  makeCaptureResult,
  makeJudgeResult,
  makeFakeVisionJudge,
} = require('./flutter-ui-eval-fixtures.cjs');

// Helper: build N samples (JudgeResults) with a given broken-count.
function samplesWithBroken(brokenCount, total, defectOverrides = {}) {
  const out = [];
  for (let i = 0; i < total; i++) {
    const broken = i < brokenCount;
    out.push(makeJudgeResult({
      is_broken: broken,
      matches_expected: !broken,
      defects: broken ? [Object.assign({
        type: 'broken_layout', severity: 'high', region: 'body', rationale: 'r',
      }, defectOverrides)] : [],
    }));
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// scoreRun — run-level rollup (outermost observable)
// ──────────────────────────────────────────────────────────────────────────────

test.describe('scoreRun (run-level rollup)', () => {
  test('Case R1 — all states pass -> run verdict pass', () => {
    const results = [
      { state_id: 'a', verdict: 'pass', advisories: [] },
      { state_id: 'b', verdict: 'pass', advisories: [] },
    ];
    const run = scoreRun(results);
    assert.strictEqual(run.verdict, 'pass');
    assert.strictEqual(run.counts.pass, 2);
    assert.deepStrictEqual(run.fails, []);
  });

  test('Case R2 — reviews within flake budget -> pass-with-reviews', () => {
    const results = [
      { state_id: 'a', verdict: 'pass', advisories: [] },
      { state_id: 'b', verdict: 'review', advisories: [] },
    ];
    const run = scoreRun(results, { flakeBudget: 2 });
    assert.strictEqual(run.verdict, 'pass-with-reviews');
    assert.deepStrictEqual(run.reviews, ['b']);
    assert.deepStrictEqual(run.fails, []);
  });

  test('Case R3 — a persistent fail state -> run verdict fail', () => {
    const results = [
      { state_id: 'a', verdict: 'pass', advisories: [] },
      { state_id: 'b', verdict: 'fail', advisories: [] },
      { state_id: 'c', verdict: 'review', advisories: [] },
    ];
    const run = scoreRun(results, { flakeBudget: 2 });
    assert.strictEqual(run.verdict, 'fail');
    assert.deepStrictEqual(run.fails, ['b']);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// scoreState — per-state gate
// ──────────────────────────────────────────────────────────────────────────────

test.describe('scoreState (per-state gate)', () => {
  test('Case S1 — majority is_broken AND >=1 high-severity defect -> fail', () => {
    const samples = samplesWithBroken(2, 3, { severity: 'high' });
    const res = scoreState({ samples });
    assert.strictEqual(res.verdict, 'fail');
  });

  test('Case S2 — defects present but only medium/low severity -> pass (advisories)', () => {
    const samples = samplesWithBroken(2, 3, { severity: 'medium' });
    const res = scoreState({ samples });
    assert.strictEqual(res.verdict, 'pass');
    assert.ok(res.advisories.length > 0, 'medium/low defects should surface as advisories');
  });

  test('Case S3 — single dissenting sample (split vote) -> review', () => {
    const samples = samplesWithBroken(1, 3, { severity: 'high' });
    const res = scoreState({ samples });
    assert.strictEqual(res.verdict, 'review');
  });

  test('Case S4 — unanimous not-broken / matches_expected -> pass, no advisories', () => {
    const samples = samplesWithBroken(0, 3);
    const res = scoreState({ samples });
    assert.strictEqual(res.verdict, 'pass');
    assert.deepStrictEqual(res.advisories, []);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// aggregateVotes — N-sample majority
// ──────────────────────────────────────────────────────────────────────────────

test.describe('aggregateVotes (N-sample majority)', () => {
  test('Case V1 — unanimous is_broken:true -> broken verdict', () => {
    const agg = aggregateVotes(samplesWithBroken(3, 3));
    assert.strictEqual(agg.is_broken, true);
    assert.deepStrictEqual(agg.votes, { broken: 3, ok: 0 });
    assert.strictEqual(agg.split, false);
  });

  test('Case V2 — unanimous is_broken:false -> ok verdict', () => {
    const agg = aggregateVotes(samplesWithBroken(0, 3));
    assert.strictEqual(agg.is_broken, false);
    assert.deepStrictEqual(agg.votes, { broken: 0, ok: 3 });
    assert.strictEqual(agg.split, false);
  });

  test('Case V3 — split 2 broken / 1 ok over N=3 -> majority broken, review-worthy', () => {
    const agg = aggregateVotes(samplesWithBroken(2, 3));
    assert.strictEqual(agg.is_broken, true);
    assert.deepStrictEqual(agg.votes, { broken: 2, ok: 1 });
    assert.strictEqual(agg.split, true);
  });

  test('Case V4 — even tie -> review (no false-confident majority)', () => {
    const agg = aggregateVotes(samplesWithBroken(2, 4));
    assert.deepStrictEqual(agg.votes, { broken: 2, ok: 2 });
    assert.strictEqual(agg.tie, true);
    assert.strictEqual(agg.split, true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// loadManifest — JSON parse + shape guard
// ──────────────────────────────────────────────────────────────────────────────

test.describe('loadManifest (JSON parse + shape guard)', () => {
  let tmpDir;
  test.before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-eval-manifest-'));
  });
  test.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeManifest(name, content) {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content, 'utf-8');
    return p;
  }

  test('Case L1 — valid JSON manifest -> parsed object', () => {
    const p = writeManifest('valid.json', JSON.stringify({
      states: [{ state_id: 'dashboard.populated', expected: 'shows chart' }],
    }));
    const m = loadManifest(p);
    assert.ok(Array.isArray(m.states));
    assert.strictEqual(m.states[0].state_id, 'dashboard.populated');
  });

  test('Case L2 — invalid JSON (syntax error) -> throws', () => {
    const p = writeManifest('bad.json', '{ not valid json,,, }');
    assert.throws(() => loadManifest(p));
  });

  test('Case L3 — structurally-bad manifest (wrong shape) -> throws', () => {
    const p = writeManifest('wrong-shape.json', JSON.stringify({ notStates: 42 }));
    assert.throws(() => loadManifest(p), /states/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// validateJudgeResult — Shape-C guard
// ──────────────────────────────────────────────────────────────────────────────

test.describe('validateJudgeResult (Shape-C guard)', () => {
  test('Case G1 — fully valid Shape-C object -> valid true', () => {
    const r = validateJudgeResult(makeJudgeResult());
    assert.strictEqual(r.valid, true);
    assert.deepStrictEqual(r.errors, []);
  });

  test('Case G2 — missing required field (no is_broken) -> rejected', () => {
    const obj = makeJudgeResult();
    delete obj.is_broken;
    const r = validateJudgeResult(obj);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /is_broken/.test(e)));
  });

  test('Case G3 — defect.type outside taxonomy enum -> rejected', () => {
    const obj = makeJudgeResult({
      is_broken: true,
      defects: [{ type: 'not_a_real_defect', severity: 'high', region: 'body', rationale: 'r' }],
    });
    const r = validateJudgeResult(obj);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /type/.test(e)));
  });

  test('Case G4 — severity outside {low,medium,high} -> rejected', () => {
    const obj = makeJudgeResult({
      is_broken: true,
      defects: [{ type: 'overflow', severity: 'critical', region: 'body', rationale: 'r' }],
    });
    const r = validateJudgeResult(obj);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /severity/.test(e)));
  });

  test('Case G5 — non-boolean is_broken -> rejected', () => {
    const obj = makeJudgeResult({ is_broken: 'yes' });
    const r = validateJudgeResult(obj);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /is_broken/.test(e)));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Enums exported
// ──────────────────────────────────────────────────────────────────────────────

test.describe('exported enums', () => {
  test('DEFECT_TYPES + SEVERITIES are the contract enums', () => {
    assert.deepStrictEqual(SEVERITIES, ['low', 'medium', 'high']);
    assert.ok(DEFECT_TYPES.includes('overflow'));
    assert.ok(DEFECT_TYPES.includes('loading_stuck'));
    assert.strictEqual(DEFECT_TYPES.length, 7);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// callVisionJudge — impure boundary, fake-injected (zero network)
// ──────────────────────────────────────────────────────────────────────────────

test.describe('callVisionJudge (injectable boundary, fake judge)', () => {
  test('Case C1 — fake returns canned valid Shape-C -> parsed + validated JudgeResult', () => {
    const capture = makeCaptureResult();
    const canned = makeJudgeResult({ state_id: capture.state_id });
    const judge = makeFakeVisionJudge(canned);

    const res = callVisionJudge({ capture, judge });

    assert.strictEqual(res.valid, true);
    assert.deepStrictEqual(res.result, canned);
    // The injected judge was the only path — and it received the assembled request.
    assert.strictEqual(judge.calls.length, 1);
    assert.strictEqual(judge.calls[0].expected, capture.metadata.expected);
    assert.deepStrictEqual(judge.calls[0].defect_types, DEFECT_TYPES);
  });

  test('Case C2 — fake returns malformed output -> validateJudgeResult rejects (no crash)', () => {
    const capture = makeCaptureResult();
    const judge = makeFakeVisionJudge({ garbage: true });

    const res = callVisionJudge({ capture, judge });

    assert.strictEqual(res.valid, false);
    assert.ok(Array.isArray(res.errors) && res.errors.length > 0);
    assert.strictEqual(judge.calls.length, 1);
  });

  test('Case C2b — fake returns a non-object -> rejected (no crash)', () => {
    const capture = makeCaptureResult();
    const judge = makeFakeVisionJudge('not an object');

    const res = callVisionJudge({ capture, judge });

    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.length > 0);
  });
});


// ──────────────────────────────────────────────────────────────────────────────
// Default real vision judge — wired but NEVER auto-invoked offline (TRD-02 N1 guard)
// ──────────────────────────────────────────────────────────────────────────────

test.describe('defaultVisionJudge (impure boundary, never auto-invoked offline)', () => {
  test('Case N1a — the default real judge is exported (wired) as a function', () => {
    assert.strictEqual(typeof defaultVisionJudge, 'function');
  });

  test('Case N1b — callVisionJudge with the offline label-echo judge never touches defaultVisionJudge', () => {
    // The dogfood/verify path injects the offline judge; the real network default is bypassed.
    const labels = { 'x.state': { is_broken: true, type: 'overflow', severity: 'high' } };
    const offline = makeOfflineLabelEchoJudge(labels, 3);
    const capture = makeCaptureResult({ state_id: 'x.state' });

    // Spy: prove defaultVisionJudge is never called on this path by wrapping it would be
    // intrusive; instead assert the offline judge is the SOLE invoked path (its .calls grows).
    const res = callVisionJudge({ capture, judge: offline });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.result.is_broken, true);
    assert.strictEqual(offline.calls.length, 1, 'offline judge was the only path invoked');
  });

  test('Case N1c — defaultVisionJudge is the live network boundary: only reachable on explicit opt-in', () => {
    // It must NOT be auto-run; calling it directly hits the impure seam (here a guarded throw),
    // confirming verification/tests never reach it unless a caller explicitly passes it as judge.
    const capture = makeCaptureResult();
    const request = {
      state_id: capture.state_id,
      screenshot_path: capture.screenshot_path,
      expected: capture.metadata.expected,
      defect_types: DEFECT_TYPES,
      severities: SEVERITIES,
    };
    // screenshot_path points at a non-existent fixture path; the impure boundary either
    // throws on read or on the network seam — either way it is NOT silently invoked offline.
    assert.throws(() => defaultVisionJudge(request));
  });
});

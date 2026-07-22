'use strict';

/**
 * flutter-ui-eval-fixtures.cjs — Hand-built fixture generators for the UI visual-eval
 * scoring engine tests (UI-VISUAL-EVAL-JUDGE-01).
 *
 * Per the TDD playbook: factory functions with sensible defaults + an overrides param.
 * NO LLM-generated test data, NO network — deterministic hand-built objects only.
 *
 * Exports:
 *   makeCaptureResult(overrides)  — a valid Shape-B CaptureResult (engine INPUT)
 *   makeJudgeResult(overrides)    — a valid Shape-C JudgeResult (engine OUTPUT)
 *   makeFakeVisionJudge(scripted) — an injectable judge fn returning a canned value (no network)
 */

// ─── Deep-merge helper (plain-object recursive merge; arrays replace wholesale) ──

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, overrides) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isPlainObject(overrides)) return overrides === undefined ? out : overrides;
  for (const [key, val] of Object.entries(overrides)) {
    if (isPlainObject(val) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

// ─── Shape-B: CaptureResult (engine INPUT, Phase-1 contract) ─────────────────────

/**
 * @param {object} overrides — deep-merged onto the valid default.
 * @returns {object} a valid Shape-B CaptureResult.
 */
function makeCaptureResult(overrides = {}) {
  const base = {
    state_id: 'dashboard.populated',
    surface: 'web',
    screenshot_path: './fixtures/x.png',
    viewport: { width: 1280, height: 800 },
    captured_at: '2026-06-16T00:00:00.000Z',
    metadata: {
      console_errors: [],
      flutter_view_bbox: { x: 0, y: 0, width: 1280, height: 800 },
      fonts_ready: true,
      expected: 'Dashboard shows a populated revenue chart and a non-empty table.',
    },
  };
  return deepMerge(base, overrides);
}

// ─── Shape-C: JudgeResult (engine OUTPUT) ────────────────────────────────────────

/**
 * @param {object} overrides — deep-merged onto the valid default. Flip is_broken,
 *   inject defects, set severity, or break a field for negative cases.
 * @returns {object} a Shape-C JudgeResult.
 */
function makeJudgeResult(overrides = {}) {
  const base = {
    state_id: 'dashboard.populated',
    is_broken: false,
    defects: [],
    matches_expected: true,
    confidence: 0.9,
    samples: 3,
    votes: { broken: 0, ok: 3 },
  };
  return deepMerge(base, overrides);
}

// ─── Injectable fake vision judge (no network) ───────────────────────────────────

/**
 * Returns a fn matching the injected-judge interface. When called by callVisionJudge
 * it returns `scriptedReturn` verbatim — a canned valid Shape-C object (C1) or a
 * malformed value such as { garbage: true } or a non-object (C2). It does NOT touch
 * the network. The fn records its calls on `.calls` for assertion convenience.
 *
 * @param {*} scriptedReturn — the value the fake judge returns for every invocation.
 * @returns {function & {calls: Array}}
 */
function makeFakeVisionJudge(scriptedReturn) {
  const fn = function fakeVisionJudge(request) {
    fn.calls.push(request);
    return scriptedReturn;
  };
  fn.calls = [];
  return fn;
}

module.exports = { makeCaptureResult, makeJudgeResult, makeFakeVisionJudge };

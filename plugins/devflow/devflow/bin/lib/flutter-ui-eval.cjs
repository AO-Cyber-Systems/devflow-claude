'use strict';

/**
 * flutter-ui-eval.cjs — Pure VLM-judge scoring engine for UI visual-eval (UI-VISUAL-EVAL-JUDGE-01).
 *
 * Layer-2 of the UI visual-eval contract. Consumes CaptureResult records (Shape B) and,
 * via an INJECTABLE vision-judge boundary, produces validated JudgeResults (Shape C) and a
 * gating scoreRun rollup. Everything except callVisionJudge is pure and offline-testable.
 * Modeled on flutter-state-coverage.cjs (same module shape, export style, HIGH-severity-only
 * gating confidence model). The real Claude vision default impl + df-tools CLI wiring are TRD-02.
 *
 * Exports:
 *   loadManifest(p)              — fs.readFileSync + JSON.parse + shape-guard (throws on bad JSON/shape)
 *   validateJudgeResult(obj)     — Shape-C guard; returns {valid, errors[]}
 *   aggregateVotes(samples)      — N-sample majority; {is_broken, votes:{broken,ok}, split, tie}
 *   scoreState({samples,...})    — per-state gate; 'pass'|'fail'|'review' + advisories[]
 *   scoreRun(results, opts)      — run rollup; {verdict, counts, reviews[], fails[]} w/ flake budget
 *   callVisionJudge({...})       — impure/injectable boundary (default real impl in TRD-02)
 *   DEFECT_TYPES, SEVERITIES     — contract enums
 *
 * Anti-patterns avoided:
 *   - No external dependency (node builtins only; node:test + node:assert in the suite)
 *   - No real network/API call (callVisionJudge takes an injected judge fn; default impl is TRD-02)
 *   - No LLM-generated test data (hand-built generators in flutter-ui-eval-fixtures.cjs)
 *   - No blocking on MEDIUM/LOW severity — only HIGH gates (mirrors flutter-state-coverage)
 */

const fs = require('fs');
// `output` is used by the df-tools handler wired in TRD-02; TRD-01's pure fns return values.
// eslint-disable-next-line no-unused-vars
const { output } = require('./helpers.cjs');

// ─── Contract enums ──────────────────────────────────────────────────────────

const DEFECT_TYPES = [
  'overflow',
  'blank_empty',
  'misalignment',
  'contrast_legibility',
  'broken_layout',
  'overlap_zindex',
  'loading_stuck',
];
const SEVERITIES = ['low', 'medium', 'high'];

// ─── Manifest loader ───────────────────────────────────────────────────────────

/**
 * Read + JSON.parse a manifest, then shape-guard it. JSON.parse throws naturally on
 * invalid JSON; the explicit guard catches structurally-bad shapes.
 *
 * @param {string} manifestPath
 * @returns {object} the parsed manifest
 * @throws on invalid JSON or a structurally-bad manifest
 */
function loadManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw); // throws SyntaxError on invalid JSON (L2)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('manifest must be a JSON object');
  }
  if (!Array.isArray(parsed.states)) {
    throw new Error("manifest missing required 'states' array");
  }
  return parsed;
}

// ─── Shape-C guard ───────────────────────────────────────────────────────────

/**
 * Validate a JudgeResult (Shape C). Returns a structured {valid, errors[]} (never throws
 * on a malformed object — the rejection is surfaced as errors).
 *
 * @param {*} obj
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateJudgeResult(obj) {
  const errors = [];

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['judge result must be an object'] };
  }

  // Required fields
  if (typeof obj.state_id !== 'string' || obj.state_id.length === 0) {
    errors.push('missing or invalid required field: state_id');
  }
  if (typeof obj.is_broken !== 'boolean') {
    errors.push('field is_broken must be a boolean'); // covers G2 (missing) + G5 (non-bool)
  }
  if (!Array.isArray(obj.defects)) {
    errors.push('field defects must be an array');
  }
  if (typeof obj.matches_expected !== 'boolean') {
    errors.push('field matches_expected must be a boolean');
  }
  if (typeof obj.confidence !== 'number') {
    errors.push('field confidence must be a number');
  }
  if (typeof obj.samples !== 'number') {
    errors.push('field samples must be a number');
  }
  if (obj.votes === null || typeof obj.votes !== 'object' || Array.isArray(obj.votes)) {
    errors.push('field votes must be an object');
  }

  // Per-defect enum checks
  if (Array.isArray(obj.defects)) {
    obj.defects.forEach((d, i) => {
      if (d === null || typeof d !== 'object') {
        errors.push(`defect[${i}] must be an object`);
        return;
      }
      if (!DEFECT_TYPES.includes(d.type)) {
        errors.push(`defect[${i}].type '${d.type}' is not in the defect taxonomy`);
      }
      if (!SEVERITIES.includes(d.severity)) {
        errors.push(`defect[${i}].severity '${d.severity}' is not in {low,medium,high}`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Vote aggregation ──────────────────────────────────────────────────────────

/**
 * Aggregate N JudgeResult samples into a majority verdict.
 *
 * @param {Array<{is_broken:boolean}>} samples
 * @returns {{is_broken:boolean, votes:{broken:number, ok:number}, split:boolean, tie:boolean}}
 */
function aggregateVotes(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('aggregateVotes requires a non-empty samples array');
  }
  let broken = 0;
  let ok = 0;
  for (const s of samples) {
    if (s && s.is_broken === true) broken += 1;
    else ok += 1;
  }
  const tie = broken === ok;
  const split = broken > 0 && ok > 0; // any disagreement
  // Majority: on a tie there is no confident majority — leave is_broken=false (review territory).
  const is_broken = broken > ok;
  return { is_broken, votes: { broken, ok }, split, tie };
}

// ─── Per-state gate ─────────────────────────────────────────────────────────────

/**
 * Score one state from its N samples. HIGH-severity-only gating (mirrors verifyCoverage):
 *   - majority is_broken AND >=1 high-severity defect → 'fail'
 *   - defects present but only medium/low → 'pass' (defects recorded as advisories)
 *   - split / single dissent (no confident verdict) → 'review'
 *   - even tie → 'review'
 *   - unanimous not-broken → 'pass', no advisories
 *
 * @param {object} opts
 * @param {Array}  opts.samples — JudgeResult samples for this state
 * @returns {{verdict:'pass'|'fail'|'review', advisories:string[], votes:object}}
 */
function scoreState({ samples } = {}) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('scoreState requires a non-empty samples array');
  }

  const agg = aggregateVotes(samples);
  const advisories = [];

  // Collect defects across all samples for severity routing.
  const allDefects = [];
  for (const s of samples) {
    if (s && Array.isArray(s.defects)) allDefects.push(...s.defects);
  }
  const hasHigh = allDefects.some(d => d && d.severity === 'high');

  // No confident majority either way → review (covers split single-dissent + even tie).
  if (agg.tie || (agg.split && !agg.is_broken)) {
    return { verdict: 'review', advisories, votes: agg.votes };
  }

  if (agg.is_broken) {
    // Confident broken majority → gate on severity only (HIGH-only blocker model).
    if (hasHigh) {
      return { verdict: 'fail', advisories, votes: agg.votes };
    }
    // Majority broken with only medium/low severity → pass with advisories.
    for (const d of allDefects) {
      advisories.push(`${d.severity} defect: ${d.type} (${d.region || 'n/a'})`);
    }
    return { verdict: 'pass', advisories, votes: agg.votes };
  }

  // Unanimous not-broken → pass; surface any non-high defects as advisories.
  for (const d of allDefects) {
    if (d && d.severity !== 'high') {
      advisories.push(`${d.severity} defect: ${d.type} (${d.region || 'n/a'})`);
    }
  }
  return { verdict: 'pass', advisories, votes: agg.votes };
}

// ─── Run rollup ─────────────────────────────────────────────────────────────────

/**
 * Roll per-state verdicts up into a run verdict, honoring a flake budget for reviews.
 *   - any fail → 'fail'
 *   - else any review → 'pass-with-reviews' (reviews are within budget by construction;
 *     a review count exceeding the budget is itself escalated to fail)
 *   - else → 'pass'
 *
 * @param {Array<{state_id:string, verdict:string}>} results
 * @param {object} [opts]
 * @param {number} [opts.flakeBudget=1] — max tolerated reviews before escalation to fail
 * @returns {{verdict:'pass'|'pass-with-reviews'|'fail', counts:object, reviews:string[], fails:string[]}}
 */
function scoreRun(results, opts = {}) {
  if (!Array.isArray(results)) {
    throw new Error('scoreRun requires a results array');
  }
  const flakeBudget = typeof opts.flakeBudget === 'number' ? opts.flakeBudget : 1;

  const counts = { pass: 0, fail: 0, review: 0 };
  const reviews = [];
  const fails = [];

  for (const r of results) {
    if (r.verdict === 'fail') {
      counts.fail += 1;
      fails.push(r.state_id);
    } else if (r.verdict === 'review') {
      counts.review += 1;
      reviews.push(r.state_id);
    } else {
      counts.pass += 1;
    }
  }

  let verdict;
  if (fails.length > 0) {
    verdict = 'fail';
  } else if (reviews.length > flakeBudget) {
    verdict = 'fail'; // reviews exceeded the flake budget → escalate
  } else if (reviews.length > 0) {
    verdict = 'pass-with-reviews';
  } else {
    verdict = 'pass';
  }

  return { verdict, counts, reviews, fails };
}

// ─── Injectable vision-judge boundary (impure; default real impl in TRD-02) ─────

/**
 * The single impure boundary. Builds the judge inputs from the CaptureResult + its
 * metadata.expected anchor + the defect taxonomy, hands the assembled request to the
 * INJECTED `judge` fn, then runs the returned value through validateJudgeResult.
 *
 * In TRD-01 the `judge` fn is always injected (tests pass makeFakeVisionJudge()), so NO
 * network call occurs. The real Claude vision default impl is wired in TRD-02.
 *
 * @param {object}   opts
 * @param {object}   opts.capture  — a Shape-B CaptureResult
 * @param {string}   [opts.expected] — override anchor; defaults to capture.metadata.expected
 * @param {function} opts.judge    — injected judge fn: (request) => Shape-C-ish value
 * @returns {{valid:boolean, result?:object, errors?:string[]}}
 */
function callVisionJudge({ capture, expected, judge } = {}) {
  if (typeof judge !== 'function') {
    // No default real impl in TRD-01 — the injected judge is the only path.
    throw new Error('callVisionJudge requires an injected judge fn (real impl lands in TRD-02)');
  }

  const anchor = expected !== undefined
    ? expected
    : (capture && capture.metadata ? capture.metadata.expected : undefined);

  const request = {
    state_id: capture ? capture.state_id : undefined,
    surface: capture ? capture.surface : undefined,
    screenshot_path: capture ? capture.screenshot_path : undefined,
    expected: anchor,
    defect_types: DEFECT_TYPES,
    severities: SEVERITIES,
  };

  const raw = judge(request); // injected fake in TRD-01; real Claude vision call in TRD-02
  const validation = validateJudgeResult(raw);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors };
  }
  return { valid: true, result: raw };
}

module.exports = {
  loadManifest,
  validateJudgeResult,
  aggregateVotes,
  scoreState,
  scoreRun,
  callVisionJudge,
  DEFECT_TYPES,
  SEVERITIES,
};

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
const path = require('path');
// `output` is used by the df-tools handler wired in TRD-02; TRD-01's pure fns return values.
// `error` (32-03) rejects an unrecognised --judge value with a usage error (stderr + exit 1)
// rather than letting it silently fall through to the offline path.
// eslint-disable-next-line no-unused-vars
const { output, error } = require('./helpers.cjs');

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

  // Evidence-aware scoring-field requirements (32-02, aodex#485 defect 2: the offline
  // judge used to fabricate confidence:0.99/matches_expected for a comparison it never
  // performed). Branch on `obj.evidence`:
  //   'vision' -> a real comparison happened -> confidence/matches_expected REQUIRED
  //   'label'  -> a label lookup, not a comparison -> confidence/matches_expected FORBIDDEN
  //   absent   -> legacy shape (pre-32-02 callers) -> byte-for-byte original behaviour
  if (obj.evidence === 'vision') {
    if (typeof obj.matches_expected !== 'boolean') {
      errors.push('field matches_expected must be a boolean');
    }
    if (typeof obj.confidence !== 'number') {
      errors.push('field confidence must be a number');
    }
  } else if (obj.evidence === 'label') {
    if ('matches_expected' in obj) {
      errors.push('field matches_expected must be absent for evidence:"label" (no comparison was performed)');
    }
    if ('confidence' in obj) {
      errors.push('field confidence must be absent for evidence:"label" (no comparison was performed)');
    }
  } else {
    // Legacy path (no evidence field) — byte-for-byte the pre-32-02 required-field rules.
    if (typeof obj.matches_expected !== 'boolean') {
      errors.push('field matches_expected must be a boolean');
    }
    if (typeof obj.confidence !== 'number') {
      errors.push('field confidence must be a number');
    }
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
 * @param {Array<{state_id:string, verdict:string, unjudged?:boolean}>} results
 * @param {object} [opts]
 * @param {number} [opts.flakeBudget=1] — max tolerated reviews before escalation to fail
 * @param {'review'|'fail'} [opts.unjudgedPolicy='review'] — what an unjudged state does to
 *   the run verdict. Default 'review' keeps a fully-labelled manifest byte-identical to
 *   pre-fix behaviour; a consumer (e.g. CI) can opt into 'fail' to hard-gate on it.
 * @returns {{verdict:'pass'|'pass-with-reviews'|'fail', counts:object, reviews:string[], fails:string[], unjudged:string[]}}
 */
function scoreRun(results, opts = {}) {
  if (!Array.isArray(results)) {
    throw new Error('scoreRun requires a results array');
  }
  const flakeBudget = typeof opts.flakeBudget === 'number' ? opts.flakeBudget : 1;
  const unjudgedPolicy = opts.unjudgedPolicy === 'fail' ? 'fail' : 'review';

  const counts = { pass: 0, fail: 0, review: 0 };
  const reviews = [];          // UNEXPECTED reviews (expect=pass) — count against the flake budget
  const fails = [];            // NEW/unexpected failures (expect=pass) — the regression signal
  const known_failing = [];    // expect=fail AND still fail/review — a tracked known-broken state, NOT a new regression
  const resolved = [];         // expect=fail BUT now passes — likely fixed; drop its known_broken flag
  const unjudged = [];         // aodex#485: states nothing examined — a PEER bucket, never reviews[]

  for (const r of results) {
    // A state may declare its expected verdict (default 'pass'). known_broken states
    // expected to gate-fail carry `expect: 'fail'` so they don't fail the whole run
    // while open — but an UNEXPECTED pass (fixed) or a NEW fail still surfaces.
    const expect = r.expect || 'pass';

    // Raw counts reflect ACTUAL verdicts (for the report), independent of expectation.
    if (r.verdict === 'fail') counts.fail += 1;
    else if (r.verdict === 'review') counts.review += 1;
    else counts.pass += 1;

    if (r.unjudged === true) {
      // Excluded from reviews[]/fails[]/known_failing[]/resolved[] ON PURPOSE: the flake
      // budget (`reviews.length > flakeBudget`) exists for judge nondeterminism, not for
      // absence of judgment. Routing an unjudged state into reviews[] would let ONE
      // unjudged state roll up 'pass-with-reviews' under the default budget of 1 —
      // aodex#485 recurring at N=1.
      unjudged.push(r.state_id);
      continue;
    }

    if (expect === 'fail') {
      if (r.verdict === 'pass') resolved.push(r.state_id);
      else known_failing.push(r.state_id); // fail or review — expected while the issue is open
    } else {
      // expect === 'pass' (default) — preserves the original behavior exactly.
      if (r.verdict === 'fail') fails.push(r.state_id);
      else if (r.verdict === 'review') reviews.push(r.state_id);
    }
  }

  let verdict;
  if (fails.length > 0) {
    verdict = 'fail'; // a NEW/unexpected failure
  } else if (reviews.length > flakeBudget) {
    verdict = 'fail'; // unexpected reviews exceeded the flake budget → escalate
  } else if (unjudged.length > 0 && unjudgedPolicy === 'fail') {
    verdict = 'fail'; // consumer opted into hard-gating on any unjudged state
  } else if (reviews.length > 0 || unjudged.length > 0) {
    // A run can never be clean 'pass' while something was never looked at.
    verdict = 'pass-with-reviews';
  } else {
    verdict = 'pass';
  }

  return { verdict, counts, reviews, fails, known_failing, resolved, unjudged };
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

  // aodex#485: "nothing examined this state" must be distinguishable from "the judge
  // returned a malformed/disagreeing payload". Route an explicit unjudged marker BEFORE
  // validateJudgeResult so it is not swallowed as a generic validation-error review —
  // that swallow is exactly how the original defect hid at the next layer down.
  if (raw && typeof raw === 'object' && raw.unjudged === true) {
    return {
      valid: false,
      unjudged: true,
      errors: [raw.reason || `unjudged: no label for state_id '${request.state_id}' — nothing examined this state`],
    };
  }

  const validation = validateJudgeResult(raw);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors };
  }
  return { valid: true, result: raw };
}

// ─── Offline label-echo judge (dogfood/verify path; NEVER touches the network) ───

/**
 * Build an injectable judge fn that derives a Shape-C JudgeResult from a hand-built
 * label (labels.json) keyed by state_id, NOT from pixels. This is the judge used on the
 * df-tools dogfood/verify path so scoreState/scoreRun run end-to-end with ZERO network.
 *
 * good (is_broken:false) -> not-broken Shape-C; broken -> is_broken:true with the labeled
 * defect {type,severity}. The returned fn records its calls on `.calls` for assertions.
 *
 * @param {object} labels — { [state_id]: { is_broken, type?, severity? } }
 * @param {number} samples
 * @returns {function & {calls: Array}}
 */
function makeOfflineLabelEchoJudge(labels, samples) {
  const fn = function offlineLabelEchoJudge(request) {
    fn.calls.push(request);
    const hasLabel = !!(labels && Object.prototype.hasOwnProperty.call(labels, request.state_id));
    if (!hasLabel) {
      // aodex#485, the headline defect: a state_id absent from labels.json must NOT fall
      // through to a fabricated { is_broken: false } (the judge's default answer to a
      // question it was never asked was "looks fine" — that is the exact bug). Signal
      // "nothing examined this state" explicitly so the caller can never mistake it for
      // a not-broken verdict.
      return {
        state_id: request.state_id,
        unjudged: true,
        reason: `unjudged: no label for state_id '${request.state_id}' in labels.json — nothing examined this state`,
      };
    }
    const label = labels[request.state_id];
    const broken = label.is_broken === true;
    const defects = broken
      ? [{
          type: label.type || 'broken_layout',
          severity: label.severity || 'high',
          region: 'body',
          rationale: `dogfood label: ${request.state_id} is intended-broken`,
        }]
      : [];
    return {
      state_id: request.state_id,
      is_broken: broken,
      defects,
      // 32-02 (aodex#485 defect 2): a label lookup is not a perceptual comparison — no
      // confidence/matches_expected. `evidence: 'label'` states the basis instead of
      // fabricating a score for a comparison this judge never performed.
      evidence: 'label',
      samples,
      votes: broken ? { broken: samples, ok: 0 } : { broken: 0, ok: samples },
    };
  };
  fn.calls = [];
  return fn;
}

// ─── Default real vision judge (impure boundary; UNUSED in tests/verification) ───

// TDD-EXCEPTION: impure vision-API boundary; validated by the deferred GO/NO-GO gate
/**
 * DEFAULT real callVisionJudge implementation — the single network path. NEVER invoked
 * by the dogfood/verify path or any test (the injectable boundary guarantees this): callers
 * must explicitly opt in by passing this fn as the `judge` to callVisionJudge on a genuine run.
 *
 * Model id provenance: resolved via the repo's own MODEL_PROFILES path
 *   (references/model-profiles.json -> models[ agents['ui-evaluator'][profile] ]).
 *   We do NOT hardcode an id from memory (knowledge-cutoff predates current ids).
 * Image-input format provenance: the Anthropic Messages API image content block
 *   ({ type:'image', source:{ type:'base64', media_type:'image/png', data:<b64> } }).
 *   No claude-api/anthropic-messages SKILL.md was found under ~/.claude at execution time
 *   (`find ~/.claude -ipath '*claude-api*'` empty), so the documented Messages API shape is used.
 *
 * @param {object} request — the assembled judge request from callVisionJudge.
 * @returns {Promise<object>} a Shape-C-ish value (validated by callVisionJudge's caller).
 */
// Shape-C PERCEPTUAL schema — the fields the VISION MODEL produces for one screenshot.
// The aggregate fields (state_id/samples/votes) are added by parseVisionResponse, not the
// model. output_config.format pins the response to this schema so the text block is parseable
// JSON (supported on the 4.x family; json_schema requires additionalProperties:false + enums).
function visionPerceptualSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['is_broken', 'defects', 'matches_expected', 'confidence'],
    properties: {
      is_broken: { type: 'boolean' },
      matches_expected: { type: 'boolean' },
      confidence: { type: 'number' },
      defects: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'severity', 'region', 'rationale'],
          properties: {
            type: { type: 'string', enum: DEFECT_TYPES },
            severity: { type: 'string', enum: SEVERITIES },
            region: { type: 'string' },
            rationale: { type: 'string' },
          },
        },
      },
    },
  };
}

/**
 * PURE — build the Anthropic Messages API request body for one screenshot. Resolves the model
 * from model-profiles.json (ui-evaluator → tier → models[tier]); base64-encodes the screenshot;
 * anchors the prompt on request.expected + the taxonomy; pins the response to the perceptual schema.
 * Reads the screenshot file (deterministic given the path) so it's offline-testable with a real PNG.
 * @returns {{model:string, body:object}}
 */
function buildVisionRequest(request) {
  const profilesPath = path.join(__dirname, '..', '..', 'references', 'model-profiles.json');
  const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
  const profile = process.env.DEVFLOW_MODEL_PROFILE || 'balanced'; // judge runs hot → cost tier by default
  const tier = (profiles.agents['ui-evaluator'] || profiles.agents['df-ui-evaluator'] || {})[profile] || 'sonnet';
  const model = profiles.models[tier] || tier;

  const b64 = fs.readFileSync(request.screenshot_path).toString('base64');
  const taxonomy = `defect types: ${DEFECT_TYPES.join(', ')}; severities: ${SEVERITIES.join(', ')}`;
  const body = {
    model,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
        {
          type: 'text',
          text:
            `You are a strict UI-defect detector. Evaluate this screenshot for state ` +
            `"${request.state_id}".\nExpected appearance: ${request.expected}\n` +
            `Score DEVIATION from expected, not open-ended aesthetics. Taxonomy — ${taxonomy}.\n` +
            `If it matches expected with no defects, return is_broken:false, defects:[].`,
        },
      ],
    }],
    output_config: { format: { type: 'json_schema', schema: visionPerceptualSchema() } },
  };
  return { model, body };
}

/**
 * PURE — turn an Anthropic Messages API response body into a single-sample Shape-C JudgeResult
 * (state_id/samples:1/votes added here; perceptual fields from the model). Throws on a refusal
 * stop_reason, a missing text block, or non-JSON text. Returns { result, usage, model }.
 */
function parseVisionResponse(apiBody, request) {
  if (apiBody && apiBody.stop_reason === 'refusal') {
    throw new Error('vision judge refused: ' + ((apiBody.stop_details || {}).category || 'unknown'));
  }
  const textBlock = ((apiBody && apiBody.content) || []).find(b => b && b.type === 'text');
  if (!textBlock) throw new Error('vision response had no text block');
  let p;
  try { p = JSON.parse(textBlock.text); }
  catch (e) { throw new Error('vision response text was not JSON: ' + e.message); }
  const is_broken = p.is_broken === true;
  const result = {
    state_id: request.state_id,
    is_broken,
    defects: Array.isArray(p.defects) ? p.defects : [],
    matches_expected: p.matches_expected === true,
    confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    // 32-02: tag every live result here (not at the call site) so it is tagged regardless
    // of caller — a real comparison happened, so confidence/matches_expected are earned.
    evidence: 'vision',
    samples: 1, // ONE call = one sample; N-sample voting is the engine's job (aggregateVotes)
    votes: is_broken ? { broken: 1, ok: 0 } : { broken: 0, ok: 1 },
  };
  return { result, usage: (apiBody && apiBody.usage) || null, model: apiBody && apiBody.model };
}

/**
 * The single impure boundary — one synchronous curl to the Anthropic Messages API.
 * SYNC on purpose: callVisionJudge invokes the judge fn synchronously (same contract as the
 * offline judge), so an async fetch would break it; execFileSync('curl', …) keeps the contract.
 * NEVER reached by tests/verification — callers opt in by passing this as `judge`. Returns a
 * single-sample Shape-C JudgeResult. Throws (clear message) if no credential is configured.
 */
// One real Anthropic Messages call. Returns { result, usage, model } so the CLI proof-run can
// measure per-page token cost; defaultVisionJudge below is the thin judge-fn wrapper over it.
// Shared Anthropic Messages API boundary (ONE synchronous curl). Both modes ride this:
// the defect judge (liveVisionCall) and the design critic (flutter-ui-design-review.cjs) — so
// there is a single network/auth/error path, not two that drift. Returns the parsed apiBody.
function anthropicMessagesCall(body) {
  const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey && !authToken) {
    throw new Error(
      'no credential — set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN ' +
      '+ ANTHROPIC_BASE_URL) to run the live vision call.');
  }
  const headers = ['-H', 'content-type: application/json', '-H', 'anthropic-version: 2023-06-01'];
  if (apiKey) headers.push('-H', 'x-api-key: ' + apiKey);
  else headers.push('-H', 'authorization: Bearer ' + authToken, '-H', 'anthropic-beta: oauth-2025-04-20');
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(
    'curl',
    ['-sS', '-X', 'POST', base + '/v1/messages', ...headers, '-d', JSON.stringify(body)],
    { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
  let apiBody;
  try { apiBody = JSON.parse(out); }
  catch (e) { throw new Error('vision API non-JSON response: ' + String(out).slice(0, 200)); }
  if (apiBody.type === 'error') throw new Error('vision API error: ' + JSON.stringify(apiBody.error));
  return apiBody;
}

function liveVisionCall(request) {
  const { body } = buildVisionRequest(request);
  return parseVisionResponse(anthropicMessagesCall(body), request);
}

// The injectable judge-fn: returns a single-sample Shape-C JudgeResult (the contract callVisionJudge
// expects). SYNC on purpose (callVisionJudge calls the judge synchronously). NEVER reached by
// tests/verification — callers opt in by passing this as `judge`.
function defaultVisionJudge(request) {
  return liveVisionCall(request).result;
}

// ─── df-tools subcommand handler ─────────────────────────────────────────────────

/**
 * df-tools handler for: verify flutter-ui-eval <manifest|captureResults> [--raw]
 *                   and: flutter-ui eval <manifest|captureResults> [--raw]
 *
 * Scores a manifest's states through the REAL engine pipeline using the OFFLINE
 * label-echo judge (NO network). Emits a scoreRun rollup with per-state detail.
 * Mirrors cmdVerifyFlutterStateCoverage's arg-handling + output() usage.
 *
 * @param {string}        cwd  — working dir for relative-path resolution
 * @param {string[]}      args — args after the subcommand (path and/or flags)
 * @param {boolean}       raw  — --raw passthrough to output()
 */
/**
 * 32-04: write the FINAL scoreRun rollup and set the process's own exit code from its
 * verdict — a `fail` verdict must exit non-zero, or a CI step running this command is
 * green regardless of what it found (aodex#485, discovered during 32-04 planning).
 *
 * This mirrors helpers.cjs's `output()` JSON-serialize + 50KB-tmpfile-fallback behavior
 * exactly, but deliberately does NOT reuse `output()` for this one call site: `output()`
 * is shared by ~40 other df-tools commands and calls `process.exit(0)` unconditionally,
 * which (a) is out of this TRD's scope to change and (b) would hardcode 0 regardless of
 * the verdict even if it weren't. `process.exitCode` (not `process.exit()`) is used
 * deliberately per the TRD's own gotcha: `process.exit()` can truncate a buffered stdout
 * write before it fully flushes; setting `exitCode` lets Node exit naturally once the
 * write completes, so a failing run's rollup JSON is still fully readable (X1).
 *
 * Only `verdict: 'fail'` sets a non-zero exit code — `pass` and `pass-with-reviews` both
 * exit 0 (X2, X3). The not-found/invalid-manifest paths above this function are untouched
 * and continue to exit 0 via `output()` (X4) — verifier.md Step 8c routes that shape to
 * SKIPPED, never a hard CI failure.
 *
 * @param {object} result — the assembled rollup payload (same shape `output()` would take)
 * @param {'pass'|'pass-with-reviews'|'fail'} verdict — drives the exit code
 */
function outputRollup(result, verdict) {
  const json = JSON.stringify(result, null, 2);
  if (json.length > 50000) {
    const tmpPath = path.join(require('os').tmpdir(), `df-ui-eval-${Date.now()}.json`);
    fs.writeFileSync(tmpPath, json, 'utf-8');
    process.stdout.write('@file:' + tmpPath);
  } else {
    process.stdout.write(json);
  }
  process.exitCode = verdict === 'fail' ? 1 : 0;
}

function cmdVerifyFlutterUIEval(cwd, args, raw) {
  const list = Array.isArray(args) ? args : [args].filter(Boolean);
  const positional = list.filter(a => a && !a.startsWith('--'));
  const manifestArg = positional[0];

  if (!manifestArg || list.includes('--help')) {
    output({
      usage: 'verify flutter-ui-eval <manifest|captureResults> [--raw] [--judge live|labels] [--samples N]',
      description: 'Score a UI visual-eval manifest. Default (no --judge, or --judge labels): offline label-echo judge (deterministic, NO network) — this is an ADVISORY labels lookup, not a visual gate; its rollup carries gate:"advisory" and CANNOT clear a surface from human verification. --judge live runs the REAL Anthropic vision judge (needs ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN+ANTHROPIC_BASE_URL) N times/state -> real N-sample voting (flake) + per-page token cost; its rollup carries gate:"binding" — the ONLY standing that may retire a surface from human verification. An unrecognised --judge value is rejected with a usage error.',
      ok: true,
    }, raw);
    return;
  }

  // aodex#485 defect 3: judge selection is explicit, never a silent fallthrough. Absent
  // --judge means 'labels' (the pre-existing default path, unchanged in behaviour) — but the
  // VALUE must always be one of the two recognised modes, so a typo can never be misread as
  // "run the offline path" when the caller actually meant to ask for the live gate.
  const judgeIdx = list.indexOf('--judge');
  const judgeArg = judgeIdx >= 0 ? list[judgeIdx + 1] : undefined;
  let judgeMode;
  if (judgeArg === undefined) {
    judgeMode = 'labels';
  } else if (judgeArg === 'live' || judgeArg === 'labels') {
    judgeMode = judgeArg;
  } else {
    error(`unrecognised --judge value '${judgeArg}' — expected 'live' or 'labels' (bare invocation defaults to 'labels'); refusing to silently fall through to the offline path`);
    return; // unreachable — error() calls process.exit(1); kept for readability/testability
  }

  const absManifest = path.isAbsolute(manifestArg) ? manifestArg : path.join(cwd, manifestArg);
  if (!fs.existsSync(absManifest)) {
    output({ error: 'manifest/captureResults not found', path: manifestArg, ok: false }, raw);
    return;
  }

  let manifest;
  try {
    manifest = loadManifest(absManifest);
  } catch (e) {
    output({ error: 'invalid manifest: ' + e.message, path: absManifest, ok: false }, raw);
    return;
  }

  const manifestDir = path.dirname(absManifest);
  const samples = typeof manifest.samples === 'number' ? manifest.samples : 3;
  const flakeBudget = typeof manifest.flakeBudget === 'number' ? manifest.flakeBudget : 1;
  // aodex#485: default 'review' keeps a fully-labelled manifest byte-identical to pre-fix
  // behaviour; a consumer (e.g. CI) can opt into 'fail' via the manifest to hard-gate.
  const unjudgedPolicy = manifest.unjudgedPolicy === 'fail' ? 'fail' : 'review';
  const liveJudge = judgeMode === 'live';
  // `gate` is the run's STANDING — what authority its verdict carries — not its outcome.
  // Only 'binding' (the live path) may retire a surface from human verification; 'advisory'
  // (the default/labels path) is a labels lookup and must never claim that authority, even
  // on a clean pass. See verifier.md Step 8c and OBJECTIVE.md "Decision: what the default
  // judge does" for the full reasoning (aodex#485 defect 3).
  const gate = liveJudge ? 'binding' : 'advisory';
  const sIdx = list.indexOf('--samples');
  const nSamples = sIdx >= 0 ? Math.max(1, parseInt(list[sIdx + 1], 10) || samples) : samples;

  // Hand-built labels alongside the manifest drive the OFFLINE judge (no pixels, no network).
  const labelsPath = path.join(manifestDir, 'labels.json');
  const labels = fs.existsSync(labelsPath)
    ? JSON.parse(fs.readFileSync(labelsPath, 'utf-8'))
    : {};
  const offlineJudge = makeOfflineLabelEchoJudge(labels, samples);

  const stateResults = [];
  const stateDetail = [];
  const usageTotal = { input_tokens: 0, output_tokens: 0 };
  let liveModel = null;

  for (const st of manifest.states) {
    // 32-02 (A1): resolve the state's id, preferring the canonical `state_id` key. Fall
    // back to `st.id` (the shape buildManifestStub used to emit, pre-32-02) ONLY when
    // `state_id` is absent — and NEVER silently: an advisory records that the manifest
    // used a non-canonical key, so the shape mismatch stays visible rather than becoming
    // a permanent, invisible second-accepted-shape. Without this, an unnameable state
    // (`state_id: undefined`) rolls up as `null` in reviews[]/unjudged[] — a finding
    // nobody can act on.
    const idAdvisories = [];
    let stateId = st.state_id;
    if (stateId === undefined && st.id !== undefined) {
      stateId = st.id;
      idAdvisories.push(
        `manifest state used non-canonical key 'id' (value: '${st.id}') instead of 'state_id' — resolved via fallback`,
      );
    }

    // Load the Shape-B capture for this state (relative to the manifest dir).
    let capture = null;
    if (st.capture_path) {
      const capPath = path.isAbsolute(st.capture_path)
        ? st.capture_path
        : path.join(manifestDir, st.capture_path);
      if (fs.existsSync(capPath)) capture = JSON.parse(fs.readFileSync(capPath, 'utf-8'));
    }
    if (!capture) {
      capture = { state_id: stateId, surface: st.surface, screenshot_path: st.screenshot_path, metadata: { expected: st.expected } };
    }

    if (liveJudge) {
      // LIVE: N INDEPENDENT real vision calls per state → genuine N-sample voting (flake) +
      // per-page token cost. A refusal / credential / network error downgrades the state to review.
      const sp = (capture && capture.screenshot_path) || st.screenshot_path;
      const screenshot_path = sp && !path.isAbsolute(sp) ? path.join(manifestDir, sp) : sp;
      const request = { state_id: stateId, surface: st.surface, screenshot_path, expected: st.expected, defect_types: DEFECT_TYPES, severities: SEVERITIES };
      const liveSamples = [];
      let liveErr = null;
      for (let i = 0; i < nSamples; i++) {
        try {
          const r = liveVisionCall(request);
          liveSamples.push(r.result);
          if (r.usage) { usageTotal.input_tokens += r.usage.input_tokens || 0; usageTotal.output_tokens += r.usage.output_tokens || 0; }
          if (r.model) liveModel = r.model;
        } catch (e) { liveErr = e.message; break; }
      }
      if (liveErr || liveSamples.length === 0) {
        stateResults.push({ state_id: stateId, verdict: 'review', advisories: [...idAdvisories, liveErr || 'no live samples'], expect: st.expect });
        stateDetail.push({ state_id: stateId, verdict: 'review', is_broken: null, defects: [], errors: [...idAdvisories, liveErr || 'no live samples'] });
        continue;
      }
      const agg = aggregateVotes(liveSamples);
      const stateScore = scoreState({ samples: liveSamples });
      stateResults.push({ state_id: stateId, verdict: stateScore.verdict, advisories: [...idAdvisories, ...stateScore.advisories], expect: st.expect });
      stateDetail.push({
        state_id: stateId,
        verdict: stateScore.verdict,
        is_broken: agg.is_broken,
        flake: agg.split === true || agg.tie === true, // the N samples disagreed → flaky judgment
        votes: agg.votes,
        defects: liveSamples.flatMap(s => s.defects || []),
        // Every live sample is tagged evidence:'vision' by parseVisionResponse; the
        // rollup surfaces the same tag so a consumer never has to cross-reference the
        // run-level `judge` field to know a real comparison happened for THIS state.
        evidence: 'vision',
        advisories: [...idAdvisories, ...stateScore.advisories],
      });
      continue;
    }

    // OFFLINE (default): deterministic label-echo judge through callVisionJudge (no network).
    const judged = callVisionJudge({ capture, expected: st.expected, judge: offlineJudge });
    if (judged.unjudged) {
      // aodex#485: a state_id absent from labels.json — nothing examined this state.
      // Routed to review (never pass, never fail — see OBJECTIVE.md Decision), flagged
      // `unjudged: true` so scoreRun buckets it separately from a genuine judge-disagreement
      // review, and named explicitly in the advisory so the reason is never mistaken for a
      // malformed-payload validation error.
      stateResults.push({ state_id: stateId, verdict: 'review', advisories: [...idAdvisories, ...judged.errors], expect: st.expect, unjudged: true });
      stateDetail.push({ state_id: stateId, verdict: 'review', is_broken: null, defects: [], errors: judged.errors, advisories: [...idAdvisories, ...judged.errors], unjudged: true });
      continue;
    }
    if (!judged.valid) {
      stateResults.push({ state_id: stateId, verdict: 'review', advisories: [...idAdvisories, ...judged.errors], expect: st.expect });
      stateDetail.push({ state_id: stateId, verdict: 'review', is_broken: null, defects: [], errors: judged.errors, advisories: idAdvisories });
      continue;
    }
    const sampleSet = Array.from({ length: samples }, () => judged.result);
    const stateScore = scoreState({ samples: sampleSet });
    stateResults.push({ state_id: stateId, verdict: stateScore.verdict, advisories: [...idAdvisories, ...stateScore.advisories], expect: st.expect });
    stateDetail.push({
      state_id: stateId,
      verdict: stateScore.verdict,
      is_broken: judged.result.is_broken,
      defects: judged.result.defects,
      // 32-02: surface the judge result's own evidence tag ('label' on this default
      // offline path) so a consumer reading ONE state's detail can see the basis of its
      // verdict without cross-referencing the run-level `judge` field.
      evidence: judged.result.evidence,
      advisories: [...idAdvisories, ...stateScore.advisories],
    });
  }

  const rollup = scoreRun(stateResults, { flakeBudget, unjudgedPolicy });

  // 32-04: the process's own exit code now reflects the verdict — see outputRollup() above.
  outputRollup({
    manifest_path: absManifest,
    network: liveJudge,                                  // true only on the live path
    judge: liveJudge ? 'live-vision' : 'offline-label-echo',
    // aodex#485 defect 3: the run's STANDING, distinct from `judge`/`network` (what ran /
    // did it touch the network). 'binding' ONLY on --judge live; 'advisory' otherwise —
    // regardless of this run's verdict. See verifier.md Step 8c for the consuming rule.
    gate,
    model: liveJudge ? liveModel : undefined,
    samples: liveJudge ? nSamples : samples,
    flakeBudget,
    unjudgedPolicy,
    verdict: rollup.verdict,
    counts: rollup.counts,
    reviews: rollup.reviews,
    fails: rollup.fails,
    known_failing: rollup.known_failing, // expect:fail states still failing — tracked, not a new regression
    resolved: rollup.resolved,           // expect:fail states now passing — likely fixed; drop the known_broken flag
    unjudged: rollup.unjudged,           // aodex#485: states nothing examined — own bucket, never reviews[]
    usage: liveJudge ? usageTotal : undefined,           // per-run token totals for cost estimation
    states: stateDetail,
  }, rollup.verdict);
}

module.exports = {
  loadManifest,
  validateJudgeResult,
  aggregateVotes,
  scoreState,
  scoreRun,
  callVisionJudge,
  makeOfflineLabelEchoJudge,
  defaultVisionJudge,
  liveVisionCall,
  anthropicMessagesCall,
  buildVisionRequest,
  parseVisionResponse,
  visionPerceptualSchema,
  cmdVerifyFlutterUIEval,
  DEFECT_TYPES,
  SEVERITIES,
};

'use strict';
// flutter-ui-design-review.cjs — the DESIGN-CRITIC mode of the UI visual-eval layer.
//
// Second mode of the same screenshot → vision-model boundary as the defect judge
// (flutter-ui-eval.cjs). Where the defect judge answers "is this BROKEN?" (gates CI), the
// design critic answers "is this GOOD design, and how to improve it?" — ADVISORY, never gates.
// Both ride the one shared anthropicMessagesCall (no duplicated network/auth/error path).
//
// Anchored — NOT open-ended (the core lesson from the defect judge): the critique scores
// DEVIATION from (1) the project design system (eden-ui-flutter tokens, passed in as text),
// (2) UX heuristics, and (3) the per-page design_intent. Every finding must cite the violated
// token/heuristic. Output is Shape-D (DesignReview), validated like Shape-C.
//
// Exports pure build/parse/validate/aggregate (offline-testable) + the impure runDesignReview.

const fs = require('node:fs');
const path = require('node:path');
const { anthropicMessagesCall } = require('./flutter-ui-eval.cjs');

// Design dimensions the critic scores. Findings tag one dimension each.
const DESIGN_DIMENSIONS = [
  'visual_hierarchy',
  'spacing_layout',
  'typography',
  'color_contrast',
  'consistency',
  'affordance_discoverability',
  'responsive',
  'brand_alignment',
];
// Priority reuses the defect-judge severity vocabulary so reports read consistently.
const PRIORITIES = ['low', 'medium', 'high'];

// Shape-D PERCEPTUAL schema — what the model returns for one screen. The state_id/surface are
// added by parseDesignReviewResponse (request-derived), not the model.
function designReviewSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['findings', 'summary'],
    properties: {
      summary: { type: 'string' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['dimension', 'priority', 'anchor', 'observation', 'suggestion'],
          properties: {
            dimension: { type: 'string', enum: DESIGN_DIMENSIONS },
            priority: { type: 'string', enum: PRIORITIES },
            anchor: { type: 'string' },       // which token / heuristic / intent it violates
            observation: { type: 'string' },  // what's off, grounded in the screen
            suggestion: { type: 'string' },   // concrete fix
          },
        },
      },
    },
  };
}

// Resolve the vision model from the df-ui-evaluator profile (same source as the defect judge).
function resolveCriticModel() {
  const p = path.join(__dirname, '..', '..', 'references', 'model-profiles.json');
  const profiles = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const profile = process.env.DEVFLOW_MODEL_PROFILE || 'balanced';
  const tier = (profiles.agents['df-ui-evaluator'] || {})[profile] || 'sonnet';
  return profiles.models[tier] || tier;
}

/**
 * PURE — build the Anthropic Messages request for a design critique of one screen. Anchors the
 * prompt on the design-system reference text + heuristics + the page's design_intent + the
 * dimension list; pins the response to the Shape-D schema. Reads the screenshot (deterministic).
 * @param {{state_id,surface,screenshot_path,design_intent,design_system}} request
 * @returns {{model:string, body:object}}
 */
function buildDesignReviewRequest(request) {
  const model = resolveCriticModel();
  const b64 = fs.readFileSync(request.screenshot_path).toString('base64');
  const dims = DESIGN_DIMENSIONS.join(', ');
  const body = {
    model,
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
        {
          type: 'text',
          text:
            `You are a senior product designer reviewing this screen ("${request.state_id}").\n\n` +
            `DESIGN SYSTEM (score deviation from these tokens; cite the specific token):\n` +
            `${request.design_system || '(none provided)'}\n\n` +
            `PAGE DESIGN INTENT: ${request.design_intent || '(none — judge against the system + heuristics)'}\n\n` +
            `Review across these dimensions: ${dims}. For EACH finding, cite in "anchor" the exact ` +
            `token (e.g. "EdenSpacing.space4=16", "Outfit headlineLarge", "gold #D4A853", "WCAG AA") ` +
            `or heuristic it violates — no generic platitudes ("add more whitespace") without an anchor. ` +
            `Give a concrete "suggestion". Prioritize: high = hurts usability/brand materially, ` +
            `medium = noticeable polish gap, low = nitpick. If the screen is on-system with no issues, ` +
            `return findings:[] and say so in summary.`,
        },
      ],
    }],
    output_config: { format: { type: 'json_schema', schema: designReviewSchema() } },
  };
  return { model, body };
}

// PURE — Shape-D guard. Returns { valid, errors[] }.
function validateDesignReview(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['not an object'] };
  if (typeof obj.summary !== 'string') errors.push('summary must be a string');
  if (!Array.isArray(obj.findings)) {
    errors.push('findings must be an array');
    return { valid: false, errors };
  }
  obj.findings.forEach((f, i) => {
    if (!f || typeof f !== 'object') { errors.push(`findings[${i}]: not an object`); return; }
    if (!DESIGN_DIMENSIONS.includes(f.dimension)) errors.push(`findings[${i}]: invalid dimension "${f.dimension}"`);
    if (!PRIORITIES.includes(f.priority)) errors.push(`findings[${i}]: invalid priority "${f.priority}"`);
    for (const k of ['anchor', 'observation', 'suggestion']) {
      if (typeof f[k] !== 'string' || f[k].trim() === '') errors.push(`findings[${i}]: ${k} must be a non-empty string`);
    }
  });
  return { valid: errors.length === 0, errors };
}

/**
 * PURE — turn an Anthropic response body into a Shape-D DesignReview (state_id/surface added here).
 * Throws on refusal / missing-text / non-JSON. Returns { result, usage, model }.
 */
function parseDesignReviewResponse(apiBody, request) {
  if (apiBody && apiBody.stop_reason === 'refusal') {
    throw new Error('design critic refused: ' + ((apiBody.stop_details || {}).category || 'unknown'));
  }
  const textBlock = ((apiBody && apiBody.content) || []).find(b => b && b.type === 'text');
  if (!textBlock) throw new Error('design response had no text block');
  let p;
  try { p = JSON.parse(textBlock.text); }
  catch (e) { throw new Error('design response text was not JSON: ' + e.message); }
  const result = {
    state_id: request.state_id,
    surface: request.surface,
    findings: Array.isArray(p.findings) ? p.findings : [],
    summary: typeof p.summary === 'string' ? p.summary : '',
  };
  return { result, usage: (apiBody && apiBody.usage) || null, model: apiBody && apiBody.model };
}

// IMPURE — one real critique call (rides the shared boundary). Returns { result, usage, model }.
function runDesignReview(request) {
  const { body } = buildDesignReviewRequest(request);
  return parseDesignReviewResponse(anthropicMessagesCall(body), request);
}

// PURE — roll up per-screen DesignReviews into a prioritized design-debt list + counts. Advisory:
// no pass/fail. high → low ordering so the sweep report and the objective-work loop surface the
// biggest issues first.
function aggregateDesignReview(results) {
  const rank = { high: 0, medium: 1, low: 2 };
  const debt = [];
  const counts = { high: 0, medium: 0, low: 0 };
  const byDimension = {};
  for (const r of results || []) {
    if (!r || !Array.isArray(r.findings)) continue;
    for (const f of r.findings) {
      debt.push({ state_id: r.state_id, surface: r.surface, ...f });
      if (counts[f.priority] !== undefined) counts[f.priority] += 1;
      byDimension[f.dimension] = (byDimension[f.dimension] || 0) + 1;
    }
  }
  debt.sort((a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9));
  return { debt, counts, byDimension, total: debt.length };
}

module.exports = {
  DESIGN_DIMENSIONS,
  PRIORITIES,
  designReviewSchema,
  buildDesignReviewRequest,
  parseDesignReviewResponse,
  validateDesignReview,
  runDesignReview,
  aggregateDesignReview,
};

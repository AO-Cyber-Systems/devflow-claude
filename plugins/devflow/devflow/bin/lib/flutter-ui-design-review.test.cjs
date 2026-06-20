'use strict';
// Tests for flutter-ui-design-review.cjs — the design-critic mode (Shape-D / DesignReview).
// Pure build/parse/validate/aggregate only; zero network; hand-built fixtures (no LLM data).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  DESIGN_DIMENSIONS,
  PRIORITIES,
  buildDesignReviewRequest,
  parseDesignReviewResponse,
  validateDesignReview,
  aggregateDesignReview,
  formatDesignDebtReport,
  cmdDesignReview,
} = require('./flutter-ui-design-review.cjs');

const REAL_PNG = path.join(__dirname, '__fixtures__', 'flutter-ui-eval', 'good-dashboard.png');

// ── fixture generators (the only synthetic data) ──────────────────────────────
function makeFinding(overrides = {}) {
  return {
    dimension: 'spacing_layout',
    priority: 'medium',
    anchor: 'EdenSpacing.space4=16',
    observation: 'card padding is 18px, off the 4px grid',
    suggestion: 'use space4 (16) or space5 (20)',
    ...overrides,
  };
}
function makeReview(overrides = {}) {
  return { state_id: 's', surface: 'web', findings: [makeFinding()], summary: 'mostly on-system', ...overrides };
}
function makeApiBody(reviewLike) {
  return { model: 'claude-test', stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 200 },
    content: [{ type: 'text', text: JSON.stringify(reviewLike) }] };
}

// ── buildDesignReviewRequest ──────────────────────────────────────────────────
test.describe('buildDesignReviewRequest (anchored, pure)', () => {
  test('D1 — image block + prompt anchored on design-system + intent + dimensions + json_schema', () => {
    const req = {
      state_id: 'crm-contacts-populated', surface: 'web', screenshot_path: REAL_PNG,
      design_intent: 'dense ops table; scannability over whitespace',
      design_system: 'Spacing: 4px grid. Type: Outfit/Plus Jakarta Sans. Brand: gold #D4A853.',
    };
    const { model, body } = buildDesignReviewRequest(req);
    assert.ok(typeof model === 'string' && model.length > 0);
    const img = body.messages[0].content[0];
    assert.strictEqual(img.type, 'image');
    assert.ok(img.source.data.length > 0);
    const txt = body.messages[0].content[1].text;
    assert.ok(/senior product designer/i.test(txt));
    assert.ok(txt.includes('gold #D4A853'), 'prompt embeds the design-system reference');
    assert.ok(txt.includes('dense ops table'), 'prompt embeds the page design_intent');
    assert.ok(txt.includes('visual_hierarchy') && txt.includes('brand_alignment'), 'lists dimensions');
    assert.ok(/cite/i.test(txt) && /anchor/i.test(txt), 'requires an anchor per finding');
    // Response pinned to Shape-D.
    assert.strictEqual(body.output_config.format.type, 'json_schema');
    const schema = body.output_config.format.schema;
    assert.deepStrictEqual(schema.properties.findings.items.properties.dimension.enum, DESIGN_DIMENSIONS);
    assert.deepStrictEqual(schema.properties.findings.items.properties.priority.enum, PRIORITIES);
  });
});

// ── parseDesignReviewResponse ─────────────────────────────────────────────────
test.describe('parseDesignReviewResponse (pure)', () => {
  test('D2 — valid body -> Shape-D with state_id/surface added; validates', () => {
    const apiBody = makeApiBody({ findings: [makeFinding({ priority: 'high', dimension: 'responsive' })], summary: 's' });
    const { result, usage, model } = parseDesignReviewResponse(apiBody, { state_id: 'x', surface: 'web' });
    assert.strictEqual(result.state_id, 'x');
    assert.strictEqual(result.surface, 'web');
    assert.strictEqual(result.findings.length, 1);
    assert.strictEqual(validateDesignReview(result).valid, true);
    assert.strictEqual(usage.input_tokens, 1500);
    assert.strictEqual(model, 'claude-test');
  });
  test('D3 — refusal -> throws', () => {
    assert.throws(() => parseDesignReviewResponse({ stop_reason: 'refusal', stop_details: { category: 'x' }, content: [] }, { state_id: 'x' }), /refused/);
  });
  test('D4 — non-JSON text -> throws', () => {
    assert.throws(() => parseDesignReviewResponse({ content: [{ type: 'text', text: 'here is my critique' }] }, { state_id: 'x' }), /not JSON/);
  });
});

// ── validateDesignReview ──────────────────────────────────────────────────────
test.describe('validateDesignReview (Shape-D guard)', () => {
  test('D5 — fully valid -> ok', () => {
    assert.strictEqual(validateDesignReview(makeReview()).valid, true);
  });
  test('D6 — bad dimension enum -> rejected', () => {
    const r = validateDesignReview(makeReview({ findings: [makeFinding({ dimension: 'vibes' })] }));
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /dimension/.test(e)));
  });
  test('D7 — bad priority enum -> rejected', () => {
    const r = validateDesignReview(makeReview({ findings: [makeFinding({ priority: 'critical' })] }));
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /priority/.test(e)));
  });
  test('D8 — empty anchor -> rejected (no anchorless platitudes)', () => {
    const r = validateDesignReview(makeReview({ findings: [makeFinding({ anchor: '' })] }));
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /anchor/.test(e)));
  });
  test('D9 — findings not an array -> rejected', () => {
    const r = validateDesignReview({ summary: 's', findings: 'nope' });
    assert.strictEqual(r.valid, false);
  });
});

// ── aggregateDesignReview ─────────────────────────────────────────────────────
test.describe('aggregateDesignReview (advisory rollup)', () => {
  test('D10 — flattens + sorts high→low, counts by priority + dimension', () => {
    const results = [
      makeReview({ state_id: 'a', findings: [makeFinding({ priority: 'low', dimension: 'typography' })] }),
      makeReview({ state_id: 'b', findings: [
        makeFinding({ priority: 'high', dimension: 'responsive' }),
        makeFinding({ priority: 'medium', dimension: 'spacing_layout' }),
      ] }),
    ];
    const agg = aggregateDesignReview(results);
    assert.strictEqual(agg.total, 3);
    assert.strictEqual(agg.debt[0].priority, 'high', 'highest priority first');
    assert.strictEqual(agg.debt[agg.debt.length - 1].priority, 'low');
    assert.deepStrictEqual(agg.counts, { high: 1, medium: 1, low: 1 });
    assert.strictEqual(agg.byDimension.responsive, 1);
    assert.strictEqual(agg.debt[0].state_id, 'b', 'debt items carry their state_id');
  });
  test('D11 — empty / no-findings reviews -> empty debt, zero counts', () => {
    const agg = aggregateDesignReview([makeReview({ findings: [] }), null]);
    assert.strictEqual(agg.total, 0);
    assert.deepStrictEqual(agg.counts, { high: 0, medium: 0, low: 0 });
  });
});

// ── formatDesignDebtReport (PURE — no LLM data; hand-built aggregate) ──────────
test.describe('formatDesignDebtReport (pure markdown render)', () => {
  test('D12 — markdown carries the high item FIRST, the counts, and every anchor', () => {
    // aggregateDesignReview sorts high→low; feed it an unsorted set and let it sort.
    const agg = aggregateDesignReview([
      makeReview({ state_id: 'a', findings: [makeFinding({ priority: 'low', dimension: 'typography', anchor: 'Outfit bodySmall' })] }),
      makeReview({ state_id: 'b', findings: [makeFinding({ priority: 'high', dimension: 'color_contrast', anchor: 'WCAG AA 4.5:1', observation: 'gold-on-white fails contrast', suggestion: 'darken to #B8862F' })] }),
      makeReview({ state_id: 'c', findings: [makeFinding({ priority: 'medium', dimension: 'spacing_layout', anchor: 'EdenSpacing.space4=16' })] }),
    ]);
    const md = formatDesignDebtReport(agg, { manifest_path: '/tmp/m.json', model: 'claude-test', live: true });
    // advisory framing present
    assert.ok(/ADVISORY/i.test(md), 'report states it is advisory');
    // counts rendered
    assert.ok(md.includes('high: 1') && md.includes('medium: 1') && md.includes('low: 1'), 'priority counts present');
    // the HIGH item appears before the LOW item in the debt list
    const hiIdx = md.indexOf('WCAG AA 4.5:1');
    const loIdx = md.indexOf('Outfit bodySmall');
    assert.ok(hiIdx > -1 && loIdx > -1 && hiIdx < loIdx, 'high-priority anchor precedes low-priority anchor');
    // the first debt entry is the high one
    const firstEntry = md.indexOf('### 1.');
    assert.ok(md.slice(firstEntry, firstEntry + 120).includes('[high]'), 'first listed debt item is high priority');
    // every anchor is present
    for (const a of ['WCAG AA 4.5:1', 'EdenSpacing.space4=16', 'Outfit bodySmall']) {
      assert.ok(md.includes(a), 'anchor present: ' + a);
    }
  });
  test('D13 — empty aggregate -> still renders advisory + zero counts, no crash', () => {
    const md = formatDesignDebtReport(aggregateDesignReview([]), {});
    assert.ok(/ADVISORY/i.test(md));
    assert.ok(md.includes('high: 0') && md.includes('low: 0'));
    assert.ok(/No design debt recorded/.test(md));
  });
});

// ── cmdDesignReview OFFLINE (no --live / no key) — no network, writes a report ──
test.describe('cmdDesignReview offline (no network)', () => {
  const fs = require('node:fs');
  const os = require('node:os');

  test('D14 — no --live, no key: live:false + advisory:true, every state skipped, report written', () => {
    // ensure no credential leaks into the offline assertion
    const savedKey = process.env.ANTHROPIC_API_KEY;
    const savedTok = process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-test-'));
    const manifest = {
      design_system_path: 'design-system.md',
      states: [
        { state_id: 's1', surface: 'web', screenshot_path: REAL_PNG, design_intent: 'dense table' },
        { state_id: 's2', surface: 'web', screenshot_path: REAL_PNG, design_intent: 'empty state' },
      ],
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');
    fs.writeFileSync(path.join(dir, 'design-system.md'), 'Spacing: 4px grid.', 'utf-8');

    // capture output() — it calls process.exit(0); intercept both stdout + exit.
    let captured = '';
    const realWrite = process.stdout.write.bind(process.stdout);
    const realExit = process.exit.bind(process);
    process.stdout.write = (s) => { captured += s; return true; };
    process.exit = () => { throw new Error('__exit__'); };
    try {
      cmdDesignReview(dir, [path.join(dir, 'manifest.json'), '--raw'], true);
    } catch (e) {
      if (e.message !== '__exit__') throw e;
    } finally {
      process.stdout.write = realWrite;
      process.exit = realExit;
      if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
      if (savedTok !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = savedTok;
    }

    const out = JSON.parse(captured);
    assert.strictEqual(out.live, false, 'no live run without --live/key');
    assert.strictEqual(out.advisory, true, 'always advisory');
    assert.strictEqual(out.judge, 'design-critic');
    assert.strictEqual(out.total, 0, 'no findings collected offline');
    assert.strictEqual(out.skipped.length, 2, 'every state skipped');
    assert.ok(out.skipped.every(s => /live critique required/.test(s.reason)), 'clear skip reason');
    // a report was written next to the manifest
    assert.ok(fs.existsSync(path.join(dir, 'design-review-report.md')), 'markdown report written');
    assert.ok(fs.existsSync(path.join(dir, 'design-review-report.json')), 'json report written');
  });
});

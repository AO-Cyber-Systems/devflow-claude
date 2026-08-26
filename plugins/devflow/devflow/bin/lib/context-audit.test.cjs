'use strict';

/**
 * context-audit.test.cjs — TRD 29-04
 *
 * The most important test here is the image one. A first pass at this analysis
 * counted base64 length as tokens and concluded screenshots were 19% of context;
 * the true figure is 1.5%. That is a ~25x error, and it pointed the whole
 * remediation at the wrong target. If this suite ever goes green with base64
 * length being counted, the tool is lying again.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  accumulate, summarize, newAccumulator, tokensOfResult, TOKENS_PER_IMAGE,
} = require('./context-audit.cjs');

const assistant = (content, extra = {}) => ({
  type: 'assistant', message: { role: 'assistant', content, ...extra.message }, ...extra,
});
const userResult = (id, content) => ({
  type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] },
});

describe('tokensOfResult() — image accounting', () => {
  test('a plain string is priced by length', () => {
    const r = tokensOfResult('x'.repeat(4000));
    assert.equal(Math.round(r.text), 1000);
    assert.equal(r.image, 0);
  });

  test('an image block is priced per block, NOT by base64 length', () => {
    const huge = 'A'.repeat(600000); // ~150KB of base64 → 150k "tokens" if counted wrong
    const r = tokensOfResult([{ type: 'image', source: { type: 'base64', data: huge } }]);
    assert.equal(r.image, TOKENS_PER_IMAGE);
    assert.equal(r.text, 0, 'base64 payload must contribute ZERO text tokens');
  });

  test('the base64 trap: a screenshot cannot dominate a transcript', () => {
    const acc = newAccumulator();
    // one screenshot with a huge payload, plus modest real text
    acc.toolNameById = {};
    accumulate(acc, assistant([{ type: 'tool_use', id: 't1', name: 'Screenshot', input: {} }]));
    accumulate(acc, userResult('t1', [{ type: 'image', source: { data: 'A'.repeat(600000) } }]));
    accumulate(acc, assistant([{ type: 'tool_use', id: 't2', name: 'Read', input: {} }]));
    accumulate(acc, userResult('t2', 'y'.repeat(400000))); // 100k tokens of real text

    const s = summarize(acc);
    assert.ok(s.composition.images_pct < 5,
      `images should be a rounding error, got ${s.composition.images_pct}% — base64 is being counted`);
    assert.ok(s.composition.tool_results_pct > 90,
      `text results should dominate, got ${s.composition.tool_results_pct}%`);
  });

  test('mixed text + image blocks are split correctly', () => {
    const r = tokensOfResult([
      { type: 'text', text: 'z'.repeat(400) },
      { type: 'image', source: { data: 'A'.repeat(50000) } },
    ]);
    assert.equal(Math.round(r.text), 100);
    assert.equal(r.image, TOKENS_PER_IMAGE);
  });
});

describe('accumulate() — attribution', () => {
  test('tool results are attributed to the tool that produced them', () => {
    const acc = newAccumulator();
    accumulate(acc, assistant([{ type: 'tool_use', id: 'a', name: 'Read', input: { file_path: '/x' } }]));
    accumulate(acc, userResult('a', 'r'.repeat(8000)));
    accumulate(acc, assistant([{ type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'ls' } }]));
    accumulate(acc, userResult('b', 'b'.repeat(400)));

    const s = summarize(acc);
    const byTool = Object.fromEntries(s.by_tool.map(t => [t.tool, t]));
    assert.equal(byTool.Read.calls, 1);
    assert.equal(byTool.Read.tokens, 2000);
    assert.equal(byTool.Bash.tokens, 100);
    assert.ok(byTool.Read.share_pct > byTool.Bash.share_pct);
  });

  test('an orphan tool_result is recorded, not dropped', () => {
    const acc = newAccumulator();
    accumulate(acc, userResult('missing', 'x'.repeat(400)));
    const s = summarize(acc);
    assert.equal(s.by_tool[0].tool, '(unknown)');
  });

  test('tool_use inputs are counted separately from results', () => {
    const acc = newAccumulator();
    accumulate(acc, assistant([{
      type: 'tool_use', id: 'w', name: 'Write',
      input: { file_path: '/f', content: 'c'.repeat(40000) },
    }]));
    const s = summarize(acc);
    assert.ok(s.composition.tool_inputs_pct > 90,
      'a full-file Write body must land in tool_inputs, which is the point of the metric');
  });

  test('per-turn context uses reported usage, split by sidechain', () => {
    const acc = newAccumulator();
    accumulate(acc, { type: 'assistant', isSidechain: true, message: { usage: { input_tokens: 1000, cache_read_input_tokens: 120000 } } });
    accumulate(acc, { type: 'assistant', isSidechain: false, message: { usage: { input_tokens: 2000, cache_read_input_tokens: 400000 } } });
    const s = summarize(acc);
    assert.equal(s.context_per_turn.subagent.turns, 1);
    assert.equal(s.context_per_turn.subagent.p50, 121000);
    assert.equal(s.context_per_turn.main_thread.p50, 402000);
    assert.equal(s.context_per_turn.main_thread.over_200k_pct, 100);
  });

  test('malformed rows are skipped without throwing', () => {
    const acc = newAccumulator();
    for (const bad of [null, undefined, 'string', 42, {}, { message: null }, { message: { content: 'not-array' } }]) {
      assert.doesNotThrow(() => accumulate(acc, bad));
    }
  });
});

describe('summarize() — targets', () => {
  test('read_share_ok is false when Read exceeds 40% of result tokens', () => {
    const acc = newAccumulator();
    accumulate(acc, assistant([{ type: 'tool_use', id: 'r', name: 'Read', input: {} }]));
    accumulate(acc, userResult('r', 'x'.repeat(80000)));
    accumulate(acc, assistant([{ type: 'tool_use', id: 'b', name: 'Bash', input: {} }]));
    accumulate(acc, userResult('b', 'x'.repeat(4000)));
    const s = summarize(acc);
    assert.ok(s.targets.read_share_pct > 40);
    assert.equal(s.targets.read_share_ok, false);
  });

  test('read_share_ok is true once Bash dominates', () => {
    const acc = newAccumulator();
    accumulate(acc, assistant([{ type: 'tool_use', id: 'r', name: 'Read', input: {} }]));
    accumulate(acc, userResult('r', 'x'.repeat(4000)));
    accumulate(acc, assistant([{ type: 'tool_use', id: 'b', name: 'Bash', input: {} }]));
    accumulate(acc, userResult('b', 'x'.repeat(80000)));
    const s = summarize(acc);
    assert.equal(s.targets.read_share_ok, true);
  });

  test('an empty corpus summarizes to zeros without dividing by zero', () => {
    const s = summarize(newAccumulator());
    assert.equal(s.total_tokens, 0);
    assert.equal(s.composition.tool_results_pct, 0);
    assert.equal(s.context_per_turn.subagent.p50, 0);
    assert.equal(s.targets.read_share_pct, 0);
  });

  test('the accounting note ships with every report', () => {
    assert.match(summarize(newAccumulator()).note, /base64/i);
  });
});

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bm = require('./benchmark.cjs');

function mkSessionFixture({ root, dirHash, sessionId, lines }) {
  const dir = path.join(root, dirHash);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(filePath, lines.map(o => JSON.stringify(o)).join('\n') + '\n');
  return filePath;
}

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'df-bench-session-'));
}

describe('extractObjectiveId', () => {
  test('matches "objective N-slug" pattern', () => {
    assert.strictEqual(
      bm.extractObjectiveId('Execute plan for objective 19-pty-handoff-watcher.', ''),
      '19-pty-handoff-watcher'
    );
  });

  test('matches "N-slug wave M" pattern', () => {
    assert.strictEqual(
      bm.extractObjectiveId('Working on 22-workflow-impediment-fixes wave 2', ''),
      '22-workflow-impediment-fixes'
    );
  });

  test('matches "v1.2 obj N" pattern', () => {
    assert.strictEqual(
      bm.extractObjectiveId('Plan v1.2 obj 10 PTY watcher', ''),
      'v1.2-obj-10'
    );
  });

  test('matches "TRD N-NN" pattern', () => {
    assert.strictEqual(
      bm.extractObjectiveId('Execute TRD 19-01 (RED phase)', ''),
      'obj-19'
    );
  });

  test('matches "Phase X" pattern for v1.1 work', () => {
    assert.strictEqual(
      bm.extractObjectiveId('Phase E agent-spawn audit', ''),
      'v1.1-phase-E'
    );
  });

  test('falls back to untagged when no pattern matches', () => {
    assert.strictEqual(
      bm.extractObjectiveId('Just some random prompt', ''),
      'untagged'
    );
  });

  test('uses description when prompt is empty', () => {
    assert.strictEqual(
      bm.extractObjectiveId('', 'Execute TRD 22-03 hygiene-move'),
      'obj-22'
    );
  });

  test('matches bare "Objective N" form (workflow template substitution)', () => {
    assert.strictEqual(
      bm.extractObjectiveId('Plan Objective 18', ''),
      '18'
    );
  });

  test('bare-number form ignores trailing words via word boundary', () => {
    assert.strictEqual(
      bm.extractObjectiveId('Plan Objective 18 wave 2', ''),
      '18'
    );
  });

  test('bare-number form works in description field', () => {
    assert.strictEqual(
      bm.extractObjectiveId('', 'Plan Objective 18'),
      '18'
    );
  });

  test('slug form still wins over bare-number when both regexes could match', () => {
    // Regression guard: ordering matters. Slug form at line 72 must beat
    // bare-number fallback for prompts that have the fuller form.
    assert.strictEqual(
      bm.extractObjectiveId('objective 19-pty-handoff-watcher', ''),
      '19-pty-handoff-watcher'
    );
  });
});

describe('canonicalize', () => {
  test('collapses v1.2-obj-N to obj-N', () => {
    assert.strictEqual(bm.canonicalize('v1.2-obj-10'), 'obj-10');
  });

  test('preserves obj-N as-is', () => {
    assert.strictEqual(bm.canonicalize('obj-13'), 'obj-13');
  });

  test('maps planning-dir prefix via dirToObjMap', () => {
    assert.strictEqual(
      bm.canonicalize('19-pty-handoff-watcher', { '19': 'obj-10' }),
      'obj-10'
    );
  });

  test('returns unchanged when no rule matches', () => {
    assert.strictEqual(bm.canonicalize('untagged'), 'untagged');
  });

  test('maps bare-number id via dirToObjMap when present', () => {
    assert.strictEqual(
      bm.canonicalize('18', { '18': 'obj-18' }),
      'obj-18'
    );
  });

  test('passes bare-number id through when dirToObjMap has no entry', () => {
    // Better than dropping to 'untagged' — the bare number is still
    // informative for the rollup.
    assert.strictEqual(
      bm.canonicalize('18', {}),
      '18'
    );
  });
});

describe('dollars', () => {
  test('Opus pricing matches expected formula', () => {
    // 1M uncached input @ $15 = $15.00
    const r = bm.dollars({ uncached: 1_000_000, cache_create: 0, cache_read: 0, output: 0 }, 'opus');
    assert.ok(Math.abs(r - 15.0) < 0.001, `expected ~$15, got $${r}`);
  });

  test('cache reads cost 10% of base input (Opus)', () => {
    const r = bm.dollars({ uncached: 0, cache_create: 0, cache_read: 1_000_000, output: 0 }, 'opus');
    assert.ok(Math.abs(r - 1.5) < 0.001, `expected ~$1.50, got $${r}`);
  });

  test('output costs 5x base input (Opus)', () => {
    const r = bm.dollars({ uncached: 0, cache_create: 0, cache_read: 0, output: 1_000_000 }, 'opus');
    assert.ok(Math.abs(r - 75.0) < 0.001, `expected ~$75, got $${r}`);
  });

  test('mixed usage sums correctly', () => {
    // 100k uncached + 200k cache_read + 50k output
    const r = bm.dollars({ uncached: 100_000, cache_create: 0, cache_read: 200_000, output: 50_000 }, 'opus');
    const expected = (0.1 * 15) + (0.2 * 1.5) + (0.05 * 75);
    assert.ok(Math.abs(r - expected) < 0.001, `expected ~$${expected}, got $${r}`);
  });

  test('Sonnet pricing is 5x cheaper than Opus on input', () => {
    const opus = bm.dollars({ uncached: 1_000_000, cache_create: 0, cache_read: 0, output: 0 }, 'opus');
    const sonnet = bm.dollars({ uncached: 1_000_000, cache_create: 0, cache_read: 0, output: 0 }, 'sonnet');
    assert.strictEqual(opus / sonnet, 5);
  });

  test('unknown model defaults to opus', () => {
    const r = bm.dollars({ uncached: 1_000_000, cache_create: 0, cache_read: 0, output: 0 }, 'unknown');
    assert.ok(Math.abs(r - 15.0) < 0.001);
  });
});

describe('parseSince', () => {
  test('parses Nd as days ago', () => {
    const result = bm.parseSince('7d');
    const expected = Date.now() - 7 * 86400000;
    assert.ok(Math.abs(result.getTime() - expected) < 1000);
  });

  test('parses Nh as hours ago', () => {
    const result = bm.parseSince('24h');
    const expected = Date.now() - 24 * 3600000;
    assert.ok(Math.abs(result.getTime() - expected) < 1000);
  });

  test('returns null for invalid input', () => {
    assert.strictEqual(bm.parseSince('garbage'), null);
    assert.strictEqual(bm.parseSince(''), null);
    assert.strictEqual(bm.parseSince(null), null);
  });
});

describe('runBenchmarkSession', () => {
  test('returns ok:false when sessionId is missing', async (t) => {
    const root = tmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const r = await bm.runBenchmarkSession({ projectsRoot: root, sessionId: '', model: 'opus' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /--id/);
  });

  test('returns ok:false with searched list when sessionId not found', async (t) => {
    const root = tmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    // Create some unrelated dirHash dirs
    fs.mkdirSync(path.join(root, '-Users-a'), { recursive: true });
    fs.mkdirSync(path.join(root, '-Users-b'), { recursive: true });
    const r = await bm.runBenchmarkSession({ projectsRoot: root, sessionId: 'nonexistent', model: 'opus' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /not found/);
    assert.ok(Array.isArray(r.searched));
    assert.ok(r.searched.includes('-Users-a'));
    assert.ok(r.searched.includes('-Users-b'));
  });

  test('returns ok:false with matches list when sessionId is ambiguous', async (t) => {
    const root = tmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const lines = [
      { type: 'user', message: { content: 'hi' } },
      { type: 'assistant', message: { id: 'r1', usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 } } },
    ];
    mkSessionFixture({ root, dirHash: '-Users-x', sessionId: 'dup-session', lines });
    mkSessionFixture({ root, dirHash: '-Users-y', sessionId: 'dup-session', lines });
    const r = await bm.runBenchmarkSession({ projectsRoot: root, sessionId: 'dup-session', model: 'opus' });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /multiple/);
    assert.ok(Array.isArray(r.matches));
    assert.strictEqual(r.matches.length, 2);
    assert.ok(r.matches.includes('-Users-x'));
    assert.ok(r.matches.includes('-Users-y'));
  });

  test('returns ok:true with full breakdown for single-match valid fixture (opus)', async (t) => {
    const root = tmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    mkSessionFixture({
      root, dirHash: '-Users-x', sessionId: 'sess-1',
      lines: [
        { type: 'user', message: { content: 'hi' } },
        { type: 'assistant', message: { id: 'r1', usage: { input_tokens: 100, cache_creation_input_tokens: 200, cache_read_input_tokens: 50, output_tokens: 75 } } },
      ],
    });
    const r = await bm.runBenchmarkSession({ projectsRoot: root, sessionId: 'sess-1', model: 'opus' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.sessionId, 'sess-1');
    assert.strictEqual(r.apiCalls, 1);
    assert.strictEqual(r.tokens.uncached, 100);
    assert.strictEqual(r.tokens.cache_create, 200);
    assert.strictEqual(r.tokens.cache_read, 50);
    assert.strictEqual(r.tokens.output, 75);
    assert.strictEqual(r.model, 'opus');
    assert.ok(typeof r.path === 'string' && r.path.endsWith('sess-1.jsonl'));
    const expected = (100 * 15 + 200 * 18.75 + 50 * 1.5 + 75 * 75) / 1e6;
    assert.ok(Math.abs(r.cost - expected) < 0.0001, `expected ~$${expected}, got $${r.cost}`);
  });

  test('aggregates two distinct assistant turns correctly', async (t) => {
    const root = tmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    mkSessionFixture({
      root, dirHash: '-Users-x', sessionId: 'sess-multi',
      lines: [
        { type: 'user', message: { content: 'q1' } },
        { type: 'assistant', message: { id: 'r1', usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 50 } } },
        { type: 'assistant', message: { id: 'r2', usage: { input_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 75 } } },
      ],
    });
    const r = await bm.runBenchmarkSession({ projectsRoot: root, sessionId: 'sess-multi', model: 'opus' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.apiCalls, 2);
    assert.strictEqual(r.tokens.uncached, 300);
    assert.strictEqual(r.tokens.output, 125);
  });

  test('cost computation passes through dollars() with provided model', async (t) => {
    const root = tmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    mkSessionFixture({
      root, dirHash: '-Users-x', sessionId: 'sess-sonnet',
      lines: [
        { type: 'user', message: { content: 'hi' } },
        { type: 'assistant', message: { id: 'r1', usage: { input_tokens: 1_000_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } },
      ],
    });
    const r = await bm.runBenchmarkSession({ projectsRoot: root, sessionId: 'sess-sonnet', model: 'sonnet' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.model, 'sonnet');
    // 1M uncached @ sonnet $3/M = $3.00
    assert.ok(Math.abs(r.cost - 3.0) < 0.001, `expected ~$3.00 sonnet, got $${r.cost}`);
  });

  test('defaults model to opus when omitted', async (t) => {
    const root = tmpRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    mkSessionFixture({
      root, dirHash: '-Users-x', sessionId: 'sess-default',
      lines: [
        { type: 'user', message: { content: 'hi' } },
        { type: 'assistant', message: { id: 'r1', usage: { input_tokens: 1_000_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } },
      ],
    });
    const r = await bm.runBenchmarkSession({ projectsRoot: root, sessionId: 'sess-default' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.model, 'opus');
    // 1M uncached @ opus $15/M = $15.00
    assert.ok(Math.abs(r.cost - 15.0) < 0.001, `expected ~$15.00 opus default, got $${r.cost}`);
  });
});

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const bm = require('./benchmark.cjs');

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

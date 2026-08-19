'use strict';

/**
 * transcript-export.test.cjs — TRD 31-02
 *
 * The incremental-skip test is the one that matters. An export meant to run on
 * a schedule that re-indexes the whole corpus every time is worse than useless:
 * it looks like it is working while burning IO. The first implementation did
 * exactly that by comparing a character count against a byte count.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exportTranscripts, indexTranscript } = require('./transcript-export.cjs');

let dir, src, out;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-export-'));
  src = path.join(dir, 'projects', 'proj-a');
  fs.mkdirSync(src, { recursive: true });
  out = path.join(dir, 'index.jsonl');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function writeTranscript(name, rows) {
  const p = path.join(src, `${name}.jsonl`);
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return p;
}

const asst = (model, extra = {}) => ({
  type: 'assistant', timestamp: '2026-08-01T00:00:00Z',
  message: { model, content: [] }, ...extra,
});
const blockRow = text => ({
  type: 'user', timestamp: '2026-08-01T00:01:00Z',
  message: { content: [{ type: 'tool_result', is_error: true, content: text }] },
});

describe('indexTranscript()', () => {
  test('captures identity, span, turn counts, models and blocks', () => {
    const p = writeTranscript('sess-1', [
      { type: 'user', timestamp: '2026-08-01T00:00:00Z', cwd: '/repo', version: '2.4.0', message: { content: [] } },
      asst('claude-opus-5'),
      asst('claude-sonnet-5', { isSidechain: true }),
      blockRow('Command timed out after 2m 0s'),
    ]);
    const row = indexTranscript(p);
    assert.equal(row.session, 'sess-1');
    assert.equal(row.project, 'proj-a');
    assert.equal(row.cwd, '/repo');
    assert.equal(row.version, '2.4.0');
    assert.equal(row.turns.assistant, 2);
    assert.equal(row.turns.sidechain, 1);
    assert.deepEqual(Object.keys(row.models).sort(), ['claude-opus-5', 'claude-sonnet-5']);
    assert.equal(row.blocks['command-timeout'], 1);
    assert.equal(row.first_ts, '2026-08-01T00:00:00Z');
    assert.equal(row.last_ts, '2026-08-01T00:01:00Z');
  });

  test('bytes is the stat size, so it can be compared for growth', () => {
    const p = writeTranscript('sess-utf8', [{ type: 'user', message: { content: [] }, note: 'héllo — em dash' }]);
    const row = indexTranscript(p);
    assert.equal(row.bytes, fs.statSync(p).size,
      'must be stat size, not string length — mixing them breaks the incremental skip');
  });

  test('a corrupt line does not abort the whole transcript', () => {
    const p = path.join(src, 'sess-bad.jsonl');
    fs.writeFileSync(p, JSON.stringify(asst('claude-opus-5')) + '\n{{{ broken\n' + JSON.stringify(asst('claude-opus-5')) + '\n');
    const row = indexTranscript(p);
    assert.equal(row.turns.assistant, 2, 'both valid rows survive');
  });

  test('an unreadable file yields null rather than throwing', () => {
    assert.equal(indexTranscript(path.join(src, 'nope.jsonl')), null);
  });
});

describe('exportTranscripts() — incremental', () => {
  test('first run indexes, second run skips unchanged sessions', () => {
    writeTranscript('a', [asst('claude-opus-5')]);
    writeTranscript('b', [asst('claude-opus-5')]);

    const first = exportTranscripts({ roots: [src], out });
    assert.equal(first.indexed, 2);
    assert.equal(first.skipped, 0);

    const second = exportTranscripts({ roots: [src], out });
    assert.equal(second.indexed, 0, 'nothing changed — nothing to re-index');
    assert.equal(second.skipped, 2);
  });

  test('a session that has GROWN is re-indexed', () => {
    const p = writeTranscript('a', [asst('claude-opus-5')]);
    exportTranscripts({ roots: [src], out });
    fs.appendFileSync(p, JSON.stringify(asst('claude-opus-5')) + '\n');
    const again = exportTranscripts({ roots: [src], out });
    assert.equal(again.indexed, 1, 'growth must be picked up');
  });

  test('the index is dramatically smaller than the source', () => {
    writeTranscript('big', Array.from({ length: 500 }, () => asst('claude-opus-5')));
    exportTranscripts({ roots: [src], out });
    const srcBytes = fs.statSync(path.join(src, 'big.jsonl')).size;
    const idxBytes = fs.statSync(out).size;
    assert.ok(idxBytes * 10 < srcBytes,
      `index (${idxBytes}) should be far smaller than source (${srcBytes})`);
  });

  test('--full also copies raw transcripts', () => {
    writeTranscript('a', [asst('claude-opus-5')]);
    const fullDir = path.join(dir, 'full');
    const r = exportTranscripts({ roots: [src], out, fullDir });
    assert.equal(r.copied, 1);
    assert.deepEqual(fs.readdirSync(fullDir), ['proj-a__a.jsonl']);
  });

  test('an empty corpus is a clean no-op', () => {
    const r = exportTranscripts({ roots: [path.join(dir, 'nothing-here')], out });
    assert.equal(r.indexed, 0);
    assert.equal(r.sessions, 0);
  });

  test('a corrupt existing index does not prevent export', () => {
    fs.writeFileSync(out, '{{{ not json\n');
    writeTranscript('a', [asst('claude-opus-5')]);
    const r = exportTranscripts({ roots: [src], out });
    assert.equal(r.indexed, 1);
  });
});

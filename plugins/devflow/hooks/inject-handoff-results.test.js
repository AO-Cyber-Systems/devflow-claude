/**
 * Tests for inject-handoff-results UserPromptSubmit hook (DRAFT, v1.1).
 *
 * Covers:
 *   - listUnconsumed filters by consumed flag, tolerates malformed records,
 *     sorts chronologically
 *   - renderResults shape: header, exit-code rendering, output truncation
 *   - markConsumed writes consumed:true + consumed_at to disk
 *   - subprocess: pass-through cases (no .devflow-handoff/, no done/, all consumed)
 *   - subprocess: emits additionalContext when unconsumed records exist,
 *     marks them consumed so they don't re-inject next turn
 *   - DEVFLOW_SKIP_HANDOFF_INJECT=1 escape hatch
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'inject-handoff-results.js');
const {
  findHandoffDir,
  listUnconsumed,
  renderResults,
  markConsumed,
  truncate,
} = require('./inject-handoff-results.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-inject-'));
}

function rmTmp(d) {
  fs.rmSync(d, { recursive: true, force: true });
}

function writeRecord(tmp, id, fields) {
  const dir = path.join(tmp, '.devflow-handoff', 'done');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ id, ...fields }, null, 2) + '\n');
  return filePath;
}

// ---------------------------------------------------------------------------
// listUnconsumed
// ---------------------------------------------------------------------------

describe('listUnconsumed', () => {
  test('returns empty when done/ does not exist', () => {
    const tmp = mkTmp();
    try {
      assert.deepEqual(listUnconsumed(path.join(tmp, '.devflow-handoff', 'done')), []);
    } finally {
      rmTmp(tmp);
    }
  });

  test('returns only unconsumed records', () => {
    const tmp = mkTmp();
    writeRecord(tmp, 'h-001', { cmd: 'a', completed_at: '2026-04-29T10:00:00Z' });
    writeRecord(tmp, 'h-002', { cmd: 'b', completed_at: '2026-04-29T10:01:00Z', consumed: true });
    writeRecord(tmp, 'h-003', { cmd: 'c', completed_at: '2026-04-29T10:02:00Z' });
    try {
      const records = listUnconsumed(path.join(tmp, '.devflow-handoff', 'done'));
      assert.equal(records.length, 2);
      assert.equal(records[0].record.cmd, 'a');
      assert.equal(records[1].record.cmd, 'c');
    } finally {
      rmTmp(tmp);
    }
  });

  test('sorts chronologically by completed_at', () => {
    const tmp = mkTmp();
    writeRecord(tmp, 'h-newer', { cmd: 'newer', completed_at: '2026-04-29T11:00:00Z' });
    writeRecord(tmp, 'h-older', { cmd: 'older', completed_at: '2026-04-29T10:00:00Z' });
    try {
      const records = listUnconsumed(path.join(tmp, '.devflow-handoff', 'done'));
      assert.equal(records[0].record.cmd, 'older');
      assert.equal(records[1].record.cmd, 'newer');
    } finally {
      rmTmp(tmp);
    }
  });

  test('skips malformed records without throwing', () => {
    const tmp = mkTmp();
    const dir = path.join(tmp, '.devflow-handoff', 'done');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'h-bad.json'), 'not json {{{');
    writeRecord(tmp, 'h-good', { cmd: 'good', completed_at: '2026-04-29T10:00:00Z' });
    try {
      const records = listUnconsumed(dir);
      assert.equal(records.length, 1);
      assert.equal(records[0].record.cmd, 'good');
    } finally {
      rmTmp(tmp);
    }
  });

  test('ignores non-json files', () => {
    const tmp = mkTmp();
    const dir = path.join(tmp, '.devflow-handoff', 'done');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'README.md'), '# notes');
    writeRecord(tmp, 'h-good', { cmd: 'good', completed_at: '2026-04-29T10:00:00Z' });
    try {
      const records = listUnconsumed(dir);
      assert.equal(records.length, 1);
    } finally {
      rmTmp(tmp);
    }
  });
});

// ---------------------------------------------------------------------------
// renderResults + truncate
// ---------------------------------------------------------------------------

describe('truncate', () => {
  test('returns short input unchanged', () => {
    assert.equal(truncate('hello', 100), 'hello');
  });

  test('truncates with marker', () => {
    const out = truncate('a'.repeat(20), 10);
    assert.match(out, /^a{10}/);
    assert.match(out, /truncated, 10 more chars/);
  });

  test('handles non-string input', () => {
    assert.equal(truncate(undefined, 10), '');
    assert.equal(truncate(null, 10), '');
  });
});

describe('renderResults', () => {
  test('renders single record with success exit', () => {
    const records = [{
      record: {
        id: 'h-abc',
        cmd: 'gh auth login',
        exit_code: 0,
        completed_at: '2026-04-29T10:00:00Z',
        output: 'Logged in as alice.',
      },
    }];
    const out = renderResults(records);
    assert.match(out, /## Deferred command results/);
    assert.match(out, /1 command the watcher ran/);
    assert.match(out, /h-abc — `gh auth login` — ✓ exit 0/);
    assert.match(out, /Logged in as alice/);
  });

  test('renders failure exit', () => {
    const records = [{
      record: {
        id: 'h-fail',
        cmd: 'doctl auth init',
        exit_code: 2,
        output: 'Authentication failed',
      },
    }];
    const out = renderResults(records);
    assert.match(out, /✗ exit 2/);
    assert.match(out, /Authentication failed/);
  });

  test('plural noun for multiple records', () => {
    const records = [
      { record: { id: 'h-1', cmd: 'a', exit_code: 0 } },
      { record: { id: 'h-2', cmd: 'b', exit_code: 0 } },
    ];
    const out = renderResults(records);
    assert.match(out, /2 commands the watcher ran/);
  });

  test('handles records with no output', () => {
    const records = [{
      record: { id: 'h-empty', cmd: 'true', exit_code: 0 },
    }];
    const out = renderResults(records);
    assert.match(out, /no output captured/);
  });
});

// ---------------------------------------------------------------------------
// markConsumed
// ---------------------------------------------------------------------------

describe('markConsumed', () => {
  test('writes consumed:true and consumed_at to disk', () => {
    const tmp = mkTmp();
    const filePath = writeRecord(tmp, 'h-001', {
      cmd: 'foo',
      completed_at: '2026-04-29T10:00:00Z',
      output: 'ok',
    });
    try {
      const records = listUnconsumed(path.join(tmp, '.devflow-handoff', 'done'));
      markConsumed(records);
      const after = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.equal(after.consumed, true);
      assert.match(after.consumed_at, /^\d{4}-\d{2}-\d{2}T/);
    } finally {
      rmTmp(tmp);
    }
  });
});

// ---------------------------------------------------------------------------
// Subprocess integration
// ---------------------------------------------------------------------------

function runHook(cwd, env = {}) {
  return spawnSync('node', [HOOK_PATH], {
    cwd,
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, ...env },
  });
}

describe('hook subprocess', () => {
  test('emits nothing when no .devflow-handoff/ in tree', () => {
    const tmp = mkTmp();
    try {
      const r = runHook(tmp);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
    } finally {
      rmTmp(tmp);
    }
  });

  test('emits nothing when done/ has only consumed records', () => {
    const tmp = mkTmp();
    writeRecord(tmp, 'h-c', { cmd: 'foo', exit_code: 0, consumed: true });
    try {
      const r = runHook(tmp);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
    } finally {
      rmTmp(tmp);
    }
  });

  test('emits additionalContext for unconsumed records and marks them consumed', () => {
    const tmp = mkTmp();
    const filePath = writeRecord(tmp, 'h-001', {
      cmd: 'gh auth login',
      exit_code: 0,
      output: 'Logged in as alice.',
      completed_at: '2026-04-29T10:00:00Z',
    });
    try {
      const r = runHook(tmp);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
      assert.match(out.hookSpecificOutput.additionalContext, /gh auth login/);
      assert.match(out.hookSpecificOutput.additionalContext, /Logged in as alice/);

      // Verify mark-consumed happened
      const after = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.equal(after.consumed, true);

      // Second invocation: should no longer emit
      const r2 = runHook(tmp);
      assert.equal(r2.stdout, '', 'consumed record should not re-inject');
    } finally {
      rmTmp(tmp);
    }
  });

  test('DEVFLOW_SKIP_HANDOFF_INJECT=1 bypasses everything', () => {
    const tmp = mkTmp();
    writeRecord(tmp, 'h-001', { cmd: 'foo', exit_code: 0 });
    try {
      const r = runHook(tmp, { DEVFLOW_SKIP_HANDOFF_INJECT: '1' });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
    } finally {
      rmTmp(tmp);
    }
  });
});

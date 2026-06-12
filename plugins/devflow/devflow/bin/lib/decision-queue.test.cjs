'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

const {
  nextDecisionId,
  addDecision,
  listDecisions,
  resolveDecision,
  computeBlockedSet,
  renderDecisionMarkdown,
  _setRunFs,
  _resetMocks,
} = require('./decision-queue.cjs');

const { buildDecisionFile, buildObjectiveDirWithTrds } = require('./__fixtures__/autonomous-fixtures.cjs');

function mktmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dq-test-'));
}

// ─── ID generation (nextDecisionId) ───────────────────────────────────────────

describe('decision-queue', () => {

  describe('nextDecisionId', () => {
    test('1. empty/missing decisions dir → DECISION-001', () => {
      const tmp = mktmp();
      const id = nextDecisionId(tmp);
      assert.equal(id, 'DECISION-001');
    });

    test('2. pending has 001, resolved has 002 → DECISION-003 (scans both dirs)', () => {
      const tmp = mktmp();
      const pendingDir = path.join(tmp, '.planning', 'decisions', 'pending');
      const resolvedDir = path.join(tmp, '.planning', 'decisions', 'resolved');
      buildDecisionFile(pendingDir, { id: 'DECISION-001', status: 'pending' });
      buildDecisionFile(resolvedDir, { id: 'DECISION-002', status: 'resolved' });
      const id = nextDecisionId(tmp);
      assert.equal(id, 'DECISION-003');
    });

    test('3. non-decision files in dir ignored', () => {
      const tmp = mktmp();
      const pendingDir = path.join(tmp, '.planning', 'decisions', 'pending');
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, 'README.md'), 'not a decision', 'utf-8');
      fs.writeFileSync(path.join(pendingDir, 'notes.txt'), 'also not', 'utf-8');
      const id = nextDecisionId(tmp);
      assert.equal(id, 'DECISION-001');
    });
  });

  // ─── addDecision ──────────────────────────────────────────────────────────────

  describe('addDecision', () => {
    test('4. writes DECISION-NNN.md with all frontmatter fields + body sections', async () => {
      const tmp = mktmp();
      const result = await addDecision(tmp, {
        objective: '10',
        trd: '10-03',
        wave: 2,
        title: 'Pick storage backend',
        context: 'We need to choose a persistence layer',
        options: [
          { name: 'option-a', label: 'SQLite', pros: 'zero infra', cons: 'single-writer' },
          { name: 'option-b', label: 'Postgres', pros: 'concurrent writes', cons: 'needs server' },
        ],
        recommendation: 'option-a',
        blocks: ['10-04'],
        independent: ['10-05'],
      });

      assert.ok(result.id, 'should return id');
      assert.ok(result.path, 'should return path');
      assert.ok(fs.existsSync(result.path), 'file should exist');

      const content = fs.readFileSync(result.path, 'utf-8');
      assert.ok(content.includes('id: DECISION-001'), 'has id');
      assert.ok(content.includes('objective: 10'), 'has objective');
      assert.ok(content.includes('trd: 10-03'), 'has trd');
      assert.ok(content.includes('wave: 2'), 'has wave');
      assert.ok(content.includes('status: pending'), 'has status');
      assert.ok(content.includes('recommendation: option-a'), 'has recommendation');
      assert.ok(content.includes('## Decision:'), 'has Decision section');
      assert.ok(content.includes('**Context:**'), 'has Context field');
      assert.ok(content.includes('**Options:**'), 'has Options field');
      assert.ok(content.includes('## To Resolve'), 'has To Resolve section');
      assert.ok(content.includes('/devflow:decide DECISION-001'), 'has decide command');
    });

    test('5. creates pending/ and resolved/ dirs if missing', async () => {
      const tmp = mktmp();
      await addDecision(tmp, {
        objective: '10',
        trd: '10-03',
        wave: 2,
        title: 'T',
        context: 'c',
        options: [{ name: 'a', label: 'A', pros: 'p', cons: 'c' }],
        recommendation: 'a',
        blocks: [],
        independent: [],
      });

      const pendingDir = path.join(tmp, '.planning', 'decisions', 'pending');
      const resolvedDir = path.join(tmp, '.planning', 'decisions', 'resolved');
      assert.ok(fs.existsSync(pendingDir), 'pending dir created');
      assert.ok(fs.existsSync(resolvedDir), 'resolved dir created');
    });

    test('6. returns { id, path }', async () => {
      const tmp = mktmp();
      const result = await addDecision(tmp, {
        objective: '10',
        trd: '10-03',
        wave: 2,
        title: 'T',
        context: 'c',
        options: [{ name: 'a', label: 'A', pros: 'p', cons: 'c' }],
        recommendation: 'a',
        blocks: [],
        independent: [],
      });
      assert.ok(typeof result === 'object', 'returns object');
      assert.ok(typeof result.id === 'string', 'id is string');
      assert.ok(typeof result.path === 'string', 'path is string');
      assert.match(result.id, /^DECISION-\d{3}$/, 'id matches pattern');
    });

    test('7. fires notify — assert via notifier _setRunExec mock', async () => {
      const { _setRunExec, _resetMocks: resetNotifier } = require('./notifier.cjs');
      let notifyCalled = false;
      let notifyArgs = null;
      // Ensure NOTIFIER_DISABLE doesn't suppress our mock
      const savedDisable = process.env.NOTIFIER_DISABLE;
      delete process.env.NOTIFIER_DISABLE;
      _setRunExec(async (cmd, args) => {
        notifyCalled = true;
        notifyArgs = { cmd, args };
        return { stdout: '', stderr: '' };
      });
      try {
        const tmp = mktmp();
        await addDecision(tmp, {
          objective: '10',
          trd: '10-03',
          wave: 2,
          title: 'Notify test',
          context: 'c',
          options: [{ name: 'a', label: 'A', pros: 'p', cons: 'c' }],
          recommendation: 'a',
          blocks: [],
          independent: [],
        });
        // Give fire-and-forget a tick to run
        await new Promise(r => setTimeout(r, 50));
        assert.ok(notifyCalled, 'notifier was called');
      } finally {
        resetNotifier();
        if (savedDisable !== undefined) process.env.NOTIFIER_DISABLE = savedDisable;
      }
    });

    test('8. notification failure does not fail addDecision', async () => {
      const { _setRunExec, _resetMocks: resetNotifier } = require('./notifier.cjs');
      _setRunExec(async () => { throw new Error('notification system down'); });
      try {
        const tmp = mktmp();
        // Should not throw
        const result = await addDecision(tmp, {
          objective: '10',
          trd: '10-03',
          wave: 2,
          title: 'Fail-safe test',
          context: 'c',
          options: [{ name: 'a', label: 'A', pros: 'p', cons: 'c' }],
          recommendation: 'a',
          blocks: [],
          independent: [],
        });
        assert.ok(result.id, 'still returns id even when notify fails');
      } finally {
        resetNotifier();
      }
    });
  });

  // ─── listDecisions ────────────────────────────────────────────────────────────

  describe('listDecisions', () => {
    test('9. returns pending decisions with parsed frontmatter, sorted by id', () => {
      const tmp = mktmp();
      const pendingDir = path.join(tmp, '.planning', 'decisions', 'pending');
      buildDecisionFile(pendingDir, { id: 'DECISION-002', status: 'pending', title: 'B' });
      buildDecisionFile(pendingDir, { id: 'DECISION-001', status: 'pending', title: 'A' });

      const results = listDecisions(tmp, {});
      assert.equal(results.length, 2);
      assert.equal(results[0].id, 'DECISION-001');
      assert.equal(results[1].id, 'DECISION-002');
    });

    test('10. {status:"resolved"} filter returns resolved set', () => {
      const tmp = mktmp();
      const pendingDir = path.join(tmp, '.planning', 'decisions', 'pending');
      const resolvedDir = path.join(tmp, '.planning', 'decisions', 'resolved');
      buildDecisionFile(pendingDir, { id: 'DECISION-001', status: 'pending' });
      buildDecisionFile(resolvedDir, { id: 'DECISION-002', status: 'resolved' });

      const pending = listDecisions(tmp, {});
      const resolved = listDecisions(tmp, { status: 'resolved' });
      assert.equal(pending.length, 1);
      assert.equal(pending[0].id, 'DECISION-001');
      assert.equal(resolved.length, 1);
      assert.equal(resolved[0].id, 'DECISION-002');
    });

    test('11. missing dir → [] silently (graceful-empty)', () => {
      const tmp = mktmp();
      const results = listDecisions(tmp, {});
      assert.deepEqual(results, []);
    });

    test('12. malformed frontmatter file → stderr warning + skipped, siblings returned', () => {
      const tmp = mktmp();
      const pendingDir = path.join(tmp, '.planning', 'decisions', 'pending');
      fs.mkdirSync(pendingDir, { recursive: true });
      // Write a malformed file (no frontmatter)
      fs.writeFileSync(path.join(pendingDir, 'DECISION-001.md'), 'no frontmatter here', 'utf-8');
      // Write a valid sibling
      buildDecisionFile(pendingDir, { id: 'DECISION-002', status: 'pending' });

      const stderrChunks = [];
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = (chunk, ...args) => {
        stderrChunks.push(String(chunk));
        return originalStderr(chunk, ...args);
      };
      try {
        const results = listDecisions(tmp, {});
        assert.equal(results.length, 1, 'only valid sibling returned');
        assert.equal(results[0].id, 'DECISION-002');
        assert.ok(stderrChunks.some(c => c.includes('DECISION-001')), 'warning mentions bad file');
      } finally {
        process.stderr.write = originalStderr;
      }
    });
  });

  // ─── resolveDecision ─────────────────────────────────────────────────────────

  describe('resolveDecision', () => {
    test('13. moves file pending/ → resolved/, sets status/resolution/resolved_at', () => {
      const tmp = mktmp();
      const pendingDir = path.join(tmp, '.planning', 'decisions', 'pending');
      const resolvedDir = path.join(tmp, '.planning', 'decisions', 'resolved');
      buildDecisionFile(pendingDir, { id: 'DECISION-001', status: 'pending' });
      fs.mkdirSync(resolvedDir, { recursive: true });

      resolveDecision(tmp, 'DECISION-001', 'option-b');

      const pendingPath = path.join(pendingDir, 'DECISION-001.md');
      const resolvedPath = path.join(resolvedDir, 'DECISION-001.md');
      assert.ok(!fs.existsSync(pendingPath), 'removed from pending');
      assert.ok(fs.existsSync(resolvedPath), 'moved to resolved');

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      assert.ok(content.includes('status: resolved'), 'status updated');
      assert.ok(content.includes('resolution: option-b'), 'resolution recorded');
      assert.ok(content.includes('resolved_at:'), 'resolved_at set');
    });

    test('14. unknown id → throws with message listing pending ids', () => {
      const tmp = mktmp();
      const pendingDir = path.join(tmp, '.planning', 'decisions', 'pending');
      buildDecisionFile(pendingDir, { id: 'DECISION-001', status: 'pending' });
      fs.mkdirSync(path.join(tmp, '.planning', 'decisions', 'resolved'), { recursive: true });

      assert.throws(
        () => resolveDecision(tmp, 'DECISION-999', 'option-a'),
        (err) => {
          assert.ok(err.message.includes('DECISION-999'), 'mentions unknown id');
          assert.ok(err.message.includes('DECISION-001'), 'lists pending ids');
          return true;
        }
      );
    });

    test('15. choice not in options → resolves anyway with warning', () => {
      const tmp = mktmp();
      const pendingDir = path.join(tmp, '.planning', 'decisions', 'pending');
      const resolvedDir = path.join(tmp, '.planning', 'decisions', 'resolved');
      buildDecisionFile(pendingDir, { id: 'DECISION-001', status: 'pending', options: ['option-a', 'option-b'] });
      fs.mkdirSync(resolvedDir, { recursive: true });

      // Should not throw
      resolveDecision(tmp, 'DECISION-001', 'custom-freeform-answer');

      const resolvedPath = path.join(resolvedDir, 'DECISION-001.md');
      assert.ok(fs.existsSync(resolvedPath), 'file moved');
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      assert.ok(content.includes('resolution: custom-freeform-answer'), 'custom answer recorded');
    });
  });

  // ─── computeBlockedSet ────────────────────────────────────────────────────────

  describe('computeBlockedSet', () => {
    test('16. one TRD has decision_gate → that TRD in blocked; others in independent', () => {
      const tmp = mktmp();
      const objDir = buildObjectiveDirWithTrds(tmp, [
        { id: '10-01', depends_on: [] },
        { id: '10-02', depends_on: ['10-01'], decision_gate: 'DECISION-001' },
        { id: '10-03', depends_on: ['10-01'] },
      ]);

      const result = computeBlockedSet(objDir, 'DECISION-001');
      assert.ok(result.blocked.includes('10-02'), '10-02 is blocked');
      assert.ok(result.independent.includes('10-01'), '10-01 is independent');
      assert.ok(result.independent.includes('10-03'), '10-03 is independent');
      assert.ok(!result.blocked.includes('10-01'), '10-01 not in blocked');
      assert.ok(!result.blocked.includes('10-03'), '10-03 not in blocked');
    });

    test('17. no TRD carries the gate → blocked: [], all independent', () => {
      const tmp = mktmp();
      const objDir = buildObjectiveDirWithTrds(tmp, [
        { id: '10-01', depends_on: [] },
        { id: '10-02', depends_on: ['10-01'] },
      ]);

      const result = computeBlockedSet(objDir, 'DECISION-001');
      assert.deepEqual(result.blocked, []);
      assert.ok(result.independent.includes('10-01'));
      assert.ok(result.independent.includes('10-02'));
    });

    test('18. transitive: TRD whose depends_on includes a blocked TRD is also blocked', () => {
      const tmp = mktmp();
      const objDir = buildObjectiveDirWithTrds(tmp, [
        { id: '10-01', depends_on: [] },
        { id: '10-02', depends_on: ['10-01'], decision_gate: 'DECISION-001' },
        { id: '10-03', depends_on: ['10-02'] },  // depends on blocked TRD
        { id: '10-04', depends_on: ['10-01'] },  // independent
      ]);

      const result = computeBlockedSet(objDir, 'DECISION-001');
      assert.ok(result.blocked.includes('10-02'), '10-02 directly blocked');
      assert.ok(result.blocked.includes('10-03'), '10-03 transitively blocked');
      assert.ok(result.independent.includes('10-01'), '10-01 independent');
      assert.ok(result.independent.includes('10-04'), '10-04 independent');
    });
  });

  // ─── renderDecisionMarkdown (pure) ────────────────────────────────────────────

  describe('renderDecisionMarkdown', () => {
    test('renders complete decision markdown with all required sections', () => {
      const md = renderDecisionMarkdown({
        id: 'DECISION-001',
        objective: '10',
        trd: '10-03',
        wave: 2,
        title: 'Choose approach',
        context: 'We need to decide X',
        options: [
          { name: 'option-a', label: 'Approach A', pros: 'fast', cons: 'fragile' },
          { name: 'option-b', label: 'Approach B', pros: 'robust', cons: 'slow' },
        ],
        recommendation: 'option-a',
        blocks: ['10-04'],
        independent: ['10-05'],
        created: '2026-06-12T14:30:00Z',
      });

      assert.ok(md.startsWith('---\n'), 'starts with frontmatter');
      assert.ok(md.includes('id: DECISION-001'), 'has id');
      assert.ok(md.includes('## Decision:'), 'has Decision heading');
      assert.ok(md.includes('**Context:**'), 'has Context');
      assert.ok(md.includes('**Options:**'), 'has Options');
      assert.ok(md.includes('option-a'), 'has option-a');
      assert.ok(md.includes('option-b'), 'has option-b');
      assert.ok(md.includes('## To Resolve'), 'has To Resolve');
      assert.ok(md.includes('/devflow:decide DECISION-001'), 'has decide command');
    });
  });

  // ─── CLI subcommand: decision-queue (subprocess, TRD 02-06 pattern) ───────────

  describe('CLI subcommand: decision-queue', () => {
    function runCli(tmpDir, args) {
      const env = { ...process.env, NOTIFIER_DISABLE: '1' };
      return execSync(
        `node ${DF_TOOLS} decision-queue ${args}`,
        { cwd: tmpDir, encoding: 'utf-8', env }
      );
    }

    test('19. add subcommand → exit 0, JSON {id, path}, file exists', () => {
      const tmp = mktmp();
      const stdout = runCli(tmp, 'add --objective 10 --trd 10-03 --title "SmokeTest" --context "SomeContext" --options "option-a,option-b" --recommendation option-a');
      const result = JSON.parse(stdout);
      assert.ok(result.id, 'result has id');
      assert.ok(result.path, 'result has path');
      assert.ok(fs.existsSync(result.path), 'file exists at returned path');
    });

    test('20. list --raw → exit 0, JSON array', () => {
      const tmp = mktmp();
      runCli(tmp, 'add --objective 10 --trd 10-03 --title "T" --context "C" --options "a,b" --recommendation a');
      const stdout = runCli(tmp, 'list --raw');
      const result = JSON.parse(stdout);
      assert.ok(Array.isArray(result), 'result is array');
      assert.ok(result.length >= 1, 'has at least one item');
    });

    test('21. resolve DECISION-001 option-a → exit 0, file moved to resolved/', () => {
      const tmp = mktmp();
      runCli(tmp, 'add --objective 10 --trd 10-03 --title "T" --context "C" --options "a,b" --recommendation a');
      const stdout = runCli(tmp, 'resolve DECISION-001 option-a');
      const result = JSON.parse(stdout);
      assert.ok(result.ok || result.resolved, 'ok response');
      const resolvedPath = path.join(tmp, '.planning', 'decisions', 'resolved', 'DECISION-001.md');
      assert.ok(fs.existsSync(resolvedPath), 'file moved to resolved/');
    });

    test('22. unknown subcommand → exit 1 with usage', () => {
      const tmp = mktmp();
      assert.throws(() => {
        execSync(`node ${DF_TOOLS} decision-queue unknowncmd`, {
          cwd: tmp, encoding: 'utf-8',
          env: { ...process.env, NOTIFIER_DISABLE: '1' },
        });
      }, (err) => {
        assert.ok(err.status === 1, `exit status should be 1, got: ${err.status}`);
        const stderr = err.stderr || '';
        assert.ok(
          stderr.includes('unknowncmd') || stderr.includes('Usage') || stderr.includes('Unknown'),
          `stderr should mention unknown command, got: ${stderr}`
        );
        return true;
      });
    });
  });

});

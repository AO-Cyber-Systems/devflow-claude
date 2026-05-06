'use strict';

// sync-state.test.cjs — Test list (TRD 21-02)
//
// readSyncState (S group):
//   S1: file missing → returns { version: 1, objectives: {} }
//   S2: file present with v1 schema → returns parsed content
//   S3: file present with malformed JSON → returns empty default + warning to stderr
//   S4: file present with unknown version → returns empty default (defensive)
//
// writeSyncState (S group continued):
//   S5: writes { version: 1, objectives: {...} } via atomicWrite (tmp + rename)
//   S6: when .planning/ doesn't exist, creates it before write
//
// hashFrontmatter (H group):
//   H1: empty object → 'sha256:e3b0c...' (well-known empty-string sha256)
//   H2: deterministic — same input across 100 calls returns same hash
//   H3: key order independence — { a: 1, b: 2 } and { b: 2, a: 1 } produce identical hashes
//   H4: nested key order independence — { x: { a: 1, b: 2 } } and { x: { b: 2, a: 1 } } match
//   H5: array order PRESERVED — { reqs: [A, B] } and { reqs: [B, A] } produce DIFFERENT hashes
//   H6: strips _-prefix keys — { a: 1, _objectiveId: 'foo' } and { a: 1 } match
//
// recordSync (R group):
//   R1: upserts a new objective entry; returns updated state
//   R2: overwrites existing entry without modifying other entries
//   R3: persists to disk via writeSyncState
//   R4: deep-clones input — caller's state object is unchanged
//
// getLastSync (G group):
//   G1: missing entry → null
//   G2: present entry → returns full record
//
// Wiring (W group — Task 3):
//   W1: cmdGhPull --apply success path writes a recordSync entry to .gh-sync-state.json
//   W2: cmdGhSyncObjectives push success writes a recordSync entry per objective
//   W3: cmdGhPull no-drift path does NOT write a recordSync entry

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ss = require('./sync-state.cjs');
const fx = require('./__fixtures__/sync-state-fixtures.cjs');

describe('readSyncState (S1-S4)', () => {
  test('S1: file missing → returns { version: 1, objectives: {} }', () => {
    const project = fx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const r = ss.readSyncState(project.root);
      assert.deepStrictEqual(r, { version: 1, objectives: {} });
    } finally {
      project.cleanup();
    }
  });

  test('S2: file present with v1 schema → returns parsed content', () => {
    const record = fx.buildSyncStateRecord({ gh_updated_at: '2026-05-01T12:00:00Z' });
    const project = fx.buildTempProjectWithSyncState({
      syncState: { version: 1, objectives: { '21-foo': record } },
    });
    try {
      const r = ss.readSyncState(project.root);
      assert.strictEqual(r.version, 1);
      assert.strictEqual(r.objectives['21-foo'].gh_updated_at, '2026-05-01T12:00:00Z');
      assert.deepStrictEqual(r.objectives['21-foo'].label_set, ['devflow:objective']);
    } finally {
      project.cleanup();
    }
  });

  test('S3: file present with malformed JSON → returns empty default', () => {
    // Capture stderr to confirm warning emitted (don't assert on it; ensure non-throw)
    const origStderr = process.stderr.write.bind(process.stderr);
    let stderrCapture = '';
    process.stderr.write = (chunk) => { stderrCapture += chunk; return true; };

    const project = fx.buildTempProjectWithSyncState({ syncState: '{ this is not valid json' });
    try {
      const r = ss.readSyncState(project.root);
      assert.deepStrictEqual(r, { version: 1, objectives: {} });
      assert.match(stderrCapture, /malformed/i);
    } finally {
      process.stderr.write = origStderr;
      project.cleanup();
    }
  });

  test('S4: file present with unknown version → returns empty default', () => {
    const project = fx.buildTempProjectWithSyncState({
      syncState: { version: 99, objectives: { 'should-be-ignored': { foo: 'bar' } } },
    });
    try {
      const r = ss.readSyncState(project.root);
      assert.deepStrictEqual(r, { version: 1, objectives: {} });
    } finally {
      project.cleanup();
    }
  });
});

describe('writeSyncState (S5-S6)', () => {
  test('S5: writes { version: 1, objectives } via atomic write', () => {
    const project = fx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const record = fx.buildSyncStateRecord();
      ss.writeSyncState(project.root, { version: 1, objectives: { '21-foo': record } });
      const filePath = path.join(project.root, '.planning', '.gh-sync-state.json');
      assert.ok(fs.existsSync(filePath), 'sync state file written');
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.strictEqual(parsed.version, 1);
      assert.deepStrictEqual(parsed.objectives['21-foo'].label_set, ['devflow:objective']);
      // Confirm no leftover tmp file
      const planningDir = path.join(project.root, '.planning');
      const tmpFiles = fs.readdirSync(planningDir).filter((f) => f.includes('.tmp.'));
      assert.strictEqual(tmpFiles.length, 0, 'no tmp file leaked');
    } finally {
      project.cleanup();
    }
  });

  test('S6: when .planning/ does not exist, creates it before write', () => {
    const fs = require('fs');
    const os = require('os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-syncstate-no-planning-'));
    try {
      // Note: buildTempProjectWithSyncState pre-creates .planning/. Here we manually
      // skip that step to test the directory-creation fallback.
      assert.ok(!fs.existsSync(path.join(root, '.planning')), '.planning does NOT exist initially');
      ss.writeSyncState(root, { version: 1, objectives: {} });
      assert.ok(fs.existsSync(path.join(root, '.planning')), '.planning created');
      assert.ok(fs.existsSync(path.join(root, '.planning', '.gh-sync-state.json')), 'sync state written');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  });
});

describe('hashFrontmatter (H1-H6)', () => {
  test('H1: empty object → well-known empty-string sha256', () => {
    const h = ss.hashFrontmatter({});
    // sha256("{}") — JSON.stringify({}) === '{}'
    // We assert format only; exact hash documented in tests for clarity
    assert.match(h, /^sha256:[a-f0-9]{64}$/);
    // sha256 of '{}' = 44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a
    assert.strictEqual(h, 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
  });

  test('H2: deterministic — same input across 100 calls returns same hash', () => {
    const fm = { status: 'open', labels: ['a', 'b'], milestone: null, count: 3 };
    const first = ss.hashFrontmatter(fm);
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(ss.hashFrontmatter(fm), first);
    }
  });

  test('H3: key order independence — { a: 1, b: 2 } and { b: 2, a: 1 } produce identical hashes', () => {
    const h1 = ss.hashFrontmatter({ a: 1, b: 2 });
    const h2 = ss.hashFrontmatter({ b: 2, a: 1 });
    assert.strictEqual(h1, h2);
  });

  test('H4: nested key order independence — { x: { a: 1, b: 2 } } and { x: { b: 2, a: 1 } } match', () => {
    const h1 = ss.hashFrontmatter({ x: { a: 1, b: 2 }, y: 'static' });
    const h2 = ss.hashFrontmatter({ y: 'static', x: { b: 2, a: 1 } });
    assert.strictEqual(h1, h2);
  });

  test('H5: array order PRESERVED — different array order yields different hashes', () => {
    const h1 = ss.hashFrontmatter({ reqs: ['A', 'B'] });
    const h2 = ss.hashFrontmatter({ reqs: ['B', 'A'] });
    assert.notStrictEqual(h1, h2);
  });

  test('H6: strips _-prefix keys — { a: 1, _objectiveId: foo } and { a: 1 } match', () => {
    const h1 = ss.hashFrontmatter({ a: 1, _objectiveId: 'foo' });
    const h2 = ss.hashFrontmatter({ a: 1 });
    assert.strictEqual(h1, h2);
  });

  test('H7: throws on null input', () => {
    assert.throws(() => ss.hashFrontmatter(null), /must be an object/);
  });
});

describe('recordSync (R1-R4)', () => {
  test('R1: upserts a new objective entry; returns updated state', () => {
    const project = fx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const record = fx.buildSyncStateRecord();
      const updated = ss.recordSync(project.root, '21-foo', record);
      assert.strictEqual(updated.version, 1);
      assert.deepStrictEqual(updated.objectives['21-foo'].label_set, ['devflow:objective']);
    } finally {
      project.cleanup();
    }
  });

  test('R2: overwrites existing entry without modifying other entries', () => {
    const project = fx.buildTempProjectWithSyncState({
      syncState: {
        version: 1,
        objectives: {
          'keep': fx.buildSyncStateRecord({ status: 'done', gh_updated_at: '2026-01-01T00:00:00Z' }),
          'update': fx.buildSyncStateRecord({ status: 'open', gh_updated_at: '2026-02-01T00:00:00Z' }),
        },
      },
    });
    try {
      const newRecord = fx.buildSyncStateRecord({ status: 'done', gh_updated_at: '2026-03-01T00:00:00Z' });
      ss.recordSync(project.root, 'update', newRecord);
      const re = ss.readSyncState(project.root);
      assert.strictEqual(re.objectives['keep'].gh_updated_at, '2026-01-01T00:00:00Z');
      assert.strictEqual(re.objectives['update'].gh_updated_at, '2026-03-01T00:00:00Z');
      assert.strictEqual(re.objectives['update'].status, 'done');
    } finally {
      project.cleanup();
    }
  });

  test('R3: persists to disk via writeSyncState', () => {
    const project = fx.buildTempProjectWithSyncState({ syncState: null });
    try {
      ss.recordSync(project.root, '21-foo', fx.buildSyncStateRecord());
      const filePath = path.join(project.root, '.planning', '.gh-sync-state.json');
      assert.ok(fs.existsSync(filePath));
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.ok(parsed.objectives['21-foo']);
    } finally {
      project.cleanup();
    }
  });

  test('R4: deep-clones input — caller record is not mutated by recordSync', () => {
    const project = fx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const inputRecord = fx.buildSyncStateRecord({ label_set: ['a', 'b'] });
      ss.recordSync(project.root, '21-foo', inputRecord);
      // Mutate the input record after recordSync; the disk state must be unaffected
      inputRecord.label_set.push('mutated');
      const re = ss.readSyncState(project.root);
      assert.deepStrictEqual(re.objectives['21-foo'].label_set, ['a', 'b']);
    } finally {
      project.cleanup();
    }
  });
});

describe('getLastSync (G1-G2)', () => {
  test('G1: missing entry → null', () => {
    const project = fx.buildTempProjectWithSyncState({ syncState: null });
    try {
      const r = ss.getLastSync(project.root, '21-not-there');
      assert.strictEqual(r, null);
    } finally {
      project.cleanup();
    }
  });

  test('G2: present entry → returns full record', () => {
    const record = fx.buildSyncStateRecord({ status: 'done' });
    const project = fx.buildTempProjectWithSyncState({
      syncState: { version: 1, objectives: { '21-foo': record } },
    });
    try {
      const r = ss.getLastSync(project.root, '21-foo');
      assert.ok(r);
      assert.strictEqual(r.status, 'done');
      assert.deepStrictEqual(r.label_set, ['devflow:objective']);
    } finally {
      project.cleanup();
    }
  });
});

// ─── Integration with gh-pull / gh.cjs (W group) ──────────────────────────────

describe('integration: cmdGhPull --apply records sync state (W1, W3)', () => {
  const ghPull = require('./gh-pull.cjs');
  const ghPullFx = require('./__fixtures__/gh-pull-fixtures.cjs');

  function captureRun(fn) {
    const origStdout = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit;
    let stdout = '', stderr = '', exitCode = null;
    process.stdout.write = (chunk) => { stdout += chunk; return true; };
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
    try {
      try { fn(); } catch (e) { if (e.message !== '__exit__') throw e; }
    } finally {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      process.exit = origExit;
    }
    return { stdout, stderr, exitCode };
  }

  test('W1: cmdGhPull --apply success path writes a recordSync entry', () => {
    // Setup: disk has NOT changed since last sync (matching disk hash); only GH changed.
    // This is the "non-conflicting drift" case — TRD 21-03 conflict detector skips it.
    const fm = { status: 'in_progress', labels: ['devflow:objective'] };
    const project = ghPullFx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: fm,
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 11, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    try {
      // Read the actual disk frontmatter to compute the correct hash for last_synced_disk_hash
      const actualFm = require('./frontmatter.cjs').extractFrontmatter(
        require('fs').readFileSync(
          require('path').join(project.root, '.planning', 'objectives', project.objectiveId, 'OBJECTIVE.md'),
          'utf-8',
        ),
      );
      const diskHash = ss.hashFrontmatter(actualFm);

      // Pre-seed sync state: disk hash matches (no disk drift) so conflict detector
      // sees only GH-side change → falls through to drift→apply path.
      ss.recordSync(project.root, project.objectiveId, fx.buildSyncStateRecord({
        gh_updated_at: '2026-05-01T00:00:00Z',
        label_set: ['devflow:objective'],
        last_synced_disk_hash: diskHash,
      }));

      const cassette = ghPullFx.loadCassette('objective-closed-on-gh');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        }
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync', '--apply'], false));
      ghPull._setRunGh(null);

      // After apply, sync state should have been written with cassette's updatedAt
      const cassetteIssue = JSON.parse(cassette.response.stdout);
      const last = ss.getLastSync(project.root, '21-bidirectional-gh-sync');
      assert.ok(last, 'sync state recorded for objective');
      assert.strictEqual(last.gh_updated_at, cassetteIssue.updatedAt);
      assert.strictEqual(last.status, cassetteIssue.state === 'CLOSED' ? 'done' : 'open');
      assert.match(last.last_synced_disk_hash, /^sha256:[a-f0-9]{64}$/);
      // Hash should be updated post-apply (different from pre-seed because disk was overwritten)
      assert.notStrictEqual(last.last_synced_disk_hash, diskHash);
    } finally {
      project.cleanup();
    }
  });

  test('W3: cmdGhPull no-drift path does NOT write a recordSync entry', () => {
    const project = ghPullFx.buildTempProject({
      objectiveId: '21-bidirectional-gh-sync',
      frontmatter: { status: 'open', labels: ['devflow:objective'] },
      mapping: { milestone_id: 0, objectives: { '21-bidirectional-gh-sync': { issue_id: 10, state_comment_id: null } } },
      projectFm: { github_repo: 'AO-Cyber-Systems/devflow-claude' },
    });
    try {
      // Pre-seed sync state matching cassette's updatedAt — no drift expected
      const before = fx.buildSyncStateRecord({
        gh_updated_at: '2026-05-01T00:00:00Z', // matches cassette
        label_set: ['devflow:objective'],
        last_synced_disk_hash: 'sha256:before',
      });
      ss.recordSync(project.root, project.objectiveId, before);
      const filePath = path.join(project.root, '.planning', '.gh-sync-state.json');
      const beforeMtime = fs.statSync(filePath).mtimeMs;
      const beforeContent = fs.readFileSync(filePath, 'utf-8');

      const cassette = ghPullFx.loadCassette('objective-open-no-drift');
      ghPull._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return { ok: true, status: 0, stdout: "  - Token scopes: 'repo'", stderr: '' };
        }
        if (args[0] === 'issue' && args[1] === 'view') return cassette.response;
        return { ok: false, status: 1, stdout: '', stderr: 'unexpected' };
      });

      captureRun(() => ghPull.cmdGhPull(project.root, ['21-bidirectional-gh-sync'], false));
      ghPull._setRunGh(null);

      // Sync state file content should be byte-identical (no recordSync call)
      const afterContent = fs.readFileSync(filePath, 'utf-8');
      assert.strictEqual(afterContent, beforeContent, 'sync state untouched on no-drift');
      // Last record content unchanged
      const last = ss.getLastSync(project.root, project.objectiveId);
      assert.strictEqual(last.last_synced_disk_hash, 'sha256:before');
    } finally {
      project.cleanup();
    }
  });
});

describe('integration: cmdGhSyncObjectives (push) records sync state (W2)', () => {
  // gh.cjs uses module-level _runGh; we mock it via the existing _setRunGh seam.
  test('W2: cmdGhSyncObjectives push success writes recordSync entry per objective', () => {
    const gh = require('./gh.cjs');

    // Build temp project: PROJECT.md, ROADMAP.md, OBJECTIVE.md, .planning/config.json
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-syncstate-push-'));
    try {
      fs.mkdirSync(path.join(root, '.planning', 'objectives', '01-test-objective'), { recursive: true });
      fs.writeFileSync(path.join(root, '.planning', 'PROJECT.md'),
        '---\nname: TestProj\nversion: v1.0\n---\n\n# Project\n', 'utf-8');
      fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
        '# Roadmap\n\n## Objectives\n\n### Objective 1: Test Objective\n\n**Goal:** do a thing.\n', 'utf-8');
      fs.writeFileSync(path.join(root, '.planning', 'objectives', '01-test-objective', 'OBJECTIVE.md'),
        '---\nstatus: open\nkind: plugin\nwork: feature\n---\n\n# Test Objective\n', 'utf-8');
      fs.writeFileSync(path.join(root, '.planning', 'config.json'), JSON.stringify({
        github: { enabled: true, repo: 'TestOrg/TestRepo', labels: { objective: 'devflow:objective' }, milestone_prefix: 'v' },
      }), 'utf-8');

      // Mock runGh: auth ok with project scopes, milestone+label create succeed,
      // and issue create returns a synthetic URL with #42.
      gh._setRunGh((args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return { ok: true, status: 0, stdout: "Token scopes: 'project', 'repo'", stderr: '' };
        }
        if (args[0] === 'api' && args[1] && args[1].includes('milestones')) {
          // Successful milestone creation
          return { ok: true, status: 0, stdout: JSON.stringify({ number: 1, title: 'v1.0' }), stderr: '' };
        }
        if (args[0] === 'label' && args[1] === 'create') {
          return { ok: true, status: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'issue' && args[1] === 'create') {
          return { ok: true, status: 0, stdout: 'https://github.com/TestOrg/TestRepo/issues/42', stderr: '' };
        }
        return { ok: false, status: 1, stdout: '', stderr: `unexpected: ${args.join(' ')}` };
      });

      // Capture stdout AND process.exit (helpers.output calls process.exit which would
      // otherwise terminate the test runner before subsequent tests can register).
      const origStdout = process.stdout.write.bind(process.stdout);
      const origExit = process.exit;
      process.stdout.write = () => true;
      process.exit = (code) => { throw new Error(`__exit_${code}__`); };
      try {
        try { gh.cmdGhSyncObjectives(root, true); }
        catch (e) { if (!/^__exit_/.test(e.message)) throw e; }
      } finally {
        process.stdout.write = origStdout;
        process.exit = origExit;
        gh._setRunGh(null);
      }

      // Sync state should have an entry for objective '1' with issue 42
      const last = ss.getLastSync(root, '1');
      assert.ok(last, 'sync state recorded for objective 1');
      assert.strictEqual(last.issue_ref, 'TestOrg/TestRepo#42');
      assert.deepStrictEqual(last.label_set, ['devflow:objective']);
      assert.match(last.last_synced_disk_hash, /^sha256:[a-f0-9]{64}$/);
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
